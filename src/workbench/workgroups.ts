import type {EventPlan} from '../types';
import {uid,type ActivityDocument,type WorkGroup,type WorkGroupTask,type Workspace} from './model';

export function recommendedGroupNames(plan:EventPlan){
 const large=plan.brief.people>=100||plan.planningMode==='full';
 const common=['统筹组','场地组','后勤组','安全组'];
 const special=plan.brief.family==='arts'?['节目组','设备组','宣传组','志愿者组']:plan.brief.family==='sports'?['竞赛组','裁判组','医疗组','宣传组']:plan.brief.family==='academic'?['学术组','接待组','设备组']:['宣传组','接待组','志愿者组'];
 return large?[...new Set([...common,...special,'财务组'])]:['统筹组','执行组'];
}
export function createWorkGroup(name:string):WorkGroup{return {id:uid(),name,leader:'',members:'',contact:'',goal:'',duties:'',reporting:'',tasks:[]};}
export function createGroupTask():WorkGroupTask{return {id:uid(),title:'',content:'',owner:'',collaborators:'',start:'',due:'',resources:'',budget:0,dependsOn:'',deliverable:'',status:'待开始'};}
export function groupIssues(group:WorkGroup,all:WorkGroup[]){
 const problems:string[]=[];const tasks=all.flatMap(g=>g.tasks);
 for(const task of group.tasks){if(!task.owner.trim())problems.push(`${task.title||'未命名任务'}缺少负责人`);if(task.start&&task.due&&task.due<task.start)problems.push(`${task.title||'未命名任务'}的截止时间早于开始时间`);if(task.dependsOn){const parent=tasks.find(t=>t.id===task.dependsOn);if(!parent)problems.push(`${task.title||'未命名任务'}的前置任务不存在`);else if(parent.due&&task.start&&parent.due>task.start)problems.push(`${task.title||'未命名任务'}早于前置任务完成`);}}return problems;
}
export function groupDocument(plan:EventPlan,workspace:Workspace,group:WorkGroup):ActivityDocument{
 const all=workspace.workGroups??[],tasks=group.tasks;
 const lines=[`# ${plan.title} · ${group.name}工作任务书`,'',`活动时间：${plan.brief.dateLabel||plan.brief.date||'待确认'}`,`活动地点：${workspace.profile.location||plan.brief.venueNote||'待确认'}`,`主办单位：${workspace.profile.organizer||'待确认'}`,'', '## 一、本组职责',group.duties||'待负责人补充','', '## 二、工作目标',group.goal||'待负责人补充','',`组长：${group.leader||'待确认'}`,`成员：${group.members||'待确认'}`,`联系与汇报：${group.contact||'待确认'}；${group.reporting||'待确认'}`,'','## 三、具体任务'];
 for(const [index,task] of tasks.entries()){const parent=all.flatMap(g=>g.tasks).find(t=>t.id===task.dependsOn);lines.push(`${index+1}. ${task.title||'待命名任务'}（${task.status}）`,`工作内容：${task.content||'待补充'}`,`负责人：${task.owner||'待确认'}；协作人员：${task.collaborators||'待确认'}`,`时间：${task.start||'待定'} 至 ${task.due||'待定'}`,`资源：${task.resources||'待确认'}；预算：¥${task.budget||0}`,`交付成果：${task.deliverable||'待确认'}`,`前置任务：${parent?.title||'无'}`,'');}
 lines.push('## 四、协作与核查',groupIssues(group,all).map(x=>`待核查：${x}`).join('\n')||'当前未发现负责人、时间或依赖冲突。');
 const now=new Date().toISOString();return {id:uid(),activityId:plan.id,toolId:`workgroup-${group.id}`,type:'text',name:`${group.name}工作任务书`,category:'任务分工文件',text:lines.join('\n'),headers:[],rows:[],createdAt:now,updatedAt:now,version:1,source:JSON.stringify([plan.brief,group]),manual:false,ai:false,formats:['docx','pdf']};
}
