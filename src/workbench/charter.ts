import type {EventPlan,ModuleId} from '../types';
import {exportModules,moduleStatus} from '../planning/mode';
import {renderBlock} from '../rules/export';
import type {Workspace} from './model';

const chapters:{title:string;ids:ModuleId[]}[]=[
 {title:'活动概况',ids:['basic']},{title:'活动目标与组织原则',ids:['goals','audience']},{title:'活动时间和场地安排',ids:['logistics']},{title:'活动整体流程',ids:['program']},{title:'人员组织与工作组职责',ids:['organization']},{title:'具体执行方案',ids:['execution']},{title:'预算与资源配置',ids:['resources','budget']},{title:'宣传与参与者管理',ids:['promotion']},{title:'安全与应急安排',ids:['risk']},{title:'工作进度与任务节点',ids:[]},{title:'活动验收与复盘',ids:['evaluation']}];
const numerals=['一','二','三','四','五','六','七','八','九','十','十一'];
export function buildCharterMarkdown(plan:EventPlan,workspace:Workspace){
 const lines=[`# ${plan.title}`,'活动组织章程 / 执行方案','',`主办单位：${workspace.profile.organizer||'待确认'}`,`活动时间：${plan.brief.dateLabel||plan.brief.date||'待确认'}`,`活动地点：${workspace.profile.location||plan.brief.venueNote||'待确认'}`,`版本：${new Date().toISOString().slice(0,10)}`,`编制日期：${new Date().toLocaleDateString('zh-CN')}`,''];
 const visible=new Map(exportModules(plan).map(m=>[m.id,m]));
 let chapter=0;
 for(const section of chapters){const modules=section.ids.map(id=>visible.get(id)).filter((m):m is NonNullable<typeof m>=>!!m);
  const groups=section.title==='人员组织与工作组职责'?(workspace.workGroups??[]):[];
  const flow=section.title==='活动整体流程'&&moduleStatus(plan,'program')==='confirmed'?workspace.flow:[];
  const tasks=section.title==='工作进度与任务节点'?(workspace.workGroups??[]).flatMap(g=>g.tasks.map(t=>({group:g.name,task:t}))):[];
  const safetyNote=section.title==='安全与应急安排'&&moduleStatus(plan,'risk')==='not-needed'?plan.moduleStates?.risk?.note:'';
  if(!modules.length&&!groups.length&&!flow.length&&!tasks.length&&!safetyNote)continue;
  lines.push(`## 第${numerals[chapter++]||String(chapter)}章 ${section.title}`,'');
  for(const module of modules){lines.push(`### ${module.title}`,'');for(const block of module.blocks)lines.push(...renderBlock(block).map(line=>line.replaceAll('**','')));if(module.aiNote)lines.push(`组织者确认的补充：${module.aiNote}`,'');}
  if(flow.length){lines.push('### 已确认的现场时间安排','');for(const item of flow)lines.push(`- ${item.start||'待定'}–${item.end||'待定'} ${item.title}；负责人：${item.owner||'待确认'}`);lines.push('');}
  if(groups.length){lines.push('### 工作组职责摘要','');for(const group of groups)lines.push(`- ${group.name}｜组长：${group.leader||'待确认'}｜目标：${group.goal||'待确认'}｜任务：${group.tasks.map(t=>t.title).filter(Boolean).join('、')||'待分配'}`);lines.push('');}
  if(tasks.length){lines.push('### 关键任务及前置关系','');for(const {group,task} of tasks)lines.push(`- ${group} · ${task.title||'待命名'}：${task.start||'待定'} 至 ${task.due||'待定'}；负责人 ${task.owner||'待确认'}；前置任务 ${(workspace.workGroups??[]).flatMap(g=>g.tasks).find(t=>t.id===task.dependsOn)?.title||'无'}`);lines.push('');}
  if(safetyNote)lines.push('### 最低限度安全确认',safetyNote,'');
 }
 return lines.join('\n').replace(/\*\*/g,'');
}
