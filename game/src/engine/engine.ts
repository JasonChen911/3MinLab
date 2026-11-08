// Extracted from 3MinLab/src/simulation/engine.ts for the standalone simulator.
// The original planning-project snapshot adapter is intentionally excluded.
import { defaults, type Parameters, type Snapshot, type SimulationState, type Incident, type RiskKind, type DirectorMitigation } from './model';
import { Random } from './random';
import { SCENARIO_MODELS } from './scenarios';
import { addIncident } from './hazards';
import { advanceDirector, directorDepartureFactor, directorServiceFactor, initialDirector, initialSatisfaction, preventDirectorWarnings, syncDirectorMetrics } from './director';
import { logReplay, recordReplayFrame, replaySpotForAction } from './replay';
import {charge} from './money';
import {advanceFacilities} from './facilityRuntime';
import { evaluateChallenge } from '../challenge';
import { difficultyProfile } from '../difficulty';

export { addIncident };

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
  const incidents:Incident[]=missing?[{id:1,kind:'absence',at:0,until:1e9,severity:missing,cost:0,message:`${missing} 名工作人员临时缺席`}]:[];
  const state:SimulationState={schema:1,snapshot:s,parameters:p,rng:r.state,minute:0,status:'ready',tasks,arrivals,transfers:[],attendanceTotal:arrivals.length,arrived:0,served:0,departed:0,queue:0,availableStaff:p.staff-missing,missingStaff:missing,assignedStaff:0,equipmentDown:false,weatherClosed:false,supplyDown:false,sheltered:false,usedSpare:0,baseSpend:0,extraSpend:0,delay:0,peakQueue:0,queuePersonMinutes:0,incidents,actions:[],trace:[],timeout:false};
  const difficulty = difficultyProfile(s.difficulty);
  state.satisfaction=Math.max(0,Math.min(100,initialSatisfaction(s.facility)+difficulty.satisfactionBias));
  state.director=initialDirector(p.seed,s.facility);
  state.director.nextReview=difficulty.reviewInterval;
  state.replay={schema:1,frames:[],events:[],serial:1};
  state.challenge=evaluateChallenge(state);
  logReplay(state,{at:0,kind:'start',title:s.challenge?`挑战开始 · ${s.challenge.name}`:'模拟开始',detail:`${s.title} · 预计 ${s.people} 人 · 签到人员 ${p.checkinStaff} 名 · 场地容量 ${p.capacity} 人${s.challenge?` · ${s.challenge.goals.length} 项目标`:''}`,location:'venue',dedupe:'start'});
  if(missing)logReplay(state,{at:0,kind:'incident',title:'工作人员临时缺席',detail:`${missing} 名工作人员未到场，可用人员降至 ${state.availableStaff} 名。`,location:'entrance',severity:Math.min(3,missing),dedupe:'absence:initial'});
  recordReplayFrame(state);
  return state;
}

const INCIDENT_LABELS:Record<RiskKind,{title:string;location:'entrance'|'stage'|'field'|'rest'|'venue'}>={
  equipment:{title:'设备故障',location:'stage'},weather:{title:'天气中断',location:'field'},
  traffic:{title:'交通延误',location:'entrance'},supply:{title:'物资短缺',location:'rest'},
  price:{title:'价格波动',location:'venue'},absence:{title:'人员缺席',location:'entrance'},
};

function actionEffect(kind:DirectorMitigation):string {
  return ({reserve:'可用人员 +2、签到人员 +1',spare:'启用备用设备并解除设备故障',shelter:'转入避雨 / 室内备用场地',supply:'补充物资并恢复供应',capacity:'场地容量 +50',medical:'外部医疗支援到场，满意度 +6',comfort:'饮水与休息物资到场，满意度 +4'})[kind];
}
export function step(previous:SimulationState,minutes=1):SimulationState {
  const s=structuredClone(previous);s.transfers??=[];const r=new Random(s.rng);
  for(let tick=0;tick<minutes&&s.status!=='finished';tick++) {
    s.status='running';s.minute++;const beforeArrived=s.arrived,beforeServed=s.served,beforeDeparted=s.departed;const model=SCENARIO_MODELS[s.snapshot.scene];
    while(s.arrived<s.arrivals.length&&s.arrivals[s.arrived]<=s.minute)s.arrived++;
    const taskStatusBefore=new Map(s.tasks.map(task=>[task.id,task.status]));
    const incidentIdsBefore=new Set(s.incidents.map(incident=>incident.id));
    if(s.snapshot.challenge?.director!==false)advanceDirector(s,r);
    const active=(kind:RiskKind)=>s.incidents.some(e=>e.kind===kind&&e.until>s.minute);
    const load=1+Math.min(2,s.queue/Math.max(1,s.parameters.capacity));
    for(const [kind,rate,eligible] of [
      ['equipment',s.parameters.equipmentRate*load*model.equipmentFactor,s.tasks.some(t=>t.equipment&&t.status==='进行中')],
      ['weather',s.parameters.weatherRate,s.snapshot.outdoor&&!s.sheltered],['traffic',s.parameters.trafficRate,s.arrived<s.attendanceTotal],
      ['supply',s.parameters.supplyRate*load*model.supplyFactor,s.queue>0],['price',s.parameters.priceRate,s.tasks.some(t=>t.status==='进行中')],
    ] as const)if(eligible&&!active(kind)&&r.poisson(rate/60)>0)addIncident(s,kind,r);
    s.equipmentDown=active('equipment');s.weatherClosed=active('weather');s.supplyDown=active('supply');
    const checkers=Math.min(s.parameters.checkinStaff,Math.max(0,s.availableStaff-Math.max(2,s.tasks.filter(t=>t.status==='进行中').reduce((n,t)=>n+t.staff,0))));
    const service=r.poisson(checkers*s.parameters.serviceRate*(s.supplyDown?.4:1)*(s.weatherClosed?.5:1)*directorServiceFactor(s)*(1-(s.staffFatigue??0)*.25));
    const occupancy=Math.max(0,s.served-s.departed);
    const admitted=Math.min(s.arrived-s.served,service,Math.max(0,s.parameters.capacity-occupancy));
    s.served+=admitted;s.queue=s.arrived-s.served;s.peakQueue=Math.max(s.peakQueue,s.queue);s.queuePersonMinutes+=s.queue;
    let allocated=s.tasks.filter(t=>t.status==='进行中').reduce((v,t)=>v+t.staff,0);
    const occupied=new Set(s.tasks.filter(t=>t.status==='进行中').map(t=>t.venue));
    for(const task of s.tasks) {
      const reserve=s.queue>0||admitted>0?checkers:0;
      if(task.status==='等待'&&s.minute>=task.start&&task.dependencies.every(id=>s.tasks.find(t=>t.id===id)?.status==='已完成')&&!occupied.has(task.venue)&&allocated+task.staff<=s.availableStaff-reserve&&s.served>=Math.min(s.attendanceTotal,Math.ceil(s.attendanceTotal*.5))&&!s.weatherClosed&&!(task.equipment&&s.equipmentDown)) { task.status='进行中';task.actualStart=s.minute;allocated+=task.staff;occupied.add(task.venue); }
      const programPaused=s.director?.events.some(event=>event.status==='active'&&event.impact.pauseTaskId===task.id);
      if(task.status==='进行中'&&!programPaused&&!s.weatherClosed&&!(task.equipment&&s.equipmentDown)&&!(task.supplies&&s.supplyDown)) {task.remaining--;if(task.remaining<=0){task.status='已完成';task.actualEnd=s.minute;allocated-=task.staff;occupied.delete(task.venue);}}
    }
    s.assignedStaff=allocated+(s.queue||admitted?checkers:0);
    s.staffBusyMinutes=(s.staffBusyMinutes??0)+s.assignedStaff;s.staffCapacityMinutes=(s.staffCapacityMinutes??0)+s.availableStaff;
    // Construction is priced by actual placed items; activity task costs require a user estimate.
    s.baseSpend=0;
    s.delay=Math.max(0,...s.tasks.map(t=>t.status==='已完成'?(t.actualEnd??0)-(t.start+t.duration):t.status==='进行中'?s.minute+t.remaining-(t.start+t.duration):s.minute-t.start));
    // At a finite venue, people leave after a scene-specific dwell time, releasing capacity.
    const dwell=Math.max(30,s.snapshot.duration*model.dwell);
    if(s.minute>dwell)s.departed=Math.min(s.served,s.departed+r.poisson(Math.max(.1,s.served/dwell*directorDepartureFactor(s))));
    advanceFacilities(s,r);
    const allDone=s.tasks.every(t=>t.status==='已完成');
    if(allDone&&s.arrived===s.attendanceTotal&&s.queue===0){s.status='finished';s.departed=s.served;}
    if(s.minute>=Math.min(4320,s.snapshot.duration+1440)){s.status='finished';s.timeout=true;}
    s.challenge=evaluateChallenge(s);
    if(s.challenge?.failed&&s.status!=='finished')s.status='finished';
    for(const [kind,count] of [['arrival',s.arrived-beforeArrived],['admission',s.served-beforeServed],['exit',s.departed-beforeDeparted]] as const)if(count>0)s.transfers.push({at:s.minute,kind,count});s.transfers=s.transfers.slice(-120);
    if(beforeArrived===0&&s.arrived>0)logReplay(s,{at:s.minute,kind:'milestone',tone:'progress',title:'参与者开始入场',detail:`首批参与者抵达，当前到场 ${s.arrived} 人。`,location:'entrance',dedupe:'arrival:first'});
    if(beforeServed<Math.ceil(s.attendanceTotal*.5)&&s.served>=Math.ceil(s.attendanceTotal*.5))logReplay(s,{at:s.minute,kind:'milestone',tone:'progress',title:'签到过半',detail:`已有 ${s.served} 人完成签到。`,location:'checkin',dedupe:'checkin:half'});
    if(beforeServed<s.attendanceTotal&&s.served>=s.attendanceTotal)logReplay(s,{at:s.minute,kind:'milestone',tone:'positive',title:'签到全部完成',detail:`计划到场 ${s.attendanceTotal} 人均已完成签到。`,location:'checkin',dedupe:'checkin:complete'});
    if(beforeDeparted===0&&s.departed>0)logReplay(s,{at:s.minute,kind:'milestone',tone:'progress',title:'参与者开始离场',detail:`已有 ${s.departed} 人离场。`,location:'entrance',dedupe:'exit:first'});
    for(const task of s.tasks){
      const before=taskStatusBefore.get(task.id);
      if(before===task.status||task.status==='等待')continue;
      logReplay(s,{
        at:s.minute,kind:'task',
        title:task.status==='进行中'?`${task.name} 开始执行`:`${task.name} 已完成`,
        detail:task.status==='进行中'
          ?`${task.staff} 名人员 · ${task.venue}${task.equipment?' · 使用设备':''}`
          :`实际用时 ${Math.max(0,(task.actualEnd??s.minute)-(task.actualStart??task.start))} 分钟 · 计划 ${task.duration} 分钟`,
        location:'venue',dedupe:`task:${task.id}:${task.status}`,
      });
    }
    for(const incident of s.incidents){
      if(incidentIdsBefore.has(incident.id))continue;
      const meta=INCIDENT_LABELS[incident.kind];
      const incidentLog=logReplay(s,{
        at:s.minute,kind:'incident',title:meta.title,detail:incident.message,
        severity:incident.severity,location:meta.location,cost:incident.cost,dedupe:`incident:${incident.id}`,
      });
      const transaction=s.transactions?.find(entry=>entry.id===`incident:${incident.id}`);
      if(transaction&&incidentLog)transaction.eventId=incidentLog.id;
    }
    if(s.status==='finished')logReplay(s,{
      at:s.minute,kind:'milestone',
      title:s.challenge?.failed?'挑战失败 · 活动终止':s.challenge?.completed?'活动结束 · 挑战达成':'活动结束',
      detail:`${s.challenge?.failed?`触发失败条件：${s.challenge.failure}`:s.timeout?'达到时间上限':'流程与签到全部完成'} · 签到 ${s.served} 人 · 排队 ${s.queue} 人 · 延误 ${s.delay} 分钟 · 满意度 ${Math.round(s.satisfaction??70)}/100 · 应急支出 ¥${s.extraSpend}${s.challenge?` · 目标 ${s.challenge.met}/${s.challenge.total}`:''}`,
      location:'venue',dedupe:'finish',
    });
    syncDirectorMetrics(s);
    recordReplayFrame(s);
    if(s.minute%5===0||s.status==='finished')s.trace.push({time:s.minute,queue:s.queue,delay:s.delay,cost:(s.snapshot.buildCost??0)+s.extraSpend});
  }
  s.rng=r.state;return s;
}
export type Intervention = DirectorMitigation;
export const actions:Record<Intervention,{name:string;cost:number}>={reserve:{name:'调用 2 名后备人员（1名协助签到）',cost:400},spare:{name:'启用一套备用设备',cost:100},shelter:{name:'启用室内备用场地',cost:800},supply:{name:'补充应急物资',cost:200},capacity:{name:'增开分流等候区（容量 +50）',cost:300},medical:{name:'调用外部医疗支援',cost:350},comfort:{name:'补给饮水与休息物资',cost:240}};
export function intervene(previous:SimulationState,kind:Intervention,budgetMode:'unlimited'|'challenge'='unlimited') {
  const s=structuredClone(previous),action={...actions[kind],cost:snapshotActionCost(previous,kind)},directorWarning=s.director?.events.some(e=>e.status==='warning'&&(e.mitigation===kind||['queue','crowd','staff'].includes(e.kind)&&(kind==='reserve'||kind==='capacity')||['weather','comfort'].includes(e.kind)&&(kind==='shelter'||kind==='comfort')))??false;
  if(s.status==='finished')throw new Error('模拟已结束');
  if(budgetMode==='challenge'&&s.extraSpend+action.cost>s.parameters.budget)throw new Error('预算挑战：余额不足，无法执行此项应对');
  if(kind==='spare'&&(!s.equipmentDown||s.usedSpare>=s.parameters.spare)&&!directorWarning)throw new Error('没有故障或备用设备已用尽');
  if(kind==='shelter'&&!s.weatherClosed&&!directorWarning||kind==='supply'&&!s.supplyDown&&!directorWarning)throw new Error('当前没有对应风险');
  if(kind!=='spare'&&s.actions.some(a=>a.name===action.name))throw new Error('此项预备资源仅能调用一次');
  if(kind==='reserve'){s.availableStaff+=2;s.parameters.checkinStaff+=1;}
  if(kind==='capacity')s.parameters.capacity+=50;
  if(kind==='spare'){s.usedSpare++;s.equipmentDown=false;}
  if(kind==='shelter'){s.weatherClosed=false;s.sheltered=true;}
  if(kind==='supply')s.supplyDown=false;
  if(kind==='medical')s.satisfaction=Math.min(100,(s.satisfaction??70)+6);
  if(kind==='comfort')s.satisfaction=Math.min(100,(s.satisfaction??70)+4);
  if(['spare','shelter','supply'].includes(kind))s.incidents=s.incidents.map(e=>((kind==='spare'&&e.kind==='equipment')||(kind==='shelter'&&e.kind==='weather')||(kind==='supply'&&e.kind==='supply'))&&e.until>s.minute?{...e,until:s.minute}:e);
  s.actions.push({at:s.minute,...action});
  preventDirectorWarnings(s,kind);
  const actionLog=logReplay(s,{
    at:s.minute,kind:'action',title:`现场应对 · ${action.name}`,
    detail:`${actionEffect(kind)}；${s.snapshot.simulationMode&&action.cost===0?'费用未填写，需实际询价':'支出 ¥'+action.cost}。`,cost:action.cost,
    location:replaySpotForAction(kind),dedupe:`action:${kind}:${s.actions.length}`,
  });
  if(action.cost>0)charge(s,{at:s.minute,title:action.name,amount:action.cost,category:'action',sourceId:`${kind}:${s.actions.length}`,eventId:actionLog?.id});
  return s;
}
function snapshotActionCost(state:SimulationState,kind:Intervention){return state.snapshot.simulationMode?Math.max(0,state.snapshot.simulationActionCosts?.[kind]??0):actions[kind].cost;}
export function runToEnd(s:Snapshot,p:Parameters) {let state=createSimulation(s,p);while(state.status!=='finished')state=step(state,60);return state;}
export function recommendations(s:SimulationState):string[] {return [s.peakQueue>Math.max(10,s.snapshot.people*.15)?`增加签到分流与后备人员：本次峰值排队 ${s.peakQueue} 人，按批次通知到场。`:null,s.incidents.some(e=>e.kind==='equipment')?`为${s.snapshot.equipmentName}准备备用设备并安排专人巡检。`:null,s.incidents.some(e=>e.kind==='weather')?'明确备用室内场地与天气熔断决策人。':null,s.delay>10?`关键任务之间增加 ${Math.min(60,Math.ceil(s.delay/5)*5)} 分钟缓冲；逐项核对场地和执行人员。`:null,s.extraSpend>0?`核实应急备用金：本次假设模型额外支出 ¥${s.extraSpend}，请实际询价后编制。`:null,s.missingStaff>0?'预留后备人员和缺席交接清单。':null,s.timeout?'本次达到时间上限仍未完成，请检查人员、容量和任务依赖。':null].filter((x):x is string=>!!x);}
