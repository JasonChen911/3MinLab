import { describe, expect, it } from 'vitest';
import { createBrief, createBriefFromPreset, refreshBrief } from './intake';
import { generatePlan } from './generator';
import { applyPatch, diffPlans, reviseBrief } from './revise';
import type { EventPlan } from '../types';

const NOW = new Date('2026-11-01T10:00:00');
const presetBrief = createBriefFromPreset('preset-welcome', { now: NOW });
const festivalBrief = createBriefFromPreset('preset-music-festival', { now: NOW });

const moduleOf = (plan: EventPlan, id: string) => plan.modules.find((module) => module.id === id)!;
const planOf = (brief: typeof presetBrief) => generatePlan(brief);

describe('自然语言修改：单项解析', () => {
  it('把预算压缩到指定金额', () => {
    const result = reviseBrief(presetBrief, '将活动预算压缩到 5000 元');
    expect(result.brief.budget).toBe(5000);
    expect(result.changes.map((change) => change.field)).toContain('预算');
    expect(planOf(result.brief).modules.find((m) => m.id === 'budget')).toBeTruthy();
    const block = moduleOf(planOf(result.brief), 'budget').blocks.find((item) => item.kind === 'budget');
    expect(block && block.kind === 'budget' ? block.total : 0).toBe(5000);
  });

  it('把人数据区间右值调整', () => {
    const result = reviseBrief(presetBrief, '将参与人数从 100 人增加到 300 人');
    expect(result.brief.people).toBe(300);
    expect(result.changes[0].field).toBe('人数');
  });

  it('把时长缩短到半天', () => {
    const result = reviseBrief(festivalBrief, '时间缩短到半天');
    expect(result.brief.durationMinutes).toBe(240);
    expect(result.changes[0].field).toBe('时长');
    const timeline = moduleOf(planOf(result.brief), 'program').blocks.find((item) => item.kind === 'timeline');
    expect(timeline && timeline.kind === 'timeline' ? timeline.entries.length : 0).toBeGreaterThan(3);
  });

  it('把场地改为室外', () => {
    const result = reviseBrief(presetBrief, '把活动改为室外举行');
    expect(result.brief.venue).toBe('outdoor');
    const riskText = JSON.stringify(moduleOf(planOf(result.brief), 'risk').blocks);
    expect(riskText).toContain('天气');
  });

  it('减少工作人员会降低人员编制', () => {
    const result = reviseBrief(presetBrief, '减少工作人员数量');
    expect(result.brief.modifiers?.staffScale).toBeLessThan(1);
    const before = planOf(presetBrief);
    const after = planOf(result.brief);
    const staffTotal = (plan: EventPlan) => {
      const block = moduleOf(plan, 'organization').blocks.find((item) => item.kind === 'staff');
      return block && block.kind === 'staff' ? block.rows.reduce((sum, row) => sum + row.count, 0) : 0;
    };
    expect(staffTotal(after)).toBeLessThan(staffTotal(before));
  });

  it('增加互动环节会写入方案并追加物资', () => {
    const result = reviseBrief(presetBrief, '增加互动环节');
    expect(result.brief.modifiers?.extraInteractions?.length).toBeGreaterThan(0);
    const plan = planOf(result.brief);
    expect(JSON.stringify(moduleOf(plan, 'program').blocks)).toContain('追加互动');
    expect(JSON.stringify(moduleOf(plan, 'resources').blocks)).toContain('互动道具');
  });

  it('识别不了的要求会明确返回，而不是猜测', () => {
    const result = reviseBrief(presetBrief, '办得更洋气一点');
    expect(result.changes).toHaveLength(0);
    expect(result.unknown[0]).toBe('办得更洋气一点');
  });
});

describe('自然语言修改：组合与联动', () => {
  it('一句话同时改预算、人数与时长', () => {
    const result = reviseBrief(festivalBrief, '预算降到 5000 元，人数增加到 300 人，时间缩短到半天');
    expect(result.brief.budget).toBe(5000);
    expect(result.brief.people).toBe(300);
    expect(result.brief.durationMinutes).toBe(240);
    expect(result.changes).toHaveLength(3);
    expect(result.brief.modifiers?.revisionNote).toContain('预算');
  });

  it('diffPlans 说明连带影响，而不只是字段变化', () => {
    const before = planOf(presetBrief);
    const revised = reviseBrief(presetBrief, '预算压缩到 5000 元，人数增加到 300 人');
    const after = planOf(revised.brief);
    const impacts = diffPlans(before, after).join('\n');
    expect(impacts).toContain('预算');
    expect(impacts).toContain('工作人员');
    expect(impacts).toContain('物资');
  });

  it('修改结果可序列化并被再次生成使用', () => {
    const revised = reviseBrief(presetBrief, '改为室外举行');
    const roundTrip = refreshBrief(JSON.parse(JSON.stringify(revised.brief)) as typeof presetBrief);
    const plan = generatePlan(roundTrip);
    expect(plan.brief.venue).toBe('outdoor');
    expect(JSON.stringify(moduleOf(plan, 'logistics').blocks)).toContain('天气');
  });

  it('无预设的自由活动也能被修改', () => {
    const brief = createBrief('社区读书会，40 人', { now: NOW });
    const result = reviseBrief(brief, '人数增加到 120 人');
    expect(result.brief.people).toBe(120);
  });
});

describe('AI 补丁兜底', () => {
  it('应用结构化补丁并生成对应说明', () => {
    const result = applyPatch(presetBrief, {
      budget: 12000,
      people: 500,
      staffScale: 0.8,
      extraInteractions: ['现场抽奖', '分组问答'],
      note: '规模变大但预算有限，建议压缩场地与礼品',
    });
    const fields = result.changes.map((change) => change.field);
    expect(fields).toEqual(expect.arrayContaining(['预算', '人数', '人员配置', '互动环节']));
    expect(result.brief.budget).toBe(12000);
    expect(result.brief.people).toBe(500);
    expect(result.brief.modifiers?.staffScale).toBe(0.8);
    expect(result.brief.modifiers?.revisionNote).toContain('压缩场地');
  });

  it('越界或空补丁会被忽略，并给出提示', () => {
    const result = applyPatch(presetBrief, { budget: -5, people: 0, staffScale: 9 });
    expect(result.changes).toHaveLength(0);
    expect(result.unknown).toHaveLength(1);
  });

  it('补丁修改后重新生成的方案预算随之变化', () => {
    const result = applyPatch(presetBrief, { budget: 12000 });
    const plan = generatePlan(result.brief);
    const block = plan.modules.find((module) => module.id === 'budget')?.blocks.find((item) => item.kind === 'budget');
    expect(block && block.kind === 'budget' ? block.total : 0).toBe(12000);
  });
});
