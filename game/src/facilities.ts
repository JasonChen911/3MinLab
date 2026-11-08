import {facilityParameters, type Facility, type Item, type Kind, type Layout, type WeatherKind} from './game';
import {weatherProfile} from './world/weather';

export type FacilityRole =
  | 'stage' | 'seating' | 'entry' | 'checkin' | 'service' | 'rest' | 'medical' | 'sanitation'
  | 'equipment' | 'shelter' | 'circulation' | 'barrier' | 'storage' | 'vendor' | 'decor' | 'landmark';

export const FACILITY_ROLE_LABELS: Record<FacilityRole, string> = {
  stage: '活动核心', seating: '观众承载', entry: '入场通行', checkin: '签到服务', service: '现场服务',
  rest: '休息恢复', medical: '医疗安全', sanitation: '卫生保障', equipment: '演出设备', shelter: '遮雨防晒',
  circulation: '通行效率', barrier: '安全隔离', storage: '物资仓储', vendor: '摊位经营', decor: '环境氛围', landmark: '景观地标',
};

export interface FacilityImpact {
  role: FacilityRole;
  /** 每份基础容量对应的服务人流量（人/服务周期）。 */
  throughput: number;
  /** 每个基础容量单位提供多少座位。 */
  seating: number;
  comfort: number;
  safety: number;
  sightline: number;
  shelter: number;
  rest: number;
  sanitation: number;
  medical: number;
  vendor: number;
  ambience: number;
  equipment: number;
  shade: number;
  wayfinding: number;
  circulation: number;
  /** 操作该设施所需的现场人力。 */
  staffNeed: number;
  /** 产生空间影响的有效半径（米）。 */
  radius: number;
  anchor: boolean;
  weatherSensitive: boolean;
  effectText: string;
}

const BASE: FacilityImpact = {
  role: 'decor', throughput: 0, seating: 0, comfort: 0, safety: 0, sightline: 0, shelter: 0, rest: 0,
  sanitation: 0, medical: 0, vendor: 0, ambience: 0, equipment: 0, shade: 0, wayfinding: 0, circulation: 0,
  staffNeed: 0, radius: 0, anchor: false, weatherSensitive: false, effectText: '现场装饰，不直接参与活动流程。',
};

const IMPACTS: Partial<Record<Kind, Partial<FacilityImpact>>> = {
  stage: {role: 'stage', sightline: .78, ambience: .8, staffNeed: 3, radius: 24, effectText: '主活动承载：演员上下台、主持与演出，半径内观众可获得视线与氛围加成。'},
  stageSmall: {role: 'stage', sightline: .52, ambience: .5, staffNeed: 2, radius: 18, effectText: '小型活动核心，适合发言和短节目，容量与氛围加成较低。'},
  stageLarge: {role: 'stage', sightline: .95, ambience: .95, staffNeed: 4, radius: 32, effectText: '大型活动核心，视线与氛围覆盖范围最大，同时需要更多工作人员。'},
  podium: {role: 'stage', sightline: .38, ambience: .2, staffNeed: 1, radius: 12, effectText: '会议与发言核心，提供局部视线焦点。'},
  backdrop: {role: 'stage', sightline: .24, ambience: .2, radius: 10, effectText: '补充舞台视觉背景，提升活动完成度。'},
  chair: {role: 'seating', seating: 1, comfort: .14, sightline: .05, radius: 3, effectText: '每套桌椅提供 8 个座位，靠近舞台的座位视线更好。'},
  bleachers: {role: 'seating', seating: 1, comfort: .1, sightline: .3, radius: 30, effectText: '阶梯看台提供大量座位，远距离也能保持较好视线。'},
  tent: {role: 'shelter', seating: .8, comfort: .14, shelter: 1, vendor: 1, anchor: true, weatherSensitive: true, radius: 12, effectText: '提供遮雨与摊位功能；未固定时大风会降低有效容量。'},
  tentSmall: {role: 'shelter', seating: .5, comfort: .08, shelter: .55, vendor: 1, anchor: true, weatherSensitive: true, radius: 8, effectText: '小型遮雨点与摊位，适合分散布置在等候区。'},
  speaker: {role: 'equipment', equipment: 1, ambience: .2, staffNeed: .25, radius: 22, weatherSensitive: true, effectText: '扩声设备，距离舞台 22 米内才计入有效扩声覆盖。'},
  light: {role: 'equipment', equipment: .7, ambience: .3, staffNeed: .2, radius: 18, weatherSensitive: true, effectText: '舞台照明，距离舞台 18 米内提升演出氛围。'},
  screen: {role: 'equipment', equipment: .5, sightline: .2, ambience: .1, radius: 20, weatherSensitive: true, effectText: '显示屏补充视线与信息传达，暴雨中可用性下降。'},
  checkin: {role: 'checkin', throughput: 1, staffNeed: .5, wayfinding: .2, radius: 10, effectText: '每台签到能力为 2 个服务位，直接决定入场吞吐与排队压力。'},
  checkinSmall: {role: 'checkin', throughput: 1, staffNeed: .4, wayfinding: .1, radius: 8, effectText: '1 个服务位的小型签到台，适合低客流入口。'},
  checkinLarge: {role: 'checkin', throughput: 1, staffNeed: .7, wayfinding: .25, radius: 12, effectText: '4 个服务位的大型签到台，是缓解排队的主要设施。'},
  service: {role: 'service', throughput: .5, comfort: .05, staffNeed: .5, wayfinding: .3, radius: 8, effectText: '咨询与引导服务点，提升寻路体验和满意度。'},
  rest: {role: 'rest', rest: 6, comfort: .25, staffNeed: .2, radius: 6, effectText: '每个休息区可容纳 6 名工作人员轮休，降低疲劳风险。'},
  fence: {role: 'barrier', safety: .1, radius: 4, effectText: '隔离危险区域与排队区，改善现场安全。'},
  entrance: {role: 'entry', throughput: 1, safety: .1, wayfinding: .2, radius: 12, effectText: '每个出入口提供 2 条入场通道，决定入场峰值能力。'},
  medical: {role: 'medical', safety: .8, medical: 1, staffNeed: 1, radius: 30, effectText: '医疗驻守点，覆盖半径内的人群；缺失会提高医疗风险。'},
  toilet: {role: 'sanitation', sanitation: 60, comfort: .05, radius: 20, effectText: '每个厕所可支撑约 60 人的卫生需求。'},
  bin: {role: 'sanitation', sanitation: 15, comfort: .02, radius: 6, effectText: '维护场地卫生，小范围提升舒适度。'},
  storage: {role: 'storage', safety: .05, staffNeed: .1, radius: 6, effectText: '存放物资与应急设备，提高现场保障能力。'},
  road: {role: 'circulation', circulation: 4, radius: 0, effectText: '主干道提高入场与疏散通行能力。'},
  roadCurve: {role: 'circulation', circulation: 4, radius: 0, effectText: '连接主干道，保持人车流线连续。'},
  path: {role: 'circulation', circulation: 2, radius: 0, effectText: '人行小路改善步行连通性。'},
  tree: {role: 'decor', ambience: .16, shade: .3, comfort: .05, radius: 6, effectText: '提供树荫与景观层次，改善户外等候舒适度。'},
  flower: {role: 'decor', ambience: .2, comfort: .02, radius: 4, effectText: '花坛提升入口与活动区氛围。'},
  bush: {role: 'decor', ambience: .1, shade: .1, radius: 3, effectText: '低矮绿化，轻度提升氛围。'},
  planter: {role: 'decor', ambience: .12, radius: 3, effectText: '盆栽改善近人尺度环境。'},
  lamp: {role: 'decor', ambience: .16, safety: .06, radius: 8, effectText: '路灯提升夜间可见度与安全感。'},
  sign: {role: 'decor', wayfinding: .25, safety: .04, radius: 8, effectText: '指示牌改善寻路，减少无效走动。'},
  bench: {role: 'rest', rest: 2, comfort: .09, radius: 4, effectText: '长椅提供观众与工作人员短时休息。'},
  fountain: {role: 'landmark', ambience: .6, comfort: .03, radius: 14, effectText: '喷泉作为景观中心，提升场地辨识度与氛围。'},
};

const cache = new Map<Kind, FacilityImpact>();

export function facilityImpact(kind: Kind): FacilityImpact {
  const cached = cache.get(kind);
  if (cached) return cached;
  const next = {...BASE, ...(IMPACTS[kind] ?? {})};
  cache.set(kind, next);
  return next;
}

export interface FacilityScoreSet {
  comfort: number;
  safety: number;
  sightline: number;
  service: number;
  atmosphere: number;
  resilience: number;
  staffing: number;
}

export interface FacilityRiskSet {
  queue: number;
  crowd: number;
  weather: number;
  medical: number;
  fatigue: number;
  equipment: number;
  comfort: number;
}

export interface FacilityMetrics {
  schema: 1;
  weather: WeatherKind;
  weatherName: string;
  outdoor: boolean;
  counts: Record<FacilityRole, number>;
  entrancePoints: number;
  checkinDesks: number;
  checkinThroughput: number;
  circulation: number;
  seating: number;
  shelter: number;
  shelterCoverage: number;
  restBays: number;
  medicalUnits: number;
  sanitation: number;
  vendorPoints: number;
  toiletServicePerMinute?: number;
  vendorServicePerMinute?: number;
  storageUnits: number;
  stageQuality: number;
  audioQuality: number;
  lightingQuality: number;
  screenQuality: number;
  sightline: number;
  comfort: number;
  safety: number;
  accessibility: number;
  atmosphere: number;
  equipmentQuality: number;
  staffDemand: number;
  looseTents: number;
  damagedItems: number;
  scores: FacilityScoreSet;
  risks: FacilityRiskSet;
  strengths: string[];
  warnings: string[];
  summary: string;
}

const clamp = (value: number, min = 0, max = 1) => Math.max(min, Math.min(max, value));
const round = (value: number) => Math.round(value * 1000) / 1000;
const seatsOf = (item: Item, catalog: Record<Kind, Facility>, realMode=false) => Math.max(0, ((realMode?item.parameters?.capacity:undefined) ?? catalog[item.kind].capacity ?? 0) * Math.pow(item.scale ?? 1, 2));
const distance = (a: Item, b: Item) => Math.hypot(a.x - b.x, a.z - b.z);
const STAGES: Kind[] = ['stage', 'stageSmall', 'stageLarge', 'podium'];

function emptyCounts(): Record<FacilityRole, number> {
  return {stage: 0, seating: 0, entry: 0, checkin: 0, service: 0, rest: 0, medical: 0, sanitation: 0,
    equipment: 0, shelter: 0, circulation: 0, barrier: 0, storage: 0, vendor: 0, decor: 0, landmark: 0};
}

/**
 * Real geometry + catalog based analysis. Every number comes from placed items,
 * venue capacity, staffing and weather; nothing here is sampled.
 */
export function analyzeFacilities(layout: Layout, catalog: Record<Kind, Facility>): FacilityMetrics {
  const people = Math.max(1, layout.activity.people);
  const staff = Math.max(0, layout.params.staff) + Math.max(0, layout.volunteers ?? 0);
  const weather = weatherProfile(layout.weather as WeatherKind | undefined);
  const outdoor = !layout.indoor;
  const counts = emptyCounts();
  let entrancePoints = 0, checkinDesks = 0, circulation = 0, seating = 0, shelter = 0;
  let restBays = 0, medicalUnits = 0, sanitation = 0, vendorPoints = 0, storageUnits = 0;
  let toiletServicePerMinute = 0, vendorServicePerMinute = 0;
  let ambienceRaw = 0, shade = 0, wayfinding = 0, staffDemand = 0;
  let looseTents = 0, damagedItems = 0;
  let fenceCount = 0;
  const equipmentItems: Item[] = [];

  for (const item of layout.items) {
    const impact = facilityImpact(item.kind), info = catalog[item.kind], scale = Math.pow(item.scale ?? 1, 2), configured = layout.operatingMode === 'simulation' ? facilityParameters(item) : null;
    const condition = item.damaged ? .45 : 1;
    counts[impact.role] += 1;
    if (item.damaged) damagedItems += 1;
    if (impact.role === 'entry') entrancePoints += Math.max(1, (configured?.capacity ?? info.capacity ?? 1) * scale) * condition;
    if (impact.role === 'checkin') checkinDesks += Math.max(.5, (configured?.servicePerMinute ?? (info.capacity ?? 1) * layout.params.serviceRate) / Math.max(.1, layout.params.serviceRate) * scale) * condition;
    if (impact.role === 'seating') {
      let value = seatsOf(item, catalog, layout.operatingMode==='simulation') * impact.seating * condition;
      if (outdoor && (info.capacity ?? 0) > 0 && weather.tentRisk > .3 && !item.anchored && (item.kind === 'tent' || item.kind === 'tentSmall')) value *= .35;
      seating += value;
    }
    if (impact.shelter) {
      shelter += seatsOf(item, catalog, layout.operatingMode==='simulation') * impact.shelter * condition;
      if (outdoor && weather.tentRisk > .3 && !item.anchored) looseTents += 1;
    }
    if (impact.role === 'rest') restBays += (configured?.capacity ?? impact.rest) * scale * condition;
    if (impact.medical) medicalUnits += impact.medical * scale * condition;
    if (impact.sanitation) sanitation += (configured?.capacity ?? impact.sanitation / 15) * 15 * scale * condition;
    if (item.kind === 'toilet') toiletServicePerMinute += (configured?.servicePerMinute ?? 2.4) * scale * condition;
    if (impact.vendor) {vendorPoints += impact.vendor * scale * condition;vendorServicePerMinute += (configured?.servicePerMinute ?? 1.6) * scale * condition;}
    if (impact.role === 'storage') storageUnits += scale;
    if (impact.role === 'barrier') fenceCount += 1;
    circulation += impact.circulation * scale;
    ambienceRaw += impact.ambience * scale * condition;
    shade += impact.shade * scale;
    wayfinding += impact.wayfinding * scale;
    staffDemand += (layout.operatingMode==='simulation'?(item.parameters?.staffNeed??impact.staffNeed):impact.staffNeed) * scale;
    if (impact.role === 'equipment') equipmentItems.push(item);
  }

  const stage = layout.items.find(item => STAGES.includes(item.kind) && !item.damaged);
  const stageInfo = stage ? facilityImpact(stage.kind) : null;
  const stageBase = !stage ? 0 : stage.kind === 'stageLarge' ? 90 : stage.kind === 'stage' ? 74 : stage.kind === 'stageSmall' ? 55 : 42;
  const near = (item: Item, radius: number) => !stage || distance(item, stage) <= radius;
  const effective = (kind: Kind) => equipmentItems.filter(item => item.kind === kind && near(item, layout.operatingMode==='simulation'?(item.parameters?.radius??facilityImpact(kind).radius):facilityImpact(kind).radius));
  const speakers = effective('speaker'), lights = effective('light'), screens = effective('screen');
  const audioQuality = stage ? clamp(speakers.length * 32, 0, 100) : Math.min(45, speakers.length * 15);
  const lightingQuality = clamp(lights.length * 28, 0, 100);
  const screenQuality = clamp(screens.length * 30, 0, 100);
  const equipmentQuality = clamp(
    equipmentItems.reduce((score, item) => score + facilityImpact(item.kind).equipment * (item.damaged ? .4 : 1) * (near(item, facilityImpact(item.kind).radius) ? 1 : .35), 0) * 55 + (stage ? 18 : 0),
    0, 100);
  const stageQuality = stage ? clamp(stageBase + audioQuality * .12 + lightingQuality * .08 + screenQuality * .05, 0, 100) : 0;

  const seatItems = layout.items.filter(item => ['chair', 'bleachers'].includes(item.kind));
  const seatDistance = stage && seatItems.length
    ? seatItems.reduce((total, item) => total + distance(item, stage) * seatsOf(item, catalog, layout.operatingMode==='simulation'), 0) / Math.max(1, seatItems.reduce((n, item) => n + seatsOf(item, catalog, layout.operatingMode==='simulation'), 0))
    : 0;
  const sightline = stage
    ? clamp(stageBase * .48 + screenQuality * .12 + clamp(100 - seatDistance * 1.7, 0, 100) * .4, 0, 100)
    : seatItems.length ? 25 : 0;

  const entranceDistances = checkinDesks && counts.entry
    ? layout.items.filter(item => facilityImpact(item.kind).role === 'entry').map(entry => Math.min(...layout.items.filter(item => facilityImpact(item.kind).role === 'checkin').map(desk => distance(entry, desk))))
    : [];
  const entryDistanceScore = entranceDistances.length ? clamp(100 - entranceDistances.reduce((a, b) => a + b, 0) / entranceDistances.length * 3.2, 0, 100) : 35;
  const accessibility = clamp(entrancePoints * 12 + checkinDesks * 7 + circulation * 1.8 + wayfinding * 18 + entryDistanceScore * .18 + (layout.indoor ? 8 : 0), 0, 100);

  const weatherComfort = layout.indoor ? Math.min(.98, weather.comfort + .22) : weather.comfort;
  const shelterCoverage = layout.indoor ? 1 : clamp(shelter / Math.max(1, people * .6), 0, 1);
  const seatCoverage = clamp(seating / people, 0, 1);
  const sanitationCoverage = clamp(sanitation / Math.max(1, people * .35), 0, 1);
  const shadeCoverage = clamp(shade / Math.max(1, people * .06), 0, 1);
  const comfort = clamp(Math.round(weatherComfort * 38 + shelterCoverage * 18 + seatCoverage * 14 + sanitationCoverage * 10 + shadeCoverage * 8 + Math.min(1, ambienceRaw / 12) * 7 + (layout.indoor ? 5 : 0)), 0, 100);
  const atmosphere = clamp(Math.round(8 + stageQuality * .26 + audioQuality * .14 + lightingQuality * .1 + screenQuality * .07 + Math.min(1, ambienceRaw / 8) * 22 + weatherComfort * 8), 0, 100);
  const safety = clamp(Math.round(18 + entrancePoints * 11 + medicalUnits * 20 + fenceCount * 2 + clamp((layout.size * layout.size / people - 10) * 1.4, 0, 24) + (layout.indoor ? 5 : 0) - damagedItems * 2), 0, 100);
  const checkinThroughput = checkinDesks * 1.2;
  const checkinStaff = Math.max(1, layout.params.checkinStaff);
  const expectedQueueMinutes = people / Math.max(1, checkinThroughput * checkinStaff);
  const resilience = clamp(Math.round((1 - clamp(weather.tentRisk * (outdoor ? 1 : .15), 0, 1)) * 38 + equipmentQuality * .34 + shelterCoverage * 18 + safety * .1), 0, 100);
  const staffing = clamp(Math.round(staff / Math.max(1, staffDemand) * 70), 0, 100);

  const queueRisk = clamp((expectedQueueMinutes - 8) / 40);
  const crowdRisk = clamp((people / Math.max(1, layout.params.capacity) - .7) / .3);
  const weatherRisk = outdoor ? clamp(weather.tentRisk * .9 + looseTents * .06 + (1 - shelterCoverage) * weather.tentRisk * .5 + (weather.rain > .5 || weather.wind > .8 ? .12 : 0)) : .04;
  const medicalRisk = clamp(people / 600 - medicalUnits * .22 - .12, 0, .95);
  const fatigueRisk = clamp(1 - staff / Math.max(1, staffDemand) * .72, 0, .95);
  const equipmentRisk = clamp((1 - equipmentQuality / 100) * .8 + (outdoor ? weather.rain * .28 + weather.wind * .16 : 0) + damagedItems * .04, 0, .95);
  const comfortRisk = clamp(1 - comfort / 100);

  const service = clamp(Math.round(checkinDesks * 18 + entrancePoints * 8 + circulation * 1.4 + wayfinding * 10 + (1 - queueRisk) * 22 + entryDistanceScore * .12), 0, 100);
  const scores: FacilityScoreSet = {comfort, safety, sightline: Math.round(sightline), service, atmosphere, resilience, staffing};
  const risks: FacilityRiskSet = {queue: queueRisk, crowd: crowdRisk, weather: weatherRisk, medical: medicalRisk, fatigue: fatigueRisk, equipment: equipmentRisk, comfort: comfortRisk};

  const warnings: string[] = [];
  const strengths: string[] = [];
  if (!counts.entry) warnings.push('缺少出入口：人员无法按流线入场');
  else if (entrancePoints < Math.ceil(people / 220)) warnings.push(`出入口仅 ${Math.round(entrancePoints)} 条通道，低于 ${people} 人的建议入场能力`);
  if (!checkinDesks) warnings.push('缺少签到台：入场服务无法开展');
  else if (queueRisk > .42) warnings.push(`签到预计需 ${Math.round(expectedQueueMinutes)} 分钟才能消化客流，建议增开签到台或人员`);
  if (seating < people * .55 && ['performance', 'conference', 'business', 'competition', 'athletics', 'sports'].includes(layout.activity.scene)) warnings.push(`座位 ${Math.round(seating)} 个，仅覆盖 ${Math.round(seating / people * 100)}% 的参与人数`);
  if (!medicalUnits && people >= 60) warnings.push('没有医疗点：中大型活动缺少现场医疗覆盖');
  if (sanitation < people * .3) warnings.push(`卫生设施仅支撑约 ${Math.round(sanitation)} 人，低于现场人数`);
  if (restBays < Math.ceil(staff / 10)) warnings.push(`休息区仅 ${Math.round(restBays)} 个工位，${Math.round(staff)} 名工作人员轮休不足`);
  if (stage && !speakers.length && equipmentItems.some(item => item.kind === 'speaker')) warnings.push('音响距离舞台超过有效半径，扩声不计入演出质量');
  if (stage && !equipmentItems.some(item => item.kind === 'speaker')) warnings.push('主舞台没有扩声设备，演出氛围与远区听感下降');
  if (looseTents && weather.tentRisk > .25) warnings.push(`${looseTents} 个帐篷未固定，${weather.name}中有效遮雨容量下降`);
  if (outdoor && weather.rain > .5 && shelterCoverage < .35) warnings.push(`${weather.name}下遮雨覆盖仅 ${Math.round(shelterCoverage * 100)}%，等候区舒适度不足`);
  if (equipmentRisk > .58) warnings.push('设备受天气或损坏影响，故障风险偏高');
  if (comfort < 48) warnings.push(`现场舒适度 ${comfort}/100，休息、遮雨或卫生设施不足`);

  if (counts.entry && queueRisk < .22) strengths.push(`入场吞吐充足（约 ${Math.round(expectedQueueMinutes)} 分钟消化客流）`);
  if (seating >= people * .85) strengths.push(`座位覆盖 ${Math.round(seating / people * 100)}% 的参与人数`);
  if (medicalUnits > 0) strengths.push(`医疗点覆盖半径 ${facilityImpact('medical').radius} 米`);
  if (shelterCoverage > .5) strengths.push(`遮雨覆盖 ${Math.round(shelterCoverage * 100)}% 的目标人群`);
  if (stage && audioQuality >= 55) strengths.push('扩声覆盖主舞台与观众区');
  if (sightline >= 65) strengths.push(`观众视线评分 ${Math.round(sightline)}/100`);
  if (comfort >= 70) strengths.push(`现场舒适度 ${comfort}/100`);
  if (circulation >= 20) strengths.push(`道路与步道提供 ${Math.round(circulation)} 点通行能力`);
  if (atmosphere >= 65) strengths.push(`活动氛围评分 ${atmosphere}/100`);

  return {
    schema: 1, weather: (layout.weather ?? 'sunny') as WeatherKind, weatherName: weather.name, outdoor, counts,
    entrancePoints: round(entrancePoints), checkinDesks: round(checkinDesks), checkinThroughput: round(checkinThroughput),
    circulation: round(circulation), seating: Math.round(seating), shelter: Math.round(shelter), shelterCoverage: round(shelterCoverage),
    restBays: Math.round(restBays), medicalUnits: round(medicalUnits), sanitation: Math.round(sanitation), vendorPoints: Math.round(vendorPoints),
    toiletServicePerMinute:round(toiletServicePerMinute),vendorServicePerMinute:round(vendorServicePerMinute),
    storageUnits: Math.round(storageUnits), stageQuality: Math.round(stageQuality), audioQuality: Math.round(audioQuality),
    lightingQuality: Math.round(lightingQuality), screenQuality: Math.round(screenQuality), sightline: Math.round(sightline),
    comfort, safety, accessibility: Math.round(accessibility), atmosphere, equipmentQuality: Math.round(equipmentQuality),
    staffDemand: round(staffDemand), looseTents, damagedItems,
    scores, risks, strengths, warnings,
    summary: `签到 ${Math.round(checkinDesks)} 台 · 入口 ${Math.round(entrancePoints)} 条 · 座位 ${Math.round(seating)} · 遮雨 ${Math.round(shelterCoverage * 100)}% · 医疗 ${Math.round(medicalUnits)} · 舒适 ${comfort}`,
  };
}

export function facilitySummary(metrics: FacilityMetrics | undefined): string {
  if (!metrics) return '尚未开始模拟：设施影响将在开始后计入真实模型。';
  return metrics.summary;
}
