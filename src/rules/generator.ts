import { knowledgeFor, type FamilyKnowledge, type KnowledgeContext, type RoleTemplate } from '../data/knowledge';
import { getPreset, type ScenarioPreset } from '../data/presets';
import { recommendPlanningMode } from '../planning/mode';
import { FAMILY_TASKS, PHASES, type RoleHint } from '../data/phases';
import {
  getCategory,
  getFamily,
  getModule,
  MODULES,
  resolveWeights,
  scaleOf,
  shortLabel,
  venueLabel,
} from '../data/taxonomy';
import { suggestInteractions } from './activityIdeas';
import { allocateBudget, formatMoney, perCapita } from './budget';
import { formatDateLabel, formatDurationLabel } from './intake';
import type {
  Block,
  BudgetRow,
  EventBrief,
  EventPlan,
  KpiRow,
  ModuleId,
  PlanModule,
  StaffRow,
  TimelineEntry,
  Weight,
} from '../types';

/* ============================================================
 * 通用策划引擎
 *
 * 输入：结构化需求（EventBrief）
 * 输出：12 模块方案（EventPlan）
 *
 * 引擎不包含任何具体活动类型的文案：所有差异都来自
 * taxonomy（类型与权重）和 knowledge（议程/预算/风险/角色…）配置。
 * 新增活动类型只需扩充配置，本文件不需要修改。
 * ============================================================ */

/* ---------------- 文案素材（族级/类型级） ---------------- */

const SLOGANS: Record<string, string> = {
  'campus-welcome': '从这里，开始你的大学',
  'campus-club': '找到你的同类',
  'campus-anniversary': '回到故事开始的地方',
  'academic-lecture': '把一个问题讲透',
  'academic-conference': '让思想在会场流动',
  'academic-contest': '以实力，见高下',
  'academic-salon': '小桌旁的深度对话',
  'sports-match': '赛场见真章',
  'sports-meet': '为每一次冲刺鼓掌',
  'sports-marathon': '跑过这条街，记住这座城',
  'sports-outdoor': '走出去，才看得见彼此',
  'charity-service': '把善意落到具体的人身上',
  'charity-fundraise': '每一份善意都有回响',
  'charity-green': '让改变从脚下开始',
  'business-conference': '把共识变成下一步',
  'business-launch': '让世界看见它',
  'business-annual': '一起走过的这一年',
  'business-expo': '在这里，遇见整个行业',
  'startup-contest': '好项目，值得被看见',
  'startup-roadshow': '让资本听懂你的故事',
  'arts-festival': '把夏天交给音乐',
  'arts-culture': '传统的，也可以很年轻',
  'arts-exhibition': '在作品前多站一会儿',
  'arts-performance': '灯亮起的那一刻',
  'arts-graduation': '把告别，办成一场盛典',
  'education-popular': '好奇心是最好的老师',
  'education-workshop': '动手，才算学会',
  'career-jobfair': '把简历递到对的人手里',
  'career-talk': '听过来人讲讲',
  'career-info': '先了解，再选择',
  'social-teambuilding': '先成为队友，再成为同事',
  'social-party': '好好吃饭，好好说话',
  'social-festival': '把节日过成自己的',
  'social-trip': '把日常换个背景',
  'generic-event': '让想法落地',
};

const SECONDARY_GOALS: Record<string, string> = {
  campus: '让参与者在离场前至少完成一次互动，并加入后续社群',
  academic: '形成可沉淀的内容产出（纪要、论文集或录像）',
  sports: '在安全前提下完成全部赛程，保证参与者完整体验',
  charity: '让服务对象获得可感知、可核验的实际帮助',
  business: '完成信息传递并收集可跟进的商务线索',
  startup: '筛选出可进入下一轮孵化或投资的项目',
  arts: '完成一场可直接对外传播的演出或展览',
  education: '让参与者能复述并应用至少三个关键要点',
  career: '促成企业与候选人之间的有效面谈',
  social: '让每位参与者至少与三位新朋友产生交流',
  generic: '形成可复用的流程与素材，降低下次活动的成本',
};

const ARTIFACTS: Record<string, string[]> = {
  campus: ['报名与签到名单（可用于后续拉群）', '现场照片与短视频素材', '活动复盘记录'],
  academic: ['会议手册与议程单', '论文摘要集或会议纪要', '录播与现场照片'],
  sports: ['赛程表与成绩册', '医疗与安全记录', '赛事照片与传播素材'],
  charity: ['服务对象清单与物资签收记录', '志愿者服务时长证明', '善款与物资公示'],
  business: ['签到与嘉宾名单', '媒体通稿与传播报告', '商务线索表'],
  startup: ['评分表与最终排名', '参赛项目库', '投资/产业对接记录'],
  arts: ['节目单或展签', '现场影像素材', '传播数据报告'],
  education: ['课程材料与任务卡', '学员作品或实验记录', '学习效果问卷'],
  career: ['企业与岗位清单', '简历与意向统计', '面试跟进表'],
  social: ['账单与费用分摊记录', '现场照片', '活动小结'],
  generic: ['方案文档', '签到表', '复盘记录'],
};

const VENUE_REQUIREMENTS: Record<string, string[]> = {
  'indoor-small': ['桌椅可移动，按人数排布（建议每桌 6–8 人）', '电源与网络稳定', '隔音良好，避免与相邻活动互相干扰'],
  'indoor-large': ['舞台尺寸与投影亮度满足主屏需求', '座位数与预计人数匹配（留 10% 余量）', '消防通道畅通，有明确疏散指引'],
  outdoor: ['地面平整、无障碍物，雨天有备选方案', '电源接入点与线缆防护', '夜间活动需照明与反光标识', '确认场地使用许可与噪音时段'],
  stadium: ['场地与器材房预约确认', '更衣室、洗手间、医疗通道可用', '看台与比赛区隔离', '雨天/高温备用方案'],
  hotel: ['宴会厅层高与承重满足搭建', 'AV 接口与电力容量确认', '餐饮最低消费与超时费', '停车与接送动线'],
  expo: ['展位电力与网络接入', '搭建图纸审批与消防报备', '卸货通道与撤展时间窗口', '人流分区与限流方案'],
  online: ['直播平台账号与推流权限', '主讲端带宽与备份网络', '录播与回放设置', '互动与提问工具'],
  mixed: ['主会场与户外区的动线衔接', '户外部分的天气备用方案', '两区域的对讲机与广播覆盖'],
};

const START_HOUR: Record<string, number> = {
  'sports-marathon': 7,
  'sports-meet': 8,
  'social-trip': 8,
  'business-annual': 17,
  'arts-performance': 19,
  'arts-graduation': 18,
  'social-party': 18,
  'arts-festival': 15,
  'business-launch': 14,
};

const GUEST_WEIGHT: Record<string, number> = {
  'business-launch': 0.2,
  'business-conference': 0.12,
  'business-expo': 0.15,
  'academic-conference': 0.08,
  'arts-performance': 0.03,
  'arts-festival': 0.02,
  'career-jobfair': 0.03,
};

const GUEST_LABEL: Record<string, string> = {
  campus: '嘉宾、校友与媒体',
  academic: '嘉宾与讲者',
  sports: '嘉宾、赞助商与媒体',
  charity: '合作方与受助方代表',
  business: '客户、媒体与嘉宾',
  startup: '评委与投资人',
  arts: '嘉宾与媒体',
  education: '家长与嘉宾',
  career: '企业代表与嘉宾',
  social: '亲友',
  generic: '嘉宾、领导与媒体',
};

/* ---------------- 通用小工具 ---------------- */

const clock = (minutes: number) => {
  const h = Math.floor(minutes / 60) % 24;
  const m = Math.round(minutes % 60);
  return `${`${h}`.padStart(2, '0')}:${`${m}`.padStart(2, '0')}`;
};

const dateShort = (iso: string) => {
  if (!iso) return '日期待定';
  const date = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(date.getTime())) return '日期待定';
  return `${date.getMonth() + 1}月${date.getDate()}日`;
};

const round5 = (value: number) => Math.max(5, Math.round(value / 5) * 5);

function riskLevel(likelihood: number, impact: number) {
  const score = likelihood * impact;
  if (score >= 6) return '高';
  if (score >= 3) return '中';
  return '低';
}

function computeStaff(roles: RoleTemplate[], people: number, staffScale = 1): StaffRow[] {
  return roles.map((role) => {
    const extra = role.perPeople > 0 ? Math.floor(people / role.perPeople) : 0;
    const base = Math.min(role.max, Math.max(role.min, role.fixed + extra));
    const count = Math.max(1, Math.round(base * staffScale));
    return {
      role: role.role,
      count,
      duty: role.duty,
      layer: layerOf(role.role),
      basis: role.perPeople > 0 ? `每 ${role.perPeople} 人配 1 名，基数 ${role.fixed}` : `固定 ${role.fixed} 名`,
    };
  });
}

/* ---------------- 组织层级、任务负责人与预算归类 ---------------- */

const LAYERS: { name: string; pattern: RegExp }[] = [
  { name: '决策', pattern: /总指挥|总协调|项目总监|总导演|召集人|赛事负责人|项目负责人|主席|总监/ },
  { name: '策划与内容', pattern: /策划|节目|竞赛|学术|评委|评审|主持|讲解|编导|课程|教研/ },
  { name: '传播与外联', pattern: /宣传|媒体|票务|接待|外联|企业|投资|嘉宾|摄影|记录/ },
  { name: '执行与保障', pattern: /.*/ },
];

const layerOf = (role: string) => LAYERS.find((layer) => layer.pattern.test(role))!.name;

const OWNER_PATTERNS: Record<RoleHint, RegExp> = {
  lead: /总指挥|总协调|项目总监|总导演|召集人|赛事负责人|项目负责人|主席|总监/,
  content: /策划|节目|竞赛|学术|评委|评审|主持|讲解|编导|课程|教研/,
  promotion: /宣传|媒体|票务|接待|外联|企业|投资|嘉宾|摄影|记录/,
  logistics: /后勤|物资|会务|采购|保障/,
  safety: /安保|医疗|安全|疏散/,
  tech: /技术|音响|灯光|设备|舞台/,
};

/** 把任务里的角色提示映射到本场活动真实存在的岗位 */
function ownerFor(hint: RoleHint, staff: StaffRow[]): string {
  const hit = staff.find((row) => OWNER_PATTERNS[hint].test(row.role));
  if (hit) return hit.role;
  const lead = staff.find((row) => OWNER_PATTERNS.lead.test(row.role));
  return lead?.role ?? staff[0]?.role ?? '总协调';
}

function isoPlusDays(iso: string, days: number) {
  const date = new Date(`${iso}T00:00:00`);
  date.setDate(date.getDate() + days);
  return date;
}

/** 相对令牌 → 真实日期或相对描述 */
function dueLabel(token: string, brief: EventBrief): string {
  if (token === 'D') return '活动当天';
  if (token === 'D-2h') return '当天开始前 2 小时';
  if (token === 'D-start') return '当天签到开始';
  if (token === 'D-end') return '当天结束前 30 分钟';
  if (token === 'D+2h') return '当天结束后 2 小时内';
  const match = token.match(/^T([+-])(\d+)$/);
  if (!match) return token;
  const offset = (match[1] === '-' ? -1 : 1) * Number(match[2]);
  if (!brief.date) return offset < 0 ? `活动前 ${Math.abs(offset)} 天` : `活动后 ${offset} 天`;
  const date = isoPlusDays(brief.date, offset);
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

const BUDGET_BUCKETS = ['场地', '设备', '物资', '人员', '宣传', '交通', '餐饮', '应急备用金'] as const;

const BUCKET_RULES: { bucket: string; pattern: RegExp }[] = [
  { bucket: '应急备用金', pattern: /应急|机动|备用金|保险/ },
  { bucket: '交通', pattern: /交通|接驳|运输|差旅|车辆|大巴|代驾|停车/ },
  { bucket: '餐饮', pattern: /餐饮|茶歇|饮水|酒水|晚宴|食品|零食|餐食/ },
  { bucket: '宣传', pattern: /宣传|媒体|推广|海报|印刷|直播|票务|传播|视觉/ },
  { bucket: '人员', pattern: /人员|人力|酬金|裁判|评委|讲师|嘉宾|艺人|主持|志愿|安保|医疗|导演|兼职|劳务|评审|教练/ },
  { bucket: '设备', pattern: /设备|AV|音响|灯光|LED|屏|投影|计时|器材|对讲机|电源|舞台|搭建|桁架|麦克风/ },
  { bucket: '场地', pattern: /场地|展位|场馆|帐篷|桌椅|布置|租赁/ },
];

/** 把细科目映射到 8 个标准预算类别 */
function bucketOf(category: string, item: string): string {
  const text = `${category}${item}`;
  return BUCKET_RULES.find((rule) => rule.pattern.test(text))?.bucket ?? '物资';
}

/** 物资的用途、采购优先级与责任岗位 */
function materialMeta(name: string): { purpose: string; priority: '高' | '中' | '低'; owner: RoleHint } {
  if (/急救|AED|医药|灭火|安全/.test(name)) return { purpose: '应急处置', priority: '高', owner: 'safety' };
  if (/证件|胸牌|号码布|签到|名单/.test(name)) return { purpose: '身份识别与签到', priority: '高', owner: 'logistics' };
  if (/水|饮品|餐|茶歇|零食/.test(name)) return { purpose: '参与者补给', priority: '高', owner: 'logistics' };
  if (/隔离|指引|指示牌|围栏/.test(name)) return { purpose: '动线疏导', priority: '高', owner: 'safety' };
  if (/音响|麦克风|投影|LED|屏|对讲机|设备|电源/.test(name)) return { purpose: '现场呈现与通讯', priority: '中', owner: 'tech' };
  if (/奖杯|奖牌|奖品|证书|礼品|伴手礼/.test(name)) return { purpose: '激励与荣誉', priority: '低', owner: 'content' };
  if (/海报|易拉宝|背景板|横幅|展架|宣传/.test(name)) return { purpose: '宣传与指引', priority: '中', owner: 'promotion' };
  if (/桌椅|帐篷|桌布|布置|展位/.test(name)) return { purpose: '场地搭建', priority: '中', owner: 'logistics' };
  return { purpose: '现场使用', priority: '中', owner: 'logistics' };
}

function buildTimeline(
  agenda: { name: string; share: number; detail: string }[],
  duration: number,
  startMinute: number,
): TimelineEntry[] {
  const totalShare = agenda.reduce((sum, item) => sum + item.share, 0) || 1;
  const end = startMinute + duration;
  let cursor = startMinute;
  const entries: TimelineEntry[] = [];

  agenda.forEach((segment, index) => {
    const isLast = index === agenda.length - 1;
    const remaining = end - cursor;
    const length = isLast ? Math.max(5, remaining) : round5((duration * segment.share) / totalShare);
    const capped = isLast ? remaining : Math.min(length, Math.max(5, remaining - 5));
    entries.push({
      time: `${clock(cursor)}–${clock(cursor + capped)}`,
      title: segment.name,
      detail: segment.detail,
    });
    cursor += capped;
  });
  return entries;
}

function quantityFor(name: string, people: number, staff: number): string {
  const ceil = Math.ceil;
  if (/水|饮水/.test(name)) return `${ceil(people * 1.2)} 瓶`;
  if (/胸牌|号码布|工作证|证件/.test(name)) return `${people + staff} 份`;
  if (/对讲机/.test(name)) return `${Math.max(2, ceil(staff / 8))} 台`;
  if (/桌椅|桌布/.test(name)) return `${Math.max(4, ceil(people * 0.6))} 套`;
  if (/垃圾袋|清洁/.test(name)) return `${Math.max(1, ceil(people / 50))} 卷`;
  if (/急救包|医药/.test(name)) return `${Math.max(1, ceil(people / 200))} 个`;
  if (/AED|救护/.test(name)) return `${Math.max(1, ceil(people / 500))} 台`;
  if (/奖杯|奖牌|奖品|证书/.test(name)) return `${Math.max(3, ceil(people * 0.05))} 份`;
  if (/指引|指示牌|易拉宝|展架|背景板/.test(name)) return `${Math.max(2, ceil(people / 200))} 块`;
  if (/音响|麦克风|投影|LED|屏/.test(name)) return '1 套';
  if (/雨棚|遮阳/.test(name)) return `${Math.max(1, ceil(people / 200))} 顶`;
  if (/隔离带|围栏/.test(name)) return `${Math.max(2, ceil(people / 150))} 组`;
  if (/餐|茶歇|简餐/.test(name)) return `${ceil(people * 0.8)} 份`;
  return '1 批';
}

/* ---------------- 各模块生成 ---------------- */

interface BuildContext {
  brief: EventBrief;
  title: string;
  preset?: ScenarioPreset;
  category: ReturnType<typeof getCategory>;
  familyId: string;
  knowledge: ReturnType<typeof knowledgeFor>;
  context: KnowledgeContext;
  staff: StaffRow[];
  staffTotal: number;
  guests: number;
  startMinute: number;
  schedule: TimelineEntry[];
  slogan: string;
}

function buildBasic(ctx: BuildContext): Block[] {
  const { brief, category, staffTotal, guests } = ctx;
  const rows = [
    ['活动名称', ctx.title],
    ['活动主题', ctx.slogan],
    ['起稿方式', ctx.preset ? `预设模板：${ctx.preset.name}（内容可修改）` : '自由描述'],
    ['活动类型', `${getFamily(category.family).label} · ${category.label}`],
    ['举办时间', brief.date ? formatDateLabel(brief.date) : '待定'],
    ['活动时长', formatDurationLabel(brief.durationMinutes, brief.days)],
    ['活动地点', `${venueLabel(brief.venue)}（具体场地待定）`],
    ['参与规模', `${brief.people} 人（另需工作人员 ${staffTotal} 人${guests > 0 ? `、嘉宾 ${guests} 人` : ''}）`],
    ['预算规模', `${formatMoney(brief.budget)}（人均 ${formatMoney(perCapita(brief.budget, brief.people))}）`],
    ['策划重点', category.summary],
  ];

  const keyTitles = MODULES
    .filter((module) => resolveWeights(category)[module.id] === 'key')
    .map((module) => module.title);
  const focus = keyTitles.length
    ? `，其中${keyTitles.join('、')}是本场活动的策划重点`
    : '，并按轻量活动的实际情况做了精简';

  const background =
    `这是一场面向${brief.audience}的${category.label}，计划于${brief.date ? formatDateLabel(brief.date) : '近期'}在${venueLabel(brief.venue)}举办，` +
    `预计${brief.people}人参与，可用预算${formatMoney(brief.budget)}，单日时长${formatDurationLabel(brief.durationMinutes, 1)}。` +
    `${category.summary}。本方案按「${MODULES.length} 个标准模块」编排${focus}。`;

  const blocks: Block[] = [
    ...(ctx.preset ? [{ kind: 'text' as const, text: ctx.preset.intro }] : []),
    { kind: 'text', text: background },
    { kind: 'table', head: ['项目', '内容'], rows },
  ];
  if (brief.constraints.trim()) {
    blocks.push({ kind: 'bullets', title: '已知限制与特殊要求', items: [brief.constraints.trim()] });
  }
  if (brief.modifiers?.revisionNote) {
    blocks.push({ kind: 'bullets', title: '本次调整说明', items: [brief.modifiers.revisionNote] });
  }
  return blocks;
}

function buildGoals(ctx: BuildContext): Block[] {
  const { brief, category } = ctx;
  const purpose = [
    brief.goal,
    `覆盖${brief.audience}，实际到场不低于 ${Math.round(brief.people * 0.8)} 人。`,
    SECONDARY_GOALS[category.family] ?? SECONDARY_GOALS.generic,
  ];
  const outcomes = (ARTIFACTS[category.family] ?? ARTIFACTS.generic);
  return [
    { kind: 'bullets', title: '活动目的', items: purpose },
    { kind: 'bullets', title: '预期成果', items: outcomes.map((item) => `产出：${item}`) },
  ];
}

function buildAudience(ctx: BuildContext): Block[] {
  const { brief, category, staffTotal, guests } = ctx;
  const rows: string[][] = [
    ['核心参与者', `${brief.people} 人`, brief.audience],
    ['工作人员', `${staffTotal} 人`, '含执行、引导、后勤与志愿者'],
  ];
  if (guests > 0) rows.push(['嘉宾 / 媒体', `${guests} 人`, GUEST_LABEL[category.family] ?? GUEST_LABEL.generic]);
  rows.push(['合计在场', `${brief.people + staffTotal + guests} 人`, '按最大同时在场上限估算']);

  const recruitment: Record<string, string> = {
    campus: '以班级/社团为单位集体报名，设个人补报名通道；设候补名单应对临时缺席。',
    academic: '定向邀请 + 公开报名，需收集单位/研究方向，便于安排分会场。',
    sports: '按项目设置报名上限，要求健康承诺与免责声明；团队项目需提交名单。',
    charity: '志愿者需通过岗前培训；服务对象由合作机构推荐并签署服务同意。',
    business: '实名预约制，审核公司/职位信息；VIP 单独通道与接待。',
    startup: '项目制报名，提交商业计划书摘要；评委与投资人单独邀约。',
    arts: '公开售票或预约，按场次分区；演员与工作人员单独发证。',
    education: '按年龄/基础分班，报名时收集学习目标与过敏等注意事项。',
    career: '学生扫码入场并填写求职意向；企业需提交资质与岗位表。',
    social: '群接龙确认，提前收集忌口与出行方式。',
    generic: '公开报名 + 定向邀请，报名时收集必要信息。',
  };

  return [
    { kind: 'table', head: ['人群', '人数', '说明'], rows },
    { kind: 'bullets', title: '招募与筛选', items: [recruitment[category.family] ?? recruitment.generic] },
    {
      kind: 'bullets',
      title: '参与动机设计',
      items: [
        '给一个明确的“来了能得到什么”：技能、资源、社交或体验。',
        '降低参与门槛：报名不超过 3 步，明确时长与是否需要自备物品。',
        '设置可分享的瞬间：合影点、成果展示或纪念物。',
      ],
    },
  ];
}

function buildLogistics(ctx: BuildContext): Block[] {
  const { brief, context } = ctx;
  const venueTips = VENUE_REQUIREMENTS[brief.venue] ?? VENUE_REQUIREMENTS['indoor-large'];
  const endMinute = ctx.startMinute + brief.durationMinutes;
  const items = [
    `日期：${brief.date ? formatDateLabel(brief.date) : '待定'}（${brief.days > 1 ? `${brief.days} 天` : '单日'}）`,
    `时间窗口：${clock(ctx.startMinute)}–${clock(endMinute)}，含 ${formatDurationLabel(brief.durationMinutes, 1)} 活动时间`,
    `场地类型：${venueLabel(brief.venue)}${context.outdoor ? '（户外，必须准备天气备用方案）' : ''}`,
    `预计人流：参与者 ${brief.people} 人 + 工作人员 ${ctx.staffTotal} 人${ctx.guests > 0 ? ` + 嘉宾 ${ctx.guests} 人` : ''}`,
  ];

  const blocks: Block[] = [
    { kind: 'bullets', title: '时间与场地', items },
    { kind: 'checklist', title: '场地硬性要求（现场踏勘逐项确认）', items: venueTips },
  ];

  if (context.outdoor) {
    blocks.push({
      kind: 'bullets',
      title: '天气与备用场地',
      items: [
        '活动前 72 / 24 / 6 小时各看一次天气，明确“改期或转室内”的决策时间点。',
        '提前书面确认一处室内备用场地，并约定启用条件。',
        '户外布置一律配重或地钉，避免大风导致倾倒。',
      ],
    });
  }

  if (brief.days > 1) {
    blocks.push({
      kind: 'bullets',
      title: '多日安排要点',
      items: [
        `共 ${brief.days} 天，建议第 1 天完成核心内容，第 2 天起安排轻量环节与自由交流。`,
        '每日结束后 30 分钟内完成场地复位与物资清点，避免跨日丢失。',
        '住宿与交通按“集中管理、分组负责”原则安排，指定每晚查寝/点名负责人。',
      ],
    });
  }

  blocks.push({
    kind: 'bullets',
    title: '合规与审批提示',
    items: ctx.knowledge.notes,
  });
  return blocks;
}

function buildProgram(ctx: BuildContext): Block[] {
  const { brief, category, knowledge, context } = ctx;
  const interactionIdeas = suggestInteractions(brief.venue, brief.people, brief.durationMinutes, 3);
  const blocks: Block[] = [
    { kind: 'timeline', title: `单日流程（${dateShort(brief.date)}）`, entries: ctx.schedule },
  ];

  if (brief.days > 1) {
    blocks.push({
      kind: 'bullets',
      title: '多日内容编排',
      items: [
        `第 2 天：${category.family === 'arts' ? '展演/市集与自由观演' : category.family === 'sports' ? '复赛/决赛与颁奖' : '分组研讨、自由交流与成果展示'}`,
        `第 ${brief.days} 天：总结、颁奖或闭幕，留出返程与撤场时间。`,
      ],
    });
  }

  blocks.push({
    kind: 'bullets',
    title: '互动设计',
    items: [
      ...(brief.modifiers?.extraInteractions ?? []).map((item) => `追加互动：${item}`),
      ...knowledge.interactions,
      ...interactionIdeas.map((idea) => `可选环节：${idea.name}（约 ${idea.duration} 分钟）——${idea.tagline}`),
    ].slice(0, 9),
  });

  if (ctx.preset?.highlights.length) {
    blocks.push({
      kind: 'bullets',
      title: '本预设特色环节',
      items: ctx.preset.highlights,
    });
  }

  blocks.push({
    kind: 'bullets',
    title: '现场执行要点',
    items: [
      `每个环节设置明确的时间盒，超时 5 分钟由主持人收口。`,
      context.outdoor ? '户外环节准备无电源替代方案（口令、纸笔、人工计时）。' : '提前 1 小时完成设备联调与彩排走位。',
      '关键环节安排 1 名机动人员，专门处理临时需求。',
    ],
  });
  return blocks;
}

function buildOrganization(ctx: BuildContext): Block[] {
  const { knowledge, staffTotal } = ctx;
  const volunteer = knowledge.roles.some((role) => role.role.includes('志愿') || role.role.includes('服务组'));
  const architecture = LAYERS
    .map((layer) => ({ name: layer.name, rows: ctx.staff.filter((row) => row.layer === layer.name) }))
    .filter((group) => group.rows.length)
    .map((group) => `${group.name}：${group.rows.map((row) => `${row.role} ${row.count} 人`).join('、')}`);

  const blocks: Block[] = [
    { kind: 'staff', title: `人员架构（共 ${staffTotal} 人）`, rows: ctx.staff },
    { kind: 'bullets', title: '组织架构（四层）', items: architecture },
    {
      kind: 'bullets',
      title: '指挥与协同',
      items: [
        '决策层对结果负责，内容层对专业负责，传播层对到场负责，保障层对安全负责。',
        '建立一张“岗位—负责人—联系方式”联络表，活动前 3 天全员确认。',
        '统一使用对讲机或固定频道/群，设定每 30 分钟一次的进度同步；跨组争议由总指挥终裁。',
      ],
    },
  ];

  if (volunteer) {
    blocks.push({
      kind: 'bullets',
      title: '志愿者管理',
      items: [
        '活动前 7 天完成岗前培训：服务规范、动线、应急流程与禁止事项。',
        '按 1 名领队带 8–10 名志愿者的比例编组，建立签到与轮休机制。',
        '提供饮水、餐食与休息区，结束时出具服务时长证明。',
      ],
    });
  }
  return blocks;
}

function buildResources(ctx: BuildContext): Block[] {
  const { knowledge, brief } = ctx;
  const extra = brief.modifiers?.extraInteractions?.length ? ['互动道具与奖品'] : [];
  const items = [...knowledge.resources, ...extra];
  const rows = items.map((name) => {
    const meta = materialMeta(name);
    return [
      name,
      quantityFor(name, brief.people, ctx.staffTotal),
      meta.purpose,
      meta.priority,
      ownerFor(meta.owner, ctx.staff),
    ];
  });

  return [
    { kind: 'table', head: ['物资 / 资源', '数量估算', '用途', '采购优先级', '负责人'], rows },
    {
      kind: 'bullets',
      title: '采购与调配原则',
      items: [
        '优先级：现有库存借用 → 合作方赞助 → 租赁 → 采购；标记「高」的物资必须先落实。',
        '大件设备（音响、LED、棚架）提前 7–14 天锁定，确认运输、安装与保险责任。',
        '数量按实际到场人数的 80–90% 备货，另留 10% 余量应对临时增加。',
        '建立“物资—负责人—归还时间”登记表，活动结束当天完成清点与归还。',
      ],
    },
  ];
}

function buildBudget(ctx: BuildContext): Block[] {
  const { brief } = ctx;
  const lines = allocateBudget(ctx.knowledge.budget, brief.budget);
  const rows: BudgetRow[] = lines.map((line, index) => ({
    id: `budget-${index + 1}`,
    bucket: bucketOf(line.category, line.item),
    category: line.category,
    item: line.item,
    amount: line.amount,
    share: line.share,
    note: line.note,
  }));
  const ordered = [...rows].sort((a, b) => BUDGET_BUCKETS.indexOf(a.bucket as typeof BUDGET_BUCKETS[number]) - BUDGET_BUCKETS.indexOf(b.bucket as typeof BUDGET_BUCKETS[number]));

  if (brief.budget === 0) {
    return [
      {
        kind: 'text',
        text: '当前按零预算方案编排：优先使用免费场地与已有物资，通过借用、自带与赞助满足核心需求。以下不产生现金支出，但人力与时间成本仍需计入。',
      },
      {
        kind: 'bullets',
        title: '零预算执行策略',
        items: [
          '场地：申请校内/社区公益场地，或与场地方以宣传资源置换。',
          '物资：发布“借用清单”，由社团/同事/家长自带可复用物资。',
          '人员：以志愿者替代外包，用明确分工降低沟通成本。',
          '宣传：只做自有渠道（群、朋友圈、公众号），不做付费投放。',
        ],
      },
    ];
  }

  const subtotals = BUDGET_BUCKETS
    .map((bucket) => ({ bucket, amount: ordered.filter((row) => row.bucket === bucket).reduce((sum, row) => sum + row.amount, 0) }))
    .filter((item) => item.amount > 0)
    .map((item) => `${item.bucket} ${formatMoney(item.amount)}`);

  const control = [
    `人均成本 ${formatMoney(perCapita(brief.budget, brief.people))}，高于同类活动时优先压缩场地与礼品。`,
    '至少保留 10% 应急备用金，不提前分配；所有变更走书面确认。',
    '大额支出（单笔 > 20%）先比价三家，合同锁定单价与超时费用。',
    '物资按实际到场人数的 80–90% 备货，缺口用共享与补货解决。',
  ];

  const blocks: Block[] = [
    {
      kind: 'budget',
      title: '预算清单（按标准类别）',
      rows: ordered,
      total: brief.budget,
      note: '所有金额均为估算值，不是供应商报价；执行前须以实际询价替换，并保留比价记录。',
    },
    { kind: 'bullets', title: '分类小计', items: subtotals },
    { kind: 'bullets', title: '成本控制', items: control },
  ];

  // 预算与规模明显不匹配时给出提示，而不是默默生成一份不可执行的方案
  const category = ctx.category;
  const benchmark = (category.defaultBudget ?? 0) / Math.max(1, category.defaultPeople ?? 1);
  const actual = perCapita(brief.budget, brief.people);
  if (benchmark > 0 && actual < benchmark * 0.4) {
    blocks.push({
      kind: 'bullets',
      title: '预算合理性提示',
      items: [
        `按 ${brief.people} 人计算，人均 ${formatMoney(actual)}；同类活动常见人均约 ${formatMoney(benchmark)}。`,
        '若预算属实，建议同步缩小规模，或改用零预算方案（借用 + 赞助 + 志愿者）。',
        '若人数有误，请回到需求确认页调整人数后重新生成。',
      ],
    });
  }

  return blocks;
}

function buildPromotion(ctx: BuildContext): Block[] {
  const { brief, knowledge, category } = ctx;
  const channels = knowledge.channels.slice(0, 6);

  const cadence: string[][] = [
    ['T-21 天', '发布预告与报名通道，讲清“来了能得到什么”', '公众号 / 社群'],
    ['T-14 天', '首次集中推广，公布嘉宾、赛程或节目亮点', '短视频 / 朋友圈'],
    ['T-7 天', '报名提醒 + 已报名者转发激励', '群公告 / 私信'],
    ['T-3 天', '发布参与指南（时间、地点、携带物、联系人）', '短信 / 群'],
    ['T-1 天', '二次确认到场，发送签到码与路线图', '短信 / 企微'],
    ['当天', '现场引导 + 实时图文，制造二次传播', '现场 / 直播'],
  ];

  return [
    { kind: 'bullets', title: '宣传渠道', items: channels },
    { kind: 'table', head: ['节点', '动作', '渠道'], rows: brief.people <= 40 && category.family === 'social' ? cadence.slice(3) : cadence },
    {
      kind: 'bullets',
      title: '内容要点',
      items: [
        `一句话卖点：${ctx.slogan}。`,
        `明确门槛：谁适合来、需要准备什么、是否收费（当前预算 ${formatMoney(brief.budget)}）。`,
        `报名方式：线上表单/小程序，${category.family === 'business' ? '需审核公司与职位' : category.family === 'sports' ? '需提交健康承诺' : '报名后 24 小时内确认'}。`,
        '所有物料统一视觉与报名二维码，避免多渠道口径不一致。',
      ],
    },
  ];
}

function buildExecution(ctx: BuildContext): Block[] {
  const { brief, category, staff } = ctx;
  const extra = FAMILY_TASKS[category.family] ?? {};
  const compact = brief.people <= 40 && (category.family === 'social' || category.family === 'campus');
  const blocks: Block[] = [];

  PHASES.forEach((phase) => {
    const tasks = [...phase.tasks, ...(extra[phase.id] ?? [])];
    const rows = tasks.map((task) => [
      task.task,
      ownerFor(task.owner, staff),
      dueLabel(task.due, brief),
      task.resources,
    ]);
    blocks.push({
      kind: 'table',
      title: `${phase.label}｜${phase.summary}`,
      head: ['任务', '负责人', '完成时间', '所需资源'],
      rows,
    });
  });

  blocks.push({
    kind: 'bullets',
    title: '阶段衔接与检查点',
    items: [
      '筹备未锁定场地与预算，不得启动宣传；宣传未完成名单确认，不得进入采购。',
      '前期检查的六项（场地、物资、人员、设备、安全、嘉宾）任一未通过，活动不得开场。',
      '收尾未完成物资清点与费用结算，复盘数据不完整，结案报告不得出具。',
      compact ? '轻量活动可合并执行：把筹备与宣传压缩到活动前 7 天，但仍需保留安全检查。' : '每个阶段结束设置 1 次 15 分钟站会，确认“完成 / 延期 / 取消”。',
    ],
  });

  blocks.push({
    kind: 'checklist',
    title: '开活动前必须逐项打勾',
    items: [
      '场地已确认并有书面/聊天记录',
      '预算已批准，或已明确自筹方案',
      '安全预案与应急联系人已通知到全员',
      '报名名单与实际到场人数已核对',
      '设备、物料已验收并能正常使用',
      '宣传口径与报名二维码已统一',
    ],
  });
  return blocks;
}

function buildRisk(ctx: BuildContext): Block[] {
  const { brief, knowledge, context, category, staff } = ctx;
  const risks = [...knowledge.risks];
  const safetyOwner = ownerFor('safety', staff);
  const minors = knowledge.notes.some((note) => /未成年|儿童|家长/.test(note))
    || (category.family === 'education' && /儿童|亲子|中小学|家长|学生/.test(brief.audience));
  const large = brief.people >= 500;
  const publicSafety = large
    || knowledge.notes.some((note) => /公安|报批|大型群众性|街道|物业/.test(note))
    || /广场|街区|公园|社区/.test(`${brief.venueNote}${category.summary}`);

  if (context.outdoor && !risks.some((risk) => risk.title.includes('天气'))) {
    risks.unshift({
      title: '天气突变',
      cause: '降雨、大风或高温',
      likelihood: 2,
      impact: 3,
      mitigation: '提前 72/24/6 小时会商，书面锁定室内备用场地',
      contingency: '启动转场或延期，2 小时内完成公告',
      owner: safetyOwner,
    });
  }
  if (large && !risks.some((risk) => /客流|踩踏/.test(risk.title))) {
    risks.push({
      title: '大客流秩序与踩踏风险',
      cause: '入场集中、通道狭窄',
      likelihood: 2,
      impact: 3,
      mitigation: '分时入场、单向动线、按容量 80% 放行、设医疗点',
      contingency: '限流、暂停入场、广播引导疏散',
      owner: safetyOwner,
    });
  }
  if (minors) {
    risks.push({
      title: '未成年人看护与接送',
      cause: '监护人不在场、出口无人值守',
      likelihood: 2,
      impact: 3,
      mitigation: '签到时登记监护人电话，佩戴手环，出口设专人值守',
      contingency: '广播寻人，调取监控，联系监护人并报警',
      owner: safetyOwner,
    });
  }
  if (publicSafety && !large) {
    risks.push({
      title: '公共区域使用与报批',
      cause: '占用公共空间、噪音或人流影响周边',
      likelihood: 2,
      impact: 2,
      mitigation: '提前向属地/物业报备，约定音量与结束时间',
      contingency: '降噪、缩短活动，必要时转移场地',
      owner: safetyOwner,
    });
  }

  const rows = risks.map((risk) => [
    `${risk.title}（${risk.cause}）`,
    `${risk.likelihood}/3`,
    `${risk.impact}/3`,
    riskLevel(risk.likelihood, risk.impact),
    risk.mitigation,
    risk.contingency,
    risk.owner,
  ]);

  const blocks: Block[] = [
    { kind: 'table', head: ['风险（诱因）', '可能性', '影响', '等级', '预防措施', '应急方案', '责任人'], rows },
    {
      kind: 'bullets',
      title: '处置原则',
      items: [
        '先保人、再保流程、最后保物料；任何冲突以现场安全为最高优先级。',
        '每类风险指定一名负责人，现场只由总指挥对外发声。',
        '建立 15 分钟上报机制：超过 15 分钟未解决即上报总指挥。',
        '应急联系人：总指挥 1 名、医疗 1 名、场地方 1 名，联系方式贴在签到处。',
      ],
    },
  ];

  const boost = brief.modifiers?.safetyBoost || minors || large || (context.outdoor && brief.people >= 300);
  if (boost) {
    blocks.push({
      kind: 'bullets',
      title: '安全与合规强化（本场适用）',
      items: [
        '明确安全责任人并书面报备场地与属地管理部门，保留回执。',
        `按 ${brief.people} 人配置安保与医疗：每 200 人至少 1 名安保，每 500 人至少 1 个医疗点并配 AED。`,
        '购买活动责任险与参与者意外险；涉及未成年人须监护人签署同意书。',
        '活动前 1 天完成疏散演练，明确集合点、广播口令与担架通道。',
        context.outdoor ? '设定天气熔断标准：雷雨、风力 ≥6 级、高温预警即暂停或延期。' : '确认消防通道、应急照明与灭火器位置，禁止堵塞出口。',
      ],
    });
  }
  return blocks;
}

function buildEvaluation(ctx: BuildContext): Block[] {
  const { brief, category } = ctx;
  const outcomes: Record<string, string> = {
    campus: '形成可跟进的参与者名单与班级/社团社群',
    academic: '形成纪要、论文集或可回放的报告',
    sports: '完成全部赛程并产出成绩册与赛事记录',
    charity: '完成服务人次与物资签收记录，形成公示',
    business: '形成有效线索表与可传播的媒体素材',
    startup: '形成可对接的项目清单与评分记录',
    arts: '产出可传播的影像、节目单或展签',
    education: '产出学员作品与学习效果问卷',
    career: '形成简历库与面试意向统计',
    social: '形成活动小结与费用公示',
    generic: '形成结案报告与可复用的执行模板',
  };

  const standard: KpiRow[] = [
    { name: '实际到场人数', target: `≥ ${Math.round(brief.people * 0.8)} 人（到场率 ≥80%）`, method: '签到/扫码统计' },
    { name: '报名转化率', target: '≥ 75%（到场 / 报名）', method: '报名表与签到表比对' },
    { name: '现场参与度', target: '≥ 60% 参与者完成至少 1 次互动', method: '互动记录、任务卡或扫码打卡' },
    { name: '参与者满意度', target: '≥ 4.2 / 5', method: '散场问卷（3 题，30 秒可完成）' },
    { name: '活动完成率', target: '≥ 95% 环节按计划完成', method: '流程表执行记录与超时统计' },
    { name: '实际成果', target: outcomes[category.family] ?? outcomes.generic, method: '成果清单、作品或名单核验' },
  ];

  const seen = new Set(standard.map((row) => row.name));
  const familyRows = ctx.knowledge.kpis
    .map((kpi) => ({ name: kpi.name, target: kpi.target(ctx.context), method: kpi.method }))
    .filter((row) => !seen.has(row.name));
  const rows = [...standard, ...familyRows].slice(0, 9);

  return [
    { kind: 'kpis', title: '评价指标（按目标设计）', rows },
    { kind: 'bullets', title: '评估方式', items: ctx.knowledge.evaluation },
    {
      kind: 'checklist',
      title: '复盘会议清单（活动后 48 小时内）',
      items: [
        '数据回顾：报名、到场、参与度、预算执行率与指标对比',
        '流程回顾：哪三个环节最好、哪三个环节最需要改',
        '问题清单：按“人、事、物、钱”分类，明确改进负责人',
        '沉淀输出：模板、供应商名单、素材库与下一届交接文档',
      ],
    },
  ];
}

/* ---------------- 权重适配 ---------------- */

const KEY_HINT: Record<ModuleId, string> = {
  basic: '本场活动的基本设定与核心约束。',
  goals: '目标决定取舍：后续每个环节都应能回答“为了哪个目标”。',
  audience: '人群结构直接影响招募、动线与体验设计。',
  logistics: '时间与场地是不可协商的硬约束，先锁定再谈创意。',
  program: '内容是参与者唯一能带走的东西，节奏比创意更重要。',
  organization: '明确“谁在什么时间负责什么”，比人多更重要。',
  resources: '物资清单要与人数和流程一一对应。',
  budget: '预算结构决定活动形态，先保安全与核心体验。',
  promotion: '传播决定到场率，提前三周启动。',
  execution: '倒排时间表是执行力的来源。',
  risk: '安全底线不可突破，预案必须可执行。',
  evaluation: '没有数据就没有下一届。',
};

function trimBlock(block: Block, maxItems: number): Block {
  if (block.kind === 'bullets' || block.kind === 'checklist') {
    return { ...block, items: block.items.slice(0, maxItems) };
  }
  if (block.kind === 'timeline') return { ...block, entries: block.entries.slice(0, maxItems) };
  if (block.kind === 'table') return { ...block, rows: block.rows.slice(0, maxItems) };
  if (block.kind === 'staff') return { ...block, rows: block.rows.slice(0, maxItems) };
  if (block.kind === 'kpis') return { ...block, rows: block.rows.slice(0, maxItems) };
  return block;
}

/** 权重决定内容深度：重点 = 全量 + 提示；简要 = 只留最关键两块 */
function applyWeight(blocks: Block[], weight: Weight, moduleId: ModuleId): Block[] {
  if (weight === 'brief') {
    const kept: Block[] = [];
    for (const block of blocks) {
      // 时间线、预算、人员表属于硬信息，不因“简要”而删除
      if (block.kind === 'timeline' || block.kind === 'budget' || block.kind === 'staff') {
        kept.push(block);
        continue;
      }
      if (kept.length >= 2) break;
      kept.push(trimBlock(block, 3));
    }
    return kept;
  }
  if (weight === 'key') {
    return [{ kind: 'text', text: `本场重点：${KEY_HINT[moduleId]}` }, ...blocks];
  }
  return blocks;
}

/* ---------------- 主入口 ---------------- */

/** 预设覆盖：流程、角色、物资、预算与风险都换成预设版本，其余沿用类型知识 */
function withPreset(base: FamilyKnowledge, preset?: ScenarioPreset): FamilyKnowledge {
  if (!preset) return base;
  return {
    ...base,
    agenda: preset.flow,
    budget: preset.budgetLines,
    roles: preset.roles,
    risks: preset.risks,
    resources: preset.materials,
  };
}

export function generatePlan(brief: EventBrief): EventPlan {
  const category = getCategory(brief.categoryId);
  const weights = resolveWeights(category);
  const preset = getPreset(brief.presetId);
  const baseKnowledge = withPreset(knowledgeFor(category.family, category.id), preset);
  const draft = brief.aiDraft;
  const knowledge:FamilyKnowledge = draft ? {
    ...baseKnowledge,
    agenda: draft.flow.length ? draft.flow.map((name,index)=>({name,share:1/draft.flow.length,detail:`AI 初稿建议环节 ${index+1}；由组织者核对时长和执行方式。`})) : baseKnowledge.agenda,
    roles: draft.staff.length ? draft.staff.map(role=>({role,fixed:1,perPeople:0,min:1,max:10,duty:'AI 初稿建议岗位，职责待确认'})) : baseKnowledge.roles,
    resources: draft.materials.length ? draft.materials : baseKnowledge.resources,
  } : baseKnowledge;
  const scale = scaleOf(brief.people);
  const outdoor = brief.venue === 'outdoor' || brief.venue === 'mixed' || brief.venue === 'stadium';
  const context: KnowledgeContext = {
    people: brief.people,
    budget: brief.budget,
    duration: brief.durationMinutes,
    days: brief.days,
    outdoor,
    venue: brief.venue,
    scale: scale.id,
    categoryLabel: category.label,
  };

  const staff = computeStaff(knowledge.roles, brief.people, brief.modifiers?.staffScale ?? 1);
  const staffTotal = staff.reduce((sum, row) => sum + row.count, 0);
  const guestRatio = GUEST_WEIGHT[category.id] ?? 0.03;
  const guests = category.family === 'social' ? 0 : Math.max(2, Math.round(brief.people * guestRatio));
  const startHour = START_HOUR[category.id] ?? 9;
  const startMinute = startHour * 60;
  const schedule = buildTimeline(knowledge.agenda, brief.durationMinutes, startMinute);
  const slogan = brief.theme || SLOGANS[category.id] || SLOGANS['generic-event'];
  const monthLabel = brief.date ? `${new Date(`${brief.date}T00:00:00`).getMonth() + 1}月` : '';
  const title = brief.title.trim() || `${monthLabel}${shortLabel(category)}`;

  const ctx: BuildContext = {
    brief,
    title,
    preset,
    category,
    familyId: category.family,
    knowledge,
    context,
    staff,
    staffTotal,
    guests,
    startMinute,
    schedule,
    slogan,
  };

  const builders: Record<ModuleId, () => Block[]> = {
    basic: () => buildBasic(ctx),
    goals: () => buildGoals(ctx),
    audience: () => buildAudience(ctx),
    logistics: () => buildLogistics(ctx),
    program: () => buildProgram(ctx),
    organization: () => buildOrganization(ctx),
    resources: () => buildResources(ctx),
    budget: () => buildBudget(ctx),
    promotion: () => buildPromotion(ctx),
    execution: () => buildExecution(ctx),
    risk: () => buildRisk(ctx),
    evaluation: () => buildEvaluation(ctx),
  };

  const summaries: Record<ModuleId, string> = {
    basic: `${category.label} · ${brief.people} 人 · ${dateShort(brief.date)} · ${venueLabel(brief.venue)}`,
    goals: `${brief.goal.slice(0, 30)}${brief.goal.length > 30 ? '…' : ''}；到场目标 ${Math.round(brief.people * 0.8)} 人`,
    audience: guests > 0 ? `${brief.audience}，另有工作人员 ${staffTotal} 人、嘉宾 ${guests} 人` : `${brief.audience}，另有工作人员 ${staffTotal} 人`,
    logistics: `${dateShort(brief.date)} ${clock(startMinute)}–${clock(startMinute + brief.durationMinutes)}，${venueLabel(brief.venue)}`,
    program: `${knowledge.agenda.length} 个环节，${formatDurationLabel(brief.durationMinutes, 1)}`,
    organization: `${staff.length} 个岗位，共 ${staffTotal} 人`,
    resources: `${knowledge.resources.length} 类物资，按 ${brief.people} 人估算用量`,
    budget: `${formatMoney(brief.budget)}，${knowledge.budget.length} 个科目，人均 ${formatMoney(perCapita(brief.budget, brief.people))}`,
    promotion: `${knowledge.channels.length} 个渠道，T-21 至活动当天`,
    execution: '六阶段执行时间轴：筹备 → 宣传 → 检查 → 执行 → 收尾 → 总结',
    risk: `${knowledge.risks.length} 项风险，最高等级 ${Math.max(...knowledge.risks.map((r) => r.likelihood * r.impact)) >= 6 ? '高' : '中'}`,
    evaluation: `${knowledge.kpis.length} 个指标 + 复盘清单`,
  };

  const modules: PlanModule[] = MODULES.map((meta) => {
    const weight = weights[meta.id];
    const blocks = applyWeight(builders[meta.id](), weight, meta.id);
    return {
      id: meta.id,
      title: meta.title,
      weight,
      summary: summaries[meta.id],
      blocks,
    };
  });

  const oneLiner =
    `${title}：面向${brief.audience}，${brief.people} 人规模，` +
    `${brief.date ? dateShort(brief.date) : '时间待定'}在${venueLabel(brief.venue)}举办，` +
    `预算 ${formatMoney(brief.budget)}。${category.summary}。`;

  return {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    version: 2,
    planningMode: brief.planningMode ?? recommendPlanningMode(brief),
    title,
    oneLiner,
    theme: slogan,
    brief,
    scale: scale.id,
    modules,
    assumptions: brief.assumptions,
    aiNotes: {},
  };
}

/** 按模块重新生成（AI 补全后局部刷新时使用） */
export function regenerateModule(plan: EventPlan, moduleId: ModuleId): EventPlan {
  const fresh = generatePlan(plan.brief);
  const replacement = fresh.modules.find((item) => item.id === moduleId);
  if (!replacement) return plan;
  return {
    ...plan,
    modules: plan.modules.map((item) => (item.id === moduleId ? { ...replacement, aiNote: item.aiNote } : item)),
  };
}

export const moduleMeta = getModule;
