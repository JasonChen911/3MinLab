import { useState } from 'react';
import { ArrowRight, Check, Loader2, Wand2 } from 'lucide-react';
import type { RevisionOutcome } from '../rules/revise';

const EXAMPLES = [
  '预算压缩到 5000 元',
  '人数从 100 人增加到 300 人',
  '时间缩短到半天',
  '改为室外举行',
  '增加互动环节',
  '减少工作人员',
];

/** 自然语言修改栏：一句话 → 改需求 → 全方案联动 */
export default function RevisionBar({ onRevise }: { onRevise: (text: string) => Promise<RevisionOutcome | null> }) {
  const [draft, setDraft] = useState('');
  const [result, setResult] = useState<RevisionOutcome | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(text: string) {
    const value = text.trim();
    if (!value || busy) return;
    setBusy(true);
    try {
      const outcome = await onRevise(value);
      setResult(outcome);
      if (outcome && !outcome.unknown?.length) setDraft('');
    } finally {
      setBusy(false);
    }
  }

  return <section className="revise-bar" aria-label="用一句话修改方案">
    <div className="revise-head">
      <span className="revise-icon"><Wand2 size={17}/></span>
      <div>
        <strong>用一句话修改方案</strong>
        <p>改需求，不是改文字：流程、预算、人员、物资与风险会一起重算。</p>
      </div>
    </div>

    <form className="revise-form" onSubmit={(event) => { event.preventDefault(); void submit(draft); }}>
      <input
        type="text"
        value={draft}
        maxLength={100}
        onChange={(event) => setDraft(event.target.value)}
        placeholder="例如：预算压缩到 5000 元，人数增加到 300 人"
        aria-label="输入修改要求"
        disabled={busy}
      />
      <button className="primary" type="submit" disabled={!draft.trim() || busy}>
        {busy ? <><Loader2 size={16} className="spin"/> 理解中…</> : <>应用修改 <ArrowRight size={16}/></>}
      </button>
    </form>

    <div className="revise-examples">
      {EXAMPLES.map((example) => <button key={example} type="button" disabled={busy} onClick={() => void submit(example)}>{example}</button>)}
    </div>

    {result && (result.unknown?.length
      ? <p className="revise-unknown" role="status">
          没听懂「{result.unknown[0]}」。可以试试：预算压缩到 5000 元 / 人数增加到 300 人 / 时间缩短到半天 / 改为室外 / 增加互动环节 / 减少工作人员。
        </p>
      : <div className="revise-result" role="status" aria-live="polite">
          <div className="revise-changes">
            <h5><Check size={14}/> 已应用</h5>
            <ul>{result.changes.map((change) => <li key={change.field}>
              <strong>{change.field}</strong>
              <span>{change.before} → {change.after}</span>
            </li>)}</ul>
          </div>
          <div className="revise-impacts">
            <h5>连带调整</h5>
            <ul>{result.impacts.map((impact, index) => <li key={index}>{impact}</li>)}</ul>
          </div>
        </div>)}
  </section>;
}
