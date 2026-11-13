import {describe, expect, it} from 'vitest';
import * as THREE from 'three';
import {freshLayout, start, step, type Layout} from './game';
import type {SimulationState} from './engine/model';
import {advanceDirector, directorMetrics, sceneCandidates} from './engine/director';
import {addTransaction, ledgerSummary, seedLedger} from './engine/ledger';
import {logReplay} from './engine/replay';
import {createOperations, phaseFor, stepOperations} from './engine/operations';
import {Random} from './engine/random';
import {trackGeometry, trackLaneLoop} from './world/track';
import {PeopleSystem} from './world/people';

function run(layout: Layout, minutes: number) {
  let state = start(layout);
  for (let minute = 0; minute < minutes && state.status !== 'finished'; minute++) state = step(state, 1);
  return state;
}

function triggerSceneEvent(layout: Layout, prepare: (state: SimulationState) => void, title: RegExp) {
  const state = start(layout);
  prepare(state);
  state.director!.nextReview = state.minute;
  for (let attempt = 0; attempt < 60; attempt++) {
    if (state.director!.events.some(event => title.test(event.title))) return state;
    state.minute += 1;
    state.director!.nextReview = state.minute;
    advanceDirector(state, new Random(7000 + attempt));
  }
  return state;
}

describe('V7 资金台账', () => {
  it('设施按单项入账，计划费用与实际支出分列且不会重复记账', () => {
    const layout = freshLayout('performance');
    const state = start(layout);
    expect(state.transactions.length).toBeGreaterThan(0);
    expect(new Set(state.transactions.map(transaction => transaction.id)).size).toBe(state.transactions.length);

    const build = state.transactions.filter(transaction => transaction.category === 'facility' && !transaction.estimated);
    expect(build.length).toBe(layout.items.length);
    expect(build.every(transaction => transaction.direction === 'expense' && transaction.amount > 0)).toBe(true);

    const planned = state.transactions.filter(transaction => transaction.estimated);
    expect(planned.length).toBeGreaterThan(0);
    expect(planned.every(transaction => transaction.direction === 'expense')).toBe(true);

    const actual = state.transactions
      .filter(transaction => transaction.direction === 'expense' && !transaction.estimated)
      .reduce((total, transaction) => total + transaction.amount, 0);
    const summary = ledgerSummary(state);
    expect(summary.actual).toBe(actual);
    expect(summary.estimated).toBeGreaterThanOrEqual(summary.build);

    const before = state.transactions.length;
    seedLedger(state);
    expect(state.transactions.length).toBe(before);
  });

  it('暂停、刷新后重复入账会被 dedupe 拦截，无限资金模式同样记录', () => {
    const state = start(freshLayout('community'));
    const before = state.transactions.length;
    const first = addTransaction(state, {
      at: 3, item: '临时采购 · 雨具', amount: 260, category: 'purchase', direction: 'expense', dedupe: 'test:purchase:1',
    });
    const again = addTransaction(state, {
      at: 3, item: '临时采购 · 雨具', amount: 260, category: 'purchase', direction: 'expense', dedupe: 'test:purchase:1',
    });
    expect(first).not.toBeNull();
    expect(again).toBeNull();
    expect(state.transactions.length).toBe(before + 1);
    expect(state.transactions.at(-1)?.id).toBe(`TX-${String(before + 1).padStart(4, '0')}`);
  });
});

describe('V7 设施运行', () => {
  it('摊位售卖按真实客流结算收入与原料成本，库存同步下降', () => {
    const base = freshLayout('community');
    const layout: Layout = {
      ...base,
      items: [...base.items.filter(item => item.kind !== 'tent' && item.kind !== 'tentSmall'), {id: 'stall-1', kind: 'tent', x: 8, z: 8, rotation: 0}],
    };
    const state = start(layout);
    state.served = 60;
    state.departed = 0;
    state.operations = createOperations(state);
    expect(state.operations.vendors).toBeGreaterThan(0);
    const stock = state.operations.vendorStock;
    const random = new Random(42);
    for (let minute = 0; minute < 8; minute++) stepOperations(state, random);
    expect(state.operations.vendorServed).toBeGreaterThan(0);
    expect(state.operations.vendorStock).toBeLessThan(stock);
    const income = state.transactions.filter(transaction => transaction.category === 'income');
    const food = state.transactions.filter(transaction => transaction.category === 'food' && transaction.note?.includes('原料'));
    expect(income.length).toBeGreaterThan(0);
    expect(food.length).toBeGreaterThan(0);
    expect(state.revenue).toBe(income.reduce((total, transaction) => total + transaction.amount, 0));
  });

  it('厕所容量由实际设施数量决定，缺少厕所会产生排队与真实事件', () => {
    const base = freshLayout('community');
    const withToilet: Layout = {...base, items: [...base.items, {id: 'wc-1', kind: 'toilet', x: -12, z: 12, rotation: 0}]};
    const equipped = start(withToilet);
    expect(equipped.operations ? equipped.operations.toiletCapacity : createOperations(equipped).toiletCapacity).toBeGreaterThan(0);

    const bare = start({...base, items: base.items.filter(item => item.kind !== 'toilet')});
    bare.served = 120;
    bare.departed = 0;
    const random = new Random(7);
    for (let minute = 0; minute < 12; minute++) stepOperations(bare, random);
    expect(bare.operations?.toilets).toBe(0);
    expect(bare.replay?.events.some(event => event.dedupe?.startsWith('facility:toilet-missing'))).toBe(true);
  });
});

describe('V7 场景事件库', () => {
  const sceneEvents = (state: SimulationState) => sceneCandidates(state, state.director!, directorMetrics(state));

  it('演唱会缺少扩声时会生成真实因果链事件并写入统一时间线', () => {
    const base = freshLayout('performance');
    const layout: Layout = {
      ...base,
      items: base.items.filter(item => !['speaker', 'screen'].includes(item.kind)),
      params: {...base.params, capacity: 200},
    };
    const state = triggerSceneEvent(layout, state => {
      state.served = 90;
      state.departed = 0;
      state.tasks[0].status = '已完成';
      state.tasks[0].actualEnd = 8;
      state.minute = 20;
    }, /扩声覆盖不足/);
    const event = state.director!.events.find(item => /扩声覆盖不足/.test(item.title));
    expect(event).toBeDefined();
    expect(event!.chain.length).toBeGreaterThan(1);
    expect(event!.reason).toContain('扩声');
    expect(state.replay!.events.some(entry => entry.directorId === event!.id)).toBe(true);
  });

  it('市集售罄与桌游桌位不足只在对应场景与设施条件下出现', () => {
    const market = start(freshLayout('community'));
    market.served = 50;
    market.departed = 0;
    market.minute = 20;
    market.operations = createOperations(market);
    market.operations.vendorStock = 0;
    const marketEvents = sceneEvents(market);
    expect(marketEvents.some(candidate => /备货接近售罄/.test(candidate.title))).toBe(true);
    expect(marketEvents.some(candidate => /桌位不足/.test(candidate.title))).toBe(false);

    const base = freshLayout('conference');
    const board = start({
      ...base,
      items: base.items.filter(item => !['bleachers', 'chair'].includes(item.kind)),
      params: {...base.params, capacity: 120},
    });
    board.served = 60;
    board.departed = 0;
    board.minute = 20;
    board.tasks[0].status = '已完成';
    board.tasks[0].actualEnd = 8;
    const boardEvents = sceneEvents(board);
    expect(boardEvents.some(candidate => /桌位不足/.test(candidate.title))).toBe(true);
    expect(boardEvents.every(candidate => candidate.kind === 'program')).toBe(true);
  });

  it('田径场景在湿滑跑道或延误时生成比赛影响事件', () => {
    const base = freshLayout('athletics');
    const state = start({...base, weather: 'heavyRain', weatherAuto: false});
    state.served = 80;
    state.departed = 0;
    state.minute = 24;
    state.tasks[0].status = '已完成';
    state.tasks[0].actualEnd = 12;
    state.tasks[1].status = '进行中';
    state.tasks[1].actualStart = 20;
    const event = sceneEvents(state).find(candidate => /跑道湿滑|赛程进度落后/.test(candidate.title));
    expect(event).toBeDefined();
    expect(event!.effects.length).toBeGreaterThan(0);
    expect(event!.chain.length).toBeGreaterThan(1);
  });

  it('活动阶段由任务状态与延误真实驱动', () => {
    const state = start({...freshLayout('performance'), activity: {...freshLayout('performance').activity, duration: 120}});
    expect(phaseFor(state)).toBe('prep');
    state.served = 12;
    expect(phaseFor(state)).toBe('entry');
    state.tasks[0].status = '进行中';
    expect(phaseFor(state)).toBe('main');
    state.tasks[0].status = '已完成';
    expect(phaseFor(state)).toBe('intermission');
    state.tasks.forEach(task => { task.status = '已完成'; });
    expect(phaseFor(state)).toBe('ending');
    state.status = 'finished';
    expect(phaseFor(state)).toBe('cleanup');

    const delayed = start({...freshLayout('performance'), activity: {...freshLayout('performance').activity, duration: 120}});
    delayed.minute = 112;
    delayed.tasks[0].status = '已完成';
    expect(phaseFor(delayed)).toBe('ending');
    delayed.delay = 20;
    expect(phaseFor(delayed)).not.toBe('ending');
  });
});

describe('V7 椭圆跑道', () => {
  it('两条直道与两个弯道构成封闭跑道，各道起点错开且不穿越内场', () => {
    const size = 80;
    const geo = trackGeometry(size);
    expect(geo.innerRadius).toBeLessThan(geo.outerRadius);
    expect(geo.innerRadius).toBeGreaterThan(0);
    expect(geo.lanes).toBe(8);

    const first = trackLaneLoop(size, 0);
    const eighth = trackLaneLoop(size, 7, 7 * Math.max(.7, size * .01));
    expect(first.length).toBeGreaterThan(80);
    expect(eighth[0].x).toBeGreaterThan(first[0].x);
    expect(eighth[0].z).toBeGreaterThan(first[0].z);

    for (const lane of [0, 3, 7]) {
      const loop = trackLaneLoop(size, lane);
      const radius = geo.innerRadius + (lane + .5) * geo.laneWidth;
      const farthest = Math.max(...loop.map(point => Math.abs(point.z)));
      expect(farthest).toBeCloseTo(radius, 5);
      for (const point of loop) {
        const outsideField = Math.abs(point.z) >= geo.innerRadius - .01;
        const beyondStraight = Math.abs(point.x) >= geo.straight - .01;
        expect(outsideField || beyondStraight).toBe(true);
      }
    }
  });

  it('运动员只在比赛任务进行时上道，并沿各自跑道跑动', () => {
    const layout = freshLayout('athletics');
    const state = step(start(layout), 10);
    const scene = new THREE.Scene();
    const system = new PeopleSystem(scene);
    system.setLayout(layout);
    system.setState(state);
    const performers = () => (system as unknown as {
      agents: {role: string; active: boolean; state: string; lane?: number; rig: {group: {position: {x: number; z: number}}}}[];
    }).agents.filter(agent => agent.active && agent.role === 'performer');

    for (let tick = 0; tick < 80; tick++) system.update(.5);
    expect(performers().some(agent => agent.state === 'performing')).toBe(false);

    state.tasks[1].status = '进行中';
    state.tasks[1].actualStart = state.minute;
    let racing = false;
    const geo = trackGeometry(layout.size);
    for (let tick = 0; tick < 400 && !racing; tick++) {
      system.update(.5);
      for (const agent of performers()) {
        if (agent.state !== 'performing' || agent.lane === undefined) continue;
        racing = true;
        const {x, z} = agent.rig.group.position;
        expect(Math.abs(z) >= geo.innerRadius - .8 || Math.abs(x) >= geo.straight - .8).toBe(true);
      }
    }
    expect(racing).toBe(true);
    expect(performers().filter(agent => agent.lane !== undefined).length).toBeGreaterThan(0);
    system.dispose();
  });
});

describe('V7 统一时间线', () => {
  it('重复 dedupe 不会刷屏，事件保留类型、色调与定位信息', () => {
    const state = start(freshLayout('performance'));
    const entry = {at: 2, kind: 'facility' as const, title: '厕所排队', detail: '8 人等待', location: 'toilet' as const, dedupe: 'test:timeline:1'};
    expect(logReplay(state, entry)).not.toBeNull();
    expect(logReplay(state, entry)).toBeNull();
    const stored = state.replay!.events.find(event => event.dedupe === 'test:timeline:1');
    expect(stored).toMatchObject({kind: 'facility', location: 'toilet', title: '厕所排队'});
    expect(state.replay!.events.filter(event => event.dedupe === 'test:timeline:1')).toHaveLength(1);
  });

  it('完整运行后时间线按时间排序，所有事件都有可展示的色调', () => {
    const state = run(freshLayout('performance'), 45);
    const events = state.replay!.events;
    expect(events.length).toBeGreaterThan(3);
    for (let index = 1; index < events.length; index++) expect(events[index].at).toBeGreaterThanOrEqual(events[index - 1].at);
    expect(events.every(event => event.title.length > 0 && event.detail.length > 0)).toBe(true);
    expect(events.some(event => event.tone === 'action' || event.kind === 'funding')).toBe(true);
  });
});