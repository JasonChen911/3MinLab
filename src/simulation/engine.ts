import type { EventPlan } from '../types';
import type { Workspace } from '../workbench/model';
import { defaults, fingerprint, type Parameters, type Snapshot, type SimulationState, type Incident, type RiskKind, type Task } from './model';
import { Random } from './random';
import { SCENARIO_MODELS } from './scenarios';

const clock = (time:string) => { const m=time.match(/(\d{1,2}):(\d{2})/);return m?Number(m[1])*60+Number(m[2]):NaN; };
export function buildSnapshot(plan:EventPlan, workspace:Workspace):Snapshot {
  const assumptions:string[]=plan.assumptions.map(a=>`策划原有假设：${a.label} ${a.value}（${a.reason}）`);
  const flow=workspace.flow.filter(row=>row.status!=='已取消'&&row.title.trim());
  const timeline=plan.modules.find(m=>m.id==='program')?.blocks.find(b=>b.kind==='timeline');
  const rows=flow.length?flow:timeline?.kind==='timeline'?timeline.entries.map((e,i)=>({id:`plan-${i}`,title:e.title,start:e.time.split(/[–—-]/)[0],end:e.time.split(/[–—-]/)[1]??'',equipment:'',venue:''})):[];
  const starts=rows.map(r=>clock(r.start)).filter(Number.isFinite);const origin=starts.length?Math.min(...starts):0;
  let cursor=0;
  const tasks:Task[]=rows.map((row,i)=>{
    const start=Number.isFinite(clock(row.start))?Math.max(0,clock(row.start)-origin):cursor;
    const raw=clock(row.end)-clock(row.start);const duration=raw>0?raw:Math.max(5,Math.round(plan.brief.durationMinutes/Math.max(1,rows.length)));
    if(!(raw>0))assumptions.push(`“${row.title}”缺少有效时段，按 ${duration} 分钟测试`);
    cursor=start+duration;
    const previous=rows.slice(0,i).map((r,j)=>({r,j})).filter(({r})=>Number.isFinite(clock(r.end))&&clock(r.end)<=clock(row.start)).at(-1);
    return {id:row.id,name:row.title,start,duration,staff:2,equipment:!!row.equipment||(SCENARIO_MODELS[workspace.scene].essentialEquipment&&!/签到|入场|退场|休息|检录|服务|植树/.test(row.title)),supplies:['charity','community'].includes(workspace.scene),venue:row.venue||'主区域',dependencies:previous?[rows[previous.j].id]:!Number.isFinite(clock(row.start))&&i?[rows[i-1].id]:[]};
  });
  const staff=plan.modules.flatMap(m=>m.blocks).filter(b=>b.kind==='staff').flatMap(b=>b.kind==='staff'?b.rows:[]);
  const resources=plan.modules.find(m=>m.id==='resources')?.blocks.flatMap(b=>b.kind==='table'?b.rows.map(r=>r[0]):b.kind==='bullets'||b.kind==='checklist'?b.items:[])??[];
  assumptions.push('任务均按每项 2 名执行人员建模；同一场地容量为 1，前后环节按时段推导依赖。请在参数与任务表中核对。','费用按预算 80% 随流程执行计提，另外累加维修与应对费用；不是实际财务支出。');
  if(plan.brief.days>1)assumptions.push('当前只模拟首日，不包含跨日移动、住宿和跨日排程。');
  return {schema:1,id:plan.id,createdAt:new Date().toISOString(),fingerprint:fingerprint(plan,workspace),title:plan.title,scene:workspace.scene,people:plan.brief.people,duration:Math.max(plan.brief.durationMinutes,...tasks.map(t=>t.start+t.duration)),outdoor:['outdoor','stadium','mixed'].includes(plan.brief.venue),equipmentName:SCENARIO_MODELS[workspace.scene].equipment,activityName:SCENARIO_MODELS[workspace.scene].area,tasks,assumptions,roles:staff.map(r=>({name:r.role,count:r.count})),resources};
}
export function suggestedParameters(snapshot:Snapshot):Parameters { return {...defaults,staff:snapshot.roles.reduce((a,r)=>a+r.count,0)||12,capacity:Math.max(1,Math.ceil(snapshot.people*1.1-1e-9))}; }
export function validateParameters(p:Parameters) {
  const issues:string[]=[];
  for(const k of ['attendance','late','absence'] as const)if(!Number.isFinite(p[k])||p[k]<0||p[k]>1)issues.push(`${k} 应在 0–1 之间`);
  for(const k of ['equipmentRate','weatherRate','trafficRate','supplyRate','priceRate'] as const)if(!Number.isFinite(p[k])||p[k]<0||p[k]>10)issues.push(`${k} 应在 0–10 次/小时之间`);
  for(const [key,min,max] of [['staff',2,500],['checkinStaff',1,100],['capacity',1,20000],['spare',0,10],['budget',0,1e8],['arrivalSpread',5,180],['serviceRate',.1,20],['durationCV',0,1],['repairMean',1,120],['seed',0,4294967295]] as const)if(!Number.isFinite(p[key])||p[key]<min||p[key]>max)issues.push(`${key} 超出允许范围 ${min}–${max}`);
  if(p.checkinStaff>=p.staff)issues.push('签到人员应少于总工作人员，以保留执行岗位');
  if(!Number.isInteger(p.staff)||!Number.isInteger(p.checkinStaff)||!Number.isInteger(p.capacity)||!Number.isInteger(p.spare)||!Number.isInteger(p.seed))issues.push('人数、容量、备件、种子必须为整数');
  if(p.source!=='系统演示假设'&&!p.sourceNote.trim())issues.push('请填写概率数据依据；没有依据时请选择系统演示假设');
  return issues;
}
export function readiness(s:Snapshot) { return [!s.tasks.length?'主要活动流程缺失':null,!s.people||s.people>20000?'预计参与人数需在 1–20000 之间':null,s.duration>1440||s.duration<=0?'首日预计时长需在 1–1440 分钟之间':null,!s.roles.length?'基础人员配置缺失，需确认测试编制':null,!s.resources.length?'主要资源清单缺失，需确认通用设备假设':null].filter((x):x is string=>!!x); }
export function createSimulation(snapshot:Snapshot,parameters:Parameters):SimulationState {
  const errors=validateParameters(parameters);if(errors.length||!snapshot.tasks.length||snapshot.people<1||snapshot.people>20000||snapshot.duration>1440)throw new Error(errors.join('；')||'流程、人数或首日时长不符合模拟范围');
  const p=structuredClone(parameters),s=structuredClone(snapshot),r=new Random(p.seed);
  const arrivals:number[]=[];
  for(let i=0;i<s.people;i++)if(r.bernoulli(p.attendance)) {const late=r.bernoulli(p.late);arrivals.push(Math.max(0,Math.round(late?r.lognormal(p.arrivalSpread, .65):p.arrivalSpread/3+r.normal()*p.arrivalSpread/5)));}
  arrivals.sort((a,b)=>a-b);const missing=r.binomial(p.staff,p.absence);
  const tasks=s.tasks.map(t=>({...t,remaining:Math.max(1,Math.round(r.lognormal(t.duration,p.durationCV))),status:'等待' as const}));
  const incidents:Incident[]=missing?[{id:1,kind:'absence',at:0,until:1e9,severity:missing,cost:0,message:`${missing} 名工作人员缺席，按伯努利模型抽样`}]:[];
  return {schema:1,snapshot:s,parameters:p,rng:r.state,minute:0,status:'ready',tasks,arrivals,transfers:[],attendanceTotal:arrivals.length,arrived:0,served:0,departed:0,queue:0,availableStaff:p.staff-missing,missingStaff:missing,assignedStaff:0,equipmentDown:false,weatherClosed:false,supplyDown:false,sheltered:false,usedSpare:0,baseSpend:0,extraSpend:0,delay:0,peakQueue:0,queuePersonMinutes:0,incidents,actions:[],trace:[],timeout:false};
}
export function addIncident(s:SimulationState,kind:RiskKind,r:Random) {
  const severity=1+Math.floor(r.uniform()*3),duration=Math.max(1,Math.round(r.lognormal(s.parameters.repairMean*(kind==='weather'?2:1),.6)));
  const cost=Math.round((kind==='equipment'?200:kind==='price'?400:kind==='supply'?150:0)*severity*r.lognormal(1,.25));
  const messages={equipment:`${s.snapshot.equipmentName}故障`,weather:'户外区域因天气暂时关闭',traffic:'交通波动使尚未到场人员延后',supply:'服务物资短缺，签到效率降低',price:'供应商临时调价',absence:'工作人员缺席'};
  s.incidents.push({id:s.incidents.length+1,kind,at:s.minute,until:s.minute+duration,severity,cost,message:messages[kind]});s.extraSpend+=cost;
  if(kind==='traffic')s.arrivals=s.arrivals.map((t,i)=>i>=s.arrived?t+duration:t);
}
export function step(previous:SimulationState,minutes=1):SimulationState {
  const s=structuredClone(previous);s.transfers??=[];const r=new Random(s.rng);
  for(let tick=0;tick<minutes&&s.status!=='finished';tick++) {
    s.status='running';s.minute++;const beforeArrived=s.arrived,beforeServed=s.served,beforeDeparted=s.departed;const model=SCENARIO_MODELS[s.snapshot.scene];
    while(s.arrived<s.arrivals.length&&s.arrivals[s.arrived]<=s.minute)s.arrived++;
    const active=(kind:RiskKind)=>s.incidents.some(e=>e.kind===kind&&e.until>s.minute);
    const load=1+Math.min(2,s.queue/Math.max(1,s.parameters.capacity));
    for(const [kind,rate,eligible] of [
      ['equipment',s.parameters.equipmentRate*load*model.equipmentFactor,s.tasks.some(t=>t.equipment&&t.status==='进行中')],
      ['weather',s.parameters.weatherRate,s.snapshot.outdoor&&!s.sheltered],['traffic',s.parameters.trafficRate,s.arrived<s.attendanceTotal],
      ['supply',s.parameters.supplyRate*load*model.supplyFactor,s.queue>0],['price',s.parameters.priceRate,s.tasks.some(t=>t.status==='进行中')],
    ] as const)if(eligible&&!active(kind)&&r.poisson(rate/60)>0)addIncident(s,kind,r);
    s.equipmentDown=active('equipment');s.weatherClosed=active('weather');s.supplyDown=active('supply');
    const checkers=Math.min(s.parameters.checkinStaff,Math.max(0,s.availableStaff-Math.max(2,s.tasks.filter(t=>t.status==='进行中').reduce((n,t)=>n+t.staff,0))));
    const service=r.poisson(checkers*s.parameters.serviceRate*(s.supplyDown?.4:1)*(s.weatherClosed?.5:1));
    const occupancy=Math.max(0,s.served-s.departed);
    const admitted=Math.min(s.arrived-s.served,service,Math.max(0,s.parameters.capacity-occupancy));
    s.served+=admitted;s.queue=s.arrived-s.served;s.peakQueue=Math.max(s.peakQueue,s.queue);s.queuePersonMinutes+=s.queue;
    let allocated=s.tasks.filter(t=>t.status==='进行中').reduce((v,t)=>v+t.staff,0);
    const occupied=new Set(s.tasks.filter(t=>t.status==='进行中').map(t=>t.venue));
    for(const task of s.tasks) {
      const reserve=s.queue>0||admitted>0?checkers:0;
      if(task.status==='等待'&&s.minute>=task.start&&task.dependencies.every(id=>s.tasks.find(t=>t.id===id)?.status==='已完成')&&!occupied.has(task.venue)&&allocated+task.staff<=s.availableStaff-reserve&&s.served>=Math.min(s.attendanceTotal,Math.ceil(s.attendanceTotal*.5))&&!s.weatherClosed&&!(task.equipment&&s.equipmentDown)) { task.status='进行中';task.actualStart=s.minute;allocated+=task.staff;occupied.add(task.venue); }
      if(task.status==='进行中'&&!s.weatherClosed&&!(task.equipment&&s.equipmentDown)&&!(task.supplies&&s.supplyDown)) {task.remaining--;if(task.remaining<=0){task.status='已完成';task.actualEnd=s.minute;allocated-=task.staff;occupied.delete(task.venue);}}
    }
    s.assignedStaff=allocated+(s.queue||admitted?checkers:0);
    s.staffBusyMinutes=(s.staffBusyMinutes??0)+s.assignedStaff;s.staffCapacityMinutes=(s.staffCapacityMinutes??0)+s.availableStaff;
    const progress=s.tasks.filter(t=>t.status==='已完成').length/s.tasks.length;
    s.baseSpend=Math.round(s.parameters.budget*.8*progress);
    s.delay=Math.max(0,...s.tasks.map(t=>t.status==='已完成'?(t.actualEnd??0)-(t.start+t.duration):t.status==='进行中'?s.minute+t.remaining-(t.start+t.duration):s.minute-t.start));
    // At a finite venue, people leave after a scene-specific dwell time, releasing capacity.
    const dwell=Math.max(30,s.snapshot.duration*model.dwell);
    if(s.minute>dwell)s.departed=Math.min(s.served,s.departed+r.poisson(Math.max(.1,s.served/dwell)));
    const allDone=s.tasks.every(t=>t.status==='已完成');
    if(allDone&&s.arrived===s.attendanceTotal&&s.queue===0){s.status='finished';s.departed=s.served;}
    if(s.minute>=Math.min(4320,s.snapshot.duration+1440)){s.status='finished';s.timeout=true;}
    for(const [kind,count] of [['arrival',s.arrived-beforeArrived],['admission',s.served-beforeServed],['exit',s.departed-beforeDeparted]] as const)if(count>0)s.transfers.push({at:s.minute,kind,count});s.transfers=s.transfers.slice(-120);
    if(s.minute%5===0||s.status==='finished')s.trace.push({time:s.minute,queue:s.queue,delay:s.delay,cost:s.baseSpend+s.extraSpend});
  }
  s.rng=r.state;return s;
}
export type Intervention = 'reserve' | 'spare' | 'shelter' | 'supply' | 'capacity';
export const actions:Record<Intervention,{name:string;cost:number}>={reserve:{name:'调用 2 名后备人员（1名协助签到）',cost:400},spare:{name:'启用一套备用设备',cost:100},shelter:{name:'启用室内备用场地',cost:800},supply:{name:'补充应急物资',cost:200},capacity:{name:'增开分流等候区（容量 +50）',cost:300}};
export function intervene(previous:SimulationState,kind:Intervention) {
  const s=structuredClone(previous),action=actions[kind];
  if(s.status==='finished')throw new Error('模拟已结束');
  if(kind==='spare'&&(!s.equipmentDown||s.usedSpare>=s.parameters.spare))throw new Error('没有故障或备用设备已用尽');
  if(kind==='shelter'&&!s.weatherClosed||kind==='supply'&&!s.supplyDown)throw new Error('当前没有对应风险');
  if(kind!=='spare'&&s.actions.some(a=>a.name===action.name))throw new Error('此项预备资源仅能调用一次');
  if(kind==='reserve'){s.availableStaff+=2;s.parameters.checkinStaff+=1;}
  if(kind==='capacity')s.parameters.capacity+=50;
  if(kind==='spare'){s.usedSpare++;s.equipmentDown=false;}
  if(kind==='shelter'){s.weatherClosed=false;s.sheltered=true;}
  if(kind==='supply')s.supplyDown=false;
  if(['spare','shelter','supply'].includes(kind))s.incidents=s.incidents.map(e=>((kind==='spare'&&e.kind==='equipment')||(kind==='shelter'&&e.kind==='weather')||(kind==='supply'&&e.kind==='supply'))&&e.until>s.minute?{...e,until:s.minute}:e);
  s.extraSpend+=action.cost;s.actions.push({at:s.minute,...action});return s;
}
export function runToEnd(s:Snapshot,p:Parameters) {let state=createSimulation(s,p);while(state.status!=='finished')state=step(state,60);return state;}
export function recommendations(s:SimulationState):string[] {return [s.peakQueue>Math.max(10,s.snapshot.people*.15)?`增加签到分流与后备人员：本次峰值排队 ${s.peakQueue} 人，按批次通知到场。`:null,s.incidents.some(e=>e.kind==='equipment')?`为${s.snapshot.equipmentName}准备备用设备并安排专人巡检。`:null,s.incidents.some(e=>e.kind==='weather')?'明确备用室内场地与天气熔断决策人。':null,s.delay>10?`关键任务之间增加 ${Math.min(60,Math.ceil(s.delay/5)*5)} 分钟缓冲；逐项核对场地和执行人员。`:null,s.extraSpend>0?`核实应急备用金：本次假设模型额外支出 ¥${s.extraSpend}，请实际询价后编制。`:null,s.missingStaff>0?'预留后备人员和缺席交接清单。':null,s.timeout?'本次达到时间上限仍未完成，请检查人员、容量和任务依赖。':null].filter((x):x is string=>!!x);}
