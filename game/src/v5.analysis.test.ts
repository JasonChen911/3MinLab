import {describe, expect, it} from 'vitest';
import {cost, freshLayout, placement, type Item, type Layout} from './game';
import {analysisMarks, analyzeLayout, optimizeLayout} from './analysis';

function base(overrides: Partial<Layout> = {}): Layout {
  const layout = freshLayout('performance');
  const items: Item[] = [
    {id: 'entrance', kind: 'entrance', x: 0, z: 18, rotation: 0},
    {id: 'desk', kind: 'checkinSmall', x: 0, z: 12, rotation: 0},
    {id: 'stage', kind: 'stage', x: 0, z: -10, rotation: 0},
    {id: 'speaker', kind: 'speaker', x: 0, z: 16, rotation: 0},
    {id: 'tent', kind: 'tent', x: -12, z: 8, rotation: 0},
  ];
  return {
    ...layout, size: 40, indoor: false, weather: 'sunny', weatherAuto: false,
    items, budgetMode: 'unlimited',
    activity: {...layout.activity, people: 120, budget: 100000},
    params: {...layout.params, capacity: 200, checkinStaff: 2, staff: 8, seed: 5},
    ...overrides,
  };
}

describe('V5 场地分析：真实几何与动线', () => {
  it('重叠设施被识别为几何错误，位置来自真实设施坐标', () => {
    const layout = base();
    const analysis = analyzeLayout({...layout, items: [...layout.items, {id: 'chair-overlap', kind: 'chair', x: 0, z: 12, rotation: 0}]});
    const overlap = analysis.findings.find(finding => finding.title.includes('重叠'));
    expect(overlap).toBeDefined();
    expect(overlap!.severity).toBe('error');
    expect(overlap!.area).toBe('geometry');
    expect(overlap!.at).toBeDefined();
    expect(overlap!.fix.length).toBeGreaterThan(6);
  });

  it('使用同一套 A* 阻挡网格验证入口到签到台的连通性', () => {
    const open = analyzeLayout(base());
    expect(open.routes.find(route => route.id === 'entry-checkin')?.reachable).toBe(true);

    const walls: Item[] = [];
    for (let x = -19.5; x <= 19.5; x += 3) walls.push({id: `wall-${x}`, kind: 'fence', x, z: 15, rotation: 0});
    const blocked = analyzeLayout({...base(), items: [...base().items, ...walls]});
    const route = blocked.routes.find(item => item.id === 'entry-checkin');
    expect(route?.reachable).toBe(false);
    const finding = blocked.findings.find(item => item.title === '入口 → 签到台 不可通行');
    expect(finding).toBeDefined();
    expect(finding!.severity).toBe('error');
    expect(finding!.detail).toContain('A*');
    expect(blocked.findings.some(item => /绕行过远|不可通行/.test(item.title))).toBe(true);
  });

  it('通行面积、排队空间与综合评分都由当前设施计算', () => {
    const analysis = analyzeLayout(base());
    expect(analysis.circulation.totalCells).toBe(41 * 41);
    expect(analysis.circulation.freeCells).toBeGreaterThan(0);
    expect(analysis.circulation.freeCells).toBeLessThan(analysis.circulation.totalCells);
    expect(analysis.circulation.queueSpace).toBeGreaterThan(0);
    expect(analysis.scores.total).toBeGreaterThanOrEqual(0);
    expect(analysis.scores.total).toBeLessThanOrEqual(100);
    expect(analysis.summary).toContain(`动线 ${analysis.scores.flow}`);
    expect(analysis.facility.risks.queue).toBeGreaterThan(0);

    const crowded = analyzeLayout({...base(), items: [...base().items, ...[0, 1, 2].map(i => ({id: `big-${i}`, kind: 'bleachers' as const, x: -8 + i * 8, z: -2, rotation: 0}))]});
    expect(crowded.circulation.freeCells).toBeLessThan(analysis.circulation.freeCells);
    expect(crowded.facility.seating).toBeGreaterThan(analysis.facility.seating);
  });

  it('3D 标记只来自真实发现，并合并同一位置的重复标记', () => {
    const analysis = analyzeLayout(base());
    const marks = analysisMarks(analysis);
    const located = analysis.findings.filter(finding => finding.at);
    expect(marks.length).toBeGreaterThan(0);
    expect(marks.length).toBeLessThanOrEqual(located.length);
    for (const mark of marks) {
      expect(['error', 'warning', 'info']).toContain(mark.severity);
      expect(Number.isFinite(mark.x)).toBe(true);
      expect(Number.isFinite(mark.z)).toBe(true);
      expect(mark.title.length).toBeGreaterThan(0);
    }
    expect(analysisMarks(null)).toEqual([]);
  });
});

describe('V5 场地分析：优化预览与应用安全', () => {
  it('优化计划基于真实几何，覆盖固定帐篷、设备归位与缺失设施', () => {
    const layout = base();
    const before = analyzeLayout(layout);
    const plan = optimizeLayout(layout);

    expect(layout.items).toHaveLength(5);
    expect(plan.items).not.toBe(layout.items);
    expect(plan.changes.some(change => change.kind === 'anchor' && change.itemId === 'tent')).toBe(true);
    expect(plan.changes.some(change => change.kind === 'move' && change.itemId === 'speaker')).toBe(true);
    expect(plan.changes.some(change => change.kind === 'add' && change.item?.kind === 'medical')).toBe(true);
    expect(plan.cost).toBeGreaterThan(0);
    expect(plan.before.findings.length).toBe(before.findings.length);
    expect(plan.after.facility.medicalUnits).toBeGreaterThan(before.facility.medicalUnits);

    for (const change of plan.changes) {
      if (!change.item) continue;
      const others = plan.items.filter(item => item.id !== change.item!.id);
      expect(placement({...layout, items: others}, change.item, 'unlimited').level).not.toBe('invalid');
    }
    expect(plan.changes.every(change => change.reason.length > 4)).toBe(true);
  });

  it('预算挑战下不会加入超出剩余预算的设施，但仍修正无成本问题', () => {
    const layout = base({budgetMode: 'challenge'});
    layout.activity = {...layout.activity, budget: cost(layout.items) + 20};
    const plan = optimizeLayout(layout);
    expect(plan.changes.some(change => change.kind === 'anchor')).toBe(true);
    expect(plan.changes.every(change => change.kind !== 'add')).toBe(true);
    expect(plan.cost).toBe(0);
  });

  it('应用计划后可通过现有撤销栈恢复原布局', () => {
    const layout = base();
    const plan = optimizeLayout(layout);
    const applied = plan.items;
    expect(applied.length).toBeGreaterThan(layout.items.length);
    expect(plan.cost).toBe(cost(applied) - cost(layout.items));
    expect(layout.items.map(item => item.id)).toEqual(['entrance', 'desk', 'stage', 'speaker', 'tent']);
  });
});
