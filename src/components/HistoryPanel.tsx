import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Clock3, Trash2, X } from 'lucide-react';
import { getCategory, venueLabel } from '../data/taxonomy';
import type { EventPlan } from '../types';

export default function HistoryPanel({ history, favorites, onOpen, onDelete, onClose }: {
  history: EventPlan[];
  favorites: EventPlan[];
  onOpen: (plan: EventPlan) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}) {
  const [pendingDelete, setPendingDelete] = useState<EventPlan | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => { if (pendingDelete) cancelRef.current?.focus(); }, [pendingDelete]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (pendingDelete) setPendingDelete(null); else onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, pendingDelete]);

  return <div className="history-backdrop" onClick={onClose}>
    <section className="history-panel" role="dialog" aria-modal="true" aria-label="方案记录" onClick={(event) => event.stopPropagation()}>
      <div className="history-header">
        <div><span className="mini-label">YOUR EVENT ARCHIVE</span><h2>方案记录</h2><p>在这台设备上保存的活动方案</p></div>
        <button className="icon-button" onClick={onClose} aria-label="关闭方案记录"><X size={20}/></button>
      </div>
      {history.length ? <div className="history-list">
        {history.map((plan) => <article className="history-card" key={plan.id}>
          <div>
            <span className="history-kicker">
              {getCategory(plan.brief.categoryId).label} · {new Date(plan.createdAt).toLocaleDateString('zh-CN')}
              {favorites.some((item) => item.id === plan.id) ? ' · 已收藏' : ''}
            </span>
            <h3>{plan.title}</h3>
            <p><Clock3 size={14}/> {plan.brief.people} 人 · {venueLabel(plan.brief.venue)} · 预算 ¥{plan.brief.budget.toLocaleString('zh-CN')}</p>
          </div>
          <div className="history-actions">
            <button onClick={() => onOpen(plan)}>打开方案 <ArrowRight size={15}/></button>
            <button onClick={() => setPendingDelete(plan)} aria-label={`删除${plan.title}`}><Trash2 size={16}/></button>
          </div>
        </article>)}
      </div> : <div className="history-empty">
        <img src="/images/activity-lab-logo-v2.png" alt=""/>
        <h3>还没有方案记录</h3>
        <p>完成一次活动策划后，方案会自动保存在这里。</p>
        <button className="primary" onClick={onClose}>开始策划 <ArrowRight size={16}/></button>
      </div>}
      <p className="history-footnote">记录仅保存在当前浏览器；清除浏览器数据后将无法恢复。</p>
    </section>
    {pendingDelete && <div className="confirm-backdrop" onClick={(event) => { event.stopPropagation(); setPendingDelete(null); }}>
      <section className="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="delete-plan-title" aria-describedby="delete-plan-message" onClick={(event) => event.stopPropagation()}>
        <span className="confirm-icon"><Trash2 size={22}/></span>
        <h2 id="delete-plan-title">删除这条方案记录？</h2>
        <p id="delete-plan-message">“{pendingDelete.title}”将从本机记录和收藏中移除，无法恢复。</p>
        <div className="confirm-actions">
          <button ref={cancelRef} onClick={() => setPendingDelete(null)}>保留方案</button>
          <button className="confirm-danger" onClick={() => { onDelete(pendingDelete.id); setPendingDelete(null); }}>删除记录</button>
        </div>
      </section>
    </div>}
  </div>;
}
