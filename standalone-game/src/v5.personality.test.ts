import {describe, it, expect} from 'vitest';
import * as THREE from 'three';
import {Random} from './engine/random';
import {freshLayout, start, step} from './game';
import {PeopleSystem} from './world/people';
import {
  decideNeed, initialMood, initialNeeds, isOnDuty, needPercent, personalityFor, queueTolerance,
  stepNeeds, updateMood, type NeedContext, type Needs, type Personality,
} from './world/personality';

const context = (over: Partial<NeedContext> = {}): NeedContext => ({
  weather: 'sunny', indoor: false, queue: 0, crowd: .2,
  hasRest: true, hasWater: true, hasSocial: true, hasView: true,
  working: false, progress: .3, ...over,
});

const traits = (over: Partial<Personality> = {}): Personality => ({
  curiosity: .5, patience: .5, stamina: .5, social: .5, adventure: .5, mobility: .5, ...over,
});

const needs = (over: Partial<Needs> = {}): Needs => ({
  rest: .2, water: .2, view: .2, social: .2, exit: .1, ...over,
});

describe('V5 角色性格与动态需求', () => {
  it('同一人员种子生成固定的性格，且角色会带来差异', () => {
    const first = personalityFor(12.3, 'audience');
    const second = personalityFor(12.3, 'audience');
    expect(second).toEqual(first);
    for (const value of Object.values(first)) expect(value).toBeGreaterThanOrEqual(0);
    for (const value of Object.values(first)) expect(value).toBeLessThanOrEqual(1);
    expect(personalityFor(12.3, 'staff').patience).toBeGreaterThan(personalityFor(12.3, 'audience').patience);
    expect(isOnDuty('staff')).toBe(true);
    expect(isOnDuty('audience')).toBe(false);
  });

  it('初始需求与情绪可复现，存档字段在合理范围内', () => {
    const a = initialNeeds(4.7, 'participant');
    expect(initialNeeds(4.7, 'participant')).toEqual(a);
    for (const value of Object.values(a)) expect(value).toBeGreaterThanOrEqual(0);
    for (const value of Object.values(a)) expect(value).toBeLessThanOrEqual(1);
    const mood = initialMood(4.7, traits());
    expect(mood).toBeGreaterThanOrEqual(42);
    expect(mood).toBeLessThanOrEqual(94);
  });

  it('行走与排队累积需求，休息、补水、观看会真实缓解对应需求', () => {
    const base = needs();
    const walked = stepNeeds(base, traits(), context(), 'walking', 10);
    expect(walked.rest).toBeGreaterThan(base.rest);
    expect(walked.water).toBeGreaterThan(base.water);
    const queued = stepNeeds(base, traits(), context({queue: 30}), 'queueing', 10);
    expect(queued.rest).toBeGreaterThan(base.rest);
    expect(base).toEqual(needs());

    const tired = needs({rest: .8, water: .8, view: .8, social: .8});
    expect(stepNeeds(tired, traits(), context(), 'resting', 5).rest).toBeLessThan(tired.rest);
    expect(stepNeeds(tired, traits(), context(), 'comforting', 5).water).toBeLessThan(tired.water);
    expect(stepNeeds(tired, traits(), context(), 'watching', 5).view).toBeLessThan(tired.view);
    expect(stepNeeds(tired, traits(), context(), 'socializing', 5).social).toBeLessThan(tired.social);
  });

  it('天气与设施缺口会加快需求增长', () => {
    const base = needs();
    const sunny = stepNeeds(base, traits(), context(), 'watching', 8);
    const rainy = stepNeeds(base, traits(), context({weather: 'heavyRain'}), 'watching', 8);
    const sheltered = stepNeeds(base, traits(), context({weather: 'heavyRain', indoor: true}), 'watching', 8);
    const dry = stepNeeds(base, traits(), context({hasWater: false}), 'watching', 8);
    const noRest = stepNeeds(base, traits(), context({hasRest: false}), 'watching', 8);
    expect(rainy.exit).toBeGreaterThan(sunny.exit);
    expect(rainy.exit).toBeGreaterThan(sheltered.exit);
    expect(dry.water).toBeGreaterThan(sunny.water);
    expect(noRest.rest).toBeGreaterThan(sunny.rest);
  });

  it('需求未满足拉低情绪，设施齐备且有耐心时情绪更稳定', () => {
    const bad = needs({rest: .9, water: .9, view: .9, social: .9, exit: .8});
    const good = needs({rest: .1, water: .1, view: .1, social: .1, exit: .05});
    const strained = updateMood(70, traits(), bad, context({queue: 40, crowd: .9, hasRest: false, hasWater: false}), 10);
    const calm = updateMood(70, traits({patience: .9}), good, context(), 10);
    expect(strained).toBeLessThan(70);
    expect(calm).toBeGreaterThanOrEqual(70);
    expect(updateMood(50, traits(), needs(), context(), 0)).toBe(50);
    expect(updateMood(99, traits(), good, context(), 60)).toBeLessThanOrEqual(100);
  });

  it('规则与概率决定行为：补水、休息、社交、观看和提前离场', () => {
    const comfort = decideNeed(needs({water: .8}), traits(), context(), 70, true, new Random(3));
    expect(comfort?.action).toBe('comfort');
    const rest = decideNeed(needs({rest: .85}), traits(), context(), 70, true, new Random(3));
    expect(rest?.action).toBe('rest');
    const social = decideNeed(needs({social: .85}), traits({social: .8}), context(), 70, true, new Random(3));
    expect(social?.action).toBe('social');
    const view = decideNeed(needs({view: .9}), traits({curiosity: .8}), context(), 70, true, new Random(3));
    expect(view?.action).toBe('view');
    const lowSocial = decideNeed(needs({social: .9, water: .1, rest: .1, view: .1}), traits({social: .1}), context(), 70, true, new Random(3));
    expect(lowSocial).toBeNull();
  });

  it('离场由情绪、出口需求和设施缺失共同触发，在岗人员不擅自离场', () => {
    const exhausted = decideNeed(needs({exit: .99}), traits(), context(), 60, true, new Random(5));
    expect(exhausted?.action).toBe('leave');
    const sad = decideNeed(needs({exit: .5}), traits(), context(), 20, true, new Random(5));
    expect(sad?.action).toBe('leave');
    expect(sad?.reason).toContain('情绪');
    const thirsty = decideNeed(needs({water: .96, exit: .01}), traits(), context({hasWater: false}), 80, true, new Random(5));
    expect(thirsty?.action).toBe('leave');
    expect(thirsty?.reason).toContain('补水设施');
    const onDuty = decideNeed(needs({exit: 1}), traits(), context({working: true}), 10, false, new Random(5));
    expect(onDuty?.action).not.toBe('leave');
  });

  it('低耐心访客排队更早放弃，需求百分比被限制在 0..100', () => {
    expect(queueTolerance(traits({patience: .9}), 20)).toBeGreaterThan(queueTolerance(traits({patience: .1}), 20));
    expect(needPercent(-.4)).toBe(0);
    expect(needPercent(1.6)).toBe(100);
    expect(needPercent(.456)).toBe(46);
  });

  it('人物系统接入性格与需求，并按真实状态机切换行为', () => {
    const scene = new THREE.Scene();
    const system = new PeopleSystem(scene);
    const layout = freshLayout('performance');
    system.setLayout(layout);
    system.setState(step(start(layout), 30));
    for (let i = 0; i < 160; i++) system.update(.5);
    const agents = (system as unknown as {
      agents: {id: string; active: boolean; state: string; mood: number; personality: Personality; needs: Needs}[];
    }).agents.filter(agent => agent.active);
    expect(agents.length).toBeGreaterThan(0);
    const states = new Set<string>();
    for (const agent of agents) {
      states.add(agent.state);
      for (const value of Object.values(agent.personality)) expect(value).toBeGreaterThanOrEqual(0);
      for (const value of Object.values(agent.personality)) expect(value).toBeLessThanOrEqual(1);
      for (const value of Object.values(agent.needs)) expect(Number.isFinite(value)).toBe(true);
      expect(agent.mood).toBeGreaterThanOrEqual(0);
      expect(agent.mood).toBeLessThanOrEqual(100);
    }
    expect([...states].some(state => ['toComfort', 'comforting', 'toRest', 'resting', 'toSocial', 'socializing', 'leaving', 'queueing', 'watching', 'patrolling', 'serving'].includes(state))).toBe(true);
    const info = system.info(agents[0].id);
    expect(info).not.toBeNull();
    expect(info?.personality).toBeTruthy();
    expect(info?.needs).toBeTruthy();
    expect(typeof info?.intent).toBe('string');
    const saved = system.snapshot()[0];
    expect(saved.personality).toBeTruthy();
    expect(saved.needs).toBeTruthy();
    expect(Number.isFinite(saved.mood)).toBe(true);
    system.dispose();
  });

  it('缺少补水设施时，访客会在需求无法满足时提前离场', () => {
    const scene = new THREE.Scene();
    const system = new PeopleSystem(scene);
    const layout = freshLayout('performance');
    layout.items = layout.items.filter(item => item.kind !== 'toilet' && item.kind !== 'service');
    system.setLayout(layout);
    system.setState(step(start(layout), 30));
    const reasons = new Set<string>();
    for (let tick = 0; tick < 320; tick++) {
      system.update(1);
      for (const agent of (system as unknown as {agents: {active: boolean; state: string; intent: string}[]}).agents) {
        if (agent.active && agent.state === 'leaving') reasons.add(agent.intent);
      }
    }
    const triggered = [...reasons].some(reason =>
      reason.includes('补水设施') || reason.includes('离场需求') || reason.includes('情绪降到') || reason.includes('耐心耗尽'));
    expect(triggered).toBe(true);
    system.dispose();
  });
});
