import {
  CATEGORIES,
  GENERIC_CATEGORY,
  getCategory,
  isOutdoor,
  VENUES,
  venueLabel,
} from '../data/taxonomy';
import { getPreset } from '../data/presets';
import type {
  Assumption,
  BriefFieldKey,
  BriefQuestion,
  EventBrief,
  EventCategory,
  SourceTag,
  VenueKind,
} from '../types';

/* ============================================================
 * 需求理解引擎
 *
 * 职责：
 *   1. 从一句自由文本中抽取活动类型、人数、预算、时间、时长、场地、目标；
 *   2. 缺失字段用同类活动的常见值填充，并标记为"假设"；
 *   3. 只对真正影响方案的关键字段提问，最多 3 个，避免盘问式交互。
 *
 * 所有函数都是纯函数，便于测试，也方便后续接入 AI 做兜底解析。
 * ============================================================ */

const CN_DIGITS: Record<string, number> = {
  零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9,
};

const CN_UNITS: Record<string, number> = { 十: 10, 百: 100, 千: 1000 };

/** 解析中文或阿拉伯数字（支持 三百、两千、1.2万） */
export function parseNumber(raw: string): number | null {
  const text = raw.trim();
  if (!text) return null;
  const plain = text.replace(/,/g, '');
  if (/^\d+(\.\d+)?$/.test(plain)) return Number(plain);

  let total = 0;
  let section = 0;
  let current = 0;
  let seen = false;
  for (const ch of plain) {
    if (ch in CN_DIGITS) {
      current = CN_DIGITS[ch];
      seen = true;
    } else if (ch in CN_UNITS) {
      section += (current || 1) * CN_UNITS[ch];
      current = 0;
      seen = true;
    } else if (ch === '万') {
      total += (section + current) * 10000;
      section = 0;
      current = 0;
      seen = true;
    } else if (ch === '亿') {
      total += (section + current) * 100000000;
      section = 0;
      current = 0;
      seen = true;
    } else {
      return null;
    }
  }
  return seen ? total + section + current : null;
}

const NUM_TOKEN = '([0-9]+(?:\\.[0-9]+)?|[零一二两三四五六七八九十百千万]+)';

/** 人数：优先识别"人/位/名"等单位，避免把年份当成人数 */
export function parsePeople(text: string): number | null {
  const patterns = [
    new RegExp(`${NUM_TOKEN}\\s*(?:万|千)\\s*(?:人|位|名|余人)`),
    new RegExp(`${NUM_TOKEN}\\s*(?:人|位|名|参与者|观众|选手|队员|师生)`),
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const base = parseNumber(match[1]);
    if (base === null) continue;
    const unit = match[0].includes('万') ? 10000 : match[0].includes('千') ? 1000 : 1;
    const people = Math.round(base * unit);
    if (people > 0 && people <= 200000) return people;
  }
  return null;
}

/** 预算：必须带货币线索，避免误抓日期或人数 */
export function parseBudget(text: string): number | null {
  const patterns = [
    new RegExp(`(?:预算|经费|预算约|预算为|花费|成本)[^0-9零一二两三四五六七八九十百千万]{0,6}([0-9][0-9,]*(?:\\.[0-9]+)?|[零一二两三四五六七八九十百千万]+)\\s*(万|千|w|k)?`, 'i'),
    new RegExp(`[¥￥]\\s*([0-9][0-9,]*(?:\\.[0-9]+)?)\\s*(万|千|w|k)?`, 'i'),
    new RegExp(`([0-9][0-9,]*(?:\\.[0-9]+)?)\\s*(万|千)\\s*(?:元|块|左右|以内|预算)`),
    new RegExp(`([0-9][0-9,]{1,})\\s*(?:元|块钱|块)`),
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const base = parseNumber(match[1]);
    if (base === null) continue;
    const unit = match[2]?.toLowerCase();
    const multiplier = unit === '万' || unit === 'w' ? 10000 : unit === '千' || unit === 'k' ? 1000 : 1;
    const budget = Math.round(base * multiplier);
    if (budget >= 0 && budget <= 100000000) return budget;
  }
  return null;
}

/** 时长：返回单日分钟数与天数 */
export function parseDuration(text: string): { minutes: number; days: number } | null {
  const dayMatch = text.match(new RegExp(`${NUM_TOKEN}\\s*天`));
  if (dayMatch) {
    const days = parseNumber(dayMatch[1]);
    if (days && days >= 1 && days <= 30) return { minutes: 480, days };
  }
  if (/半天/.test(text)) return { minutes: 240, days: 1 };
  if (/全天|一整天|一天/.test(text)) return { minutes: 480, days: 1 };

  const hourMatch = text.match(new RegExp(`${NUM_TOKEN}\\s*(?:个)?\\s*(?:小时|钟头|h\\b)`, 'i'));
  if (hourMatch) {
    const hours = parseNumber(hourMatch[1]);
    if (hours && hours > 0 && hours <= 24) return { minutes: Math.round(hours * 60), days: 1 };
  }
  const minuteMatch = text.match(new RegExp(`${NUM_TOKEN}\\s*(?:分钟|min\\b)`, 'i'));
  if (minuteMatch) {
    const minutes = parseNumber(minuteMatch[1]);
    if (minutes && minutes >= 10 && minutes <= 720) return { minutes: Math.round(minutes), days: 1 };
  }
  return null;
}

const WEEKDAYS: Record<string, number> = { 日: 0, 天: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6 };

function upcomingWeekday(now: Date, target: number, weekOffset = 0) {
  const diff = (target - now.getDay() + 7) % 7;
  const date = new Date(now);
  date.setDate(now.getDate() + diff + weekOffset * 7);
  date.setHours(0, 0, 0, 0);
  return date;
}

function isoDate(date: Date) {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, '0');
  const d = `${date.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function nextOccurrence(now: Date, month: number, day: number) {
  const date = new Date(now.getFullYear(), month - 1, day);
  date.setHours(0, 0, 0, 0);
  if (date.getTime() < new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) {
    date.setFullYear(now.getFullYear() + 1);
  }
  return date;
}

/** 日期：支持绝对日期、相对日期与常见节日 */
export function parseDate(text: string, now: Date = new Date()): string | null {
  const absolute = text.match(/(20\d{2})\s*[年./-]\s*(\d{1,2})\s*[月./-]\s*(\d{1,2})\s*[日号]?/);
  if (absolute) {
    const date = new Date(Number(absolute[1]), Number(absolute[2]) - 1, Number(absolute[3]));
    if (!Number.isNaN(date.getTime())) return isoDate(date);
  }
  const monthDay = text.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*[日号]?/);
  if (monthDay) {
    const month = Number(monthDay[1]);
    const day = Number(monthDay[2]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return isoDate(nextOccurrence(now, month, day));
    }
  }

  if (/今天/.test(text)) return isoDate(now);
  if (/后天/.test(text)) { const d = new Date(now); d.setDate(d.getDate() + 2); return isoDate(d); }
  if (/明天/.test(text)) { const d = new Date(now); d.setDate(d.getDate() + 1); return isoDate(d); }

  const weekdayMatch = text.match(/(本周|这周|这周末|本周末|下周|下周末|周末|周|星期|礼拜)([一二三四五六日天])/);
  if (weekdayMatch) {
    const prefix = weekdayMatch[1];
    const day = WEEKDAYS[weekdayMatch[2]];
    const offset = /下周/.test(prefix) ? 1 : 0;
    return isoDate(upcomingWeekday(now, day, offset));
  }
  if (/周末|这周末|本周末/.test(text)) return isoDate(upcomingWeekday(now, 6));
  if (/下周/.test(text)) { const d = new Date(now); d.setDate(d.getDate() + 7); return isoDate(d); }
  if (/下个月|下月/.test(text)) { const d = new Date(now); d.setMonth(d.getMonth() + 1); return isoDate(d); }

  const festivals: { pattern: RegExp; month: number; day: number }[] = [
    { pattern: /国庆/, month: 10, day: 1 },
    { pattern: /元旦/, month: 1, day: 1 },
    { pattern: /五一|劳动节/, month: 5, day: 1 },
    { pattern: /教师节/, month: 9, day: 10 },
    { pattern: /儿童节/, month: 6, day: 1 },
    { pattern: /情人节/, month: 2, day: 14 },
    { pattern: /圣诞/, month: 12, day: 25 },
  ];
  for (const item of festivals) {
    if (item.pattern.test(text)) return isoDate(nextOccurrence(now, item.month, item.day));
  }
  return null;
}

const VENUE_KEYWORDS: { pattern: RegExp; venue: VenueKind }[] = [
  { pattern: /线上|直播|腾讯会议|zoom|云端/, venue: 'online' },
  { pattern: /会展中心|展馆|展厅|展位|博览/, venue: 'expo' },
  { pattern: /体育馆|田径场|球场|体育场/, venue: 'stadium' },
  { pattern: /酒店|宴会厅|会议中心|会所/, venue: 'hotel' },
  { pattern: /礼堂|报告厅|多功能厅|剧场|剧院|大讲堂/, venue: 'indoor-large' },
  { pattern: /教室|会议室|咖啡厅|办公室|包间|活动室|图书馆/, venue: 'indoor-small' },
  { pattern: /室内外|主会场.{0,6}户外|户外.{0,6}主会场/, venue: 'mixed' },
  { pattern: /户外|广场|公园|操场|草坪|街区|营地|沙滩|山顶/, venue: 'outdoor' },
];

export function parseVenue(text: string): VenueKind | null {
  for (const item of VENUE_KEYWORDS) if (item.pattern.test(text)) return item.venue;
  return null;
}

/** 目标：抓取文本中的目的性表达 */
export function parseGoal(text: string): string | null {
  const rules: { pattern: RegExp; goal: string }[] = [
    { pattern: /招新|纳新|招募/, goal: '完成招募，沉淀可跟进的报名名单' },
    { pattern: /宣传|推广|曝光|传播/, goal: '扩大影响力，形成可持续传播的内容' },
    { pattern: /比赛|竞赛|竞技|赛事/, goal: '公平完成比赛并产出可信的结果' },
    { pattern: /募捐|筹款|义卖/, goal: '完成筹款目标并公开善款去向' },
    { pattern: /招聘|就业|求职/, goal: '提升人岗匹配效率，促成面试与录用' },
    { pattern: /培训|学习|科普|教育/, goal: '让参与者掌握可迁移的知识或方法' },
    { pattern: /交流|交友|认识|连接|社交/, goal: '促进参与者之间的连接与后续互动' },
    { pattern: /庆祝|纪念|毕业|年会|节庆/, goal: '营造仪式感，形成共同记忆' },
    { pattern: /团建|凝聚|协作/, goal: '提升团队协作与成员归属感' },
    { pattern: /发布|新品|上市/, goal: '完成产品发布并转化为市场声量' },
  ];
  const matched = rules.filter((item) => item.pattern.test(text));
  return matched.length ? matched[0].goal : null;
}

export function parseAudience(text: string): string | null {
  const rules: { pattern: RegExp; audience: string }[] = [
    { pattern: /新生/, audience: '新生及家长' },
    { pattern: /毕业生/, audience: '毕业生与在校生' },
    { pattern: /员工|同事|职工/, audience: '公司员工' },
    { pattern: /居民|社区|街坊/, audience: '社区居民' },
    { pattern: /客户|合作伙伴|甲方/, audience: '客户与合作伙伴' },
    { pattern: /媒体|记者/, audience: '媒体与意见领袖' },
    { pattern: /校友/, audience: '校友' },
    { pattern: /亲子|儿童|孩子|家庭/, audience: '亲子家庭' },
    { pattern: /学生|同学|师生/, audience: '在校学生' },
    { pattern: /投资人|创业者/, audience: '创业者与投资人' },
  ];
  const matched = rules.filter((item) => item.pattern.test(text));
  return matched.length ? matched[0].audience : null;
}

/** 类型匹配：关键词越长越具体，命中得分越高 */
export function matchCategory(text: string): { category: EventCategory; matched: string[]; score: number } {
  const normalized = text.toLowerCase();
  let best = GENERIC_CATEGORY;
  let bestScore = 0;
  let bestMatched: string[] = [];

  for (const category of CATEGORIES) {
    let score = 0;
    const matched: string[] = [];
    for (const keyword of category.keywords) {
      if (normalized.includes(keyword.toLowerCase())) {
        score += keyword.length * 2 + 2;
        matched.push(keyword);
      }
    }
    if (normalized.includes(category.label.toLowerCase())) {
      score += 8;
      matched.push(category.label);
    }
    if (score > bestScore) {
      best = category;
      bestScore = score;
      bestMatched = matched;
    }
  }
  return { category: best, matched: bestMatched, score: bestScore };
}

/* ---------------- 日期与数值格式化 ---------------- */

export function formatDateLabel(iso: string): string {
  if (!iso) return '';
  const date = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  const weekday = ['日', '一', '二', '三', '四', '五', '六'][date.getDay()];
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日（周${weekday}）`;
}

export function formatDurationLabel(minutes: number, days: number): string {
  if (days > 1) return `${days} 天（每天约 ${Math.round(minutes / 60)} 小时）`;
  if (minutes % 60 === 0) return `${minutes / 60} 小时`;
  return `${Math.floor(minutes / 60)} 小时 ${minutes % 60} 分钟`;
}

const fieldLabels: Record<BriefFieldKey, string> = {
  category: '活动类型',
  title: '活动名称',
  people: '参与人数',
  budget: '预算',
  duration: '活动时长',
  date: '举办日期',
  venue: '场地类型',
  goal: '活动目标',
  audience: '参与人群',
  theme: '活动主题',
  constraints: '特殊要求',
};

export const fieldLabel = (key: BriefFieldKey) => fieldLabels[key];

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

/** 默认日期按活动性质落在合理的工作日/周末，避免"周日晚上的学术会议" */
function defaultPlanningDate(now: Date, family: string, leadDays: number) {
  const base = addDays(now, leadDays);
  if (['business', 'academic', 'career', 'education'].includes(family)) {
    return addDays(base, (3 - base.getDay() + 7) % 7);
  }
  if (['campus', 'social', 'arts'].includes(family)) {
    return addDays(base, (6 - base.getDay() + 7) % 7);
  }
  return base;
}

/** 根据已填字段重算假设清单与派生标签 */
export function refreshBrief(brief: EventBrief): EventBrief {
  const category = getCategory(brief.categoryId);
  const dateLabel = brief.date ? formatDateLabel(brief.date) : '';
  const assumptions: Assumption[] = [];
  const push = (field: BriefFieldKey, value: string, reason: string) =>
    assumptions.push({ field, label: fieldLabels[field], value, reason });

  if (brief.sources.category === 'assumed') {
    push('category', category.label, '未识别到明确的活动类型，先按通用活动框架策划，可在下方切换');
  }
  if (brief.sources.people === 'assumed') {
    push('people', `${brief.people} 人`, '按同类活动的常见规模估算');
  }
  if (brief.sources.budget === 'assumed') {
    push('budget', `¥${brief.budget.toLocaleString('zh-CN')}`, '按同类活动的常见预算水平估算');
  }
  if (brief.sources.date === 'assumed') {
    push('date', dateLabel || '暂未确定日期', '未给出日期，按 4 周筹备期安排执行倒排');
  }
  if (brief.sources.duration === 'assumed') {
    push('duration', formatDurationLabel(brief.durationMinutes, brief.days), '按同类活动的常见时长设定');
  }
  if (brief.sources.venue === 'assumed') {
    push('venue', venueLabel(brief.venue), '按该类活动最常见的场地类型设定');
  }
  if (brief.sources.audience === 'assumed') {
    push('audience', brief.audience, '按活动类型的典型参与人群设定');
  }
  if (brief.sources.goal === 'assumed') {
    push('goal', brief.goal, '按活动类型的常见目标设定');
  }

  return {
    ...brief,
    dateLabel,
    assumptions,
  };
}

export interface CreateBriefOptions {
  now?: Date;
  /** 4 周后的默认日期，便于倒排执行计划 */
  defaultLeadDays?: number;
}

/** 从一句想法生成结构化需求（缺失项用假设填充） */
export function createBrief(idea: string, options: CreateBriefOptions = {}): EventBrief {
  const text = idea.trim();
  const now = options.now ?? new Date();
  const { category, score } = matchCategory(text);
  const people = parsePeople(text);
  const budget = parseBudget(text);
  const duration = parseDuration(text);
  const date = parseDate(text, now);
  const venue = parseVenue(text);
  const goal = parseGoal(text);
  const audience = parseAudience(text);

  const sources: Partial<Record<BriefFieldKey, SourceTag>> = {
    category: score > 0 ? 'inferred' : 'assumed',
    people: people ? 'inferred' : 'assumed',
    budget: budget !== null ? 'inferred' : 'assumed',
    duration: duration ? 'inferred' : 'assumed',
    date: date ? 'inferred' : 'assumed',
    venue: venue ? 'inferred' : 'assumed',
    goal: goal ? 'inferred' : 'assumed',
    audience: audience ? 'inferred' : 'assumed',
    title: 'assumed',
    theme: 'assumed',
  };

  const defaultVenue = venue ?? category.defaultVenue ?? 'indoor-large';
  const defaultDate = date ?? isoDate(defaultPlanningDate(now, category.family, options.defaultLeadDays ?? 28));

  const brief: EventBrief = {
    idea: text,
    title: '',
    categoryId: category.id,
    family: category.family,
    people: people ?? category.defaultPeople ?? 80,
    budget: budget ?? category.defaultBudget ?? 5000,
    durationMinutes: duration?.minutes ?? category.defaultDuration ?? 180,
    days: duration?.days ?? 1,
    date: defaultDate,
    dateLabel: '',
    venue: defaultVenue,
    venueNote: '',
    goal: goal ?? defaultGoal(category),
    theme: '',
    audience: audience ?? category.defaultAudience ?? '目标参与者',
    constraints: '',
    sources,
    assumptions: [],
  };
  return refreshBrief(brief);
}

/* ---------------- 预设与类型入口 ---------------- */

/** 从预设模板起稿：需求字段全部标记为「预设」，用户可随后修改或清除 */
export function createBriefFromPreset(presetId: string, options: CreateBriefOptions = {}): EventBrief {
  const preset = getPreset(presetId);
  if (!preset) return createBrief('', options);
  const category = getCategory(preset.categoryId);
  const now = options.now ?? new Date();
  const sources: Partial<Record<BriefFieldKey, SourceTag>> = {
    category: 'preset',
    people: 'preset',
    budget: 'preset',
    duration: 'preset',
    venue: 'preset',
    goal: 'preset',
    audience: 'preset',
    title: 'preset',
    date: 'assumed',
    theme: 'assumed',
    constraints: 'assumed',
  };
  const brief: EventBrief = {
    idea: `${preset.name}：${preset.tagline}`,
    title: preset.name,
    categoryId: category.id,
    family: category.family,
    people: preset.people,
    budget: preset.budget,
    durationMinutes: preset.duration,
    days: preset.days ?? 1,
    date: isoDate(defaultPlanningDate(now, category.family, options.defaultLeadDays ?? 28)),
    dateLabel: '',
    venue: preset.venue,
    venueNote: '',
    goal: preset.goal,
    theme: '',
    audience: preset.audience,
    constraints: '',
    presetId: preset.id,
    sources,
    assumptions: [],
  };
  return refreshBrief(brief);
}

/** 只选类型、不起用预设：其余字段按该类型的常见值补成假设 */
export function createBriefFromCategory(categoryId: string, options: CreateBriefOptions = {}): EventBrief {
  const base = createBrief('', options);
  return updateField(base, 'category', categoryId);
}

/**
 * 删除预设内容：解除预设关联，把预设带入的字段退回该类型默认值并标记为假设，
 * 让用户可以重新填写（类型与日期保留）。
 */
export function clearPreset(brief: EventBrief): EventBrief {
  const category = getCategory(brief.categoryId);
  const sources = { ...brief.sources };
  const keep = (key: BriefFieldKey) => brief.sources[key] === 'user';
  (['title', 'people', 'budget', 'duration', 'venue', 'goal', 'audience', 'constraints'] as BriefFieldKey[])
    .forEach((key) => {
      if (sources[key] === 'preset') sources[key] = 'assumed';
    });
  // 只清除预设带入的内容，保留用户主动修改或补充的字段。
  sources.category = keep('category') ? 'user' : 'assumed';
  return refreshBrief({
    ...brief,
    presetId: undefined,
    title: keep('title') ? brief.title : '',
    people: keep('people') ? brief.people : (category.defaultPeople ?? brief.people),
    budget: keep('budget') ? brief.budget : (category.defaultBudget ?? brief.budget),
    durationMinutes: keep('duration') ? brief.durationMinutes : (category.defaultDuration ?? brief.durationMinutes),
    days: keep('duration') ? brief.days : 1,
    venue: keep('venue') ? brief.venue : (category.defaultVenue ?? brief.venue),
    goal: keep('goal') ? brief.goal : defaultGoal(category),
    audience: keep('audience') ? brief.audience : (category.defaultAudience ?? brief.audience),
    constraints: keep('constraints') ? brief.constraints : '',
    sources,
  });
}

const GOALS: Record<string, string> = {
  campus: '让参与者产生归属感，并留下可跟进的联系方式',
  academic: '完成高质量的内容交流，形成可沉淀的学术产出',
  sports: '公平、安全地完成比赛，让参与者有完整体验',
  charity: '真实回应服务对象需求，形成可核验的服务成果',
  business: '完成信息传递与商务转化，形成可复用的传播素材',
  startup: '筛选出优质项目，并促成投资与产业对接',
  arts: '呈现一场完整、有记忆点的演出或展览',
  education: '让参与者掌握可迁移的知识与方法',
  career: '提升人岗匹配效率，促成面试与录用',
  social: '让参与者放松、连接，留下共同记忆',
  generic: '达成活动的核心目的，并形成可复盘的记录',
};

function defaultGoal(category: EventCategory) {
  return GOALS[category.family] ?? GOALS.generic;
}

/* ---------------- 提问机制 ---------------- */

const MAX_QUESTIONS = 3;
const priority: BriefFieldKey[] = ['people', 'budget', 'date', 'duration', 'venue', 'goal', 'audience'];

const niceNumber = (value: number) => {
  if (value <= 10) return Math.max(4, Math.round(value));
  if (value < 100) return Math.round(value / 5) * 5;
  if (value < 1000) return Math.round(value / 10) * 10;
  if (value < 10000) return Math.round(value / 100) * 100;
  return Math.round(value / 1000) * 1000;
};

const moneyLabel = (value: number) => (value >= 10000 ? `¥${(value / 10000).toFixed(value % 10000 === 0 ? 0 : 1)} 万` : `¥${value.toLocaleString('zh-CN')}`);

function peopleQuestion(brief: EventBrief): BriefQuestion {
  const base = brief.people;
  const values = [...new Set([niceNumber(base * 0.4), base, niceNumber(base * 2.5), niceNumber(base * 6)])]
    .filter((value) => value >= 4)
    .sort((a, b) => a - b);
  return {
    id: 'q-people',
    field: 'people',
    prompt: '这场活动预计有多少人参与？',
    options: values.map((value) => ({
      label: `${value} 人`,
      value: String(value),
      hint: value < 10 ? '微型' : value < 50 ? '小型' : value < 300 ? '中型' : value < 1000 ? '大型' : '超大型',
    })),
  };
}

function budgetQuestion(brief: EventBrief): BriefQuestion {
  const base = Math.max(0, brief.budget);
  const values = [...new Set([niceNumber(base * 0.5), base, niceNumber(base * 2), niceNumber(base * 5)])];
  const perCapita = brief.people ? Math.round(base / brief.people) : 0;
  return {
    id: 'q-budget',
    field: 'budget',
    prompt: '可用的经费大概是多少？',
    options: values.map((value) => ({
      label: value === 0 ? '零预算' : moneyLabel(value),
      value: String(value),
      hint: perCapita ? `人均约 ¥${Math.round(value / Math.max(1, brief.people))}` : undefined,
    })),
  };
}

function dateQuestion(now: Date): BriefQuestion {
  const candidates = [
    { label: '本周末', date: upcomingWeekday(now, 6) },
    { label: '两周后', date: addDays(now, 14) },
    { label: '一个月后', date: addDays(now, 30) },
    { label: '三个月后', date: addDays(now, 90) },
  ];
  return {
    id: 'q-date',
    field: 'date',
    prompt: '计划在什么时候举办？',
    options: candidates.map((item) => ({
      label: item.label,
      value: isoDate(item.date),
      hint: formatDateLabel(isoDate(item.date)),
    })),
  };
}

function durationQuestion(): BriefQuestion {
  return {
    id: 'q-duration',
    field: 'duration',
    prompt: '活动大概持续多久？',
    options: [
      { label: '1–2 小时', value: '90', hint: '适合讲座、宣讲、短会' },
      { label: '半天', value: '240', hint: '约 4 小时' },
      { label: '全天', value: '480', hint: '约 8 小时' },
      { label: '两天及以上', value: '2d', hint: '按多日安排筹备' },
    ],
  };
}

function venueQuestion(brief: EventBrief): BriefQuestion {
  const preferred = brief.venue;
  const pool: VenueKind[] = [preferred, 'indoor-large', 'outdoor', 'online'];
  const unique = [...new Set(pool)];
  return {
    id: 'q-venue',
    field: 'venue',
    prompt: '预计在什么类型的场地举办？',
    options: unique.map((id) => {
      const venue = VENUES.find((item) => item.id === id)!;
      return { label: venue.label, value: id, hint: venue.hint };
    }),
  };
}

function goalQuestion(brief: EventBrief): BriefQuestion {
  const category = getCategory(brief.categoryId);
  const pool = [
    category.family === 'business' ? '完成商务转化与品牌传播' : '扩大影响力与传播',
    '让参与者有良好体验并愿意再来',
    '沉淀可持续运营的参与者社群',
    '产出可对外展示的成果或作品',
  ];
  return {
    id: 'q-goal',
    field: 'goal',
    prompt: '这次活动最想达成什么？',
    options: pool.map((text) => ({ label: text, value: text })),
  };
}

function audienceQuestion(brief: EventBrief): BriefQuestion {
  const category = getCategory(brief.categoryId);
  const pool = [
    category.defaultAudience ?? '目标参与者',
    '在校学生',
    '公司员工',
    '社区居民',
  ];
  return {
    id: 'q-audience',
    field: 'audience',
    prompt: '主要面向哪些人？',
    options: [...new Set(pool)].map((text) => ({ label: text, value: text })),
  };
}

/**
 * 生成下一轮问题：只问仍为"假设"的关键字段，最多 3 个。
 * asked 传已问过的字段，避免重复追问。
 */
export function nextQuestions(brief: EventBrief, asked: BriefFieldKey[] = []): BriefQuestion[] {
  const now = new Date();
  const pending = priority.filter((field) => {
    if (asked.includes(field)) return false;
    const source = brief.sources[field];
    return source !== 'user' && source !== 'inferred' && source !== 'preset';
  });

  return pending.slice(0, MAX_QUESTIONS).map((field) => {
    switch (field) {
      case 'people': return peopleQuestion(brief);
      case 'budget': return budgetQuestion(brief);
      case 'date': return dateQuestion(now);
      case 'duration': return durationQuestion();
      case 'venue': return venueQuestion(brief);
      case 'goal': return goalQuestion(brief);
      default: return audienceQuestion(brief);
    }
  });
}

/** 把一次回答写回需求，并更新来源标记 */
export function applyAnswer(brief: EventBrief, question: BriefQuestion, rawValue: string): EventBrief {
  const value = rawValue.trim();
  if (!value) return brief;
  const sources = { ...brief.sources, [question.field]: 'user' as SourceTag };
  const next: EventBrief = { ...brief, sources };

  switch (question.field) {
    case 'people':
      next.people = Math.min(200000, Math.max(1, Math.round(Number(value) || brief.people)));
      break;
    case 'budget':
      next.budget = Math.max(0, Math.round(Number(value) || 0));
      break;
    case 'date':
      next.date = value;
      break;
    case 'duration':
      if (value.endsWith('d')) {
        next.days = Math.max(2, Math.round(Number(value.replace('d', '')) || 2));
        next.durationMinutes = 480;
      } else {
        next.durationMinutes = Math.min(720, Math.max(15, Math.round(Number(value) || brief.durationMinutes)));
        next.days = 1;
      }
      break;
    case 'venue':
      next.venue = value as VenueKind;
      break;
    case 'goal':
      next.goal = value.slice(0, 120);
      break;
    case 'audience':
      next.audience = value.slice(0, 120);
      break;
    case 'category':
      return updateField(brief, 'category', value);
  }
  return refreshBrief(next);
}

/** 手动编辑任一字段（数字/文本/枚举都走这里） */
export function updateField(brief: EventBrief, key: BriefFieldKey, rawValue: string): EventBrief {
  const value = rawValue.trim();
  const sources = { ...brief.sources, [key]: 'user' as SourceTag };
  const next: EventBrief = { ...brief, sources };

  switch (key) {
    case 'category': {
      const category = getCategory(value);
      next.categoryId = category.id;
      next.family = category.family;
      // 换了类型就不再套用原预设的流程与预算结构
      if (category.id !== brief.categoryId) next.presetId = undefined;
      if (brief.sources.people === 'assumed') next.people = category.defaultPeople ?? brief.people;
      if (brief.sources.venue === 'assumed') next.venue = category.defaultVenue ?? brief.venue;
      if (brief.sources.audience === 'assumed') next.audience = category.defaultAudience ?? brief.audience;
      break;
    }
    case 'title': next.title = value.slice(0, 60); break;
    case 'theme': next.theme = value.slice(0, 60); break;
    case 'people': next.people = Math.min(200000, Math.max(1, Math.round(Number(value) || brief.people))); break;
    case 'budget': next.budget = Math.max(0, Math.round(Number(value) || 0)); break;
    case 'date': next.date = value; break;
    case 'venue': next.venue = value as VenueKind; break;
    case 'goal': next.goal = value.slice(0, 120); break;
    case 'audience': next.audience = value.slice(0, 120); break;
    case 'constraints': next.constraints = value.slice(0, 300); break;
    case 'duration': {
      const parsed = parseDuration(value);
      next.durationMinutes = parsed?.minutes ?? brief.durationMinutes;
      if (parsed && parsed.days > 1) next.days = parsed.days;
      break;
    }
  }
  return refreshBrief(next);
}

/** 界面展示用的场地说明 */
export function describeVenue(venue: VenueKind) {
  const meta = VENUES.find((item) => item.id === venue)!;
  return { ...meta, outdoor: isOutdoor(venue) };
}
