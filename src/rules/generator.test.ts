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
const draftBrief = {
  ...marathonBrief,
  aiDraft: {
    flow: ['检录与存包', '补给站布置', '起跑', '赛道补给与医疗值守', '关门与颁奖', '疏散与清场'],
    staff: ['总指挥', '竞赛组', '裁判组', '医疗保障组', '安全保卫组', '后勤保障组', '宣传组', '志愿者'],
    materials: ['完赛奖牌', '饮水/补给', 'AED 与急救包', '隔离带'],
    features: [],
    questions: [],
  },
};
const draftPlan = generatePlan(draftBrief);

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

describe('AI 初稿：岗位、物资、时间线与嘉宾', () => {
  const staffBlock = moduleOf(draftPlan, 'organization').blocks.find((block) => block.kind === 'staff');
  if (!staffBlock || staffBlock.kind !== 'staff') throw new Error('缺少人员表');
  const tableBlock = (id: string) => {
    const block = moduleOf(draftPlan, id).blocks.find((item) => item.kind === 'table');
    if (!block || block.kind !== 'table') throw new Error(`缺少表格：${id}`);
    return block;
  };

  it('AI 初稿岗位保留随人数增长的配比和真实职责', () => {
    const medical = staffBlock.rows.find((row) => row.role === '医疗保障组');
    const security = staffBlock.rows.find((row) => row.role === '安全保卫组');
    expect(medical?.count).toBeGreaterThan(1);
    expect(security?.count).toBeGreaterThan(1);
    expect(medical?.duty).toBeTruthy();
    expect(staffBlock.rows.reduce((sum, row) => sum + row.count, 0)).toBeGreaterThan(30);
    expect(JSON.stringify(moduleOf(draftPlan, 'organization').blocks)).not.toContain('AI 初稿建议岗位');
    expect(JSON.stringify(moduleOf(draftPlan, 'organization').blocks)).not.toContain('职责待确认');
  });

  it('风险责任人对应到真实岗位', () => {
    const roles = new Set(staffBlock.rows.map((row) => row.role));
    const risk = tableBlock('risk');
    expect(risk.rows.every((row) => roles.has(row[6]))).toBe(true);
  });

  it('完赛奖牌与饮水按参赛规模和活动类型估算', () => {
    const resources = tableBlock('resources');
    const medal = resources.rows.find((row) => row[0] === '完赛奖牌');
    const water = resources.rows.find((row) => row[0] === '饮水/补给');
    expect(Number.parseInt(medal?.[1] ?? '0', 10)).toBeGreaterThanOrEqual(800);
    expect(Number.parseInt(water?.[1] ?? '0', 10)).toBeGreaterThanOrEqual(1600);
    const baseResources = moduleOf(marathon, 'resources').blocks.find((block) => block.kind === 'table');
    if (!baseResources || baseResources.kind !== 'table') throw new Error('缺少物资表');
    const baseMedal = baseResources.rows.find((row) => row[0].includes('奖牌'));
    expect(Number.parseInt(baseMedal?.[1] ?? '0', 10)).toBeGreaterThanOrEqual(800);
  });

  it('全程并行的值守环节不占用串行时段', () => {
    const timeline = moduleOf(draftPlan, 'program').blocks.find((block) => block.kind === 'timeline');
    if (!timeline || timeline.kind !== 'timeline') throw new Error('缺少时间线');
    const parallel = timeline.entries.find((entry) => entry.title.includes('赛道补给与医疗值守'));
    expect(parallel?.title).toContain('全程并行');
    expect(parallel?.detail).toContain('不单独占用');
    expect(parallel?.time.split('–')[1]).toBe('13:00');
    expect(timeline.entries.find((entry) => entry.title.includes('补给站布置'))?.title).not.toContain('全程并行');
    const serial = timeline.entries.filter((entry) => !entry.title.includes('全程并行'));
    expect(serial.at(-1)?.time.split('–')[1]).toBe('13:00');
  });

  it('未提及嘉宾时不虚增嘉宾人数', () => {
    expect(JSON.stringify(moduleOf(draftPlan, 'audience').blocks)).not.toContain('嘉宾 / 媒体');
    const mentioned = generatePlan(createBrief('800 人校园马拉松，邀请媒体和赞助商到场', { now: NOW }));
    expect(JSON.stringify(moduleOf(mentioned, 'audience').blocks)).toContain('嘉宾 / 媒体');
  });

  it('大型活动自动补齐医疗与安全岗位，风险责任人可对上号', () => {
    const plan = generatePlan(createBrief('400 人的校园迎新活动，预算 8000 元，学校操场', { now: NOW }));
    const staff = moduleOf(plan, 'organization').blocks.find((block) => block.kind === 'staff');
    if (!staff || staff.kind !== 'staff') throw new Error('缺少人员表');
    const roles = staff.rows.map((row) => row.role);
    expect(roles.some((role) => /医疗|急救/.test(role))).toBe(true);
    expect(roles.some((role) => /安保|安全|秩序/.test(role))).toBe(true);
    const risk = moduleOf(plan, 'risk').blocks.find((block) => block.kind === 'table');
    if (!risk || risk.kind !== 'table') throw new Error('缺少风险表');
    expect(risk.rows.every((row) => roles.includes(row[6]))).toBe(true);
  });
});
