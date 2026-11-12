import {describe, expect, it} from 'vitest';
import {cost, freshLayout, intervene, start, step} from './game';
import {charge} from './engine/money';
import {advanceFacilities} from './engine/facilityRuntime';
import {Random} from './engine/random';
import {trackPoint} from './world/track';
import {makeVenueItems} from './venues';
import {updateBuildLedger} from './engine/buildMoney';
import {PeopleSystem} from './world/people';
import * as THREE from 'three';

describe('V7 资金与设施状态', () => {
  it('同一来源只计费一次，存档恢复后仍保持唯一', () => {
    const state = start(freshLayout('performance'));
    const transaction = {at: 4, title: '备用设备', amount: 200, category: 'action' as const, sourceId: 'spare-1'};
    expect(charge(state, transaction)?.id).toBe('action:spare-1');
    expect(charge(structuredClone(state), transaction)).toBeNull();
    expect(state.extraSpend).toBe(200);
  });

  it('建造、缩放和撤销均留下记录，净额等于当前场地配置', () => {
    const before = freshLayout('conference').items;
    const after = [...before, {id:'v7-chair',kind:'chair' as const,x:10,z:10,rotation:0,scale:1}];
    const added = updateBuildLedger(before, after);
    expect(added.reduce((sum, entry) => sum + entry.amount, 0)).toBe(cost(after));
    const scaled = after.map(item => item.id === 'v7-chair' ? {...item,scale:2} : item);
    const upgraded = updateBuildLedger(after, scaled, added);
    const refunded = updateBuildLedger(scaled, before, upgraded);
    expect(refunded.at(-1)?.category).toBe('refund');
    expect(refunded.reduce((sum, entry) => sum + entry.amount, 0)).toBe(cost(before));
    expect(new Set(refunded.map(entry => entry.id)).size).toBe(refunded.length);
  });

  it('预算挑战阻止超额应对，无限资金模式仍记录交易', () => {
    const state = start(freshLayout('conference'));
    state.parameters.budget = 0;
    expect(() => intervene(state, 'reserve', 'challenge')).toThrow('余额不足');
    const next = intervene(state, 'reserve', 'unlimited');
    expect(next.transactions).toHaveLength(1);
    expect(next.extraSpend).toBe(400);
    expect(next.replay?.events.some(event => event.id === next.transactions?.[0].eventId)).toBe(true);
  });

  it('卫生间服务能力改变队列，并写入拥堵与缓解事件', () => {
    const layout = freshLayout('community');
    const state = start(layout);
    state.served = 400;
    state.arrived = 400;
    state.snapshot.facility = {...state.snapshot.facility!, counts: {...state.snapshot.facility!.counts, sanitation: 0}};
    const random = new Random(123);
    for (let i = 1; i <= 15; i++) {state.minute = i; advanceFacilities(state, random);}
    expect(state.facilities!.toiletQueue).toBeGreaterThan(8);
    expect(state.replay?.events.some(event => event.title === '卫生间排队较长')).toBe(true);
    state.snapshot.facility.counts.sanitation = 20;
    for (let i = 16; i <= 25; i++) {state.minute = i; advanceFacilities(state, random);}
    expect(state.facilities!.toiletQueue).toBeLessThan(8);
    expect(state.replay?.events.some(event => event.title === '卫生间排队已缓解')).toBe(true);
  });

  it('场景流程事件会暂停对应任务，实际延误由引擎累积', () => {
    const state = start(freshLayout('performance'));
    const task = state.tasks[0];
    task.status = '进行中'; task.remaining = 10; task.actualStart = 0;
    state.director!.events.push({id: 500, kind: 'program', title: '演出转场准备延迟', status: 'active',
      at: 0, activeAt: 0, until: 5, severity: 2, risk: .7, reason: '人员不足', chain: [], effects: [], impact: {pauseTaskId: task.id}});
    const next = step(state, 2);
    expect(next.tasks[0].remaining).toBe(10);
    expect(next.delay).toBeGreaterThanOrEqual(state.delay);
    const relieved = intervene(next, 'reserve');
    expect(relieved.director?.events.find(event => event.id === 500)?.status).toBe('resolved');
    expect(step(relieved, 1).tasks[0].remaining).toBeLessThan(10);
  });
  it('可视人物按仿真队列前往卫生间和摊位', () => {
    const layout = freshLayout('community');
    layout.items.push({id:'queue-toilet',kind:'toilet',x:10,z:10,rotation:0});
    layout.items.push({id:'queue-vendor',kind:'tent',x:-10,z:10,rotation:0});
    const state = start(layout);
    state.arrived = 24; state.served = 24;
    state.facilities = {toiletQueue:20,vendorQueue:15,toiletServed:0,vendorServed:0,restingStaff:0,toiletCongested:true,vendorCongested:true};
    const system = new PeopleSystem(new THREE.Scene());
    system.setLayout(layout); system.setState(state); system.update(.1);
    const visible = system.snapshot();
    expect(visible.some(person => person.state === 'toToilet' || person.state === 'waitingToilet')).toBe(true);
    expect(visible.some(person => person.state === 'toVendor' || person.state === 'waitingVendor')).toBe(true);
  });
  it('空闲人员可轮休，休息工位降低疲劳且不占用关键岗位', () => {
    const base = start(freshLayout('conference'));
    base.availableStaff = 12; base.assignedStaff = 6;
    const noRest = structuredClone(base), withRest = structuredClone(base);
    noRest.snapshot.facility!.restBays = 0;
    withRest.snapshot.facility!.restBays = 6;
    for (let minute = 1; minute <= 100; minute++) {
      noRest.minute = minute; withRest.minute = minute;
      advanceFacilities(noRest, new Random(minute));
      advanceFacilities(withRest, new Random(minute));
    }
    expect(withRest.facilities?.restingStaff).toBe(6);
    expect(withRest.staffFatigue).toBeLessThan(noRest.staffFatigue!);
    expect(withRest.assignedStaff).toBe(6);
  });
});

describe('V7 田径跑道', () => {
  it('直道和两个半圆连续闭合，跑道间互不重叠', () => {
    const first = trackPoint(10, 7, 0);
    const last = trackPoint(10, 7, 1);
    expect(last.x).toBeCloseTo(first.x);
    expect(last.z).toBeCloseTo(first.z);
    for (let i = 0; i < 100; i++) {
      const outer = trackPoint(10, 7, i / 100);
      expect(Number.isFinite(outer.x + outer.z + outer.heading)).toBe(true);
    }
    expect(trackPoint(10, 7, .5).x).not.toBe(trackPoint(9, 7, .5).x);
  });
  it('体育场预设看台位于跑道外侧', () => {
    for (const size of [50, 80, 110]) {
      const items = makeVenueItems('stadium', size === 50 ? 'small' : size === 80 ? 'medium' : 'large');
      const stands = items.filter(item => item.kind === 'bleachers');
      expect(stands).toHaveLength(4);
      for (const stand of stands) {
        expect(Math.abs(stand.x)).toBeGreaterThan(size * .29);
        expect(Math.abs(stand.x) - 1.5 * (stand.scale ?? 1)).toBeGreaterThan(size * .29);
      }
      const stage = items.find(item => item.kind === 'stageSmall');
      expect(stage).toBeDefined();
      expect(Math.abs(stage!.x)).toBeGreaterThan(size * .29);
      expect(Math.abs(stage!.z)).toBeGreaterThan(size * .29);
    }
  });
});
