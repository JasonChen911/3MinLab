import type { EventPlan } from '../types';
import {emergencyFields,reviewReport} from '../lifecycle/records';
import { buildPlanMarkdown } from '../rules/export';
import { rankProject, teamStandings } from './athletics';
import { DEFAULT_SPORTS_RULES, fixtures, judgeRanking, orderedAgenda, sportsStandings, type Criterion, type JudgeScore, type Match, type SportsRules } from './calculations';
import { getTool } from './registry';
import { uid, type ActivityDocument, type DataRow, type ToolDefinition, type Workspace } from './model';
export function getDefinition(id:string,workspace:Workspace):ToolDefinition|undefined {
  if(id.startsWith('case-ref-'))return {id,name:workspace.documents.find(d=>d.toolId===id)?.name??'历史案例参考',scene:'custom',kind:'text',description:'组织者确认的历史记录副本',category:'总结与反馈文件'};
  const lifecycleNames:Record<string,string>={'emergency':'应急预案','actual-review':'活动复盘报告','ai-lifecycle-notes':'AI 分析建议（待核实）'};
  if(lifecycleNames[id])return {id,name:lifecycleNames[id],scene:'custom',kind:'text',description:'关联当前活动记录',category:'总结与反馈文件'};
  const template=workspace.customTemplates.find(item=>item.id===id);
  return getTool(id)??(template?{id:template.id,name:template.name,scene:'custom',kind:template.kind,description:'自定义活动工具',category:'活动专属文件',fields:template.fields,body:template.text}:undefined);
}
export function tableRows(workspace:Workspace,id:string) {return workspace.tables[id]?.rows??[];}
export function sportsData(workspace:Workspace) {
  const rulesRow=tableRows(workspace,'sports-settings')[0];
  let rules=DEFAULT_SPORTS_RULES;
  try { if(rulesRow?.json)rules={...rules,...JSON.parse(rulesRow.json)}; }catch{ /* 保留默认配置 */ }
  const teams=tableRows(workspace,'sports-team-data').map(row=>row.name.trim()).filter(Boolean);
  const records=tableRows(workspace,'sports-match-data') as unknown as Match[];
  return {teams,rules:rules as SportsRules,matches:fixtures([...new Set(teams)],rules,records)};
}
export function scoringData(workspace:Workspace) {
  const criteria=tableRows(workspace,'judge-criteria').map(row=>({id:row.id,name:row.name,weight:Number(row.weight),max:Number(row.max)})) as Criterion[];
  const scores=tableRows(workspace,'judge-scores').map(row=>({id:row.id,project:row.project,judge:row.judge,criterion:row.criterion,value:row.value,absent:row.absent==='是'})) as JudgeScore[];
  const settings=tableRows(workspace,'judge-settings')[0];
  const projects=tableRows(workspace,'contest-projects').map(row=>row.f0).filter(Boolean);
  const rankings=judgeRanking(projects,criteria,scores,Math.max(1,Number(settings?.judges)||1),settings?.absence==='zero'?'zero':'exclude',settings?.ties==='first'?'first':'shared');
  return {criteria,scores,rankings};
}
export function documentSource(workspace:Workspace,plan:EventPlan,toolId:string) {
  const tool=getDefinition(toolId,workspace);
  const dependencies=['actual-review','ai-lifecycle-notes'].includes(toolId)?workspace.tables:tool?.kind==='athletics'||toolId==='ath-rules'?workspace.athletics
    :tool?.kind==='sports'?Object.entries(workspace.tables).filter(([id])=>id.startsWith('sports-'))
    :tool?.kind==='scoring'?Object.entries(workspace.tables).filter(([id])=>id.startsWith('judge-')||id==='contest-projects')
    :tool?.scene==='performance'?[workspace.tables.performances,workspace.tables['performances-settings'],workspace.tables[toolId]]
    :tool?.scene==='conference'?[workspace.tables.reports,workspace.tables['reports-settings'],workspace.tables[toolId]]
    :workspace.tables[tool?.source??toolId];
  return JSON.stringify([plan.title,plan.theme,plan.brief,workspace.profile,workspace.people,workspace.flow,dependencies,workspace.tables.registrations,workspace.tables.expenses,workspace.tables.materials,tool?.body,tool?.fields]);
}
export function contextVariables(workspace:Workspace,plan:EventPlan) {
  const shows=orderedAgenda(tableRows(workspace,'performances'),'09:00',true);
  const reports=orderedAgenda(tableRows(workspace,'reports'));
  const volunteerHours=tableRows(workspace,'volunteers').reduce((sum,row)=>sum+Math.max(0,Number(row.f5)||0),0);
  const {teams,matches,rules}=sportsData(workspace);
  const finance=workspace.tables.expenses?.rows??[];
  const stats={真实报名记录:(workspace.tables.registrations?.rows.length??0),已登记经费支出:finance.reduce((sum,row)=>sum+Math.max(0,Number(row.actual)||0),0),人员登记:workspace.people.length,运动员报名:workspace.athletics.athletes.length,有效决赛成绩:workspace.athletics.results.filter(r=>r.round==='决赛'&&r.status==='有效').length,审核通过节目:shows.length,演出分钟:shows.reduce((sum,item)=>sum+item.duration,0),会议报告:reports.length,已登记志愿服务小时:volunteerHours,参赛队伍:teams.length,已完成球赛:matches.filter(m=>m.status==='完赛').length,球赛积分规则:`胜${rules.win}/平${rules.draw}/负${rules.loss}`};
  return {'活动名称':plan.title,'举办时间':plan.brief.dateLabel||plan.brief.date||'待确认','举办地点':workspace.profile.location||plan.brief.venueNote||'待确认','主办单位':workspace.profile.organizer||'待填写','承办单位':workspace.profile.coorganizer||'待填写','负责人':workspace.profile.owner||'待填写','活动主题':plan.theme,'活动目标':plan.brief.goal,'参与人员':workspace.people.map(p=>p.name).join('、')||'尚未登记','活动流程':workspace.flow.map(n=>`${n.start}–${n.end} ${n.title}`).join('\n')||'尚未登记执行流程','节目单':shows.map((item,i)=>`${i+1}. ${item.row.f0} / ${item.row.f1} / ${item.duration}分钟`).join('\n')||'尚无审核通过的节目','会议议程':reports.map(item=>`${item.start}–${item.end} ${item.row.f0}（${item.row.f1}）`).join('\n')||'尚无已登记报告','统计数据':Object.entries(stats).map(([key,value])=>`${key}：${value}`).join('\n'),'比赛项目':workspace.athletics.projects.map(p=>`${p.name}（${p.group}）`).join('、')||'待配置','计分规则':`名次积分 ${workspace.athletics.points.join('、')}；接力系数 ${workspace.athletics.relayFactor}；并列${workspace.athletics.tiePoints==='average'?'平均分配所占名次积分':'按同名次积分'}`,'录取名次':String(workspace.athletics.awardPlaces)};
}
export function fillTemplate(text:string,variables:Record<string,string>) {return text.replace(/\{\{([^{}]+)\}\}/g,(match,key:string)=>variables[key.trim()]??match);}
export function documentContent(workspace:Workspace,plan:EventPlan,toolId:string):Pick<ActivityDocument,'type'|'text'|'headers'|'rows'> {
  if(toolId.startsWith('case-ref-'))return {type:'text',headers:[],rows:[],text:workspace.documents.find(d=>d.toolId===toolId)?.text??'历史记录缺失，请重新引用'};
  if(toolId==='emergency')return {type:'text',headers:[],rows:[],text:(workspace.tables.emergency?.rows??[]).map(r=>emergencyFields.map(f=>`${f.label}：${r[f.key]||'待确认'}`).join('\n')).join('\n\n')+'\n\n消防、医疗和疏散措施须专业审核。'};
  if(toolId==='actual-review')return {type:'text',headers:[],rows:[],text:reviewReport(plan,workspace)};
  if(toolId==='ai-lifecycle-notes')return {type:'text',headers:[],rows:[],text:workspace.documents.find(d=>d.toolId===toolId)?.text??'需重新请求 AI 并确认建议'};
  if(toolId==='plan')return {type:'text',text:buildPlanMarkdown(plan),headers:[],rows:[]};
  const tool=getDefinition(toolId,workspace); const data=workspace.athletics;
  const table=(headers:string[],rows:string[][])=>({type:'table' as const,text:'',headers,rows});
  if(toolId==='ath-entry')return table(['编号','姓名','队伍','组别','参赛项目','报名成绩'],data.athletes.map(a=>[a.number,a.name,a.team,a.group,a.projects.map(id=>data.projects.find(p=>p.id===id)?.name??id).join('、'),a.seed]));
  if(toolId==='ath-schedule')return table(['项目','轮次','组次','开始','分钟','场地','裁判','道次编号'],data.races.map(r=>[data.projects.find(p=>p.id===r.projectId)?.name??'',r.round,String(r.heat),r.start,String(r.duration),r.venue,r.officials,r.athletes.map(id=>data.athletes.find(a=>a.id===id)?.number??id).join('、')]));
  if(toolId==='ath-checkin')return table(['项目','轮次','组别','组次','道次','编号','姓名','队伍','成绩','名次','备注'],data.races.flatMap(r=>r.athletes.map((id,index)=>{const a=data.athletes.find(item=>item.id===id);const p=data.projects.find(item=>item.id===r.projectId);const result=data.results.find(item=>item.projectId===r.projectId&&item.athleteId===id&&item.round===r.round);const ranked=rankProject(data,r.projectId,r.round).find(item=>item.athlete.id===id);return [p?.name??'',r.round,p?.group??'',String(r.heat),String(index+1),a?.number??'',a?.name??'',a?.team??'',result?.value??'',ranked?.rank===null?'待核定':String(ranked?.rank??''),result?.note??''];})));
  if(toolId==='ath-team')return table(['名次','队伍','总分','第一名次数'],teamStandings(data).map(row=>[String(row.rank),row.team,String(row.points),String(row.golds)]));
  if(toolId==='ath-results'||toolId==='ath-awards')return table(['项目','组别','轮次','编号','姓名','队伍','成绩','状态','名次','积分','备注'],data.projects.flatMap(p=>data.results.filter(r=>r.projectId===p.id).flatMap(r=>{const athlete=data.athletes.find(a=>a.id===r.athleteId);const ranked=rankProject(data,p.id,r.round).find(row=>row.result.id===r.id);if(toolId==='ath-awards'&&(!ranked?.rank||ranked.rank>data.awardPlaces||r.round!=='决赛'))return [];return [[p.name,p.group,r.round,athlete?.number??'',athlete?.name??'',athlete?.team??'',r.value,r.status,ranked?.rank===null?'待核定':String(ranked?.rank??''),String(ranked?.points??0),r.note]];})));
  if(tool?.kind==='performance') {
    const source=tool.source??'performances',performance=source==='performances';const agenda=orderedAgenda(tableRows(workspace,source),tableRows(workspace,source+'-settings')[0]?.start||'09:00',performance);
    if(toolId==='conference-abstracts')return table(['报告题目','主讲人','所属单位','摘要'],agenda.map(item=>[item.row.f0,item.row.f1,item.row.f2,item.row.f3]));
    if(toolId==='show-equipment')return table(['节目','人员','设备需求','核查状态'],agenda.map(item=>[item.row.f0,item.row.f1,item.row.f5||'待填写','待核查']));
    if(toolId==='show-rehearsal')return table(['节目','演出人员','彩排时间','设备需求'],agenda.map(item=>[item.row.f0,item.row.f1,item.row.f6||'待安排',item.row.f5||'待填写']));
    return table(['顺序','开始','结束','节目/报告','人员','时长（分钟）','设备/场地'],agenda.map((item,i)=>[String(i+1),item.start,item.end,item.row.f0,item.row.f1,String(item.duration),item.row.f5??'']));
  }
  if(tool?.kind==='sports') {
    const {teams,matches,rules}=sportsData(workspace);
    if(toolId==='sports-teams')return table(['队伍'],teams.map(team=>[team]));
    if(toolId==='sports-standings'||toolId==='sports-awards')return table(['名次','队伍','场次','胜','平','负','得分/进球','失分/失球','积分'],sportsStandings(teams,matches,rules).map(row=>[row.rank,row.team,row.played,row.won,row.drawn,row.lost,row.for,row.against,row.points].map(String)));
    return table(['轮次','分组','主队','客队','主队分','客队分','状态','裁判','时间','场地'],matches.map(m=>[String(m.round),m.group,m.home,m.away,m.scoreHome,m.scoreAway,m.status,m.referee,m.start,m.venue]));
  }
  if(tool?.kind==='scoring')return table(['名次','项目','加权平均分','状态'],scoringData(workspace).rankings.map(row=>[row.rank?String(row.rank):'',row.project,row.score.toFixed(2),row.pending?'待补全/核验':'已计算']));
  if(tool?.kind==='table') {const current=workspace.tables[toolId];const columns=current?.fields??tool.fields??[];return table(columns.map(f=>f.label),(current?.rows??[]).map(row=>columns.map(f=>row[f.key]??'')));}
  return {type:'text',text:fillTemplate(tool?.body??'{{活动名称}}',contextVariables(workspace,plan)),headers:[],rows:[]};
}
export function createDocument(workspace:Workspace,plan:EventPlan,toolId:string):ActivityDocument {
  const tool=getDefinition(toolId,workspace);const now=new Date().toISOString();
  return {id:uid(),activityId:plan.id,toolId,name:tool?.name??'活动策划文件',category:tool?.category??'活动策划文件',...documentContent(workspace,plan,toolId),createdAt:now,updatedAt:now,version:1,source:documentSource(workspace,plan,toolId),manual:false,ai:false,formats:['docx','xlsx','pdf']};
}
export function syncDocuments(workspace:Workspace,plan:EventPlan):Workspace {
  return {...workspace,documents:workspace.documents.map(doc=> {
    const source=doc.toolId==='plan'?JSON.stringify(plan.modules):documentSource(workspace,plan,doc.toolId);
    if(doc.manual||doc.ai||doc.type!=='table'||doc.source===source)return doc;
    return {...doc,...documentContent(workspace,plan,doc.toolId),source,updatedAt:new Date().toISOString(),version:doc.version+1};
  })};
}
export function updateTable(workspace:Workspace,id:string,rows:DataRow[],name?:string):Workspace {
  const tool=getDefinition(id,workspace);const previous=workspace.tables[id];
  return {...workspace,tables:{...workspace.tables,[id]:{...previous,id,name:name??previous?.name??tool?.name??id,fields:previous?.fields??tool?.fields??[],rows,revision:(previous?.revision??0)+1}}};
}
export async function exportDocument(doc:ActivityDocument,format:string,activityTitle:string) {
  const response=await fetch('/api/files/export',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({format,title:doc.name,activityTitle,text:doc.text,headers:doc.headers,rows:doc.rows})});
  if(!response.ok){const error=await response.json().catch(()=>({}));throw new Error(error.error??'导出失败');}
  const url=URL.createObjectURL(await response.blob());const a=document.createElement('a');a.href=url;a.download=`${activityTitle}-${doc.name}.${format}`;a.click();window.setTimeout(()=>URL.revokeObjectURL(url),30000);
}
