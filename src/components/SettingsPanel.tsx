import { useEffect, useRef, useState } from 'react';
import { Eye, EyeOff, KeyRound, X } from 'lucide-react';
import { clearApiKey, loadApiKey, saveApiKey } from '../services/apiKey';

export default function SettingsPanel({ onClose, onKeyChange }: { onClose: () => void; onKeyChange: (key: string) => void }) {
  const [key, setKey] = useState(loadApiKey);
  const [visible, setVisible] = useState(false);
  const [message, setMessage] = useState('');
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  function save() {
    if (!saveApiKey(key)) { setMessage('请输入有效的 API Key。'); return; }
    const saved = loadApiKey();
    setKey(saved); onKeyChange(saved); setMessage('API Key 已保存在当前浏览器。');
  }
  function clear() {
    if (!clearApiKey()) { setMessage('清除失败，请检查浏览器存储权限。'); return; }
    setKey(''); onKeyChange(''); setMessage('API Key 已清除。');
  }

  return <div className="settings-backdrop" onClick={onClose}>
    <section className="settings-panel" role="dialog" aria-modal="true" aria-labelledby="settings-title" onClick={event => event.stopPropagation()}>
      <div className="settings-heading"><span className="settings-icon"><KeyRound size={21}/></span><button ref={closeRef} className="icon-button" onClick={onClose} aria-label="关闭设置"><X size={20}/></button></div>
      <span className="mini-label">PERSONAL SETTINGS</span><h2 id="settings-title">设置 DeepSeek API Key</h2>
      <p>填入你自己的 Key，就能在“让 AI 帮我多问几个问题”或“让 AI 帮我完善”中获取活动建议。无需修改项目文件。</p>
      <label htmlFor="deepseek-key">API Key</label>
      <div className="key-field"><input id="deepseek-key" type={visible ? 'text' : 'password'} autoComplete="off" spellCheck={false} value={key} onChange={event => { setKey(event.target.value); setMessage(''); }} placeholder="sk-..."/><button onClick={() => setVisible(value => !value)} aria-label={visible ? '隐藏 API Key' : '显示 API Key'}>{visible ? <EyeOff size={19}/> : <Eye size={19}/>}</button></div>
      <p className="settings-note">Key 仅保存在当前浏览器的 localStorage。使用 AI 时会通过同源本机服务发送给 DeepSeek；请勿在共享电脑上保存。清除浏览器数据也会移除 Key。</p>
      {message && <p className="settings-message" role="status">{message}</p>}
      <div className="settings-actions"><button className="settings-clear" onClick={clear}>清除 Key</button><button className="primary" onClick={save}>保存设置</button></div>
    </section>
  </div>;
}
