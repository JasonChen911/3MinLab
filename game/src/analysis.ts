import {CATALOG, cost, issues, itemCost, placement, type Item, type Kind, type Layout} from './game';
import {analyzeFacilities, facilityImpact, type FacilityMetrics} from './facilities';
import {route, type Point} from './path';
import {pathBlockedCells} from './world/collision';

export type AnalysisSeverity = 'error' | 'warning' | 'info';
export type AnalysisArea = 'geometry' | 'flow' | 'capacity' | 'safety' | 'staffing' | 'budget' | 'weather';

export interface AnalysisFinding {
  id: string;
  severity: AnalysisSeverity;
  area: AnalysisArea;
  title: string;
  detail: string;
  fix: string;
  at?: Point;
  items?: string[];
}

export interface AnalysisRoute {
  id: string;
  label: string;
  from: Point;
  to: Point;
  reachable: boolean;
  length: number;
  straight: number;
  detour: number;
}

export interface AnalysisScores {
  flow: number;
  capacity: number;
  safety: number;
  comfort: number;
  total: number;
}

export interface AnalysisMark {
  id: string;
  x: number;
  z: number;
  severity: AnalysisSeverity;
  title: string;
}

export interface LayoutAnalysis {
  schema: 1;
  facility: FacilityMetrics;
  findings: AnalysisFinding[];
  routes: AnalysisRoute[];
  scores: AnalysisScores;
  circulation: {freeCells: number; totalCells: number; queueSpace: number};
  summary: string;
}

export interface OptimizationChange {
  id: string;
  kind: 'add' | 'move' | 'anchor';
  label: string;
  reason: string;
  cost: number;
  itemId?: string;
  item?: Item;
  from?: Point;
  to?: Point;
}

export interface OptimizationPlan {
  schema: 1;
  changes: OptimizationChange[];
  items: Item[];
  cost: number;
  before: LayoutAnalysis;
  after: LayoutAnalysis;
}

export interface PreviewGhost {
  id: string;
  item: Item;
  color: number;
  flat?: boolean;
}

const clamp = (value: number, min = 0, max = 100) => Math.max(min, Math.min(max, value));
const pos = (item: Item): Point => ({x: item.x, z: item.z});
const STAGES: Kind[] = ['stage', 'stageSmall', 'stageLarge', 'podium'];
const DESKS: Kind[] = ['checkin', 'checkinSmall', 'checkinLarge'];
const TENTS: Kind[] = ['tent', 'tentSmall'];

function severityOf(text: string): AnalysisSeverity {
  return /超出场地边界|重叠|不应放在室内|缺少出入口|缺少签到台|缺少主活动区域|缺少活动流程|参与人数应大于零|场地容量|不可通行/.test(text)
    ? 'error' : /缺少|未固定|受损|不足|低于|超出活动预算|距离过近|超过有效半径|绕行|阻断/.test(text)
      ? 'warning' : 'info';
}

function areaOf(text: string): AnalysisArea {
  if (/超出场地边界|重叠|不应放在室内/.test(text)) return 'geometry';
  if (/入口|签到|排队|通行|绕行|距离过近|阻断/.test(text)) return 'flow';
  if (/座位|容量|卫生|休息区|等候空间/.test(text)) return 'capacity';
  if (/预算|费用/.test(text)) return 'budget';
  if (/天气|遮雨|暴雨|大风|帐篷|设备/.test(text)) return 'weather';
  if (/医疗|受损|围栏|安全/.test(text)) return 'safety';
  if (/人员|人力|志愿者/.test(text)) return 'staffing';
  return 'geometry';
}

function fixOf(text: string): string {
  if (/超出场地边界/.test(text)) return '将设施移入场内，或缩小尺寸后重新放置。';
  if (/重叠/.test(text)) return '拖开重叠设施，至少留出 1 米检修与通行间隙。';
  if (/缺少出入口/.test(text)) return '在迎客方向放置出入口，并保持到签到台的连续通道。';
  if (/缺少签到台/.test(text)) return '在入口内侧 4–8 米处放置签到台，留出排队区。';
  if (/缺少主活动区域/.test(text)) return '放置舞台、讲台或观众席，明确活动核心区。';
  if (/缺少活动流程/.test(text)) return '在活动信息中补充流程任务与时间。';
  if (/参与人数/.test(text)) return '将参与人数设置为大于零的有效值。';
  if (/签到台与入口|距离过近/.test(text)) return '将签到台后移，入口与签到台之间保留 4–8 米排队缓冲。';
  if (/座位/.test(text)) return '增加观众席或座椅，或降低参与人数。';
  if (/没有医疗点/.test(text)) return '放置医疗点，并覆盖主要人群与入口。';
  if (/卫生设施/.test(text)) return '增加厕所与垃圾桶，按每 60 人一个卫生点配置。';
  if (/休息区/.test(text)) return '增加工作人员休息区，保证轮休工位不少于人数的十分之一。';
  if (/音响.*半径/.test(text)) return '将音响移回舞台有效半径内，或增设补声设备。';
  if (/没有扩声/.test(text)) return '在舞台两侧放置音响，覆盖观众区。';
  if (/帐篷未固定/.test(text)) return '固定帐篷或移入背风区，避免有效容量下降。';
  if (/遮雨/.test(text)) return '增加遮雨帐篷，或把关键流程转入室内备用区。';
  if (/设备/.test(text)) return '为设备增加遮雨保护并准备备用设备。';
  if (/舒适度/.test(text)) return '补充座位、遮雨与卫生设施，改善停留体验。';
  if (/签到预计|排队/.test(text)) return '增开签到台或签到人员，必要时启用分流等候区。';
  if (/出入口仅/.test(text)) return '增加出入口或拓宽入场通道。';
  if (/预算|费用/.test(text)) return '调整设施组合或提高预算，使费用回到预算内。';
  return '检查设施数量、位置与活动规模是否匹配。';
}

function issueLocation(layout: Layout, text: string): {at?: Point; items: string[]} {
  for (const item of layout.items) {
    if (text.includes(CATALOG[item.kind].name)) return {at: pos(item), items: [item.id]};
  }
  const entrance = layout.items.find(item => item.kind === 'entrance');
  const desk = layout.items.find(item => DESKS.includes(item.kind));
  if (/签到台与入口|距离过近/.test(text) && entrance && desk) {
    return {at: {x: (entrance.x + desk.x) / 2, z: (entrance.z + desk.z) / 2}, items: [entrance.id, desk.id]};
  }
  if (/签到|排队|出入口|入口/.test(text)) {
    const target = desk ?? entrance;
    return {at: target ? pos(target) : {x: 0, z: 0}, items: target ? [target.id] : []};
  }
  if (/座位|视线/.test(text)) {
    const target = layout.items.find(item => STAGES.includes(item.kind)) ?? layout.items.find(item => item.kind === 'chair' || item.kind === 'bleachers');
    return {at: target ? pos(target) : {x: 0, z: 0}, items: target ? [target.id] : []};
  }
  if (/卫生|厕所/.test(text)) {
    const target = layout.items.find(item => item.kind === 'toilet' || item.kind === 'bin');
    return {at: target ? pos(target) : {x: 0, z: 0}, items: target ? [target.id] : []};
  }
  if (/休息区|轮休/.test(text)) {
    const target = layout.items.find(item => item.kind === 'rest' || item.kind === 'bench');
    return {at: target ? pos(target) : {x: 0, z: 0}, items: target ? [target.id] : []};
  }
  if (/音响|扩声/.test(text)) {
    const target = layout.items.find(item => STAGES.includes(item.kind));
    return {at: target ? pos(target) : {x: 0, z: 0}, items: target ? [target.id] : []};
  }
  if (/帐篷|遮雨/.test(text)) {
    const target = layout.items.find(item => TENTS.includes(item.kind));
    return {at: target ? pos(target) : {x: 0, z: 0}, items: target ? [target.id] : []};
  }
  if (/设备/.test(text)) {
    const target = layout.items.find(item => facilityImpact(item.kind).role === 'equipment');
    return {at: target ? pos(target) : {x: 0, z: 0}, items: target ? [target.id] : []};
  }
  if (/受损/.test(text)) {
    const target = layout.items.find(item => item.damaged);
    return {at: target ? pos(target) : {x: 0, z: 0}, items: target ? [target.id] : []};
  }
  return {at: {x: 0, z: 0}, items: []};
}

function routeOf(layout: Layout, id: string, label: string, from: Point, to: Point): AnalysisRoute {
  const path = route(layout.items, layout.size, from, to, {snap: true});
  const length = path.length ? path.length - 1 : 0;
  const straight = Math.hypot(to.x - from.x, to.z - from.z);
  return {id, label, from, to, reachable: path.length > 0, length, straight, detour: straight > .5 ? length / straight : 1};
}

function freeCellsNear(layout: Layout, center: Point, radius: number, blocked: Set<string>): number {
  let free = 0;
  for (let x = Math.floor(center.x - radius); x <= Math.ceil(center.x + radius); x++) {
    for (let z = Math.floor(center.z - radius); z <= Math.ceil(center.z + radius); z++) {
      if (Math.hypot(x - center.x, z - center.z) > radius) continue;
      if (!blocked.has(`${x},${z}`)) free += 1;
    }
  }
  return free;
}

export function analyzeLayout(layout: Layout): LayoutAnalysis {
  const facility = analyzeFacilities(layout, CATALOG);
  const findings: AnalysisFinding[] = [];
  const seen = new Set<string>();
  const add = (severity: AnalysisSeverity, area: AnalysisArea, title: string, detail: string, fix: string, at?: Point, items?: string[]) => {
    const key = `${title}|${Math.round(at?.x ?? 0)}|${Math.round(at?.z ?? 0)}`;
    if (seen.has(key)) return;
    seen.add(key);
    findings.push({id: `finding-${findings.length + 1}`, severity, area, title, detail, fix, at, items});
  };

  for (const text of issues(layout)) {
    const location = issueLocation(layout, text);
    add(severityOf(text), areaOf(text), text, text, fixOf(text), location.at, location.items);
  }

  const entrance = layout.items.find(item => item.kind === 'entrance');
  const desk = layout.items.find(item => DESKS.includes(item.kind));
  const stage = layout.items.find(item => STAGES.includes(item.kind));
  const medical = layout.items.find(item => item.kind === 'medical');
  const routes: AnalysisRoute[] = [];
  if (entrance && desk) routes.push(routeOf(layout, 'entry-checkin', '入口 → 签到台', pos(entrance), pos(desk)));
  if (desk && stage) routes.push(routeOf(layout, 'checkin-stage', '签到台 → 主活动区', pos(desk), pos(stage)));
  if (entrance && stage) routes.push(routeOf(layout, 'entry-stage', '入口 → 主活动区', pos(entrance), pos(stage)));
  if (entrance && medical) routes.push(routeOf(layout, 'entry-medical', '入口 → 医疗点', pos(entrance), pos(medical)));

  for (const path of routes) {
    if (!path.reachable) {
      add('error', 'flow', `${path.label} 不可通行`,
        `A* 路径搜索未找到从 (${Math.round(path.from.x)}, ${Math.round(path.from.z)}) 到 (${Math.round(path.to.x)}, ${Math.round(path.to.z)}) 的连续通道；阻挡来自设施碰撞体。`,
        '清理两点之间的阻挡设施，或增加道路/小径与出入口通道。',
        {x: (path.from.x + path.to.x) / 2, z: (path.from.z + path.to.z) / 2});
    } else if (path.detour > 1.9 && path.length - path.straight > 10) {
      add('warning', 'flow', `${path.label} 绕行过远`,
        `实际步行 ${path.length} 米，直线距离 ${Math.round(path.straight)} 米，绕行系数 ${path.detour.toFixed(2)}。`,
        '清理直线通道上的阻挡，或沿主要人流方向补充道路/小径。',
        {x: (path.from.x + path.to.x) / 2, z: (path.from.z + path.to.z) / 2});
    }
  }

  const half = Math.floor(layout.size / 2);
  const blocked = pathBlockedCells(layout.items, half);
  const totalCells = (half * 2 + 1) ** 2;
  const freeCells = Math.max(0, totalCells - blocked.size);
  const queueSpace = desk ? freeCellsNear(layout, pos(desk), 9, blocked) : 0;
  if (freeCells / totalCells < .55) {
    add('warning', 'flow', '场地有效通行面积不足',
      `场地 ${layout.size}×${layout.size} 米内 ${Math.round((1 - freeCells / totalCells) * 100)}% 的网格被设施占用，人流交汇处容易拥堵。`,
      '减少密集装饰或大型设施，保留至少 1.5 米宽的主要通道。', {x: 0, z: 0});
  }
  if (desk && facility.risks.queue > .42 && queueSpace < Math.max(12, layout.activity.people * .08)) {
    add('warning', 'capacity', '签到等候空间不足',
      `签到台周边 9 米内仅约 ${queueSpace} 平方米可用空间，而排队风险为 ${Math.round(facility.risks.queue * 100)}%。`,
      '将签到台后移或增开分流等候区，排队区按每平方米 1–1.5 人预留。', pos(desk), [desk.id]);
  }

  const errors = findings.filter(finding => finding.severity === 'error').length;
  const warnings = findings.filter(finding => finding.severity === 'warning').length;
  const reachable = routes.filter(path => path.reachable).length;
  const reachableRatio = routes.length ? reachable / routes.length : 1;
  const flow = clamp(Math.round(facility.scores.service * .55 + facility.accessibility * .35 + reachableRatio * 10 - (routes.length - reachable) * 18));
  const capacity = clamp(Math.round(100 - facility.risks.crowd * 55 - facility.risks.queue * 25 - (facility.seating < layout.activity.people * .55 ? 12 : 0)));
  const safety = clamp(facility.scores.safety - (facility.medicalUnits ? 0 : 8));
  const comfort = facility.scores.comfort;
  const penalty = errors * 4 + warnings * 1.5;
  const total = clamp(Math.round(flow * .28 + capacity * .26 + safety * .24 + comfort * .22 - penalty));

  return {
    schema: 1, facility, findings, routes,
    scores: {flow, capacity, safety, comfort, total},
    circulation: {freeCells, totalCells, queueSpace},
    summary: `${errors} 项阻塞 · ${warnings} 项提醒 · 动线 ${flow} · 容量 ${capacity} · 安全 ${safety} · 舒适 ${comfort}`,
  };
}

function marksFor(analysis: LayoutAnalysis | null): AnalysisMark[] {
  if (!analysis) return [];
  const rank: Record<AnalysisSeverity, number> = {error: 3, warning: 2, info: 1};
  const byCell = new Map<string, AnalysisMark>();
  for (const finding of analysis.findings) {
    if (!finding.at) continue;
    const key = `${Math.round(finding.at.x / 2)},${Math.round(finding.at.z / 2)}`;
    const existing = byCell.get(key);
    if (!existing || rank[finding.severity] > rank[existing.severity]) {
      byCell.set(key, {id: finding.id, x: finding.at.x, z: finding.at.z, severity: finding.severity, title: finding.title});
    }
  }
  return [...byCell.values()].slice(0, 32);
}

export function analysisMarks(analysis: LayoutAnalysis | null): AnalysisMark[] {
  return marksFor(analysis);
}

function spotCandidates(prefer: Point, radius: number): Point[] {
  const points: Point[] = [{x: Math.round(prefer.x), z: Math.round(prefer.z)}];
  for (let r = 3; r <= radius; r += 1.5) {
    const count = Math.max(8, Math.round(r * 4));
    for (let i = 0; i < count; i++) {
      const angle = i / count * Math.PI * 2;
      points.push({x: Math.round(prefer.x + Math.cos(angle) * r), z: Math.round(prefer.z + Math.sin(angle) * r)});
    }
  }
  return points;
}

function towardCenter(point: Point, distance: number): Point {
  const length = Math.hypot(point.x, point.z);
  if (length < .001) return {x: 0, z: distance};
  return {x: Math.round(point.x - point.x / length * distance), z: Math.round(point.z - point.z / length * distance)};
}

function tryAdd(layout: Layout, items: Item[], kind: Kind, prefer: Point, radius: number): Item | null {
  let serial = items.length + 1;
  for (const point of spotCandidates(prefer, radius)) {
    let id = `opt-${kind}-${serial}`;
    while (items.some(item => item.id === id)) id = `opt-${kind}-${++serial}`;
    const item: Item = {
      id, kind, x: point.x, z: point.z, rotation: 0, scale: 1, height: 1,
      ...(TENTS.includes(kind) ? {anchored: true} : {}),
    };
    if (placement({...layout, items}, item, 'unlimited').level === 'invalid') continue;
    return item;
  }
  return null;
}

function relocate(layout: Layout, items: Item[], index: number, prefer: Point, radius: number): Item | null {
  const original = items[index];
  const without = items.filter((_, i) => i !== index);
  for (const point of spotCandidates(prefer, radius)) {
    if (point.x === original.x && point.z === original.z) continue;
    const candidate = {...original, x: point.x, z: point.z};
    if (placement({...layout, items: without}, candidate, 'unlimited').level === 'invalid') continue;
    return candidate;
  }
  return null;
}

/**
 * Produces concrete, geometry-validated layout changes. Nothing is applied here:
 * the caller previews the plan and applies it through the normal undo stack.
 */
export function optimizeLayout(layout: Layout): OptimizationPlan {
  const before = analyzeLayout(layout);
  const facility = before.facility;
  const items: Item[] = layout.items.map(item => ({...item}));
  const changes: OptimizationChange[] = [];
  const staff = Math.max(0, layout.params.staff) + Math.max(0, layout.volunteers ?? 0);
  const budgetLeft = () => layout.budgetMode === 'challenge' ? layout.activity.budget - cost(items) : Infinity;
  const afford = (item: Item) => itemCost(item) <= budgetLeft();
  const addItem = (kind: Kind, prefer: Point, radius: number, reason: string) => {
    const item = tryAdd(layout, items, kind, prefer, radius);
    if (!item || !afford(item)) return null;
    items.push(item);
    changes.push({id: `add-${item.id}`, kind: 'add', label: `新增${CATALOG[kind].name}`, reason, cost: itemCost(item), item});
    return item;
  };

  for (let index = 0; index < items.length; index++) {
    const item = items[index];
    if (!layout.indoor && TENTS.includes(item.kind) && !item.anchored) {
      items[index] = {...item, anchored: true};
      changes.push({
        id: `anchor-${item.id}`, kind: 'anchor', label: `固定${CATALOG[item.kind].name}`,
        reason: '户外未固定帐篷会在大风中损失有效遮雨容量', cost: 0, itemId: item.id, item: items[index],
      });
    }
  }

  const stageIndex = items.findIndex(item => STAGES.includes(item.kind));
  if (stageIndex >= 0) {
    const stage = items[stageIndex];
    for (const kind of ['speaker', 'light', 'screen'] as Kind[]) {
      const impact = facilityImpact(kind);
      for (let index = 0; index < items.length; index++) {
        const item = items[index];
        if (item.kind !== kind) continue;
        const distance = Math.hypot(item.x - stage.x, item.z - stage.z);
        if (distance <= impact.radius * .8) continue;
        const candidate = relocate(layout, items, index, pos(stage), impact.radius * .7);
        if (!candidate) continue;
        items[index] = candidate;
        changes.push({
          id: `move-${item.id}`, kind: 'move', label: `移动${CATALOG[kind].name}靠近舞台`,
          reason: `距舞台 ${Math.round(distance)} 米，超出 ${impact.radius} 米有效半径`, cost: 0,
          itemId: item.id, item: candidate, from: pos(item), to: pos(candidate),
        });
      }
    }
  }

  if (stageIndex >= 0) {
    const stage = items[stageIndex];
    const speakerRadius = facilityImpact('speaker').radius;
    const covered = items.some(item => item.kind === 'speaker' && Math.hypot(item.x - stage.x, item.z - stage.z) <= speakerRadius);
    if (!covered) {
      addItem('speaker', {x: stage.x - 5, z: stage.z + 4}, 7, '主舞台没有扩声设备，在舞台两侧补充音响');
      addItem('speaker', {x: stage.x + 5, z: stage.z + 4}, 7, '主舞台没有扩声设备，在舞台两侧补充音响');
    }
  }

  const entranceIndex = items.findIndex(item => item.kind === 'entrance');
  const deskIndex = items.findIndex(item => DESKS.includes(item.kind));
  if (entranceIndex >= 0 && deskIndex >= 0) {
    const entrance = items[entranceIndex], desk = items[deskIndex];
    if (Math.hypot(entrance.x - desk.x, entrance.z - desk.z) < 4) {
      const candidate = relocate(layout, items, deskIndex, towardCenter(pos(entrance), 8), 5);
      if (candidate) {
        items[deskIndex] = candidate;
        changes.push({
          id: `move-${desk.id}`, kind: 'move', label: `后移${CATALOG[desk.kind].name}，留出排队区`,
          reason: '入口与签到台距离过近，排队人流会堵住入口', cost: 0,
          itemId: desk.id, item: candidate, from: pos(desk), to: pos(candidate),
        });
      }
    }
  }

  if (facility.risks.queue > .42 || facility.checkinDesks === 0) {
    const entrance = items.find(item => item.kind === 'entrance');
    const prefer = entrance ? towardCenter(pos(entrance), 6) : {x: 0, z: 0};
    const kind: Kind = layout.activity.people >= 240 ? 'checkinLarge' : 'checkin';
    const count = facility.risks.queue > .65 || facility.checkinDesks === 0 ? 2 : 1;
    for (let i = 0; i < count; i++) {
      if (!addItem(kind, prefer, 12, `签到排队风险 ${Math.round(facility.risks.queue * 100)}%，增开签到台提高入场吞吐`)) break;
    }
  }

  if (layout.activity.people >= 60 && facility.medicalUnits === 0) {
    addItem('medical', {x: 0, z: 0}, 18, '中大型活动缺少医疗覆盖，就近配置医疗点');
  }
  if (facility.sanitation < layout.activity.people * .3) {
    for (let i = 0; i < 2; i++) {
      if (!addItem('toilet', {x: 0, z: 0}, 16, `卫生设施仅支撑约 ${facility.sanitation} 人，低于现场人数`)) break;
    }
  }
  if (facility.restBays < Math.ceil(staff / 10)) {
    addItem('rest', stageIndex >= 0 ? pos(items[stageIndex]) : {x: 0, z: 0}, 14, '工作人员轮休工位不足，补充休息区');
  }
  if (!layout.indoor && facility.shelterCoverage < .35) {
    const entrance = items.find(item => item.kind === 'entrance');
    const prefer = entrance ? towardCenter(pos(entrance), 8) : {x: 0, z: 0};
    for (let i = 0; i < 2; i++) {
      const kind: Kind = layout.activity.people >= 200 ? 'tent' : 'tentSmall';
      if (!addItem(kind, prefer, 14, `遮雨覆盖仅 ${Math.round(facility.shelterCoverage * 100)}%，增加固定遮雨点`)) break;
    }
  }

  const after = analyzeLayout({...layout, items});
  return {schema: 1, changes, items, cost: cost(items) - cost(layout.items), before, after};
}
