import type {
  ChallengeConfig, ChallengeFail, ChallengeGoal, ChallengeMetric, ChallengeOperator, ChallengeResult, SimulationState,
} from './engine/model';

export interface MetricInfo {
  label: string;
  unit: string;
  defaultOperator: ChallengeOperator;
  step: number;
  min: number;
  max: number;
  goalOnly?: boolean;
}
export const CHALLENGE_METRICS: Record<ChallengeMetric, MetricInfo> = {
  served: {label: '签到人数', unit: '人', defaultOperator: 'atLeast', step: 1, min: 1, max: 20000},
  servedRate: {label: '签到率', unit: '%', defaultOperator: 'atLeast', step: 1, min: 1, max: 100},
  satisfaction: {label: '满意度', unit: '/100', defaultOperator: 'atLeast', step: 1, min: 1, max: 100},
  peakQueue: {label: '峰值排队', unit: '人', defaultOperator: 'atMost', step: 1, min: 0, max: 5000},
  delay: {label: '延误', unit: '分钟', defaultOperator: 'atMost', step: 1, min: 0, max: 1440},
  spend: {label: '总支出', unit: '元', defaultOperator: 'atMost', step: 100, min: 0, max: 100000000},
  timeout: {label: '超时未完成', unit: '', defaultOperator: 'atLeast', step: 1, min: 1, max: 1, goalOnly: true},
};
export const CHALLENGE_METRIC_KEYS = Object.keys(CHALLENGE_METRICS) as ChallengeMetric[];
export const CHALLENGE_GOAL_METRICS = CHALLENGE_METRIC_KEYS.filter(metric => !CHALLENGE_METRICS[metric].goalOnly);
export const CHALLENGE_INTENSITIES = [
  {value: .55, label: '平静 · 事件较少', hint: '故障与天气事件概率约为标准模式的 55%'},
  {value: 1, label: '标准 · 正常风险', hint: '使用当前概率参数与导演评估节奏'},
  {value: 1.65, label: '混乱 · 事件频繁', hint: '故障与天气事件概率约为标准模式的 165%'},
] as const;
const OPERATOR_LABEL: Record<ChallengeOperator, string> = {atLeast: '≥', atMost: '≤'};
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const id = () => `goal-${Math.random().toString(36).slice(2, 9)}`;

export function challengeGoalLabel(goal: ChallengeGoal | ChallengeFail): string {
  const info = CHALLENGE_METRICS[goal.metric];
  return `${info.label} ${OPERATOR_LABEL[goal.operator]} ${Math.round(goal.target)}${info.unit}`;
}

export function defaultChallenge(name = '自定义挑战', budget = 10000): ChallengeConfig {
  return {
    name, brief: '在限定预算与现场压力下完成活动，达成以下目标且不触发失败条件。',
    eventIntensity: 1, director: true,
    goals: [
      {id: id(), metric: 'servedRate', operator: 'atLeast', target: 85, label: challengeGoalLabel({id: '', metric: 'servedRate', operator: 'atLeast', target: 85, label: ''})},
      {id: id(), metric: 'satisfaction', operator: 'atLeast', target: 65, label: challengeGoalLabel({id: '', metric: 'satisfaction', operator: 'atLeast', target: 65, label: ''})},
      {id: id(), metric: 'delay', operator: 'atMost', target: 15, label: challengeGoalLabel({id: '', metric: 'delay', operator: 'atMost', target: 15, label: ''})},
    ],
    fails: [
      {id: id(), metric: 'satisfaction', operator: 'atMost', target: 30, label: challengeGoalLabel({id: '', metric: 'satisfaction', operator: 'atMost', target: 30, label: ''})},
      {id: id(), metric: 'peakQueue', operator: 'atLeast', target: 80, label: challengeGoalLabel({id: '', metric: 'peakQueue', operator: 'atLeast', target: 80, label: ''})},
      {id: id(), metric: 'spend', operator: 'atLeast', target: budget, label: challengeGoalLabel({id: '', metric: 'spend', operator: 'atLeast', target: budget, label: ''})},
    ],
  };
}

function cleanRules(value: unknown, fallback: ChallengeGoal[] | ChallengeFail[], metrics: ChallengeMetric[]): ChallengeGoal[] {
  if (!Array.isArray(value)) return fallback;
  const seen = new Set<string>();
  const rules: ChallengeGoal[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue;
    const raw = entry as Partial<ChallengeGoal>;
    const metric = raw.metric as ChallengeMetric;
    if (!metrics.includes(metric) || !Number.isFinite(raw.target)) continue;
    const info = CHALLENGE_METRICS[metric];
    const operator: ChallengeOperator = raw.operator === 'atMost' ? 'atMost' : raw.operator === 'atLeast' ? 'atLeast' : info.defaultOperator;
    const target = clamp(Math.round((raw.target as number) * 100) / 100, info.min, info.max);
    const ruleId = typeof raw.id === 'string' && !seen.has(raw.id) ? raw.id : id();
    seen.add(ruleId);
    const rule = {id: ruleId, metric, operator, target, label: ''};
    rule.label = challengeGoalLabel(rule);
    rules.push(rule);
    if (rules.length >= 8) break;
  }
  return rules;
}

/** Sanitize storage or editor input; malformed rules fall back to a playable default. */
export function normalizeChallenge(value: unknown, fallback?: Partial<ChallengeConfig>): ChallengeConfig {
  const base = defaultChallenge(fallback?.name, fallback?.goals?.find(goal => goal.metric === 'spend')?.target);
  if (!value || typeof value !== 'object') return {...base, ...fallback, goals: fallback?.goals ?? base.goals, fails: fallback?.fails ?? base.fails};
  const raw = value as Partial<ChallengeConfig>;
  const name = typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim().slice(0, 40) : base.name;
  const brief = typeof raw.brief === 'string' ? raw.brief.slice(0, 200) : base.brief;
  const goals = cleanRules(raw.goals, fallback?.goals?.length ? fallback.goals : base.goals, CHALLENGE_GOAL_METRICS);
  const fails = cleanRules(raw.fails, fallback?.fails ?? base.fails, CHALLENGE_METRIC_KEYS);
  return {
    name, brief,
    eventIntensity: Number.isFinite(raw.eventIntensity) ? clamp(raw.eventIntensity as number, .4, 2) : 1,
    director: raw.director !== false,
    goals: goals.length ? goals : base.goals,
    fails,
  };
}

export function challengeMetricValue(state: SimulationState, metric: ChallengeMetric): number {
  switch (metric) {
    case 'served': return state.served;
    case 'servedRate': return state.arrived > 0 ? state.served / state.arrived * 100 : 0;
    case 'satisfaction': return state.satisfaction ?? 70;
    case 'peakQueue': return state.peakQueue;
    case 'delay': return state.delay;
    case 'spend': return (state.snapshot.buildCost ?? 0) + state.extraSpend;
    case 'timeout': return state.timeout ? 1 : 0;
    default: return 0;
  }
}

function meets(value: number, operator: ChallengeOperator, target: number): boolean {
  return operator === 'atLeast' ? value >= target : value <= target;
}

export function evaluateChallenge(state: SimulationState): ChallengeResult | undefined {
  const config = state.snapshot.challenge;
  if (!config) return undefined;
  const goals = config.goals.map(goal => {
    const value = challengeMetricValue(state, goal.metric);
    return {
      id: goal.id, label: goal.label || challengeGoalLabel(goal), metric: goal.metric,
      value, target: goal.target, met: meets(value, goal.operator, goal.target),
    };
  });
  const failures = config.fails.filter(rule => meets(challengeMetricValue(state, rule.metric), rule.operator, rule.target));
  const met = goals.filter(goal => goal.met).length;
  return {
    total: goals.length, met, goals,
    failed: failures.length > 0,
    failure: failures[0]?.label || failures[0]?.metric,
    completed: goals.length > 0 && met === goals.length,
  };
}

export function formatChallengeValue(metric: ChallengeMetric, value: number): string {
  const info = CHALLENGE_METRICS[metric];
  if (metric === 'servedRate' || metric === 'satisfaction') return `${Math.round(value)}${info.unit}`;
  if (metric === 'spend') return `¥${Math.round(value).toLocaleString()}`;
  if (metric === 'timeout') return value >= 1 ? '是' : '否';
  return `${Math.round(value)}${info.unit ? ` ${info.unit}` : ''}`;
}
