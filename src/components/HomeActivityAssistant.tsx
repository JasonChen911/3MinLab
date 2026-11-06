import { useState, type RefObject } from 'react';
import { ArrowRight, Sparkles } from 'lucide-react';
import { getCategory } from '../data/taxonomy';
import { requestActivityDraft, type ActivityDraft } from '../services/activityDraft';
import './home-activity-assistant.css';

type Props={idea:string;onIdea:(text:string)=>void;onManual:(text:string)=>void;onConfirm:(draft:ActivityDraft)=>void;ideaRef:RefObject<HTMLTextAreaElement|null>};
export default function HomeActivityAssistant({idea,onIdea,onManual,onConfirm,ideaRef}:Props){
 const [draft,setDraft]=useState<ActivityDraft|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function request(){if(idea.trim().length<4)return;setBusy(true);setError('');setDraft(null);try{setDraft(await requestActivityDraft(idea.trim()));}catch(cause){setError(cause instanceof Error?cause.message:'AI 暂时不可用，请手动创建');}finally{setBusy(false);}}
 return <div className="home-ai"><div className="home-ai-heading"><Sparkles size={20}/><div><strong>你想举办一场什么样的活动？</strong><span>告诉 AI 你的想法，先看一份可修改的活动初稿。</span></div></div>
 <form className="idea-form" onSubmit={e=>{e.preventDefault();void request();}}><textarea ref={ideaRef} value={idea} onChange={e=>{onIdea(e.target.value.slice(0,500));setDraft(null);}} placeholder="例如：我想和 15 个朋友周末办一场桌游聚会" aria-label="描述你的活动想法" rows={3}/><div className="idea-form-foot"><span className="idea-count">{idea.length}/500</span><button className="hero-start" type="submit" disabled={busy||idea.trim().length<4}>{busy?'正在理解活动…':'AI 帮我策划'} <ArrowRight size={18}/></button></div></form>
 {error&&<p role="alert" className="home-ai-error">{error}。你仍可直接开始。</p>}
 <button type="button" className="home-ai-manual" disabled={!idea.trim()} onClick={()=>onManual(idea)}>手动创建活动 <ArrowRight size={14}/></button>
 {draft&&<section className="home-ai-preview" aria-label="AI 活动初稿"><div className="home-ai-preview-head"><span className="mini-label">可修改的初稿 · 未写入活动</span><h3>{draft.title||'待命名活动'}</h3><p>{getCategory(draft.categoryId).label} · {draft.planningMode==='light'?'轻量策划':'完整策划'} · {draft.people??'人数待确认'} 人</p></div>
 <div className="home-ai-preview-grid"><div><strong>活动目标</strong><p>{draft.goal||'待确认'}</p></div><div><strong>流程建议</strong><p>{draft.flow.length?draft.flow.join(' → '):'进入工作台后补充'}</p></div><div><strong>人员与物资</strong><p>{[...draft.staff,...draft.materials].slice(0,6).join('、')||'进入工作台后补充'}</p></div><div><strong>已知与待确认</strong><p>已明确：{draft.confirmedFields.join('、')||'原始描述'}；预算 {draft.budget===null?'待确认':`¥${draft.budget}`}</p></div></div>
 {draft.questions.length>0&&<div className="home-ai-questions"><strong>建议先确认</strong><ul>{draft.questions.slice(0,3).map(q=><li key={q}>{q}</li>)}</ul></div>}
 <div className="home-ai-preview-actions"><button className="primary" type="button" onClick={()=>onConfirm(draft)}>确认并开始策划 <ArrowRight size={16}/></button><button type="button" onClick={()=>{setDraft(null);ideaRef.current?.focus();}}>修改描述</button><button type="button" onClick={()=>void request()}>重新生成建议</button></div><small>AI 提出的建议会标为待确认；你可以在策划页面逐项调整。</small></section>}
 </div>;
}
