import type {SimulationState} from './engine/model';
import type {Layout, PersonSave} from './game';

export type TrajectoryGroup = 'all' | 'visitors' | 'staff';

export interface PeopleSample {
  t: number;
  people: PersonSave[];
}

export interface AnalyticsCurvePoint {
  t: number;
  queue: number;
  satisfaction: number;
  occupancy: number;
  delay: number;
  spend: number;
  risk: number;
}

export interface HeatCell {
  x: number;
  z: number;
  count: number;
}

export interface Heatmap {
  cols: number;
  rows: number;
  size: number;
  total: number;
  max: number;
  cells: number[];
  hotspots: HeatCell[];
}

export interface Trajectory {
  id: string;
  role: PersonSave['role'];
  points: {x: number; z: number}[];
  distance: number;
}

export interface AnalyticsStats {
  frames: number;
  samples: number;
  peopleSamples: number;
  arrived: number;
  served: number;
  servedRate: number;
  peakQueue: number;
  peakQueueAt: number;
  avgWait: number;
  satisfactionMin: number;
  satisfactionMinAt: number;
  satisfactionFinal: number;
  delay: number;
  spend: number;
}

export interface AnalyticsReport {
  curves: AnalyticsCurvePoint[];
  heat: Heatmap;
  trajectories: Trajectory[];
  stats: AnalyticsStats;
  insights: string[];
}

const HEAT_COLS = 24;
const VISITOR_ROLES = new Set<PersonSave['role']>(['participant', 'audience']);
const STAFF_ROLES = new Set<PersonSave['role']>([
  'staff', 'volunteer', 'security', 'medical', 'service', 'performer', 'host', 'referee', 'vendor',
]);
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

function inGroup(role: PersonSave['role'], group: TrajectoryGroup): boolean {
  if (group === 'all') return true;
  return group === 'visitors' ? VISITOR_ROLES.has(role) : STAFF_ROLES.has(role);
}

function direction(x: number, z: number): string {
  const ns = z < -2 ? '北' : z > 2 ? '南' : '';
  const ew = x < -2 ? '西' : x > 2 ? '东' : '';
  return ns || ew ? `${ns}${ew}侧` : '中心区域';
}

export function buildAnalytics(
  layout: Layout,
  state: SimulationState | null | undefined,
  frames: PeopleSample[],
  group: TrajectoryGroup = 'all',
): AnalyticsReport {
  const half = layout.size / 2;
  const curves: AnalyticsCurvePoint[] = (state?.replay?.frames ?? []).map(frame => ({
    t: frame.t, queue: frame.queue, satisfaction: frame.satisfaction, occupancy: frame.occupancy,
    delay: frame.delay, spend: frame.spend, risk: frame.risk,
  }));

  const cells = new Array<number>(HEAT_COLS * HEAT_COLS).fill(0);
  const cellOf = (x: number, z: number) => {
    const col = clamp(Math.floor((x + half) / layout.size * HEAT_COLS), 0, HEAT_COLS - 1);
    const row = clamp(Math.floor((z + half) / layout.size * HEAT_COLS), 0, HEAT_COLS - 1);
    return row * HEAT_COLS + col;
  };

  const tracked = new Map<string, {role: PersonSave['role']; points: {x: number; z: number}[]; distance: number}>();
  let peopleSamples = 0;
  for (const sample of frames) {
    for (const person of sample.people) {
      if (!inGroup(person.role, group)) continue;
      if (Math.abs(person.x) > half || Math.abs(person.z) > half) continue;
      peopleSamples++;
      cells[cellOf(person.x, person.z)]++;
      let entry = tracked.get(person.id);
      if (!entry) {
        entry = {role: person.role, points: [], distance: 0};
        tracked.set(person.id, entry);
      }
      const last = entry.points.at(-1);
      if (!last || Math.hypot(person.x - last.x, person.z - last.z) > .4) {
        entry.points.push({x: Math.round(person.x * 100) / 100, z: Math.round(person.z * 100) / 100});
        if (last) entry.distance += Math.hypot(person.x - last.x, person.z - last.z);
      }
    }
  }

  const max = cells.reduce((best, value) => Math.max(best, value), 0);
  const hotspots = cells
    .map((count, index) => {
      const col = index % HEAT_COLS, row = Math.floor(index / HEAT_COLS);
      return {
        count,
        x: -half + (col + .5) / HEAT_COLS * layout.size,
        z: -half + (row + .5) / HEAT_COLS * layout.size,
      };
    })
    .filter(cell => cell.count > 0)
    .sort((a, b) => b.count - a.count || a.x - b.x || a.z - b.z)
    .slice(0, 5);

  const trajectories = [...tracked.entries()]
    .map(([id, entry]) => ({id, role: entry.role, points: entry.points, distance: entry.distance}))
    .filter(entry => entry.points.length >= 3 && entry.distance >= 1.5)
    .sort((a, b) => b.distance - a.distance)
    .slice(0, 24);

  const arrived = state?.arrived ?? 0;
  const served = state?.served ?? 0;
  const satisfaction = curves.map(point => point.satisfaction);
  const low = satisfaction.reduce((found, value, index) => value < found.value ? {value, index} : found, {value: 100, index: -1});
  const peak = curves.reduce((found, point) => point.queue > found.queue ? point : found, {queue: 0, t: 0});
  const stats: AnalyticsStats = {
    frames: curves.length,
    samples: frames.length,
    peopleSamples,
    arrived,
    served,
    servedRate: arrived ? served / arrived * 100 : 0,
    peakQueue: state?.peakQueue ?? peak.queue,
    peakQueueAt: peak.t,
    avgWait: served ? (state?.queuePersonMinutes ?? 0) / served : 0,
    satisfactionMin: low.index >= 0 ? low.value : 0,
    satisfactionMinAt: low.index >= 0 ? curves[low.index].t : 0,
    satisfactionFinal: satisfaction.at(-1) ?? (state?.satisfaction ?? 0),
    delay: state?.delay ?? 0,
    spend: (state?.baseSpend ?? 0) + (state?.extraSpend ?? 0),
  };

  const insights: string[] = [];
  if (!curves.length && !peopleSamples) {
    insights.push('尚无逐分钟快照与人物采样，开始模拟后这里会显示真实数据。');
  } else {
    if (hotspots.length) {
      const top = hotspots[0];
      insights.push(`人流最密集的在${direction(top.x, top.z)}，占本轮人物采样的 ${Math.round(top.count / Math.max(1, peopleSamples) * 100)}%。`);
    }
    if (stats.peakQueue > 0) insights.push(`峰值排队 ${stats.peakQueue} 人，出现在第 ${stats.peakQueueAt} 分钟；人均排队 ${stats.avgWait.toFixed(1)} 分钟。`);
    if (curves.length) insights.push(`满意度最低 ${Math.round(stats.satisfactionMin)}/100（第 ${stats.satisfactionMinAt} 分钟），结束时 ${Math.round(stats.satisfactionFinal)}/100。`);
    if (arrived) insights.push(`已到场 ${arrived} 人，完成签到 ${served} 人（${stats.servedRate.toFixed(1)}%）。`);
    if (state?.departed) insights.push(`累计离场 ${state.departed} 人，当前场内 ${Math.max(0, served - state.departed)} 人。`);
    if (trajectories.length) insights.push(`已根据 ${frames.length} 组人物采样重构 ${trajectories.length} 条移动轨迹，未插值或随机补点。`);
  }

  return {
    curves,
    heat: {cols: HEAT_COLS, rows: HEAT_COLS, size: layout.size, total: peopleSamples, max, cells, hotspots},
    trajectories,
    stats,
    insights,
  };
}

export function analyticsCsv(report: AnalyticsReport): string {
  const rows = ['minute,queue,occupancy,satisfaction,delay,spend,risk'];
  for (const point of report.curves) {
    rows.push([point.t, point.queue, point.occupancy, point.satisfaction, point.delay, point.spend, point.risk]
      .map(value => typeof value === 'number' ? Math.round(value * 100) / 100 : value)
      .join(','));
  }
  return rows.join('\n');
}
