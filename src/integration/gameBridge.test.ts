import {expect,it} from 'vitest';
import {createBrief} from '../rules/intake';
import {generatePlan} from '../rules/generator';
import {createProject} from '../projects/repository';
import {bridgeTemplates,toBridgePlan} from './gameBridge';

it('全部预设从策划器单一注册表导出',()=>{const templates=bridgeTemplates();expect(templates.length).toBe(59);expect(new Set(templates.map(item=>item.id)).size).toBe(59);expect(templates.every(item=>item.workflow.length>0)).toBe(true);});
it('旧活动无工作台资料时使用策划方案流程，不修改原方案',()=>{const brief=createBrief('校园科技文化节，800人，预算20000元'),plan=generatePlan(brief),project={...createProject(plan.id,brief),plan};const before=JSON.stringify(project),bridge=toBridgePlan(project);expect(bridge.activityId).toBe(plan.id);expect(bridge.workflow.length).toBeGreaterThan(0);expect(bridge.people).toBe(brief.people);expect(bridge.budget).toBe(brief.budget);expect(JSON.stringify(project)).toBe(before);});
it('计划人员和预算明细在工作台名册为空时仍传入游戏',()=>{const brief=createBrief('12人的部门聚会，预算300元，在餐厅'),plan=generatePlan(brief),project={...createProject(plan.id,brief),plan};const bridge=toBridgePlan(project);const budget=plan.modules.find(module=>module.id==='budget')?.blocks.find(block=>block.kind==='budget');expect(bridge.staff).toBeGreaterThan(0);expect(bridge.budgetItems.length).toBeGreaterThan(0);expect(bridge.budgetItems.reduce((sum,row)=>sum+row.amount,0)).toBe(budget?.kind==='budget'?budget.rows.reduce((sum,row)=>sum+row.amount,0):0);expect(bridge.venueKind).toBe(brief.venue);});
