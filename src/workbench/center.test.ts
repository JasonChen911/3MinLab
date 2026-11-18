import { describe, expect, it } from 'vitest';
import { createBrief } from '../rules/intake';
import { generatePlan } from '../rules/generator';
import { createWorkspace, uid, type WorkGroup, type WorkGroupTask, type Workspace } from './model';
import { budgetSummary, buildCenterExport, importPlanBudget, normalizeWorkspace, recommendCenterMode, risksFromPlan, scheduleIssues, taskIssues } from './center';

const plan = generatePlan(createBrief('校园音乐节，600 人，预算 5 万，户外场地', { now: new Date('2026-11-01T10:00:00') }));

function task(patch: Partial<WorkGroupTask> = {}): WorkGroupTask {
  return { id: uid(), title: '场地确认', content: '', owner: '张同学', collaborators: '', start: '2026-11-10', due: '2026-11-12', resources: '', budget: 0, dependsOn: '', deliverable: '', status: '未开始', priority: '中', ...patch };
}

function group(name: string, tasks: WorkGroupTask[]): WorkGroup {
  return { id: uid(), name, leader: '李同学', members: '张同学,王同学', contact: '', goal: '', duties: '', reporting: '', reportsTo: '', tasks };
}

function workspace(groups: WorkGroup[] = []): Workspace {
  return { ...createWorkspace(plan), workGroups: groups };
}

describe('组织中心数据与核查', () => {
  it('旧任务状态与缺失字段无损升级', () => {
    const data = workspace([group('统筹组', [{ ...task(), status: '待开始', priority: undefined }])]);
    const next = normalizeWorkspace(data);
    expect(next.workGroups?.[0].tasks[0].status).toBe('未开始');
    expect(next.workGroups?.[0].tasks[0].priority).toBe('中');
    expect(next.profile.coordinator).toBe('');
    expect(next.risks).toEqual([]);
    expect(next.workGroups?.[0].tasks[0].title).toBe('场地确认');
  });

  it('检测缺负责人、日期倒置、依赖未完成、重复任务和负责人时间重叠', () => {
    const parent = task({ title: '场地审批', owner: '张同学', start: '2026-11-01', due: '2026-11-20', status: '进行中' });
    const child = task({ title: '发布报名', owner: '张同学', start: '2026-11-10', due: '2026-11-15', dependsOn: parent.id, status: '进行中' });
    const missing = task({ title: '物资采购', owner: '', start: '2026-11-15', due: '2026-11-10' });
    const duplicate = task({ title: '物资采购', owner: '王同学', start: '2026-11-05', due: '2026-11-06' });
    const issues = taskIssues(workspace([group('统筹组', [parent, child, missing]), group('后勤组', [duplicate])]), '2026-11-18');
    const messages = issues.map(issue => issue.message).join('\n');
    expect(messages).toContain('缺少负责人');
    expect(messages).toContain('截止日期早于开始日期');
    expect(messages).toContain('前置任务');
    expect(messages).toContain('重复出现');
    expect(messages).toContain('时间重叠');
    expect(messages).toContain('已逾期');
    expect(issues.some(issue => issue.level === 'error')).toBe(true);
  });

  it('检测活动日程时间格式与同场地重叠', () => {
    const issues = scheduleIssues([
      { id: 'a', start: '14:00', end: '15:00', title: '开幕式', owner: '', people: [], venue: '主舞台', equipment: '', status: '待执行', note: '' },
      { id: 'b', start: '14:30', end: '16:00', title: '演出', owner: '', people: [], venue: '主舞台', equipment: '', status: '待执行', note: '' },
      { id: 'c', start: '9:00', end: '10:00', title: '入场', owner: '', people: [], venue: '入口', equipment: '', status: '待执行', note: '' },
      { id: 'd', start: '15:00', end: '14:00', title: '撤场', owner: '', people: [], venue: '侧台', equipment: '', status: '待执行', note: '' },
    ]);
    const messages = issues.map(issue => issue.message).join('\n');
    expect(messages).toContain('结束时间不晚于开始时间');
    expect(messages).toContain('时间重叠');
    expect(messages).toContain('时间格式无效');
  });

  it('未填写价格不当作 0 元，数量乘单价自动计算', () => {
    const data = workspace([group('后勤组', [task({ budget: 1200 })])]);
    data.tables.expenses = {
      id: 'expenses', name: '经费', fields: [], revision: 1, rows: [
        { id: 'e1', item: '舞台租赁', category: '场地', quantity: '1', unitPrice: '3000', budget: '', actual: '', owner: '李同学', departmentId: data.workGroups![0].id },
        { id: 'e2', item: '未报价音箱', category: '设备', quantity: '2', unitPrice: '', budget: '', actual: '', owner: '李同学' },
        { id: 'e3', item: '已支付饮水', category: '物资', budget: '400', actual: '380', owner: '王同学' },
      ],
    };
    const summary = budgetSummary(plan, data);
    expect(summary.lines.find(line => line.name === '舞台租赁')?.planned).toBe(3000);
    expect(summary.lines.find(line => line.name === '未报价音箱')?.planned).toBeNull();
    expect(summary.missingPrice).toBe(1);
    expect(summary.actual).toBe(380);
    expect(summary.taskAllocated).toBe(1200);
    expect(summary.departments[0].planned).toBe(3000);
  });

  it('从既有方案导入风险与预算，保持单一数据源', () => {
    const data = workspace([group('统筹组', [])]);
    const importedRisks = risksFromPlan(plan, data);
    expect(importedRisks.length).toBeGreaterThan(0);
    expect(importedRisks[0].title).not.toContain('（');
    expect(importedRisks.every(risk => ['低', '中', '高'].includes(risk.likelihood))).toBe(true);
    const imported = importPlanBudget(plan, data);
    expect(imported.added).toBeGreaterThan(0);
    expect(imported.workspace.tables.expenses?.rows.length).toBe(imported.added);
    expect(imported.workspace.tables.expenses?.rows[0].status).toBe('待采购');
  });

  it('根据组织复杂度而非仅人数推荐模式', () => {
    expect(recommendCenterMode(plan, workspace([])).mode).toBe('professional');
    const small = generatePlan(createBrief('宿舍桌游聚会，8 人', { now: new Date('2026-11-01T10:00:00') }));
    const smallData = { ...createWorkspace(small), workGroups: [group('执行组', [task()])] };
    expect(recommendCenterMode(small, smallData).mode).toBe('light');
  });

  it('导出任务表使用统一任务与部门数据', () => {
    const data = workspace([group('统筹组', [task({ title: '确认流程', priority: '高' })])]);
    const out = buildCenterExport('tasks', plan, data);
    expect(out.headers).toContain('部门');
    expect(out.rows?.[0]).toContain('统筹组');
    expect(out.rows?.[0]).toContain('高');
  });
});
