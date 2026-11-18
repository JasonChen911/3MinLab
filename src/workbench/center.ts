import type { EventPlan } from '../types';
import { buildCharterMarkdown } from './charter';
import { uid, type BudgetLineSource, type DataRow, type Field, type FlowNode, type RiskItem, type WorkGroup, type WorkGroupTask, type Workspace } from './model';

export const TASK_STATUSES = ['未开始', '进行中', '已完成', '遇到问题', '已取消'] as const;
export const TASK_PRIORITIES = ['高', '中', '低'] as const;
export const EXPENSE_FIELDS: Field[] = [
  { key: 'item', label: '支出项目' },
  { key: 'category', label: '类别' },
  { key: 'departmentId', label: '所属部门' },
  { key: 'quantity', label: '数量', type: 'number' },
  { key: 'unitPrice', label: '单价', type: 'number' },
  { key: 'budget', label: '预算金额', type: 'number' },
  { key: 'actual', label: '实际支出', type: 'number' },
  { key: 'date', label: '支出日期', type: 'date' },
  { key: 'owner', label: '负责人' },
  { key: 'status', label: '采购状态' },
  { key: 'note', label: '备注' },
];
export const MATERIAL_FIELDS: Field[] = [
  { key: 'name', label: '物资名称' },
  { key: 'quantity', label: '数量', type: 'number' },
  { key: 'unit', label: '单位' },
  { key: 'unitPrice', label: '单价', type: 'number' },
  { key: 'segment', label: '使用环节' },
  { key: 'owner', label: '负责人' },
  { key: 'status', label: '采购状态' },
  { key: 'actual', label: '实际费用', type: 'number' },
];

export function normalizeTask(task: WorkGroupTask): WorkGroupTask {
  return {
    ...task,
    status: task.status === '待开始' ? '未开始' : task.status,
    priority: task.priority ?? '中',
    content: task.content ?? '',
    resources: task.resources ?? '',
    deliverable: task.deliverable ?? '',
    collaborators: task.collaborators ?? '',
    dependsOn: task.dependsOn ?? '',
    budget: Number.isFinite(task.budget) ? task.budget : 0,
  };
}

/** 旧存档无损升级：补默认字段，不删除任何已有数据。 */
export function normalizeWorkspace(workspace: Workspace): Workspace {
  return {
    ...workspace,
    risks: Array.isArray(workspace.risks) ? workspace.risks.filter(risk => !!risk && typeof risk.id === 'string') : [],
    profile: { ...workspace.profile, coordinator: workspace.profile.coordinator ?? '' },
    workGroups: (workspace.workGroups ?? []).map(group => ({
      ...group,
      leader: group.leader ?? '',
      members: group.members ?? '',
      reporting: group.reporting ?? '',
      reportsTo: group.reportsTo ?? '',
      tasks: (group.tasks ?? []).map(normalizeTask),
    })),
  };
}

export function ensureCenterTables(workspace: Workspace): Workspace {
  const tables = { ...workspace.tables };
  if (!tables.expenses) tables.expenses = { id: 'expenses', name: '经费使用记录', fields: EXPENSE_FIELDS, rows: [], revision: 1 };
  if (!tables.materials) tables.materials = { id: 'materials', name: '物资管理', fields: MATERIAL_FIELDS, rows: [], revision: 1 };
  return { ...workspace, tables };
}

export interface FlatTask { group: WorkGroup; task: WorkGroupTask }

export function flattenTasks(workspace: Workspace): FlatTask[] {
  return (workspace.workGroups ?? []).flatMap(group => (group.tasks ?? []).map(task => ({ group, task })));
}

export function departmentName(workspace: Workspace, idOrName: string): string {
  if (!idOrName) return '';
  return (workspace.workGroups ?? []).find(group => group.id === idOrName || group.name === idOrName)?.name ?? idOrName;
}

export type IssueLevel = 'error' | 'warning';
export interface CenterIssue {
  id: string;
  level: IssueLevel;
  message: string;
  taskId?: string;
  groupId?: string;
  nodeId?: string;
}

const TODAY = '2026-11-18';

function dateRange(task: WorkGroupTask): { start: string; end: string } | null {
  if (!task.start && !task.due) return null;
  return { start: task.start || task.due, end: task.due || task.start };
}

function normalizeTitle(title: string) {
  return title.replace(/[\s，。、；：（）()\-—·,.;:/]/g, '').toLowerCase();
}

const CLOSED: WorkGroupTask['status'][] = ['已完成', '已取消'];

export function taskIssues(workspace: Workspace, today = TODAY): CenterIssue[] {
  const flat = flattenTasks(workspace);
  const issues: CenterIssue[] = [];
  const byId = new Map(flat.map(item => [item.task.id, item]));
  const push = (item: FlatTask, level: IssueLevel, message: string) => issues.push({
    id: `${item.task.id}-${issues.length}`,
    level,
    message,
    taskId: item.task.id,
    groupId: item.group.id,
  });

  for (const item of flat) {
    const { task } = item;
    const label = task.title.trim() || '未命名任务';
    if (!task.title.trim()) push(item, 'error', '存在未命名任务');
    if (!task.owner.trim()) push(item, 'error', `${label}缺少负责人`);
    if (task.start && task.due && task.due < task.start) push(item, 'error', `${label}的截止日期早于开始日期`);
    if (task.due && task.due < today && !CLOSED.includes(task.status)) push(item, 'warning', `${label}已逾期（${task.due}）`);
    if (task.dependsOn) {
      if (task.dependsOn === task.id) push(item, 'error', `${label}不能依赖自己`);
      else {
        const parent = byId.get(task.dependsOn);
        if (!parent) push(item, 'error', `${label}的前置任务不存在`);
        else if (parent.task.status !== '已完成') {
          if (task.status === '已完成') push(item, 'error', `${label}已完成，但前置任务「${parent.task.title || '未命名'}」尚未完成`);
          else if (task.status === '进行中') push(item, 'warning', `${label}已开始，但前置任务「${parent.task.title || '未命名'}」尚未完成`);
        }
      }
    }
  }

  const groupsByTitle = new Map<string, FlatTask[]>();
  for (const item of flat) {
    const key = normalizeTitle(item.task.title);
    if (!key) continue;
    groupsByTitle.set(key, [...(groupsByTitle.get(key) ?? []), item]);
  }
  for (const duplicates of groupsByTitle.values()) {
    if (duplicates.length < 2) continue;
    const names = [...new Set(duplicates.map(item => item.group.name))];
    duplicates.forEach(item => push(item, 'warning', `任务「${item.task.title}」在 ${names.length > 1 ? names.join('、') : '同一部门'} 重复出现`));
  }

  for (let i = 0; i < flat.length; i++) {
    for (let j = i + 1; j < flat.length; j++) {
      const a = flat[i].task;
      const b = flat[j].task;
      const owner = a.owner.trim();
      if (!owner || owner !== b.owner.trim()) continue;
      if (CLOSED.includes(a.status) || CLOSED.includes(b.status)) continue;
      const rangeA = dateRange(a);
      const rangeB = dateRange(b);
      if (!rangeA || !rangeB) continue;
      if (rangeA.start <= rangeB.end && rangeB.start <= rangeA.end) {
        push(flat[i], 'warning', `负责人 ${owner} 的「${a.title || '未命名'}」与「${b.title || '未命名'}」时间重叠`);
      }
    }
  }
  return issues;
}

export function issuesForTask(issues: CenterIssue[], taskId: string) {
  return issues.filter(issue => issue.taskId === taskId);
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export function minutesOf(value: string): number | null {
  if (!TIME.test(value)) return null;
  const [hour, minute] = value.split(':').map(Number);
  return hour * 60 + minute;
}

export function scheduleIssues(flow: FlowNode[]): CenterIssue[] {
  const issues: CenterIssue[] = [];
  const push = (node: FlowNode, level: IssueLevel, message: string) => issues.push({ id: `${node.id}-${issues.length}`, level, message, nodeId: node.id });
  for (const node of flow) {
    const label = node.title.trim() || '未命名环节';
    if (!node.title.trim()) push(node, 'error', '存在未命名的活动环节');
    if (node.start && minutesOf(node.start) === null) push(node, 'error', `${label}的开始时间格式无效`);
    if (node.end && minutesOf(node.end) === null) push(node, 'error', `${label}的结束时间格式无效`);
    const start = minutesOf(node.start);
    const end = minutesOf(node.end);
    if (start !== null && end !== null && end <= start) push(node, 'error', `${label}的结束时间不晚于开始时间`);
  }
  for (let i = 0; i < flow.length; i++) {
    for (let j = i + 1; j < flow.length; j++) {
      const a = flow[i];
      const b = flow[j];
      const venue = a.venue.trim();
      if (!venue || venue !== b.venue.trim()) continue;
      const aStart = minutesOf(a.start);
      const aEnd = minutesOf(a.end);
      const bStart = minutesOf(b.start);
      const bEnd = minutesOf(b.end);
      if (aStart === null || aEnd === null || bStart === null || bEnd === null) continue;
      if (aStart < bEnd && bStart < aEnd) push(a, 'warning', `${venue}在 ${a.start}–${a.end} 与「${b.title || '未命名'}」时间重叠`);
    }
  }
  return issues;
}

export interface BudgetLine {
  id: string;
  source: BudgetLineSource;
  name: string;
  category: string;
  departmentId: string;
  quantity: number | null;
  unitPrice: number | null;
  planned: number | null;
  actual: number | null;
  owner: string;
  status: string;
  date: string;
  note: string;
}

export interface BudgetSummary {
  total: number;
  taskAllocated: number;
  planned: number;
  actual: number;
  missingPrice: number;
  invalid: number;
  overBudget: boolean;
  departments: { id: string; name: string; taskBudget: number; planned: number; actual: number }[];
  lines: BudgetLine[];
}

/** 空值或非法金额返回 null，避免把未知价格当成 0 元。 */
export function parseAmount(value: string | undefined): number | null {
  const text = (value ?? '').trim().replace(/,/g, '');
  if (!text) return null;
  const amount = Number(text);
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}

export function buildBudgetLines(workspace: Workspace): BudgetLine[] {
  const expenses = (workspace.tables.expenses?.rows ?? []).map(row => {
    const quantity = parseAmount(row.quantity);
    const unitPrice = parseAmount(row.unitPrice);
    const budget = parseAmount(row.budget);
    return {
      id: row.id,
      source: 'expense' as const,
      name: row.item || row.name || '',
      category: row.category || '未分类',
      departmentId: row.departmentId || '',
      quantity,
      unitPrice,
      planned: budget ?? (quantity !== null && unitPrice !== null ? quantity * unitPrice : null),
      actual: parseAmount(row.actual),
      owner: row.owner || '',
      status: row.status || '',
      date: row.date || '',
      note: row.note || '',
    };
  });
  const materials = (workspace.tables.materials?.rows ?? []).map(row => {
    const quantity = parseAmount(row.quantity);
    const unitPrice = parseAmount(row.unitPrice);
    const estimated = quantity !== null && unitPrice !== null ? quantity * unitPrice : null;
    return {
      id: row.id,
      source: 'material' as const,
      name: row.name || '',
      category: row.segment || '物资',
      departmentId: row.departmentId || '',
      quantity,
      unitPrice,
      planned: estimated,
      actual: parseAmount(row.actual),
      owner: row.owner || '',
      status: row.status || '',
      date: '',
      note: row.unit || '',
    };
  });
  return [...expenses, ...materials].filter(line => line.name || line.planned !== null || line.actual !== null);
}

export function budgetSummary(plan: EventPlan, workspace: Workspace): BudgetSummary {
  const lines = buildBudgetLines(workspace);
  const departments = (workspace.workGroups ?? []).map(group => ({
    id: group.id,
    name: group.name,
    taskBudget: (group.tasks ?? []).reduce((sum, task) => sum + Math.max(0, Number(task.budget) || 0), 0),
    planned: 0,
    actual: 0,
  }));
  for (const line of lines) {
    const department = departments.find(item => item.id === line.departmentId || item.name === line.departmentId);
    if (!department) continue;
    department.planned += line.planned ?? 0;
    department.actual += line.actual ?? 0;
  }
  const planned = lines.reduce((sum, line) => sum + (line.planned ?? 0), 0);
  const actual = lines.reduce((sum, line) => sum + (line.actual ?? 0), 0);
  const missingPrice = lines.filter(line => line.planned === null).length;
  const invalid = (workspace.tables.expenses?.rows ?? []).filter(row => (row.actual ?? '').trim() && parseAmount(row.actual) === null).length;
  return {
    total: plan.brief.budget,
    taskAllocated: departments.reduce((sum, item) => sum + item.taskBudget, 0),
    planned,
    actual,
    missingPrice,
    invalid,
    overBudget: actual > plan.brief.budget || planned > plan.brief.budget,
    departments,
    lines,
  };
}

const SCORE = { 低: 1, 中: 2, 高: 3 } as const;

export function riskLevel(risk: RiskItem): '高' | '中' | '低' {
  const score = SCORE[risk.likelihood] * SCORE[risk.impact];
  return score >= 6 ? '高' : score >= 3 ? '中' : '低';
}

export function normalizeRiskTitle(value: string) {
  return value.replace(/（.*?）|\(.*?\)/g, '').replace(/\s+/g, '').toLowerCase();
}

function likelihoodOf(value: string): RiskItem['likelihood'] {
  const score = Number(value?.match(/\d/)?.[0] ?? 2);
  return score >= 3 ? '高' : score === 2 ? '中' : '低';
}

/** 从既有策划方案的风险表导入结构化记录，不修改原方案。 */
export function risksFromPlan(plan: EventPlan, workspace: Workspace, existing: RiskItem[] = []): RiskItem[] {
  const module = plan.modules.find(item => item.id === 'risk');
  const block = module?.blocks.find(item => item.kind === 'table' && item.head.some(head => head.includes('风险')));
  if (!block || block.kind !== 'table') return [];
  const seen = new Set(existing.map(risk => normalizeRiskTitle(risk.title)));
  return block.rows.flatMap(row => {
    const title = (row[0] ?? '').trim();
    if (!title || seen.has(normalizeRiskTitle(title))) return [];
    seen.add(normalizeRiskTitle(title));
    const owner = (row[6] ?? '').trim();
    const group = (workspace.workGroups ?? []).find(item => owner && (item.name.includes(owner) || owner.includes(item.name) || item.leader === owner));
    const cause = title.match(/（(.*?)）/)?.[1] ?? '';
    return [{
      id: uid(),
      title: title.replace(/（.*?）|\(.*?\)/g, '').trim(),
      description: cause || '来自已确认的策划方案，请补充具体诱因。',
      scope: '活动全程',
      likelihood: likelihoodOf(row[1] ?? ''),
      impact: likelihoodOf(row[2] ?? ''),
      departmentId: group?.id ?? '',
      prevention: row[4] ?? '',
      response: row[5] ?? '',
      confirmed: true,
    }];
  });
}

export function recommendCenterMode(plan: EventPlan, workspace: Workspace): { mode: 'light' | 'professional'; reasons: string[] } {
  const groups = workspace.workGroups ?? [];
  const tasks = flattenTasks(workspace);
  const reasons: string[] = [];
  let score = 0;
  if (plan.brief.people >= 100) { score += 2; reasons.push(`${plan.brief.people} 人参与`); }
  if (plan.brief.budget >= 30000) { score += 1; reasons.push('预算规模较大'); }
  if (plan.brief.days > 1) { score += 1; reasons.push('活动持续多日'); }
  if (groups.length >= 4) { score += 1; reasons.push(`${groups.length} 个工作组`); }
  if (tasks.length >= 12) { score += 1; reasons.push(`${tasks.length} 项筹备任务`); }
  if (plan.brief.durationMinutes >= 360) { score += 1; reasons.push('单日执行时间较长'); }
  if (['stadium', 'expo', 'hotel', 'mixed'].includes(plan.brief.venue)) { score += 1; reasons.push('场地与动线复杂'); }
  const lines = buildBudgetLines(workspace);
  if (lines.length >= 12) { score += 1; reasons.push('资源条目较多'); }
  return { mode: score >= 2 ? 'professional' : 'light', reasons: reasons.length ? reasons : ['人数、部门与资源规模较小'] };
}

export type CenterExportKind = 'full' | 'organization' | 'tasks' | 'schedule' | 'budget' | 'resources' | 'people' | 'risks';
export interface CenterExport { name: string; text: string; headers?: string[]; rows?: string[][] }

const money = (value: number | null) => value === null ? '待填写' : `¥${Number(value).toLocaleString()}`;

export function buildCenterExport(kind: CenterExportKind, plan: EventPlan, workspace: Workspace): CenterExport {
  const groups = workspace.workGroups ?? [];
  const tasks = flattenTasks(workspace);
  const riskRows = workspace.risks ?? [];
  const budget = budgetSummary(plan, workspace);
  if (kind === 'full') {
    const center: string[] = [];
    if (riskRows.length) {
      center.push('', '## 组织中心风险登记', '');
      for (const risk of riskRows) center.push(`- ${risk.title}｜等级 ${riskLevel(risk)}｜可能性 ${risk.likelihood}｜影响 ${risk.impact}｜责任部门 ${departmentName(workspace, risk.departmentId) || '待确认'}`);
    }
    if (budget.lines.length) center.push('', `## 组织中心预算台账`, '', `计划预算 ${money(budget.total)}；已登记预计支出 ${money(budget.planned)}；实际支出 ${money(budget.actual)}。`, budget.missingPrice ? `另有 ${budget.missingPrice} 项尚未填写价格，未计入合计。` : '');
    return { name: '完整活动组织方案', text: `${buildCharterMarkdown(plan, workspace)}${center.join('\n')}` };
  }
  if (kind === 'organization') {
    return {
      name: '组织架构表',
      text: '',
      headers: ['部门', '负责人', '成员', '汇报对象', '职责', '任务数'],
      rows: [['总负责人', workspace.profile.owner || '待确认', '', '', '', ''], ['总协调人', workspace.profile.coordinator || '待确认', '', '', '', ''], ...groups.map(group => [group.name, group.leader || '待确认', group.members || '待确认', departmentName(workspace, group.reportsTo || '') || '总协调人', group.duties || '待补充', String(group.tasks.length)])],
    };
  }
  if (kind === 'tasks') {
    return {
      name: '工作任务表',
      text: '',
      headers: ['任务', '部门', '负责人', '开始', '截止', '优先级', '状态', '前置任务', '资源', '预算'],
      rows: tasks.map(({ group, task }) => [task.title || '未命名', group.name, task.owner || '待确认', task.start || '待定', task.due || '待定', task.priority ?? '中', task.status, tasks.find(item => item.task.id === task.dependsOn)?.task.title ?? '无', task.resources || '待确认', String(task.budget || 0)]),
    };
  }
  if (kind === 'schedule') {
    return {
      name: '活动日程表',
      text: '',
      headers: ['开始', '结束', '环节', '负责人', '部门', '场地', '设备', '状态', '备注'],
      rows: [...workspace.flow].sort((a, b) => (a.start || '99:99').localeCompare(b.start || '99:99')).map(node => [node.start || '待定', node.end || '待定', node.title || '未命名', node.owner || '待确认', departmentName(workspace, node.department || ''), node.venue || '待确认', node.equipment || '待确认', node.status, node.note || '']),
    };
  }
  if (kind === 'budget') {
    return {
      name: '预算表',
      text: '',
      headers: ['项目', '类别', '部门', '数量', '单价', '预计支出', '实际支出', '负责人', '状态', '来源'],
      rows: budget.lines.map(line => [line.name || '未命名', line.category, departmentName(workspace, line.departmentId) || '未指定', line.quantity === null ? '待填写' : String(line.quantity), money(line.unitPrice), money(line.planned), money(line.actual), line.owner || '待确认', line.status || '待确认', line.source === 'material' ? '物资' : '经费']),
    };
  }
  if (kind === 'resources') {
    const materials = workspace.tables.materials?.rows ?? [];
    return {
      name: '物资清单',
      text: '',
      headers: ['物资', '数量', '单位', '单价', '预计费用', '使用环节', '负责人', '状态', '实际费用'],
      rows: materials.map(row => {
        const quantity = parseAmount(row.quantity);
        const unitPrice = parseAmount(row.unitPrice);
        return [row.name || '未命名', row.quantity || '待填写', row.unit || '', money(unitPrice), money(quantity !== null && unitPrice !== null ? quantity * unitPrice : null), row.segment || '', row.owner || '待确认', row.status || '待确认', money(parseAmount(row.actual))];
      }),
    };
  }
  if (kind === 'people') {
    const people = workspace.people.length
      ? workspace.people.map(person => [person.name, person.roles.join('、'), workspace.organizations.find(org => org.id === person.organizationId)?.name ?? '', person.fields.note ?? ''])
      : groups.flatMap(group => group.members.split(/[,，、\n]/).map(name => name.trim()).filter(Boolean).map(name => [name, `工作组成员`, group.name, group.leader ? `负责人：${group.leader}` : '']));
    return { name: '人员名单', text: '', headers: ['姓名或代号', '角色', '组织/部门', '备注'], rows: people };
  }
  return {
    name: '风险与应急表',
    text: '',
    headers: ['风险', '影响范围', '可能性', '影响', '等级', '责任部门', '预防措施', '应对方案'],
    rows: riskRows.map(risk => [risk.title, risk.scope || '活动全程', risk.likelihood, risk.impact, riskLevel(risk), departmentName(workspace, risk.departmentId) || '待确认', risk.prevention || '待补充', risk.response || '待补充']),
  };
}

export function importPlanBudget(plan: EventPlan, workspace: Workspace): { workspace: Workspace; added: number } {
  const block = plan.modules.flatMap(module => module.blocks).find(item => item.kind === 'budget');
  if (!block || block.kind !== 'budget') return { workspace, added: 0 };
  const secured = ensureCenterTables(workspace);
  const old = secured.tables.expenses;
  const existing = new Set((old?.rows ?? []).map(row => row.planRowId).filter(Boolean));
  const rows: DataRow[] = block.rows.filter(row => !existing.has(row.id)).map(row => ({
    id: uid(),
    planRowId: row.id,
    item: row.item,
    category: row.category,
    departmentId: '',
    quantity: '',
    unitPrice: '',
    budget: String(row.amount),
    actual: '',
    date: '',
    owner: '',
    status: '待采购',
    note: row.note ?? '',
  }));
  if (!rows.length) return { workspace: secured, added: 0 };
  return { workspace: { ...secured, tables: { ...secured.tables, expenses: { ...old!, fields: old?.fields?.length ? old.fields : EXPENSE_FIELDS, rows: [...(old?.rows ?? []), ...rows], revision: (old?.revision ?? 0) + 1 } } }, added: rows.length };
}
