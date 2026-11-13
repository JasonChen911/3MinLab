import type {
  DirectorEvent, DirectorEventImpact, DirectorEventKind, DirectorMetrics, DirectorMitigation, DirectorState, Scene, SimulationState,
} from './model';
import type {FacilityMetrics} from '../facilities';
import {addIncident} from './hazards';
import type {Random} from './random';
import {logReplay, replaySpotForDirectorKind} from './replay';
import {addTransaction, syncSpend} from './ledger';
import {difficultyProfile} from '../difficulty';

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

export interface Candidate {
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

type SceneFamily = 'concert' | 'athletics' | 'market' | 'boardGame' | 'general';

function sceneFamily(scene: Scene): SceneFamily {
  if (scene === 'performance') return 'concert';
  if (scene === 'athletics' || scene === 'sports') return 'athletics';
  if (scene === 'business' || scene === 'charity' || scene === 'community') return 'market';
  if (scene === 'conference' || scene === 'competition') return 'boardGame';
  return 'general';
}

/**
 * Scene libraries: each candidate reads real facilities, operations and phase
 * state, so a concert audio gap, an athletics schedule slip, a market stockout
 * and a board-game table shortage only appear when their condition exists.
 */
export function sceneCandidates(s: SimulationState, d: DirectorState, m: DirectorMetrics): Candidate[] {
  const family = sceneFamily(s.snapshot.scene);
  const facility = s.snapshot.facility;
  const ops = s.operations;
  const list: Candidate[] = [];
  const ready = (cooldown: number, from: number) => !pending(d, 'program') && cooled(d, 'program', s.minute, cooldown) && s.minute >= from;

  if (family === 'concert' && ready(34, 10) && m.occupancy > 25 && m.progress > .08) {
    const audio = facility?.audioQuality ?? 0;
    if (audio < 60) {
      list.push({
        kind: 'program', title: '主舞台扩声覆盖不足',
        risk: clamp((60 - audio) / 60 * .68 + m.occupancy / 600),
        reason: `现场 ${m.occupancy} 人，扩声评分 ${audio}/100，设备 ${facility?.counts.equipment ?? 0} 件；后排观众听不清演出细节。`,
        chain: ['观众区扩大扩声未覆盖', '后排听感下降', '演出氛围不均衡', '满意度下降'],
        effects: ['满意度每分钟 -0.22', '离场速度 +6%'],
        mitigation: 'spare', impact: {satisfactionPerMinute: -.22, departureFactor: 1.06}, duration: 12, lead: 3,
      });
    }
  }

  if (family === 'athletics' && ready(28, 15) && m.progress > .1 && s.tasks.some(task => task.status === '进行中')) {
    const wet = s.snapshot.outdoor ? facility?.risks.weather ?? 0 : 0;
    if (wet > .35 || s.delay > 7) {
      list.push({
        kind: 'program', title: wet > .35 ? '跑道湿滑影响比赛' : '赛程进度落后',
        risk: clamp(Math.max(wet * .8, s.delay / 30)),
        reason: wet > .35
          ? `当前${facility?.weatherName ?? '天气'}，室外跑道湿滑风险 ${percent(wet)}；进行中环节 ${s.tasks.filter(task => task.status === '进行中').length} 项。`
          : `赛程已延误 ${Math.round(s.delay)} 分钟，进行中环节 ${s.tasks.filter(task => task.status === '进行中').length} 项，后续检录与颁奖时间被挤压。`,
        chain: wet > .35
          ? ['降雨降低跑道抓地力', '运动员减速', '成绩与赛程受影响', '观众等待延长']
          : ['前一环节超出计划用时', '后续项目顺延', '观众等待延长', '满意度下降'],
        effects: wet > .35 ? ['满意度每分钟 -0.2', '离场速度 +5%'] : ['满意度每分钟 -0.15', '后续任务开始时间顺延'],
        mitigation: wet > .35 ? 'shelter' : 'reserve',
        impact: {satisfactionPerMinute: wet > .35 ? -.2 : -.15, departureFactor: 1.05}, duration: 12, lead: 3,
      });
    }
  }

  if (family === 'market' && ops && ready(26, 12) && m.occupancy > 18) {
    if (ops.vendors > 0 && ops.vendorStock <= ops.vendors * 24) {
      list.push({
        kind: 'program', title: '摊位备货接近售罄',
        risk: clamp(.4 + (1 - clamp(ops.vendorStock / Math.max(1, ops.vendors * 120))) * .4),
        reason: `${ops.vendors} 个摊位仅剩 ${ops.vendorStock} 份备货，已售 ${ops.vendorServed} 份；场内 ${m.occupancy} 人仍有购买需求。`,
        chain: ['客流高于备货预估', '摊位库存见底', '晚到观众买不到食品', '满意度下降'],
        effects: ['食品供应紧张', '满意度每分钟 -0.24'],
        mitigation: 'supply', impact: {satisfactionPerMinute: -.24}, duration: 14, lead: 2,
      });
    } else if (ops.cleanliness < .55 || ops.bins === 0) {
      list.push({
        kind: 'program', title: '餐饮区卫生压力',
        risk: clamp(.38 + (1 - ops.cleanliness) * .45),
        reason: `现场清洁度 ${Math.round(ops.cleanliness * 100)}%，垃圾桶 ${ops.bins} 个，${ops.vendors} 个摊位持续产生包装垃圾。`,
        chain: ['餐饮包装垃圾增加', '清运能力不足', '用餐区卫生下降', '观众体验与食品安全承压'],
        effects: ['满意度每分钟 -0.2', '清洁度继续下降'],
        mitigation: 'comfort', impact: {satisfactionPerMinute: -.2}, duration: 16, lead: 3,
      });
    }
  }

  if (family === 'boardGame' && facility && ready(30, 12) && m.occupancy > 12) {
    const seats = Math.round(facility.seating);
    if (seats < m.occupancy * .6) {
      list.push({
        kind: 'program', title: '对局桌位不足',
        risk: clamp((1 - seats / Math.max(1, m.occupancy * .6)) * .7 + m.capacityUse * .15),
        reason: `现场 ${m.occupancy} 人，桌位仅 ${seats} 个；${Math.max(0, m.occupancy - seats)} 人需要等待空桌。`,
        chain: ['参与者超过桌位数量', '对局轮换等待', '单局时间被压缩', '参与体验下降'],
        effects: ['满意度每分钟 -0.2', '离场速度 +5%'],
        mitigation: 'capacity', impact: {satisfactionPerMinute: -.2, departureFactor: 1.05}, duration: 14, lead: 2,
      });
    } else if (s.delay > 6) {
      list.push({
        kind: 'program', title: '对局与议程超时',
        risk: clamp(s.delay / 28),
        reason: `当前环节已比计划延误 ${Math.round(s.delay)} 分钟，进行中环节 ${s.tasks.filter(task => task.status === '进行中').length} 项。`,
        chain: ['单局用时长于计划', '后续轮次顺延', '现场节奏拖慢', '满意度下降'],
        effects: ['满意度每分钟 -0.14', '后续环节开始时间顺延'],
        mitigation: 'reserve', impact: {satisfactionPerMinute: -.14}, duration: 10, lead: 2,
      });
    }
  }

  return list;
}

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
      kind: 'equipment', title: '演出设备风险升高', risk,
      reason: `设备质量评分 ${Math.round(facility?.equipmentQuality ?? 0)}/100，${facility?.weatherName}，受损设施 ${facility?.damagedItems ?? 0} 项；设备任务 ${s.tasks.filter(task => task.equipment && task.status === '进行中').length} 项正在进行。`,
      chain: ['设备暴露在天气与负载中', '备用设备尚未启用', '演出/流程可能中断', '满意度下降'],
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

  list.push(...sceneCandidates(s, d, m));

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
      tone: warning ? 'warning' : top.kind === 'positive' ? 'positive' : 'negative',
      title: warning ? `预警 · ${top.title}` : `事件 · ${top.title}`,
      detail: top.reason, reason: top.reason, chain: top.chain, effects: top.effects,
      severity: event.severity, directorId: event.id, location: replaySpotForDirectorKind(top.kind),
      dedupe: `director:${event.id}:${warning ? 'warning' : 'active'}`, status: event.status,
      targets: top.effects,
    });
    if (!warning) activateDirectorEvent(s, event, r);
  }
}

function activateDirectorEvent(s: SimulationState, event: DirectorEvent, r: Random) {
  if (s.satisfaction === undefined) s.satisfaction = 70;
  if (event.impact.addIncident && !s.incidents.some(incident => incident.kind === event.impact.addIncident && incident.until > s.minute)) {
    addIncident(s, event.impact.addIncident, r);
  }
  if (event.impact.budgetCost) {
    addTransaction(s, {
      at: s.minute, item: `事件处置 · ${event.title}`, amount: event.impact.budgetCost, category: 'emergency',
      direction: 'expense', note: event.reason, dedupe: `director:tx:${event.id}`, timeline: false,
    });
    syncSpend(s);
  }
  if (event.impact.satisfactionOnActivation) s.satisfaction = clamp(s.satisfaction + event.impact.satisfactionOnActivation, 0, 100);
}

function activateDue(s: SimulationState, d: DirectorState, r: Random) {
  for (const event of d.events) {
    if (event.status === 'warning' && s.minute >= event.activeAt) {
      event.status = 'active';
      activateDirectorEvent(s, event, r);
      logReplay(s, {
        at: s.minute, kind: 'director',
        tone: event.kind === 'positive' ? 'positive' : event.kind === 'comfort' ? 'warning' : 'negative',
        title: `预警升级 · ${event.title}`,
        detail: `预警窗口结束，事件进入进行中：${event.reason}`,
        reason: event.reason, chain: event.chain, effects: event.effects,
        severity: event.severity, directorId: event.id, location: replaySpotForDirectorKind(event.kind),
        dedupe: `director:${event.id}:active`, status: '进行中',
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
      at: s.minute, kind: 'director', tone: event.kind === 'positive' ? 'positive' : 'info',
      title: `${event.kind === 'positive' ? '正向链结束' : '事件结束'} · ${event.title}`,
      detail: event.resolution, severity: event.severity, directorId: event.id,
      location: replaySpotForDirectorKind(event.kind), dedupe: `director:${event.id}:resolved`,
      status: '已结束', effects: event.effects,
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
        at: s.minute, kind: 'action', tone: 'action', title: `预警化解 · ${event.title}`,
        detail: event.resolution, reason: event.reason, severity: event.severity,
        directorId: event.id, location: replaySpotForDirectorKind(event.kind),
        dedupe: `director:${event.id}:prevented`, status: '已化解',
      });
      resolved.push(event);
    } else if (event.status === 'active') {
      event.status = 'resolved';
      event.until = s.minute;
      event.resolution = `现场以「${DIRECTOR_MITIGATION_LABELS[action]}」响应，事件提前结束；当前排队 ${s.queue} 人，满意度 ${Math.round(s.satisfaction ?? 70)}/100。`;
      logReplay(s, {
        at: s.minute, kind: 'action', tone: 'action', title: `现场响应 · ${event.title}`,
        detail: event.resolution, reason: event.reason, severity: event.severity,
        directorId: event.id, location: replaySpotForDirectorKind(event.kind),
        dedupe: `director:${event.id}:resolved`, status: '已响应',
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
