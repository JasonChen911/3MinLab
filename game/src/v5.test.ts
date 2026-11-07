import {describe, expect, it} from 'vitest';
import {CATALOG, freshLayout, intervene, start, step, type Layout} from './game';
import {analyzeFacilities} from './facilities';
import {directorActiveEvents, directorDepartureFactor, directorServiceFactor, directorWarnings} from './engine/director';

function overloaded(): Layout {
  const base = freshLayout('performance');
  const items = base.items.filter(item => ['entrance', 'stage', 'stageSmall', 'stageLarge'].includes(item.kind));
  items.push(
    {id: 'desk', kind: 'checkinSmall', x: 0, z: 14, rotation: 0},
    {id: 'tent', kind: 'tent', x: -10, z: 10, rotation: 0},
    {id: 'speaker', kind: 'speaker', x: 4, z: -6, rotation: 0},
    {id: 'light', kind: 'light', x: -4, z: -6, rotation: 0},
  );
  return {
    ...base,
    weather: 'gale', weatherAuto: false,
    activity: {...base.activity, people: 420, budget: 100000},
    params: {...base.params, capacity: 160, checkinStaff: 1, staff: 3, seed: 20261106},
    volunteers: 0, items,
  };
}

describe('V5 设施功能影响模型', () => {
  it('签到、座位、遮雨与舞台设备都从真实布置计算', () => {
    const layout = freshLayout('conference');
    const base = analyzeFacilities(layout, CATALOG);
    const expanded: Layout = {
      ...layout,
      items: [
        ...layout.items,
        {id: 'extra-desk', kind: 'checkinLarge', x: 0, z: 20, rotation: 0},
        {id: 'extra-bleachers', kind: 'bleachers', x: 12, z: 12, rotation: 0},
        {id: 'extra-tent', kind: 'tent', x: -12, z: 12, rotation: 0},
      ],
    };
    const more = analyzeFacilities(expanded, CATALOG);
    expect(more.checkinDesks).toBeGreaterThan(base.checkinDesks);
    expect(more.checkinThroughput).toBeGreaterThan(base.checkinThroughput);
    expect(more.seating).toBeGreaterThan(base.seating);
    expect(more.shelter).toBeGreaterThan(base.shelter);
    expect(more.scores.service).toBeGreaterThanOrEqual(base.scores.service);
  });

  it('满意度按百分制目标结算，长时间运行不会衰减到零', () => {
    let state = start(freshLayout('performance'));
    for (let minute = 0; minute < 120 && state.status !== 'finished'; minute++) state = step(state, 1);
    expect(state.satisfaction ?? 0).toBeGreaterThan(30);
    expect(state.satisfaction ?? 0).toBeLessThanOrEqual(100);
  });

  it('设备只有靠近舞台才计入扩声质量', () => {
    const layout = freshLayout('performance');
    const stage = layout.items.find(item => ['stage', 'stageSmall', 'stageLarge'].includes(item.kind))!;
    const near = analyzeFacilities({...layout, items: [...layout.items, {id: 'near-speaker', kind: 'speaker', x: stage.x + 4, z: stage.z, rotation: 0}]}, CATALOG);
    const far = analyzeFacilities({...layout, items: [...layout.items, {id: 'far-speaker', kind: 'speaker', x: stage.x + 60, z: stage.z, rotation: 0}]}, CATALOG);
    expect(near.audioQuality).toBeGreaterThan(far.audioQuality);
    expect(near.scores.atmosphere).toBeGreaterThan(far.scores.atmosphere);
  });

  it('天气与遮雨设施改变舒适度和天气风险，并进入模拟参数', () => {
    const base = freshLayout('performance');
    const sunny = analyzeFacilities({...base, weather: 'sunny'}, CATALOG);
    const gale = analyzeFacilities({...base, weather: 'gale'}, CATALOG);
    expect(gale.risks.weather).toBeGreaterThan(sunny.risks.weather);
    expect(gale.comfort).toBeLessThan(sunny.comfort);
    const bare: Layout = {...base, weather: 'gale', items: base.items.filter(item => item.kind !== 'tent' && item.kind !== 'tentSmall')};
    const riskBare = analyzeFacilities(bare, CATALOG).risks.weather;
    const sheltered: Layout = {...bare, items: [...bare.items, ...[0, 1, 2, 3, 4].map(i => ({id: `tent-${i}`, kind: 'tent' as const, x: -14 + i * 7, z: 12, rotation: 0, anchored: true}))]};
    expect(analyzeFacilities(sheltered, CATALOG).risks.weather).toBeLessThan(riskBare);
    const powered = start({...base, items: [...base.items.filter(item => item.kind !== 'checkin' && item.kind !== 'checkinSmall' && item.kind !== 'checkinLarge')]});
    const normal = start(base);
    expect(normal.parameters.serviceRate).toBeGreaterThan(powered.parameters.serviceRate);
    expect(normal.snapshot.facility?.checkinDesks).toBeGreaterThan(0);
  });
});

describe('V5 动态事件导演', () => {
  it('固定间隔监控真实指标，生成带原因与因果链的预警，并且可复现', () => {
    const layout = overloaded();
    const run = () => {
      let state = start(layout);
      for (let minute = 0; minute < 40 && !directorWarnings(state).length; minute++) state = step(state, 1);
      return state;
    };
    const first = run(), second = run();
    expect(first).toEqual(second);
    const warning = directorWarnings(first)[0];
    expect(warning).toBeDefined();
    expect(warning.reason.length).toBeGreaterThan(20);
    expect(warning.reason).toMatch(/排队|风险|遮雨|人员|设备|容量/);
    expect(warning.chain.length).toBeGreaterThan(1);
    expect(warning.activeAt).toBeGreaterThan(warning.at);
    expect(first.director?.metrics?.risk).toBeGreaterThan(0);
    expect(first.director?.metrics?.queue).toBe(first.queue);
  });

  it('预警窗口内采取对应措施会阻止事件，并计入真实支出与满意度', () => {
    let state = start(overloaded());
    for (let minute = 0; minute < 50 && !directorWarnings(state).length; minute++) state = step(state, 1);
    const warning = directorWarnings(state)[0];
    expect(warning.mitigation).toBeDefined();
    const beforeSpend = state.extraSpend, beforeSatisfaction = state.satisfaction ?? 70;
    const next = intervene(state, warning.mitigation!);
    const resolved = next.director?.events.find(event => event.id === warning.id);
    expect(resolved?.status).toBe('prevented');
    expect(resolved?.resolution).toContain('预警窗口');
    expect(next.extraSpend).toBeGreaterThan(beforeSpend);
    expect(next.satisfaction).toBeGreaterThanOrEqual(beforeSatisfaction);
  });

  it('进行中的事件会真实改变签到效率与离场速度', () => {
    const layout = overloaded();
    let state = start(layout);
    for (let minute = 0; minute < 60 && !directorActiveEvents(state).length; minute++) state = step(state, 1);
    expect(directorActiveEvents(state).length).toBeGreaterThan(0);
    expect(directorServiceFactor(state)).toBeLessThan(1);
    const severity = directorActiveEvents(state)[0].severity;
    expect([1, 2, 3]).toContain(severity);
    const low = {...state, satisfaction: 30} as typeof state;
    const high = {...state, satisfaction: 95} as typeof state;
    if (!directorActiveEvents(state).some(event => event.impact.departureFactor && event.impact.departureFactor > 1)) {
      expect(directorDepartureFactor(low)).toBeGreaterThan(directorDepartureFactor(high));
    }
  });
});
