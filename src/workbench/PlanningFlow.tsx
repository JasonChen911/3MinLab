import { useEffect, useState } from 'react';
import { Check, Sparkles, ArrowRight } from 'lucide-react';
import type { EventPlan } from '../types';
import type { Workspace } from './model';
import { modeOf } from '../planning/mode';
import './planning.css';
const stages = [
  {title:'活动基本信息',hint:'目标、时间与主承办方',tab:'overview',tasks:['核实活动名称、主题与目标','确认日期、地点、人数和主承办单位']},
  {title:'活动需求与资源',hint:'对象、预算与资源缺口',tab:'plan',tasks:['核实参与对象、预算与特殊要求','确认场地、物资和现有资源']},
  {title:'活动方案设计',hint:'内容、环节与时间安排',tab:'plan',tasks:['核对活动内容、流程与互动设计','检查每个环节的时长与衔接']},
  {title:'组织与执行安排',hint:'人员、任务与宣传报名',tab:'people',tasks:['确认岗位、志愿者与负责人','完善任务时间表、物资和宣传报名安排']},
  {title:'风险评估与完善',hint:'预算、冲突与应急预案',tab:'plan',tasks:['复核风险预案、预算与资源缺口','检查时间冲突和现场执行可行性']},
  {title:'生成最终策划方案',hint:'核对文件并导出交付',tab:'documents',tasks:['生成并核对策划书、执行手册和表格','确认最终内容后导出所需文件']},
];
const lightStages = [
  {title:'活动与目标',hint:'想做什么、邀请谁',tab:'plan',tasks:['确认活动主题、目标和参与人数']},
  {title:'时间与地点',hint:'何时集合、在哪举办',tab:'plan',tasks:['确认时间、地点及到达方式']},
  {title:'人员与活动安排',hint:'环节、分组与联络',tab:'people',tasks:['核对环节顺序和参与者分组']},
  {title:'物资与基础安全',hint:'准备清单和重要风险',tab:'plan',tasks:['核对物资、天气或场地安全要点']},
  {title:'最后检查',hint:'确认后保存或导出',tab:'documents',tasks:['确认待定事项，保存可执行的活动安排']},
];
export default function PlanningFlow({plan,data,onChange,onOpen,onAssist}:{plan:EventPlan;data:Workspace;onChange:(data:Workspace)=>Promise<unknown>;onOpen:(tab:string)=>void;onAssist:(text:string)=>void}) {
  const [current,setCurrent]=useState(0);
  const [busy,setBusy]=useState(false);
  const light=modeOf(plan)==='light',activeStages=light?lightStages:stages,reviewKey=(i:number)=>light?`light-${i}`:String(i);
  useEffect(()=>setCurrent(0),[light]);
  // A changed plan or execution dataset invalidates the corresponding review.
  const fingerprints=light?[JSON.stringify([plan.brief.title,plan.brief.goal,plan.brief.people]),JSON.stringify([plan.brief.date,plan.brief.venue]),JSON.stringify([plan.modules.find(m=>m.id==='program'),data.people,data.flow]),JSON.stringify([plan.modules.find(m=>m.id==='resources'),plan.modules.find(m=>m.id==='risk')]),JSON.stringify([plan.moduleStates,data.documents])]:[JSON.stringify([plan.brief,data.profile]),JSON.stringify([plan.brief,data.tools]),JSON.stringify(plan.modules),JSON.stringify([data.people,data.organizations,data.tables,data.flow]),JSON.stringify([plan.modules,data.tables,data.athletics]),JSON.stringify([plan.modules,data.documents])];
  const status=(i:number)=>{const review=data.planningReview?.[reviewKey(i)];return review?.fingerprint===fingerprints[i]?review.status:review?'stale':'todo';};
  const done=activeStages.filter((_,i)=>status(i)==='done').length;
  const skipped=activeStages.filter((_,i)=>status(i)==='skip').length;
  const stage=activeStages[Math.min(current,activeStages.length-1)];
  const special=light?'轻量安排也保留必要的场地、天气和参与者安全检查。':data.scene==='athletics'?'重点核对：竞赛规程、赛程、成绩登记与团体积分。':data.scene==='performance'?'重点核对：节目单、主持词、彩排安排与舞台调度。':'结合本次活动的重点模块核对；不适用的阶段可跳过。';
  async function review(value:'done'|'skip'|null){setBusy(true);try {const next={...data.planningReview};const key=reviewKey(current);if(value)next[key]={status:value,fingerprint:fingerprints[current]};else delete next[key];await onChange({...data,planningReview:next});}finally{setBusy(false);}}
  return <section className="planning-flow" aria-label="六阶段策划流程">
    <div className="planning-heading"><div><span className="mini-label">PLANNING JOURNEY</span><h2>让每一步，都有方向</h2></div><strong role="status">{done}/{activeStages.length} 阶段已核对完成{skipped>0&&` · ${skipped} 项不适用`}</strong></div>
    <progress aria-label="已核对完成阶段" max={activeStages.length} value={done}/>
    <nav className="planning-steps" aria-label="策划阶段">{activeStages.map((item,i)=><button key={item.title} className={`${current===i?'current':''} ${status(i)}`} aria-current={current===i?'step':undefined} onClick={()=>setCurrent(i)}><span className="planning-number">{status(i)==='done'?<Check size={16}/>:i+1}</span><strong>{item.title}</strong><small>{status(i)==='done'?'已核对完成':status(i)==='skip'?'不适用':status(i)==='stale'?'内容已变更 · 待复核':current===i?'当前阶段':'待核对'} · {item.hint}</small></button>)}</nav>
    <div className="planning-focus"><div><span className="planning-kicker">当前阶段 · {Math.min(current+1,activeStages.length)}/{activeStages.length}</span><h3>{stage.title}</h3><ul>{stage.tasks.map(task=><li key={task}>{task}</li>)}</ul><p>{special}</p></div><div className="planning-controls"><button className="primary" onClick={()=>onOpen(stage.tab)}>前往处理 <ArrowRight size={16}/></button><button onClick={()=>onAssist(`请帮我完善「${stage.title}」：${stage.tasks.join('；')}。${special}`)}><Sparkles size={16}/> 让 AI 帮我完善</button><div><button disabled={busy} onClick={()=>void review(status(current)==='done'?null:'done')}>{status(current)==='done'?'重新核对':'我已核对完成'}</button><button disabled={busy} onClick={()=>void review(status(current)==='skip'?null:'skip')}>{status(current)==='skip'?'恢复此阶段':'标记不适用'}</button></div></div></div>
    <details><summary>进度如何计算 · 尚待核对 {activeStages.length-done-skipped} 个阶段</summary><p>完成状态由你核对后确认并随活动保存；内容变更会提示重新核对。生成方案不代表已完成审核。AI 入口打开现有助手，模型配置状态在助手中显示。</p></details>
  </section>;
}
