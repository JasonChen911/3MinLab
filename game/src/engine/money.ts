import type {MoneyTransaction, SimulationState} from './model';

/** A source can charge only once, including after a saved run is restored. */
export function charge(s: SimulationState, transaction: Omit<MoneyTransaction, 'id'>): MoneyTransaction | null {
  const list = s.transactions ??= s.extraSpend ? [{id: 'incident:legacy', at: s.minute, title: '旧存档应急支出汇总', amount: s.extraSpend, category: 'incident', sourceId: 'legacy'}] : [];
  const id = `${transaction.category}:${transaction.sourceId}`;
  if (list.some(entry => entry.id === id)) return null;
  if (!Number.isFinite(transaction.amount) || transaction.amount < 0) throw new Error('无效资金变动');
  const entry = {...transaction, id};
  list.push(entry);
  s.extraSpend = list.reduce((sum, row) => sum + row.amount, 0);
  return entry;
}

export function emergencyTotal(s: SimulationState): number {
  return s.transactions ? s.transactions.reduce((sum, row) => sum + row.amount, 0) : s.extraSpend;
}
