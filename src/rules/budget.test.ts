import { describe,it,expect } from 'vitest';
import { createBriefFromPreset } from './intake';
import { generatePlan } from './generator';
import { budgetPercentages,editBudgetRow,synchronizeBudget,formatMoney } from './budget';
import { editPlanRows } from './editPlan';
import { IDBFactory } from 'fake-indexeddb';
import { IndexedProjectRepository,saveProjectParts } from '../projects/repository';
import { detectScene } from '../workbench/model';
const fresh=()=>generatePlan(createBriefFromPreset('campus-welcome'));
const budget=(plan:ReturnType<typeof fresh>)=>{const b=plan.modules.find(m=>m.id==='budget')!.blocks.find(b=>b.kind==='budget');if(!b||b.kind!=='budget')throw Error('budget missing');return b;};
function check(plan:ReturnType<typeof fresh>){const b=budget(plan);expect(b.total).toBe(b.rows.reduce((s,r)=>s+r.amount,0));expect(plan.brief.budget).toBe(b.total);expect(b.rows.reduce((s,r)=>s+Math.round(r.share*100),0)).toBe(b.total?100:0);expect(plan.modules.find(m=>m.id==='budget')!.summary).toContain(formatMoney(b.total));expect(plan.oneLiner).toContain(formatMoney(b.total));}
describe('预算统一数据源',()=>{
 it('最大余数分配、零预算',()=>{expect(budgetPercentages([1,1,1])).toEqual([34,33,33]);expect(budgetPercentages([0,0])).toEqual([0,0]);});
 it('金额连续修改并同步摘要、简报、人均、分类',()=>{let p=fresh();for(const amount of [2000,0,3001,NaN,Infinity,-1,500]){p=editBudgetRow(p,budget(p).rows[0].id,amount);check(p);}const b=budget(p);expect(p.modules.find(m=>m.id==='budget')!.blocks.find(x=>x.kind==='bullets'&&x.title==='分类小计')).toBeTruthy();expect(b.rows[0].amount).toBe(500);});
 it('添加、删除、类别修改和清空明细',()=>{let p=fresh();const index=p.modules.find(m=>m.id==='budget')!.blocks.findIndex(b=>b.kind==='budget');p=editPlanRows(p,'budget',index,[['新类别','测试科目','测试项目','100',''],['新类别','另一个','项目','200','']]);check(p);expect(budget(p).rows).toHaveLength(2);p=editPlanRows(p,'budget',index,[['场地','科目','项目','50','']]);check(p);p=editPlanRows(p,'budget',index,[]);check(p);});
 it('序列化重新打开后保持一致',()=>{const p=editBudgetRow(fresh(),budget(fresh()).rows[0].id,2000);check(synchronizeBudget(JSON.parse(JSON.stringify(p))));});
 it('IndexedDB 保存后重新打开预算一致',async()=>{const db=new IDBFactory();const repo=new IndexedProjectRepository(db,'budget-reopen');const p=editBudgetRow(fresh(),budget(fresh()).rows[0].id,2000);await saveProjectParts(p.id,{draft:p.brief,plan:p},repo);const reopened=await new IndexedProjectRepository(db,'budget-reopen').get(p.id);expect(reopened?.draft.budget).toBe(p.brief.budget);check(reopened!.plan!);});
 it('校园活动进入通用工具场景',()=>{const p=fresh();expect(detectScene({...p,title:'校园迎新',brief:{...p.brief,family:'campus'}})).toBe('custom');});
});
