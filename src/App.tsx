import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Clock3, FileText, History, Settings, Sparkles, Trash2 } from 'lucide-react';
import BriefPanel from './components/BriefPanel';
import PlanView from './components/PlanView';
import PresetGallery from './components/PresetGallery';
import HistoryPanel from './components/HistoryPanel';
import SettingsPanel from './components/SettingsPanel';
import { AiClarify, AiModuleAssist, requestRevisionPatch } from './components/AiAssist';
import RevisionBar from './components/RevisionBar';
import { buildPlanMarkdown, buildPromotionPost } from './rules/export';
import { editBudgetRow } from './rules/budget';
import { generatePlan } from './rules/generator';
import { applyPatch, diffPlans, reviseBrief, type RevisionOutcome } from './rules/revise';
import { applyAnswer, clearPreset, createBrief, createBriefFromCategory, createBriefFromPreset, nextQuestions, refreshBrief, updateField } from './rules/intake';
import { CATEGORIES } from './data/taxonomy';
import { loadApiKey } from './services/apiKey';
import { clearLocalState, loadLocalState, saveLocalState } from './services/storage';
import type {
  BriefFieldKey,
  BriefQuestion,
  EventBrief,
  EventPlan,
  ModuleId,
} from './types';

const EXAMPLES = [
  '下个月给 400 名新生办一场校园迎新，预算 8000 元',
  '办一场 800 人的校园马拉松，预算 6 万，户外赛道',
  '公司新品发布会，150 人，预算 12 万，室内场地',
  '周末在社区广场做环保宣传，200 人参加',
  '毕业晚会，800 人，晚上在礼堂',
  '部门团建，40 人，半天，预算 8000',
];

export default function App() {
  const [saved, setSaved] = useState(loadLocalState);
  const [screen, setScreen] = useState<'home' | 'workspace'>(() => (window.location.hash === '#workspace' ? 'workspace' : 'home'));
  const [stage, setStage] = useState<'intake' | 'plan'>(() => (saved.data.recent ? 'plan' : 'intake'));
  const [idea, setIdea] = useState('');
  const [brief, setBrief] = useState<EventBrief | null>(saved.data.recent?.brief ?? null);
  const [plan, setPlan] = useState<EventPlan | null>(saved.data.recent ?? null);
  const [asked, setAsked] = useState<BriefFieldKey[]>([]);
  const [aiQuestions, setAiQuestions] = useState<BriefQuestion[]>([]);
  const [activeModule, setActiveModule] = useState<ModuleId>('basic');
  const [toast, setToast] = useState(saved.error ?? '');
  const [showHistory, setShowHistory] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [apiKey, setApiKey] = useState(loadApiKey);
  const [generating, setGenerating] = useState(false);
  const ideaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const syncScreen = () => {
      setScreen(window.location.hash === '#workspace' ? 'workspace' : 'home');
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', syncScreen);
    return () => window.removeEventListener('hashchange', syncScreen);
  }, []);

  // 可分享入口：?idea=一句话想法 预填；&start=1 直接进入需求确认；?preset=预设 ID 直接带预设起稿
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const presetId = params.get('preset');
    if (presetId) {
      startFromPreset(presetId);
      return;
    }
    const preset = params.get('idea');
    if (!preset || preset.trim().length < 4) return;
    const text = preset.slice(0, 200);
    setIdea(text);
    if (params.get('start') === '1') startPlanning(text);
    // 仅在首次加载时处理，避免覆盖用户当前编辑
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const localQuestions = useMemo(() => (brief && stage === 'intake' ? nextQuestions(brief, asked) : []), [brief, asked, stage]);
  const questions = useMemo(() => {
    const seen = new Set(aiQuestions.map((question) => question.field));
    return [...aiQuestions, ...localQuestions.filter((question) => !seen.has(question.field))].slice(0, 3);
  }, [aiQuestions, localQuestions]);

  const isFavorite = !!plan && saved.data.favorites.some((item) => item.id === plan.id);

  function announce(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(''), 4200);
  }

  function navigateTo(next: 'home' | 'workspace') {
    window.location.hash = next;
    setScreen(next);
    window.scrollTo(0, 0);
  }

  function startPlanning(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    const nextBrief = createBrief(trimmed);
    setIdea(trimmed);
    setBrief(nextBrief);
    setAsked([]);
    setAiQuestions([]);
    setPlan(null);
    setStage('intake');
    setActiveModule('basic');
    navigateTo('workspace');
    window.setTimeout(() => document.getElementById('brief-grid')?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 60);
  }

  /** 从预设模板起稿：进入需求确认，字段已按预设填好且可改 */
  function startFromPreset(presetId: string) {
    const nextBrief = createBriefFromPreset(presetId);
    setIdea(nextBrief.idea);
    setBrief(nextBrief);
    setAsked([]);
    setAiQuestions([]);
    setPlan(null);
    setStage('intake');
    setActiveModule('basic');
    navigateTo('workspace');
    announce(`已套用预设「${nextBrief.title}」，下面的内容都可以修改`);
  }

  /** 只选类型：不套预设，其余按该类活动的常见值补成假设 */
  function startFromCategory(categoryId: string) {
    const nextBrief = createBriefFromCategory(categoryId);
    setIdea(nextBrief.idea);
    setBrief(nextBrief);
    setAsked([]);
    setAiQuestions([]);
    setPlan(null);
    setStage('intake');
    setActiveModule('basic');
    navigateTo('workspace');
  }

  /** 删除预设内容：解除关联并退回类型默认值 */
  function clearPresetContent() {
    if (!brief) return;
    setBrief(clearPreset(brief));
    announce('已清除预设内容，可以重新填写');
  }

  function resumeLast() {
    const last = saved.data.recent;
    if (!last) return;
    setPlan(last);
    setBrief(last.brief);
    setStage('plan');
    navigateTo('workspace');
  }

  function persist(next: EventPlan, quiet = false) {
    const data = {
      recent: next,
      favorites: saved.data.favorites.map((item) => (item.id === next.id ? next : item)),
      history: [next, ...saved.data.history.filter((item) => item.id !== next.id)],
    };
    setSaved({ data, error: null });
    const ok = saveLocalState(data);
    if (!quiet) announce(ok ? '方案已保存在这台设备' : '浏览器阻止了本地保存，请及时复制方案');
  }

  function generate() {
    if (!brief) return;
    setGenerating(true);
    const fresh = generatePlan(brief);
    const next = plan ? { ...fresh, id: plan.id } : fresh;
    setPlan(next);
    setStage('plan');
    setActiveModule('basic');
    persist(next);
    window.setTimeout(() => {
      setGenerating(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }, 220);
  }

  function changeField(key: BriefFieldKey, value: string) {
    if (!brief) return;
    setBrief(updateField(brief, key, value));
  }

  function changeDays(days: number) {
    if (!brief) return;
    setBrief(refreshBrief({ ...brief, days, sources: { ...brief.sources, duration: 'user' } }));
  }

  function answerQuestion(question: BriefQuestion, value: string) {
    if (!brief) return;
    setBrief(applyAnswer(brief, question, value));
    setAsked((prev) => (prev.includes(question.field) ? prev : [...prev, question.field]));
    setAiQuestions((prev) => prev.filter((item) => item.field !== question.field));
  }

  function toggleFavorite() {
    if (!plan) return;
    const exists = saved.data.favorites.some((item) => item.id === plan.id);
    const favorites = exists ? saved.data.favorites.filter((item) => item.id !== plan.id) : [plan, ...saved.data.favorites];
    const data = { ...saved.data, favorites };
    setSaved({ data, error: null });
    saveLocalState(data);
    announce(exists ? '已取消收藏' : '已收藏方案');
  }

  async function copyText(text: string, message: string) {
    try {
      await navigator.clipboard.writeText(text);
      announce(message);
    } catch {
      announce('复制失败，请使用打印功能保存为 PDF');
    }
  }

  function updateBudgetRow(rowId: string, amount: number) {
    if (!plan) return;
    const next = editBudgetRow(plan, rowId, amount);
    setPlan(next);
    persist(next, true);
  }

  /** 表格行编辑：任务、风险、物资等表格支持逐格改、删行、加行 */
  function updateTableRows(moduleId: ModuleId, blockIndex: number, rows: string[][]) {
    if (!plan) return;
    const modules = plan.modules.map((module) => module.id !== moduleId ? module : {
      ...module,
      blocks: module.blocks.map((block, index) => index !== blockIndex || block.kind !== 'table' ? block : { ...block, rows }),
    });
    const next: EventPlan = { ...plan, modules };
    setPlan(next);
    persist(next, true);
  }

  async function applyRevision(text: string): Promise<RevisionOutcome | null> {
    if (!plan || !brief) return null;
    // 先走本地规则；听不懂再让 AI 兜底解析（无 Key 时直接跳过）
    let result = reviseBrief(brief, text);
    if (!result.changes.length) {
      const patch = await requestRevisionPatch(text, brief, apiKey);
      if (patch) result = applyPatch(brief, patch);
    }
    if (!result.changes.length) return { changes: [], impacts: [], unknown: result.unknown };
    const regenerated = { ...generatePlan(result.brief), id: plan.id };
    const impacts = diffPlans(plan, regenerated);
    setBrief(result.brief);
    setPlan(regenerated);
    setActiveModule('basic');
    persist(regenerated);
    return { changes: result.changes, impacts };
  }

  function downloadMarkdown() {
    if (!plan) return;
    const blob = new Blob([buildPlanMarkdown(plan)], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${plan.title}.md`;
    link.click();
    URL.revokeObjectURL(url);
    announce('已导出 Markdown 文件');
  }

  function applyAiModule(moduleId: ModuleId, note: string, items: string[]) {
    if (!plan) return;
    const modules = plan.modules.map((module) => module.id !== moduleId ? module : {
      ...module,
      aiNote: note || module.aiNote,
      blocks: [...module.blocks, { kind: 'bullets' as const, title: 'AI 补充建议', items }],
    });
    const next: EventPlan = { ...plan, modules, aiNotes: { ...plan.aiNotes, [moduleId]: note } };
    setPlan(next);
    persist(next);
    announce('AI 建议已补充到方案');
  }

  function openSavedPlan(target: EventPlan) {
    setPlan(target);
    setBrief(target.brief);
    setStage('plan');
    setActiveModule('basic');
    setShowHistory(false);
    navigateTo('workspace');
  }

  function deleteSavedPlan(id: string) {
    const data = {
      recent: saved.data.recent?.id === id ? null : saved.data.recent,
      favorites: saved.data.favorites.filter((item) => item.id !== id),
      history: saved.data.history.filter((item) => item.id !== id),
    };
    setSaved({ data, error: null });
    saveLocalState(data);
    if (plan?.id === id) {
      setPlan(null);
      setBrief(null);
      setStage('intake');
      navigateTo('home');
    }
    announce('方案记录已删除');
  }

  function resetData() {
    if (!window.confirm('清除这台设备保存的方案与收藏？')) return;
    clearLocalState();
    setSaved({ data: { recent: null, favorites: [], history: [] }, error: null });
    setPlan(null);
    setBrief(null);
    setStage('intake');
    setShowHistory(false);
    navigateTo('home');
    announce('本地数据已清除');
  }

  return <div className="shell">
    <header className="topbar">
      <a className="brand" href="#home" onClick={() => navigateTo('home')}>
        <img className="brand-mark" src="/images/activity-lab-logo-v2.png" alt=""/>
        <span>通用策划<br/><strong>活动实验室</strong></span>
      </a>
      <div className="top-right">
        <span className="tag">GENERAL EVENT PLANNER</span>
        <button className="settings-trigger" onClick={() => setShowSettings(true)}>
          <Settings size={17}/> 设置{apiKey ? <span className="settings-dot" aria-label="已设置 API Key"/> : null}
        </button>
        <button className="record-trigger" onClick={() => setShowHistory(true)}>
          <History size={17}/> 方案记录 <span>{saved.data.history.length}</span>
        </button>
        <button className="subtle" onClick={resetData} title="清除本地数据"><Trash2 size={16}/> 清除数据</button>
      </div>
    </header>

    <main id="home" className={screen === 'home' ? 'home-page' : 'workspace-page'}>
      {screen === 'home' && <section className="hero hero-input">
        <div className="hero-copy">
          <div className="eyebrow"><span className="pulse"/> ANY EVENT, PLANNED</div>
          <h1>什么活动都能策划，<br/><em>从一句话开始。</em></h1>
          <p>校园迎新、毕业晚会、马拉松、发布会、招聘会、社区公益、家庭聚会……说你想要什么，生成一份含 12 个模块、可直接执行的活动方案。</p>
          <form className="idea-form" onSubmit={(event) => { event.preventDefault(); startPlanning(idea); }}>
            <textarea
              ref={ideaRef}
              value={idea}
              onChange={(event) => setIdea(event.target.value.slice(0, 200))}
              placeholder="例如：下个月在体育馆办一场 800 人的校园马拉松，预算 6 万，需要医疗和补给方案"
              aria-label="描述你的活动想法"
              rows={3}
            />
            <div className="idea-form-foot">
              <span className="idea-count">{idea.length}/200</span>
              <button className="hero-start" type="submit" disabled={!idea.trim()}>开始策划 <ArrowRight size={18}/></button>
            </div>
          </form>
          <div className="idea-examples" aria-label="示例活动">
            {EXAMPLES.map((example) => <button key={example} type="button" onClick={() => startPlanning(example)}>{example}</button>)}
          </div>
          <a className="hero-preset-link" href="#presets">没有头绪？浏览 12 个预设模板 ↓</a>
          {saved.data.recent && <button className="resume-card" type="button" onClick={resumeLast}>
            <span className="mini-label">上次的方案</span>
            <strong>{saved.data.recent.title}</strong>
            <small><Clock3 size={13}/> {new Date(saved.data.recent.createdAt).toLocaleDateString('zh-CN')} · {saved.data.recent.brief.people} 人</small>
            <ArrowRight size={18}/>
          </button>}
          <div className="hero-stats">
            <span><strong>12</strong> 个策划模块</span>
            <span><strong>{CATEGORIES.length}</strong> 类活动</span>
            <span><strong>12</strong> 个预设模板</span>
          </div>
        </div>
        <div className="hero-art" aria-hidden="true"><div className="orbit orbit-one"/><div className="orbit orbit-two"/><div className="art-core">PLAN<br/>IT<br/>WELL<span>✳</span></div><span className="floating f1">✦ 灵感</span><span className="floating f2">⏱ 计划</span><span className="floating f3">↗ 执行</span></div>
      </section>}

      {screen === 'home' && <PresetGallery
        onPreset={startFromPreset}
        onCategory={startFromCategory}
        onCustom={() => {
          window.scrollTo({ top: 0, behavior: 'smooth' });
          window.setTimeout(() => ideaRef.current?.focus(), 320);
        }}
      />}

      {screen === 'workspace' && <section id="workspace" className="workspace">
        <div className="workspace-head">
          <div>
            <button className="workspace-back" onClick={() => navigateTo('home')}><ArrowLeft size={16}/> 返回首页</button>
            <div className="eyebrow dark">{stage === 'intake' ? 'STEP 01 / 需求理解' : 'STEP 02 / 策划方案'}</div>
            <h2>{stage === 'intake' ? '确认需求，生成方案' : '策划方案'}</h2>
            <p>{stage === 'intake' ? '关键信息一屏确认；没填的我已经按同类活动补上了假设。' : '12 个模块已按活动性质排好权重，可直接执行或继续调整。'}</p>
            {stage === 'intake' && idea && <p className="idea-recap"><FileText size={14}/> 你的描述：「{idea}」</p>}
          </div>
          <span className="step-count">{stage === 'intake' ? '01' : '02'} <small>/ 02</small></span>
        </div>

        {stage === 'intake' && brief && <div id="brief-grid">
          <BriefPanel
            brief={brief}
            questions={questions}
            onChange={changeField}
            onDaysChange={changeDays}
            onAnswer={answerQuestion}
            onGenerate={generate}
            onClearPreset={clearPresetContent}
            onReset={() => { setStage('intake'); setBrief(null); setPlan(null); setIdea(''); navigateTo('home'); }}
            generating={generating}
            aiSlot={idea ? <AiClarify idea={idea} brief={brief} apiKey={apiKey} onQuestions={(items) => setAiQuestions(items)}/> : undefined}
          />
        </div>}

        {stage === 'plan' && plan && <PlanView
          plan={plan}
          active={activeModule}
          onActive={setActiveModule}
          isFavorite={isFavorite}
          onFavorite={toggleFavorite}
          onCopy={() => copyText(buildPlanMarkdown(plan), '方案全文已复制')}
          onPrint={() => window.print()}
          onCopyPromo={() => copyText(buildPromotionPost(plan), '招募文案已复制')}
          onDownload={downloadMarkdown}
          onAdjust={() => { setBrief(plan.brief); setStage('intake'); window.scrollTo(0, 0); }}
          onBudgetChange={updateBudgetRow}
          onTableRows={updateTableRows}
          revisionPanel={<RevisionBar onRevise={applyRevision}/>}
          aiPanel={<AiModuleAssist plan={plan} moduleId={activeModule} apiKey={apiKey} onApply={applyAiModule}/>}
        />}

        {!brief && !plan && <div className="panel empty-plan">
          <h3>还没有活动想法</h3>
          <p>回到首页描述你想办的活动，或打开一条历史方案继续编辑。</p>
          <div className="panel-footer">
            <button className="back" onClick={() => setShowHistory(true)}><History size={16}/> 打开方案记录</button>
            <button className="primary" onClick={() => navigateTo('home')}>去输入想法 <ArrowRight size={16}/></button>
          </div>
        </div>}
      </section>}

      {screen === 'home' && <section className="bottom-note">
        <img className="bottom-logo" src="/images/activity-lab-logo-v2.png" alt=""/>
        <div>
          <h2>好活动不靠灵感，靠一份能执行的方案。</h2>
          <p>从一个想法开始，剩下的模块我们替你排好。</p>
        </div>
      </section>}
    </main>

    <footer>
      <span className="footer-brand"><img src="/images/activity-lab-logo-v2.png" alt=""/>© 活动实验室 · 通用活动策划平台</span>
      <span><Sparkles size={12}/> 本地引擎生成 · 所有金额均为估算</span>
    </footer>

    {showHistory && <HistoryPanel
      history={saved.data.history}
      favorites={saved.data.favorites}
      onOpen={openSavedPlan}
      onDelete={deleteSavedPlan}
      onClose={() => setShowHistory(false)}
    />}
    {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} onKeyChange={setApiKey}/>}
    {toast && <div className="toast" role="status">{toast}</div>}
  </div>;
}
