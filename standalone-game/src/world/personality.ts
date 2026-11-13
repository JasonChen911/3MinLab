import {Random} from '../engine/random';
import type {Role, WeatherKind} from '../game';
import {weatherProfile} from './weather';

/** Traits are 0..1 and deterministic per simulated person; no LLM calls involved. */
export interface Personality {
  curiosity: number;
  patience: number;
  stamina: number;
  social: number;
  adventure: number;
  mobility: number;
}

export interface Needs {
  rest: number;
  water: number;
  view: number;
  social: number;
  exit: number;
}

export type NeedKey = keyof Needs;
export type NeedAction = 'rest' | 'comfort' | 'social' | 'view' | 'leave';
export type NeedActivity =
  | 'walking' | 'waiting' | 'queueing' | 'seated' | 'watching'
  | 'resting' | 'comforting' | 'socializing' | 'working' | 'idle';

export interface NeedContext {
  weather: WeatherKind;
  indoor: boolean;
  queue: number;
  crowd: number;
  hasRest: boolean;
  hasWater: boolean;
  hasSocial: boolean;
  hasView: boolean;
  working: boolean;
  progress: number;
}

export interface NeedDecision {
  key: NeedKey;
  action: NeedAction;
  urgency: number;
  reason: string;
}

export const NEED_LABELS: Record<NeedKey, string> = {
  rest: '休息', water: '补水', view: '观看', social: '社交', exit: '离场',
};

export const TRAIT_LABELS: Record<keyof Personality, string> = {
  curiosity: '好奇', patience: '耐心', stamina: '耐力', social: '社交', adventure: '冒险', mobility: '行动',
};

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const ROLE_BIAS: Partial<Record<Role, Partial<Personality>>> = {
  audience: {curiosity: .12, social: .04},
  participant: {adventure: .12, curiosity: .06},
  performer: {curiosity: .08, social: .18, adventure: .1},
  host: {social: .2, patience: .06},
  referee: {stamina: .16, patience: .08},
  staff: {patience: .18, stamina: .1},
  volunteer: {patience: .14, social: .08},
  security: {stamina: .2, patience: .12, adventure: .06},
  medical: {patience: .2, stamina: .12},
  service: {patience: .16, social: .1},
  vendor: {social: .12, patience: .08},
};

const ON_DUTY = new Set<Role>(['performer', 'host', 'referee', 'staff', 'volunteer', 'security', 'medical', 'service', 'vendor']);

export function isOnDuty(role: Role): boolean {
  return ON_DUTY.has(role);
}

export function personalityFor(seed: number, role: Role): Personality {
  const random = new Random(Math.round(Math.abs(seed) * 10000) + 7);
  const bias = ROLE_BIAS[role] ?? {};
  const roll = (key: keyof Personality, base: number) =>
    clamp01(base + (bias[key] ?? 0) + (random.uniform() - .5) * .42);
  return {
    curiosity: roll('curiosity', .48),
    patience: roll('patience', .5),
    stamina: roll('stamina', .52),
    social: roll('social', .48),
    adventure: roll('adventure', .45),
    mobility: roll('mobility', .5),
  };
}

export function initialNeeds(seed: number, role: Role): Needs {
  const random = new Random(Math.round(Math.abs(seed) * 10000) + 911);
  const audience = role === 'audience' || role === 'participant';
  const duty = isOnDuty(role) ? .05 : 0;
  return {
    rest: clamp01(.08 + random.uniform() * .13 + duty),
    water: clamp01(.11 + random.uniform() * .14),
    view: clamp01((audience ? .24 : .1) + random.uniform() * .18),
    social: clamp01(.1 + random.uniform() * .2),
    exit: clamp01(.02 + random.uniform() * .05),
  };
}

export function initialMood(seed: number, personality: Personality): number {
  const random = new Random(Math.round(Math.abs(seed) * 10000) + 37);
  return clamp(60 + random.uniform() * 16 + personality.curiosity * 6 - (1 - personality.patience) * 5, 42, 94);
}

/**
 * Advances needs and mood for one agent. Rates are per simulated second and are
 * shaped by activity, weather, duty status and whether the venue actually
 * provides the matching facility.
 */
export function stepNeeds(
  needs: Needs, personality: Personality, context: NeedContext, activity: NeedActivity, dt: number,
): Needs {
  if (dt <= 0) return needs;
  const profile = weatherProfile(context.weather);
  const outdoor = !context.indoor;
  const comfort = outdoor ? profile.comfort : Math.min(.98, profile.comfort + .22);
  const heat = outdoor && context.weather === 'sunny' ? 1 : 0;
  const walking = activity === 'walking' ? 1 : 0;
  const queueing = activity === 'queueing' ? 1 : 0;
  const working = activity === 'working' ? 1 : 0;
  const next: Needs = {
    rest: needs.rest + dt * (.0022 + walking * .0022 + working * .0008 + queueing * .0008)
      * (1.25 - personality.stamina * .4) * (context.hasRest ? 1 : 1.22),
    water: needs.water + dt * (.004 + heat * .002 + (1 - comfort) * .008)
      * (1.2 - personality.stamina * .25) * (context.hasWater ? 1 : 1.35),
    view: needs.view + dt * (.0012 + (context.hasView ? .003 : 0) * (.6 + personality.curiosity * .8)
      + context.progress * .0005) * (activity === 'watching' || activity === 'seated' ? .3 : 1),
    social: needs.social + dt * .0018 * (.6 + personality.social * .9)
      * (context.hasSocial ? .9 : 1.35) * (walking ? 1.2 : 1),
    exit: needs.exit + dt * (context.progress * .0008 + (outdoor && profile.rain > .4 ? .0018 : 0)
      + queueing * .0005),
  };

  if (activity === 'resting') {
    next.rest -= dt * .075;
    next.water -= dt * .004;
    next.exit -= dt * .005;
  } else if (activity === 'comforting') {
    next.water -= dt * .11;
    next.rest -= dt * .012;
    next.exit -= dt * .008;
  } else if (activity === 'socializing') {
    next.social -= dt * .09;
    next.exit -= dt * .004;
  } else if (activity === 'watching') {
    next.view -= dt * .05;
    next.social -= dt * .012;
  } else if (activity === 'seated') {
    next.rest -= dt * .022;
    next.view -= dt * .028;
  }

  const unmetPressure =
    Math.max(0, next.rest - .65) * .006
    + Math.max(0, next.water - .65) * .01
    + Math.max(0, next.social - .7) * .004
    + Math.max(0, next.exit - .45) * .004;
  next.exit += dt * unmetPressure;
  return {
    rest: clamp01(next.rest), water: clamp01(next.water), view: clamp01(next.view),
    social: clamp01(next.social), exit: clamp01(next.exit),
  };
}

export function updateMood(mood: number, personality: Personality, needs: Needs, context: NeedContext, dt: number): number {
  if (dt <= 0) return mood;
  const unmet = needs.rest * .22 + needs.water * .28 + needs.social * .12 + needs.view * .08 + needs.exit * .25;
  const support = ((context.hasRest ? 1 : 0) + (context.hasWater ? 1 : 0)
    + (context.hasSocial ? 1 : 0) + (context.hasView ? 1 : 0)) / 4;
  const pressure = Math.min(1, context.queue / 60 + context.crowd * .4);
  const weather = Math.max(0, .55 - weatherProfile(context.weather).comfort);
  const delta = (.35 - unmet * .6) * (.75 + personality.patience * .4)
    + support * .18 * (.35 + .65 * (1 - unmet)) - pressure * .22 - weather * .45;
  return clamp(mood + delta * dt, 0, 100);
}

/**
 * Rule + probability decision. A seeded jitter keeps identically-needy people
 * from switching targets on the exact same tick, without any external AI.
 */
export function decideNeed(
  needs: Needs, personality: Personality, context: NeedContext, mood: number, visitor: boolean, random: Random,
): NeedDecision | null {
  const jitter = (random.uniform() - .5) * .08;
  const duty = context.working ? .16 : 0;
  const leaveAt = .92 - personality.patience * .08;

  if (visitor && ((mood < 26 && needs.exit > .45) || needs.exit > leaveAt
    || (!context.hasWater && needs.water > .94))) {
    return {
      key: 'exit', action: 'leave', urgency: 1,
      reason: needs.exit > leaveAt
        ? `离场需求 ${Math.round(needs.exit * 100)}%，已超过个人耐受上限`
        : mood < 26
          ? `情绪降到 ${Math.round(mood)}，选择提前离开现场`
          : '现场没有补水设施，只能离场寻找补给',
    };
  }
  if (context.hasWater && needs.water > .66 + duty + jitter) {
    return {
      key: 'water', action: 'comfort', urgency: needs.water,
      reason: `补水需求 ${Math.round(needs.water * 100)}%，前往最近的饮水/卫生点`,
    };
  }
  if (context.hasRest && needs.rest > .68 + duty + jitter) {
    return {
      key: 'rest', action: 'rest', urgency: needs.rest,
      reason: `疲劳 ${Math.round(needs.rest * 100)}%，耐力 ${Math.round(personality.stamina * 100)}%，需要坐下休息`,
    };
  }
  if (context.hasSocial && needs.social > (context.working ? .82 : .66) + jitter
    && personality.social > (context.working ? .3 : .4)) {
    return {
      key: 'social', action: 'social', urgency: needs.social,
      reason: `社交需求 ${Math.round(needs.social * 100)}%，想去人群聚集处交流`,
    };
  }
  if (!context.working && context.hasView && needs.view > .68 + jitter && personality.curiosity > .35) {
    return {
      key: 'view', action: 'view', urgency: needs.view,
      reason: `观看需求 ${Math.round(needs.view * 100)}%，想靠近主活动区观看`,
    };
  }
  return null;
}

/** Queue patience: low-patience visitors give up earlier in long queues. */
export function queueTolerance(personality: Personality, queue: number): number {
  return 30 + personality.patience * 95 + Math.max(0, 12 - queue) * 1.5;
}

export function needPercent(value: number): number {
  return Math.round(clamp01(value) * 100);
}
