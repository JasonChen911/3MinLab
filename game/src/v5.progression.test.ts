import {describe, expect, it} from 'vitest';
import {applyDifficulty, freshLayout, normalizeLayout, start, type Item} from './game';
import {addIncident, step} from './engine/engine';
import {Random} from './engine/random';
import {
  challengeLock, difficultyProfile, difficultyReward, evaluateDifficulty, facilityLock, sceneLock,
} from './difficulty';
import {awardActivity, defaultProfile, syncUnlocks} from './progression';

const layoutFor = (tier: Parameters<typeof applyDifficulty>[1]) => applyDifficulty(freshLayout('conference'), tier);

function passingState(tier: Parameters<typeof applyDifficulty>[1]) {
  const layout = layoutFor(tier);
  const state = start(layout);
  state.satisfaction = 60;
  state.delay = 5;
  state.peakQueue = 0;
  state.timeout = false;
  state.weatherClosed = false;
  return {layout, state};
}

describe('V5 难度、成长与奖励', () => {
  it('难度会调整预算、人力、参与人数、天气与预算模式', () => {
    const novice = applyDifficulty(freshLayout('athletics'), 'novice');
    const hard = applyDifficulty(freshLayout('athletics'), 'hard');
    const extreme = applyDifficulty(freshLayout('athletics'), 'extreme');
    expect(novice.activity.people).toBeLessThan(hard.activity.people);
    expect(hard.activity.people).toBeLessThan(extreme.activity.people);
    expect(novice.params.staff).toBeGreaterThan(hard.params.staff);
    expect(hard.params.staff).toBeGreaterThan(extreme.params.staff);
    expect(novice.activity.budget).toBeGreaterThan(extreme.activity.budget);
    expect(novice.weather).toBe('sunny');
    expect(hard.weather).toBe('lightRain');
    expect(hard.weatherAuto).toBe(true);
    expect(extreme.weather).toBe('gale');
    expect(extreme.budgetMode).toBe('challenge');
    expect(novice.budgetMode).toBe('unlimited');
    expect(extreme.volunteers).toBe(0);
  });

  it('切换难度从原始基线换算，不会重复叠加', () => {
    const base = freshLayout('conference');
    const novice = applyDifficulty(base, 'novice');
    const extreme = applyDifficulty(novice, 'extreme');
    const back = applyDifficulty(extreme, 'novice');
    expect(back.activity.people).toBe(novice.activity.people);
    expect(back.activity.budget).toBe(novice.activity.budget);
    expect(back.params.staff).toBe(novice.params.staff);
    expect(back.params.checkinStaff).toBe(novice.params.checkinStaff);
    expect(back.volunteers).toBe(novice.volunteers);
    expect(back.weather).toBe('sunny');
    expect(back.budgetMode).toBe('unlimited');
    expect(back.difficulty).toBe('novice');
    expect(back.difficultyBase).toEqual(novice.difficultyBase);
    const hard = applyDifficulty(base, 'hard');
    const normal = applyDifficulty(hard, 'normal');
    expect(normal.activity.budget).toBe(base.activity.budget);
    expect(normal.activity.people).toBe(base.activity.people);
    expect(normal.params.staff).toBe(base.params.staff);
    expect(normal.weather).toBe(base.weather);
    expect(normal.weatherAuto).toBe(base.weatherAuto);
    expect(normal.budgetMode).toBe(base.budgetMode);
    expect(normal.volunteers).toBe(base.volunteers);
  });

  it('旧场地加载后默认为普通难度', () => {
    const legacy = {...freshLayout('custom')} as Record<string, unknown>;
    delete legacy.difficulty;
    delete legacy.difficultyBase;
    const normalized = normalizeLayout(legacy as never);
    expect(normalized.difficulty).toBe('normal');
  });

  it('难度事件系数真实乘到引擎概率、修复时长与事件成本', () => {
    const hard = layoutFor('hard');
    const twin = {...hard, difficulty: 'normal' as const};
    const normalState = start(twin);
    const hardState = start(hard);
    expect(hardState.parameters.equipmentRate / normalState.parameters.equipmentRate).toBeCloseTo(difficultyProfile('hard').hazardScale, 6);
    const normalIncident = addIncident(structuredClone(normalState), 'equipment', new Random(90210));
    const hardIncident = addIncident(structuredClone(hardState), 'equipment', new Random(90210));
    expect(hardIncident.cost / normalIncident.cost).toBeCloseTo(difficultyProfile('hard').costScale, 1);
    expect((hardIncident.until - hardIncident.at) / (normalIncident.until - normalIncident.at)).toBeCloseTo(difficultyProfile('hard').repairScale, 1);
  });

  it('事件导演按难度调整评估间隔与初始满意度', () => {
    const noviceState = start(layoutFor('novice'));
    const expertLayout = layoutFor('expert');
    const expertState = start(expertLayout);
    const sameAsNormal = start({...expertLayout, difficulty: 'normal'});
    expect(noviceState.director?.nextReview).toBe(difficultyProfile('novice').reviewInterval);
    expect(expertState.director?.nextReview).toBe(difficultyProfile('expert').reviewInterval);
    expect((expertState.satisfaction ?? 0) - (sameAsNormal.satisfaction ?? 0)).toBeCloseTo(difficultyProfile('expert').satisfactionBias, 6);
    expect(step(noviceState, 7).director?.nextReview).toBe(difficultyProfile('novice').reviewInterval);
    expect(step(expertState, 7).director?.nextReview).toBe(difficultyProfile('expert').reviewInterval * 3);
  });

  it('难度约束按真实结果判定，硬性要求缺失会失败', () => {
    const {layout, state} = passingState('hard');
    const passed = evaluateDifficulty(layout, state, 50);
    expect(passed.failed).toBe(false);
    expect(passed.grade).toBe('C');

    state.satisfaction = 20;
    state.delay = 40;
    state.peakQueue = Math.round(state.snapshot.people * .45);
    const failed = evaluateDifficulty(layout, state, 50);
    expect(failed.failed).toBe(true);
    expect(failed.failure).toContain('未达成');
    expect(failed.rules.filter(rule => !rule.met).length).toBeGreaterThanOrEqual(3);

    const entrance = layout.items.find(item => item.kind === 'entrance');
    const stripped: Item[] = layout.items.filter(item => item.kind !== 'medical' && item.kind !== 'entrance');
    const missing = applyDifficulty({...freshLayout('conference'), items: stripped}, 'expert');
    const missingOutcome = evaluateDifficulty(missing, start(missing), 90);
    expect(missingOutcome.failed).toBe(true);
    expect(missingOutcome.requirements.some(requirement => !requirement.met)).toBe(true);
    expect(entrance).toBeTruthy();
  });

  it('奖励随难度与结果缩放，失败仍有部分进度但扣声望', () => {
    const {layout, state} = passingState('normal');
    const normalOutcome = evaluateDifficulty(layout, state, 90);
    const normalReward = difficultyReward(normalOutcome);

    const extreme = passingState('extreme').layout;
    const extremeState = passingState('extreme').state;
    extreme.items = [...extreme.items, {id: 'extra-entrance', kind: 'entrance', x: 8, z: 16, rotation: 0}];
    extremeState.satisfaction = 60;
    const extremeOutcome = evaluateDifficulty(extreme, extremeState, 90);
    expect(extremeOutcome.failed).toBe(false);
    const extremeReward = difficultyReward(extremeOutcome);

    expect(extremeReward.experience).toBeGreaterThan(normalReward.experience);
    expect(extremeReward.currency).toBeGreaterThan(normalReward.currency);
    expect(extremeReward.reputation).toBeGreaterThan(normalReward.reputation);

    const failure = difficultyReward({...normalOutcome, failed: true, grade: 'F', score: 30, failure: '测试失败'});
    expect(failure.experience).toBeLessThan(normalReward.experience);
    expect(failure.reputation).toBeLessThan(0);
  });

  it('活动结算真实发放经验、货币、声望与等级解锁', () => {
    const {layout, state} = passingState('normal');
    const outcome = evaluateDifficulty(layout, state, 90);
    const profile = defaultProfile();
    const award = awardActivity(profile, {...outcome, tier: 'extreme', profile: difficultyProfile('extreme')}, '测试活动', 'conference');
    expect(award.profile.currency).toBeGreaterThan(0);
    expect(award.profile.reputation).toBeGreaterThan(0);
    expect(award.profile.completedActivities).toBe(1);
    expect(award.profile.level).toBeGreaterThanOrEqual(2);
    expect(award.profile.unlockedItems).toContain('checkinLarge');
    expect(award.profile.unlockedScenes).toContain('sports');
    expect(award.reward.unlocked.map(entry => entry.id)).toContain('facility:checkinLarge');
    expect(award.profile.rewards.at(-1)?.amount).toBe(award.reward.currency);

    const failureAward = awardActivity(profile, {...outcome, failed: true, grade: 'F', score: 20, failure: '测试失败'}, '失败活动');
    expect(failureAward.reward.reputation).toBeLessThan(0);
    expect(failureAward.profile.reputation).toBe(0);
  });

  it('设施、场景和挑战库按等级真实解锁', () => {
    const level2 = syncUnlocks({...defaultProfile(), level: 2});
    expect(facilityLock(level2, 'checkinLarge')).toBeNull();
    expect(sceneLock(level2, 'sports')).toBeNull();
    expect(challengeLock(level2, 'rainMarket')).not.toBeNull();
    expect(facilityLock(level2, 'fountain')).not.toBeNull();

    const level3 = syncUnlocks({...defaultProfile(), level: 3});
    expect(challengeLock(level3, 'rainMarket')).toBeNull();
    expect(sceneLock(level3, 'charity')).toBeNull();
    expect(facilityLock(level3, 'fountain')).toBeNull();

    const level1 = syncUnlocks(defaultProfile());
    expect(sceneLock(level1, 'business')).not.toBeNull();
    expect(sceneLock(level1, 'custom')).toBeNull();
  });
});
