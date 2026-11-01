import type { EventBrief, EventPlan, ModuleId } from '../types';
import { generatePlan } from '../rules/generator';
import { applyPatch, reviseBrief } from '../rules/revise';
import { updateField } from '../rules/intake';
import { uid, type Workspace } from '../workbench/model';
import { syncDocuments } from '../workbench/documents';
import { expenseStats } from '../materials/import';
export type ChangeKey='people'|'budget'|'date'|'duration'|'venue'|'startTime'|'programme'|'withdraw'|'constraints';
export interface SuggestedChange {id:string;key:ChangeKey;label:string;before:string;after:string;reason:string;moduleIds:ModuleId[];targetId?:string}
export interface AdjustmentProposal {id:string;source:'local'|'model';request:string;createdAt:string;base:string;changes:SuggestedChange[];warnings:string[];manualModules:ModuleId[];explanation:string}
export interface AssistantContext {activity:{name:string;category:string;date:string;people:number;budget:number;duration:number;venue:string;goal:string};statistics:{registrations:number;athletes:number;used:number;remaining:number;programmes:number};constraints:string}
export interface ModelAdjustment {reply:string;patch:{people?:number;budget?:number;duration?:number;venue?:string;date?:string;startTime?:string;constraints?:string}}
export interface AIService {adjust(context:AssistantContext,text:string,history:{role:string;text:string}[],signal?:AbortSignal):Promise<ModelAdjustment>}
export function buildAssistantContext(plan:EventPlan,workspace:Workspace):AssistantContext {const finance=expenseStats(workspace,plan.brief.budget);return {activity:{name:plan.title,category:plan.brief.categoryId,date:plan.brief.date,people:plan.brief.people,budget:plan.brief.budget,duration:plan.brief.durationMinutes,venue:plan.brief.venue,goal:plan.brief.goal},statistics:{registrations:workspace.tables.registrations?.rows.length??0,athletes:workspace.athletics.athletes.length,used:finance.used,remaining:finance.remaining,programmes:workspace.tables.performances?.rows.length??0},constraints:plan.brief.constraints.slice(0,500)};}
export class ProxyAIService implements AIService {
  constructor(private key=''){}
  async adjust(context:AssistantContext,text:string,history:{role:string;text:string}[],signal?:AbortSignal):Promise<ModelAdjustment> {
    let last:unknown;
    for(let attempt=0;attempt<2;attempt++) {
      try {const timeout=AbortSignal.timeout(30000);const combined=signal?AbortSignal.any([signal,timeout]):timeout;const response=await fetch('/api/assistant/adjust',{method:'POST',headers:{'Content-Type':'application/json',...(this.key?{'X-DeepSeek-API-Key':this.key}:{})},body:JSON.stringify({context,text:text.slice(0,500),history:history.slice(-6).map(message=>({role:message.role,text:message.text.slice(0,800)}))}),signal:combined});const data=await response.json().catch(()=>({}));if(!response.ok){if(attempt===0&&[502,503,504].includes(response.status)&&data.code!=='NOT_CONFIGURED')continue;throw new Error(data.error??'AI 请求失败');}return parseModelAdjustment(data);}
      catch(error){last=error;if(signal?.aborted||attempt===1||!(error instanceof TypeError))throw error;}
    }
    throw last;
  }
}
export function parseModelAdjustment(input:unknown):ModelAdjustment {
  if(!input||typeof input!=='object')throw new Error('模型建议格式无效');const value=input as Record<string,unknown>;const patch=value.patch&&typeof value.patch==='object'?value.patch as Record<string,unknown>:{};const clean:ModelAdjustment['patch']={};
  for(const [key,min,max] of [['people',1,200000],['budget',0,100000000],['duration',15,720]] as const)if(patch[key]!==undefined){const v=patch[key];if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max||(key==='people'&&!Number.isInteger(v)))throw new Error(`模型返回的${key}超出范围`);clean[key]=v;}
  if(patch.venue!==undefined){if(typeof patch.venue!=='string'||!['indoor-small','indoor-large','outdoor','stadium','hotel','expo','online','mixed'].includes(patch.venue))throw new Error('场地类型无效');clean.venue=patch.venue;}
  if(patch.date!==undefined){if(typeof patch.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(patch.date)||new Date(patch.date+'T00:00:00Z').toISOString().slice(0,10)!==patch.date)throw new Error('活动日期无效');clean.date=patch.date;}
  if(patch.startTime!==undefined){if(typeof patch.startTime!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(patch.startTime))throw new Error('开始时间无效');clean.startTime=patch.startTime;}
  if(typeof patch.constraints==='string')clean.constraints=patch.constraints.slice(0,500);
  return {reply:typeof value.reply==='string'?value.reply.slice(0,1500):'',patch:clean};
}
export const adjustmentFingerprint=(plan:EventPlan,workspace:Workspace)=>JSON.stringify([plan,workspace]);
const labels:Record<ChangeKey,string>={people:'计划参与人数',budget:'活动预算',date:'活动日期',duration:'活动时长（分钟）',venue:'场地类型',startTime:'活动开始时间',programme:'节目取消',withdraw:'运动员退赛',constraints:'补充执行要求'};
const affected:Record<ChangeKey,ModuleId[]>={people:['audience','organization','resources','budget','risk','evaluation'],budget:['budget','resources','program'],date:['basic','logistics','program','execution','promotion'],duration:['program','logistics','execution'],venue:['logistics','resources','risk','program'],startTime:['logistics','program','execution'],programme:['program','organization','execution'],withdraw:['program','evaluation'],constraints:['basic','risk','execution']};
function localPatch(brief:EventBrief,text:string):ModelAdjustment['patch'] {
  const patch:ModelAdjustment['patch']={};
  const ambiguousMoney=/(预算|经费)/.test(text)&&/(减少|削减|增加)\s*\d/.test(text)&&!/(到|现在|现为|只能|变为|改为)/.test(text);
  const revised=reviseBrief(brief,text).brief;
  if(!ambiguousMoney&&revised.budget!==brief.budget)patch.budget=revised.budget;
  if(revised.people!==brief.people)patch.people=revised.people;if(revised.durationMinutes!==brief.durationMinutes)patch.duration=revised.durationMinutes;if(revised.venue!==brief.venue)patch.venue=revised.venue;
  const budgetRange=text.match(/(?:预算|经费)[^0-9]{0,6}(?:从)?\s*\d+(?:\.\d+)?\s*(?:万|千)?[^0-9]{0,12}(?:到|至|为)\s*(\d+(?:\.\d+)?)\s*(万|千)?/);if(budgetRange&&!ambiguousMoney)patch.budget=Number(budgetRange[1])*(budgetRange[2]==='万'?10000:budgetRange[2]==='千'?1000:1);
  if(!ambiguousMoney&&/(预算|经费)/.test(text)&&/(现在|只能|现为|降到|调整到|减少到|压缩到|改为|变为)/.test(text)){const matches=[...text.matchAll(/(\d+(?:\.\d+)?)\s*(万|千)?\s*(?:元|块)/g)];if(matches.length){const match=matches.at(-1)!;patch.budget=Number(match[1])*(match[2]==='万'?10000:match[2]==='千'?1000:1);}}
  if(/(报名|人数|参加|计划)/.test(text)&&/(现在|增加到|调整到|改为|变为|增至)/.test(text)){const matches=[...text.matchAll(/(\d+)\s*人/g)];if(matches.length)patch.people=Number(matches.at(-1)![1]);}
  const date=text.match(/(\d{4})[-年/](\d{1,2})[-月/](\d{1,2})日?/);if(date)patch.date=`${date[1]}-${date[2].padStart(2,'0')}-${date[3].padStart(2,'0')}`;
  const time=text.match(/(?:开始|开场|时间|改到|改为|调整到|推迟到)[^\d]{0,6}?(下午|上午|晚上)?\s*(\d{1,2})(?:[:：](\d{2})|点(?:(\d{1,2})分?)?)/);
  if(time){let hour=Number(time[2]);if((time[1]==='下午'||time[1]==='晚上')&&hour<12)hour+=12;patch.startTime=`${String(hour).padStart(2,'0')}:${String(Number(time[3]??time[4]??0)).padStart(2,'0')}`;}
  return parseModelAdjustment({patch}).patch;
}
export function makeProposal(plan:EventPlan,workspace:Workspace,text:string,model?:ModelAdjustment):AdjustmentProposal {
  const patch=model?.patch??localPatch(plan.brief,text);const changes:SuggestedChange[]=[];
  for(const key of ['people','budget','date','duration','venue','startTime','constraints'] as const){const value=patch[key];const before=key==='duration'?plan.brief.durationMinutes:key==='venue'?plan.brief.venue:key==='startTime'?workspace.tables['activity-settings']?.rows[0]?.startTime??'未填写':key==='constraints'?plan.brief.constraints:plan.brief[key];if(value!==undefined&&String(value)!==String(before))changes.push({id:uid(),key,label:labels[key],before:String(before),after:String(value),reason:model?'根据已配置模型的建议，需你确认':'从你明确输入的目标值提取；本地规则，不是模型回答',moduleIds:affected[key]});}
  if(/取消.*节目|节目.*取消/.test(text))for(const programme of workspace.tables.performances?.rows??[])if(programme.f0&&text.includes(programme.f0)&&programme.f4!=='取消')changes.push({id:uid(),key:'programme',label:`取消节目：${programme.f0}`,before:programme.f4||'待审核',after:'取消',reason:'保留原始节目记录，取消后从正式节目单排除',moduleIds:affected.programme,targetId:programme.id});
  if(/退赛/.test(text))for(const athlete of workspace.athletics.athletes)if((athlete.number&&new RegExp('(^|[^0-9])'+athlete.number.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'([^0-9]|$)').test(text)||athlete.name&&text.includes(athlete.name))&&athlete.status!=='退赛')changes.push({id:uid(),key:'withdraw',label:`退赛：${athlete.number} ${athlete.name}`,before:'已报名',after:'退赛',reason:'仅标记退赛，不删除姓名、报名项目和既有成绩',moduleIds:affected.withdraw,targetId:athlete.id});
  const warnings:string[]=[];const finance=expenseStats(workspace,plan.brief.budget);
  if(patch.budget!==undefined&&patch.budget<finance.used)warnings.push(`已登记支出 ¥${finance.used} 超过建议预算 ¥${patch.budget}，支出记录不会被修改。`);
  if(patch.people!==undefined)warnings.push('原始报名名单不会增删。请核实场地实际容量、签到窗口和物资可用量；方案人员配置仅为策划估算。');
  if(patch.date!==undefined)warnings.push('活动日期改变，需重新确认场地预约、嘉宾、通知与手工设置的任务期限。');
  if(patch.startTime){const earlier=workspace.flow.filter(node=>node.start&&node.start<patch.startTime!);if(earlier.length)warnings.push(`${earlier.length} 个既有流程早于新开始时间 ${patch.startTime}：${earlier.map(node=>node.title).join('、')}。原流程保留，需要人工重排。`);}
  if(changes.some(change=>change.key==='programme'))warnings.push('节目单与时长可自动重算；主持词、手工文档需确认后重新生成。');
  if(changes.some(change=>change.key==='withdraw'))warnings.push('退赛不自动抹除已录成绩；赛程需重新编排，成绩与积分由裁判核对。');
  const baseline=generatePlan(plan.brief);let previewBrief=plan.brief;for(const change of changes){if(['people','budget','duration','venue'].includes(change.key))previewBrief=applyPatch(previewBrief,change.key==='venue'?{venue:change.after as EventBrief['venue']}:{[change.key]:Number(change.after)}).brief;else if(change.key==='date')previewBrief=updateField(previewBrief,'date',change.after);else if(change.key==='constraints')previewBrief=updateField(previewBrief,'constraints',change.after);}const previewPlan=generatePlan(previewBrief);const moduleIds=new Set([...changes.flatMap(change=>change.moduleIds),...previewPlan.modules.filter(module=>JSON.stringify(module.blocks)!==JSON.stringify(baseline.modules.find(old=>old.id===module.id)?.blocks)).map(module=>module.id)]);
  const manualModules=plan.modules.filter(module=>moduleIds.has(module.id)&&JSON.stringify(module.blocks)!==JSON.stringify(baseline.modules.find(item=>item.id===module.id)?.blocks)).map(module=>module.id);
  if(manualModules.length)warnings.push(`${manualModules.length} 个受影响模块有手动内容，默认保留。只有勾选允许覆盖后才替换对应模块。`);
  return {id:uid(),source:model?'model':'local',request:text.slice(0,500),createdAt:new Date().toISOString(),base:adjustmentFingerprint(plan,workspace),changes,warnings,manualModules,explanation:model?.reply|| (changes.length?'已提取明确的调整目标，下面是尚未应用的修改建议。':'没有找到可确定的修改目标。请提供具体预算、人数、日期、开始时间，或说出要取消的节目名称。模型分析尚未配置时不会伪造回答。')};
}
export function applyProposal(plan:EventPlan,workspace:Workspace,proposal:AdjustmentProposal,selected:string[],overwrite:ModuleId[]=[]) {
  if(proposal.base!==adjustmentFingerprint(plan,workspace))throw new Error('方案或资料已变化，请重新生成修改预览，避免覆盖新数据。');
  const changes=proposal.changes.filter(change=>selected.includes(change.id));if(!changes.length)throw new Error('请至少选择一项修改');let brief=plan.brief;let nextWorkspace=structuredClone(workspace);
  for(const change of changes){if(['people','budget','duration','venue'].includes(change.key)){const patch=change.key==='venue'?{venue:change.after as EventBrief['venue']}:{[change.key]:Number(change.after)};brief=applyPatch(brief,patch).brief;}
    else if(change.key==='date')brief=updateField(brief,'date',change.after);
    else if(change.key==='constraints')brief=updateField(brief,'constraints',change.after);
    else if(change.key==='startTime'){const old=nextWorkspace.tables['activity-settings'];nextWorkspace.tables['activity-settings']={id:'activity-settings',name:'活动执行设置',fields:[{key:'startTime',label:'开始时间'}],rows:[{id:'settings',startTime:change.after}],revision:(old?.revision??0)+1};}
    else if(change.key==='programme'){const old=nextWorkspace.tables.performances;if(old)nextWorkspace.tables.performances={...old,rows:old.rows.map(row=>row.id===change.targetId?{...row,f4:'取消'}:row),revision:old.revision+1};}
    else if(change.key==='withdraw')nextWorkspace.athletics.athletes=nextWorkspace.athletics.athletes.map(athlete=>athlete.id===change.targetId?{...athlete,status:'退赛'}:athlete);
  }
  const beforeGenerated=generatePlan(plan.brief);const generated=generatePlan(brief);const changedIds:string[]=[];const preserved:string[]=[];
  const modules=plan.modules.map(module=>{const fresh=generated.modules.find(item=>item.id===module.id)!;const baseline=beforeGenerated.modules.find(item=>item.id===module.id)!;if(JSON.stringify(fresh.blocks)===JSON.stringify(baseline.blocks))return module;changedIds.push(module.title);
    if(JSON.stringify(module.blocks)!==JSON.stringify(baseline.blocks)&&!overwrite.includes(module.id)){preserved.push(module.title);return {...module,aiNote:`需求已调整；本模块含手动编辑，已保留。请核对最新人数、预算、日期与场地后更新。${module.aiNote?' '+module.aiNote:''}`};}
    return {...fresh,aiNote:module.aiNote};});
  const nextPlan={...plan,brief,modules,title:generated.title,oneLiner:generated.oneLiner,scale:generated.scale,assumptions:generated.assumptions};nextWorkspace=syncDocuments(nextWorkspace,nextPlan);
  return {plan:nextPlan,workspace:nextWorkspace,summary:[...changes.map(change=>`${change.label}：${change.before} → ${change.after}`),...changedIds.length?[`关联方案模块：${changedIds.join('、')}`]:[],...preserved.length?[`保留手动内容：${preserved.join('、')}（待核对）`]:[]],documentChanges:nextWorkspace.documents.filter(doc=>doc.source!==workspace.documents.find(old=>old.id===doc.id)?.source).map(doc=>`${doc.name} 自动同步`)};
}
