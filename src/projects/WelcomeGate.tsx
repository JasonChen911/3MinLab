import { useEffect, useRef, useState } from 'react';
import { ArrowRight } from 'lucide-react';
export default function WelcomeGate({onEnter,onProjects}:{onEnter:()=>void;onProjects:()=>void}) {
  const [leaving,setLeaving]=useState(false);const timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
  useEffect(()=>()=>clearTimeout(timer.current),[]);
  function enter() {if(leaving)return;if(window.matchMedia('(prefers-reduced-motion: reduce)').matches){onEnter();return;}setLeaving(true);timer.current=setTimeout(onEnter,380);}
  return <section className={`hero welcome-stage ${leaving?'welcome-leaving':''}`} aria-label="活动策划欢迎页">
    <div className="hero-copy"><div className="eyebrow"><span className="pulse"/> ANY EVENT, PLANNED</div><h1>让每一场活动，<br/><em>都有更好的开始。</em></h1><p>从创意构思到现场执行，让 AI 陪你完成活动策划的每一步。</p><div className="welcome-actions"><button className="hero-start" type="button" disabled={leaving} onClick={enter}>{leaving?'正在进入…':'开始策划'} <ArrowRight size={18}/></button><button className="text-button" type="button" onClick={onProjects}>继续我的活动</button></div><small className="welcome-note">活动方案 · 专属工具 · 真实资料 · 执行管理</small></div>
    <div className="hero-art" aria-hidden="true"><div className="orbit orbit-one"/><div className="orbit orbit-two"/><span className="floating f1">✦ 灵感</span><span className="floating f2">◷ 计划</span><span className="floating f3">↗ 执行</span></div>
  </section>;
}
