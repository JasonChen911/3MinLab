import type {
  DirectorEvent, DirectorEventImpact, DirectorEventKind, DirectorMetrics, DirectorMitigation, DirectorState, SimulationState,
} from './model';
import type {FacilityMetrics} from '../facilities';
import {addIncident} from './hazards';
import type {Random} from './random';
import {logReplay, replaySpotForDirectorKind} from './replay';
import {difficultyProfile} from '../difficulty';
import {charge} from './money';

const HISTORY_LIMIT = 40;
const clamp = (value: number, min = 0, max = 1) => Math.max(min, Math.min(max, value));
const percent = (value: number) => `${Math.round(value * 100)}%`;

export const DIRECTOR_MITIGATION_LABELS: Record<DirectorMitigation, string> = {
  reserve: '调配后备人员', spare: '启用备用设备', shelter: '转入室内 / 启用避雨',
  supply: '补充物资', capacity: '增开等候区', medical: '调用医疗支援', comfort: '补给饮水与休息物资',
};

export function initialSatisfaction(facility?: FacilityMetrics): number {
  if (!facility) return 70;
  return Math.round(clamp(50 + facility.comfort * .24 + facility.safety * .08 + facility.atmosphere * .06, 35, 88));
}

export function initialDirector(seed: number, _facility?: FacilityMetrics): DirectorState {
  return {schema: 1, rng: (seed ^ 0x9e3779b9) >>> 0, nextReview: 5, serial: 1, events: [], positiveStreak: 0, lastTrigger: {}};
}

export function directorMetrics(s: SimulationState): DirectorMetrics {
  const facility = s.snapshot.facility;
  const occupancy = Math.max(0, s.served - s.departed);
  const capacity = Math.max(1, s.parameters.capacity);
  const people = Math.max(1, s.snapshot.people);
  const completed = s.tasks.filter(task => task.status === '已完成').length;
  const progress = s.tasks.length ? completed / s.tasks.length : 0;
  const queuePressure = clamp(s.queue / Math.max(10, s.parameters.serviceRate * s.parameters.checkinStaff * 6));
  const capacityUse = clamp(occupancy / capacity);
  const crowdPressure = clamp(capacityUse * .7 + (facility?.risks.crowd ?? 0) * .45);
  const staffLoad = clamp(s.assignedStaff / Math.max(1, s.availableStaff));
  const weatherPressure = clamp(Math.max(facility?.risks.weather ?? 0, s.weatherClosed ? 1 : 0));
  const medicalPressure = clamp((facility?.risks.medical ?? .3) * (.45 + capacityUse * .55) + (occupancy >= 80 && !(facility?.medicalUnits ?? 0) ? .18 : 0));
  const equipmentPressure = clamp(Math.max(facility?.risks.equipment ?? 0, s.equipmentDown ? 1 : 0));
  const risk = clamp(Math.max(queuePressure, crowdPressure, weatherPressure, medicalPressure, equipmentPressure, staffLoad * .9));
  return {
    time: s.minute, queue: s.queue, occupancy, capacityUse, satisfaction: s.satisfaction ?? 70, staffLoad,
    queuePressure, crowdPressure, weatherPressure, medicalPressure, equipmentPressure,
    comfort: facility?.comfort ?? 60, atmosphere: facility?.atmosphere ?? 55, progress,
    arrivalsRemaining: Math.max(0, s.attendanceTotal - s.arrived), risk,
  };
}

interface Candidate {
  kind: DirectorEventKind;
  title: string;
  risk: number;
  reason: string;
  chain: string[];
  effects: string[];
  mitigation?: DirectorMitigation;
  impact: DirectorEventImpact;
  duration: number;
  lead: number;
}

const pending = (d: DirectorState, kind: DirectorEventKind) =>
  d.events.some(event => event.kind === kind && (event.status === 'warning' || event.status === 'active'));
const cooled = (d: DirectorState, kind: DirectorEventKind, minute: number, cooldown = 28) =>
  minute - (d.lastTrigger[kind] ?? -9999) >= cooldown;

function candidates(s: SimulationState, d: DirectorState, m: DirectorMetrics): Candidate[] {
  const facility = s.snapshot.facility;
  const list: Candidate[] = [];

  if (!pending(d, 'queue') && cooled(d, 'queue', s.minute) && s.minute >= 8 && (m.queuePressure > .42 || (facility?.risks.queue ?? 0) > .45) && s.queue >= 6) {
    const risk = clamp(Math.max(m.queuePressure, (facility?.risks.queue ?? 0) * .9));
    list.push({
      kind: 'queue', title: '入口排队持续上升', risk,
      reason: `当前排队 ${s.queue} 人，签到能力 ${s.parameters.checkinStaff} 人 × ${s.parameters.serviceRate.toFixed(1)} 人/分；入口通道 ${Math.round(facility?.entrancePoints ?? 0)} 条，签到台 ${Math.round(facility?.checkinDesks ?? 0)} 台。`,
      chain: ['入场客流超过签到吞吐', `排队增至 ${s.queue} 人`, '平均等待时间延长', '观众满意度下降'],
      effects: ['签到效率 -22%', '满意度每分钟 -0.22', '可能触发提前离场'],
      mitigation: m.queuePressure > .72 ? 'capacity' : 'reserve',
      impact: {serviceFactor: .78, satisfactionPerMinute: -.22}, duration: 12, lead: 4,
    });
  }

  if (!pending(d, 'crowd') && cooled(d, 'crowd', s.minute) && s.minute >= 15 && m.capacityUse > .8) {
    const risk = clamp(Math.max((m.capacityUse - .72) / .28, facility?.risks.crowd ?? 0));
    list.push({
      kind: 'crowd', title: '场内接近容量上限', risk,
      reason: `场内 ${m.occupancy} 人 / 容量 ${s.parameters.capacity} 人（${percent(m.capacityUse)}），场地面积 ${s.snapshot.people} 人规模；当前排队 ${s.queue} 人。`,
      chain: ['入场速度高于离场速度', `占用率达到 ${percent(m.capacityUse)}`, '通道与座位拥挤', '体验和疏散风险上升'],
      effects: ['签到效率 -10%', '满意度每分钟 -0.25', '离场速度小幅上升'],
      mitigation: 'capacity',
      impact: {serviceFactor: .9, satisfactionPerMinute: -.25, departureFactor: 1.08}, duration: 14, lead: 4,
    });
  }

  if (!pending(d, 'weather') && cooled(d, 'weather', s.minute, 35) && facility?.outdoor && !s.weatherClosed && facility.risks.weather > .5) {
    const risk = clamp(facility.risks.weather);
    list.push({
      kind: 'weather', title: `${facility.weatherName}风险逼近`, risk,
      reason: `当前${facility.weatherName}，遮雨覆盖 ${percent(facility.shelterCoverage)}，未固定帐篷 ${facility.looseTents} 个；户外设备 ${facility.counts.equipment} 件，风险评分 ${Math.round(risk * 100)}/100。`,
      chain: ['户外天气风险积累', '遮雨与固定不足', '设备或活动面临中断', '签到与演出效率下降'],
      effects: ['户外区域可能关闭', '签到效率 -28%', '满意度每分钟 -0.3'],
      mitigation: 'shelter',
      impact: {addIncident: 'weather', serviceFactor: .72, satisfactionPerMinute: -.3, departureFactor: 1.25}, duration: 18, lead: 5,
    });
  }

  if (!pending(d, 'staff') && cooled(d, 'staff', s.minute, 30) && s.minute >= 10 && m.staffLoad > .82 && (s.queue > 4 || s.tasks.some(task => task.status === '进行中'))) {
    const risk = clamp((m.staffLoad - .64) / .36 + (facility?.risks.fatigue ?? 0) * .25);
    list.push({
      kind: 'staff', title: '现场人力接近饱和', risk,
      reason: `已分配 ${s.assignedStaff} / 可用 ${s.availableStaff} 人（${percent(m.staffLoad)}），休息工位 ${Math.round(facility?.restBays ?? 0)} 个，进行中任务 ${s.tasks.filter(task => task.status === '进行中').length} 项。`,
      chain: ['任务与签到同时占用人力', '轮休不足', '服务速度下降', '排队与延误扩大'],
      effects: ['签到效率 -15%', '满意度每分钟 -0.12'],
      mitigation: 'reserve',
      impact: {serviceFactor: .85, satisfactionPerMinute: -.12}, duration: 12, lead: 2,
    });
  }

  if (!pending(d, 'medical') && cooled(d, 'medical', s.minute, 40) && facility && facility.medicalUnits === 0 && m.occupancy >= 80) {
    const risk = clamp((facility.risks.medical ?? 0) + m.capacityUse * .18);
    list.push({
      kind: 'medical', title: '医疗覆盖缺口', risk,
      reason: `现场 ${m.occupancy} 人，医疗点 ${facility.medicalUnits} 个；医疗风险评分 ${Math.round((facility.risks.medical ?? 0) * 100)}/100。`,
      chain: ['中大型活动缺少医疗点', '突发不适无法就近处理', '响应时间延长', '安全评分下降'],
      effects: ['应急医疗支出增加', '满意度每分钟 -0.35', '安全评分承压'],
      mitigation: 'medical',
      impact: {satisfactionPerMinute: -.35, budgetCost: 240, serviceFactor: .96}, duration: 10, lead: 2,
    });
  }

  if (!pending(d, 'equipment') && cooled(d, 'equipment', s.minute, 35) && !s.equipmentDown && (facility?.counts.equipment ?? 0) > 0 && (facility?.risks.equipment ?? 0) > .45 && s.tasks.some(task => task.equipment && task.status === '进行中')) {
    const risk = clamp(facility?.risks.equipment ?? 0);
    list.push({
      kind: 'equipment', title: `${s.snapshot.equipmentName}风险升高`, risk,
      reason: `设备质量评分 ${Math.round(facility?.equipmentQuality ?? 0)}/100，${facility?.weatherName}，受损设施 ${facility?.damagedItems ?? 0} 项；设备任务 ${s.tasks.filter(task => task.equipment && task.status === '进行中').length} 项正在进行。`,
      chain: ['设备暴露在天气与负载中', '备用设备尚未启用', '当前任务可能中断', '满意度下降'],
      effects: ['设备故障事件', '满意度每分钟 -0.15', '任务可能暂停'],
      mitigation: 'spare',
      impact: {addIncident: 'equipment', satisfactionPerMinute: -.15}, duration: 10, lead: 3,
    });
  }

  if (!pending(d, 'comfort') && cooled(d, 'comfort', s.minute, 35) && s.minute >= 12 && facility && facility.comfort < 56 && m.occupancy > s.snapshot.people * .25) {
    const risk = clamp(facility.risks.comfort * .85);
    list.push({
      kind: 'comfort', title: '现场舒适度下降', risk,
      reason: `舒适度 ${facility.comfort}/100，座位 ${Math.round(facility.seating)} 个，遮雨 ${percent(facility.shelterCoverage)}，卫生设施支撑 ${Math.round(facility.sanitation)} 人。`,
      chain: ['座位/遮雨/卫生不足', `现场 ${m.occupancy} 人停留`, '休息需求得不到满足', '满意度与停留意愿下降'],
      effects: ['满意度每分钟 -0.25', '离场速度 +10%'],
      mitigation: 'comfort',
      impact: {satisfactionPerMinute: -.25, departureFactor: 1.1}, duration: 14, lead: 3,
    });
  }

  const currentTask = s.tasks.find(task => task.status === '进行中');
  if (currentTask && !pending(d, 'program') && cooled(d, 'program', s.minute, 40)) {
    const scene = s.snapshot.scene;
    const line = scene === 'athletics' && s.queue >= 12
      ? {title: '运动员检录延迟影响赛程', cause: `检录入口仍有 ${s.queue} 人排队，${currentTask.name}的人员调度受到影响。`, risk: clamp(s.queue / Math.max(20, s.snapshot.people * .2)), location: '检录区'}
      : scene === 'performance' && (m.staffLoad > .7 || s.equipmentDown)
        ? {title: '演出转场准备延迟', cause: `当前工作人员负荷 ${percent(m.staffLoad)}，${currentTask.name}的转场准备需要更多时间。`, risk: clamp(m.staffLoad), location: '主舞台'}
        : scene === 'community' && (s.facilities?.vendorQueue ?? 0) >= 8
          ? {title: '摊位拥堵影响互动流程', cause: `摊位有 ${s.facilities?.vendorQueue ?? 0} 人等待，${currentTask.name}的服务人员暂时不足。`, risk: clamp((s.facilities?.vendorQueue ?? 0) / 24), location: '服务区'}
          : null;
    if (line) list.push({kind: 'program', title: line.title, risk: line.risk,
      reason: line.cause, chain: [line.location, '人员或资源被占用', `${currentTask.name}暂停`, '后续流程延误'],
      effects: [`${currentTask.name}暂缓执行`, '活动延误随暂停时间增长'],
      mitigation: 'reserve', impact: {pauseTaskId: currentTask.id, satisfactionPerMinute: -.08}, duration: 5, lead: 2});
  }

  if (!pending(d, 'positive') && cooled(d, 'positive', s.minute, 45) && s.minute >= 20 && facility && (s.satisfaction ?? 70) >= 74 && m.queuePressure < .25 && facility.atmosphere >= 58 && m.progress >= .2) {
    const risk = clamp((s.satisfaction ?? 70) / 100 * .5 + facility.atmosphere / 320 + (facility.audioQuality + facility.sightline) / 500, 0, .95);
    list.push({
      kind: 'positive', title: '现场氛围升温', risk,
      reason: `满意度 ${Math.round(s.satisfaction ?? 70)}/100，氛围 ${facility.atmosphere}/100，视线 ${facility.sightline}/100，扩声 ${facility.audioQuality}/100；排队压力 ${percent(m.queuePressure)}。`,
      chain: ['舞台、扩声与舒适度形成正反馈', '观众停留更久', '口碑与现场氛围提升', '离场速度下降'],
      effects: ['满意度每分钟 +0.5', '离场速度 -15%', '正向事件记录'],
      impact: {satisfactionPerMinute: .5, departureFactor: .85}, duration: 12, lead: 0,
    });
  }

  return list.sort((a, b) => b.risk - a.risk).filter(candidate => candidate.risk >= .32).map(candidate => ({...candidate, risk: clamp(candidate.risk)}));
}

function severityOf(risk: number): 1 | 2 | 3 {
  return risk >= .72 ? 3 : risk >= .48 ? 2 : 1;
}

function reviewDirector(s: SimulationState, d: DirectorState, r: Random, metrics: DirectorMetrics, limit: number, chanceScale: number) {
  const list = candidates(s, d, metrics);
  if (!list.length) return;
  const used = new Set<DirectorEventKind>();
  let created = 0;
  for (const top of list) {
    if (created >= limit) break;
    if (used.has(top.kind)) continue;
    const chance = clamp((.2 + top.risk * .75) * chanceScale, 0, .95);
    if (r.uniform() > chance) continue;
    used.add(top.kind);
    created += 1;
    const warning = top.lead > 0;
    const event: DirectorEvent = {
      id: d.serial++, kind: top.kind, title: top.title, status: warning ? 'warning' : 'active',
      at: s.minute, activeAt: s.minute + top.lead, until: s.minute + top.lead + top.duration,
      severity: severityOf(top.risk), risk: Math.round(top.risk * 1000) / 1000,
      reason: top.reason, chain: top.chain, effects: top.effects,
      mitigation: warning ? top.mitigation : undefined, impact: top.impact,
    };
    d.events.push(event);
    d.events = d.events.slice(-HISTORY_LIMIT);
    d.lastTrigger[top.kind] = s.minute;
    logReplay(s, {
      at: s.minute, kind: 'director',
      title: warning ? `预警 · ${top.title}` : `事件 · ${top.title}`,
      detail: top.reason, reason: top.reason, chain: top.chain, effects: top.effects,
      severity: event.severity, directorId: event.id, location: replaySpotForDirectorKind(top.kind),
      dedupe: `director:${event.id}:${warning ? 'warning' : 'active'}`,
    });
    if (!warning) activateDirectorEvent(s, event, r);
  }
}

function activateDirectorEvent(s: SimulationState, event: DirectorEvent, r: Random) {
  if (s.satisfaction === undefined) s.satisfaction = 70;
  if (event.impact.addIncident && !s.incidents.some(incident => incident.kind === event.impact.addIncident && incident.until > s.minute)) {
    addIncident(s, event.impact.addIncident, r);
  }
  const budgetCost=s.snapshot.simulationMode?(s.snapshot.simulationIncidentCosts?.[event.kind]??0):(event.impact.budgetCost??0);
  if (budgetCost) charge(s, {at: s.minute, title: `${event.title}应急费用`, amount: budgetCost, category: 'incident', sourceId: `director-${event.id}`, eventId: [...(s.replay?.events ?? [])].reverse().find(entry => entry.directorId === event.id)?.id});
  if (event.impact.satisfactionOnActivation) s.satisfaction = clamp(s.satisfaction + event.impact.satisfactionOnActivation, 0, 100);
}

function activateDue(s: SimulationState, d: DirectorState, r: Random) {
  for (const event of d.events) {
    if (event.status === 'warning' && s.minute >= event.activeAt) {
      event.status = 'active';
      activateDirectorEvent(s, event, r);
      logReplay(s, {
        at: s.minute, kind: 'director', title: `预警升级 · ${event.title}`,
        detail: `预警窗口结束，事件进入进行中：${event.reason}`,
        reason: event.reason, chain: event.chain, effects: event.effects,
        severity: event.severity, directorId: event.id, location: replaySpotForDirectorKind(event.kind),
        dedupe: `director:${event.id}:active`,
      });
    }
  }
}

function expireDue(s: SimulationState, d: DirectorState) {
  for (const event of d.events) {
    if (event.status !== 'active' || s.minute < event.until) continue;
    event.status = 'resolved';
    const satisfaction = Math.round((s.satisfaction ?? 70) * 10) / 10;
    event.resolution = event.kind === 'positive'
      ? `正向链结束：当前满意度 ${satisfaction}/100，签到 ${s.served} 人，排队 ${s.queue} 人。`
      : `事件结束：签到 ${s.served} 人，排队 ${s.queue} 人，满意度 ${satisfaction}/100，应急支出 ¥${s.extraSpend}。`;
    if (event.kind === 'positive') d.positiveStreak += 1;
    logReplay(s, {
      at: s.minute, kind: 'director',
      title: `${event.kind === 'positive' ? '正向链结束' : '事件结束'} · ${event.title}`,
      detail: event.resolution, severity: event.severity, directorId: event.id,
      location: replaySpotForDirectorKind(event.kind), dedupe: `director:${event.id}:resolved`,
    });
  }
}

function updateSatisfaction(s: SimulationState, d: DirectorState) {
  const facility = s.snapshot.facility;
  const profile = difficultyProfile(s.snapshot.difficulty);
  const target = facility
    ? clamp(facility.comfort * .72 + facility.atmosphere * .16 + facility.safety * .12, 30, 92)
    : 70;
  let value = s.satisfaction ?? target;
  value += (target - value) * .018;
  value -= profile.satisfactionDrain;
  const queuePenalty = clamp(s.queue / Math.max(8, s.parameters.capacity * .1)) * .28;
  value -= queuePenalty;
  if (s.delay > 10) value -= Math.min(.18, s.delay / 150);
  for (const incident of s.incidents) if (incident.until > s.minute) value -= incident.kind === 'price' ? .04 : .08;
  for (const event of d.events) if (event.status === 'active') value += event.impact.satisfactionPerMinute ?? 0;
  if (s.weatherClosed) value -= .12;
  s.satisfaction = clamp(value, 0, 100);
}

export function advanceDirector(s: SimulationState, r: Random) {
  const facility = s.snapshot.facility;
  s.satisfaction ??= initialSatisfaction(facility);
  const d = s.director ??= initialDirector(s.parameters.seed, facility);
  const profile = difficultyProfile(s.snapshot.difficulty);
  let metrics = directorMetrics(s);
  if (s.minute >= d.nextReview) {
    d.metrics = metrics;
    const pendingCount = d.events.filter(event => event.status === 'warning' || event.status === 'active').length;
    const slots = Math.max(0, profile.maxActiveEvents - pendingCount);
    if (slots > 0) reviewDirector(s, d, r, metrics, slots, profile.directorScale);
    d.nextReview = s.minute + profile.reviewInterval;
    metrics = directorMetrics(s);
  }
  activateDue(s, d, r);
  expireDue(s, d);
  updateSatisfaction(s, d);
  d.metrics = directorMetrics(s);
}

export function directorServiceFactor(s: SimulationState): number {
  let factor = 1;
  for (const event of s.director?.events ?? []) if (event.status === 'active') factor *= event.impact.serviceFactor ?? 1;
  return clamp(factor, .3, 1.2);
}

export function directorDepartureFactor(s: SimulationState): number {
  const satisfaction = s.satisfaction ?? 70;
  let factor = satisfaction < 45 ? 1.4 : satisfaction > 78 ? .88 : 1;
  for (const event of s.director?.events ?? []) if (event.status === 'active') factor *= event.impact.departureFactor ?? 1;
  return clamp(factor, .6, 1.7);
}

function actionResolves(event: DirectorEvent, action: DirectorMitigation): boolean {
  if (event.mitigation === action) return true;
  if ((action === 'reserve' || action === 'capacity') && ['queue', 'crowd', 'staff'].includes(event.kind)) return true;
  if (action === 'reserve' && event.kind === 'program') return true;
  if ((action === 'shelter' || action === 'comfort') && ['weather', 'comfort'].includes(event.kind)) return true;
  if (action === 'spare' && event.kind === 'equipment') return true;
  if (action === 'medical' && event.kind === 'medical') return true;
  if (action === 'supply' && event.kind === 'medical') return true;
  return false;
}

/** Called after an intervention succeeds: prevention inside the warning window beats the incident. */
export function preventDirectorWarnings(s: SimulationState, action: DirectorMitigation): DirectorEvent[] {
  const d = s.director;
  if (!d) return [];
  const resolved: DirectorEvent[] = [];
  for (const event of d.events) {
    if (!actionResolves(event, action)) continue;
    if (event.status === 'warning') {
      event.status = 'prevented';
      event.until = s.minute;
      const minutes = Math.max(0, event.activeAt - s.minute);
      event.resolution = `在 ${Math.max(1, minutes)} 分钟预警窗口内以「${DIRECTOR_MITIGATION_LABELS[action]}」化解；未发生停摆，满意度 +2。`;
      d.lastTrigger[event.kind] = s.minute;
      logReplay(s, {
        at: s.minute, kind: 'action', title: `预警化解 · ${event.title}`,
        detail: event.resolution, reason: event.reason, severity: event.severity,
        directorId: event.id, location: replaySpotForDirectorKind(event.kind),
        dedupe: `director:${event.id}:prevented`,
      });
      resolved.push(event);
    } else if (event.status === 'active') {
      event.status = 'resolved';
      event.until = s.minute;
      event.resolution = `现场以「${DIRECTOR_MITIGATION_LABELS[action]}」响应，事件提前结束；当前排队 ${s.queue} 人，满意度 ${Math.round(s.satisfaction ?? 70)}/100。`;
      logReplay(s, {
        at: s.minute, kind: 'action', title: `现场响应 · ${event.title}`,
        detail: event.resolution, reason: event.reason, severity: event.severity,
        directorId: event.id, location: replaySpotForDirectorKind(event.kind),
        dedupe: `director:${event.id}:resolved`,
      });
      resolved.push(event);
    }
  }
  if (resolved.length) s.satisfaction = clamp((s.satisfaction ?? 70) + 2, 0, 100);
  return resolved;
}

export function syncDirectorMetrics(s: SimulationState) {
  if (s.director) s.director.metrics = directorMetrics(s);
}

export function directorWarnings(s: SimulationState | null | undefined): DirectorEvent[] {  return (s?.director?.events ?? []).filter(event => event.status === 'warning');
}

export function directorActiveEvents(s: SimulationState | null | undefined): DirectorEvent[] {
  return (s?.director?.events ?? []).filter(event => event.status === 'active');
}
