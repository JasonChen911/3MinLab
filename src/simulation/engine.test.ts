import { describe, it, expect } from 'vitest';
import { createBrief } from '../rules/intake';
import { generatePlan } from '../rules/generator';
import { createWorkspace } from '../workbench/model';
import { Random } from './random';
import { defaults } from './model';
import { addIncident, buildSnapshot, createSimulation, intervene, runToEnd, step, validateParameters } from './engine';

function fixture() {
 const plan=generatePlan(createBrief('100人学术讲座，预算10000元，持续2小时'));
 const workspace=createWorkspace(plan);const snapshot=buildSnapshot(plan,workspace);
 snapshot.tasks=[{id:'a',name:'演讲',duration:15,start:0,staff:2,equipment:true,venue:'厅',dependencies:[]},{id:'b',name:'颁奖',duration:5,start:15,staff:2,equipment:false,venue:'厅',dependencies:['a']}];snapshot.duration=20;snapshot.people=20;
 const parameters={...defaults,staff:10,checkinStaff:2,absence:0,attendance:1,late:0,arrivalSpread:5,durationCV:0,equipmentRate:0,weatherRate:0,trafficRate:0,supplyRate:0,priceRate:0};
 return {plan,workspace,snapshot,parameters};
}
describe('概率驱动活动仿真',()=>{
 it('概率分布具有合理经验矩，并且种子可以复现',()=>{const r=new Random(42),samples=Array.from({length:20000},()=>r.poisson(3));expect(samples.reduce((a,b)=>a+b,0)/samples.length).toBeCloseTo(3,1);const l=Array.from({length:20000},()=>r.lognormal(20,.3));expect(l.every(n=>n>0)).toBe(true);expect(l.reduce((a,b)=>a+b,0)/l.length).toBeCloseTo(20,0);expect(new Random(0).uniform()).toBe(new Random(0).uniform());});
 it('同快照、参数、种子得到同一过程；分批推进不改变结果',()=>{const {snapshot,parameters}=fixture();const a=runToEnd(snapshot,parameters),b=runToEnd(snapshot,parameters);expect(a).toEqual(b);let c=createSimulation(snapshot,parameters);while(c.status!=='finished')c=step(c);expect(c).toEqual(a);});
 it('零风险强度和零缺席允许全程没有突发事件；依赖任务必须等前序结束',()=>{const {snapshot,parameters}=fixture();const result=runToEnd(snapshot,parameters);expect(result.incidents).toHaveLength(0);expect(result.timeout).toBe(false);expect(result.tasks[1].actualStart).toBeGreaterThanOrEqual(result.tasks[0].actualEnd!);expect(result.served).toBe(result.attendanceTotal);});
 it('故障会真实暂停设备相关任务，启用备件恢复并增加费用，原状态不变',()=>{const {snapshot,parameters}=fixture();let s=createSimulation(snapshot,parameters);s=step(s,10);const task=s.tasks.find(t=>t.status==='进行中')!;expect(task).toBeTruthy();addIncident(s,'equipment',new Random(5));const paused=step(s);expect(paused.tasks[0].remaining).toBe(task.remaining);expect(paused.equipmentDown).toBe(true);const restored=intervene(paused,'spare');expect(restored.equipmentDown).toBe(false);expect(step(restored).tasks[0].remaining).toBeLessThan(task.remaining);expect(restored.extraSpend).toBe(paused.extraSpend+100);expect(paused.usedSpare).toBe(0);expect(()=>intervene(restored,'spare')).toThrow();});
 it('签到瓶颈增加队列，后备人员调用有限且不改正式快照',()=>{const {snapshot,parameters}=fixture();parameters.checkinStaff=1;parameters.serviceRate=.1;const slow=step(createSimulation(snapshot,parameters),20);expect(slow.queue).toBeGreaterThan(0);const improved=intervene(slow,'reserve');expect(improved.availableStaff).toBe(slow.availableStaff+2);expect(()=>intervene(improved,'reserve')).toThrow();expect(improved.snapshot).toEqual(slow.snapshot);expect(snapshot).toEqual(slow.snapshot);});
 it('室内场景不触发天气，模型不会强制发生事件',()=>{const {snapshot,parameters}=fixture();snapshot.outdoor=false;parameters.weatherRate=10;expect(runToEnd(snapshot,parameters).incidents.some(e=>e.kind==='weather')).toBe(false);});
 it('输入方案和工作区完全隔离；缺少流程不允许静默编造',()=>{const {plan,workspace,snapshot,parameters}=fixture();const before=JSON.stringify([plan,workspace,snapshot,parameters]);runToEnd(snapshot,parameters);expect(JSON.stringify([plan,workspace,snapshot,parameters])).toBe(before);expect(()=>createSimulation({...snapshot,tasks:[]},parameters)).toThrow();expect(validateParameters({...parameters,staff:-1})).not.toHaveLength(0);});
 it('备用场地只改变运行环境，保留只读快照；JSON导出可恢复随机过程',()=>{const {snapshot,parameters}=fixture();snapshot.outdoor=true;let state=step(createSimulation(snapshot,parameters),10);addIncident(state,'weather',new Random(4));state=step(state);const sheltered=intervene(state,'shelter');expect(sheltered.snapshot).toEqual(state.snapshot);expect(sheltered.sheltered).toBe(true);expect(step(JSON.parse(JSON.stringify(sheltered)),20)).toEqual(step(sheltered,20));});
 it('容量不足形成等待但不会超额入场；时间上限显式结束',()=>{const {snapshot,parameters}=fixture();parameters.capacity=1;const s=step(createSimulation(snapshot,parameters),20);expect(s.served-s.departed).toBeLessThanOrEqual(1);expect(s.queue).toBeGreaterThan(0);snapshot.tasks[0].staff=100;const end=runToEnd(snapshot,parameters);expect(end.timeout).toBe(true);expect(end.tasks.some(t=>t.status!=='已完成')).toBe(true);});
});
