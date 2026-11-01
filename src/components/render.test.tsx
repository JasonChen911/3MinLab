import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import BriefPanel from './BriefPanel';
import PlanView from './PlanView';
import HistoryPanel from './HistoryPanel';
import PresetGallery from './PresetGallery';
import { createBrief, createBriefFromPreset, nextQuestions } from '../rules/intake';
import { generatePlan } from '../rules/generator';

const brief = createBrief('办一场 800 人的校园马拉松，预算 6 万，户外赛道，11月20日', {
  now: new Date('2026-11-01T10:00:00'),
});
const plan = generatePlan(brief);
const presetBrief = createBriefFromPreset('preset-welcome', { now: new Date('2026-11-01T10:00:00') });

const noop = () => {};

describe('界面渲染冒烟测试', () => {
  it('需求面板渲染字段、来源标记与问题', () => {
    const html = renderToString(<BriefPanel
      brief={brief}
      questions={nextQuestions(brief)}
      onChange={noop}
      onDaysChange={noop}
      onAnswer={noop}
      onGenerate={noop}
      onReset={noop}
      onClearPreset={noop}
    />);
    expect(html).toContain('先确认一下你的活动');
    expect(html).toContain('已识别');
    expect(html).toContain('假设');
    expect(html).toContain('生成活动方案');
    expect(html).toContain('校园马拉松');
  });

  it('套用预设后显示预设横幅与「预设」来源标记', () => {
    const html = renderToString(<BriefPanel
      brief={presetBrief}
      questions={nextQuestions(presetBrief)}
      onChange={noop}
      onDaysChange={noop}
      onAnswer={noop}
      onGenerate={noop}
      onReset={noop}
      onClearPreset={noop}
    />);
    expect(html).toContain('preset-applied');
    expect(html).toContain('新生迎新活动');
    expect(html).toContain('清除预设内容');
    expect(html).toContain('预设');
  });

  it('类型未识别时展示类型询问而不是直接归类', () => {
    const unknown = createBrief('随便搞点有意思的事情', { now: new Date('2026-11-01T10:00:00') });
    const html = renderToString(<BriefPanel
      brief={unknown}
      questions={nextQuestions(unknown)}
      onChange={noop}
      onDaysChange={noop}
      onAnswer={noop}
      onGenerate={noop}
      onReset={noop}
      onClearPreset={noop}
    />);
    expect(html).toContain('还没能判断出活动类型');
    expect(html).toContain('继续用通用框架');
    expect(html).toMatch(/disabled="">请先确认活动类型/);
  });

  it('首页预设区渲染 10 个分类入口与预设卡片', () => {
    const html = renderToString(<PresetGallery onPreset={noop} onCategory={noop} onCustom={noop}/>);
    expect(html).toContain('按类型找起点');
    expect(html).toContain('校园教育类');
    expect(html).toContain('自定义活动类');
    expect(html).toContain('新生迎新活动');
    expect(html).toContain('用这个预设');
    expect(html.match(/<article class="preset-card/g)?.length).toBe(12);
    expect(html).toContain('企业年会与颁奖典礼');
  });

  it('方案工作台渲染 12 个模块与关键表格', () => {
    const html = renderToString(<PlanView
      plan={plan}
      active="basic"
      onActive={noop}
      isFavorite={false}
      onFavorite={noop}
      onCopy={noop}
      onPrint={noop}
      onCopyPromo={noop}
      onDownload={noop}
      onAdjust={noop}
    />);
    expect(html).toContain('活动基本信息');
    expect(html).toContain('经费预算');
    expect(html).toContain('风险管理');
    expect(html).toContain('block-table');
    expect(html).toContain('重点');
    expect(html.match(/plan-module/g)?.length).toBe(12);
  });

  it('记录面板在空状态与有数据时都能渲染', () => {
    const empty = renderToString(<HistoryPanel history={[]} favorites={[]} onOpen={noop} onDelete={noop} onClose={noop}/>);
    expect(empty).toContain('还没有方案记录');
    const filled = renderToString(<HistoryPanel history={[plan]} favorites={[plan]} onOpen={noop} onDelete={noop} onClose={noop}/>);
    expect(filled).toContain(plan.title);
    expect(filled).toContain('已收藏');
  });

  it('传入行编辑回调后表格显示编辑入口', () => {
    const html = renderToString(<PlanView
      plan={plan}
      active="execution"
      onActive={noop}
      isFavorite={false}
      onFavorite={noop}
      onCopy={noop}
      onPrint={noop}
      onCopyPromo={noop}
      onDownload={noop}
      onAdjust={noop}
      onTableRows={noop}
    />);
    expect(html).toContain('逐行编辑整份方案');
    expect(html).toContain('逐行编辑本章');
    expect(html).toContain('执行安排');
  });
});
