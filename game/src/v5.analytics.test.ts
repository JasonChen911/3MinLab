import {describe, expect, it} from 'vitest';
import {analyticsCsv, buildAnalytics, type PeopleSample} from './analytics';
import {freshLayout, start, step, type PersonSave, type Layout} from './game';

function person(id: string, role: PersonSave['role'], x: number, z: number): PersonSave {
  return {
    id, role, state: 'walking', x, z, seatId: null,
    goal: {x, z}, goalLabel: '测试', path: [],
  };
}

function sample(t: number, people: PersonSave[]): PeopleSample {
  return {t, people};
}

describe('V5 数据分析', () => {
  it('热力图只统计场地内采样，并给真实热区排序', () => {
    const layout = freshLayout('community');
    const half = layout.size / 2;
    const frames = [
      sample(0, [
        person('a', 'audience', 0, 0), person('b', 'audience', 0, 0),
        person('c', 'staff', 0, 0), person('out', 'audience', half + 20, 0),
      ]),
      sample(1, [person('a', 'audience', 1, 1), person('c', 'staff', 1, 1)]),
    ];
    const report = buildAnalytics(layout, null, frames, 'all');
    expect(report.heat.total).toBe(5);
    expect(report.heat.max).toBe(5);
    expect(report.heat.cells.reduce((sum, value) => sum + value, 0)).toBe(5);
    expect(report.heat.hotspots[0].count).toBe(5);
    expect(Math.abs(report.heat.hotspots[0].x)).toBeLessThan(layout.size / 4);
    const visitors = buildAnalytics(layout, null, frames, 'visitors');
    expect(visitors.heat.total).toBe(3);
  });

  it('轨迹按人物 ID 串联真实采样，并按分组过滤短轨迹', () => {
    const layout = freshLayout('community');
    const frames = [
      sample(0, [person('v1', 'audience', -4, 0), person('s1', 'staff', 4, 4)]),
      sample(1, [person('v1', 'audience', -2, 0), person('s1', 'staff', 4.1, 4)]),
      sample(2, [person('v1', 'audience', 0, 0), person('s1', 'staff', 4.2, 4)]),
    ];
    const all = buildAnalytics(layout, null, frames, 'all');
    expect(all.trajectories.map(item => item.id)).toEqual(['v1']);
    expect(all.trajectories[0].points).toHaveLength(3);
    expect(all.trajectories[0].distance).toBeCloseTo(4, 5);
    expect(all.stats.peopleSamples).toBe(6);
    const staff = buildAnalytics(layout, null, frames, 'staff');
    expect(staff.trajectories).toHaveLength(0);
    expect(staff.stats.peopleSamples).toBe(3);
  });

  it('曲线与 CSV 直接来自回放快照', () => {
    let state = start(freshLayout('performance'));
    for (let minute = 0; minute < 12 && state.status !== 'finished'; minute++) state = step(state, 1);
    const report = buildAnalytics(freshLayout('performance'), state, [], 'all');
    const frames = state.replay?.frames ?? [];
    expect(report.curves.length).toBe(frames.length);
    expect(report.curves[0].t).toBe(frames[0].t);
    expect(report.curves.at(-1)!.satisfaction).toBe(frames.at(-1)!.satisfaction);
    expect(report.stats.frames).toBe(frames.length);
    expect(report.stats.peakQueue).toBeGreaterThanOrEqual(0);
    const csv = analyticsCsv(report);
    const rows = csv.split('\n');
    expect(rows[0]).toBe('minute,queue,occupancy,satisfaction,delay,spend,risk');
    expect(rows).toHaveLength(frames.length + 1);
  });

  it('没有数据时给出明确说明而不是伪造图表', () => {
    const layout: Layout = freshLayout('community');
    const report = buildAnalytics(layout, null, [], 'all');
    expect(report.curves).toHaveLength(0);
    expect(report.heat.total).toBe(0);
    expect(report.trajectories).toHaveLength(0);
    expect(report.insights[0]).toContain('尚无逐分钟快照');
    expect(analyticsCsv(report)).toBe('minute,queue,occupancy,satisfaction,delay,spend,risk');
  });
});
