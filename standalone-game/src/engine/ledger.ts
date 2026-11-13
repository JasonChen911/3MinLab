import type {SimulationState, Transaction, TransactionCategory} from './model';
import {logReplay} from './replay';

export interface LedgerSummary {
  initial: number;
  expenses: number;
  income: number;
  remaining: number;
  overBudget: number;
  estimated: number;
  actual: number;
  build: number;
  emergency: number;
  operations: number;
}

const EXPENSE_CATEGORIES: TransactionCategory[] = ['facility', 'equipment', 'staff', 'food', 'venue', 'promotion', 'emergency', 'purchase', 'other'];

export function ensureLedger(s: SimulationState) {
  s.transactions ??= [];
  s.revenue ??= 0;
  if (!Number.isFinite(s.initialBudget)) s.initialBudget = (s.snapshot.buildCost ?? 0) + s.parameters.budget;
}

/** Adds a real ledger line. `dedupe` prevents charging twice after pause/save/refresh. */
export function addTransaction(s: SimulationState, entry: Omit<Transaction, 'id'>): Transaction | null {
  ensureLedger(s);
  if (entry.dedupe && s.transactions.some(transaction => transaction.dedupe === entry.dedupe)) return null;
  const transaction: Transaction = {...entry, id: `TX-${String(s.transactions.length + 1).padStart(4, '0')}`};
  s.transactions.push(transaction);
  if (transaction.direction === 'income') s.revenue += transaction.amount;
  if (transaction.timeline) {
    const logged = logReplay(s, {
      at: transaction.at, kind: 'funding',
      tone: transaction.direction === 'income' ? 'positive' : transaction.category === 'emergency' || transaction.category === 'purchase' ? 'warning' : 'action',
      title: `${transaction.direction === 'income' ? '收入' : '支出'} · ${transaction.item}`,
      detail: `${transaction.direction === 'income' ? '入账' : '支出'} ¥${transaction.amount.toLocaleString()} · ${categoryLabel(transaction.category)}${transaction.note ? ` · ${transaction.note}` : ''}`,
      cost: transaction.amount, location: 'venue', transactionId: transaction.id,
      dedupe: `funding:${transaction.id}`, status: '已入账',
    });
    if (logged) transaction.eventRef = logged.id;
  }
  return transaction;
}

/** Charge the plan once at simulation start: venues, staffing, equipment, promotion and build. */
export function seedLedger(s: SimulationState) {
  ensureLedger(s);
  if (s.transactions.length) return;
  const buildItems = s.snapshot.buildItems ?? [];
  const buildTotal = s.snapshot.buildCost ?? 0;
  if (buildItems.length) {
    for (const item of buildItems) {
      addTransaction(s, {
        at: 0, item: `设施建设 · ${item.name}`, amount: item.cost, category: 'facility',
        direction: 'expense', note: '按当前布局一次性建设费用', dedupe: `build:${item.id}`, timeline: false,
      });
    }
    logReplay(s, {
      at: 0, kind: 'funding', tone: 'action', location: 'venue',
      title: '设施采购入账', detail: `${buildItems.length} 项设施合计 ¥${buildTotal.toLocaleString()}，已按单项写入资金台账。`,
      cost: buildTotal, dedupe: 'funding:build-summary', status: '已入账',
    });
  } else if (buildTotal > 0) {
    addTransaction(s, {
      at: 0, item: '设施建设合计', amount: buildTotal, category: 'facility',
      direction: 'expense', note: '旧存档未记录单项设施，按总额补记', dedupe: 'build:total', timeline: true,
    });
  }
  const planned = s.snapshot.planned;
  if (planned) {
    const lines: [string, number, TransactionCategory, string][] = [
      ['场地租赁', planned.venue, 'venue', '按场地规模与活动时长估算'],
      ['人员值守', planned.staff, 'staff', '按岗位人数、时长与模拟时薪估算'],
      ['设备租赁', planned.equipment, 'equipment', '按流程中使用设备的环节估算'],
      ['宣传与物料', planned.promotion, 'promotion', '按参与人数估算的宣传物料费用'],
      ['餐饮备货', planned.food, 'food', '按摊位数量与备货量估算的食品成本'],
    ];
    for (const [item, amount, category, note] of lines) {
      if (amount <= 0) continue;
      addTransaction(s, {
        at: 0, item: `计划 · ${item}`, amount, category, direction: 'expense',
        estimated: true, note: `${note}；预计费用，不计入实际支出`, dedupe: `plan:${category}`, timeline: false,
      });
    }
    const estimate = lines.reduce((total, [, amount]) => total + amount, 0);
    logReplay(s, {
      at: 0, kind: 'funding', tone: 'info', location: 'venue',
      title: '计划费用已登记', detail: `预计运营费用 ¥${estimate.toLocaleString()}（场地、人员、设备、宣传、餐饮），与实际支出分列；初始预算 ¥${s.initialBudget.toLocaleString()}。`,
      dedupe: 'funding:plan-summary', status: '计划',
    });
  }
  syncSpend(s);
}

/** Keep legacy fields in agreement with the real ledger. */
export function syncSpend(s: SimulationState) {
  ensureLedger(s);
  let base = 0, extra = 0;
  for (const transaction of s.transactions) {
    if (transaction.direction !== 'expense' || transaction.estimated) continue;
    if (transaction.category === 'emergency' || transaction.category === 'purchase') extra += transaction.amount;
    else base += transaction.amount;
  }
  s.baseSpend = base;
  s.extraSpend = extra;
}

export function ledgerSummary(s: SimulationState): LedgerSummary {
  ensureLedger(s);
  const actualLines = s.transactions.filter(transaction => !transaction.estimated);
  const expenses = actualLines.filter(transaction => transaction.direction === 'expense').reduce((total, transaction) => total + transaction.amount, 0);
  const income = actualLines.filter(transaction => transaction.direction === 'income').reduce((total, transaction) => total + transaction.amount, 0);
  const build = actualLines.filter(transaction => transaction.category === 'facility').reduce((total, transaction) => total + transaction.amount, 0);
  const emergency = actualLines.filter(transaction => transaction.category === 'emergency' || transaction.category === 'purchase').reduce((total, transaction) => total + transaction.amount, 0);
  const operations = expenses - build - emergency;
  const plannedLines = s.transactions.filter(transaction => transaction.estimated && transaction.direction === 'expense');
  const planned = s.snapshot.planned;
  const estimated = (s.snapshot.buildCost ?? 0) + (plannedLines.length
    ? plannedLines.reduce((total, transaction) => total + transaction.amount, 0)
    : planned ? planned.venue + planned.staff + planned.equipment + planned.promotion + planned.food : 0);
  return {
    initial: s.initialBudget,
    expenses,
    income,
    remaining: s.initialBudget - expenses + income,
    overBudget: Math.max(0, expenses - s.initialBudget),
    estimated: Math.max(estimated, expenses),
    actual: expenses,
    build,
    emergency,
    operations,
  };
}

export function categoryLabel(category: TransactionCategory): string {
  return ({
    facility: '设施建设', equipment: '设备租赁', staff: '人员值守', food: '餐饮',
    venue: '场地', promotion: '宣传', emergency: '应急处置', purchase: '临时采购',
    refund: '退款', income: '收入', other: '其他',
  })[category];
}

export function isExpense(transaction: Transaction) {
  return transaction.direction === 'expense' && EXPENSE_CATEGORIES.includes(transaction.category);
}