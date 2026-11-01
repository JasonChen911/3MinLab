import type { BudgetTemplateLine } from '../data/knowledge';
import type { EventPlan } from '../types';

export interface AllocatedLine {
  category: string;
  item: string;
  amount: number;
  share: number;
  note: string;
}

const roundTo = (value: number, step: number) => Math.round(value / step) * step;

/**
 * 按模板比例把总预算切分到各科目。
 * 规则：
 *   1. 金额按量级取整，便于报账与询价；
 *   2. 取整误差全部由"应急机动"吸收（没有该科目时由最后一笔吸收），
 *      保证分项之和恒等于预算；
 *   3. 预算为 0 时各项均为 0，界面会提示"零预算方案"。
 */
export function allocateBudget(lines: BudgetTemplateLine[], budget: number): AllocatedLine[] {
  const total = Math.max(0, Math.round(budget));
  if (total === 0) {
    return lines.map((line) => ({ category: line.category, item: line.item, amount: 0, share: 0, note: line.note }));
  }
  const step = total < 5000 ? 10 : total < 50000 ? 50 : 100;
  const allocated = lines.map((line) => {
    const raw = total * line.ratio;
    const amount = Math.max(step, roundTo(raw, step));
    return { ...line, amount };
  });

  const sum = allocated.reduce((acc, line) => acc + line.amount, 0);
  const diff = total - sum;
  const index = allocated.findIndex((line) => line.category.includes('应急'));
  const targetIndex = index >= 0 ? index : allocated.length - 1;
  const target = allocated[targetIndex];
  allocated[targetIndex] = { ...target, amount: Math.max(0, target.amount + diff) };

  return allocated.map((line) => ({
    category: line.category,
    item: line.item,
    amount: line.amount,
    share: total > 0 ? line.amount / total : 0,
    note: line.note,
  }));
}

export const formatMoney = (value: number) =>
  `¥${Math.round(value).toLocaleString('zh-CN')}`;

export const formatMoneyExact = (value: number) =>
  `¥${value.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** 人均成本，用于预算合理性提示 */
export const perCapita = (budget: number, people: number) =>
  people > 0 ? Math.round(budget / people) : 0;

/**
 * 手动修改某一笔预算：重算合计与占比，并保留"原预算"提示。
 * 修改后的方案会随 plan 一起持久化，刷新不丢失。
 */
export function editBudgetRow(plan: EventPlan, rowId: string, amount: number): EventPlan {
  const safe = Math.max(0, Math.round(Number.isFinite(amount) ? amount : 0));
  const modules = plan.modules.map((module) => {
    if (module.id !== 'budget') return module;
    return {
      ...module,
      blocks: module.blocks.map((block) => {
        if (block.kind !== 'budget') return block;
        const rows = block.rows.map((row) => (row.id === rowId ? { ...row, amount: safe } : row));
        const total = rows.reduce((sum, row) => sum + row.amount, 0);
        return {
          ...block,
          rows: rows.map((row) => ({ ...row, share: total > 0 ? row.amount / total : 0 })),
          total,
          note: `合计 ${formatMoneyExact(total)}；原预算 ${formatMoney(plan.brief.budget)}，修改后请自行核对是否仍在可承受范围。`,
        };
      }),
    };
  });
  return { ...plan, modules };
}

export { roundTo };
