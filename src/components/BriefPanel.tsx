import { ArrowLeft, ArrowRight, Sparkles, Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { CATEGORIES, getCategory, GROUPS, VENUES } from '../data/taxonomy';
import { getPreset } from '../data/presets';
import { formatDurationLabel } from '../rules/intake';
import type { BriefFieldKey, BriefQuestion, EventBrief, SourceTag } from '../types';

const badgeText: Record<SourceTag, string> = { user: '已填写', inferred: '已识别', assumed: '假设', preset: '预设' };

const QUICK_TYPES = ['campus-welcome', 'sports-match', 'charity-service', 'business-conference', 'arts-festival', 'education-popular'];

interface Props {
  brief: EventBrief;
  questions: BriefQuestion[];
  onChange: (key: BriefFieldKey, value: string) => void;
  onDaysChange: (days: number) => void;
  onAnswer: (question: BriefQuestion, value: string) => void;
  onGenerate: () => void;
  onReset: () => void;
  onClearPreset: () => void;
  aiSlot?: ReactNode;
  generating?: boolean;
}

/** 需求确认面板：字段可直接改，来源明确标注，问题最多三条 */
export default function BriefPanel({ brief, questions, onChange, onDaysChange, onAnswer, onGenerate, onReset, onClearPreset, aiSlot, generating }: Props) {
  const source = (key: BriefFieldKey) => brief.sources[key] ?? 'assumed';
  const preset = getPreset(brief.presetId);

  return <div className="panel step-enter brief-panel">
    <div className="section-title">
      <div>
        <span className="mini-label">REQUIREMENT CHECK</span>
        <h3>先确认一下你的活动</h3>
      </div>
      <span className="pill">{formatDurationLabel(brief.durationMinutes, brief.days)} · {brief.people} 人 · ¥{brief.budget.toLocaleString('zh-CN')}</span>
    </div>

    {preset && <div className="preset-applied">
      <span className="preset-tag">预设</span>
      <div className="preset-applied-copy">
        <strong>{preset.name}</strong>
        <small>{preset.tagline} · 下面所有字段都可以改，也可以清除预设重新填。</small>
      </div>
      <button type="button" className="text-button" onClick={onClearPreset}><Trash2 size={14}/> 清除预设内容</button>
    </div>}

    {source('category') === 'assumed' && <div className="type-ask">
      <strong>还没能判断出活动类型</strong>
      <p>先选一个最接近的类型，流程、人员与风险会更贴合；也可以继续用通用框架。</p>
      <div className="type-ask-chips">
        {QUICK_TYPES.map((id) => <button key={id} type="button" onClick={() => onChange('category', id)}>{getCategory(id).label}</button>)}
        <button type="button" className="ghost" onClick={() => onChange('category', 'generic-event')}>继续用通用框架</button>
      </div>
      <details className="type-ask-all">
        <summary>查看全部 {GROUPS.length} 个分类</summary>
        {GROUPS.map((group) => <div key={group.id} className="type-ask-group">
          <span>{group.label}</span>
          <div>{group.categories.map((id) => <button key={id} type="button" onClick={() => onChange('category', id)}>{getCategory(id).label}</button>)}</div>
        </div>)}
      </details>
    </div>}

    <p className="brief-lead">
      我从你的描述里读出了下面这些信息。<strong>带「假设」的都是我替你填的</strong>，点开就能改；不改也可以直接生成方案。
    </p>

    <div className="brief-fields">
      <label className="brief-field">
        <span className="brief-label">活动类型 <em className={`src-badge ${source('category')}`}>{badgeText[source('category')]}</em></span>
        <select value={brief.categoryId} onChange={(event) => onChange('category', event.target.value)}>
          {CATEGORIES.map((category) => <option key={category.id} value={category.id}>{category.label}</option>)}
        </select>
      </label>

      <label className="brief-field">
        <span className="brief-label">参与人数 <em className={`src-badge ${source('people')}`}>{badgeText[source('people')]}</em></span>
        <div className="input-suffix">
          <input type="number" min={1} max={200000} step={10} value={brief.people} onChange={(event) => onChange('people', event.target.value)} />
          <span>人</span>
        </div>
      </label>

      <label className="brief-field">
        <span className="brief-label">总预算 <em className={`src-badge ${source('budget')}`}>{badgeText[source('budget')]}</em></span>
        <div className="input-suffix">
          <span>¥</span>
          <input type="number" min={0} step={100} value={brief.budget} onChange={(event) => onChange('budget', event.target.value)} />
        </div>
      </label>

      <label className="brief-field">
        <span className="brief-label">举办日期 <em className={`src-badge ${source('date')}`}>{badgeText[source('date')]}</em></span>
        <input type="date" value={brief.date} onChange={(event) => onChange('date', event.target.value)} />
      </label>

      <label className="brief-field">
        <span className="brief-label">单日时长 <em className={`src-badge ${source('duration')}`}>{badgeText[source('duration')]}</em></span>
        <div className="input-suffix">
          <input
            type="number"
            min={0.5}
            max={12}
            step={0.5}
            value={Math.round((brief.durationMinutes / 60) * 2) / 2}
            onChange={(event) => onChange('duration', `${event.target.value} 小时`)}
          />
          <span>小时</span>
          <select aria-label="活动天数" value={brief.days} onChange={(event) => onDaysChange(Number(event.target.value))}>
            {[1, 2, 3, 4, 5].map((day) => <option key={day} value={day}>{day} 天</option>)}
          </select>
        </div>
      </label>

      <label className="brief-field">
        <span className="brief-label">场地类型 <em className={`src-badge ${source('venue')}`}>{badgeText[source('venue')]}</em></span>
        <select value={brief.venue} onChange={(event) => onChange('venue', event.target.value)}>
          {VENUES.map((venue) => <option key={venue.id} value={venue.id}>{venue.label}（{venue.hint}）</option>)}
        </select>
      </label>

      <label className="brief-field wide">
        <span className="brief-label">参与人群 <em className={`src-badge ${source('audience')}`}>{badgeText[source('audience')]}</em></span>
        <input type="text" maxLength={60} value={brief.audience} onChange={(event) => onChange('audience', event.target.value)} />
      </label>

      <label className="brief-field wide">
        <span className="brief-label">活动目标 <em className={`src-badge ${source('goal')}`}>{badgeText[source('goal')]}</em></span>
        <input type="text" maxLength={80} value={brief.goal} onChange={(event) => onChange('goal', event.target.value)} />
      </label>

      <label className="brief-field wide">
        <span className="brief-label">活动名称（可选，留空自动生成）</span>
        <input type="text" maxLength={40} placeholder={brief.title || '例如：2026 秋季校园马拉松'} value={brief.title} onChange={(event) => onChange('title', event.target.value)} />
      </label>

      <label className="brief-field wide">
        <span className="brief-label">特殊要求 / 补充说明 <em className={`src-badge ${source('constraints')}`}>{badgeText[source('constraints')]}</em></span>
        <textarea
          rows={2}
          maxLength={300}
          value={brief.constraints}
          placeholder="例如：只能用室内场地、需要无障碍通道、有赞助商露出要求、不能安排晚间活动"
          onChange={(event) => onChange('constraints', event.target.value)}
        />
      </label>
    </div>

    {aiSlot}

    {questions.length > 0 && <section className="ask-block">
      <h4><Sparkles size={16}/> 还差 {questions.length} 个信息，回答后方案会更准确</h4>
      <div className="ask-grid">
        {questions.map((question) => <div className="ask-card" key={question.id}>
          <p>{question.prompt}</p>
          <div className="ask-options">
            {question.options.map((option) => <button key={option.value} type="button" onClick={() => onAnswer(question, option.value)}>
              <span>{option.label}</span>
              {option.hint && <small>{option.hint}</small>}
            </button>)}
          </div>
        </div>)}
      </div>
    </section>}

    {brief.assumptions.length > 0 && <section className="assumption-block">
      <h4>以下内容按假设填写</h4>
      <ul className="assumption-list">
        {brief.assumptions.map((assumption) => <li key={assumption.field}>
          <strong>{assumption.label}</strong>
          <span>{assumption.value}</span>
          <small>{assumption.reason}</small>
        </li>)}
      </ul>
    </section>}

    <div className="panel-footer">
      <button className="back" onClick={onReset}><ArrowLeft size={17}/> 重新描述</button>
      <button className="primary" onClick={onGenerate} disabled={generating}>
        {generating ? '正在生成…' : '生成活动方案'} <ArrowRight size={17}/>
      </button>
    </div>
  </div>;
}
