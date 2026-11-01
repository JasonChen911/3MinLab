import { getCategory, venueLabel } from '../data/taxonomy';
import { formatDurationLabel, refreshBrief, updateField } from './intake';
import type { BriefModifiers, EventBrief, EventPlan, VenueKind } from '../types';

/* ============================================================
 * 自然语言修改
 *
 * 目标：用户说一句"预算压到 5000"，不是只改一个数字，
 * 而是改需求 → 重新生成 → 流程、人员、物资、预算、风险全部联动。
 *
 * 这里只负责"听懂"和"改需求"；联动由生成器天然完成，
 * 差异说明由 diffPlans 对比两份方案得出。
 * ============================================================ */

export interface RevisionChange {
  field: string;
  before: string;
  after: string;
}

export interface RevisionResult {
  brief: EventBrief;
  changes: RevisionChange[];
  /** 未能识别的要求（原文） */
  unknown: string[];
}

/** 界面回显：改了什么、连带影响了什么 */
export interface RevisionOutcome {
  changes: RevisionChange[];
  impacts: string[];
  unknown?: string[];
}

const money = (value: number) => `¥${Math.round(value).toLocaleString('zh-CN')}`;

/** 预算：预算/经费 + 数字，支持"万/千" */
function parseBudgetChange(text: string): number | null {
  const match = text.match(/(?:预算|经费)[^0-9]{0,10}?(\d+(?:\.\d+)?)\s*(万|千|w|k)?/i);
  if (!match) return null;
  const base = Number(match[1]);
  if (!Number.isFinite(base)) return null;
  const unit = (match[2] ?? '').toLowerCase();
  const multiplier = unit === '万' || unit === 'w' ? 10000 : unit === '千' || unit === 'k' ? 1000 : 1;
  const value = Math.round(base * multiplier);
  return value > 0 && value <= 100000000 ? value : null;
}

/** 人数：优先取区间右值，例如"从 100 人增加到 300 人" */
function parsePeopleChange(text: string): number | null {
  if (!/(人数|规模|参与|来人|参加|容纳)/.test(text)) {
    const bare = text.match(/(?:改成|改为|调整到|增加到)\s*(\d+)\s*人/);
    return bare ? Number(bare[1]) : null;
  }
  const range = text.match(/(\d+)\s*人?[^0-9]{0,8}?(?:增加到|增至|调整到|调整为|改为|变为|到|至)\s*(\d+)/);
  if (range) return Number(range[2]);
  const direct = text.match(/(?:人数|规模|参与|参加|容纳)[^0-9]{0,10}?(\d+)\s*人?/);
  if (direct) return Number(direct[1]);
  return null;
}

/** 时长：支持半天/全天/小时/分钟 */
function parseDurationChange(text: string): number | null {
  const context = /(时长|时间|周期|流程|缩短|压缩|改为|调整|控制|减少)/.test(text);
  if (!context) return null;
  if (/半天|半日/.test(text)) return 240;
  if (/一天|全天|整日/.test(text)) return 480;
  const hours = text.match(/(\d+(?:\.\d+)?)\s*(?:个)?\s*小时/);
  if (hours) {
    const minutes = Math.round(Number(hours[1]) * 60);
    return minutes >= 15 && minutes <= 720 ? minutes : null;
  }
  const min = text.match(/(\d+)\s*分钟/);
  if (min) {
    const minutes = Number(min[1]);
    return minutes >= 15 && minutes <= 720 ? minutes : null;
  }
  return null;
}

const VENUE_RULES: { pattern: RegExp; venue: VenueKind }[] = [
  { pattern: /室外|户外/, venue: 'outdoor' },
  { pattern: /体育馆|体育场/, venue: 'stadium' },
  { pattern: /酒店|宴会厅/, venue: 'hotel' },
  { pattern: /展馆|会展/, venue: 'expo' },
  { pattern: /线上|直播/, venue: 'online' },
  { pattern: /室内/, venue: 'indoor-large' },
];

function parseVenueChange(text: string): VenueKind | null {
  if (!/(改为|改成|换成|调整到|转到|搬到|移到|放在|在室外|在户外)/.test(text)) return null;
  for (const rule of VENUE_RULES) if (rule.pattern.test(text)) return rule.venue;
  return null;
}

function parseStaffScale(text: string, current: number): number | null {
  const subject = /(工作人员|人手|人力|人员|志愿者|安保|团队)/.test(text);
  if (!subject) return null;
  if (/(减少|精简|压缩|削减|砍掉|少配)/.test(text)) return Math.max(0.4, Number((current * 0.7).toFixed(2)));
  if (/(增加|补充|加强|多配|加人)/.test(text)) return Math.min(2, Number((current * 1.3).toFixed(2)));
  return null;
}

/** 追加互动：返回要加进方案的互动名称 */
function parseInteractionAdd(text: string, family: string): string[] | null {
  if (!/(增加|加|补充|多一些|丰富|加入)/.test(text)) return null;
  if (!/(互动|环节|体验|游戏|玩法|交流)/.test(text)) return null;
  const pool: Record<string, string[]> = {
    arts: ['观众投票选最受欢迎节目', '返场合唱与合影'],
    sports: ['中场互动抽奖', '观众加油墙/应援牌'],
    business: ['现场提问与抽奖', '体验区打卡集章'],
    charity: ['服务对象心愿卡', '志愿者与对象结对交流'],
    education: ['分组动手挑战', '有奖知识问答'],
    campus: ['扫码打卡抽奖', '分组破冰挑战'],
    social: ['桌游或破冰游戏', '合影打卡环节'],
    academic: ['茶歇话题卡', '海报快闪 1 分钟'],
    startup: ['观众人气投票', '投资人一对一快聊'],
    career: ['简历门诊快闪', '模拟面试体验'],
    generic: ['破冰问答', '扫码打卡抽奖'],
  };
  return (pool[family] ?? pool.generic).slice(0, 2);
}

/** 安全相关表述：触发安全强化 */
function wantsSafetyBoost(text: string): boolean {
  return /(安全|未成年人|儿童|学生|保险|报备|合规|消防|医疗)/.test(text);
}

export function reviseBrief(brief: EventBrief, rawText: string): RevisionResult {
  const text = rawText.trim();
  const changes: RevisionChange[] = [];
  const notes: string[] = [];
  let next = brief;
  let modifiers: BriefModifiers = { ...(brief.modifiers ?? {}) };

  if (!text) return { brief, changes, unknown: [] };

  const budget = parseBudgetChange(text);
  if (budget !== null && budget !== brief.budget) {
    changes.push({ field: '预算', before: money(brief.budget), after: money(budget) });
    notes.push(`预算 ${money(brief.budget)} → ${money(budget)}`);
    next = updateField(next, 'budget', String(budget));
  }

  const people = parsePeopleChange(text);
  if (people !== null && people !== brief.people && people >= 1) {
    changes.push({ field: '人数', before: `${brief.people} 人`, after: `${people} 人` });
    notes.push(`人数 ${brief.people} → ${people}`);
    next = updateField(next, 'people', String(people));
  }

  const duration = parseDurationChange(text);
  if (duration !== null && duration !== brief.durationMinutes) {
    changes.push({ field: '时长', before: formatDurationLabel(brief.durationMinutes, brief.days), after: formatDurationLabel(duration, 1) });
    notes.push(`时长 ${formatDurationLabel(brief.durationMinutes, 1)} → ${formatDurationLabel(duration, 1)}`);
    next = updateField(next, 'duration', `${duration} 分钟`);
  }

  const venue = parseVenueChange(text);
  if (venue && venue !== brief.venue) {
    changes.push({ field: '场地', before: venueLabel(brief.venue), after: venueLabel(venue) });
    notes.push(`场地改为${venueLabel(venue)}`);
    next = updateField(next, 'venue', venue);
  }

  const staffScale = parseStaffScale(text, modifiers.staffScale ?? 1);
  if (staffScale !== null) {
    changes.push({
      field: '人员配置',
      before: modifiers.staffScale ? `${Math.round(modifiers.staffScale * 100)}%` : '标准配置',
      after: `${Math.round(staffScale * 100)}%`,
    });
    notes.push(`人员编制调整为标准的 ${Math.round(staffScale * 100)}%`);
    modifiers = { ...modifiers, staffScale };
  }

  const extra = parseInteractionAdd(text, getCategory(next.categoryId).family);
  if (extra) {
    const merged = [...new Set([...(modifiers.extraInteractions ?? []), ...extra])];
    changes.push({ field: '互动环节', before: `${modifiers.extraInteractions?.length ?? 0} 个追加`, after: `${merged.length} 个追加` });
    notes.push(`追加互动：${extra.join('、')}`);
    modifiers = { ...modifiers, extraInteractions: merged };
    // 追加互动通常意味着更多物资与更长的现场时间
    if (next.durationMinutes <= 60) {
      next = updateField(next, 'duration', '90 分钟');
      notes.push('为保证互动时间，时长同步调整为 90 分钟');
    }
  }

  if (wantsSafetyBoost(text) && !modifiers.safetyBoost) {
    modifiers = { ...modifiers, safetyBoost: true };
    changes.push({ field: '安全条款', before: '常规', after: '强化' });
    notes.push('已加强安全与合规要求');
  }

  if (!changes.length) {
    return { brief, changes: [], unknown: [text] };
  }

  modifiers = { ...modifiers, revisionNote: notes.join('；') };
  next = refreshBrief({ ...next, modifiers });

  return { brief: next, changes, unknown: [] };
}

/* ---------------- AI 兜底：结构化补丁 ---------------- */

export interface RevisionPatch {
  budget?: number;
  people?: number;
  duration?: number;
  venue?: VenueKind;
  staffScale?: number;
  extraInteractions?: string[];
  safetyBoost?: boolean;
  note?: string;
}

/** 把 AI 返回的结构化补丁应用到需求上（本地仍会做范围校验） */
export function applyPatch(brief: EventBrief, patch: RevisionPatch): RevisionResult {
  const changes: RevisionChange[] = [];
  const notes: string[] = [];
  let next = brief;
  let modifiers: BriefModifiers = { ...(brief.modifiers ?? {}) };

  if (typeof patch.budget === 'number' && patch.budget >= 0 && patch.budget <= 100000000 && patch.budget !== brief.budget) {
    changes.push({ field: '预算', before: money(brief.budget), after: money(patch.budget) });
    notes.push(`预算 ${money(brief.budget)} → ${money(patch.budget)}`);
    next = updateField(next, 'budget', String(Math.round(patch.budget)));
  }

  if (typeof patch.people === 'number' && patch.people >= 1 && patch.people <= 200000 && patch.people !== brief.people) {
    changes.push({ field: '人数', before: `${brief.people} 人`, after: `${Math.round(patch.people)} 人` });
    notes.push(`人数 ${brief.people} → ${Math.round(patch.people)}`);
    next = updateField(next, 'people', String(Math.round(patch.people)));
  }

  if (typeof patch.duration === 'number' && patch.duration >= 15 && patch.duration <= 43200 && patch.duration !== brief.durationMinutes) {
    changes.push({ field: '时长', before: formatDurationLabel(brief.durationMinutes, brief.days), after: formatDurationLabel(patch.duration, 1) });
    notes.push(`时长 ${formatDurationLabel(brief.durationMinutes, 1)} → ${formatDurationLabel(patch.duration, 1)}`);
    next = updateField(next, 'duration', `${Math.round(patch.duration)} 分钟`);
  }

  if (patch.venue && patch.venue !== brief.venue) {
    changes.push({ field: '场地', before: venueLabel(brief.venue), after: venueLabel(patch.venue) });
    notes.push(`场地改为${venueLabel(patch.venue)}`);
    next = updateField(next, 'venue', patch.venue);
  }

  if (typeof patch.staffScale === 'number' && patch.staffScale >= 0.4 && patch.staffScale <= 2) {
    changes.push({
      field: '人员配置',
      before: modifiers.staffScale ? `${Math.round(modifiers.staffScale * 100)}%` : '标准配置',
      after: `${Math.round(patch.staffScale * 100)}%`,
    });
    notes.push(`人员编制调整为标准的 ${Math.round(patch.staffScale * 100)}%`);
    modifiers = { ...modifiers, staffScale: patch.staffScale };
  }

  if (Array.isArray(patch.extraInteractions) && patch.extraInteractions.length) {
    const added = patch.extraInteractions
      .filter((item): item is string => typeof item === 'string' && !!item.trim())
      .map((item) => item.trim().slice(0, 30))
      .slice(0, 3);
    if (added.length) {
      const merged = [...new Set([...(modifiers.extraInteractions ?? []), ...added])];
      changes.push({ field: '互动环节', before: `${modifiers.extraInteractions?.length ?? 0} 个追加`, after: `${merged.length} 个追加` });
      notes.push(`追加互动：${added.join('、')}`);
      modifiers = { ...modifiers, extraInteractions: merged };
    }
  }

  if (patch.safetyBoost === true && !modifiers.safetyBoost) {
    changes.push({ field: '安全条款', before: '常规', after: '强化' });
    notes.push('已加强安全与合规要求');
    modifiers = { ...modifiers, safetyBoost: true };
  }

  if (!changes.length) return { brief, changes: [], unknown: [patch.note || 'AI 没有给出可执行的修改'] };

  if (patch.note) notes.push(patch.note);
  modifiers = { ...modifiers, revisionNote: notes.join('；') };
  return { brief: refreshBrief({ ...next, modifiers }), changes, unknown: [] };
}

/* ---------------- 方案差异说明 ---------------- */

const staffTotalOf = (plan: EventPlan) => {
  const block = plan.modules.find((module) => module.id === 'organization')?.blocks.find((item) => item.kind === 'staff');
  return block && block.kind === 'staff' ? block.rows.reduce((sum, row) => sum + row.count, 0) : 0;
};

const timelineOf = (plan: EventPlan) => {
  const block = plan.modules.find((module) => module.id === 'program')?.blocks.find((item) => item.kind === 'timeline');
  return block && block.kind === 'timeline' ? block.entries : [];
};

const riskCountOf = (plan: EventPlan) => {
  const block = plan.modules.find((module) => module.id === 'risk')?.blocks.find((item) => item.kind === 'table');
  return block && block.kind === 'table' ? block.rows.length : 0;
};

/** 对比修改前后的方案，说明"哪些地方跟着变了" */
export function diffPlans(before: EventPlan, after: EventPlan): string[] {
  const impacts: string[] = [];
  const b = before.brief;
  const a = after.brief;

  if (b.budget !== a.budget) {
    impacts.push(`预算 ${money(b.budget)} → ${money(a.budget)}：8 个预算科目按新总额重算，人均成本 ${money(a.budget / Math.max(1, a.people))}。`);
  }
  if (b.people !== a.people) {
    impacts.push(`人数 ${b.people} → ${a.people}：工作人员 ${staffTotalOf(before)} → ${staffTotalOf(after)} 人，物资用量与餐饮按新人数重算。`);
  }
  if (b.durationMinutes !== a.durationMinutes) {
    const beforeCount = timelineOf(before).length;
    const afterCount = timelineOf(after).length;
    impacts.push(`时长 ${formatDurationLabel(b.durationMinutes, 1)} → ${formatDurationLabel(a.durationMinutes, 1)}：流程时间轴重排，环节数 ${beforeCount} → ${afterCount}。`);
  }
  if (b.venue !== a.venue) {
    impacts.push(`场地 ${venueLabel(b.venue)} → ${venueLabel(a.venue)}：天气与场地类风险重新评估，物资清单同步调整。`);
  }
  if ((b.modifiers?.staffScale ?? 1) !== (a.modifiers?.staffScale ?? 1)) {
    impacts.push(`人员编制按 ${Math.round((a.modifiers?.staffScale ?? 1) * 100)}% 执行：岗位数不变，各岗位人数重新计算。`);
  }
  if ((b.modifiers?.extraInteractions?.length ?? 0) !== (a.modifiers?.extraInteractions?.length ?? 0)) {
    impacts.push('互动环节已追加：活动内容新增环节，物资清单增加互动道具，预算中物资占比相应调整。');
  }
  if (!b.modifiers?.safetyBoost && a.modifiers?.safetyBoost) {
    impacts.push(`安全条款已强化：风险清单 ${riskCountOf(before)} → ${riskCountOf(after)} 项，新增安保/医疗/保险要求。`);
  }
  if (before.title !== after.title) {
    impacts.push(`方案名称更新为「${after.title}」。`);
  }
  if (!impacts.length) impacts.push('需求已更新，方案已按新条件重新生成。');
  return impacts;
}
