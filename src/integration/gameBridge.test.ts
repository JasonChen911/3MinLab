import {expect,it} from 'vitest';
import {createBrief} from '../rules/intake';
import {generatePlan} from '../rules/generator';
import {createProject} from '../projects/repository';
import {bridgeTemplates,toBridgePlan} from './gameBridge';

it('全部预设从策划器单一注册表导出',()=>{const templates=bridgeTemplates();expect(templates.length).toBe(59);expect(new Set(templates.map(item=>item.id)).size).toBe(59);expect(templates.every(item=>item.workflow.length>0)).toBe(true);});
it('旧活动无工作台资料时使用策划方案流程，不修改原方案',()=>{const brief=createBrief('校园科技文化节，800人，预算20000元'),plan=generatePlan(brief),project={...createProject(plan.id,brief),plan};const before=JSON.stringify(project),bridge=toBridgePlan(project);expect(bridge.activityId).toBe(plan.id);expect(bridge.workflow.length).toBeGreaterThan(0);expect(bridge.people).toBe(brief.people);expect(bridge.budget).toBe(brief.budget);expect(JSON.stringify(project)).toBe(before);});
