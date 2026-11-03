import { synchronizeBudget } from './budget';
import type { EventPlan, ModuleId } from '../types';
export function editPlanRows(plan:EventPlan,moduleId:ModuleId,index:number,rows:string[][]):EventPlan {
 const next:EventPlan = {...plan,modules:plan.modules.map(module=>module.id!==moduleId?module:{...module,blocks:module.blocks.map((block,position)=>{
  if(position!==index)return block;
  switch(block.kind){
   case 'table':return {...block,rows};
   case 'timeline':return {...block,entries:rows.map(row=>({time:row[0]??'',title:row[1]??'',detail:row[2]??''}))};
   case 'staff':return {...block,rows:rows.map(row=>({role:row[0]??'',layer:row[1]??'',count:Math.max(0,Math.floor(Number(row[2])||0)),duty:row[3]??'',basis:row[4]??''}))};
   case 'kpis':return {...block,rows:rows.map(row=>({name:row[0]??'',target:row[1]??'',method:row[2]??''}))};
   case 'text':return {...block,text:rows.map(row=>row[0]??'').join('\n')};
   case 'bullets':case 'checklist':return {...block,items:rows.map(row=>row[0]??'')};
   case 'budget':{const updated=rows.map((row,i)=>({id:block.rows[i]?.id??`manual-${Date.now()}-${i}`,bucket:row[0]??'',category:row[1]??'',item:row[2]??'',amount:Math.max(0,Number(row[3])||0),share:0,note:row[4]??''}));const total=updated.reduce((sum,row)=>sum+row.amount,0);return {...block,rows:updated.map(row=>({...row,share:total?row.amount/total:0})),total,note:`组织者调整后的分项合计 ¥${total.toLocaleString()}；活动总预算 ¥${plan.brief.budget.toLocaleString()}。实际支出请在活动资料中登记。`};}
  }
 })})};
 return moduleId==='budget'?synchronizeBudget(next):next;
}
