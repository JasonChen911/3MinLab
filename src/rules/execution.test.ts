import { describe, expect, it } from 'vitest';
import { createBrief, createBriefFromPreset } from './intake';
import { generatePlan } from './generator';
import { buildPlanMarkdown } from './export';
import { reviseBrief } from './revise';
import type { Block, EventPlan, ModuleId } from '../types';

const NOW = new Date('2026-11-01T10:00:00');
const marathon = generatePlan(createBrief('办一场 800 人的校园马拉松，预算 6 万，户外赛道，11月20日', { now: NOW }));
const science = generatePlan(createBriefFromPreset('preset-science', { now: NOW }));

const moduleOf = (plan: EventPlan, id: ModuleId) => plan.modules.find((module) => module.id === id)!;
const tablesOf = (plan: EventPlan, id: ModuleId) => moduleOf(plan, id).blocks.filter((block): block is Extract<Block, { kind: 'table' }> => block.kind === 'table');

const staffRoles = (plan: EventPlan) => {
  const block = moduleOf(plan, 'organization').blocks.find((item) => item.kind === 'staff');
  return block && block.kind === 'staff' ? block.rows.map((row) => row.role) : [];
};

describe('执行时间轴：六阶段', () => {
  it('按筹备、宣传、检查、执行、收尾、总结六个阶段输出', () => {
    const tables = tablesOf(marathon, 'execution');
    expect(tables.length).toBeGreaterThanOrEqual(6);
    const titles = tables.map((table) => table.title ?? '');
    ['活动筹备', '宣传招募', '前期检查', '正式执行', '活动收尾', '后期总结'].forEach((label) => {
      expect(titles.some((title) => title.includes(label))).toBe(true);
    });
  });

  it('每个任务都有负责人、完成时间与所需资源', () => {
    const tables = tablesOf(marathon, 'execution');
    const roles = staffRoles(marathon);
    tables.forEach((table) => {
      expect(table.head).toEqual(['任务', '负责人', '完成时间', '所需资源']);
      table.rows.forEach((row) => {
        expect(row).toHaveLength(4);
        expect(row[0].length).toBeGreaterThan(4);
        expect(roles).toContain(row[1]);
        expect(row[2].length).toBeGreaterThan(2);
        expect(row[3].length).toBeGreaterThan(2);
      });
    });
  });

  it('完成时间按活动日期换算，而不是只写 T-30', () => {
    const text = JSON.stringify(tablesOf(marathon, 'execution'));
    expect(text).toContain('11月');
  });
});

describe('任务分工表：组织架构', () => {
  it('岗位表包含层级、人数依据与职责', () => {
    const block = moduleOf(marathon, 'organization').blocks.find((item) => item.kind === 'staff');
    if (!block || block.kind !== 'staff') throw new Error('缺少人员表');
    expect(block.rows.length).toBeGreaterThan(3);
    block.rows.forEach((row) => {
      expect(row.layer).toBeTruthy();
      expect(row.basis).toMatch(/每 \d+ 人|固定/);
      expect(row.duty.length).toBeGreaterThan(4);
    });
  });

  it('组织架构按四层归组', () => {
    const text = JSON.stringify(moduleOf(marathon, 'organization').blocks);
    expect(text).toContain('决策：');
    expect(text).toContain('执行与保障：');
  });
});

describe('预算清单：标准类别与估算标注', () => {
  const block = moduleOf(marathon, 'budget').blocks.find((item) => item.kind === 'budget');

  it('所有科目归入 8 个标准类别', () => {
    if (!block || block.kind !== 'budget') throw new Error('缺少预算块');
    const allowed = ['场地', '设备', '物资', '人员', '宣传', '交通', '餐饮', '应急备用金'];
    block.rows.forEach((row) => expect(allowed).toContain(row.bucket));
  });

  it('分项之和等于总预算，并明确标注估算', () => {
    if (!block || block.kind !== 'budget') throw new Error('缺少预算块');
    const sum = block.rows.reduce((total, row) => total + row.amount, 0);
    expect(sum).toBe(block.total);
    expect(block.note).toContain('估算');
    expect(block.note).toContain('不是供应商报价');
  });

  it('导出文本包含分类小计与估算说明', () => {
    const markdown = buildPlanMarkdown(marathon);
    expect(markdown).toContain('| 类别 | 科目 | 项目 | 金额 | 占比 |');
    expect(markdown).toContain('估算');
  });

  it('预算与规模明显不匹配时给出合理性提示', () => {
    const festival = createBriefFromPreset('preset-music-festival', { now: NOW });
    const revised = reviseBrief(festival, '预算压缩到 5000 元');
    const plan = generatePlan(revised.brief);
    const text = JSON.stringify(moduleOf(plan, 'budget').blocks);
    expect(text).toContain('预算合理性提示');
    expect(text).toContain('人均');
  });
});

describe('物资清单：用途、优先级与负责人', () => {
  it('每行都有五列且优先级合法', () => {
    const table = tablesOf(marathon, 'resources')[0];
    expect(table.head).toEqual(['物资 / 资源', '数量估算', '用途', '采购优先级', '负责人']);
    table.rows.forEach((row) => {
      expect(row).toHaveLength(5);
      expect(['高', '中', '低']).toContain(row[3]);
      expect(row[4].length).toBeGreaterThan(1);
    });
  });

  it('急救类物资被标为高优先级并由安全岗负责', () => {
    const table = tablesOf(marathon, 'resources')[0];
    const aed = table.rows.find((row) => row[0].includes('AED') || row[0].includes('急救'));
    expect(aed).toBeTruthy();
    expect(aed![3]).toBe('高');
    expect(aed![2]).toBe('应急处置');
  });
});

describe('风险预测：七要素与安全强化', () => {
  it('风险表包含可能性、影响、等级、预防、应急与责任人', () => {
    const table = tablesOf(marathon, 'risk')[0];
    expect(table.head).toEqual(['风险（诱因）', '可能性', '影响', '等级', '预防措施', '应急方案', '责任人']);
    table.rows.forEach((row) => {
      expect(row[1]).toMatch(/^\d\/3$/);
      expect(row[2]).toMatch(/^\d\/3$/);
      expect(['高', '中', '低']).toContain(row[3]);
      expect(row[6].length).toBeGreaterThan(1);
    });
  });

  it('大型户外活动触发安全与合规强化', () => {
    const text = JSON.stringify(moduleOf(marathon, 'risk').blocks);
    expect(text).toContain('安全与合规强化');
    expect(text).toContain('保险');
  });

  it('涉及未成年人的科普活动强化看护与监护人同意', () => {
    const text = JSON.stringify(moduleOf(science, 'risk').blocks);
    expect(text).toContain('未成年人');
    expect(text).toContain('监护人');
  });
});

describe('效果评估：按目标设计的指标', () => {
  it('覆盖到场、转化率、参与度、满意度、完成率与成果', () => {
    const block = moduleOf(marathon, 'evaluation').blocks.find((item) => item.kind === 'kpis');
    if (!block || block.kind !== 'kpis') throw new Error('缺少指标块');
    const names = block.rows.map((row) => row.name).join('|');
    expect(names).toContain('实际到场人数');
    expect(names).toContain('报名转化率');
    expect(names).toContain('现场参与度');
    expect(names).toContain('参与者满意度');
    expect(names).toContain('活动完成率');
    expect(names).toContain('实际成果');
  });

  it('指标目标随人数变化', () => {
    const small = generatePlan(createBrief('80 人的社区读书会', { now: NOW }));
    const block = moduleOf(small, 'evaluation').blocks.find((item) => item.kind === 'kpis');
    if (!block || block.kind !== 'kpis') throw new Error('缺少指标块');
    const attendance = block.rows.find((row) => row.name === '实际到场人数')!;
    expect(attendance.target).toContain('64');
  });
});
