import {describe,it,expect} from 'vitest';
import {renderToString} from 'react-dom/server';
import {createBrief} from '../rules/intake';
import {generatePlan} from '../rules/generator';
import {createWorkspace} from './model';
import PlanningFlow from './PlanningFlow';
const plan=generatePlan(createBrief('校园讲座，80人'));
describe('V3 向导工作台',()=>{it('流程导航稳定，初始只显示当前阶段的三种处理方式',()=>{const html=renderToString(<PlanningFlow plan={plan} data={createWorkspace(plan)} onChange={async()=>true} onStageStatus={()=>{}} onAiConfirm={()=>{}} onSelectModule={()=>{}} onCheckpoint={async()=>{}} onOpen={()=>{}} renderEditor={()=>'编辑器内容'}/>);expect(html).toContain('策划流程');expect(html).toContain('自行填写');expect(html).toContain('AI 智能分析并自动填入');expect(html).toContain('不需要');expect(html).not.toContain('编辑器内容');expect(html).toContain('最终检查与导出');});});
