import { describe, expect, it } from 'vitest';
import { createBrief, createBriefFromPreset } from '../rules/intake';
import { generatePlan } from '../rules/generator';
import { buildPlanMarkdown } from '../rules/export';
import { searchPresets } from '../components/PresetGallery';
import { briefFromActivityDraft, type ActivityDraft } from '../services/activityDraft';
import { coreModules, planningProgress, recommendPlanningMode, setModuleStatus } from './mode';

describe('大小活动与状态兼容',()=>{
 it('小型模板进入轻量策划；切换模式仍保留全部原始模块内容',()=>{const brief=createBriefFromPreset('preset-boardgame');const plan=generatePlan(brief);expect(recommendPlanningMode(brief)).toBe('light');expect(plan.planningMode).toBe('light');expect(plan.modules).toHaveLength(12);expect(coreModules(plan)).toContain('risk');expect(coreModules(plan)).not.toContain('promotion');const full={...plan,planningMode:'full' as const};expect(coreModules(full)).toHaveLength(12);expect(full.modules).toEqual(plan.modules);});
 it('低人数的赛事仍推荐完整模式，搜索与规模筛选可组合',()=>{const brief=createBrief('30人的羽毛球比赛');expect(recommendPlanningMode(brief)).toBe('full');expect(searchPresets('桌游','small').some(p=>p.id==='preset-boardgame')).toBe(true);expect(searchPresets('桌游','large')).toHaveLength(0);});
 it('不需要和已有算完成，待定与 AI 建议不算完成，导出跳过不需要且保留存档数据',()=>{const plan=generatePlan(createBriefFromPreset('preset-boardgame'));const original=plan.modules;const first=setModuleStatus(plan,'basic','existing','场地已定');const second=setModuleStatus(first,'audience','not-needed');const third=setModuleStatus(second,'resources','pending');const fourth=setModuleStatus(third,'program','ai-suggested');expect(planningProgress(fourth).done).toBe(2);expect(buildPlanMarkdown(fourth)).not.toContain('## 3. 参与对象');expect(fourth.modules).toEqual(original);expect(fourth.moduleStates?.basic?.note).toBe('场地已定');});
 it('AI 初稿沿用用户明确数字，建议保留待确认来源',()=>{const draft:ActivityDraft={title:'周末桌游',categoryId:'social-party',planningMode:'light',people:50,budget:1000,durationMinutes:180,date:'',venue:'indoor-small',audience:'朋友',goal:'一起玩桌游',features:[],flow:['分组','游戏'],staff:['组织者'],materials:['桌游'],confirmedFields:['people'],questions:['场地是否已定？']};const brief=briefFromActivityDraft('我想和15个朋友办桌游局',draft);expect(brief.people).toBe(15);expect(brief.categoryId).toBe('social-party');expect(brief.aiDraft?.flow).toEqual(['分组','游戏']);expect(brief.sources.budget).toBe('assumed');});
});
