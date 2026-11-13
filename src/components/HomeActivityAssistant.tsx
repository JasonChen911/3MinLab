import {useEffect,useRef,useState,type RefObject} from 'react';
import {ArrowRight,MessageCircle,PenLine,Sparkles} from 'lucide-react';
import {getCategory} from '../data/taxonomy';
import {requestActivityDraft,type ActivityDraft,type ActivityTurn} from '../services/activityDraft';
import './home-activity-assistant.css';

type Props={idea:string;onIdea:(text:string)=>void;onManual:(text:string)=>void;onConfirm:(draft:ActivityDraft)=>void;ideaRef:RefObject<HTMLTextAreaElement|null>};
const storageKey='3minlab-home-ai-conversation';
const fieldLabels:Record<string,string>={title:'名称',category:'类型',people:'人数',budget:'预算',duration:'时长',durationMinutes:'时长',date:'日期',venue:'场地',audience:'参与对象',goal:'活动目标'};
function restored(){try{const value=JSON.parse(localStorage.getItem(storageKey)||'null');return value&&typeof value.idea==='string'&&Array.isArray(value.turns)?value as {idea:string;turns:ActivityTurn[];draft:ActivityDraft|null}:null;}catch{return null;}}
export default function HomeActivityAssistant({idea,onIdea,onManual,onConfirm,ideaRef}:Props){
 const saved=useRef(restored());
 const [draft,setDraft]=useState<ActivityDraft|null>(saved.current?.draft??null),[turns,setTurns]=useState<ActivityTurn[]>(saved.current?.turns??[]);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[reply,setReply]=useState(''),[editing,setEditing]=useState<number|null>(null);
 useEffect(()=>{if(!idea&&saved.current?.idea)onIdea(saved.current.idea);},[]);
 useEffect(()=>{if(idea&&saved.current?.idea&&saved.current.idea!==idea){saved.current=null;setDraft(null);setTurns([]);setReply('');setEditing(null);}},[idea]);
 useEffect(()=>{if(idea)try{localStorage.setItem(storageKey,JSON.stringify({idea,turns,draft}));}catch{/* 本次对话仍保留在页面 */}},[idea,turns,draft]);
 const question=editing!==null?turns[editing]?.question:draft?.questions[0];
 async function request(nextTurns:ActivityTurn[]=turns){if(idea.trim().length<4||busy)return;setBusy(true);setError('');try{
  const context=[idea.trim(),...nextTurns.map(turn=>`AI 问：${turn.question}\n组织者回答：${turn.answer}`)].join('\n').slice(0,1900);
  const next=await requestActivityDraft(context);setDraft(next);setTurns(nextTurns);setReply('');setEditing(null);
 }catch(cause){setError(cause instanceof Error?cause.message:'AI 暂时不可用，请手动创建');}finally{setBusy(false);}}
 function answer(){if(!question||!reply.trim())return;const next={question,answer:reply.trim()};void request(editing===null?[...turns,next]:[...turns.slice(0,editing),next]);}
 return <div className="home-ai">
  <div className="home-ai-heading"><Sparkles size={20}/><div><strong>你想举办一场什么样的活动？</strong><span>告诉 AI 你的想法，先看一份可修改的活动初稿。</span><span className="home-ai-feature">↘ AI 引导式策划 · 边聊边完善</span></div></div>
  <form className="idea-form" onSubmit={e=>{e.preventDefault();setTurns([]);void request([]);}}><textarea ref={ideaRef} value={idea} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();if(!busy&&idea.trim().length>=4){setTurns([]);void request([]);}}}} onChange={e=>{onIdea(e.target.value.slice(0,500));setDraft(null);setTurns([]);setReply('');setEditing(null);}} placeholder="例如：我想和 15 个朋友周末办一场桌游聚会" aria-label="描述你的活动想法" rows={3}/><div className="idea-form-foot"><span className="idea-count">{idea.length}/500 · Enter 发送，Shift+Enter 换行</span><button className="hero-start" type="submit" disabled={busy||idea.trim().length<4}>{busy?'正在理解活动…':'AI 帮我策划'} <ArrowRight size={18}/></button></div></form>
  {busy&&<div className="home-ai-thinking" role="status"><span className="home-ai-thinking-dots"/>AI 正在结合你的回答更新活动草稿…</div>}
  {error&&<p role="alert" className="home-ai-error">{error}。你仍可直接开始。</p>}
  <button type="button" className="home-ai-manual" disabled={!idea.trim()} onClick={()=>onManual(idea)}>手动创建活动 <ArrowRight size={14}/></button>
  {draft&&<section className="home-ai-preview" aria-label="AI 活动初稿"><div className="home-ai-preview-head"><span className="mini-label">可修改的初稿 · 未写入活动</span><h3>{draft.title||'待命名活动'}</h3><p>{getCategory(draft.categoryId).label} · {draft.planningMode==='light'?'轻量策划':'完整策划'} · {draft.people??'人数待确认'} 人</p></div>
   <div className="home-ai-preview-grid"><div><strong>活动目标</strong><p>{draft.goal||'待确认'}</p></div><div><strong>流程建议</strong><p>{draft.flow.length?draft.flow.join(' → '):'进入工作台后补充'}</p></div><div><strong>人员与物资</strong><p>{[...draft.staff,...draft.materials].slice(0,6).join('、')||'进入工作台后补充'}</p></div><div><strong>已知与待确认</strong><p>已明确：{draft.confirmedFields.map(field=>fieldLabels[field]??field).join('、')||'原始描述'}；预算 {draft.budget===null?'待确认':`¥${draft.budget}`}</p></div></div>
   {question&&<div className="home-ai-questions" key={`${turns.length}-${editing??'new'}-${question}`} aria-live="polite"><span className="home-ai-question-kicker"><MessageCircle size={16}/>{editing===null?'AI 有一个新问题':'正在修改先前的回答'}</span><strong>{question}</strong><form className="home-ai-followup" onSubmit={e=>{e.preventDefault();answer();}}><input aria-label="回答 AI 的问题" value={reply} maxLength={300} onChange={e=>setReply(e.target.value)} placeholder="说出实际情况，AI 会重新整理草稿"/><button type="submit" disabled={busy||!reply.trim()}>{busy?'更新中…':'发送并更新'}</button></form><small>{editing!==null?'更改这条回答后，其后的追问将重新生成。':'也可以先进入工作台，之后继续与策划助手对话。'}</small></div>}
   <div className="home-ai-preview-actions"><button className="primary" type="button" onClick={()=>onConfirm({...draft,conversation:turns})}>确认并开始策划 <ArrowRight size={16}/></button><button type="button" onClick={()=>{setDraft(null);ideaRef.current?.focus();}}>修改描述</button><button type="button" onClick={()=>void request()}>重新生成建议</button></div><small>AI 提出的建议会标为待确认；你可以在策划页面逐项调整。</small></section>}
  {(draft||turns.length>0)&&<aside className="home-ai-history" aria-label="AI 追问记录"><div className="home-ai-history-head"><MessageCircle size={18}/><div><strong>策划对话</strong><small>{turns.length} 条已回答 · 可随时修正</small></div></div><div className="home-ai-history-list">{turns.length?turns.map((turn,index)=><div className="home-ai-turn" key={`${index}-${turn.question}`}><span>AI · 问题 {index+1}</span><p>{turn.question}</p><span>你的回答</span><p>{turn.answer}</p><button type="button" onClick={()=>{setEditing(index);setReply(turn.answer);}}><PenLine size={13}/>修改回答</button></div>):<p className="home-ai-history-empty">回答问题后，记录会保留在这里。</p>}{question&&editing===null&&<div className="home-ai-turn pending"><span>AI · 当前问题</span><p>{question}</p></div>}</div></aside>}
 </div>;
}
