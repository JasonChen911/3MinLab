import { MODULES } from '../data/taxonomy';
import { formatMoney } from './budget';
import { exportModules } from '../planning/mode';
import type { Block, EventPlan } from '../types';

/* ============================================================
 * 导出层：把 EventPlan 渲染成可粘贴、可打印的纯文本
 * 打印复用同一份结构（浏览器打印样式在 style.css 中）。
 * ============================================================ */

export const renderBlock = (block: Block): string[] => {
  switch (block.kind) {
    case 'text':
      return [block.text, ''];
    case 'bullets':
      return [...(block.title ? [`**${block.title}**`, ''] : []), ...block.items.map((item) => `- ${item}`), ''];
    case 'checklist':
      return [...(block.title ? [`**${block.title}**`, ''] : []), ...block.items.map((item) => `- [ ] ${item}`), ''];
    case 'timeline':
      return [
        ...(block.title ? [`**${block.title}**`, ''] : []),
        ...block.entries.map((entry) => `- ${entry.time} ${entry.title}${entry.detail ? `：${entry.detail}` : ''}`),
        '',
      ];
    case 'budget':
      return [
        ...(block.title ? [`**${block.title}**`, ''] : []),
        '| 类别 | 科目 | 项目 | 金额 | 占比 |',
        '| --- | --- | --- | --- | --- |',
        ...block.rows.map((row) => `| ${row.bucket} | ${row.category} | ${row.item} | ${formatMoney(row.amount)} | ${Math.round(row.share * 100)}% |`),
        `| **合计** |  |  | **${formatMoney(block.total)}** | 100% |`,
        ...(block.note ? ['', block.note] : []),
        '',
      ];
    case 'kpis':
      return [
        ...(block.title ? [`**${block.title}**`, ''] : []),
        '| 指标 | 目标 | 核算方式 |',
        '| --- | --- | --- |',
        ...block.rows.map((row) => `| ${row.name} | ${row.target} | ${row.method} |`),
        '',
      ];
    case 'staff':
      return [
        ...(block.title ? [`**${block.title}**`, ''] : []),
        '| 岗位 | 层级 | 人数 | 职责 | 配置依据 |',
        '| --- | --- | --- | --- | --- |',
        ...block.rows.map((row) => `| ${row.role} | ${row.layer ?? '执行与保障'} | ${row.count} | ${row.duty} | ${row.basis ?? '按规模配置'} |`),
        '',
      ];
    case 'table':
      return [
        ...(block.title ? [`**${block.title}**`, ''] : []),
        `| ${block.head.join(' | ')} |`,
        `| ${block.head.map(() => '---').join(' | ')} |`,
        ...block.rows.map((row) => `| ${row.join(' | ')} |`),
        '',
      ];
  }
};

export function buildPlanMarkdown(plan: EventPlan): string {
  const lines: string[] = [];
  lines.push(`# ${plan.title}`, '');
  lines.push(`> ${plan.oneLiner}`, '');
  lines.push(`主题：${plan.theme}｜规模：${plan.brief.people} 人｜预算：${formatMoney(plan.brief.budget)}`, '');

  if (plan.assumptions.length) {
    lines.push('**本方案的假设（可在工作台修改）**', '');
    plan.assumptions.forEach((item) => lines.push(`- ${item.label}：${item.value}（${item.reason}）`));
    lines.push('');
  }

  for (const module of exportModules(plan)) {
    const meta = MODULES.find((item) => item.id === module.id)!;
    const badge = module.weight === 'key' ? '【重点】' : module.weight === 'brief' ? '【简要】' : '';
    lines.push(`## ${meta.order}. ${module.title}${badge}`, '');
    for (const block of module.blocks) lines.push(...renderBlock(block));
    if (module.aiNote) lines.push(`> AI 补充：${module.aiNote}`, '');
  }

  lines.push('---', '');
  lines.push(`生成时间：${new Date(plan.createdAt).toLocaleString('zh-CN')}`);
  lines.push('说明：预算与用量均为估算，实际执行请以询价与现场踏勘为准。');
  return lines.join('\n');
}

/** 可直接发群的招募文案 */
export function buildPromotionPost(plan: EventPlan): string {
  const { brief } = plan;
  const date = brief.dateLabel || brief.date || '时间待定';
  const highlights = plan.modules
    .find((module) => module.id === 'program')
    ?.blocks.find((block) => block.kind === 'timeline');
  const firstItems = highlights && highlights.kind === 'timeline'
    ? highlights.entries.slice(1, 4).map((entry) => entry.title)
    : [];

  return [
    `【${plan.title}】`,
    `${plan.theme}`,
    '',
    `${plan.oneLiner}`,
    '',
    `时间：${date}（约 ${Math.round(brief.durationMinutes / 60)} 小时）`,
    `地点：${brief.venueNote || '具体地点报名后通知'}`,
    highlights ? `现场：${firstItems.join(' / ')}` : '',
    `对象：${brief.audience}`,
    `报名：填写报名表并加入活动群，名额 ${brief.people} 人，额满即止。`,
    '',
    '期待在活动现场见到你。',
  ]
    .filter((line) => line !== '')
    .join('\n');
}

/** 供 AI 协同使用的精简上下文（避免把整份方案塞进请求） */
export function buildAiContext(plan: EventPlan) {
  return {
    title: plan.title,
    theme: plan.theme,
    category: plan.brief.categoryId,
    people: plan.brief.people,
    budget: plan.brief.budget,
    duration: plan.brief.durationMinutes,
    venue: plan.brief.venue,
    goal: plan.brief.goal,
    audience: plan.brief.audience,
    modules: plan.modules.map((module) => ({
      id: module.id,
      title: module.title,
      weight: module.weight,
      summary: module.summary,
    })),
  };
}
