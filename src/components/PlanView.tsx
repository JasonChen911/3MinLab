import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Bookmark, ClipboardCopy, Download, PenLine, Printer, Share2 } from 'lucide-react';
import BlockView from './BlockView';
import { MODULES } from '../data/taxonomy';
import { coreModules, modeOf, moduleStatus, planningProgress } from '../planning/mode';
import type { EventPlan, ModuleId, PlanningMode, PlanningStatus } from '../types';
import { useMemo } from 'react';
import './plan-mode.css';

const weightLabel = { key: '重点', normal: '常规', brief: '简要' } as const;

interface Props {
  plan: EventPlan;
  active: ModuleId;
  onActive: (id: ModuleId) => void;
  isFavorite: boolean;
  onFavorite: () => void;
  onCopy: () => void;
  onPrint: () => void;
  onCopyPromo: () => void;
  onDownload: () => void;
  onAdjust: () => void;
  onBudgetChange?: (rowId: string, amount: number) => void;
  onPlanMeta?: (patch:{title?:string;oneLiner?:string})=>void;
  onModuleMeta?: (id:ModuleId,patch:{title?:string;summary?:string;aiNote?:string})=>void;
  onBlockTitle?: (id:ModuleId,index:number,title:string)=>void;
  onTableRows?: (moduleId: ModuleId, blockIndex: number, rows: string[][]) => void;
  onModeChange?: (mode:PlanningMode)=>void;
  onModuleStatus?: (id:ModuleId,status:PlanningStatus,note?:string)=>void;
  onAiDecision?: (id:ModuleId,accept:boolean)=>void;
  revisionPanel?: ReactNode;
  aiPanel?: ReactNode;
}

/** 方案工作台：左侧模块导航 + 右侧完整内容（打印时全部输出） */
export default function PlanView({ plan, active, onActive, isFavorite, onFavorite, onCopy, onPrint, onCopyPromo, onDownload, onAdjust, onBudgetChange, onTableRows, onModuleMeta, onPlanMeta, onBlockTitle, onModeChange, onModuleStatus, onAiDecision, revisionPanel, aiPanel }: Props) {
  const [editingPlan, setEditingPlan] = useState(false);
  const [editingModules,setEditingModules]=useState<ModuleId[]>([]);
  const [showOptional,setShowOptional]=useState(false);
  const core=useMemo(()=>new Set(coreModules(plan)),[plan]);
  const visible=modeOf(plan)==='full'||showOptional?plan.modules:plan.modules.filter(module=>core.has(module.id));
  const progress=planningProgress(plan);
  const activeRef = useRef(onActive);
  activeRef.current = onActive;

  // 用滚动位置定位当前模块：比 IntersectionObserver 更稳定，不会滞后一节
  useEffect(() => {
    const sections = visible
      .map((module) => document.getElementById(`module-${module.id}`))
      .filter((element): element is HTMLElement => !!element && !element.hidden);
    if (!sections.length) return;

    let frame = 0;
    const update = () => {
      frame = 0;
      const line = Math.max(140, (document.querySelector('.topbar')?.getBoundingClientRect().bottom ?? 0) + 16);
      let current = sections[0];
      sections.forEach((section) => { if (section.getBoundingClientRect().top <= line) current = section; });
      if (current) activeRef.current(current.id.replace('module-', '') as ModuleId);
    };
    const onScroll = () => { if (!frame) frame = window.requestAnimationFrame(update); };

    window.addEventListener('scroll', onScroll, { passive: true });
    const observer=new ResizeObserver(onScroll);sections.forEach(section=>observer.observe(section));
    update();
    return () => {
      window.removeEventListener('scroll', onScroll);
      observer.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [plan.id, plan.modules, plan.planningMode, showOptional]);

  function jump(id: ModuleId) {
    const details=document.querySelector<HTMLDetailsElement>(`#module-${id} > details`);if(details)details.open=true;
    onActive(id);
    document.getElementById(`module-${id}`)?.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
      block: 'start',
    });
  }

  const keyCount = visible.filter((module) => module.weight === 'key').length;

  return <div className="plan-layout step-enter">
    <aside className="plan-rail" aria-label="方案模块导航">
      <div className="rail-head">
        <span className="mini-label">BLUEPRINT</span>
        <strong>方案模块</strong>
        <p>{keyCount} 个重点模块 · 当前 {visible.length} 节</p>
      </div>
      <nav className="rail-nav">
        {visible.map((module, index) => {
          const meta = MODULES.find((item) => item.id === module.id)!;
          return <button
            key={module.id}
            type="button"
            className={`rail-item ${active === module.id ? 'active' : ''} ${module.weight}`}
            onClick={() => jump(module.id)}
            aria-current={active === module.id ? 'true' : undefined}
          >
            <span className="rail-order">{`${meta.order}`.padStart(2, '0')}</span>
            <span className="rail-title">{module.title}</span>
            {module.weight === 'key' && <span className="rail-dot" aria-label="重点模块"/>}
            <span className="rail-index" aria-hidden="true">{index + 1}</span>
          </button>;
        })}
      </nav>
      {modeOf(plan)==='light'&&<button className="rail-adjust" onClick={()=>setShowOptional(v=>!v)}>{showOptional?'收起可选模块':'查看其他可选模块'}</button>}
      <button className="rail-adjust" onClick={onAdjust}><PenLine size={15}/> 调整需求</button>
    </aside>

    <div className="plan-body">
      <section className="plan-hero">
        <span className="mini-label">YOUR EVENT BLUEPRINT</span>
        {editingPlan&&onPlanMeta?<><input className="module-title-input" aria-label="方案活动名称" value={plan.title} onChange={e=>onPlanMeta({title:e.target.value})}/><textarea className="module-summary-input" aria-label="方案总述" value={plan.oneLiner} onChange={e=>onPlanMeta({oneLiner:e.target.value})}/></>:<><h3>{plan.title}</h3><p>{plan.oneLiner}</p></>}
        <div className="result-tags">
          <span>{plan.brief.people} 人</span>
          <span>{plan.brief.dateLabel || '时间待定'}</span>
          <span>{plan.brief.days > 1 ? `${plan.brief.days} 天` : `${Math.round(plan.brief.durationMinutes / 60)} 小时`}</span>
          <span>预算 ¥{plan.brief.budget.toLocaleString('zh-CN')}</span>
        </div>
        <div className="planning-mode-bar"><label>策划模式 <select value={modeOf(plan)} onChange={e=>onModeChange?.(e.target.value as PlanningMode)}><option value="light">小型 · 轻量策划</option><option value="full">大型 · 完整策划</option></select></label><span role="status">适用模块已处理 {progress.done}/{progress.total} 权重点 · {progress.percent}%</span></div>
        <div className="plan-actions">
          {onTableRows && <button onClick={() => {setEditingPlan(!editingPlan);setEditingModules([]);}} aria-pressed={editingPlan}><PenLine size={16}/> {editingPlan ? '完成全部编辑' : '逐行编辑整份方案'}</button>}
          <button onClick={onAdjust}><PenLine size={16}/> 修改基础需求</button>
          <button onClick={() => document.getElementById('emergency-adjustment')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>突发情况调整</button>
          <button onClick={onCopy}><ClipboardCopy size={16}/> 复制全文</button>
          <button onClick={() => {const sections=document.querySelectorAll<HTMLDetailsElement>('.module-body');const states=Array.from(sections,section=>section.open);sections.forEach(section=>section.open=true);onPrint();sections.forEach((section,i)=>section.open=states[i]);}}><Printer size={16}/> 打印 / 存为 PDF</button>
          <button onClick={onDownload}><Download size={16}/> 下载 Markdown</button>
          <button onClick={onFavorite}><Bookmark size={16} fill={isFavorite ? 'currentColor' : 'none'}/> {isFavorite ? '已收藏' : '收藏'}</button>
          <button onClick={onCopyPromo}><Share2 size={16}/> 复制招募文案</button>
          <span className="plan-actions-hint"><Download size={14}/> 本地生成，可离线使用</span>
        </div>
      </section>

      {editingPlan && <p className="plan-assumptions" role="status">编辑模式已开启：在各模块点击“编辑内容”或“编辑表格”，可修改、删除和补充；预算金额可直接修改。内容自动保存，导出使用修改后的内容。</p>}
<details className="planning-details"><summary>修改方案与突发调整</summary>{revisionPanel}</details>
<details className="planning-details"><summary>AI 辅助完善当前模块</summary>{aiPanel}</details>

      {plan.assumptions.length > 0 && <details className="plan-assumptions"><summary>查看待核实的方案假设（{plan.assumptions.length} 项）</summary>
        <strong>本方案的假设</strong>
        <ul>
          {plan.assumptions.map((assumption) => <li key={assumption.field}>
            <span>{assumption.label}：{assumption.value}</span>
            <small>{assumption.reason}</small>
          </li>)}
        </ul>
        <button className="text-button" onClick={onAdjust}>修改这些设定 ↗</button>
      </details>}

      {visible.map((module) => {
        const meta = MODULES.find((item) => item.id === module.id)!;
        const editable=editingPlan||editingModules.includes(module.id);
        const status=moduleStatus(plan,module.id),state=plan.moduleStates?.[module.id];
        return <section className={`plan-module weight-${module.weight}`} id={`module-${module.id}`} key={module.id}>
          <header className="module-head">
            <span className="module-order">{`${meta.order}`.padStart(2, '0')}</span>
            <div>
              {editable&&onModuleMeta?<><input className="module-title-input" aria-label={`${module.title}章节标题`} value={module.title} onChange={e=>onModuleMeta(module.id,{title:e.target.value})}/><textarea className="module-summary-input" aria-label={`${module.title}章节摘要`} value={module.summary} onChange={e=>onModuleMeta(module.id,{summary:e.target.value})}/></>:<><h4>{module.title}</h4><p>{module.summary}</p></>}
            </div>
            {onModuleStatus&&<label className="module-status-select">状态 <select aria-label={`${module.title}策划状态`} value={status} onChange={e=>onModuleStatus(module.id,e.target.value as PlanningStatus)}><option value="unhandled">未处理</option><option value="self">自行填写</option><option value="existing">已有</option><option value="not-needed">不需要</option><option value="pending">待定</option><option value="ai-suggested">AI 建议</option><option value="confirmed">已确认</option></select></label>}
            {onTableRows&&<button className="chapter-edit-button" type="button" aria-pressed={editable} onClick={()=>{if(editingPlan){setEditingPlan(false);setEditingModules(plan.modules.filter(item=>item.id!==module.id).map(item=>item.id));}else setEditingModules(current=>current.includes(module.id)?current.filter(id=>id!==module.id):[...current,module.id]);}}>{editable?'完成本章编辑':'逐行编辑本章'}</button>}
            <span className={`weight-badge ${module.weight}`}>{weightLabel[module.weight]}</span>
          </header>
          {status==='existing'&&<input className="module-existing-note" aria-label={`${module.title}已有内容说明`} placeholder="可选：已准备的内容或负责人" value={state?.note??''} onChange={e=>onModuleStatus?.(module.id,'existing',e.target.value)}/>}
          {status==='pending'&&<p className="module-state-hint">已列为待办，之后可继续处理。</p>}
          {status==='not-needed'&&<p className="module-state-hint">已标记不需要；原有内容仍保存，随时可恢复。</p>}
          {status==='ai-suggested'&&<div className="module-ai-suggestion"><strong>AI 建议 · 待组织者确认</strong><p>{state?.aiSuggestion||'正在生成建议…'}</p>{state?.aiSuggestion&&onAiDecision&&<div><button onClick={()=>onAiDecision(module.id,true)}>采用建议</button><button onClick={()=>onAiDecision(module.id,false)}>拒绝建议</button></div>}</div>}
          <details className="module-body" open={editable || undefined}><summary>查看 / 收起本章内容</summary>
            {module.blocks.map((block, index) => <BlockView
              key={`${module.id}-${index}-${editable?'edit':'read'}`}
              initiallyEditing={editable}
              onTitleChange={onBlockTitle?(title)=>onBlockTitle(module.id,index,title):undefined}
              block={block}
              onBudgetChange={module.id === 'budget' ? onBudgetChange : undefined}
              onRowsChange={editable && onTableRows ? (rows) => onTableRows(module.id, index, rows) : undefined}
            />)}
            {module.aiNote && <div className="ai-plan-note"><span className="ai-spark"><ClipboardCopy size={15}/></span><div><strong>AI 补充建议</strong><>{editable&&onModuleMeta?<textarea className="module-summary-input" aria-label={`${module.title}补充说明`} value={module.aiNote} onChange={e=>onModuleMeta(module.id,{aiNote:e.target.value})}/>:<p>{module.aiNote}</p>}</></div></div>}
          </details>
        </section>;
      })}

      <footer className="plan-foot">
        <p>方案由本地策划引擎生成：预算、用量与时间均为估算，执行前请以询价与现场踏勘为准。</p>
      </footer>
    </div>
  </div>;
}
