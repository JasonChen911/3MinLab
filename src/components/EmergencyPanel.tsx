import { useState } from 'react';
import { EMERGENCIES, type EmergencyId } from '../rules/emergency';

export default function EmergencyPanel({ onApply }: { onApply: (id: EmergencyId, detail: string) => void }) {
  const [id, setId] = useState<EmergencyId>('rain');
  const [detail, setDetail] = useState('');
  const [preview, setPreview] = useState(false);
  const scenario = EMERGENCIES.find((item) => item.id === id)!;
  return <section className="revise-bar" id="emergency-adjustment" aria-label="突发情况调整">
    <h3>突发情况调整</h3>
    <p>选择现场情况，预览后追加到活动流程、执行安排和风险管理。已编辑的内容会保留。</p>
    <label>突发情况 <select value={id} onChange={(event) => { setId(event.target.value as EmergencyId); setPreview(false); }}>
      {EMERGENCIES.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
    </select></label>
    <label className="brief-field">现场补充（可选）<textarea maxLength={300} rows={2} value={detail} onChange={(event) => setDetail(event.target.value)} placeholder="例如：户外舞台无法使用，室内教室可容纳 100 人，等待场地方确认"/></label>
    <button className="primary" type="button" onClick={() => setPreview(true)}>预览应急调整</button>
    {preview && <div className="revise-result">
      <div><h4>{scenario.name} · 待应用</h4><ol>{scenario.actions.map((action) => <li key={action}>{action}</li>)}</ol><p>{scenario.flow}</p><p>{scenario.risk}</p>
      <button className="primary" type="button" onClick={() => { onApply(id, detail); setPreview(false); setDetail(''); }}>应用到当前方案</button>
      <button className="text-button" type="button" onClick={() => setPreview(false)}>取消</button></div>
    </div>}
  </section>;
}
