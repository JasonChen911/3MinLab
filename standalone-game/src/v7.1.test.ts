import {describe, expect, it} from 'vitest';
import {freshLayout, reconcile, start, step, type Layout} from './game';
import {createOperations, stepOperations} from './engine/operations';
import {ledgerSummary} from './engine/ledger';
import {Random} from './engine/random';

function communityWithMedical(): Layout {
  const base = freshLayout('community');
  return base.items.some(item => item.kind === 'medical')
    ? base
    : {...base, items: [...base.items, {id: 'med-test', kind: 'medical', x: 10, z: 10, rotation: 0}]};
}

describe('V7.1 时间线降噪', () => {
  it('设施风险只在进入时记录一次，恢复后补一条解除事件', () => {
    const base = freshLayout('community');
    const layout: Layout = {...base, items: base.items.filter(item => item.kind !== 'toilet')};
    const state = start(layout);
    state.served = 120;
    state.departed = 0;
    state.operations = createOperations(state);
    const random = new Random(11);
    for (let minute = 1; minute <= 30; minute++) {
      state.minute = minute;
      stepOperations(state, random);
    }
    const queueEvents = state.replay!.events.filter(event => event.title === '厕所排队');
    expect(queueEvents.length).toBe(1);
    expect(queueEvents[0].status).toBe('进行中');
    expect(state.replay!.events.filter(event => event.title === '现场缺少厕所').length).toBe(1);

    state.operations!.toiletQueue = 6;
    state.operations!.toiletCapacity = 20;
    for (let minute = 31; minute <= 36; minute++) {
      state.minute = minute;
      stepOperations(state, random);
    }
    expect(queueEvents[0].status).toBe('已解除');
    expect(state.replay!.events.filter(event => event.title === '解除 · 厕所排队').length).toBe(1);
    expect(state.replay!.events.filter(event => event.title === '厕所排队').length).toBe(1);
  });

  it('医疗接诊按十分钟汇总，不再每分钟刷屏', () => {
    const state = start(communityWithMedical());
    state.served = 90;
    state.departed = 0;
    state.operations = createOperations(state);
    const random = new Random(42);
    for (let minute = 1; minute <= 40; minute++) {
      state.minute = minute;
      stepOperations(state, random);
    }
    const summaries = state.replay!.events.filter(event => event.dedupe?.startsWith('facility:medical-summary'));
    expect(summaries.length).toBeGreaterThan(0);
    expect(summaries.length).toBeLessThanOrEqual(5);
    expect(summaries.every(event => event.at === 1 || event.at % 10 === 0)).toBe(true);
    expect(state.replay!.events.filter(event => event.title === '医疗点接诊').length).toBe(0);
  });
});

describe('V7.1 暂停编辑同步', () => {
  it('新增设施恢复后立即生效，并按实际建设成本只扣一次费用', () => {
    const layout = freshLayout('community');
    const before = step(start(layout), 12);
    const beforeToilets = before.operations!.toilets;
    const beforeVendors = before.operations!.vendors;
    const beforeStock = before.operations!.vendorStock;
    const beforeSpend = ledgerSummary(before).actual;
    const enlarged: Layout = {
      ...layout,
      items: [
        ...layout.items,
        {id: 'wc-resume', kind: 'toilet', x: -14, z: 14, rotation: 0},
        {id: 'stall-resume', kind: 'tent', x: 14, z: 14, rotation: 0},
      ],
    };
    const after = reconcile(before, enlarged);
    expect(after.minute).toBe(before.minute);
    expect(after.operations!.toilets).toBe(beforeToilets + 1);
    expect(after.operations!.vendors).toBe(beforeVendors + 1);
    expect(after.operations!.vendorStock).toBe(beforeStock + 120);
    expect(after.transactions.find(transaction => transaction.dedupe === 'build:wc-resume')?.amount).toBe(500);
    expect(after.transactions.find(transaction => transaction.dedupe === 'build:stall-resume')?.amount).toBe(750);
    expect(ledgerSummary(after).actual).toBe(beforeSpend + 1250);

    const again = reconcile(after, enlarged);
    expect(again.transactions.filter(transaction => transaction.dedupe === 'build:wc-resume').length).toBe(1);
    expect(again.transactions.filter(transaction => transaction.dedupe === 'build:stall-resume').length).toBe(1);
    expect(ledgerSummary(again).actual).toBe(ledgerSummary(after).actual);
  });

  it('移除摊位时同步收缩容量与库存，但保留已售与排队记录', () => {
    const layout = freshLayout('community');
    const state = start(layout);
    state.served = 60;
    state.operations = createOperations(state);
    const random = new Random(8);
    for (let minute = 1; minute <= 12; minute++) {
      state.minute = minute;
      stepOperations(state, random);
    }
    const sold = state.operations.vendorServed;
    const stalls = layout.items.filter(item => item.kind === 'tent' || item.kind === 'tentSmall');
    if (!stalls.length) return;
    const reduced: Layout = {...layout, items: layout.items.filter(item => item.id !== stalls[0].id)};
    const after = reconcile(state, reduced);
    expect(after.operations!.vendors).toBe(state.operations!.vendors - 1);
    expect(after.operations!.vendorStock).toBeLessThanOrEqual(after.operations!.vendors * 120);
    expect(after.operations!.vendorServed).toBe(sold);
  });
});