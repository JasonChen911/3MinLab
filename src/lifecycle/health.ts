import type {EventPlan} from '../types';
import type {Workspace} from '../workbench/model';
import {expenseStats} from '../materials/import';
export type Check={id:string;module:string;level:'ok'|'warning'|'error';title:string;detail:string;action:string};
export function minutes(value:string){const m=/^(\d{1,2}):(\d{2})$/.exec(value.trim());return m&&+m[1]<24&&+m[2]<60?+m[1]*60 + +m[2]:null;}
export function checkPlan(plan:EventPlan,w:Workspace):Check[]{
 const result:Check[]=[];const add=(id:string,module:string,level:Check['level'],title:string,detail:string,action:string)=>result.push({id,module,level,title,detail,action});
 const valid=w.flow.filter(f=>{const a=minutes(f.start),b=minutes(f.end);return a!==null&&b!==null&&b>a;});
 add('flow','流程',valid.length===w.flow.length&&valid.length?'ok':'error','流程时间完整性',`${valid.length}/${w.flow.length} 个环节具备有效的同日开始和结束时间`,'补充时间；跨日活动请拆分日期后核对');
 const sorted=[...valid].sort((a,b)=>minutes(a.start)!-minutes(b.start)!);
 let conflicts=0;
 for(let i=0;i<sorted.length;i++){const a=sorted[i];for(const b of sorted.slice(i+1)){if(minutes(b.start)!>=minutes(a.end)!)break;
  const sameVenue=!!a.venue&&a.venue===b.venue;const sharedPeople=[a.owner,...a.people].filter(Boolean).filter(p=>[b.owner,...b.people].includes(p));const equipment=a.equipment.split(/[、,，;；]/).filter(Boolean).filter(x=>b.equipment.split(/[、,，;；]/).includes(x));
  if(sameVenue||sharedPeople.length||equipment.length){conflicts++;add(`conflict-${a.id}-${b.id}`,'流程 / 人员 / 资源','error',`${a.title} 与 ${b.title} 重叠`,[sameVenue?'同一场地':'',sharedPeople.length?`共用人员：${sharedPeople.join('、')}`:'',equipment.length?`共用设备：${equipment.join('、')}`:''].filter(Boolean).join('；'),'调整时间或明确独立场地、人员及设备容量');}
 }const b=sorted[i+1];if(b&&minutes(b.start) === minutes(a.end))add('buffer-'+a.id,'流程','warning',`${a.title} 后没有缓冲`,'两个环节首尾相接；是否需要转换时间应由组织者确认','确认转场、设备调试和人流转换所需时间');}
 if(!conflicts)add('no-conflict','流程','ok','未检出已填信息中的资源冲突','仅检查已填写的相同场地、人员、设备名称','未填写的资源仍需人工确认');
 const unassigned=w.flow.filter(f=>!f.owner.trim());add('owners','人员',unassigned.length?'warning':'ok','环节负责人',unassigned.length?`${unassigned.length} 个环节尚无负责人：${unassigned.map(f=>f.title).join('、')}`:'所有环节均填写负责人','在人员与任务中指定负责人和关键岗位替补');
 const staff=plan.modules.flatMap(m=>m.blocks).filter(b=>b.kind==='staff').flatMap(b=>b.rows).reduce((s,r)=>s+r.count,0);
 const assignedNames=(w.tables.tasks?.rows??[]).map(t=>t.owner);const crew=w.people.filter(p=>p.roles.some(r=>/工作|志愿|组织|裁判|技术|主持|安保|统筹|后勤|执行|接待|摄影/.test(r))||assignedNames.includes(p.name)).length;
 add('staff','人员',crew>=staff&&staff>0?'ok':'warning','配置人数核对',`策划岗位需求合计 ${staff}；已标注工作角色或承担任务 ${crew} 人（名单共 ${w.people.length} 人；需核验可用时间）`,'补充人员技能、可用时间和替补');
 const budget=plan.modules.flatMap(m=>m.blocks).find(b=>b.kind==='budget');const planned=budget?.kind==='budget'?budget.rows.reduce((s,r)=>s+r.amount,0):0;const expense=expenseStats(w,plan.brief.budget);
 add('budget','预算',planned>plan.brief.budget||expense.used>plan.brief.budget?'error':budget?'ok':'warning','预算与实际支出',`总额 ¥${plan.brief.budget}；方案明细 ¥${planned}；实际记录 ¥${expense.used}`,'核对明细与已发生支出，超额时调整方案');
 const reserve=budget?.kind==='budget'?budget.rows.filter(r=>/应急|备用/.test(r.bucket+r.item+r.category)).reduce((s,r)=>s+r.amount,0):0;
 add('reserve','预算',reserve>0?'ok':'warning','应急资金',`已标注应急备用金 ¥${reserve}；不强制统一比例`,'结合风险与可承受损失确认备用金');
 const capacity=Number(w.tables['activity-settings']?.rows[0]?.capacity)||0;add('capacity','资源',capacity?capacity>=plan.brief.people?'ok':'error':'warning','场地容量',capacity?`确认容量 ${capacity} / 计划人数 ${plan.brief.people}`:'未填写经确认的场地容量，不推断真实容量','补充场地方确认的容量');
 const risk=plan.modules.find(m=>m.id==='risk');add('risk','风险',risk?.blocks.length?'ok':'warning','风险预案内容',risk?.blocks.length?'已有风险章节；具体负责人、通知流程和物资仍需核验':'缺少风险章节','使用应急预案核实触发条件、负责人、备用资源与处理步骤');
 const supplies=w.tables.materials?.rows??[];
 add('supplies','资源',supplies.length&&supplies.every(r=>Number(r.quantity)>0)?'ok':'warning','物资数量登记',`${supplies.length} 项物资记录；只核验数量已填且大于零，不推断是否足够`,'根据活动人数填写并核对每项需求量');
 for(const r of supplies)if(r.requiredQuantity&&Number(r.quantity)<Number(r.requiredQuantity))add('shortage-'+r.id,'资源','error',`${r.name||'物资'} 不足`,`已备 ${r.quantity} / 需求 ${r.requiredQuantity}`,'补充物资或缩减相应活动容量');
 const emergencies=w.tables.emergency?.rows??[];
 add('emergency-owners','风险',emergencies.length&&emergencies.every(r=>r.owner&&!/待/.test(r.owner)&&r.notify&&r.backup)?'ok':'warning','可执行应急预案',`${emergencies.length} 项预案；检查负责人、通知流程和备用方案`,'指定真实负责人，核实备用设备与联络链路，不仅保留模板');
 const tasks=w.tables.tasks?.rows??[];for(const t of tasks){const dependency=tasks.find(x=>x.id===t.depends||x.title===t.depends);if(t.depends&&!dependency)add('dependency-'+t.id,'任务','warning','前置任务不存在',`${t.title||t.id} → ${t.depends}`,'指定现有任务 ID 或名称');if(t.status==='已完成'&&dependency&&dependency.status!=='已完成')add('order-'+t.id,'任务','error','前置任务尚未完成',`${t.title} 已完成，但 ${dependency.title} 未完成`,'核对真实状态和依赖顺序');}
 return result;
}
