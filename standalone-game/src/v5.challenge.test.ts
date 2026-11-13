import {describe, it, expect} from 'vitest';
import {freshLayout, start, step} from './game';
import {challengeGoalLabel, defaultChallenge, evaluateChallenge, normalizeChallenge} from './challenge';
import type {ChallengeConfig, ChallengeGoal} from './engine/model';

const config = (over: Partial<ChallengeConfig> = {}): ChallengeConfig => ({
  ...defaultChallenge('测试挑战', 12000), ...over,
});

const goal = (metric: ChallengeGoal['metric'], operator: ChallengeGoal['operator'], target: number): ChallengeGoal => {
  const rule: ChallengeGoal = {id: `${metric}-${target}`, metric, operator, target, label: ''};
  rule.label = challengeGoalLabel(rule);
  return rule;
};

describe('V5 自定义挑战编辑器', () => {
  it('默认挑战包含可执行的目标与失败条件，名称和事件强度被校验', () => {
    const base = defaultChallenge('夜间音乐节', 20000);
    expect(base.goals.length).toBeGreaterThan(0);
    expect(base.fails.some(rule => rule.metric === 'spend' && rule.target === 20000)).toBe(true);
    expect(base.director).toBe(true);
    expect(normalizeChallenge({name: '  ', eventIntensity: 9, goals: []}).eventIntensity).toBe(2);
    expect(normalizeChallenge({name: '  ', goals: []}).name).toBe('自定义挑战');
  });

  it('目标数值被限制在指标范围，非法条件被丢弃且标签自动生成', () => {
    const parsed = normalizeChallenge({
      name: ' 压力测试 ', eventIntensity: .2, director: false,
      goals: [
        {id: 'a', metric: 'satisfaction', operator: 'atLeast', target: 180, label: ''},
        {id: 'a', metric: 'served', operator: 'atLeast', target: 50, label: ''},
        {id: 'b', metric: 'bogus', operator: 'atLeast', target: 3, label: ''},
      ],
      fails: [{id: 'c', metric: 'nope', operator: 'atLeast', target: 1, label: ''}],
    });
    expect(parsed.name).toBe('压力测试');
    expect(parsed.eventIntensity).toBe(.4);
    expect(parsed.director).toBe(false);
    expect(parsed.goals.length).toBe(2);
    expect(parsed.goals[0].target).toBe(100);
    expect(parsed.goals[0].label).toContain('满意度');
    expect(new Set(parsed.goals.map(rule => rule.id)).size).toBe(2);
    expect(parsed.fails).toEqual([]);
  });

  it('按模拟指标逐项判定目标，达标后标记挑战完成', () => {
    const layout = freshLayout('performance');
    layout.challenge = config({
      goals: [goal('servedRate', 'atLeast', 85), goal('satisfaction', 'atLeast', 65), goal('delay', 'atMost', 15)],
      fails: [goal('satisfaction', 'atMost', 30), goal('peakQueue', 'atLeast', 80)],
    });
    const state = start(layout);
    expect(state.snapshot.challenge?.name).toBe('测试挑战');
    state.arrived = 100;
    state.served = 90;
    state.satisfaction = 72;
    state.delay = 5;
    state.peakQueue = 40;
    const result = evaluateChallenge(state);
    expect(result?.met).toBe(3);
    expect(result?.completed).toBe(true);
    expect(result?.failed).toBe(false);
    state.served = 50;
    const dropped = evaluateChallenge(state);
    expect(dropped?.completed).toBe(false);
    expect(dropped?.goals.find(entry => entry.metric === 'servedRate')?.value).toBe(50);
  });

  it('触发失败条件会立即结束模拟并写回放日志', () => {
    const layout = freshLayout('performance');
    layout.challenge = config({
      goals: [goal('servedRate', 'atLeast', 85)],
      fails: [goal('satisfaction', 'atMost', 99)],
    });
    const next = step(start(layout), 1);
    expect(next.status).toBe('finished');
    expect(next.challenge?.failed).toBe(true);
    expect(next.challenge?.failure).toContain('满意度');
    expect(next.replay?.events.some(entry => entry.title.includes('挑战失败'))).toBe(true);
  });

  it('结束时结算目标，未设失败条件也能正常完成挑战', () => {
    const layout = freshLayout('performance');
    layout.challenge = config({goals: [goal('served', 'atLeast', 1)], fails: []});
    let state = start(layout);
    while (state.status !== 'finished' && state.minute < 300) state = step(state, 1);
    expect(state.status).toBe('finished');
    expect(state.challenge?.met).toBe(1);
    expect(state.challenge?.completed).toBe(true);
    expect(state.replay?.events.some(entry => entry.title.includes('挑战达成'))).toBe(true);
  });

  it('事件强度真实调整故障概率，关闭导演后不再生成导演事件', () => {
    const calm = freshLayout('performance');
    calm.challenge = config({eventIntensity: .55, goals: [goal('served', 'atLeast', 1)], fails: []});
    const chaotic = freshLayout('performance');
    chaotic.challenge = config({eventIntensity: 1.65, goals: [goal('served', 'atLeast', 1)], fails: []});
    const calmState = start(calm), chaoticState = start(chaotic);
    expect(chaoticState.parameters.equipmentRate).toBeGreaterThan(calmState.parameters.equipmentRate);
    expect(chaoticState.parameters.weatherRate).toBeGreaterThan(calmState.parameters.weatherRate);

    const quiet = freshLayout('performance');
    quiet.challenge = config({director: false, goals: [goal('servedRate', 'atLeast', 80)], fails: []});
    let state = start(quiet);
    state = step(state, 60);
    expect(state.director?.events.length ?? 0).toBe(0);
    expect(state.challenge?.failed).toBe(false);
  });
});
