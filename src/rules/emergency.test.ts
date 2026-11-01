import { describe, expect, it } from 'vitest';
import { applyEmergency, EMERGENCIES } from './emergency';
import { createBriefFromPreset } from './intake';
import { generatePlan } from './generator';
import { buildPlanMarkdown } from './export';

describe('突发情况调整', () => {
  it.each(EMERGENCIES)('$name 保留已编辑内容，仅追加应急安排并进入导出', ({ id, name }) => {
    const plan = generatePlan(createBriefFromPreset('preset-welcome'));
    plan.modules.find((module) => module.id === 'program')!.blocks.push({ kind: 'text', text: '用户自定的特别环节' });
    const original = JSON.stringify(plan);
    const next = applyEmergency(plan, id, '现场已经联系备用教室');
    expect(JSON.stringify(plan)).toBe(original);
    expect(next.id).toBe(plan.id);
    expect(next.brief).toEqual(plan.brief);
    for (const module of plan.modules) {
      const updated = next.modules.find((item) => item.id === module.id)!;
      expect(updated.blocks.slice(0, module.blocks.length)).toEqual(module.blocks);
      expect(updated.blocks.length > module.blocks.length).toBe(['program', 'execution', 'risk'].includes(module.id));
    }
    const markdown = buildPlanMarkdown(next);
    expect(markdown).toContain(name);
    expect(markdown).toContain('用户自定的特别环节');
    expect(markdown).toContain('现场已经联系备用教室');
  });
});
