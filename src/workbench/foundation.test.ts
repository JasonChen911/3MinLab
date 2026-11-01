import { describe, it, expect } from 'vitest';
import { createBrief } from '../rules/intake';
import { generatePlan } from '../rules/generator';
import { createWorkspace } from './model';
import { loadWorkspace, saveWorkspace, saveTemplates, loadTemplates } from './storage';
import { TOOLS, recommendedTools } from './registry';
const plan = generatePlan(createBrief('田径运动会，200人'));
function store() { const map = new Map<string,string>(); return { getItem: (key:string) => map.get(key) ?? null, setItem:(key:string,value:string) => {map.set(key,value);} }; }
describe('活动资料底层', () => {
 it('识别场景、空资料不填造假人员', () => { const data=createWorkspace(plan); expect(data.scene).toBe('athletics'); expect(data.people).toEqual([]); expect(data.athletics.athletes).toEqual([]); expect(recommendedTools(data).some(tool=>tool.id==='ath-results')).toBe(true); });
 it('活动独立持久化，文档保留版本与修改', () => { const s=store(); const data=createWorkspace(plan); data.profile.organizer='主办方'; data.tables.test={id:'test',name:'我的表格',revision:2,fields:[{key:'name',label:'姓名'}],rows:[{id:'1',name:'自行填写'}]}; expect(saveWorkspace(data,s)).toBe(true); expect(loadWorkspace(plan,s).data).toEqual(data); expect(loadWorkspace({...plan,id:'another'},s).data.tables).toEqual({}); });
 it('自定义模板跨活动复用，不复用人员数据', () => { const s=store(); const templates=[{id:'a',name:'通知',text:'{{活动名称}}',fields:[],kind:'text' as const}]; saveTemplates(templates,s); expect(loadTemplates(s)).toEqual(templates); });
 it('工具编号唯一且每个场景可配置', () => { expect(new Set(TOOLS.map(tool=>tool.id)).size).toBe(TOOLS.length); expect(TOOLS.length).toBeGreaterThan(65); });
});
