import { describe, expect, it } from 'vitest';
import { createBrief, refreshBrief, updateField } from './intake';
import { generatePlan } from './generator';
import { buildPlanMarkdown } from './export';
import { editBudgetRow } from './budget';

const NOW = new Date('2026-11-01T10:00:00');
const marathonBrief = createBrief('办一场 800 人的校园马拉松，预算 6 万，户外赛道，11月20日', { now: NOW });
const marathon = generatePlan(marathonBrief);

const moduleOf = (plan: typeof marathon, id: string) => plan.modules.find((module) => module.id === id)!;
const budgetBlock = (plan: typeof marathon) => {
  const block = moduleOf(plan, 'budget').blocks.find((item) => item.kind === 'budget');
  if (!block || block.kind !== 'budget') throw new Error('缺少预算块');
  return block;
};

describe('通用引擎：结构与权重', () => {
  it('始终产出 12 个模块', () => {
    expect(marathon.modules).toHaveLength(12);
    expect(marathon.modules.map((module) => module.id)).toEqual([
      'basic', 'goals', 'audience', 'logistics', 'program', 'organization',
      'resources', 'budget', 'promotion', 'execution', 'risk', 'evaluation',
    ]);
  });

  it('按活动性质调整模块权重', () => {
    expect(moduleOf(marathon, 'risk').weight).toBe('key');
    expect(moduleOf(marathon, 'logistics').weight).toBe('key');

    const conference = generatePlan(createBrief('办一场 200 人的学术会议，预算 4 万，酒店会议室', { now: NOW }));
    expect(moduleOf(conference, 'program').weight).toBe('key');
    expect(moduleOf(conference, 'risk').weight).toBe('brief');
    expect(moduleOf(conference, 'risk').blocks.length).toBeLessThanOrEqual(4);
  });

  it('重点模块带重点提示，简要模块更短', () => {
    const risk = moduleOf(marathon, 'risk');
    expect(risk.blocks[0]).toMatchObject({ kind: 'text' });
    const conference = generatePlan(createBrief('办一场 200 人的学术会议，预算 4 万', { now: NOW }));
    const riskBrief = moduleOf(conference, 'risk');
    const riskKey = moduleOf(marathon, 'risk');
    expect(riskBrief.blocks.length).toBeLessThan(riskKey.blocks.length);
  });
});

describe('通用引擎：预算与时间', () => {
  it('学校已提供场地与设备时，不再把对应租赁费用计入预计支出', () => {
    const brief=createBrief('学校田径运动会，1000 人，预算 3 万；操场和计时设备由学校免费提供', {now:NOW});
    const block=budgetBlock(generatePlan(brief));
    expect(block.rows.filter(row=>['场地','设备'].includes(row.bucket)).every(row=>row.amount===0)).toBe(true);
    expect(block.total).toBeLessThan(brief.budget);
    expect(block.rows.reduce((sum,row)=>sum+row.amount,0)).toBe(block.total);
    expect(block.note).toContain('预算上限');
  });
  it('AI 问答中确认已有场地时，也不重复估算场地费', () => {
    const brief=createBrief('校园讲座，100 人，预算 5000 元', {now:NOW});
    const withAnswer={...brief,aiDraft:{flow:[],staff:[],materials:[],features:[],questions:[],conversation:[{question:'场地如何安排？',answer:'学校礼堂已经免费提供，不需要支付场地费'}]}};
    const block=budgetBlock(generatePlan(withAnswer));
    expect(block.rows.filter(row=>row.bucket==='场地').every(row=>row.amount===0)).toBe(true);
  });
  it('策划阶段的 AI 问答确认已有设备时，更新设备预算', () => {
    const brief=createBrief('校园讲座，100 人，预算 5000 元', {now:NOW});
    const updated={...brief,aiDraft:{flow:[],staff:[],materials:[],features:[],questions:[],stageAnswers:{resources:[{question:'设备如何安排？',answer:'投影和音响由学校免费提供'}]}}};
    const block=budgetBlock(generatePlan(updated));
    expect(block.rows.filter(row=>row.bucket==='设备').every(row=>row.amount===0)).toBe(true);
  });
  it('预算分项之和等于总预算', () => {
    const block = budgetBlock(marathon);
    const sum = block.rows.reduce((total, row) => total + row.amount, 0);
    expect(sum).toBe(60000);
    expect(block.total).toBe(60000);
  });

  it('手动修改预算后重算合计与占比', () => {
    const before = budgetBlock(marathon);
    const target = before.rows[0];
    const edited = editBudgetRow(marathon, target.id, 30000);
    const after = budgetBlock(edited);
    expect(after.rows[0].amount).toBe(30000);
    expect(after.total).toBe(before.total - target.amount + 30000);
    expect(after.rows.reduce((sum, row) => sum + row.amount, 0)).toBe(after.total);
    expect(Math.round(after.rows[0].share * 100)).toBeGreaterThan(0);
    expect(after.note).toContain('分项合计');

  });

  it('零预算走借用与赞助策略，不生成空表格', () => {
    const brief = updateField(createBrief('办一场读书会，20 人', { now: NOW }), 'budget', '0');
    const plan = generatePlan(brief);
    const first = moduleOf(plan, 'budget').blocks[0];
    expect(first.kind).toBe('text');
    expect(JSON.stringify(moduleOf(plan, 'budget').blocks)).toContain('零预算');
  });

  it('时间线覆盖完整时长且首尾衔接', () => {
    const program = moduleOf(marathon, 'program');
    const timeline = program.blocks.find((block) => block.kind === 'timeline');
    if (!timeline || timeline.kind !== 'timeline') throw new Error('缺少时间线');
    expect(timeline.entries.length).toBeGreaterThanOrEqual(5);
    const first = timeline.entries[0].time.split('–')[0];
    const last = timeline.entries.at(-1)!.time.split('–')[1];
    const toMinutes = (value: string) => Number(value.split(':')[0]) * 60 + Number(value.split(':')[1]);
    expect(toMinutes(last) - toMinutes(first)).toBe(marathonBrief.durationMinutes);
  });

  it('多日活动提示多日安排', () => {
    const plan = generatePlan(refreshBrief({ ...marathonBrief, days: 3 }));
    expect(JSON.stringify(moduleOf(plan, 'logistics').blocks)).toContain('多日安排');
  });
});

describe('通用引擎：内容差异', () => {
  it('马拉松强化医疗与补给，学术会议强化议程与嘉宾', () => {
    const marathonText = JSON.stringify(marathon.modules);
    expect(marathonText).toContain('医疗');
    expect(marathonText).toContain('补给');

    const conference = generatePlan(createBrief('学术会议，200 人，预算 4 万', { now: NOW }));
    const conferenceText = JSON.stringify(conference.modules);
    expect(conferenceText).toContain('主旨报告');
    expect(conferenceText).toContain('论文');
  });

  it('人员规模随人数增长并封顶', () => {
    const small = generatePlan(createBrief('20 人的部门团建', { now: NOW }));
    const big = generatePlan(createBrief('2000 人的校园马拉松，预算 20 万', { now: NOW }));
    const staffTotal = (plan: typeof marathon) => {
      const staff = moduleOf(plan, 'organization').blocks.find((block) => block.kind === 'staff');
      if (!staff || staff.kind !== 'staff') return 0;
      return staff.rows.reduce((sum, row) => sum + row.count, 0);
    };
    expect(staffTotal(big)).toBeGreaterThan(staffTotal(small));
  });

  it('导出文本包含标题、假设与全部章节', () => {
    const markdown = buildPlanMarkdown(marathon);
    expect(markdown).toContain(`# ${marathon.title}`);
    expect(markdown).toContain('## 8. 经费预算');
    expect(markdown).toContain('| 科目 | 项目 | 金额 | 占比 |');
    expect(markdown).toContain('核算方式');
  });
});
