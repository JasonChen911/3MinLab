import { useMemo, useState, type ReactNode } from 'react';
import {
  AlertTriangle, ArrowRight, Box, Building2, CalendarDays, CheckCircle2, ChevronRight,
  ClipboardList, Download, ExternalLink, FileText, MapPin, Package, Plus, ShieldAlert,
  Sparkles, Trash2, UserPlus, Users, Wallet,
} from 'lucide-react';
import type { EventPlan, PlanningMode } from '../types';
import { uid, type Person, type RiskItem, type WorkGroup, type WorkGroupTask, type Workspace } from './model';
import { createWorkGroup, createGroupTask, recommendedGroupNames } from './workgroups';
import { SCENES } from './registry';
import {
  budgetSummary, departmentName, ensureCenterTables, flattenTasks,
  importPlanBudget, parseAmount, recommendCenterMode, riskLevel, risksFromPlan, scheduleIssues,
  TASK_PRIORITIES, TASK_STATUSES, taskIssues, type CenterExportKind, type CenterIssue,
} from './center';
import { aiRequest } from '../services/AIService';
import './center.css';

const money = (value: number | null) => value === null ? '待填写' : `¥${Number(value).toLocaleString()}`;
const MAX_REASONS = 4;

function commitAsync(commit: (next: Workspace, reason?: string) => Promise<boolean>, next: Workspace, reason?: string) {
  void commit(next, reason);
}

function Field({ label, children, wide = false }: { label: string; children: ReactNode; wide?: boolean }) {
  return <label className={wide ? 'oc-field oc-field-wide' : 'oc-field'}><span>{label}</span>{children}</label>;
}

function SectionHead({ title, desc, actions }: { title: string; desc?: string; actions?: ReactNode }) {
  return <div className="oc-section-head"><div><h2>{title}</h2>{desc && <p>{desc}</p>}</div>{actions && <div className="oc-actions">{actions}</div>}</div>;
}

function Notice({ tone = 'info', children }: { tone?: 'info' | 'warn' | 'error' | 'success' | 'ai'; children: ReactNode }) {
  return <div className={`oc-notice oc-${tone}`} role={tone === 'error' ? 'alert' : 'status'}>{children}</div>;
}

function Empty({ title, desc, action }: { title: string; desc: string; action?: ReactNode }) {
  return <div className="oc-empty"><strong>{title}</strong><p>{desc}</p>{action}</div>;
}

const statusTone = (status: string) =>
  status === '已完成' ? 'green' : status === '进行中' ? 'blue' : status === '遇到问题' ? 'red' : status === '已取消' ? 'gray' : status === '已延期' ? 'orange' : 'gray';

function StatusChip({ status }: { status: string }) {
  return <span className={`oc-chip oc-chip-${statusTone(status)}`}>{status}</span>;
}

function PriorityChip({ value }: { value?: string }) {
  const priority = value ?? '中';
  return <span className={`oc-chip oc-chip-${priority === '高' ? 'red' : priority === '低' ? 'gray' : 'orange'}`}>{priority}优先</span>;
}

function IssueList({ issues }: { issues: CenterIssue[] }) {
  if (!issues.length) return null;
  const errors = issues.filter(issue => issue.level === 'error').length;
  return <details className="oc-issues" open={errors > 0}>
    <summary><AlertTriangle size={15}/>{errors ? `${errors} 个需要处理的问题` : `${issues.length} 条检查提醒`}<span>{errors ? '红色为阻断项' : '橙色为提醒'}</span></summary>
    <ul>{issues.map(issue => <li key={issue.id} className={issue.level === 'error' ? 'is-error' : 'is-warning'}>{issue.message}</li>)}</ul>
  </details>;
}

function ModeSwitch({ plan, onPlanChange }: { plan: EventPlan; onPlanChange?: (plan: EventPlan) => void }) {
  const mode = plan.planningMode ?? plan.brief.planningMode ?? 'full';
  const change = (next: PlanningMode) => onPlanChange?.({ ...plan, planningMode: next, brief: { ...plan.brief, planningMode: next } });
  return <div className="oc-mode-switch" role="group" aria-label="活动复杂度模式">
    <button type="button" className={mode === 'light' ? 'active' : ''} onClick={() => change('light')}><span>轻量活动</span><small>小型聚会 · 简单分工</small></button>
    <button type="button" className={mode === 'full' ? 'active' : ''} onClick={() => change('full')}><span>专业组织</span><small>多部门 · 任务与风险</small></button>
  </div>;
}

interface CenterProps {
  plan: EventPlan;
  data: Workspace;
  commit: (next: Workspace, reason?: string) => Promise<boolean>;
  onModule: (id: string) => void;
  onPlanChange?: (plan: EventPlan) => void;
  onOpenGame?: () => void;
  onExport: (kind: CenterExportKind, format: 'docx' | 'xlsx' | 'pdf') => Promise<void>;
  onBackup: () => void;
  busy: string;
}

export default function OrganizationCenter({ plan, data, commit, onModule, onPlanChange, onOpenGame }: CenterProps) {
  const mode = plan.planningMode ?? plan.brief.planningMode ?? 'full';
  const tasks = flattenTasks(data);
  const issues = useMemo(() => taskIssues(data), [data]);
  const schedule = useMemo(() => scheduleIssues(data.flow), [data.flow]);
  const budget = useMemo(() => budgetSummary(plan, data), [plan, data]);
  const recommendation = useMemo(() => recommendCenterMode(plan, data), [plan, data]);
  const done = tasks.filter(item => item.task.status === '已完成').length;
  const profile = data.profile;
  const nextSteps = [
    !profile.owner ? '指定活动总负责人，后续任务和风险都需要明确责任人。' : '',
    !(data.workGroups ?? []).length ? '建立第一个工作组；小型活动也可以只设一个执行组。' : '',
    tasks.some(item => !item.task.owner.trim()) ? '为缺少负责人的任务指定人员。' : '',
    issues.some(issue => issue.level === 'error') ? `处理 ${issues.filter(issue => issue.level === 'error').length} 个任务阻断项。` : '',
    schedule.some(issue => issue.level === 'error') ? '修正活动日程时间冲突。' : '',
    budget.missingPrice ? `${budget.missingPrice} 项支出尚未填写价格，预算合计暂不完整。` : '',
    !data.risks?.length && mode === 'full' ? '大型活动建议启用风险管理，先导入或生成风险清单。' : '',
  ].filter(Boolean) as string[];

  return <div className="oc-content">
    {mode === 'light' && <Notice tone="info">当前为轻量模式：只保留活动信息、人员分工、日程和必要预算。需要多部门协同时可随时切换专业组织。</Notice>}
    <section className="oc-panel">
      <SectionHead title="活动总览" desc="先确认活动目标和负责人，再处理组织、任务与预算。" actions={<>
        <button className="oc-btn" type="button" onClick={() => onModule('organization')}><Users size={16}/>组织架构</button>
        {plan && onOpenGame && <button className="oc-btn oc-btn-blue" type="button" onClick={onOpenGame}><Box size={16}/>进入 3D 场地</button>}
      </>}/>
      <div className="oc-overview-grid">
        <div className="oc-info-block">
          <div className="oc-info-row"><span>活动类型</span><strong>{plan.brief.categoryId || '待确认'} · {data.scene}</strong></div>
          <div className="oc-info-row"><span>时间</span><strong>{plan.brief.dateLabel || plan.brief.date || '日期待确认'} · {plan.brief.durationMinutes} 分钟{plan.brief.days > 1 ? ` × ${plan.brief.days} 天` : ''}</strong></div>
          <div className="oc-info-row"><span>地点</span><strong>{profile.location || plan.brief.venueNote || '地点待确认'}</strong></div>
          <div className="oc-info-row"><span>参与人数</span><strong>{plan.brief.people} 人</strong></div>
          <div className="oc-info-row"><span>预算</span><strong>¥{plan.brief.budget.toLocaleString()}</strong></div>
          <div className="oc-info-row"><span>活动目标</span><strong>{plan.brief.goal || '目标待补充'}</strong></div>
        </div>
        <div className="oc-metric-grid">
          <div className="oc-metric"><span>部门</span><strong>{(data.workGroups ?? []).length}</strong><small>负责人 {profile.owner ? '已设置' : '待设置'}</small></div>
          <div className="oc-metric"><span>任务完成</span><strong>{done}/{tasks.length}</strong><small>{issues.filter(issue => issue.level === 'error').length} 个阻断项</small></div>
          <div className="oc-metric"><span>预算使用</span><strong>{money(budget.actual)}</strong><small>计划 {money(budget.planned)}</small></div>
          <div className="oc-metric"><span>风险</span><strong>{(data.risks ?? []).length}</strong><small>{mode === 'light' ? '轻量模式可不启用' : '专业模式建议维护'}</small></div>
        </div>
      </div>
    </section>

    <section className="oc-panel">
      <SectionHead title="活动基本信息" desc="这些信息会同步到人员、预算、风险、导出和 3D 场景，不需要重复填写。"/>
      <div className="oc-form-grid">
        <Field label="活动名称"><input value={plan.title} onChange={event => onPlanChange?.({ ...plan, title: event.target.value, brief: { ...plan.brief, title: event.target.value, sources: { ...plan.brief.sources, title: 'user' as const } } })}/></Field>
        <Field label="当前状态"><select value={profile.status} onChange={event => commitAsync(commit, { ...data, profile: { ...profile, status: event.target.value } })}>{['草稿', '筹备中', '报名中', '即将举行', '进行中', '已结束', '已归档', '已取消'].map(value => <option key={value}>{value}</option>)}</select></Field>
        <Field label="主办单位"><input value={profile.organizer} onChange={event => commitAsync(commit, { ...data, profile: { ...profile, organizer: event.target.value } })}/></Field>
        <Field label="承办单位"><input value={profile.coorganizer} onChange={event => commitAsync(commit, { ...data, profile: { ...profile, coorganizer: event.target.value } })}/></Field>
        <Field label="总负责人"><input value={profile.owner} onChange={event => commitAsync(commit, { ...data, profile: { ...profile, owner: event.target.value } })}/></Field>
        <Field label="总协调人"><input value={profile.coordinator ?? ''} onChange={event => commitAsync(commit, { ...data, profile: { ...profile, coordinator: event.target.value } })}/></Field>
        <Field label="具体地点"><input value={profile.location} onChange={event => commitAsync(commit, { ...data, profile: { ...profile, location: event.target.value } })}/></Field>
        <Field label="开始时间"><input type="time" value={data.tables['activity-settings']?.rows[0]?.startTime ?? ''} onChange={event => {
          const settings = data.tables['activity-settings'];
          commitAsync(commit, { ...data, tables: { ...data.tables, 'activity-settings': { id: 'activity-settings', name: '活动执行设置', fields: [{ key: 'startTime', label: '开始时间' }], rows: [{ id: 'settings', startTime: event.target.value }], revision: (settings?.revision ?? 0) + 1 } } });
        }}/></Field>
        <Field label="专属工具场景"><select value={data.scene} onChange={event => commitAsync(commit, { ...data, scene: event.target.value as Workspace['scene'] })}>{SCENES.map(scene => <option key={scene.id} value={scene.id}>{scene.name}</option>)}</select></Field>
      </div>
      <div className="oc-inline-note">人数、时长和预算由策划方案确定：<button type="button" className="oc-link" onClick={() => onModule('plan')}>打开策划方案 <ArrowRight size={13}/></button></div>
    </section>

    <section className="oc-panel">
      <SectionHead title="工作方式" desc="根据组织复杂度和资源规模选择，不只看参与人数。"/>
      <ModeSwitch plan={plan} onPlanChange={onPlanChange}/>
      <Notice tone="ai">系统建议：{recommendation.mode === 'professional' ? '专业组织模式' : '轻量活动模式'}。依据：{recommendation.reasons.slice(0, MAX_REASONS).join('、')}。{recommendation.mode === 'professional' && mode === 'light' ? ' 建议开启部门、任务依赖与风险管理。' : ''}</Notice>
    </section>

    <section className="oc-panel">
      <SectionHead title="下一步" desc="按影响大小排序，完成后自动减少。"/>
      {nextSteps.length ? <ul className="oc-next-list">{nextSteps.slice(0, 6).map(step => <li key={step}><ChevronRight size={15}/><span>{step}</span></li>)}</ul> : <Notice tone="success"><CheckCircle2 size={15}/> 当前没有阻断性遗留项，可以继续核对预算和导出资料。</Notice>}
      <div className="oc-quick-grid">
        <button type="button" onClick={() => onModule('tasks')}><ClipboardList size={18}/><span>分配任务</span><small>{tasks.length} 项</small></button>
        <button type="button" onClick={() => onModule('schedule')}><CalendarDays size={18}/><span>编排日程</span><small>{data.flow.length} 个环节</small></button>
        <button type="button" onClick={() => onModule('budget')}><Wallet size={18}/><span>核对预算</span><small>{budget.missingPrice ? `${budget.missingPrice} 项待补价` : '价格已填写'}</small></button>
        <button type="button" onClick={() => onModule('exports')}><Download size={18}/><span>导出资料</span><small>统一数据源</small></button>
      </div>
    </section>
  </div>;
}

export function OrganizationPanel({ plan, data, commit, onModule }: Pick<CenterProps, 'plan' | 'data' | 'commit' | 'onModule'>) {
  const groups = data.workGroups ?? [];
  const [selected, setSelected] = useState(groups[0]?.id ?? '');
  const [name, setName] = useState('');
  const [personName, setPersonName] = useState('');
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [draft, setDraft] = useState<{ name: string; goal: string; duties: string; leader: string; tasks: { title: string; owner: string; due: string; priority: string }[] }[]>([]);
  const group = groups.find(item => item.id === selected) ?? groups[0];
  const mode = plan.planningMode ?? plan.brief.planningMode ?? 'full';
  const write = (next: WorkGroup[], reason?: string) => commitAsync(commit, { ...data, workGroups: next }, reason);
  const change = (patch: Partial<WorkGroup>) => {
    if (!group) return;
    write(groups.map(item => item.id === group.id ? { ...item, ...patch } : item));
  };
  const addGroup = (value: string) => {
    const title = value.trim();
    if (!title || groups.some(item => item.name === title)) return;
    const next = createWorkGroup(title);
    write([...groups, next], '新建工作组');
    setSelected(next.id);
    setName('');
  };
  const recommend = () => {
    const missing = recommendedGroupNames(plan).filter(title => !groups.some(item => item.name === title)).map(createWorkGroup);
    if (!missing.length) { setMessage('推荐的工作组都已存在。'); return; }
    write([...groups, ...missing], '采用推荐工作组');
    setSelected(missing[0].id);
    setMessage(`已加入 ${missing.length} 个建议工作组，可继续调整。`);
  };
  async function aiRecommend() {
    setBusy('AI 正在设计组织架构…'); setMessage('');
    try {
      const response = await aiRequest<{ text: string }>('/api/ai/task', {
        task: 'recommendStaff',
        context: {
          instruction: '只输出 JSON 数组，不要 Markdown。每项包含 name、goal、duties、leader、tasks；tasks 为对象数组，包含 title、owner、due（YYYY-MM-DD 或空）、priority（高/中/低）。根据活动规模和类型给出确实需要的部门，不要编造已确定人员。',
          activity: plan.title, category: plan.brief.categoryId, people: plan.brief.people, budget: plan.brief.budget,
          date: plan.brief.date, venue: plan.brief.venueNote, duration: plan.brief.durationMinutes, scene: data.scene,
          existing: groups.map(item => item.name),
        },
      });
      const parsed = JSON.parse(response.text.replace(/^```(?:json)?|```$/g, '').trim());
      if (!Array.isArray(parsed)) throw new Error('AI 返回格式不正确');
      const next = parsed.slice(0, 12).filter(item => typeof item?.name === 'string' && item.name.trim()).map(item => ({
        name: String(item.name).slice(0, 40),
        goal: typeof item.goal === 'string' ? item.goal.slice(0, 200) : '',
        duties: typeof item.duties === 'string' ? item.duties.slice(0, 300) : '',
        leader: typeof item.leader === 'string' ? item.leader.slice(0, 40) : '',
        tasks: Array.isArray(item.tasks) ? item.tasks.filter((task: unknown) => typeof (task as { title?: unknown })?.title === 'string').slice(0, 12).map((task: { title: string; owner?: string; due?: string; priority?: string }) => ({ title: task.title.slice(0, 80), owner: task.owner?.slice(0, 40) ?? '', due: /^\d{4}-\d{2}-\d{2}$/.test(task.due ?? '') ? task.due! : '', priority: task.priority === '高' || task.priority === '低' ? task.priority : '中' })) : [],
      }));
      if (!next.length) throw new Error('AI 没有返回可用部门');
      setDraft(next);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'AI 组织建议失败，原有部门未修改。');
    } finally { setBusy(''); }
  }
  function applyDraft() {
    const next = [...groups];
    for (const item of draft) {
      const index = next.findIndex(groupItem => groupItem.name === item.name);
      const base = index >= 0 ? next[index] : { ...createWorkGroup(item.name), goal: item.goal, duties: item.duties, leader: item.leader, tasks: [] };
      const existingTitles = new Set(base.tasks.map(task => task.title));
      const tasks = [...base.tasks];
      for (const task of item.tasks) {
        if (existingTitles.has(task.title)) continue;
        tasks.push({ ...createGroupTask(), title: task.title, owner: task.owner, due: task.due, priority: task.priority as WorkGroupTask['priority'] });
        existingTitles.add(task.title);
      }
      const updated = { ...base, tasks };
      if (index >= 0) next[index] = updated;
      else next.push(updated);
    }
    write(next, '采用 AI 组织架构建议');
    setDraft([]);
    setMessage('AI 建议已写入，可继续修改负责人和任务。');
  }
  function toggleMember(person: Person) {
    if (!group) return;
    const names = group.members.split(/[,，、\n]/).map(value => value.trim()).filter(Boolean);
    const next = names.includes(person.name) ? names.filter(value => value !== person.name) : [...names, person.name];
    change({ members: next.join('、') });
  }
  function addPerson() {
    const value = personName.trim();
    if (!value) return;
    const person: Person = { id: uid(), name: value, roles: ['工作人员'], fields: {} };
    commitAsync(commit, { ...data, people: [...data.people, person] });
    setPersonName('');
  }
  const issues = taskIssues(data);
  return <div className="oc-content">
    <section className="oc-panel">
      <SectionHead title="组织架构" desc="总负责人负责结果，总协调人负责跨部门推进；部门可以自由增删。" actions={<>
        <button className="oc-btn" type="button" onClick={recommend}><Users size={16}/>按活动推荐</button>
        <button className="oc-btn oc-btn-ai" type="button" disabled={!!busy} onClick={() => void aiRecommend()}><Sparkles size={16}/>AI 设计架构</button>
      </>}/>
      <div className="oc-org-chart">
        <div className="oc-org-top"><Building2 size={18}/><div><span>总负责人</span><strong>{data.profile.owner || '待指定'}</strong></div><div><span>总协调人</span><strong>{data.profile.coordinator || '待指定'}</strong></div></div>
        {groups.length ? <div className="oc-org-groups">{groups.map(item => <button key={item.id} type="button" className={group?.id === item.id ? 'active' : ''} onClick={() => setSelected(item.id)}><strong>{item.name}</strong><small>{item.leader || '负责人待定'} · {item.tasks.length} 项任务</small>{item.reportsTo ? <em>汇报：{departmentName(data, item.reportsTo)}</em> : <em>汇报：总协调人</em>}</button>)}</div> : <Notice tone="warn">还没有部门。小型活动可以先建一个“执行组”，大型活动建议按统筹、场地、后勤、安全等拆分。</Notice>}
      </div>
      {mode === 'light' && groups.length > 1 && <Notice tone="warn">轻量模式通常不需要多级组织；当前已有 {groups.length} 个部门，建议切换专业组织模式以启用汇报关系和任务依赖。</Notice>}
      {busy && <Notice tone="ai">{busy}</Notice>}
      {message && <Notice tone="info">{message}</Notice>}
      {draft.length > 0 && <div className="oc-draft"><div className="oc-draft-head"><strong>AI 组织建议 · 尚未写入</strong><div><button className="oc-btn oc-btn-primary" type="button" onClick={applyDraft}>采用并编辑</button><button className="oc-btn" type="button" onClick={() => setDraft([])}>放弃</button></div></div><ul>{draft.map(item => <li key={item.name}><strong>{item.name}</strong><span>{item.tasks.length} 项任务 · 负责人 {item.leader || '待定'}</span></li>)}</ul></div>}
      <div className="oc-create-row"><input aria-label="新部门名称" placeholder="新部门 / 工作组名称" value={name} onChange={event => setName(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') addGroup(name); }}/><button className="oc-btn oc-btn-primary" type="button" onClick={() => addGroup(name)}><Plus size={15}/>新建部门</button></div>
    </section>

    {group && <section className="oc-panel">
      <SectionHead title={group.name} desc="部门职责、成员和汇报关系保存在同一份组织数据中。" actions={<button className="oc-btn oc-btn-danger" type="button" onClick={() => { if (window.confirm(`删除「${group.name}」及其 ${group.tasks.length} 项任务？`)) { write(groups.filter(item => item.id !== group.id), '删除工作组'); setSelected(''); } }}><Trash2 size={15}/>删除部门</button>}/>
      <div className="oc-form-grid">
        <Field label="部门名称"><input value={group.name} onChange={event => change({ name: event.target.value })}/></Field>
        <Field label="部门负责人"><input list="oc-people" value={group.leader} onChange={event => change({ leader: event.target.value })}/></Field>
        <Field label="汇报对象"><select value={group.reportsTo ?? ''} onChange={event => change({ reportsTo: event.target.value })}><option value="">总协调人</option>{groups.filter(item => item.id !== group.id).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
        <Field label="联系方式"><input value={group.contact} onChange={event => change({ contact: event.target.value })}/></Field>
        <Field label="部门职责" wide><textarea rows={3} value={group.duties} onChange={event => change({ duties: event.target.value })} placeholder="这个部门负责什么、对谁交付"/></Field>
        <Field label="工作目标" wide><textarea rows={2} value={group.goal} onChange={event => change({ goal: event.target.value })}/></Field>
      </div>
      {mode === 'full' && <details className="oc-advanced"><summary>汇报与协作机制</summary><Field label="汇报方式与节奏"><input value={group.reporting} onChange={event => change({ reporting: event.target.value })} placeholder="例如：每日 18:00 向总协调人书面同步"/></Field></details>}
      <div className="oc-member-head"><h3>部门成员</h3><span>{group.members.split(/[,，、\n]/).filter(Boolean).length} 人</span></div>
      <div className="oc-member-input"><input aria-label="成员姓名，用顿号分隔" value={group.members} onChange={event => change({ members: event.target.value })} placeholder="张同学、李同学"/><datalist id="oc-people">{data.people.map(person => <option key={person.id} value={person.name}/>)}</datalist></div>
      {data.people.length > 0 && <div className="oc-person-chips">{data.people.map(person => <button key={person.id} type="button" className={group.members.includes(person.name) ? 'active' : ''} onClick={() => toggleMember(person)}>{person.name}<small>{person.roles.join('、')}</small></button>)}</div>}
      {!data.people.length && <div className="oc-create-row"><input aria-label="登记人员姓名" placeholder="登记人员姓名" value={personName} onChange={event => setPersonName(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') addPerson(); }}/><button className="oc-btn" type="button" onClick={addPerson}><UserPlus size={15}/>加入人员名单</button></div>}
      <div className="oc-inline-note"><button className="oc-link" type="button" onClick={() => onModule('tasks')}>查看全部任务 <ArrowRight size={13}/></button>{issues.filter(issue => issue.groupId === group.id).length > 0 && <span> · 本部门有 {issues.filter(issue => issue.groupId === group.id).length} 条任务提醒</span>}</div>
    </section>}
  </div>;
}

export function TasksPanel({ plan, data, commit }: Pick<CenterProps, 'plan' | 'data' | 'commit'>) {
  const groups = data.workGroups ?? [];
  const tasks = flattenTasks(data);
  const issues = useMemo(() => taskIssues(data), [data]);
  const [query, setQuery] = useState('');
  const [department, setDepartment] = useState('全部');
  const [status, setStatus] = useState('全部');
  const [owner, setOwner] = useState('全部');
  const [open, setOpen] = useState('');
  const [title, setTitle] = useState('');
  const [targetGroup, setTargetGroup] = useState(groups[0]?.id ?? '');
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [draft, setDraft] = useState<{ ids: string[]; tasks: { department: string; title: string; owner: string; due: string; priority: string; content: string }[] } | null>(null);
  const owners = [...new Set(tasks.map(item => item.task.owner).filter(Boolean))];
  const filtered = tasks.filter(({ group, task }) => {
    if (department !== '全部' && group.id !== department) return false;
    if (status !== '全部' && task.status !== status) return false;
    if (owner !== '全部' && task.owner !== owner) return false;
    if (query && !`${task.title}${task.owner}${task.resources}`.includes(query)) return false;
    return true;
  }).sort((a, b) => (a.task.due || '9999').localeCompare(b.task.due || '9999'));
  const writeGroups = (next: WorkGroup[], reason?: string) => commitAsync(commit, { ...data, workGroups: next }, reason);
  const changeTask = (groupId: string, taskId: string, patch: Partial<WorkGroupTask>) => {
    writeGroups(groups.map(group => group.id === groupId ? { ...group, tasks: group.tasks.map(task => task.id === taskId ? { ...task, ...patch } : task) } : group));
  };
  function addTask() {
    const value = title.trim();
    if (!value) return;
    let nextGroups = groups;
    let groupId = targetGroup;
    if (!nextGroups.length) {
      const group = createWorkGroup('执行组');
      nextGroups = [group];
      groupId = group.id;
    }
    if (!nextGroups.some(group => group.id === groupId)) groupId = nextGroups[0].id;
    const task = { ...createGroupTask(), title: value, priority: '中' as const };
    writeGroups(nextGroups.map(group => group.id === groupId ? { ...group, tasks: [...group.tasks, task] } : group), '新建任务');
    setTitle('');
    setOpen(task.id);
  }
  async function aiDecompose() {
    setBusy('AI 正在拆解任务…'); setMessage('');
    try {
      const response = await aiRequest<{ text: string }>('/api/ai/task', {
        task: 'recommendStaff',
        context: {
          instruction: '只输出 JSON 数组，不要 Markdown。每项包含 department、title、owner、due（YYYY-MM-DD 或空）、priority（高/中/低）、content。任务必须对应筹备工作，不重复已有任务，不编造已确认人员。',
          activity: plan.title, category: plan.brief.categoryId, people: plan.brief.people, budget: plan.brief.budget,
          date: plan.brief.date, venue: plan.brief.venueNote, duration: plan.brief.durationMinutes,
          departments: groups.map(item => ({ name: item.name, duties: item.duties })),
          existingTasks: tasks.map(item => `${item.group.name}｜${item.task.title}`),
        },
      });
      const parsed = JSON.parse(response.text.replace(/^```(?:json)?|```$/g, '').trim());
      if (!Array.isArray(parsed)) throw new Error('AI 返回格式不正确');
      const next = parsed.slice(0, 24).filter(item => typeof item?.title === 'string' && item.title.trim()).map(item => ({
        department: typeof item.department === 'string' && item.department.trim() ? item.department.trim().slice(0, 40) : groups[0]?.name ?? '执行组',
        title: item.title.trim().slice(0, 80),
        owner: typeof item.owner === 'string' ? item.owner.slice(0, 40) : '',
        due: /^\d{4}-\d{2}-\d{2}$/.test(item.due ?? '') ? item.due : '',
        priority: item.priority === '高' || item.priority === '低' ? item.priority : '中',
        content: typeof item.content === 'string' ? item.content.slice(0, 500) : '',
      }));
      if (!next.length) throw new Error('AI 没有返回可用任务');
      setDraft({ ids: next.map((_, index) => String(index)), tasks: next });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'AI 任务拆解失败，原有任务未修改。');
    } finally { setBusy(''); }
  }
  function applyDraft() {
    if (!draft) return;
    let nextGroups = groups.length ? groups.map(group => ({ ...group, tasks: [...group.tasks] })) : [];
    const existing = new Set(tasks.map(item => item.task.title.replace(/\s+/g, '').toLowerCase()));
    let added = 0;
    for (const [index, item] of draft.tasks.entries()) {
      if (!draft.ids.includes(String(index))) continue;
      if (existing.has(item.title.replace(/\s+/g, '').toLowerCase())) continue;
      let group = nextGroups.find(entry => entry.name === item.department);
      if (!group) {
        group = { ...createWorkGroup(item.department), tasks: [] };
        nextGroups = [...nextGroups, group];
      }
      group.tasks = [...group.tasks, { ...createGroupTask(), title: item.title, owner: item.owner, due: item.due, priority: item.priority as WorkGroupTask['priority'], content: item.content }];
      existing.add(item.title.replace(/\s+/g, '').toLowerCase());
      added++;
    }
    writeGroups(nextGroups, '采用 AI 任务拆解');
    setMessage(`已加入 ${added} 项任务；重复或未勾选的任务未写入。`);
    setDraft(null);
  }
  return <div className="oc-content">
    <section className="oc-panel">
      <SectionHead title="工作任务" desc="筹备任务与活动当天日程分开管理；负责人、期限和依赖都由程序检查。" actions={<>
        <button className="oc-btn" type="button" onClick={() => setDepartment('全部')}><ClipboardList size={16}/>{tasks.length} 项任务</button>
        <button className="oc-btn oc-btn-ai" type="button" disabled={!!busy} onClick={() => void aiDecompose()}><Sparkles size={16}/>AI 拆解任务</button>
      </>}/>
      <div className="oc-stat-row">
        <span><strong>{tasks.filter(item => item.task.status === '已完成').length}</strong>已完成</span>
        <span><strong>{tasks.filter(item => item.task.status === '进行中').length}</strong>进行中</span>
        <span className={tasks.some(item => item.task.due && item.task.due < '2026-11-18' && !['已完成', '已取消'].includes(item.task.status)) ? 'is-warn' : ''}><strong>{issues.filter(issue => issue.level === 'error').length}</strong>阻断项</span>
        <span><strong>{issues.filter(issue => issue.level === 'warning').length}</strong>提醒</span>
      </div>
      {busy && <Notice tone="ai">{busy}</Notice>}
      {message && <Notice tone="info">{message}</Notice>}
      {draft && <div className="oc-draft"><div className="oc-draft-head"><strong>AI 任务建议 · 待确认</strong><div><button className="oc-btn oc-btn-primary" type="button" onClick={applyDraft}>采用勾选任务</button><button className="oc-btn" type="button" onClick={() => setDraft(null)}>放弃</button></div></div><ul>{draft.tasks.map((task, index) => <li key={`${task.title}-${index}`}><label><input type="checkbox" checked={draft.ids.includes(String(index))} onChange={event => setDraft({ ...draft, ids: event.target.checked ? [...draft.ids, String(index)] : draft.ids.filter(id => id !== String(index)) })}/><span><strong>{task.title}</strong><small>{task.department} · {task.owner || '负责人待定'} · {task.due || '期限待定'} · {task.priority}优先</small></span></label></li>)}</ul></div>}
      <IssueList issues={issues}/>
      <div className="oc-filter-row">
        <input aria-label="搜索任务" placeholder="搜索任务、负责人或资源" value={query} onChange={event => setQuery(event.target.value)}/>
        <select aria-label="按部门筛选" value={department} onChange={event => setDepartment(event.target.value)}><option>全部</option>{groups.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}</select>
        <select aria-label="按状态筛选" value={status} onChange={event => setStatus(event.target.value)}><option>全部</option>{TASK_STATUSES.map(value => <option key={value}>{value}</option>)}</select>
        <select aria-label="按负责人筛选" value={owner} onChange={event => setOwner(event.target.value)}><option>全部</option>{owners.map(value => <option key={value}>{value}</option>)}</select>
      </div>
      <div className="oc-create-row">
        <input aria-label="新任务名称" placeholder="新任务名称" value={title} onChange={event => setTitle(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') addTask(); }}/>
        <select aria-label="所属部门" value={targetGroup} onChange={event => setTargetGroup(event.target.value)}>{groups.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}</select>
        <button className="oc-btn oc-btn-primary" type="button" onClick={addTask}><Plus size={15}/>添加任务</button>
      </div>
      <div className="oc-task-table" role="list">
        {filtered.map(({ group, task }) => {
          const taskIssueList = issues.filter(issue => issue.taskId === task.id);
          const expanded = open === task.id;
          return <div className={`oc-task-row ${expanded ? 'is-open' : ''}`} key={task.id} role="listitem">
            <button className="oc-task-main" type="button" aria-expanded={expanded} onClick={() => setOpen(expanded ? '' : task.id)}>
              <span className="oc-task-title"><strong>{task.title || '未命名任务'}</strong><small>{group.name} · {task.owner || '负责人待定'} · {task.due ? `截止 ${task.due}` : '期限待定'}</small></span>
              <PriorityChip value={task.priority}/>
              <StatusChip status={task.status}/>
              {taskIssueList.length > 0 && <span className={`oc-issue-dot ${taskIssueList.some(issue => issue.level === 'error') ? 'is-error' : 'is-warning'}`}>{taskIssueList.length}</span>}
              <ChevronRight size={16} className="oc-chevron"/>
            </button>
            {expanded && <div className="oc-task-detail">
              {taskIssueList.length > 0 && <ul className="oc-task-issues">{taskIssueList.map(issue => <li key={issue.id} className={issue.level === 'error' ? 'is-error' : 'is-warning'}>{issue.message}</li>)}</ul>}
              <div className="oc-form-grid">
                <Field label="任务名称"><input value={task.title} onChange={event => changeTask(group.id, task.id, { title: event.target.value })}/></Field>
                <Field label="负责人"><input list="oc-owners" value={task.owner} onChange={event => changeTask(group.id, task.id, { owner: event.target.value })}/><datalist id="oc-owners">{[...new Set([...owners, ...data.people.map(person => person.name), ...groups.map(item => item.leader).filter(Boolean)])].map(value => <option key={value} value={value}/>)}</datalist></Field>
                <Field label="所属部门"><select value={group.id} onChange={event => { const next = event.target.value; writeGroups(groups.map(item => item.id === group.id ? { ...item, tasks: item.tasks.filter(taskItem => taskItem.id !== task.id) } : item.id === next ? { ...item, tasks: [...item.tasks, task] } : item)); }}>{groups.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
                <Field label="状态"><select value={task.status} onChange={event => changeTask(group.id, task.id, { status: event.target.value as WorkGroupTask['status'] })}>{TASK_STATUSES.map(value => <option key={value}>{value}</option>)}{!TASK_STATUSES.includes(task.status as typeof TASK_STATUSES[number]) && <option>{task.status}</option>}</select></Field>
                <Field label="开始日期"><input type="date" value={task.start} onChange={event => changeTask(group.id, task.id, { start: event.target.value })}/></Field>
                <Field label="截止日期"><input type="date" value={task.due} onChange={event => changeTask(group.id, task.id, { due: event.target.value })}/></Field>
                <Field label="优先级"><select value={task.priority ?? '中'} onChange={event => changeTask(group.id, task.id, { priority: event.target.value as WorkGroupTask['priority'] })}>{TASK_PRIORITIES.map(value => <option key={value}>{value}</option>)}</select></Field>
                <Field label="前置任务"><select value={task.dependsOn} onChange={event => changeTask(group.id, task.id, { dependsOn: event.target.value })}><option value="">无</option>{tasks.filter(item => item.task.id !== task.id).map(item => <option key={item.task.id} value={item.task.id}>{item.group.name} · {item.task.title || '未命名'}</option>)}</select></Field>
                <Field label="所需资源"><input value={task.resources} onChange={event => changeTask(group.id, task.id, { resources: event.target.value })}/></Field>
                <Field label="任务预算"><input type="number" min="0" value={task.budget} onChange={event => changeTask(group.id, task.id, { budget: Number(event.target.value) })}/></Field>
                <Field label="协作人员"><input value={task.collaborators} onChange={event => changeTask(group.id, task.id, { collaborators: event.target.value })}/></Field>
                <Field label="交付成果"><input value={task.deliverable} onChange={event => changeTask(group.id, task.id, { deliverable: event.target.value })}/></Field>
                <Field label="任务描述" wide><textarea rows={3} value={task.content} onChange={event => changeTask(group.id, task.id, { content: event.target.value })}/></Field>
              </div>
              <div className="oc-actions"><button className="oc-btn oc-btn-danger" type="button" onClick={() => { if (window.confirm(`删除任务「${task.title || '未命名'}」？`)) writeGroups(groups.map(item => item.id === group.id ? { ...item, tasks: item.tasks.filter(taskItem => taskItem.id !== task.id) } : item), '删除任务'); }}><Trash2 size={15}/>删除任务</button></div>
            </div>}
          </div>;
        })}
        {!filtered.length && <Empty title="没有符合条件的任务" desc={tasks.length ? '调整筛选条件，或清除搜索。' : '添加第一项筹备任务，或让 AI 根据活动拆解。'} action={!tasks.length ? <button className="oc-btn oc-btn-ai" type="button" onClick={() => void aiDecompose()}><Sparkles size={15}/>AI 拆解任务</button> : undefined}/>}
      </div>
    </section>
  </div>;
}

export function SchedulePanel({ data, commit }: Pick<CenterProps, 'data' | 'commit'>) {
  const [open, setOpen] = useState('');
  const [title, setTitle] = useState('');
  const issues = useMemo(() => scheduleIssues(data.flow), [data.flow]);
  const sorted = [...data.flow].sort((a, b) => (a.start || '99:99').localeCompare(b.start || '99:99'));
  const change = (id: string, patch: Partial<(typeof data.flow)[number]>) => {
    commitAsync(commit, { ...data, flow: data.flow.map(node => node.id === id ? { ...node, ...patch } : node) });
  };
  function add() {
    const value = title.trim();
    if (!value) return;
    const last = sorted.at(-1);
    const node = { id: uid(), start: last?.end || '', end: '', title: value, owner: '', department: '', people: [], venue: '', equipment: '', status: '待执行', note: '' };
    commitAsync(commit, { ...data, flow: [...data.flow, node] }, '新增活动日程');
    setTitle('');
    setOpen(node.id);
  }
  return <div className="oc-content">
    <section className="oc-panel">
      <SectionHead title="活动日程" desc="这里只记录活动当天或活动期间发生的环节；筹备工作请放在工作任务中。"/>
      <IssueList issues={issues}/>
      <div className="oc-create-row"><input aria-label="新日程环节" placeholder="例如：14:00 观众入场" value={title} onChange={event => setTitle(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') add(); }}/><button className="oc-btn oc-btn-primary" type="button" onClick={add}><Plus size={15}/>添加环节</button></div>
      {sorted.length ? <div className="oc-timeline">{sorted.map((node, index) => <div className={`oc-timeline-item ${open === node.id ? 'is-open' : ''}`} key={node.id}>
        <div className="oc-timeline-time"><strong>{node.start || '待定'}</strong><span>{node.end || '待定'}</span></div>
        <div className="oc-timeline-body">
          <button type="button" className="oc-timeline-title" onClick={() => setOpen(open === node.id ? '' : node.id)} aria-expanded={open === node.id}>
            <span className="oc-order">{index + 1}</span>
            <span><strong>{node.title || '未命名环节'}</strong><small>{node.owner || '负责人待定'}{node.department ? ` · ${departmentName(data, node.department)}` : ''}{node.venue ? ` · ${node.venue}` : ''}</small></span>
            <ChevronRight size={16}/>
          </button>
          {open === node.id && <div className="oc-form-grid">
            <Field label="环节名称"><input value={node.title} onChange={event => change(node.id, { title: event.target.value })}/></Field>
            <Field label="负责人"><input value={node.owner} onChange={event => change(node.id, { owner: event.target.value })}/></Field>
            <Field label="开始"><input type="time" value={node.start} onChange={event => change(node.id, { start: event.target.value })}/></Field>
            <Field label="结束"><input type="time" value={node.end} onChange={event => change(node.id, { end: event.target.value })}/></Field>
            <Field label="相关部门"><select value={node.department ?? ''} onChange={event => change(node.id, { department: event.target.value })}><option value="">未指定</option>{(data.workGroups ?? []).map(group => <option key={group.id} value={group.id}>{group.name}</option>)}</select></Field>
            <Field label="场地"><input value={node.venue} onChange={event => change(node.id, { venue: event.target.value })}/></Field>
            <Field label="设备"><input value={node.equipment} onChange={event => change(node.id, { equipment: event.target.value })}/></Field>
            <Field label="状态"><select value={node.status} onChange={event => change(node.id, { status: event.target.value })}>{['待执行', '进行中', '已完成', '暂停'].map(value => <option key={value}>{value}</option>)}</select></Field>
            <Field label="备注" wide><textarea rows={2} value={node.note} onChange={event => change(node.id, { note: event.target.value })}/></Field>
          </div>}
          {open === node.id && <div className="oc-actions"><button className="oc-btn oc-btn-danger" type="button" onClick={() => { if (window.confirm(`删除环节「${node.title || '未命名'}」？`)) commitAsync(commit, { ...data, flow: data.flow.filter(item => item.id !== node.id) }, '删除活动日程'); }}><Trash2 size={15}/>删除环节</button></div>}
        </div>
      </div>)}</div> : <Empty title="还没有活动日程" desc="先添加入场、开场、主要环节和结束时间；筹备任务仍在“工作任务”中。" action={<button className="oc-btn oc-btn-primary" type="button" onClick={add}><Plus size={15}/>添加第一个环节</button>}/>}
    </section>
  </div>;
}

export function BudgetPanel({ plan, data, commit, onModule }: Pick<CenterProps, 'plan' | 'data' | 'commit' | 'onModule'>) {
  const summary = useMemo(() => budgetSummary(plan, data), [plan, data]);
  const [message, setMessage] = useState('');
  const groups = data.workGroups ?? [];
  const writeExpenses = (rows: Workspace['tables'][string]['rows']) => {
    const secured = ensureCenterTables({ ...data });
    const old = secured.tables.expenses;
    commitAsync(commit, { ...secured, tables: { ...secured.tables, expenses: { ...old, rows, revision: (old?.revision ?? 0) + 1 } } });
  };
  const writeMaterials = (rows: Workspace['tables'][string]['rows']) => {
    const secured = ensureCenterTables({ ...data });
    const old = secured.tables.materials;
    commitAsync(commit, { ...secured, tables: { ...secured.tables, materials: { ...old, rows, revision: (old?.revision ?? 0) + 1 } } });
  };
  const expenses = data.tables.expenses?.rows ?? [];
  const materials = data.tables.materials?.rows ?? [];
  const updateExpense = (id: string, patch: Record<string, string>) => writeExpenses(expenses.map(row => row.id === id ? { ...row, ...patch } : row));
  const updateMaterial = (id: string, patch: Record<string, string>) => writeMaterials(materials.map(row => row.id === id ? { ...row, ...patch } : row));
  function addExpense() {
    const secured = ensureCenterTables(data);
    const row = { id: uid(), item: '', category: '物资', departmentId: groups[0]?.id ?? '', quantity: '', unitPrice: '', budget: '', actual: '', date: '', owner: '', status: '待采购', note: '' };
    writeExpenses([...(secured.tables.expenses?.rows ?? []), row]);
  }
  function addMaterial() {
    writeMaterials([...materials, { id: uid(), name: '', quantity: '', unit: '', unitPrice: '', segment: '', owner: '', status: '待采购', actual: '' }]);
  }
  function importBudget() {
    const result = importPlanBudget(plan, data);
    if (!result.added) { setMessage('方案预算已全部导入，或当前方案没有预算清单。'); return; }
    commitAsync(commit, result.workspace, '导入方案预算到统一台账');
    setMessage(`已导入 ${result.added} 项预算，可在下方补充数量、单价、负责人和采购状态。`);
  }
  return <div className="oc-content">
    <section className="oc-panel">
      <SectionHead title="预算与资源" desc="预算、支出和物资共用同一份数据；未填写价格不会被当作 0 元。" actions={<>
        <button className="oc-btn" type="button" onClick={importBudget}><Download size={16}/>导入方案预算</button>
        <button className="oc-btn oc-btn-blue" type="button" onClick={() => onModule('materials')}><FileText size={16}/>批量导入资料</button>
      </>}/>
      <div className="oc-metric-grid oc-metric-grid-4">
        <div className="oc-metric"><span>活动预算</span><strong>¥{summary.total.toLocaleString()}</strong><small>方案上限</small></div>
        <div className="oc-metric"><span>任务预算合计</span><strong>¥{summary.taskAllocated.toLocaleString()}</strong><small>{groups.length} 个部门</small></div>
        <div className="oc-metric"><span>已登记预计支出</span><strong>{summary.missingPrice ? `¥${summary.planned.toLocaleString()} 起` : money(summary.planned)}</strong><small>{summary.missingPrice ? `${summary.missingPrice} 项价格待补，合计不完整` : '价格已完整'}</small></div>
        <div className={`oc-metric ${summary.overBudget ? 'is-error' : ''}`}><span>实际支出</span><strong>{money(summary.actual)}</strong><small>{summary.actual > summary.total ? '实际支出已超预算，请核查' : summary.planned > summary.total ? '预计支出已超预算，请核查' : `剩余 ¥${(summary.total - summary.actual).toLocaleString()}`}</small></div>
      </div>
      {message && <Notice tone="info">{message}</Notice>}
      {(summary.overBudget || summary.invalid > 0 || summary.missingPrice > 0) && <Notice tone={summary.overBudget ? 'error' : 'warn'}>{summary.invalid > 0 && `${summary.invalid} 条实际支出金额无效，未计入合计。 `}{summary.missingPrice > 0 && `${summary.missingPrice} 项支出没有价格或数量单价，合计暂不完整，不会被当成 0 元。 `}{summary.overBudget && '预计或实际支出已超过活动预算上限。'}</Notice>}
      <div className="oc-budget-split">
        <div>
          <h3>部门预算</h3>
          {summary.departments.length ? <div className="oc-department-budget">{summary.departments.map(department => <div key={department.id}><div><strong>{department.name}</strong><span>任务预算 ¥{department.taskBudget.toLocaleString()} · 台账 ¥{department.planned.toLocaleString()}</span></div><progress max={Math.max(1, summary.total)} value={Math.min(summary.total, department.taskBudget + department.planned)}/></div>)}</div> : <p className="oc-muted">尚未建立部门，任务预算会全部计入未分配。</p>}
          <p className="oc-muted">未分配的支出仍保留在预算台账中，不会自动摊派给部门。</p>
        </div>
        <div className="oc-budget-side">
          <div className="oc-info-row"><span>计划预算</span><strong>¥{summary.total.toLocaleString()}</strong></div>
          <div className="oc-info-row"><span>任务分配</span><strong>¥{summary.taskAllocated.toLocaleString()}</strong></div>
          <div className="oc-info-row"><span>未分配</span><strong>¥{Math.max(0, summary.total - summary.taskAllocated).toLocaleString()}</strong></div>
          <div className="oc-info-row"><span>实际记录</span><strong>¥{summary.actual.toLocaleString()}</strong></div>
        </div>
      </div>
    </section>

    <section className="oc-panel">
      <SectionHead title="支出与采购台账" desc="预计支出优先采用你填写的预算金额；没有预算金额时，用数量 × 单价自动计算。" actions={<button className="oc-btn oc-btn-primary" type="button" onClick={addExpense}><Plus size={15}/>添加支出</button>}/>
      <div className="oc-table-wrap"><table className="oc-table"><thead><tr><th>项目</th><th>类别</th><th>部门</th><th>数量</th><th>单价</th><th>预计</th><th>实际</th><th>负责人</th><th>状态</th><th/></tr></thead><tbody>
        {expenses.map(row => {
          const quantity = parseAmount(row.quantity); const unitPrice = parseAmount(row.unitPrice);
          const computed = quantity !== null && unitPrice !== null ? quantity * unitPrice : null;
          const planned = parseAmount(row.budget) ?? computed;
          return <tr key={row.id}>
            <td><input value={row.item ?? ''} onChange={event => updateExpense(row.id, { item: event.target.value })} placeholder="支出项目"/></td>
            <td><input value={row.category ?? ''} onChange={event => updateExpense(row.id, { category: event.target.value })}/></td>
            <td><select value={row.departmentId ?? ''} onChange={event => updateExpense(row.id, { departmentId: event.target.value })}><option value="">未分配</option>{groups.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}</select></td>
            <td><input type="number" min="0" value={row.quantity ?? ''} onChange={event => updateExpense(row.id, { quantity: event.target.value })}/></td>
            <td><input type="number" min="0" value={row.unitPrice ?? ''} onChange={event => updateExpense(row.id, { unitPrice: event.target.value })} placeholder="待填写"/></td>
            <td className={planned === null ? 'is-missing' : ''}><input type="number" min="0" value={row.budget ?? ''} onChange={event => updateExpense(row.id, { budget: event.target.value })} placeholder={computed === null ? '待填写' : String(computed)}/></td>
            <td><input type="number" min="0" value={row.actual ?? ''} onChange={event => updateExpense(row.id, { actual: event.target.value })}/></td>
            <td><input value={row.owner ?? ''} onChange={event => updateExpense(row.id, { owner: event.target.value })}/></td>
            <td><select value={row.status ?? ''} onChange={event => updateExpense(row.id, { status: event.target.value })}><option value="">待确认</option>{['待采购', '已询价', '已下单', '已付款', '已完成', '已取消'].map(value => <option key={value}>{value}</option>)}</select></td>
            <td><button className="oc-icon-btn" type="button" aria-label="删除支出" onClick={() => writeExpenses(expenses.filter(item => item.id !== row.id))}><Trash2 size={14}/></button></td>
          </tr>;
        })}
      </tbody></table></div>
      {!expenses.length && <Empty title="还没有支出记录" desc="可以从方案导入预算，或手动添加第一项采购。" action={<button className="oc-btn oc-btn-primary" type="button" onClick={addExpense}><Plus size={15}/>添加支出</button>}/>}
    </section>

    <section className="oc-panel">
      <SectionHead title="物资清单" desc="数量、单价和负责人用于估算与采购跟踪；实际费用由人工填写。" actions={<button className="oc-btn oc-btn-primary" type="button" onClick={addMaterial}><Plus size={15}/>添加物资</button>}/>
      <div className="oc-table-wrap"><table className="oc-table"><thead><tr><th>物资</th><th>数量</th><th>单位</th><th>单价</th><th>预计</th><th>使用环节</th><th>负责人</th><th>状态</th><th>实际</th><th/></tr></thead><tbody>
        {materials.map(row => {
          const quantity = parseAmount(row.quantity); const unitPrice = parseAmount(row.unitPrice);
          const planned = quantity !== null && unitPrice !== null ? quantity * unitPrice : null;
          return <tr key={row.id}>
            <td><input value={row.name ?? ''} onChange={event => updateMaterial(row.id, { name: event.target.value })}/></td>
            <td><input type="number" min="0" value={row.quantity ?? ''} onChange={event => updateMaterial(row.id, { quantity: event.target.value })}/></td>
            <td><input value={row.unit ?? ''} onChange={event => updateMaterial(row.id, { unit: event.target.value })}/></td>
            <td><input type="number" min="0" value={row.unitPrice ?? ''} onChange={event => updateMaterial(row.id, { unitPrice: event.target.value })} placeholder="待填写"/></td>
            <td className={planned === null ? 'is-missing' : ''}>{money(planned)}</td>
            <td><input value={row.segment ?? ''} onChange={event => updateMaterial(row.id, { segment: event.target.value })}/></td>
            <td><input value={row.owner ?? ''} onChange={event => updateMaterial(row.id, { owner: event.target.value })}/></td>
            <td><select value={row.status ?? ''} onChange={event => updateMaterial(row.id, { status: event.target.value })}><option value="">待确认</option>{['待采购', '已下单', '已到货', '已领用', '已归还'].map(value => <option key={value}>{value}</option>)}</select></td>
            <td><input type="number" min="0" value={row.actual ?? ''} onChange={event => updateMaterial(row.id, { actual: event.target.value })}/></td>
            <td><button className="oc-icon-btn" type="button" aria-label="删除物资" onClick={() => writeMaterials(materials.filter(item => item.id !== row.id))}><Trash2 size={14}/></button></td>
          </tr>;
        })}
      </tbody></table></div>
      {!materials.length && <Empty title="还没有物资记录" desc="添加场地、设备或物资后，3D 场地规划可以引用同一批资源。" action={<button className="oc-btn oc-btn-primary" type="button" onClick={addMaterial}><Plus size={15}/>添加物资</button>}/>}
      <p className="oc-muted">物资清单与经费台账分开：物资记录数量和采购状态，经费记录金额与付款。两者不会被模拟结果自动覆盖。</p>
    </section>
  </div>;
}

export function RisksPanel({ plan, data, commit }: Pick<CenterProps, 'plan' | 'data' | 'commit'>) {
  const risks = data.risks ?? [];
  const [open, setOpen] = useState('');
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [draft, setDraft] = useState<RiskItem[]>([]);
  const groups = data.workGroups ?? [];
  const change = (id: string, patch: Partial<RiskItem>) => commitAsync(commit, { ...data, risks: risks.map(risk => risk.id === id ? { ...risk, ...patch } : risk) });
  function importRisks() {
    const imported = risksFromPlan(plan, data, risks);
    if (!imported.length) { setMessage('方案中没有可导入的风险表，或风险已全部导入。'); return; }
    commitAsync(commit, { ...data, risks: [...risks, ...imported] }, '从策划方案导入风险');
    setMessage(`已导入 ${imported.length} 项风险，原方案内容未修改。`);
  }
  async function aiSuggest() {
    setBusy('AI 正在识别风险…'); setMessage('');
    try {
      const response = await aiRequest<{ text: string }>('/api/ai/task', {
        task: 'recommendStaff',
        context: {
          instruction: '只输出 JSON 数组，不要 Markdown。每项包含 title、description、scope、likelihood（低/中/高）、impact（低/中/高）、department、prevention、response。只给出与活动类型、规模、场地和人员配置相关的风险，不重复已有风险。',
          activity: plan.title, category: plan.brief.categoryId, people: plan.brief.people, budget: plan.brief.budget,
          venue: plan.brief.venueNote, outdoor: !['indoor-small', 'indoor-large', 'online'].includes(plan.brief.venue),
          departments: groups.map(group => group.name), existing: risks.map(risk => risk.title),
        },
      });
      const parsed = JSON.parse(response.text.replace(/^```(?:json)?|```$/g, '').trim());
      if (!Array.isArray(parsed)) throw new Error('AI 返回格式不正确');
      const next = parsed.slice(0, 12).filter(item => typeof item?.title === 'string' && item.title.trim()).map(item => {
        const department = groups.find(group => group.name === item.department || group.id === item.department);
        return {
          id: uid(),
          title: item.title.trim().slice(0, 80),
          description: typeof item.description === 'string' ? item.description.slice(0, 300) : '',
          scope: typeof item.scope === 'string' ? item.scope.slice(0, 60) : '活动全程',
          likelihood: item.likelihood === '高' || item.likelihood === '低' ? item.likelihood : '中',
          impact: item.impact === '高' || item.impact === '低' ? item.impact : '中',
          departmentId: department?.id ?? '',
          prevention: typeof item.prevention === 'string' ? item.prevention.slice(0, 300) : '',
          response: typeof item.response === 'string' ? item.response.slice(0, 300) : '',
          confirmed: false,
        } as RiskItem;
      });
      if (!next.length) throw new Error('AI 没有返回可用风险');
      setDraft(next);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'AI 风险建议失败，原有风险未修改。'); }
    finally { setBusy(''); }
  }
  return <div className="oc-content">
    <section className="oc-panel">
      <SectionHead title="风险与应急" desc="小型活动可以不启用；大型活动建议至少维护重要风险、责任部门和应对方案。" actions={<>
        <button className="oc-btn" type="button" onClick={importRisks}><ShieldAlert size={16}/>从方案导入</button>
        <button className="oc-btn oc-btn-ai" type="button" disabled={!!busy} onClick={() => void aiSuggest()}><Sparkles size={16}/>AI 识别风险</button>
        <button className="oc-btn oc-btn-primary" type="button" onClick={() => { const risk: RiskItem = { id: uid(), title: '', description: '', scope: '活动全程', likelihood: '中', impact: '中', departmentId: '', prevention: '', response: '', confirmed: false }; commitAsync(commit, { ...data, risks: [...risks, risk] }); setOpen(risk.id); }}><Plus size={15}/>添加风险</button>
      </>}/>
      {busy && <Notice tone="ai">{busy}</Notice>}
      {message && <Notice tone="info">{message}</Notice>}
      {draft.length > 0 && <div className="oc-draft"><div className="oc-draft-head"><strong>AI 风险建议 · 待确认</strong><div><button className="oc-btn oc-btn-primary" type="button" onClick={() => { commitAsync(commit, { ...data, risks: [...risks, ...draft.map(risk => ({ ...risk, confirmed: true }))] }, '采用 AI 风险建议'); setDraft([]); }}>加入风险清单</button><button className="oc-btn" type="button" onClick={() => setDraft([])}>放弃</button></div></div><ul>{draft.map(risk => <li key={risk.id}><strong>{risk.title}</strong><span>{risk.likelihood}可能 · {risk.impact}影响 · {departmentName(data, risk.departmentId) || '部门待定'}</span></li>)}</ul></div>}
      {risks.length ? <div className="oc-risk-list">{risks.slice().sort((a, b) => ({ 高: 0, 中: 1, 低: 2 }[riskLevel(a)] - { 高: 0, 中: 1, 低: 2 }[riskLevel(b)])).map(risk => <div className={`oc-risk-item ${open === risk.id ? 'is-open' : ''}`} key={risk.id}>
        <button type="button" className="oc-risk-head" onClick={() => setOpen(open === risk.id ? '' : risk.id)} aria-expanded={open === risk.id}><span className={`oc-risk-level level-${riskLevel(risk)}`}>{riskLevel(risk)}</span><span><strong>{risk.title || '未命名风险'}</strong><small>{risk.scope || '活动全程'} · {departmentName(data, risk.departmentId) || '责任部门待定'} · {risk.confirmed ? '已确认' : '待确认'}</small></span><ChevronRight size={16}/></button>
        {open === risk.id && <div className="oc-form-grid">
          <Field label="风险名称"><input value={risk.title} onChange={event => change(risk.id, { title: event.target.value })}/></Field>
          <Field label="责任部门"><select value={risk.departmentId} onChange={event => change(risk.id, { departmentId: event.target.value })}><option value="">待指定</option>{groups.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}</select></Field>
          <Field label="发生可能性"><select value={risk.likelihood} onChange={event => change(risk.id, { likelihood: event.target.value as RiskItem['likelihood'] })}>{['低', '中', '高'].map(value => <option key={value}>{value}</option>)}</select></Field>
          <Field label="影响程度"><select value={risk.impact} onChange={event => change(risk.id, { impact: event.target.value as RiskItem['impact'] })}>{['低', '中', '高'].map(value => <option key={value}>{value}</option>)}</select></Field>
          <Field label="影响范围"><input value={risk.scope} onChange={event => change(risk.id, { scope: event.target.value })}/></Field>
          <Field label="确认状态"><select value={risk.confirmed ? '已确认' : '待确认'} onChange={event => change(risk.id, { confirmed: event.target.value === '已确认' })}><option>待确认</option><option>已确认</option></select></Field>
          <Field label="风险描述" wide><textarea rows={2} value={risk.description} onChange={event => change(risk.id, { description: event.target.value })}/></Field>
          <Field label="预防措施" wide><textarea rows={2} value={risk.prevention} onChange={event => change(risk.id, { prevention: event.target.value })}/></Field>
          <Field label="应对方案" wide><textarea rows={2} value={risk.response} onChange={event => change(risk.id, { response: event.target.value })}/></Field>
        </div>}
        {open === risk.id && <div className="oc-actions"><button className="oc-btn oc-btn-danger" type="button" onClick={() => { if (window.confirm(`删除风险「${risk.title || '未命名'}」？`)) commitAsync(commit, { ...data, risks: risks.filter(item => item.id !== risk.id) }); }}><Trash2 size={15}/>删除风险</button></div>}
      </div>)}</div> : <Empty title="尚未维护风险" desc="小型活动可以不启用；大型活动建议至少维护天气、人流、设备、医疗等关键风险。" action={<button className="oc-btn oc-btn-ai" type="button" onClick={() => void aiSuggest()}><Sparkles size={15}/>让 AI 提出风险建议</button>}/>}
    </section>
  </div>;
}

export function SitePanel({ plan, data, onOpenGame, onModule }: Pick<CenterProps, 'plan' | 'data' | 'onOpenGame' | 'onModule'>) {
  const summary = budgetSummary(plan, data);
  const venueResources = summary.lines.filter(line => /场地|设备|舞台|音响|帐篷|座位/.test(`${line.category}${line.name}${line.note}`));
  return <div className="oc-content">
    <section className="oc-panel">
      <SectionHead title="3D 场地与现场协同" desc="组织中心的数据是 3D 场景和后续现场执行的来源，不另建一套设施资料。" actions={onOpenGame ? <button className="oc-btn oc-btn-primary" type="button" onClick={onOpenGame}><Box size={16}/>进入 3D 场地规划</button> : undefined}/>
      <div className="oc-linkage-grid">
        <div><Users size={18}/><strong>组织架构</strong><span>{(data.workGroups ?? []).length} 个部门 · {data.people.length} 名登记人员</span><small>现场任务与人员分工直接读取组织数据</small></div>
        <div><ClipboardList size={18}/><strong>工作任务</strong><span>{flattenTasks(data).length} 项任务</span><small>{flattenTasks(data).filter(item => !item.task.owner).length} 项待指定负责人</small></div>
        <div><CalendarDays size={18}/><strong>活动日程</strong><span>{data.flow.length} 个环节</span><small>现场运行按活动当天时间安排</small></div>
        <div><Wallet size={18}/><strong>预算与资源</strong><span>{summary.lines.length} 条记录</span><small>3D 设施需求引用同一批场地与设备资源</small></div>
      </div>
      <Notice tone="info"><MapPin size={15}/> 进入 3D 游戏后会同步当前活动、部门、任务和预算摘要。模拟结果只作为演练记录保存，不会覆盖真实报名、支出或人员记录。</Notice>
      {venueResources.length > 0 && <div className="oc-resource-list"><h3>可关联到 3D 场地的资源</h3>{venueResources.slice(0, 8).map(line => <div key={`${line.source}-${line.id}`}><Package size={15}/><span>{line.name || '未命名资源'}</span><small>{line.category} · {line.quantity === null ? '数量待定' : `${line.quantity} 件`}</small></div>)}</div>}
      <div className="oc-actions"><button className="oc-btn oc-btn-blue" type="button" onClick={() => onModule('simulation')}><ExternalLink size={15}/>打开活动模拟</button><button className="oc-btn" type="button" onClick={() => onModule('budget')}><Wallet size={15}/>核对场地与设备预算</button></div>
    </section>
  </div>;
}

const exportsList: { kind: CenterExportKind; name: string; desc: string; format: 'docx' | 'xlsx' | 'pdf' }[] = [
  { kind: 'full', name: '完整活动组织方案', desc: '活动信息、组织、任务、预算、风险与执行要求', format: 'docx' },
  { kind: 'organization', name: '组织架构表', desc: '部门、负责人、成员、职责与汇报关系', format: 'xlsx' },
  { kind: 'tasks', name: '工作任务表', desc: '负责人、期限、优先级、依赖与预算', format: 'xlsx' },
  { kind: 'schedule', name: '活动日程表', desc: '活动当天的时间、环节、场地与设备', format: 'xlsx' },
  { kind: 'budget', name: '预算表', desc: '部门预算、预计支出、实际支出与状态', format: 'xlsx' },
  { kind: 'resources', name: '物资清单', desc: '数量、单价、负责人、采购状态', format: 'xlsx' },
  { kind: 'people', name: '人员名单', desc: '登记人员、角色与所属部门', format: 'xlsx' },
  { kind: 'risks', name: '风险与应急表', desc: '等级、责任部门、预防与应对方案', format: 'xlsx' },
];

export function ExportsPanel({ onExport, onBackup, onModule, busy }: Pick<CenterProps, 'onExport' | 'onBackup' | 'onModule' | 'busy'>) {
  const [message, setMessage] = useState('');
  async function run(kind: CenterExportKind, format: 'docx' | 'xlsx' | 'pdf') {
    setMessage('正在生成文件…');
    try { await onExport(kind, format); setMessage('文件已生成，下载已开始。'); }
    catch (error) { setMessage(error instanceof Error ? error.message : '导出失败'); }
  }
  return <div className="oc-content">
    <section className="oc-panel">
      <SectionHead title="资料与导出" desc="所有导出使用同一份活动数据，避免组织表、任务表和预算表互相不一致。" actions={<button className="oc-btn oc-btn-blue" type="button" onClick={() => onModule('documents')}><FileText size={16}/>文档中心</button>}/>
      <div className="oc-export-grid">{exportsList.map(item => <div key={item.kind} className="oc-export-item"><Download size={18}/><div><strong>{item.name}</strong><small>{item.desc}</small></div><button className="oc-btn" type="button" disabled={!!busy} onClick={() => void run(item.kind, item.format)}>{item.format === 'docx' ? 'Word' : 'Excel'}</button>{item.kind === 'full' && <button className="oc-btn" type="button" disabled={!!busy} onClick={() => void run(item.kind, 'pdf')}>PDF</button>}</div>)}</div>
      {message && <Notice tone={message.includes('失败') ? 'error' : 'success'}>{message}</Notice>}
      <div className="oc-actions"><button className="oc-btn" type="button" onClick={onBackup}><Package size={15}/>下载完整活动备份</button><button className="oc-btn" type="button" onClick={() => onModule('plan')}><FileText size={15}/>检查策划方案</button></div>
      <p className="oc-muted">导出内容来自当前已保存数据；模拟记录会单独标注，不会混入真实支出与人员名单。</p>
    </section>
  </div>;
}
