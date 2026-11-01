import { describe, expect, it } from 'vitest';
import { PRESETS, getPreset, presetsInGroup } from './presets';
import { GROUPS, getCategory } from './taxonomy';
import { clearPreset, createBrief, createBriefFromPreset } from '../rules/intake';
import { generatePlan } from '../rules/generator';
import type { EventPlan, ModuleId } from '../types';

const NOW = new Date('2026-11-01T10:00:00');

const moduleOf = (plan: EventPlan, id: ModuleId) => plan.modules.find((module) => module.id === id)!;

const timelineTitles = (plan: EventPlan) => {
  const block = moduleOf(plan, 'program').blocks.find((item) => item.kind === 'timeline');
  return block && block.kind === 'timeline' ? block.entries.map((entry) => entry.title) : [];
};

const budgetCategories = (plan: EventPlan) => {
  const block = moduleOf(plan, 'budget').blocks.find((item) => item.kind === 'budget');
  return block && block.kind === 'budget' ? block.rows.map((row) => row.category) : [];
};

const roleNames = (plan: EventPlan) => {
  const block = moduleOf(plan, 'organization').blocks.find((item) => item.kind === 'staff');
  return block && block.kind === 'staff' ? block.rows.map((row) => row.role) : [];
};

const riskTitles = (plan: EventPlan) => {
  const block = moduleOf(plan, 'risk').blocks.find((item) => item.kind === 'table');
  return block && block.kind === 'table' ? block.rows.map((row) => row[0]) : [];
};

describe('预设库', () => {
  it('提供 12 个预设，覆盖 10 个分类入口', () => {
    expect(PRESETS).toHaveLength(12);
    expect(new Set(PRESETS.map((preset) => preset.id)).size).toBe(12);
    expect(GROUPS).toHaveLength(10);
    expect(GROUPS.map((group) => group.id)).toEqual([
      'campus-education', 'sports', 'charity', 'business', 'culture',
      'community', 'tech', 'conference', 'festival', 'custom',
    ]);
  });

  it.each(PRESETS.map((preset) => [preset.name, preset] as const))('%s 具备完整的八项内容', (_name, preset) => {
    expect(preset.intro.length).toBeGreaterThan(40);
    expect(preset.audience.length).toBeGreaterThan(3);
    expect(preset.goal.length).toBeGreaterThan(8);
    expect(preset.flow.length).toBeGreaterThanOrEqual(5);
    expect(preset.roles.length).toBeGreaterThanOrEqual(4);
    expect(preset.materials.length).toBeGreaterThanOrEqual(7);
    expect(preset.budgetLines.length).toBeGreaterThanOrEqual(6);
    expect(preset.risks.length).toBeGreaterThanOrEqual(3);
    expect(preset.highlights.length).toBeGreaterThanOrEqual(2);
  });

  it.each(PRESETS.map((preset) => [preset.name, preset] as const))('%s 的预算比例合计为 1', (_name, preset) => {
    const total = preset.budgetLines.reduce((sum, line) => sum + line.ratio, 0);
    expect(total).toBeCloseTo(1, 5);
  });

  it('每个预设都指向存在的活动类型与分类', () => {
    PRESETS.forEach((preset) => {
      expect(getCategory(preset.categoryId).id).toBe(preset.categoryId);
      expect(GROUPS.some((group) => group.id === preset.group && group.categories.includes(preset.categoryId))).toBe(true);
      expect(presetsInGroup(preset.group)).toContain(preset);
    });
  });

  it('查询不存在的预设返回 undefined', () => {
    expect(getPreset('not-a-preset')).toBeUndefined();
    expect(getPreset(undefined)).toBeUndefined();
  });
});

describe('预设起稿', () => {
  it('点击预设后基础信息被预填，并标记为「预设」来源', () => {
    const brief = createBriefFromPreset('preset-welcome', { now: NOW });
    const preset = getPreset('preset-welcome')!;
    expect(brief.presetId).toBe('preset-welcome');
    expect(brief.title).toBe(preset.name);
    expect(brief.people).toBe(preset.people);
    expect(brief.budget).toBe(preset.budget);
    expect(brief.venue).toBe(preset.venue);
    expect(brief.sources.people).toBe('preset');
    expect(brief.sources.category).toBe('preset');
    expect(brief.sources.date).toBe('assumed');
  });

  it('清除预设后解除关联并退回该类型的默认值', () => {
    const brief = createBriefFromPreset('preset-welcome', { now: NOW });
    const cleared = clearPreset(brief);
    const category = getCategory(brief.categoryId);
    expect(cleared.presetId).toBeUndefined();
    expect(cleared.people).toBe(category.defaultPeople);
    expect(cleared.sources.people).toBe('assumed');
    expect(cleared.sources.category).toBe('preset');
  });

  it('判断不出类型时保留「假设」来源，交给界面询问', () => {
    const brief = createBrief('随便搞点有意思的事情', { now: NOW });
    expect(brief.sources.category).toBe('assumed');
    expect(brief.categoryId).toBe('generic-event');
  });
});

describe('预设生成的方案确有区别', () => {
  const welcome = generatePlan(createBriefFromPreset('preset-welcome', { now: NOW }));
  const festival = generatePlan(createBriefFromPreset('preset-music-festival', { now: NOW }));
  const jobfair = generatePlan(createBriefFromPreset('preset-jobfair', { now: NOW }));

  it('流程不同', () => {
    expect(timelineTitles(welcome)).not.toEqual(timelineTitles(festival));
    expect(timelineTitles(festival)).not.toEqual(timelineTitles(jobfair));
    expect(timelineTitles(welcome)).toContain('班级破冰');
    expect(timelineTitles(festival)).toContain('乐队轮演');
    expect(timelineTitles(jobfair)).toContain('简历门诊');
  });

  it('人员配置不同', () => {
    expect(roleNames(welcome)).not.toEqual(roleNames(festival));
    expect(roleNames(welcome)).toContain('班级带队');
    expect(roleNames(festival)).toContain('舞台监督');
    expect(roleNames(jobfair)).toContain('企业服务');
  });

  it('预算结构不同', () => {
    expect(budgetCategories(welcome)).not.toEqual(budgetCategories(festival));
    expect(budgetCategories(festival)).toContain('舞台技术');
    expect(budgetCategories(jobfair)).toContain('展位搭建');
  });

  it('风险清单不同', () => {
    expect(riskTitles(welcome)).not.toEqual(riskTitles(festival));
    expect(riskTitles(festival).join()).toContain('拥挤踩踏');
    expect(riskTitles(jobfair).join()).toContain('企业到场率低');
  });

  it('方案里标注了预设来源与特色环节', () => {
    const text = JSON.stringify(welcome.modules);
    expect(text).toContain('预设模板：新生迎新活动');
    expect(text).toContain('本预设特色环节');
    expect(text).toContain('班级第一次合影');
  });
});
