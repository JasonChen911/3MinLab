import type {ActivityPhase, FacilityOperation, SimulationState} from './model';
import type {Random} from './random';
import {addTransaction, syncSpend} from './ledger';
import {logReplay} from './replay';

const VENDOR_PRICE: Record<string, number> = {
  performance: 24, athletics: 16, sports: 16, conference: 18, business: 20,
  charity: 10, competition: 18, community: 14, custom: 16,
};

export function createOperations(s: SimulationState): FacilityOperation {
  const kinds = (s.snapshot.buildItems ?? []).map(item => item.kind);
  const count = (...names: string[]) => kinds.filter(kind => names.includes(kind)).length;
  const toilets = count('toilet');
  const vendors = count('tent', 'tentSmall');
  const bins = count('bin');
  const medicalPoints = count('medical');
  const restPoints = count('rest', 'bench');
  const security = s.snapshot.roles.find(role => role.name === '安保人员')?.count ?? 0;
  const staffOnDuty = Math.max(0, s.parameters.staff - s.missingStaff);
  return {
    toilets, toiletQueue: 0, toiletCapacity: toilets * 2.5 + .5, toiletWait: 0, toiletServed: 0,
    vendors, vendorQueue: 0, vendorServed: 0, vendorStock: vendors * 120, vendorCapacity: vendors * 6,
    waterPoints: toilets + count('service'), waterQueue: 0,
    bins, binFill: 0, cleanliness: bins ? .92 : .6,
    staffOnDuty, staffResting: restPoints ? Math.min(2, Math.floor(staffOnDuty * .08)) : 0,
    staffFatigue: .12,
    medicalPoints, medicalLoad: 0, medicalTreated: 0,
    security, securityCoverage: security ? Math.min(1, security / Math.max(1, s.snapshot.people / 220)) : .25,
  };
}

/**
 * Rebuild facility capacities from the edited layout while preserving accumulated
 * queues, sales, patients and fatigue. Without this, facilities added during a
 * pause would keep showing the capacity of the old layout.
 */
export function reconcileOperations(s: SimulationState): FacilityOperation {
  const previous = s.operations ?? createOperations(s);
  const fresh = createOperations(s);
  const addedVendors = Math.max(0, fresh.vendors - previous.vendors);
  return {
    ...previous,
    toilets: fresh.toilets,
    toiletCapacity: fresh.toiletCapacity,
    waterPoints: fresh.waterPoints,
    vendors: fresh.vendors,
    vendorCapacity: fresh.vendorCapacity,
    vendorStock: fresh.vendors === 0
      ? 0
      : Math.min(fresh.vendors * 120, Math.max(0, previous.vendorStock) + addedVendors * 120),
    bins: fresh.bins,
    medicalPoints: fresh.medicalPoints,
    staffOnDuty: fresh.staffOnDuty,
    staffResting: fresh.staffResting,
    security: fresh.security,
    securityCoverage: fresh.securityCoverage,
  };
}

function clamp(value: number, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

function facilityEvent(
  s: SimulationState, key: string, title: string, detail: string,
  tone: 'positive' | 'negative' | 'warning' | 'info',
  location: 'toilet' | 'vendor' | 'water' | 'bin' | 'medical' | 'rest' | 'venue',
  effects: string[], bucket: number = s.minute,
) {
  return logReplay(s, {
    at: s.minute, kind: 'facility', title, detail, tone, location,
    dedupe: `facility:${key}:${bucket}`, effects, status: '进行中',
  });
}

/** Facility risks are continuous states: log once on entry, then close the loop on recovery. */
function facilityRisk(
  s: SimulationState, key: string, title: string, detail: string,
  tone: 'positive' | 'negative' | 'warning' | 'info',
  location: 'toilet' | 'vendor' | 'water' | 'bin' | 'medical' | 'rest' | 'venue',
  effects: string[],
) {
  const active = s.replay?.events.some(event => event.status === '进行中' && event.dedupe?.startsWith(`facility:${key}:`));
  if (active) return null;
  return facilityEvent(s, key, title, detail, tone, location, effects);
}

function resolveFacilityRisk(
  s: SimulationState, key: string, title: string, detail: string,
  location: 'toilet' | 'vendor' | 'water' | 'bin' | 'medical' | 'rest' | 'venue',
  effects: string[] = [],
) {
  const active = s.replay?.events.find(event => event.status === '进行中' && event.dedupe?.startsWith(`facility:${key}:`));
  if (!active) return null;
  active.status = '已解除';
  return logReplay(s, {
    at: s.minute, kind: 'facility', tone: 'positive', title: `解除 · ${title}`, detail, location,
    dedupe: `facility:${key}:resolved:${s.minute}`, effects, status: '已恢复',
  });
}

/**
 * Minute-level facility operations. Demand scales with people actually inside the
 * venue; every sale and shortage writes a ledger line and a timeline event.
 */
export function stepOperations(s: SimulationState, random: Random) {
  const ops = s.operations ??= createOperations(s);
  const inside = Math.max(0, s.served - s.departed);
  const active = s.status === 'running';
  if (!active && inside <= 0) return;

  ops.toilets = ops.toilets || 0;
  const toiletDemand = inside * .022 + random.poisson(Math.max(0, inside * .008));
  ops.toiletQueue = Math.max(0, ops.toiletQueue + toiletDemand);
  const toiletServed = Math.min(ops.toiletQueue, ops.toiletCapacity);
  ops.toiletQueue = Math.max(0, Math.round((ops.toiletQueue - toiletServed) * 10) / 10);
  ops.toiletServed = Math.round(ops.toiletServed + toiletServed);
  ops.toiletWait = ops.toiletCapacity > .5 ? Math.round(ops.toiletQueue / ops.toiletCapacity * 10) / 10 : ops.toiletQueue;

  ops.waterQueue = Math.max(0, ops.waterQueue + inside * .016 + random.poisson(Math.max(0, inside * .004)));
  const waterServed = Math.min(ops.waterQueue, ops.waterPoints * 4 + .4);
  ops.waterQueue = Math.max(0, Math.round((ops.waterQueue - waterServed) * 10) / 10);

  const price = VENDOR_PRICE[s.snapshot.scene] ?? 16;
  const vendorDemand = ops.vendorQueue + inside * .013 + random.poisson(Math.max(0, inside * .003));
  ops.vendorQueue = Math.round(vendorDemand * 10) / 10;
  const sold = Math.max(0, Math.min(Math.floor(vendorDemand), ops.vendorCapacity, ops.vendorStock));
  if (sold > 0) {
    ops.vendorQueue = Math.max(0, Math.round((ops.vendorQueue - sold) * 10) / 10);
    ops.vendorStock -= sold;
    ops.vendorServed += sold;
    const revenue = sold * price;
    const cost = sold * Math.max(1, Math.round(price * .35));
    addTransaction(s, {
      at: s.minute, item: `餐饮摊位收入 · ${sold} 份`, amount: revenue, category: 'income',
      direction: 'income', note: `按每份 ¥${price} 的实际消费记录`, dedupe: `vendor:income:${s.minute}`, timeline: false,
    });
    addTransaction(s, {
      at: s.minute, item: `餐饮原料 · ${sold} 份`, amount: cost, category: 'food',
      direction: 'expense', note: '按售价 35% 的原料成本记录', dedupe: `vendor:cogs:${s.minute}`, timeline: false,
    });
    s.satisfaction = Math.min(100, (s.satisfaction ?? 70) + Math.min(.08, sold * .004));
  }
  if (ops.vendors > 0 && ops.vendorStock === 0 && !s.replay?.events.some(event => event.dedupe?.startsWith('facility:vendor-soldout'))) {
    facilityEvent(s, 'vendor-soldout', '餐饮摊位售罄', `备货已全部售出，晚到观众无法购买食品；本场累计售出 ${ops.vendorServed} 份。`, 'negative', 'vendor', ['食品供应中断', '满意度下降'], 0);
  }

  ops.binFill = Math.max(0, ops.binFill + sold * .03 + inside * .0015 - (ops.bins > 0 ? .012 : 0));
  if (ops.binFill > 1 && ops.bins > 0) {
    ops.binFill -= 1;
    ops.cleanliness = clamp(ops.cleanliness - .03);
    facilityEvent(s, 'bin-overflow', '垃圾桶已满', '保洁人员已完成一次清运，但高峰垃圾量仍接近上限。', 'warning', 'bin', ['清洁度下降', '需要增加垃圾桶或保洁班次'], Math.floor(s.minute / 30));
  } else if (ops.binFill < .5) {
    ops.cleanliness = clamp(ops.cleanliness + .006);
  }
  if (ops.bins === 0 && inside > 30) ops.cleanliness = clamp(ops.cleanliness - .01);

  const injury = s.incidents.some(incident => incident.until > s.minute) ? 1 : 0;
  const medicalDemand = injury * 2 + random.poisson(Math.max(0, inside * .0015));
  ops.medicalLoad = Math.max(0, ops.medicalLoad + medicalDemand);
  const treated = Math.min(ops.medicalLoad, ops.medicalPoints * 1.6);
  ops.medicalLoad = Math.max(0, Math.round((ops.medicalLoad - treated) * 10) / 10);
  ops.medicalTreated = Math.round(ops.medicalTreated + treated);
  if (ops.medicalPoints > 0 && ops.medicalTreated > 0 && s.minute > 0 && (s.minute === 1 || s.minute % 10 === 0)) {
    logReplay(s, {
      at: s.minute, kind: 'facility', tone: 'info', location: 'medical', title: '医疗点接诊汇总',
      detail: `${ops.medicalPoints} 个医疗点持续响应，累计接诊 ${ops.medicalTreated} 起，当前候诊 ${Math.round(ops.medicalLoad)} 人。`,
      dedupe: `facility:medical-summary:${s.minute}`, effects: ['现场医疗响应'],
    });
  }
  if (ops.medicalPoints > 0 && ops.medicalLoad > ops.medicalPoints * 2 + 1) {
    facilityRisk(s, 'medical-overload', '医疗点排队', `当前仍有 ${Math.round(ops.medicalLoad)} 人等待处置，建议增派医疗人员。`, 'negative', 'medical', ['满意度下降']);
  } else {
    resolveFacilityRisk(s, 'medical-overload', '医疗点排队', `候诊人数已回落到可控范围，当前 ${Math.round(ops.medicalLoad)} 人等待。`, 'medical');
  }

  const load = s.availableStaff > 0 ? s.assignedStaff / s.availableStaff : 0;
  const resting = Math.min(ops.staffOnDuty, ops.staffResting + (ops.cleanliness < .5 || ops.staffFatigue > .7 ? 1 : 0));
  ops.staffResting = resting;
  const restRecovery = (s.phase === 'intermission' || s.phase === 'ending' ? .012 : .003) * (resting > 0 ? 1 : .25);
  ops.staffFatigue = clamp(ops.staffFatigue + load * .006 + .0015 - restRecovery);
  if (ops.staffFatigue > .78) {
    facilityRisk(s, 'staff-fatigue', '工作人员疲劳累积', `值守负荷 ${Math.round(load * 100)}%，已有 ${resting} 人轮休；关键岗位需要换班。`, 'warning', 'rest', ['服务效率下降', '满意度下降']);
    s.satisfaction = Math.max(0, (s.satisfaction ?? 70) - .05);
  } else {
    resolveFacilityRisk(s, 'staff-fatigue', '工作人员疲劳累积', `轮休后疲劳降到 ${Math.round(ops.staffFatigue * 100)}%，服务效率恢复。`, 'rest');
  }

  if (ops.toiletQueue > 8) {
    facilityRisk(s, 'toilet-queue', '厕所排队', `${Math.round(ops.toiletQueue)} 人等待，预计 ${ops.toiletWait} 分钟；最近厕所已满负荷。`, 'warning', 'toilet', ['观众体验下降']);
    s.satisfaction = Math.max(0, (s.satisfaction ?? 70) - Math.min(.12, ops.toiletQueue * .004));
  } else {
    resolveFacilityRisk(s, 'toilet-queue', '厕所排队', `排队已降至 ${Math.round(ops.toiletQueue)} 人，如厕压力恢复。`, 'toilet');
  }
  if (ops.toilets === 0 && inside > 40) {
    facilityRisk(s, 'toilet-missing', '现场缺少厕所', '观众需要离场寻找卫生间，现场停留时间缩短。', 'negative', 'toilet', ['满意度下降']);
    s.satisfaction = Math.max(0, (s.satisfaction ?? 70) - .08);
  } else {
    resolveFacilityRisk(s, 'toilet-missing', '现场缺少厕所', ops.toilets > 0 ? `现场已有 ${ops.toilets} 处厕所投入使用。` : '现场人数已回落，如厕压力解除。', 'toilet');
  }
  if (ops.waterQueue > 6) {
    facilityRisk(s, 'water-queue', '饮水点排队', `${Math.round(ops.waterQueue)} 人等待补水，建议增设饮水点。`, 'warning', 'water', ['补水等待']);
    s.satisfaction = Math.max(0, (s.satisfaction ?? 70) - .04);
  } else {
    resolveFacilityRisk(s, 'water-queue', '饮水点排队', `饮水排队已降至 ${Math.round(ops.waterQueue)} 人。`, 'water');
  }
  if (ops.cleanliness < .45) {
    facilityRisk(s, 'cleanliness', '场地清洁度下降', `清洁度 ${Math.round(ops.cleanliness * 100)}%，垃圾清运不足。`, 'warning', 'bin', ['满意度下降']);
    s.satisfaction = Math.max(0, (s.satisfaction ?? 70) - .03);
  } else {
    resolveFacilityRisk(s, 'cleanliness', '场地清洁度下降', `清洁度恢复到 ${Math.round(ops.cleanliness * 100)}%。`, 'bin');
  }
  if (ops.securityCoverage < .5 && inside > 120) {
    facilityRisk(s, 'security', '安保覆盖不足', `现场 ${inside} 人，安保覆盖约 ${Math.round(ops.securityCoverage * 100)}%。`, 'warning', 'venue', ['秩序风险上升']);
    s.satisfaction = Math.max(0, (s.satisfaction ?? 70) - .03);
  } else {
    resolveFacilityRisk(s, 'security', '安保覆盖不足', `当前安保覆盖 ${Math.round(ops.securityCoverage * 100)}%，现场规模 ${inside} 人。`, 'venue');
  }

  s.satisfaction = clamp(s.satisfaction ?? 70, 0, 100);
  syncSpend(s);
}

export const PHASE_LABELS: Record<ActivityPhase, string> = {
  prep: '准备', entry: '入场', main: '主活动', intermission: '中场', ending: '收尾', cleanup: '清场',
};

export function phaseFor(s: SimulationState): ActivityPhase {
  if (s.status === 'finished') return 'cleanup';
  const done = s.tasks.filter(task => task.status === '已完成').length;
  const started = s.tasks.filter(task => task.status !== '等待').length;
  const active = s.tasks.filter(task => task.status === '进行中').length;
  if (done === s.tasks.length) return 'ending';
  // Delays push the ending window later, so a late-running programme is not
  // cut off as if it were on schedule.
  const plannedEnd = Math.max(20, s.snapshot.duration * .92) + Math.min(30, Math.max(0, s.delay) * 2);
  if (s.minute >= plannedEnd) return 'ending';
  if (active > 0) return 'main';
  if (started > 0) return 'intermission';
  if (s.served > 0) return 'entry';
  return 'prep';
}

export function syncPhase(s: SimulationState) {
  const next = phaseFor(s);
  if (s.phase === next) return;
  const previous = s.phase;
  s.phase = next;
  logReplay(s, {
    at: s.minute, kind: 'phase', tone: 'info', location: 'venue',
    title: `进入${PHASE_LABELS[next]}阶段`,
    detail: `${previous ? `由${PHASE_LABELS[previous]}转入；` : ''}到场 ${s.arrived} 人，签到 ${s.served} 人，完成任务 ${s.tasks.filter(task => task.status === '已完成').length}/${s.tasks.length}。`,
    reason: next === 'entry' ? '观众开始签到入场' : next === 'main' ? '主流程已开始' : next === 'intermission' ? '当前没有进行中的流程节点' : next === 'ending' ? '流程或时间接近结束' : next === 'cleanup' ? '活动结束，人员离场' : '活动尚未开始',
    dedupe: `phase:${next}`, status: '进行中',
  });
}