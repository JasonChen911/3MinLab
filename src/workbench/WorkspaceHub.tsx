import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowRight, CalendarDays, FileText, LayoutDashboard, Users, Wrench, BarChart3, MapPin, CheckCircle2, Sparkles } from 'lucide-react';
import type { EventPlan } from '../types';
import { SCENES, TOOLS, recommendedTools, fields as makeFields } from './registry';
import { uid, type ActivityDocument, type CustomTemplate, type Scene, type Workspace } from './model';
import { loadTemplates, loadWorkspace, saveTemplates, saveWorkspace } from './storage';
import { contextVariables, createDocument, documentContent, documentSource, exportDocument, getDefinition, scoringData, sportsData, syncDocuments, tableRows, updateTable } from './documents';
import { teamStandings, validateEntries, scheduleConflicts, resultIssues } from './athletics';
import { orderedAgenda } from './calculations';
import Grid from './Grid';
import AthleticsPanel from './AthleticsPanel';
import { PerformancePanel, ScoringPanel, SportsPanel } from './SpecializedPanels';
import { downloadProjectBackup } from '../projects/backup';
import { saveProjectParts, projectRepository } from '../projects/repository';
import AssistantPanel from '../assistant/AssistantPanel';
import { acceptAdjustment, undoAdjustment } from '../assistant/history';
import type { AdjustmentProposal } from '../assistant/service';
import OrganizerIdeaUpload from '../materials/OrganizerIdeaUpload';
import MaterialsCenter from '../materials/MaterialsCenter';
import { expenseStats } from '../materials/import';
import { PROJECT_STATUSES } from '../projects/model';
import './workbench.css';
const tabs=[{id:'overview',name:'活动概览',icon:LayoutDashboard},{id:'plan',name:'策划方案',icon:FileText},{id:'materials',name:'活动资料',icon:FileText},{id:'tools',name:'专属工具箱',icon:Wrench},{id:'documents',name:'文档中心',icon:FileText},{id:'people',name:'人员与任务',icon:Users},{id:'stats',name:'数据统计',icon:BarChart3}];
const categories=['全部','活动策划文件','报名与人员资料','活动流程文件','任务分工文件','预算与物资文件','活动专属文件','成绩与统计文件','总结与反馈文件'];
export default function WorkspaceHub({plan,apiKey,children,onPlanChange,onRestoreProject,assistantRequest}:{plan:EventPlan;apiKey:string;children:ReactNode;onPlanChange?:(plan:EventPlan)=>void;onRestoreProject?:(project:import('../projects/model').ActivityProject)=>void;assistantRequest?:{id:string;text:string}|null}) {
  const [loaded]=useState(()=>loadWorkspace(plan));const [data,setData]=useState(loaded.data);const [tab,setTab]=useState('overview');const [status,setStatus]=useState(loaded.error);const [activeTool,setActiveTool]=useState('');const [selectedDoc,setSelectedDoc]=useState('');const [query,setQuery]=useState('');const [category,setCategory]=useState('全部');const [busy,setBusy]=useState('');const [library,setLibrary]=useState(loadTemplates);const [aiDraft,setAiDraft]=useState('');const [suggestion,setSuggestion]=useState<{toolIds:string[];fields:string[];reason:string}|null>(null);const [readError,setReadError]=useState(!!loaded.error);
  const workspaceEdited=useRef(false);
  async function commit(next:Workspace,reason?:string) {
    workspaceEdited.current=true;
    if(readError){setStatus('存档异常，已阻止覆盖。请先导出原始存档再保存。');return false;}
    const synced=syncDocuments(next,plan);setData(synced);saveWorkspace(synced);setStatus('正在保存活动资料…');
    try {const saved=reason?await projectRepository.update(plan.id,current=>{if(!current)throw new Error('请先保存活动');const version={id:uid(),createdAt:new Date().toISOString(),reason,source:'user' as const,before:{plan:current.plan,draft:current.draft,workspace:current.workspace,attachments:current.attachments},afterSummary:[reason,'原文件保留，结构化数据经确认追加导入'],documentChanges:synced.documents.filter(doc=>doc.version!==(current.workspace?.documents.find(old=>old.id===doc.id)?.version??doc.version)).map(doc=>doc.name),afterFingerprint:JSON.stringify([plan,synced])};return {...current,plan,draft:plan.brief,workspace:synced,versions:[...current.versions,version].slice(-20)};}):await saveProjectParts(plan.id,{draft:plan.brief,plan,workspace:synced,stage:'plan'});setStatus(`已保存：${new Date(saved.updatedAt).toLocaleTimeString('zh-CN')}`);return true;}catch(error){setStatus(error instanceof Error?error.message:'保存失败，请备份');return false;}
  }

  useEffect(()=>{let alive=true;void projectRepository.get(plan.id).then(project=>{if(alive&&!workspaceEdited.current&&project?.workspace){setData(syncDocuments(project.workspace,plan));saveWorkspace(project.workspace);}}).catch(error=>setStatus(error.message));return()=>{alive=false;};},[plan.id]);
  useEffect(()=>{const synced=syncDocuments(data,plan);if(JSON.stringify(synced.documents)!==JSON.stringify(data.documents))commit(synced);},[plan]); // 已编辑文档只提示过期，不自动覆盖
  async function acceptAssistant(proposal:AdjustmentProposal,selected:string[],overwrite:import('../types').ModuleId[]) {
    const saved=await acceptAdjustment(plan.id,plan,data,proposal,selected,overwrite);
    if(saved.workspace){setData(saved.workspace);saveWorkspace(saved.workspace);}if(saved.plan)onPlanChange?.(saved.plan);setStatus(`调整已保存：${new Date(saved.updatedAt).toLocaleTimeString('zh-CN')}`);
  }
  async function undoAssistant(force=false) {
    const restored=await undoAdjustment(plan.id,force);
    if(restored.workspace){setData(restored.workspace);saveWorkspace(restored.workspace);}if(restored.plan)onPlanChange?.(restored.plan);else onRestoreProject?.(restored);setStatus('已撤销最近一次重要调整');
  }
  const active=getDefinition(activeTool,data);const doc=data.documents.find(item=>item.id===selectedDoc);
  const suggested=recommendedTools(data);const enabled=data.tools.map(id=>getDefinition(id,data)).filter((tool):tool is NonNullable<typeof tool>=>!!tool);
  const taskRows=tableRows(data,'tasks');const completed=taskRows.filter(row=>row.status==='已完成').length;
  const sourceFor=(document:ActivityDocument)=>document.toolId==='plan'?JSON.stringify(plan.modules):documentSource(data,plan,document.toolId);
  function generateDoc(id:string) {
    const previous=data.documents.find(item=>item.toolId===id);
    if(previous?.manual&&!window.confirm('这份文档有手动编辑，重新生成将覆盖当前内容。继续？'))return;
    let next=createDocument(data,plan,id);if(id==='plan')next={...next,source:JSON.stringify(plan.modules)};
    if(previous)next={...next,id:previous.id,createdAt:previous.createdAt,version:previous.version+1};
    commit({...data,documents:previous?data.documents.map(item=>item.id===previous.id?next:item):[...data.documents,next]});setSelectedDoc(next.id);setTab('documents');setAiDraft('');
  }
  async function exportCurrent(document:ActivityDocument,format:string) {
    setBusy(`正在生成 ${format.toUpperCase()}…`);try{await exportDocument(document,format,plan.title);setStatus('文件已生成，下载已开始');}catch(error){setStatus(error instanceof Error?error.message:'导出失败');}finally{setBusy('');}
  }
  function updateDoc(patch:Partial<ActivityDocument>) {if(!doc)return;commit({...data,documents:data.documents.map(item=>item.id===doc.id?{...item,...patch,manual:true,updatedAt:new Date().toISOString(),version:item.version+1}:item)});}
  function openTool(id:string) {
    let next={...data,tools:[...new Set([...data.tools,id])]};const tool=getDefinition(id,next);
    if(tool?.kind==='table'&&!next.tables[id])next={...next,tables:{...next.tables,[id]:{id,name:tool.name,fields:tool.fields??[],rows:[],revision:0}}};
    if(tool?.kind==='performance'){const source=tool.source??'performances';if(!next.tables[source]){const original=getDefinition(source,next);next={...next,tables:{...next.tables,[source]:{id:source,name:original?.name??source,fields:original?.fields??[],rows:[],revision:0}}};}}
    commit(next);setActiveTool(id);setTab('tools');
  }
  function createCustom(template?:CustomTemplate) {
    const name=template?.name??window.prompt('工具 / 文档名称');if(!name?.trim())return;
    const kind=template?.kind??(window.confirm('创建可编辑表格？选择“取消”创建文字文档。')?'table':'text');
    const custom:CustomTemplate={id:uid(),name:name.trim(),kind,text:template?.text??'活动：{{活动名称}}\n时间：{{举办时间}}\n地点：{{举办地点}}\n负责人：{{负责人}}\n\n请补充活动专属内容。',fields:template?.fields??makeFields(['名称','负责人','状态','备注'])};
    const next={...data,customTemplates:[...data.customTemplates,custom],tools:[...data.tools,custom.id],tables:kind==='table'?{...data.tables,[custom.id]:{id:custom.id,name:custom.name,fields:custom.fields,rows:[],revision:0}}:data.tables};commit(next);setActiveTool(custom.id);setTab('tools');
  }
  function saveAsTemplate() {
    if(!doc)return;const template:CustomTemplate={id:uid(),name:doc.name,kind:doc.type,text:doc.text,fields:doc.headers.map(label=>({key:uid(),label}))};
    const next=[...library,template];if(saveTemplates(next)){setLibrary(next);commit({...data,customTemplates:[...data.customTemplates,template]});setStatus('模板已保存。表格模板只保存列结构，不复制人员数据；文字中可用 {{活动名称}} 等变量。');}else setStatus('模板保存失败，请导出备份');
  }
  async function ai(mode:'document'|'recommend') {
    setBusy(mode==='document'?'AI 正在起草…':'AI 正在分析工具…');
    try {const response=await fetch('/api/documents/ai',{method:'POST',headers:{'Content-Type':'application/json',...(apiKey?{'X-DeepSeek-API-Key':apiKey}:{})},body:JSON.stringify({mode,name:doc?.name??'',context:contextVariables(data,plan),tools:TOOLS.map(tool=>({id:tool.id,name:tool.name})),instruction:mode==='document'?doc?.text??'':'根据活动目标、流程、参与对象推荐工具；不创建计算规则'})});const result=await response.json();if(!response.ok)throw new Error(result.error??'AI 请求失败');if(mode==='document')setAiDraft(result.text);else setSuggestion(result);}
    catch(error){setStatus(error instanceof Error?error.message:'AI 请求失败');}finally{setBusy('');}
  }
  function backup() {void downloadProjectBackup(plan.id).then(()=>setStatus('完整活动备份已下载，包含附件原文件')).catch(error=>setStatus(error.message));}

  const personFields=[{key:'name',label:'姓名或代号'},{key:'roles',label:'角色（逗号分隔）'},{key:'organization',label:'组织单位'},...(data.tables['people-fields']?.fields??[{key:'note',label:'备注'}])];
  const renderCard=(tool:NonNullable<ReturnType<typeof getDefinition>>)=> <article className="wb-tool-card" key={tool.id}><span className="wb-tool-icon"><Wrench size={18}/></span><span className="wb-badge">{data.tools.includes(tool.id)?'已启用':'可添加'}</span><h3>{tool.name}</h3><p>{tool.description}</p><div className="wb-card-foot"><span>{tool.kind==='text'?'文档模板':tool.kind==='table'?'数据表格':'专业工具'}</span><button type="button" onClick={()=>openTool(tool.id)}>{data.tools.includes(tool.id)?'打开工具':'添加并打开'} <ArrowRight size={14}/></button></div></article>;
  return <div className="wb-hub">
    <header className="wb-event-head"><div><span className="mini-label">ACTIVITY WORKSPACE</span><h1>{plan.title}</h1><div className="wb-meta"><span><CalendarDays size={15}/>{plan.brief.dateLabel||'日期待确认'}</span><span><MapPin size={15}/>{data.profile.location||'地点待填写'}</span><span className="wb-badge">{data.profile.status}</span></div></div><button type="button" onClick={backup}>备份活动资料</button></header>
    <nav className="wb-main-tabs" aria-label="活动工作区">{tabs.map(item=><button key={item.id} type="button" className={tab===item.id?'active':''} aria-current={tab===item.id?'page':undefined} onClick={()=>setTab(item.id)}><item.icon size={17}/>{item.name}</button>)}</nav>
    {(status||busy)&&<p className={status.includes('失败')||status.includes('不足')||status.includes('异常')?'wb-notice error':'wb-save-status'} role="status">{busy||status}</p>}
    {tab==='overview'&&<>
      <div className="wb-section-heading"><div><h2>让好想法，有序落地。</h2><p>先确认活动资料，再选择需要的执行工具。</p></div><button className="primary" type="button" onClick={()=>setTab('plan')}>查看策划方案 <ArrowRight size={16}/></button></div>
      <div className="wb-metrics">{[['实际报名',data.scene==='athletics'?data.athletics.athletes.filter(a=>a.status!=='退赛').length:(data.tables.registrations?.rows.length??0)],['已启用工具',data.tools.length],['活动文档',data.documents.length],['任务完成',`${completed}/${taskRows.length}`]].map(([label,value])=><div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
      <div className="wb-overview-grid"><section className="wb-card"><h3>活动基本资料</h3><p className="wb-help">资料会自动带入文档，尚未填写的信息保留为待确认。</p><div className="wb-form-grid">{(['organizer','coorganizer','owner','location'] as const).map((key,i)=><label key={key}>{['主办单位','承办单位','活动负责人','具体地点'][i]}<input value={data.profile[key]} onChange={e=>commit({...data,profile:{...data.profile,[key]:e.target.value}})}/></label>)}<label>活动开始时间<input type="time" value={data.tables['activity-settings']?.rows[0]?.startTime??''} onChange={e=>commit(updateTable(data,'activity-settings',[{id:'settings',startTime:e.target.value}]))}/></label><label>活动状态<select value={data.profile.status} onChange={e=>commit({...data,profile:{...data.profile,status:e.target.value}})}>{PROJECT_STATUSES.map(v=><option key={v}>{v}</option>)}</select></label><label>专属工具场景<select value={data.scene} onChange={e=>commit({...data,scene:e.target.value as Scene})}>{SCENES.map(scene=><option key={scene.id} value={scene.id}>{scene.name}</option>)}</select></label></div></section>
      <section className="wb-card wb-next"><h3>下一步</h3><button type="button" onClick={()=>setTab('materials')}>上传与管理真实活动资料 <ArrowRight size={15}/></button>{!data.profile.owner&&<button type="button" onClick={()=>document.querySelector<HTMLInputElement>('.wb-form-grid input')?.focus()}>填写主办方与负责人 <ArrowRight size={15}/></button>}<button type="button" onClick={()=>setTab('tools')}>选择活动专属工具 <ArrowRight size={15}/></button><button type="button" onClick={()=>setTab('people')}>登记人员与执行任务 <ArrowRight size={15}/></button><button type="button" onClick={()=>generateDoc('plan')}>生成可编辑策划文档 <ArrowRight size={15}/></button><p className="wb-help">计划规模 {plan.brief.people} 人 · 预算 ¥{plan.brief.budget.toLocaleString()}。计划数据与真实登记分开统计。</p></section></div>
      {readError&&<button type="button" onClick={()=>{if(window.confirm('确认保留原始存档备份后，以当前空白资料重新保存？')){setReadError(false);setStatus('已解除保护，请重新填写并保存。');}}}>已备份原始存档，允许重新保存</button>}
    </>}
    {tab==='plan'&&<><OrganizerIdeaUpload plan={plan} workspace={data} onChange={commit}/>{children}</>}
    {tab==='materials'&&<MaterialsCenter plan={plan} workspace={data} onChange={commit}/>}
    {tab==='tools'&&<>
      <div className="wb-section-heading"><div><h2>专属工具箱</h2><p>为{SCENES.find(s=>s.id===data.scene)?.name}推荐。只启用需要的工具。</p></div><button type="button" onClick={()=>createCustom()}>＋ 自定义工具</button></div>
      {active&&<section className="wb-card wb-tool-editor"><div className="wb-section-heading"><div><span className="mini-label">OPEN TOOL</span><h3>{active.name}</h3></div><div className="wb-inline-actions"><button type="button" onClick={()=>generateDoc(active.id)}>生成文档</button><button type="button" onClick={()=>void exportCurrent(createDocument(data,plan,active.id),active.kind==='text'?'docx':'xlsx')}>导出</button><button type="button" onClick={()=>setActiveTool('')}>收起</button><button className="danger" type="button" onClick={()=>{if(window.confirm('从工具箱移除此工具？原有数据与文档会保留。')){commit({...data,tools:data.tools.filter(id=>id!==active.id)});setActiveTool('');}}}>移除</button></div></div>
        {active.kind==='athletics'?<AthleticsPanel key={active.id} toolId={active.id} data={data.athletics} onChange={athletics=>commit({...data,athletics})}/>:active.kind==='sports'?<SportsPanel workspace={data} onChange={commit}/>:active.kind==='scoring'?<ScoringPanel workspace={data} onChange={commit}/>:active.kind==='performance'?<PerformancePanel source={active.source??'performances'} workspace={data} onChange={commit}/>:active.kind==='table'?<Grid name={active.name} fields={data.tables[active.id]?.fields??active.fields??[]} rows={tableRows(data,active.id)} onChange={rows=>commit(updateTable(data,active.id,rows))} onFields={fields=>commit({...data,tables:{...data.tables,[active.id]:{...data.tables[active.id],fields,revision:(data.tables[active.id]?.revision??0)+1}}})} importable/>:<div><p className="wb-help">点击“生成文档”得到预填初稿，可在文档中心编辑、调用 AI 起草并导出。</p><pre className="wb-text-preview">{documentContent(data,plan,active.id).text}</pre></div>}
      </section>}
      {enabled.length>0&&<><h3 className="wb-subtitle">我的工具</h3><div className="wb-tool-grid">{enabled.map(renderCard)}</div></>}
      <h3 className="wb-subtitle">推荐起点</h3><div className="wb-tool-grid">{suggested.filter(tool=>!data.tools.includes(tool.id)).slice(0,6).map(renderCard)}</div>
      <details className="wb-card wb-more"><summary>更多工具与模板库</summary><div className="wb-grid-actions"><input aria-label="搜索工具" placeholder="搜索所有场景的工具" value={query} onChange={e=>setQuery(e.target.value)}/><button type="button" disabled={!!busy} onClick={()=>void ai('recommend')}><Sparkles size={15}/> AI 推荐工具</button></div><div className="wb-tool-grid">{TOOLS.filter(tool=>!query||tool.name.includes(query)).map(renderCard)}</div><h3>我的模板库</h3>{library.length?library.map(template=><button key={template.id} type="button" onClick={()=>createCustom(template)}>使用「{template.name}」</button>):<p className="wb-empty">在文档中心将文档保存为模板，供以后活动复用。</p>}</details>
      {suggestion&&<section className="wb-card"><h3>AI 推荐 · 待采用</h3><p>{suggestion.reason}</p><ul>{suggestion.toolIds.map(id=><li key={id}>{getDefinition(id,data)?.name}</li>)}</ul><p>建议自定义字段：{suggestion.fields.join('、')||'无'}</p><button type="button" onClick={()=>{commit({...data,tools:[...new Set([...data.tools,...suggestion.toolIds])]});setSuggestion(null);}}>采用工具组合</button>{suggestion.fields.length>0&&<button type="button" onClick={()=>createCustom({id:uid(),name:'AI 建议的自定义表格',kind:'table',text:'',fields:makeFields(suggestion.fields)})}>使用建议字段建表</button>}</section>}
    </>}
    {tab==='documents'&&<>
      <div className="wb-section-heading"><div><h2>智能文档中心</h2><p>源数据同步、人工编辑与 AI 初稿分开管理。</p></div><button className="primary" type="button" onClick={()=>generateDoc('plan')}>生成策划文档</button></div>
      <div className="wb-grid-actions"><input aria-label="搜索文档" placeholder="搜索活动文档" value={query} onChange={e=>setQuery(e.target.value)}/><select aria-label="文档分类" value={category} onChange={e=>setCategory(e.target.value)}>{categories.map(c=><option key={c}>{c}</option>)}</select><button type="button" onClick={()=>setTab('tools')}>从工具生成文档</button></div>
      <div className="wb-document-layout"><aside className="wb-doc-list">{data.documents.filter(d=>(category==='全部'||d.category===category)&&(!query||d.name.includes(query))).map(item=><button className={item.id===selectedDoc?'active':''} key={item.id} type="button" onClick={()=>{setSelectedDoc(item.id);setAiDraft('');}}><FileText size={18}/><span><strong>{item.name}</strong><small>v{item.version} · {item.manual?'手动编辑':item.ai?'AI 初稿':item.type==='table'?'自动同步':'系统模板'}{item.source!==sourceFor(item)?' · 源数据有更新':''}</small></span></button>)}{!data.documents.length&&<div className="wb-empty">尚无文档。先从工具箱录入资料，再生成需要的文档。</div>}</aside>
      <section className="wb-card">{doc?<>
        <div className="wb-section-heading"><div><input className="wb-doc-title" aria-label="文档名称" value={doc.name} onChange={e=>updateDoc({name:e.target.value})}/><p className="wb-help">版本 {doc.version} · 修改于 {new Date(doc.updatedAt).toLocaleString('zh-CN')} · 活动 {plan.title}</p></div><div className="wb-inline-actions">{['docx','xlsx','pdf'].map(format=><button key={format} type="button" disabled={!!busy} onClick={()=>void exportCurrent(doc,format)}>{format==='docx'?'Word':format==='xlsx'?'Excel':'PDF'}</button>)}</div></div>
        {doc.source!==sourceFor(doc)&&<p className="wb-notice">来源数据已更新。当前文档保留你的编辑，请核对后点击“从源数据重新生成”。</p>}
        {doc.type==='table'?<Grid name="文档" fields={doc.headers.map((label,index)=>({key:String(index),label}))} rows={doc.rows.map((row,index)=>({id:String(index),...Object.fromEntries(row.map((cell,i)=>[String(i),cell]))}))} onChange={rows=>updateDoc({rows:rows.map(row=>doc.headers.map((_,i)=>row[String(i)]??''))})} onFields={fields=>updateDoc({headers:fields.map(field=>field.label),rows:doc.rows.map(row=>fields.map(field=>row[Number(field.key)]??''))})}/>:<textarea className="wb-document-text" aria-label="文档内容" value={doc.text} onChange={e=>updateDoc({text:e.target.value})}/>}
        <div className="wb-inline-actions"><button type="button" onClick={()=>generateDoc(doc.toolId)}>从源数据重新生成</button><button type="button" onClick={saveAsTemplate}>保存为复用模板</button>{doc.type==='text'&&<button type="button" disabled={!!busy} onClick={()=>void ai('document')}><Sparkles size={15}/> AI 起草</button>}<button className="danger" type="button" onClick={()=>{if(window.confirm('删除这份文档？此操作不能撤销。')){commit({...data,documents:data.documents.filter(item=>item.id!==doc.id)});setSelectedDoc('');}}}>删除文档</button></div>
        <p className="wb-help">文字模板支持 {'{{活动名称}}'}、{'{{举办时间}}'}、{'{{举办地点}}'}、{'{{负责人}}'} 等变量。保存模板后在其他活动使用时重新填充。内容自动保存，文件按当前内容导出。</p>
        {aiDraft&&<section className="wb-ai-draft"><h3>AI 初稿 · 尚未写入文档</h3><textarea className="wb-document-text" aria-label="AI 初稿" value={aiDraft} onChange={e=>setAiDraft(e.target.value)}/><button type="button" onClick={()=>{updateDoc({text:aiDraft,ai:true});setAiDraft('');}}>采用到当前文档</button><button type="button" onClick={()=>setAiDraft('')}>放弃初稿</button></section>}
      </>:<div className="wb-empty"><FileText size={32}/><h3>选择一份文档</h3><p>可在线编辑、保存模板或导出正式文件。</p></div>}</section></div>
    </>}
    {tab==='people'&&<>
      <div className="wb-section-heading"><div><h2>人员与任务</h2><p>一个人可承担多个角色。仅收集执行所需资料。</p></div></div>
      <section className="wb-card"><h3>人员登记</h3><Grid name="人员" fields={personFields} rows={data.people.map(person=>({...person.fields,id:person.id,name:person.name,roles:person.roles.join(','),organization:data.organizations.find(org=>org.id===person.organizationId)?.name??''}))} onChange={rows=>commit({...data,people:rows.map(row=>({id:row.id,name:row.name??'',roles:(row.roles??'参与者').split(/[,，]/).map(v=>v.trim()).filter(Boolean),organizationId:data.organizations.find(org=>org.name===row.organization)?.id,fields:Object.fromEntries(Object.entries(row).filter(([key])=>!['id','name','roles','organization'].includes(key)))}))})} onFields={fields=>commit({...data,tables:{...data.tables,'people-fields':{id:'people-fields',name:'人员字段',fields:fields.filter(field=>!['name','roles','organization'].includes(field.key)),rows:[],revision:1}}})} importable/></section>
      <details className="wb-card"><summary>组织单位与团队</summary><Grid name="组织" fields={[{key:'name',label:'组织名称'},{key:'kind',label:'组织类型',options:['组织单位','参赛队伍','演出团队','工作小组','部门','志愿者团队']}]} rows={data.organizations.map(org=>({...org}))} onChange={rows=>commit({...data,organizations:rows.map(row=>({id:row.id,name:row.name??'',kind:(row.kind||'组织单位') as Workspace['organizations'][number]['kind']}))})}/></details>
      <section className="wb-card"><h3>任务分工</h3><Grid name="任务" fields={[{key:'title',label:'任务'},{key:'owner',label:'负责人'},{key:'due',label:'完成期限',type:'date'},{key:'status',label:'状态',options:['未开始','进行中','已完成']},{key:'resources',label:'资源'},{key:'note',label:'备注'}]} rows={taskRows} onChange={rows=>commit(updateTable(data,'tasks',rows))}/></section>
      <details className="wb-card"><summary>执行流程与节点</summary><Grid name="流程" fields={[{key:'start',label:'开始',type:'time'},{key:'end',label:'结束',type:'time'},{key:'title',label:'活动环节'},{key:'owner',label:'负责人'},{key:'people',label:'参与人员'},{key:'venue',label:'场地'},{key:'equipment',label:'设备'},{key:'status',label:'状态',options:['待执行','进行中','已完成']},{key:'note',label:'备注'}]} rows={data.flow.map(node=>({...node,people:node.people.join(',')}))} onChange={rows=>commit({...data,flow:rows.map(row=>({id:row.id,start:row.start??'',end:row.end??'',title:row.title??'',owner:row.owner??'',people:(row.people??'').split(/[,，]/).filter(Boolean),venue:row.venue??'',equipment:row.equipment??'',status:row.status??'待执行',note:row.note??''}))})}/></details>
    </>}
    <AssistantPanel plan={plan} workspace={data} apiKey={apiKey} onApply={acceptAssistant} onUndo={undoAssistant} request={assistantRequest}/>
    {tab==='stats'&&<>
      <div className="wb-section-heading"><div><h2>活动数据统计</h2><p>只基于已登记和录入的数据计算，空数据不生成虚构成果。</p></div></div>
      <div className="wb-metrics">{[['登记人员',data.people.length],['任务完成率',taskRows.length?`${Math.round(completed/taskRows.length*100)}%`:'暂无任务'],['运动员',data.athletics.athletes.length],['有效成绩',data.athletics.results.filter(row=>row.status==='有效'&&row.value.trim()).length],['演出总分钟',orderedAgenda(tableRows(data,'performances'),'09:00',true).reduce((sum,item)=>sum+item.duration,0)],['实际志愿服务小时',tableRows(data,'volunteers').reduce((sum,row)=>sum+Math.max(0,Number(row.f5)||0),0)]].map(([label,value])=><div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
      <section className="wb-card"><h3>数据核查</h3>{[...validateEntries(data.athletics),...scheduleConflicts(data.athletics),...resultIssues(data.athletics)].length?<ul className="wb-errors">{[...validateEntries(data.athletics),...scheduleConflicts(data.athletics),...resultIssues(data.athletics)].map((issue,i)=><li key={i}>{issue}</li>)}</ul>:<p className="wb-help"><CheckCircle2 size={16}/> 当前未发现已检测范围内的田径数据冲突；正式规程仍需人工核查。</p>}<p>已登记队伍 {sportsData(data).teams.length}；已有可计算评审项目 {scoringData(data).rankings.filter(row=>!row.pending).length}。</p></section>
      {data.athletics.athletes.length>0&&<section className="wb-card"><h3>团体积分</h3>{teamStandings(data.athletics).map(row=><div className="wb-stat-row" key={row.team}><span>{row.rank}. {row.team}</span><progress max={Math.max(1,...teamStandings(data.athletics).map(r=>r.points))} value={row.points}/><strong>{row.points} 分</strong></div>)}</section>}
      <section className="wb-card"><h3>预算执行</h3><p>资料中心实际支出 ¥{expenseStats(data,plan.brief.budget).used.toLocaleString()} · 剩余 ¥{expenseStats(data,plan.brief.budget).remaining.toLocaleString()}</p><p>计划预算 ¥{plan.brief.budget.toLocaleString()} · 已登记实际支出 ¥{tableRows(data,'business-budget').reduce((sum,row)=>sum+Math.max(0,Number(row.f2)||0),0).toLocaleString()}</p>{tableRows(data,'business-budget').reduce((sum,row)=>sum+Math.max(0,Number(row.f2)||0),0)>plan.brief.budget&&<p className="wb-errors">实际支出超出计划预算，请核查票据与审批。</p>}</section>
    </>}
  </div>;
}
