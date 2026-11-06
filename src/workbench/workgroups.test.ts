import {describe,it,expect} from 'vitest';
import {createBrief} from '../rules/intake';
import {generatePlan} from '../rules/generator';
import {createWorkspace} from './model';
import {createGroupTask,createWorkGroup,groupDocument,groupIssues,recommendedGroupNames} from './workgroups';
import {buildCharterMarkdown} from './charter';
const plan=generatePlan(createBrief('1000人校园音乐节'));
describe('V3 工作组与正式章程',()=>{
 it('推荐与规模和活动类型相关，任务书包含本组信息',()=>{expect(recommendedGroupNames(plan).length).toBeGreaterThan(4);const data=createWorkspace(plan),group=createWorkGroup('设备组'),task=createGroupTask();task.title='音响测试';task.owner='张三';task.due='2026-11-08';group.tasks=[task];group.leader='李四';data.workGroups=[group];const doc=groupDocument(plan,data,group);expect(doc.text).toContain('音响测试');expect(doc.text).toContain('李四');expect(doc.text).toContain('张三');expect(doc.category).toBe('任务分工文件');});
 it('检查无人负责、截止时间和前置依赖',()=>{const group=createWorkGroup('场地组'),task=createGroupTask();task.title='舞台搭建';task.start='2026-11-10';task.due='2026-11-08';task.dependsOn='missing';group.tasks=[task];expect(groupIssues(group,[group]).length).toBe(3);});
 it('章程包含工作组而不输出已跳过的空章节',()=>{const data=createWorkspace(plan),group=createWorkGroup('宣传组');group.goal='公布活动信息';data.workGroups=[group];const text=buildCharterMarkdown({...plan,moduleStates:{...plan.moduleStates,promotion:{status:'not-needed',updatedAt:'2026-11-06'}}},data);expect(text).toContain('工作组职责摘要');expect(text).toContain('宣传组');expect(text).not.toContain('**');});
});
