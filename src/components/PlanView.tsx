import { useEffect, useRef } from 'react';
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
  onTableRows?: (moduleId: ModuleId, blockIndex: number, rows: string[][]) => void;
  revisionPanel?: ReactNode;
  aiPanel?: ReactNode;
}

/** 方案工作台：左侧模块导航 + 右侧完整内容（打印时全部输出） */
export default function PlanView({ plan, active, onActive, isFavorite, onFavorite, onCopy, onPrint, onCopyPromo, onDownload, onAdjust, onBudgetChange, onTableRows, revisionPanel, aiPanel }: Props) {
  const activeRef = useRef(onActive);
  activeRef.current = onActive;

  // 用滚动位置定位当前模块：比 IntersectionObserver 更稳定，不会滞后一节
  useEffect(() => {
    const sections = plan.modules
      .map((module) => document.getElementById(`module-${module.id}`))
      .filter((element): element is HTMLElement => !!element);
    if (!sections.length) return;

    let frame = 0;
    const update = () => {
      frame = 0;
      const line = window.scrollY + 140;
      let current = sections[0];
      sections.forEach((section) => { if (section.offsetTop <= line) current = section; });
      if (current) activeRef.current(current.id.replace('module-', '') as ModuleId);
    };
    const onScroll = () => { if (!frame) frame = window.requestAnimationFrame(update); };

    window.addEventListener('scroll', onScroll, { passive: true });
    update();
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [plan.id, plan.modules]);

  function jump(id: ModuleId) {
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
        <h3>{plan.title}</h3>
        <p>{plan.oneLiner}</p>
        <div className="result-tags">
          <span>{plan.brief.people} 人</span>
          <span>{plan.brief.dateLabel || '时间待定'}</span>
          <span>{plan.brief.days > 1 ? `${plan.brief.days} 天` : `${Math.round(plan.brief.durationMinutes / 60)} 小时`}</span>
          <span>预算 ¥{plan.brief.budget.toLocaleString('zh-CN')}</span>
        </div>
        <div className="plan-actions">
          <button onClick={onCopy}><ClipboardCopy size={16}/> 复制全文</button>
          <button onClick={onPrint}><Printer size={16}/> 打印 / 存为 PDF</button>
          <button onClick={onDownload}><Download size={16}/> 下载 Markdown</button>
          <button onClick={onFavorite}><Bookmark size={16} fill={isFavorite ? 'currentColor' : 'none'}/> {isFavorite ? '已收藏' : '收藏'}</button>
          <button onClick={onCopyPromo}><Share2 size={16}/> 复制招募文案</button>
          <span className="plan-actions-hint"><Download size={14}/> 本地生成，可离线使用</span>
        </div>
      </section>

      {revisionPanel}

      {aiPanel}

      {plan.assumptions.length > 0 && <section className="plan-assumptions">
        <strong>本方案的假设</strong>
        <ul>
          {plan.assumptions.map((assumption) => <li key={assumption.field}>
            <span>{assumption.label}：{assumption.value}</span>
            <small>{assumption.reason}</small>
          </li>)}
        </ul>
        <button className="text-button" onClick={onAdjust}>修改这些设定 ↗</button>
      </section>}

      {plan.modules.map((module) => {
        const meta = MODULES.find((item) => item.id === module.id)!;
        return <section className={`plan-module weight-${module.weight}`} id={`module-${module.id}`} key={module.id}>
          <header className="module-head">
            <span className="module-order">{`${meta.order}`.padStart(2, '0')}</span>
            <div>
              <h4>{module.title}</h4>
              <p>{module.summary}</p>
            </div>
            <span className={`weight-badge ${module.weight}`}>{weightLabel[module.weight]}</span>
          </header>
          <div className="module-body">
            {module.blocks.map((block, index) => <BlockView
              key={`${module.id}-${index}`}
              block={block}
              onBudgetChange={module.id === 'budget' ? onBudgetChange : undefined}
              onRowsChange={onTableRows ? (rows) => onTableRows(module.id, index, rows) : undefined}
            />)}
            {module.aiNote && <div className="ai-plan-note"><span className="ai-spark"><ClipboardCopy size={15}/></span><div><strong>AI 补充建议</strong><p>{module.aiNote}</p></div></div>}
          </div>
        </section>;
      })}

      <footer className="plan-foot">
        <p>方案由本地策划引擎生成：预算、用量与时间均为估算，执行前请以询价与现场踏勘为准。</p>
      </footer>
    </div>
  </div>;
}
