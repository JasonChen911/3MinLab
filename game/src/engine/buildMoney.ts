import {CATALOG, itemCost, type Item} from '../game';
import type {MoneyTransaction} from './model';

/** Ledger entries describe planning costs; their net equals the current layout cost. */
export function updateBuildLedger(before: Item[], after: Item[], previous?: MoneyTransaction[], at = 0): MoneyTransaction[] {
  const ledger: MoneyTransaction[] = previous ? [...previous] : before.map(item => ({
    id: `facility:initial:${item.id}`, at: 0, title: `${CATALOG[item.kind].name} · 初始配置`,
    amount: itemCost(item), category: 'facility', sourceId: item.id,
  }));
  const old = new Map(before.map(item => [item.id, item]));
  const next = new Map(after.map(item => [item.id, item]));
  for (const id of new Set([...old.keys(), ...next.keys()])) {
    const was = old.get(id), now = next.get(id);
    const delta = (now ? itemCost(now) : 0) - (was ? itemCost(was) : 0);
    if (!delta) continue;
    ledger.push({id: `build:${ledger.length + 1}:${id}`, at,
      title: `${CATALOG[(now ?? was)!.kind].name} · ${delta < 0 ? '预算返还' : was ? '配置升级' : '新增配置'}`,
      amount: delta, category: delta < 0 ? 'refund' : 'facility', sourceId: id});
  }
  return ledger;
}
