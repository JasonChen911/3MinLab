import type {Layout, WeatherKind} from './game';
import type {ChallengeConfig, SimulationState} from './engine/model';
import {challengeGoalLabel} from './challenge';

export type DifficultyTier = 'novice' | 'normal' | 'hard' | 'expert' | 'extreme';
export type DifficultyMetric = 'satisfaction' | 'peakQueuePct' | 'delay' | 'spendOver' | 'timeout' | 'weatherClosed';
export type DifficultyRequirement = 'medical' | 'doubleEntrance';

export interface DifficultyRule {
  id: string;
  metric: DifficultyMetric;
  operator: 'atLeast' | 'atMost';
  target: number;
  label: string;
}

export interface DifficultyProfile {
  id: DifficultyTier;
  name: string;
  badge: string;
  description: string;
  detail: string;
  unlockLevel: number;
  rewardScale: number;
  budgetScale: number;
  budgetSlack: number;
  staffScale: number;
  volunteerScale: number;
  checkinScale: number;
  peopleScale: number;
  absenceScale: number;
  spreadScale: number;
  weather?: WeatherKind;
  weatherAuto?: boolean;
  budgetMode?: 'unlimited' | 'challenge';
  hazardScale: number;
  repairScale: number;
  costScale: number;
  directorScale: number;
  reviewInterval: number;
  maxActiveEvents: number;
  satisfactionBias: number;
  satisfactionDrain: number;
  rules: DifficultyRule[];
  requires: DifficultyRequirement[];
}

const rule = (id: string, metric: DifficultyMetric, operator: 'atLeast' | 'atMost', target: number, label: string): DifficultyRule => ({id, metric, operator, target, label});

export const DIFFICULTY_ORDER: DifficultyTier[] = ['novice', 'normal', 'hard', 'expert', 'extreme'];

export const DIFFICULTIES: Record<DifficultyTier, DifficultyProfile> = {
  novice: {
    id: 'novice', name: '新手', badge: 'N', unlockLevel: 1, rewardScale: .75,
    description: '预算宽松、事件稀少，适合熟悉搭建与模拟流程。',
    detail: '预算和人力更充足，天气固定晴朗，事件导演降低评估频率与触发概率；不设失败条件。',
    budgetScale: 1.35, budgetSlack: 6000, staffScale: 1.35, volunteerScale: 1.5, checkinScale: 1.2, peopleScale: .8,
    absenceScale: .6, spreadScale: 1.3, weather: 'sunny', weatherAuto: false, budgetMode: 'unlimited',
    hazardScale: .5, repairScale: .8, costScale: .9, directorScale: .45, reviewInterval: 8, maxActiveEvents: 1,
    satisfactionBias: 8, satisfactionDrain: 0, rules: [], requires: [],
  },
  normal: {
    id: 'normal', name: '普通', badge: 'C', unlockLevel: 1, rewardScale: 1,
    description: '常规预算与正常事件概率，保留场地与流程限制。',
    detail: '不改变当前天气与资金模式；满意度低于 25 或超时视为未达成，奖励按标准结算。',
    budgetScale: 1, budgetSlack: 1000, staffScale: 1, volunteerScale: 1, checkinScale: 1, peopleScale: 1,
    absenceScale: 1, spreadScale: 1, hazardScale: 1, repairScale: 1, costScale: 1, directorScale: 1,
    reviewInterval: 5, maxActiveEvents: 1, satisfactionBias: 0, satisfactionDrain: 0,
    rules: [
      rule('normal-sat', 'satisfaction', 'atLeast', 25, '满意度 ≥ 25/100'),
      rule('normal-timeout', 'timeout', 'atMost', 0, '未超时完成'),
    ], requires: [],
  },
  hard: {
    id: 'hard', name: '困难', badge: 'H', unlockLevel: 3, rewardScale: 1.35,
    description: '预算与人力收紧，小雨自动变化，可能同时出现多个现场事件。',
    detail: '预算挑战模式生效，人员与签到能力下降，到场人数上升；导演每 4 分钟评估并可同时维持 2 个事件。',
    budgetScale: .8, budgetSlack: 800, staffScale: .8, volunteerScale: .4, checkinScale: .85, peopleScale: 1.12,
    absenceScale: 1.5, spreadScale: .85, weather: 'lightRain', weatherAuto: true, budgetMode: 'challenge',
    hazardScale: 1.2, repairScale: 1.1, costScale: 1.1, directorScale: 1.15, reviewInterval: 4, maxActiveEvents: 2,
    satisfactionBias: -4, satisfactionDrain: .006,
    rules: [
      rule('hard-sat', 'satisfaction', 'atLeast', 35, '满意度 ≥ 35/100'),
      rule('hard-queue', 'peakQueuePct', 'atMost', 20, '峰值排队 ≤ 到场人数的 20%'),
      rule('hard-delay', 'delay', 'atMost', 20, '延误 ≤ 20 分钟'),
    ], requires: [],
  },
  expert: {
    id: 'expert', name: '专家', badge: 'E', unlockLevel: 6, rewardScale: 1.8,
    description: '复杂场地、高参与人数与资源紧张，必须配置医疗点。',
    detail: '大雨固定，预算挑战、人员削减、到场人数大幅上升；导演每 3 分钟评估并可维持 3 个事件。',
    budgetScale: .65, budgetSlack: 300, staffScale: .68, volunteerScale: 0, checkinScale: .75, peopleScale: 1.25,
    absenceScale: 1.9, spreadScale: .7, weather: 'heavyRain', weatherAuto: false, budgetMode: 'challenge',
    hazardScale: 1.4, repairScale: 1.2, costScale: 1.2, directorScale: 1.3, reviewInterval: 3, maxActiveEvents: 3,
    satisfactionBias: -7, satisfactionDrain: .012,
    rules: [
      rule('expert-sat', 'satisfaction', 'atLeast', 45, '满意度 ≥ 45/100'),
      rule('expert-queue', 'peakQueuePct', 'atMost', 15, '峰值排队 ≤ 到场人数的 15%'),
      rule('expert-delay', 'delay', 'atMost', 15, '延误 ≤ 15 分钟'),
      rule('expert-spend', 'spendOver', 'atMost', 0, '总支出不超过活动预算'),
    ], requires: ['medical'],
  },
  extreme: {
    id: 'extreme', name: '极限挑战', badge: 'X', unlockLevel: 10, rewardScale: 2.4,
    description: '大风、双入口与医疗覆盖硬性要求，目标严格且事件并发。',
    detail: '固定大风、最紧预算与最少人力，到场人数接近容量；导演每 3 分钟评估并可维持 4 个事件，需满足全部严格目标。',
    budgetScale: .5, budgetSlack: 100, staffScale: .55, volunteerScale: 0, checkinScale: .65, peopleScale: 1.35,
    absenceScale: 2.3, spreadScale: .6, weather: 'gale', weatherAuto: false, budgetMode: 'challenge',
    hazardScale: 1.65, repairScale: 1.35, costScale: 1.3, directorScale: 1.5, reviewInterval: 3, maxActiveEvents: 4,
    satisfactionBias: -10, satisfactionDrain: .02,
    rules: [
      rule('extreme-sat', 'satisfaction', 'atLeast', 55, '满意度 ≥ 55/100'),
      rule('extreme-queue', 'peakQueuePct', 'atMost', 8, '峰值排队 ≤ 到场人数的 8%'),
      rule('extreme-delay', 'delay', 'atMost', 10, '延误 ≤ 10 分钟'),
      rule('extreme-spend', 'spendOver', 'atMost', 0, '总支出不超过活动预算'),
      rule('extreme-timeout', 'timeout', 'atMost', 0, '未超时完成'),
      rule('extreme-weather', 'weatherClosed', 'atMost', 0, '未因天气关闭户外区域'),
    ], requires: ['medical', 'doubleEntrance'],
  },
};

export function difficultyProfile(tier: DifficultyTier | undefined): DifficultyProfile {
  return DIFFICULTIES[tier ?? 'normal'] ?? DIFFICULTIES.normal;
}

export interface DifficultyBaseline {
  people: number;
  staff: number;
  volunteers: number;
  budget: number;
  checkinStaff: number;
  absence: number;
  arrivalSpread: number;
  weather?: WeatherKind;
  weatherAuto?: boolean;
  budgetMode?: 'unlimited' | 'challenge';
}

export interface DifficultyRuleResult extends DifficultyRule {
  value: number;
  met: boolean;
}

export interface DifficultyRequirementResult {
  id: DifficultyRequirement;
  label: string;
  met: boolean;
}

export interface DifficultyOutcome {
  tier: DifficultyTier;
  profile: DifficultyProfile;
  failed: boolean;
  failure?: string;
  grade: 'S' | 'A' | 'B' | 'C' | 'F';
  score: number;
  rules: DifficultyRuleResult[];
  requirements: DifficultyRequirementResult[];
  challengeFailed: boolean;
  challengeCompleted: boolean;
}

export interface DifficultyReward {
  tier: DifficultyTier;
  multiplier: number;
  grade: DifficultyOutcome['grade'];
  experience: number;
  currency: number;
  reputation: number;
  unlocked: Unlockable[];
}

function metricValue(layout: Layout, state: SimulationState, metric: DifficultyMetric): number {
  switch (metric) {
    case 'satisfaction': return state.satisfaction ?? 70;
    case 'peakQueuePct': return state.peakQueue / Math.max(1, state.arrived || state.snapshot.people) * 100;
    case 'delay': return state.delay;
    case 'spendOver': return (state.snapshot.buildCost ?? 0) + state.extraSpend - layout.activity.budget;
    case 'timeout': return state.timeout ? 1 : 0;
    case 'weatherClosed': return state.weatherClosed ? 1 : 0;
    default: return 0;
  }
}

function requirementMet(layout: Layout, requirement: DifficultyRequirement): boolean {
  if (requirement === 'medical') return layout.items.some(item => item.kind === 'medical');
  if (requirement === 'doubleEntrance') return layout.items.filter(item => item.kind === 'entrance').length >= 2;
  return true;
}

const REQUIREMENT_LABELS: Record<DifficultyRequirement, string> = {
  medical: '现场配置至少 1 个医疗点',
  doubleEntrance: '现场配置至少 2 个出入口',
};

/** Evaluate the run against the tier's resource and risk-management rules. */
export function evaluateDifficulty(layout: Layout, state: SimulationState, score: number): DifficultyOutcome {
  const profile = difficultyProfile(layout.difficulty);
  const rules = profile.rules.map(rule => {
    const value = metricValue(layout, state, rule.metric);
    const met = rule.operator === 'atLeast' ? value >= rule.target : value <= rule.target;
    return {...rule, value, met};
  });
  const requirements = profile.requires.map(id => ({id, label: REQUIREMENT_LABELS[id], met: requirementMet(layout, id)}));
  const challengeFailed = !!state.challenge?.failed;
  const challengeCompleted = !!state.challenge?.completed;
  const missingRequirement = requirements.find(entry => !entry.met);
  const failedRule = rules.find(entry => !entry.met);
  const failed = challengeFailed || !!missingRequirement || !!failedRule;
  const failure = challengeFailed ? `自定义挑战失败 · ${state.challenge?.failure ?? ''}` : missingRequirement ? `缺少难度要求 · ${missingRequirement.label}` : failedRule ? `未达成 · ${failedRule.label}` : undefined;
  return {
    tier: profile.id, profile, failed, failure,
    grade: failed ? 'F' : score >= 85 ? 'S' : score >= 70 ? 'A' : score >= 55 ? 'B' : 'C',
    score, rules, requirements, challengeFailed, challengeCompleted,
  };
}

/** Rewards scale with the tier and the measured result; failure still grants partial progress. */
export function difficultyReward(outcome: DifficultyOutcome): DifficultyReward {
  const multiplier = outcome.profile.rewardScale;
  const score = Math.max(0, outcome.score);
  const experience = Math.round((10 + score * .6) * multiplier * (outcome.failed ? .45 : 1) + (outcome.challengeCompleted ? 15 : 0));
  const currency = Math.round((5 + score * .45) * multiplier * (outcome.failed ? .5 : 1));
  const reputation = Math.round((score - 55) * .5 * multiplier) - (outcome.failed ? Math.round(3 * multiplier) : 0);
  return {tier: outcome.tier, multiplier, grade: outcome.grade, experience, currency, reputation, unlocked: []};
}

export type UnlockCategory = 'facility' | 'decor' | 'scene' | 'challenge';

export interface Unlockable {
  id: string;
  ref: string;
  category: UnlockCategory;
  label: string;
  level: number;
  detail: string;
}

export const UNLOCKABLES: Unlockable[] = [
  {id: 'facility:checkinLarge', ref: 'checkinLarge', category: 'facility', label: '大签到台', level: 2, detail: '4 个签到工位，缓解高到场人数的入口压力。'},
  {id: 'scene:sports', ref: 'sports', category: 'scene', label: '体育赛事', level: 2, detail: '新增活动场景与对应流程模板。'},
  {id: 'decor:fountain', ref: 'fountain', category: 'decor', label: '喷泉', level: 3, detail: '广场中心景观，提升氛围与停留意愿。'},
  {id: 'scene:charity', ref: 'charity', category: 'scene', label: '公益志愿', level: 3, detail: '新增公益活动场景与流程模板。'},
  {id: 'facility:roadCurve', ref: 'roadCurve', category: 'facility', label: '90° 弯道', level: 4, detail: '连接横纵主干道，完善复杂场地动线。'},
  {id: 'scene:business', ref: 'business', category: 'scene', label: '商务会议', level: 4, detail: '新增商务活动场景与会议流程。'},
  {id: 'scene:competition', ref: 'competition', category: 'scene', label: '创新创业比赛', level: 5, detail: '新增比赛场景与评审流程。'},
  {id: 'challenge:rainMarket', ref: 'rainMarket', category: 'challenge', label: '雨中市集', level: 3, detail: '挑战库：小雨中的高密度市集运营。'},
  {id: 'challenge:extremeFinale', ref: 'extremeFinale', category: 'challenge', label: '极限闭幕式', level: 6, detail: '挑战库：严格目标与并发事件的闭幕式。'},
];

export function unlockById(id: string): Unlockable | undefined {
  return UNLOCKABLES.find(entry => entry.id === id);
}

export function unlockFor(profile: {level: number; reputation: number; unlockedItems: string[]; unlockedScenes: string[]}, entry: Unlockable): boolean {
  if (profile.level < entry.level) return false;
  return entry.category === 'scene' ? profile.unlockedScenes.includes(entry.ref) : profile.unlockedItems.includes(entry.ref);
}

export function facilityLock(profile: {level: number; unlockedItems: string[]}, kind: string): Unlockable | null {
  const entry = UNLOCKABLES.find(candidate => candidate.ref === kind && (candidate.category === 'facility' || candidate.category === 'decor'));
  if (!entry || entry.level <= 1 || profile.unlockedItems.includes(kind)) return null;
  return profile.level >= entry.level ? null : entry;
}

export function sceneLock(profile: {level: number; unlockedScenes: string[]}, scene: string): Unlockable | null {
  const entry = UNLOCKABLES.find(candidate => candidate.ref === scene && candidate.category === 'scene');
  if (!entry) return null;
  return profile.unlockedScenes.includes(scene) ? null : entry;
}

export function challengeLock(profile: {level: number; unlockedItems: string[]}, id: string): Unlockable | null {
  const entry = UNLOCKABLES.find(candidate => candidate.ref === id && candidate.category === 'challenge');
  if (!entry) return null;
  return profile.unlockedItems.includes(`challenge:${id}`) ? null : entry;
}

export function nextUnlocks(profile: {level: number}, count = 3): Unlockable[] {
  return UNLOCKABLES.filter(entry => entry.level > profile.level).sort((a, b) => a.level - b.level).slice(0, count);
}

const presetRule = (metric: Parameters<typeof challengeGoalLabel>[0]['metric'], operator: 'atLeast' | 'atMost', target: number) => {
  const rule = {id: `preset-${metric}-${target}`, metric, operator, target, label: ''};
  return {...rule, label: challengeGoalLabel(rule)};
};

export interface ChallengePreset {
  id: string;
  label: string;
  level: number;
  description: string;
  make: (budget: number) => ChallengeConfig;
}

export const CHALLENGE_PRESETS: ChallengePreset[] = [
  {
    id: 'firstSteps', label: '新手首演', level: 1, description: '80% 签到率 + 60 满意度，适合第一次挑战。',
    make: () => ({
      name: '新手首演', brief: '在常规预算下完成签到与流程，保持观众满意度。', eventIntensity: .75, director: true,
      goals: [presetRule('servedRate', 'atLeast', 80), presetRule('satisfaction', 'atLeast', 60)],
      fails: [presetRule('satisfaction', 'atMost', 25), presetRule('peakQueue', 'atLeast', 100)],
    }),
  },
  {
    id: 'rainMarket', label: '雨中市集', level: 3, description: '85% 签到率、65 满意度，延误不超过 15 分钟。',
    make: () => ({
      name: '雨中市集', brief: '在小雨与有限人力下维持入口秩序和摊位运转。', eventIntensity: 1.15, director: true,
      goals: [presetRule('servedRate', 'atLeast', 85), presetRule('satisfaction', 'atLeast', 65), presetRule('delay', 'atMost', 15)],
      fails: [presetRule('satisfaction', 'atMost', 35), presetRule('peakQueue', 'atLeast', 70)],
    }),
  },
  {
    id: 'extremeFinale', label: '极限闭幕式', level: 6, description: '92% 签到率、70 满意度、10 分钟延误与预算上限。',
    make: (budget: number) => ({
      name: '极限闭幕式', brief: '在严格资源约束下完成闭幕式流程，任何一项失守都会终止活动。', eventIntensity: 1.5, director: true,
      goals: [presetRule('servedRate', 'atLeast', 92), presetRule('satisfaction', 'atLeast', 70), presetRule('delay', 'atMost', 10), presetRule('spend', 'atMost', Math.max(1000, budget))],
      fails: [presetRule('satisfaction', 'atMost', 45), presetRule('peakQueue', 'atLeast', 50), presetRule('timeout', 'atLeast', 1)],
    }),
  },
];
