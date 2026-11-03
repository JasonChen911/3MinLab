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

  const shares=budgetPercentages(allocated.map(line=>line.amount));
  return allocated.map((line,index) => ({
    category: line.category,
    item: line.item,
    amount: line.amount,
    share: shares[index]/100,
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
export function budgetPercentages(amounts: number[]): number[] {
  const total=amounts.reduce((sum,n)=>sum+n,0);if(!total)return amounts.map(()=>0);
  const raw=amounts.map(n=>n/total*100), result=raw.map(Math.floor);
  const order=raw.map((n,i)=>({i,remainder:n-result[i]})).sort((a,b)=>b.remainder-a.remainder||a.i-b.i);
  const remaining=100-result.reduce((a,b)=>a+b,0);
  for(let i=0;i<remaining;i++)result[order[i].i]++;
  return result;
}
export function synchronizeBudget(plan: EventPlan): EventPlan {
  const block=plan.modules.find(m=>m.id==='budget')?.blocks.find(b=>b.kind==='budget');if(!block||block.kind!=='budget')return plan;
  const rows=block.rows.map(row=>({...row,amount:Math.max(0,Math.round(Number.isFinite(row.amount)?row.amount:0))}));
  const total=rows.reduce((sum,row)=>sum+row.amount,0), percentages=budgetPercentages(rows.map(r=>r.amount));
  const oldMoney=formatMoney(plan.brief.budget), money=formatMoney(total), person=formatMoney(perCapita(total,plan.brief.people));
  const escapedMoney=oldMoney.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const replace=(text:string)=>text.replace(/人均(?:成本)?\s*¥[\d,]+/g,match=>match.replace(/¥[\d,]+/,person)).replace(new RegExp(escapedMoney+'(?![0-9,])','g'),money);
  const buckets=new Map<string,number>();rows.forEach(r=>buckets.set(r.bucket,(buckets.get(r.bucket)??0)+r.amount));
  return {...plan,brief:{...plan.brief,budget:total,sources:{...plan.brief.sources,budget:'user'}},oneLiner:replace(plan.oneLiner),modules:plan.modules.map(module=>({...module,summary:module.id==='budget'?`${money}，${rows.length} 个科目，人均 ${person}`:replace(module.summary),blocks:module.blocks.map(b=>{
    if(b===block)return {...b,rows:rows.map((row,i)=>({...row,share:percentages[i]/100})),total,note:`分项合计 ${money}；所有金额为计划估算，实际支出另行登记。`};
    if(module.id==='budget'&&b.kind==='bullets'&&b.title==='分类小计')return {...b,items:[...buckets].map(([name,value])=>`${name} ${formatMoney(value)}`)};
    if(b.kind==='text')return {...b,text:replace(b.text)};
    if(b.kind==='bullets'||b.kind==='checklist')return {...b,items:b.items.map(replace)};
    if(b.kind==='table')return {...b,rows:b.rows.map(row=>row.map(replace))};
    return b;
  })}))};
}
export function editBudgetRow(plan: EventPlan, rowId: string, amount: number): EventPlan {
  return synchronizeBudget({...plan,modules:plan.modules.map(module=>module.id!=='budget'?module:{...module,blocks:module.blocks.map(block=>block.kind!=='budget'?block:{...block,rows:block.rows.map(row=>row.id===rowId?{...row,amount}:row)})})});
}
export { roundTo };
