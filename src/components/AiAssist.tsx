import { useEffect, useState } from 'react';
import { ArrowRight, Send, Sparkles } from 'lucide-react';
import { MODULE_IDS } from '../data/taxonomy';
import type { RevisionPatch } from '../rules/revise';
import type { BriefQuestion, EventBrief, EventPlan, ModuleId } from '../types';

/* ============================================================
 * AI 协同层（可选）
 *
 * 定位：只做"补充"和"追问"，不改变本地确定性引擎的结论。
 * 无 Key 或离线时整体隐藏/降级，方案生成完全不受影响。
 * ============================================================ */

const QUESTION_FIELDS = ['people', 'budget', 'date', 'duration', 'venue', 'goal', 'audience', 'category'] as const;

/**
 * AI 兜底解析修改要求：本地规则听不懂时再调用。
 * 失败（无 Key / 网络 / 校验不通过）一律返回 null，不阻塞本地流程。
 */
export async function requestRevisionPatch(text: string, brief: EventBrief, apiKey: string): Promise<RevisionPatch | null> {
  try {
    const data = await callAssist({
      mode: 'revise',
      text: text.slice(0, 160),
      brief: {
        category: brief.categoryId,
        people: brief.people,
        budget: brief.budget,
        duration: brief.durationMinutes,
        venue: brief.venue,
        goal: brief.goal,
        audience: brief.audience,
      },
    }, apiKey);
    const patch = data.patch;
    if (!patch || typeof patch !== 'object') return null;
    return patch as RevisionPatch;
  } catch {
    return null;
  }
}

async function callAssist(body: unknown, apiKey: string) {
  const response = await fetch('/api/ai/assist', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(apiKey ? { 'X-DeepSeek-API-Key': apiKey } : {}) },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof data?.error === 'string' ? data.error : 'AI 请求失败，请稍后再试');
  return data as Record<string, unknown>;
}

function useAiStatus() {
  const [available, setAvailable] = useState<boolean | null>(null);
  useEffect(() => {
    let active = true;
    fetch('/api/ai/status')
      .then((response) => response.json())
      .then((data) => { if (active) setAvailable(data?.available === true); })
      .catch(() => { if (active) setAvailable(false); });
    return () => { active = false; };
  }, []);
  return available;
}

/** 需求阶段的 AI 追问 */
export function AiClarify({ idea, brief, apiKey, onQuestions }: {
  idea: string;
  brief: EventBrief;
  apiKey: string;
  onQuestions: (questions: BriefQuestion[]) => void;
}) {
  const available = useAiStatus();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const usable = available === true || !!apiKey;

  async function ask() {
    setLoading(true); setError('');
    try {
      const data = await callAssist({
        mode: 'clarify',
        idea: idea.slice(0, 500),
        brief: {
          category: brief.categoryId,
          people: brief.people,
          budget: brief.budget,
          duration: brief.durationMinutes,
          venue: brief.venue,
          audience: brief.audience,
          goal: brief.goal,
        },
      }, apiKey);

      const raw = Array.isArray(data.questions) ? data.questions : [];
      const questions: BriefQuestion[] = [];
      raw.slice(0, 3).forEach((item, index) => {
        if (!item || typeof item !== 'object') return;
        const question = item as Record<string, unknown>;
        const field = typeof question.field === 'string' ? question.field : '';
        if (!QUESTION_FIELDS.includes(field as (typeof QUESTION_FIELDS)[number])) return;
        if (typeof question.prompt !== 'string' || !question.prompt.trim()) return;
        const options = Array.isArray(question.options)
          ? question.options
            .filter((option): option is { label: string; value: string; hint?: string } =>
              !!option && typeof option === 'object'
              && typeof (option as Record<string, unknown>).label === 'string'
              && typeof (option as Record<string, unknown>).value === 'string')
            .slice(0, 4)
            .map((option) => ({ label: option.label.slice(0, 40), value: String(option.value).slice(0, 60), hint: typeof option.hint === 'string' ? option.hint.slice(0, 40) : undefined }))
          : [];
        if (!options.length) return;
        questions.push({
          id: `ai-${index}-${field}`,
          field: field as BriefQuestion['field'],
          prompt: question.prompt.slice(0, 120),
          options,
        });
      });
      if (!questions.length) throw new Error('AI 没有给出可用的问题，请继续手动填写');
      onQuestions(questions);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'AI 请求失败');
    } finally {
      setLoading(false);
    }
  }

  return <div className="ai-inline">
    <button type="button" className="ai-inline-trigger" onClick={ask} disabled={!usable || loading}>
      <Sparkles size={15}/> {loading ? '正在梳理…' : '让 AI 帮我多问几个问题'}
    </button>
    {available === false && !apiKey && <small className="ai-inline-hint">未配置 API Key，本地引擎已按假设补全信息。</small>}
    {error && <p className="ai-error" role="alert">{error}</p>}
  </div>;
}

/** 方案阶段的单模块 AI 补充 */
export function AiModuleAssist({ plan, moduleId, apiKey, onApply }: {
  plan: EventPlan;
  moduleId: ModuleId;
  apiKey: string;
  onApply: (moduleId: ModuleId, note: string, items: string[]) => void;
}) {
  const available = useAiStatus();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ reply: string; items: string[] } | null>(null);
  const module = plan.modules.find((item) => item.id === moduleId);
  const usable = (available === true || !!apiKey) && MODULE_IDS.includes(moduleId);

  async function request() {
    setLoading(true); setError(''); setResult(null);
    try {
      const data = await callAssist({
        mode: 'enrich',
        moduleId,
        instruction: draft.slice(0, 200),
        plan: {
          title: plan.title,
          theme: plan.theme,
          category: plan.brief.categoryId,
          people: plan.brief.people,
          budget: plan.brief.budget,
          duration: plan.brief.durationMinutes,
          venue: plan.brief.venue,
          goal: plan.brief.goal,
          audience: plan.brief.audience,
          moduleSummary: module?.summary ?? '',
        },
      }, apiKey);

      const items = Array.isArray(data.items)
        ? data.items.filter((item): item is string => typeof item === 'string' && !!item.trim()).map((item) => item.trim().slice(0, 120)).slice(0, 6)
        : [];
      const reply = typeof data.reply === 'string' ? data.reply.slice(0, 400) : '';
      if (!items.length && !reply) throw new Error('AI 没有返回可用内容，请重试');
      setResult({ reply, items });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'AI 请求失败');
    } finally {
      setLoading(false);
    }
  }

  return <section className="ai-module">
    <div className="ai-module-head">
      <span className="ai-spark"><Sparkles size={17}/></span>
      <div>
        <strong>AI 补充「{module?.title ?? '当前模块'}」</strong>
        <p>只补内容，不改预算、人数与流程等本地计算结果。</p>
      </div>
      <button type="button" className="ai-module-toggle" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        {open ? '收起' : '展开'}
      </button>
    </div>
    {open && <div className="ai-module-body">
      {!usable ? <p className="ai-inline-hint">未配置 API Key。打开右上角「设置」填入 Key 即可使用；不配置也能继续手动编辑方案。</p> : <>
        <div className="ai-module-compose">
          <input
            type="text"
            maxLength={200}
            placeholder="可选：补充你的要求，例如「更省钱」「面向零基础观众」"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
          <button type="button" className="primary" onClick={request} disabled={loading}>{loading ? '生成中…' : <>生成建议 <Send size={15}/></>}</button>
        </div>
        {error && <p className="ai-error" role="alert">{error}</p>}
        {result && <div className="ai-suggestion">
          {result.reply && <p className="ai-suggestion-reply">{result.reply}</p>}
          <ul>{result.items.map((item, index) => <li key={index}>{item}</li>)}</ul>
          <button type="button" className="primary" onClick={() => { onApply(moduleId, result.reply, result.items); setResult(null); }}>
            采用这些建议 <ArrowRight size={15}/>
          </button>
        </div>}
      </>}
    </div>}
  </section>;
}
