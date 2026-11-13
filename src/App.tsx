import {loadPreferences} from './settings/preferences';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Clock3, FileText, History, Menu, X, Settings, Sparkles, Trash2 } from 'lucide-react';
import BriefPanel from './components/BriefPanel';
import PlanView from './components/PlanView';
import PresetGallery from './components/PresetGallery';
import HomeActivityAssistant from './components/HomeActivityAssistant';
import { briefFromActivityDraft, type ActivityDraft } from './services/activityDraft';
import { recommendPlanningMode } from './planning/mode';
import { setModuleStatus } from './planning/mode';
import { aiRequest } from './services/AIService';
import { PRESETS } from './data/presets';
import {publishGameBridge,readGameResults} from './integration/gameBridge';
import './integration/game.css';
import HistoryPanel from './components/HistoryPanel';
import SettingsPanel from './components/SettingsPanel';
import { AiClarify, AiModuleAssist } from './components/AiAssist';
import RevisionBar from './components/RevisionBar';
import EmergencyPanel from './components/EmergencyPanel';
import WorkspaceHub from './workbench/WorkspaceHub';
import WelcomeGate from './projects/WelcomeGate';
import ProjectList from './projects/ProjectList';
import { projectRepository, migrateLegacyProjects, saveProjectParts } from './projects/repository';
import type { ActivityProject } from './projects/model';
import { uid } from './workbench/model';
import { saveWorkspace } from './workbench/storage';
import './projects/projects.css';
import { applyEmergency, type EmergencyId } from './rules/emergency';
import { buildPlanMarkdown, buildPromotionPost } from './rules/export';
import { editPlanRows } from './rules/editPlan';
import { editBudgetRow } from './rules/budget';
import { generatePlan } from './rules/generator';
import { type RevisionOutcome } from './rules/revise';
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
  PlanningMode,
  PlanningStatus,
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
  const [mobileMenu,setMobileMenu]=useState(false);
  const [saved, setSaved] = useState(loadLocalState);
  const [screen, setScreen] = useState<'welcome' | 'home' | 'workspace' | 'projects' | 'settings'>(() => (window.location.hash === '#settings' ? 'settings' : window.location.hash.startsWith('#workspace') ? 'workspace' : window.location.hash === '#projects' ? 'projects' : ['#home','#presets'].includes(window.location.hash) ? 'home' : 'welcome'));
  const [stage, setStage] = useState<'intake' | 'plan'>(() => (saved.data.recent ? 'plan' : 'intake'));
  const [idea, setIdea] = useState('');
  const [brief, setBrief] = useState<EventBrief | null>(saved.data.recent?.brief ?? null);
  const [plan, setPlan] = useState<EventPlan | null>(saved.data.recent ?? null);
  const [asked, setAsked] = useState<BriefFieldKey[]>([]);
  const [aiQuestions, setAiQuestions] = useState<BriefQuestion[]>([]);
  const [activeModule, setActiveModule] = useState<ModuleId>('basic');
  const [toast, setToast] = useState(saved.error ?? '');
  const [showHistory, setShowHistory] = useState(false);
  const [apiKey, setApiKey] = useState(loadApiKey);
  const [generating, setGenerating] = useState(false);
  const [assistantRequest,setAssistantRequest]=useState<{id:string;text:string}|null>(null);
  const [undoPlan, setUndoPlan] = useState<EventPlan | null>(null);
  const ideaRef = useRef<HTMLTextAreaElement>(null);
  const [projectId,setProjectId]=useState(() => window.location.hash.split('/')[1] || saved.data.recent?.id || '');
  const [showGameResults,setShowGameResults]=useState(false);
  const [projectSaveStatus,setProjectSaveStatus]=useState('');
  const [storageReady,setStorageReady]=useState(false);
  const restoringProject=useRef(false);
  const latestSave=useRef(0);
  useEffect(() => {
    let alive=true;
    void migrateLegacyProjects().then(async()=> {
      const id=window.location.hash.split('/')[1];
      if(id){const project=await projectRepository.get(id);if(project&&alive)restoreProjectState(project);else if(alive){setBrief(null);setPlan(null);setProjectId('');setProjectSaveStatus('项目不存在，请从“我的活动”重新选择。');}}
      if(alive)setStorageReady(true);
    }).catch(error=>{if(alive){setProjectSaveStatus(error.message);setStorageReady(true);}});
    return()=>{alive=false;};
  },[]);
  function restoreProjectState(project:ActivityProject) {
    restoringProject.current=true;
    if(project.workspace&&project.plan)saveWorkspace(project.workspace);
    setProjectId(project.id);setBrief(project.draft);setIdea(project.draft.idea);setPlan(project.plan??null);setStage(project.stage==='plan'&&project.plan?'plan':'intake');setAsked([]);setAiQuestions([]);setUndoPlan(null);setProjectSaveStatus(`最近保存：${new Date(project.updatedAt).toLocaleString('zh-CN')}`);
    window.setTimeout(()=>{restoringProject.current=false;},0);
  }
  function openProject(project:ActivityProject) {restoreProjectState(project);window.location.hash=`workspace/${project.id}`;setScreen('workspace');window.scrollTo(0,0);}
  async function saveCurrentProject(checkpoint=false) {
    if(!brief||!projectId||restoringProject.current)return;
    const sequence=++latestSave.current;setProjectSaveStatus('正在保存活动…');
    try {let stored=await saveProjectParts(projectId,{draft:brief,plan:plan??undefined,stage});if(checkpoint){stored=await projectRepository.update(projectId,current=>({...current!,versions:[...current!.versions,{id:uid(),createdAt:new Date().toISOString(),reason:'组织者手动保存检查点',source:'user' as const,afterFingerprint:JSON.stringify([current!.plan,current!.workspace]),before:{plan:current!.plan,draft:current!.draft,workspace:current!.workspace},afterSummary:['保存当前方案、草稿和工具资料，作为可恢复的检查点'],documentChanges:[]}].slice(-20)}));}if(sequence===latestSave.current)setProjectSaveStatus(`已保存：${new Date(stored.updatedAt).toLocaleTimeString('zh-CN')}`);}
    catch(error){if(sequence===latestSave.current)setProjectSaveStatus(error instanceof Error?error.message:'活动保存失败，请导出备份。');}
  }
  useEffect(()=>{if(storageReady&&screen==='workspace'&&projectId)window.history.replaceState(null,'',`#workspace/${projectId}`);},[storageReady,screen,projectId]);
  useEffect(()=>{if(storageReady&&screen==='workspace'&&brief&&projectId&&!restoringProject.current)void saveCurrentProject();},[storageReady,screen,brief,plan,stage,projectId]);


  useEffect(() => {
    const syncScreen = () => {
      setScreen(window.location.hash === '#settings' ? 'settings' : window.location.hash.startsWith('#workspace') ? 'workspace' : window.location.hash === '#projects' ? 'projects' : ['#home','#presets'].includes(window.location.hash) ? 'home' : 'welcome');
      const id=window.location.hash.startsWith('#workspace/')?window.location.hash.split('/')[1]:'';
      if(id&&id!==projectId)void projectRepository.get(id).then(project=>{if(project)restoreProjectState(project);});
      if (window.location.hash === '#presets') { window.requestAnimationFrame(() => document.getElementById('presets')?.scrollIntoView({ block: 'start' })); }
      else window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', syncScreen);
    return () => window.removeEventListener('hashchange', syncScreen);
  }, [projectId]);

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

  function navigateTo(next: 'welcome' | 'home' | 'workspace' | 'projects' | 'settings') {
    window.location.hash = next;
    setScreen(next);
    window.scrollTo(0, 0);
  }
  async function openGame(activityId?:string){try{await publishGameBridge();window.location.assign(`/play3d/index.html#${activityId?`import/${activityId}`:'start'}`);}catch(error){announce(error instanceof Error?error.message:'游戏数据准备失败');}}

  function startPlanning(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    const baseBrief = createBrief(trimmed);
    const nextBrief = { ...baseBrief, planningMode: recommendPlanningMode(baseBrief) };
    setProjectId(uid());
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

  function startFromAiDraft(draft: ActivityDraft) {
    const nextBrief=briefFromActivityDraft(idea.trim(),draft);
    if(nextBrief.sources.category==='assumed'){
      setProjectId(uid());setBrief(nextBrief);setPlan(null);setAsked([]);setAiQuestions([]);setStage('intake');setActiveModule('basic');navigateTo('workspace');announce('活动类型仍不明确，请先选择类型或确认使用通用框架');return;
    }
    const next={...generatePlan(nextBrief),id:uid()};
    setProjectId(next.id);setBrief(nextBrief);setPlan(next);setAsked([]);setAiQuestions([]);setStage('plan');setActiveModule('basic');persist(next,true);
    if(draft.questions.length)setAssistantRequest({id:uid(),text:draft.questions[0]});
    navigateTo('workspace');announce('AI 初稿已进入策划工作台；建议和未确定信息仍可修改');
  }

  /** 从预设模板起稿：进入需求确认，字段已按预设填好且可改 */
  function startFromPreset(presetId: string) {
    const baseBrief = createBriefFromPreset(presetId);
    const nextBrief = { ...baseBrief, planningMode: recommendPlanningMode(baseBrief) };
    setProjectId(uid());
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
    setProjectId(uid());
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
    if (brief.sources.category === 'assumed') {
      announce('请先选择活动类型，或确认使用通用框架');
      return;
    }
    if(plan){const baseline=generatePlan(plan.brief);const manual=plan.modules.some(module=>JSON.stringify(module.blocks)!==JSON.stringify(baseline.modules.find(item=>item.id===module.id)?.blocks));if(manual&&!window.confirm('重新生成会替换当前方案中的手动编辑。请先保存检查点或导出备份；确定按已确认的新需求重新生成？'))return;}
    setGenerating(true);
    const fresh = generatePlan(brief);
    const next = { ...fresh, id: projectId || plan?.id || fresh.id };
    setProjectId(next.id);
    window.history.replaceState(null,'',`#workspace/${next.id}`);
    setPlan(next);
    setStage('plan');
    setActiveModule('basic');
    persist(next);
    window.setTimeout(() => {
      setGenerating(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }, 220);
  }
  function changePlanningMode(mode:PlanningMode){if(!plan)return;const next={...plan,planningMode:mode,brief:{...plan.brief,planningMode:mode}};setPlan(next);setBrief(next.brief);persist(next,true);}
  function changeModuleStatus(id:ModuleId,status:PlanningStatus,note=''){
    if(!plan)return;
    const next=setModuleStatus(plan,id,status,note);setPlan(next);persist(next,true);
    if(status!=='ai-suggested')return;
    const module=plan.modules.find(m=>m.id===id);
    void aiRequest<{text:string}>('/api/ai/task',{task:'reviseActivity',context:{instruction:`只为“${module?.title}”提出与当前活动有关的简洁可执行建议；已有内容不可当成已确认事实。`,activity:plan.title,mode:plan.planningMode,brief:{category:plan.brief.categoryId,people:plan.brief.people,venue:plan.brief.venue,goal:plan.brief.goal},module:{title:module?.title,summary:module?.summary}}}).then(result=>{
      setPlan(current=>current?.id===plan.id&&current.moduleStates?.[id]?.status==='ai-suggested'?{...current,moduleStates:{...current.moduleStates,[id]:{...current.moduleStates[id]!,aiSuggestion:result.text}}}:current);
    }).catch(error=>{announce(error instanceof Error?error.message:'AI 服务不可用');setPlan(current=>current?.id===plan.id&&current.moduleStates?.[id]?.status==='ai-suggested'?setModuleStatus(current,id,'pending'):current);});
  }
  function decideModuleSuggestion(id:ModuleId,accept:boolean){if(!plan)return;const suggestion=plan.moduleStates?.[id]?.aiSuggestion??'';const next=setModuleStatus({...plan,modules:accept?plan.modules.map(m=>m.id===id?{...m,aiNote:suggestion}:m):plan.modules},id,accept?'confirmed':'self');if(!accept&&next.moduleStates?.[id])next.moduleStates[id]={...next.moduleStates[id],aiSuggestion:undefined};setPlan(next);persist(next,true);}

  function changeField(key: BriefFieldKey, value: string) {
    if (!brief) return;
    const next=updateField(brief,key,value);
    if(next.fieldStates?.[key])next.fieldStates={...next.fieldStates,[key]:{...next.fieldStates[key]!,status:'self',confirmed:false,updatedAt:new Date().toISOString()}};
    setBrief(next);
  }
  function changeFieldStatus(key:BriefFieldKey,status:PlanningStatus,note?:string){
    if(!brief)return;const old=brief.fieldStates?.[key];setBrief({...brief,fieldStates:{...brief.fieldStates,[key]:{...old,status,note:note??old?.note,confirmed:['existing','not-needed','confirmed'].includes(status),updatedAt:new Date().toISOString()}}});
    if(status!=='ai-suggested')return;
    void aiRequest<{text:string}>('/api/ai/task',{task:'reviseActivity',context:{instruction:`仅针对活动的“${key}”条件提出简短建议；未知值标为待确认，不编造已确定事实。`,title:brief.title,idea:brief.idea,category:brief.categoryId,people:brief.people,venue:brief.venue}}).then(result=>setBrief(current=>current?.idea===brief.idea&&current.fieldStates?.[key]?.status==='ai-suggested'?{...current,fieldStates:{...current.fieldStates,[key]:{...current.fieldStates[key]!,aiSuggestion:result.text}}}:current)).catch(error=>{announce(error instanceof Error?error.message:'AI 服务不可用');setBrief(current=>current?.fieldStates?.[key]?.status==='ai-suggested'?{...current,fieldStates:{...current.fieldStates,[key]:{...current.fieldStates[key]!,status:'pending'}}}:current);});
  }
  function decideFieldSuggestion(key:BriefFieldKey,accept:boolean){if(!brief)return;const old=brief.fieldStates?.[key];if(!old)return;setBrief({...brief,fieldStates:{...brief.fieldStates,[key]:{...old,status:accept?'confirmed':'self',confirmed:accept,note:accept?old.aiSuggestion:old.note,aiSuggestion:undefined,updatedAt:new Date().toISOString()}}});}

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
    setBrief(next.brief);
    persist(next, true);
  }

  /** 表格行编辑：任务、风险、物资等表格支持逐格改、删行、加行 */
  function updateTableRows(moduleId: ModuleId, blockIndex: number, rows: string[][]) {
    if (!plan) return;
    const next=editPlanRows(plan,moduleId,blockIndex,rows);
    setBrief(next.brief);
    setPlan(next);
    persist(next, true);
  }

  function handleEmergency(id: EmergencyId, detail: string) {
    if (!plan) return;
    setUndoPlan(plan);
    const next = applyEmergency(plan, id, detail);
    setPlan(next);
    persist(next, true);
    announce('应急调整已写入活动流程、执行安排和风险管理，可继续逐项编辑');
  }

  function undoLastChange() {
    if (!undoPlan || undoPlan.id !== plan?.id) return;
    setPlan(undoPlan);
    setBrief(undoPlan.brief);
    persist(undoPlan, true);
    setUndoPlan(null);
    announce('已撤销上次调整');
  }

  async function applyRevision(text: string): Promise<RevisionOutcome | null> {
    if(!plan)return null;
    setAssistantRequest({id:uid(),text});
    return {changes:[],impacts:['已在策划助手打开修改建议预览，确认后才更新方案。'],previewOnly:true};
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
    setProjectId(target.id);
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
    if (!window.confirm('清除旧版方案记录与收藏？新的活动项目、附件和工具资料不会删除，可在“我的活动”中管理。')) return;
    clearLocalState();
    setSaved({ data: { recent: null, favorites: [], history: [] }, error: null });
    setPlan(null);
    setBrief(null);
    setStage('intake');
    setShowHistory(false);
    navigateTo('home');
    announce('旧方案记录已清除，活动项目与附件保留');
  }

  function applyStageAI(moduleId:ModuleId,text:string,items:string[],conversation:{question:string;answer:string}[],fields:Partial<Record<'title'|'people'|'budget'|'duration'|'date'|'venue'|'venueNote'|'goal'|'audience'|'constraints',string|number>>){
    if(!plan)return;
    const original=plan.brief.aiDraft??{flow:[],staff:[],materials:[],features:[],questions:[]};
    let nextBrief:EventBrief={...plan.brief,aiDraft:{...original,stageAnswers:{...original.stageAnswers,[moduleId]:conversation}}};
    for(const [key,value] of Object.entries(fields)){
      const input=String(value).trim();if(!input)continue;
      if(['people','budget','duration'].includes(key)&&(!Number.isFinite(Number(input))||Number(input)<(key==='budget'?0:1)))throw Error('请核对 AI 草稿中的人数、预算或时长');
      if(key==='date'&&!/^\d{4}-\d{2}-\d{2}$/.test(input))throw Error('请使用 YYYY-MM-DD 格式填写活动日期');
      if(key==='venueNote')nextBrief={...nextBrief,venueNote:input.slice(0,120)};
      else nextBrief=updateField(nextBrief,key as BriefFieldKey,input);
    }
    nextBrief=refreshBrief(nextBrief);
    const baseline=generatePlan(plan.brief),fresh=generatePlan(nextBrief);
    const modules=plan.modules.map(module=>{
      const before=baseline.modules.find(item=>item.id===module.id),after=fresh.modules.find(item=>item.id===module.id);
      const aiBlocks=module.blocks.filter(block=>block.kind==='bullets'&&block.title==='AI 建议（组织者已确认）');
      const authoredBlocks=module.blocks.filter(block=>!(block.kind==='bullets'&&block.title==='AI 建议（组织者已确认）'));
      const untouched=JSON.stringify(authoredBlocks)===JSON.stringify(before?.blocks);
      let updated=untouched&&after?{...module,blocks:[...after.blocks,...aiBlocks],summary:after.summary}:module;
      if(!untouched&&JSON.stringify(before?.blocks)!==JSON.stringify(after?.blocks))updated={...updated,aiNote:'基础信息已变化；本阶段含手工内容，原内容已保留，请核对。'};
      if(module.id===moduleId)updated={...updated,aiNote:text,blocks:[...updated.blocks.filter(block=>!(block.kind==='bullets'&&block.title==='AI 建议（组织者已确认）')),...(items.length?[{kind:'bullets' as const,title:'AI 建议（组织者已确认）',items}]:[])]};
      return updated;
    });
    const next=setModuleStatus({...plan,brief:nextBrief,modules,title:fresh.title,oneLiner:fresh.oneLiner,scale:fresh.scale,assumptions:fresh.assumptions},moduleId,'confirmed');
    setPlan(next);setBrief(nextBrief);persist(next,true);
  }

  return <div className="shell">
    <header className="topbar">
      <a className="brand" href="#home" onClick={() => navigateTo('home')}>
        <img className="brand-mark" src="/images/activity-lab-logo-v2.png" alt=""/>
        <span>通用策划<br/><strong>活动实验室</strong></span>
      </a>
      <button className="mobile-menu-toggle" aria-label={mobileMenu?'关闭导航菜单':'打开导航菜单'} aria-expanded={mobileMenu} aria-controls="main-actions" onClick={()=>setMobileMenu(!mobileMenu)}>{mobileMenu?<X size={22}/>:<Menu size={22}/>}</button>
      <div id="main-actions" className={`top-right ${mobileMenu?'mobile-open':''}`} onClick={()=>setMobileMenu(false)}>
        <button className="project-list-link" onClick={() => navigateTo('projects')}>我的活动</button>
        <button className="project-list-link" onClick={() => void openGame()}>3D 世界</button>
        <span className="tag">GENERAL EVENT PLANNER</span>
        <button className="settings-trigger" onClick={() => navigateTo('settings')}>
          <Settings size={17}/> 设置{apiKey ? <span className="settings-dot" aria-label="已设置 API Key"/> : null}
        </button>
        <button className="record-trigger" onClick={() => setShowHistory(true)}>
          <History size={17}/> 方案记录 <span>{saved.data.history.length}</span>
        </button>
        <button className="subtle" onClick={resetData} title="清除旧方案记录，不删除活动项目和附件"><Trash2 size={16}/> 清除旧记录</button>
      </div>
    </header>

    <main id="home" className={screen === 'home' || screen === 'welcome' ? 'home-page' : 'workspace-page'}>
      {screen === 'settings' && <SettingsPanel onClose={() => navigateTo(projectId?'workspace':'home')} onKeyChange={setApiKey}/>}
      {screen === 'projects' && <ProjectList onCreate={() => navigateTo('home')} onOpen={openProject} onRemoved={id=>{if(id===projectId){setProjectId('');setBrief(null);setPlan(null);}setSaved(loadLocalState());}}/>}
      {screen === 'welcome' && <WelcomeGate onEnter={() => navigateTo('home')} onProjects={() => navigateTo('projects')}/>}

      {screen === 'home' && <section className="hero hero-input">
        <div className="hero-copy">
          <div className="eyebrow"><span className="pulse"/> ANY EVENT, PLANNED</div>
          <h1>什么活动都能策划，<br/><em>从一句话开始。</em></h1>
          <p>一句话说出你的想法。小型聚会轻松安排，大型活动完整策划。</p>
          <HomeActivityAssistant idea={idea} onIdea={setIdea} onManual={startPlanning} onConfirm={startFromAiDraft} ideaRef={ideaRef}/>
          <div className="idea-examples" aria-label="示例活动">
            {EXAMPLES.map((example) => <button key={example} type="button" onClick={() => {setIdea(example);ideaRef.current?.focus();}}>{example}</button>)}
          </div>
          {saved.data.recent && <button className="resume-card" type="button" onClick={resumeLast}>
            <span className="mini-label">上次的方案</span>
            <strong>{saved.data.recent.title}</strong>
            <small><Clock3 size={13}/> {new Date(saved.data.recent.createdAt).toLocaleDateString('zh-CN')} · {saved.data.recent.brief.people} 人</small>
            <ArrowRight size={18}/>
          </button>}
          <div className="hero-stats">
            <span><strong>12</strong> 个策划模块</span>
            <span><strong>{CATEGORIES.length}</strong> 类活动</span>
            <span><strong>{PRESETS.length}</strong> 个预设模板</span>
          </div>
          <a className="hero-preset-link" href="#presets">没有头绪？浏览活动模板 ↓</a>
        </div>
        <div className="hero-side"><div className="hero-art" aria-hidden="true"><div className="orbit orbit-one"/><div className="orbit orbit-two"/><div className="art-core">PLAN<br/>IT<br/>WELL<span>✳</span></div><span className="floating f1">✦ 灵感</span><span className="floating f2">⏱ 计划</span><span className="floating f3">↗ 执行</span></div><button className="game-home-entry" type="button" onClick={()=>void openGame()}><strong>3D 活动模拟游戏</strong><span>搭建场地、配置人员，观察活动如何运行</span><b>进入 3D 世界 →</b></button></div>
      </section>}

      {screen === 'home' && <PresetGallery
        onPreset={startFromPreset}
        onCategory={startFromCategory}
        onCustom={() => {
          window.scrollTo({ top: 0, behavior: 'smooth' });
          window.setTimeout(() => ideaRef.current?.focus(), 320);
        }}
      />}

      {screen === 'workspace' && !storageReady && <div className="project-page panel" role="status">正在恢复活动项目…</div>}
      {screen === 'workspace' && storageReady && <section id="workspace" className="workspace">
        <div className="draft-save-strip"><button onClick={() => navigateTo('projects')}>返回我的活动</button><button onClick={() => void saveCurrentProject(true)} disabled={!brief || !projectId}>保存活动</button>{plan&&<><button onClick={()=>void openGame(plan.id)}>进入 3D 模拟</button><button onClick={()=>setShowGameResults(v=>!v)}>模拟记录（{readGameResults(plan.id).length}）</button></>}<span role="status">{projectSaveStatus}</span></div>
        {plan&&showGameResults&&<section className="game-results"><h2>3D 模拟记录</h2>{readGameResults(plan.id).map(run=><article key={run.simulationId}><strong>{new Date(run.at).toLocaleString('zh-CN')}</strong><span>到场 {run.attendance} 人 · 模拟支出 ¥{run.budgetUsed} · 与原预算差额 {run.budgetVariance>=0?'+':''}¥{run.budgetVariance} · 满意度 {Math.round(run.satisfaction)}</span><small>延误 {run.delay} 分钟 · 事件 {run.incidents.length} 项 · 完成任务 {run.completedTasks.length} 项</small></article>)}{!readGameResults(plan.id).length&&<p>尚无完成的 3D 模拟。</p>}</section>}
        <div className={`workspace-head ${stage === 'plan' ? 'workspace-head-compact' : ''}`}>
          <div>
            <button className="workspace-back" onClick={() => navigateTo('home')}><ArrowLeft size={16}/> 返回首页</button>
            <div className="eyebrow dark">{stage === 'intake' ? '准备 / 需求确认' : '活动策划工作区'}</div>
            <h2>{stage === 'intake' ? '确认需求，生成方案' : '策划方案'}</h2>
            <p>{stage === 'intake' ? '关键信息一屏确认；没填的我已经按同类活动补上了假设。' : '12 个模块已按活动性质排好权重，可直接执行或继续调整。'}</p>
            {stage === 'intake' && idea && <p className="idea-recap"><FileText size={14}/> 你的描述：「{idea}」</p>}
          </div>

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
            onFieldStatus={changeFieldStatus}
            onFieldDecision={decideFieldSuggestion}
            onReset={() => { setStage('intake'); setBrief(null); setPlan(null); setIdea(''); navigateTo('home'); }}
            generating={generating}
            aiSlot={idea ? <AiClarify idea={idea} brief={brief} apiKey={apiKey} onQuestions={(items) => setAiQuestions(items)}/> : undefined}
          />
        </div>}

        {stage === 'plan' && plan && <WorkspaceHub key={plan.id} plan={plan} apiKey={apiKey} onOpenGame={()=>void openGame(plan.id)} assistantRequest={assistantRequest} onRestoreProject={openProject} onPlanChange={next=>{setPlan(next);setBrief(next.brief);persist(next,true);}} onStageStatus={changeModuleStatus} onSelectModule={setActiveModule} onCheckpoint={()=>projectRepository.update(plan.id,current=>({...current!,versions:[...current!.versions,{id:uid(),createdAt:new Date().toISOString(),reason:'重新编辑策划阶段',source:'user' as const,before:{plan:current!.plan,draft:current!.draft,workspace:current!.workspace},afterSummary:['保留阶段修改前版本'],afterFingerprint:JSON.stringify([current!.plan,current!.workspace]),documentChanges:[]}].slice(-20)}))} onStageAiConfirm={applyStageAI}><PlanView
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
          onPlanMeta={patch=>{const next={...plan,...patch,brief:patch.title!==undefined?{...plan.brief,title:patch.title,sources:{...plan.brief.sources,title:'user' as const}}:plan.brief};setPlan(next);setBrief(next.brief);persist(next,true);}}
          onModuleMeta={(moduleId,patch)=>{const next={...plan,modules:plan.modules.map(module=>module.id===moduleId?{...module,...patch}:module)};setPlan(next);persist(next,true);}}
          onBlockTitle={(moduleId,index,title)=>{const next={...plan,modules:plan.modules.map(module=>module.id===moduleId?{...module,blocks:module.blocks.map((block,i)=>i===index&&block.kind!=='text'?{...block,title}:block)}:module)};setPlan(next);persist(next,true);}}
          onModeChange={changePlanningMode}
          onModuleStatus={changeModuleStatus}
          onAiDecision={decideModuleSuggestion}
          revisionPanel={<>
            {undoPlan?.id === plan.id && <button className="text-button" onClick={undoLastChange}>撤销上次调整（恢复调整前版本）</button>}
            <RevisionBar onRevise={applyRevision}/>
            <EmergencyPanel onApply={handleEmergency}/>
          </>}
          aiPanel={<AiModuleAssist plan={plan} moduleId={activeModule} apiKey={apiKey} onApply={applyAiModule}/>}
        /></WorkspaceHub>}

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
    {toast && (loadPreferences().reminders||/失败|错误|异常/.test(toast)) && <div className="toast" role="status">{toast}</div>}
  </div>;
}
