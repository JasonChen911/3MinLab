import { useState } from 'react';
import { Check, Sparkles, ArrowRight } from 'lucide-react';
import type { EventPlan } from '../types';
import type { Workspace } from './model';
import './planning.css';
const stages = [
  {title:'活动基本信息',hint:'目标、时间与主承办方',tab:'overview',tasks:['核实活动名称、主题与目标','确认日期、地点、人数和主承办单位']},
  {title:'活动需求与资源',hint:'对象、预算与资源缺口',tab:'plan',tasks:['核实参与对象、预算与特殊要求','确认场地、物资和现有资源']},
  {title:'活动方案设计',hint:'内容、环节与时间安排',tab:'plan',tasks:['核对活动内容、流程与互动设计','检查每个环节的时长与衔接']},
  {title:'组织与执行安排',hint:'人员、任务与宣传报名',tab:'people',tasks:['确认岗位、志愿者与负责人','完善任务时间表、物资和宣传报名安排']},
  {title:'风险评估与完善',hint:'预算、冲突与应急预案',tab:'plan',tasks:['复核风险预案、预算与资源缺口','检查时间冲突和现场执行可行性']},
  {title:'生成最终策划方案',hint:'核对文件并导出交付',tab:'documents',tasks:['生成并核对策划书、执行手册和表格','确认最终内容后导出所需文件']},
];
export default function PlanningFlow({plan,data,onChange,onOpen,onAssist}:{plan:EventPlan;data:Workspace;onChange:(data:Workspace)=>Promise<unknown>;onOpen:(tab:string)=>void;onAssist:(text:string)=>void}) {
  const [current,setCurrent]=useState(0);
  const [busy,setBusy]=useState(false);
  // A changed plan or execution dataset invalidates the corresponding review.
  const fingerprints=[JSON.stringify([plan.brief,data.profile]),JSON.stringify([plan.brief,data.tools]),JSON.stringify(plan.modules),JSON.stringify([data.people,data.organizations,data.tables,data.flow]),JSON.stringify([plan.modules,data.tables,data.athletics]),JSON.stringify([plan.modules,data.documents])];
  const status=(i:number)=>{const review=data.planningReview?.[i];return review?.fingerprint===fingerprints[i]?review.status:review?'stale':'todo';};
  const done=stages.filter((_,i)=>status(i)==='done').length;
  const skipped=stages.filter((_,i)=>status(i)==='skip').length;
  const stage=stages[current];
  const special=data.scene==='athletics'?'重点核对：竞赛规程、赛程、成绩登记与团体积分。':data.scene==='performance'?'重点核对：节目单、主持词、彩排安排与舞台调度。':'结合本次活动的重点模块核对；不适用的阶段可跳过。';
  async function review(value:'done'|'skip'|null){setBusy(true);try {const next={...data.planningReview};if(value)next[current]={status:value,fingerprint:fingerprints[current]};else delete next[current];await onChange({...data,planningReview:next});}finally{setBusy(false);}}
  return <section className="planning-flow" aria-label="六阶段策划流程">
    <div className="planning-heading"><div><span className="mini-label">PLANNING JOURNEY</span><h2>让每一步，都有方向</h2></div><strong role="status">{done}/6 阶段已核对完成{skipped>0&&` · ${skipped} 项不适用`}</strong></div>
    <progress aria-label="已核对完成阶段" max={6} value={done}/>
    <nav className="planning-steps" aria-label="策划阶段">{stages.map((item,i)=><button key={item.title} className={`${current===i?'current':''} ${status(i)}`} aria-current={current===i?'step':undefined} onClick={()=>setCurrent(i)}><span className="planning-number">{status(i)==='done'?<Check size={16}/>:i+1}</span><strong>{item.title}</strong><small>{status(i)==='done'?'已核对完成':status(i)==='skip'?'不适用':status(i)==='stale'?'内容已变更 · 待复核':current===i?'当前阶段':'待核对'} · {item.hint}</small></button>)}</nav>
    <div className="planning-focus"><div><span className="planning-kicker">当前阶段 · {current+1}/6</span><h3>{stage.title}</h3><ul>{stage.tasks.map(task=><li key={task}>{task}</li>)}</ul><p>{special}</p></div><div className="planning-controls"><button className="primary" onClick={()=>onOpen(stage.tab)}>前往处理 <ArrowRight size={16}/></button><button onClick={()=>onAssist(`请帮我完善「${stage.title}」：${stage.tasks.join('；')}。${special}`)}><Sparkles size={16}/> 让 AI 帮我完善</button><div><button disabled={busy} onClick={()=>void review(status(current)==='done'?null:'done')}>{status(current)==='done'?'重新核对':'我已核对完成'}</button><button disabled={busy} onClick={()=>void review(status(current)==='skip'?null:'skip')}>{status(current)==='skip'?'恢复此阶段':'标记不适用'}</button></div></div></div>
    <details><summary>进度如何计算 · 尚待核对 {6-done-skipped} 个阶段</summary><p>完成状态由你核对后确认并随活动保存；内容变更会提示重新核对。生成方案不代表已完成审核。AI 入口打开现有助手，模型配置状态在助手中显示。</p></details>
  </section>;
}
