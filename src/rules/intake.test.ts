import { describe, expect, it } from 'vitest';
import {
  applyAnswer,
  createBrief,
  matchCategory,
  nextQuestions,
  parseBudget,
  parseDate,
  parseDuration,
  parseNumber,
  parsePeople,
  updateField,
} from './intake';

const NOW = new Date('2026-11-01T10:00:00');

describe('数字与数量解析', () => {
  it('解析中文数字', () => {
    expect(parseNumber('三百')).toBe(300);
    expect(parseNumber('两千')).toBe(2000);
    expect(parseNumber('十二')).toBe(12);
    expect(parseNumber('1.5')).toBe(1.5);
    expect(parseNumber('abc')).toBeNull();
  });

  it('识别人数，不把日期当人数', () => {
    expect(parsePeople('约 300 人参加')).toBe(300);
    expect(parsePeople('两千人左右')).toBe(2000);
    expect(parsePeople('1.2 万人报名')).toBe(12000);
    expect(parsePeople('2026年11月1日举办')).toBeNull();
  });

  it('识别预算，必须带货币线索', () => {
    expect(parseBudget('预算 8000 元')).toBe(8000);
    expect(parseBudget('经费 5 万')).toBe(50000);
    expect(parseBudget('总预算 ¥120,000')).toBe(120000);
    expect(parseBudget('预计 500 人')).toBeNull();
  });

  it('识别时长与天数', () => {
    expect(parseDuration('两个小时')).toEqual({ minutes: 120, days: 1 });
    expect(parseDuration('半天')).toEqual({ minutes: 240, days: 1 });
    expect(parseDuration('两天')).toEqual({ minutes: 480, days: 2 });
    expect(parseDuration('90 分钟')).toEqual({ minutes: 90, days: 1 });
    expect(parseDuration('随便')).toBeNull();
  });

  it('识别绝对与相对日期', () => {
    expect(parseDate('2026-11-20', NOW)).toBe('2026-11-20');
    expect(parseDate('12月5日', NOW)).toBe('2026-12-05');
    expect(parseDate('下周六', NOW)).toBe('2026-11-14');
    expect(parseDate('明天', NOW)).toBe('2026-11-02');
  });
});

describe('活动类型识别', () => {
  const cases: [string, string][] = [
    ['下个月给新生办一场校园迎新', 'campus-welcome'],
    ['办一场 800 人的校园马拉松', 'sports-marathon'],
    ['公司新品发布会', 'business-launch'],
    ['社区环保宣传日', 'charity-green'],
    ['毕业晚会', 'arts-graduation'],
    ['秋季校园招聘会', 'career-jobfair'],
    ['部门团建', 'social-teambuilding'],
    ['完全没听说过的活动', 'generic-event'],
  ];

  it.each(cases)('「%s」→ %s', (text, expected) => {
    expect(matchCategory(text).category.id).toBe(expected);
  });
});

describe('需求生成与假设', () => {
  const brief = createBrief('下个月给 400 名新生办一场校园迎新，预算 8000 元', { now: NOW });

  it('抽取用户给出的关键信息并标记来源', () => {
    expect(brief.categoryId).toBe('campus-welcome');
    expect(brief.people).toBe(400);
    expect(brief.budget).toBe(8000);
    expect(brief.sources.people).toBe('inferred');
    expect(brief.sources.budget).toBe('inferred');
    expect(brief.date).toBe('2026-12-01');
  });

  it('缺失字段按假设补全并记录原因', () => {
    expect(brief.sources.duration).toBe('assumed');
    expect(brief.durationMinutes).toBeGreaterThan(0);
    const fields = brief.assumptions.map((item) => item.field);
    expect(fields).toContain('duration');
    expect(fields).not.toContain('people');
    expect(brief.assumptions.every((item) => item.reason.length > 4)).toBe(true);
  });

  it('每轮最多问三个问题，且不重复已确认字段', () => {
    const questions = nextQuestions(brief);
    expect(questions.length).toBeLessThanOrEqual(3);
    const fields = questions.map((item) => item.field);
    expect(fields).not.toContain('people');
    expect(fields).not.toContain('budget');
  });

  it('回答后写入需求并清除对应假设', () => {
    const questions = nextQuestions(brief);
    const duration = questions.find((item) => item.field === 'duration')!;
    const answered = applyAnswer(brief, duration, '480');
    expect(answered.durationMinutes).toBe(480);
    expect(answered.sources.duration).toBe('user');
    expect(answered.assumptions.some((item) => item.field === 'duration')).toBe(false);
  });

  it('手动改类型会同步族与默认场地', () => {
    const changed = updateField(brief, 'category', 'sports-marathon');
    expect(changed.family).toBe('sports');
    expect(changed.venue).toBe('outdoor');
  });
});
