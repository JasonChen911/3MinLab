import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Bookmark, ClipboardCopy, Download, PenLine, Printer, Share2 } from 'lucide-react';
import BlockView from './BlockView';
import { MODULES } from '../data/taxonomy';
import type { EventPlan, ModuleId } from '../types';

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
  revisionPanel?: ReactNode;
  aiPanel?: ReactNode;
}

/** 方案工作台：左侧模块导航 + 右侧完整内容（打印时全部输出） */
export default function PlanView({ plan, active, onActive, isFavorite, onFavorite, onCopy, onPrint, onCopyPromo, onDownload, onAdjust, onBudgetChange, onTableRows, onModuleMeta, onPlanMeta, onBlockTitle, revisionPanel, aiPanel }: Props) {
  const [editingPlan, setEditingPlan] = useState(false);
  const [editingModules,setEditingModules]=useState<ModuleId[]>([]);
  const activeRef = useRef(onActive);
  activeRef.current = onActive;

  // 用滚动位置定位当前模块：比 IntersectionObserver 更稳定，不会滞后一节
  useEffect(() => {
    const sections = plan.modules
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
  }, [plan.id, plan.modules]);

  function jump(id: ModuleId) {
    const details=document.querySelector<HTMLDetailsElement>(`#module-${id} > details`);if(details)details.open=true;
    onActive(id);
    document.getElementById(`module-${id}`)?.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
      block: 'start',
    });
  }

  const keyCount = plan.modules.filter((module) => module.weight === 'key').length;

  return <div className="plan-layout step-enter">
    <aside className="plan-rail" aria-label="方案模块导航">
      <div className="rail-head">
        <span className="mini-label">BLUEPRINT</span>
        <strong>方案模块</strong>
        <p>{keyCount} 个重点模块 · 共 {MODULES.length} 节</p>
      </div>
      <nav className="rail-nav">
        {plan.modules.map((module, index) => {
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

      {plan.modules.map((module) => {
        const meta = MODULES.find((item) => item.id === module.id)!;
        const editable=editingPlan||editingModules.includes(module.id);
        return <section className={`plan-module weight-${module.weight}`} id={`module-${module.id}`} key={module.id}>
          <header className="module-head">
            <span className="module-order">{`${meta.order}`.padStart(2, '0')}</span>
            <div>
              {editable&&onModuleMeta?<><input className="module-title-input" aria-label={`${module.title}章节标题`} value={module.title} onChange={e=>onModuleMeta(module.id,{title:e.target.value})}/><textarea className="module-summary-input" aria-label={`${module.title}章节摘要`} value={module.summary} onChange={e=>onModuleMeta(module.id,{summary:e.target.value})}/></>:<><h4>{module.title}</h4><p>{module.summary}</p></>}
            </div>
            {onTableRows&&<button className="chapter-edit-button" type="button" aria-pressed={editable} onClick={()=>{if(editingPlan){setEditingPlan(false);setEditingModules(plan.modules.filter(item=>item.id!==module.id).map(item=>item.id));}else setEditingModules(current=>current.includes(module.id)?current.filter(id=>id!==module.id):[...current,module.id]);}}>{editable?'完成本章编辑':'逐行编辑本章'}</button>}
            <span className={`weight-badge ${module.weight}`}>{weightLabel[module.weight]}</span>
          </header>
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
