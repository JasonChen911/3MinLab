import {describe,it,expect} from 'vitest';
import {freshLayout,CATALOG,cost,issues,start,step,intervene,importBackup,placement,itemCost,reconcile,evaluate,batchMove,batchRotate,alignItems,bounds,rotateItem} from './game';
import {route} from './path';
describe('独立搭建与原概率引擎联动',()=>{
 it('设施增删改变成本，重叠和越界可检出',()=>{const l=freshLayout('performance');const before=cost(l.items);l.items.push({id:'new',kind:'speaker',x:100,z:0,rotation:0});expect(cost(l.items)).toBe(before+CATALOG.speaker.cost);expect(issues(l).some(x=>x.includes('边界'))).toBe(true);l.items.pop();expect(cost(l.items)).toBe(before);});
 it('同一输入和种子可复现，人员与队列真实推进',()=>{const l=freshLayout('conference');const a=step(start(l),60),b=step(start(l),60);expect(a.arrived).toBeGreaterThan(0);expect(a).toEqual(b);expect(a.served).toBeGreaterThan(0);});
 it('设施影响通行量和预算，干预影响人员',()=>{const l=freshLayout('community');const a=start(l);l.items=l.items.filter(i=>i.kind!=='checkin');const b=start(l);expect(a.parameters.serviceRate).toBeGreaterThan(b.parameters.serviceRate);expect(intervene(a,'reserve').availableStaff).toBe(a.availableStaff+2);});
 it('寻路绕开实体设施',()=>{const items=[{id:'wall',kind:'fence' as const,x:0,z:0,rotation:0}];const path=route(items,20,{x:-4,z:0},{x:4,z:0});expect(path.length).toBeGreaterThan(0);expect(path.some(p=>p.x===0&&p.z===0)).toBe(false);});
 it('可吸附到设施外侧的可通行点而不是要求走进设施中心',()=>{const items=[{id:'desk',kind:'checkin' as const,x:0,z:0,rotation:0}];expect(route(items,20,{x:0,z:-6},{x:0,z:0})).toEqual([]);const path=route(items,20,{x:0,z:-6},{x:0,z:0},{snap:true});expect(path.length).toBeGreaterThan(0);expect(path[path.length-1]).not.toEqual({x:0,z:0});});
 it('从原项目完整备份读取真实流程时间和人员，不修改来源',()=>{const backup={format:'activity-project-backup',version:1,project:{id:'original',plan:{title:'校园讲座',brief:{people:140,budget:30000,durationMinutes:120,date:'2026-11-08'}},workspace:{scene:'conference',people:[{},{}],flow:[{id:'f1',title:'签到',start:'09:00',end:'09:20',people:['志愿者甲'],equipment:'',venue:'大厅'},{id:'f2',title:'演讲',start:'09:30',end:'10:40',people:['讲师','主持人'],equipment:'投影仪',venue:'报告厅'}]}}};const before=JSON.stringify(backup),layout=importBackup(backup);expect(layout.activity.sourceId).toBe('original');expect(layout.activity.tasks.map(t=>[t.start,t.duration,t.staff,t.equipment])).toEqual([[0,20,1,false],[30,70,2,true]]);expect(JSON.stringify(backup)).toBe(before);});
 it('放置预览阻止重叠、越界和超预算，尺寸改变费用',()=>{const l=freshLayout('performance');const stage=l.items.find(i=>i.kind==='stageLarge')!;expect(placement(l,{id:'new',kind:'stageLarge',x:stage.x,z:stage.z,rotation:0}).level).toBe('invalid');expect(placement(l,{id:'new',kind:'tree',x:100,z:0,rotation:0}).reason).toContain('边界');l.activity.budget=cost(l.items)+10;const unlimited=placement(l,{id:'new',kind:'stageSmall',x:12,z:12,rotation:0});expect(unlimited.level).toBe('warning');expect(unlimited.reason).toContain('超预算');expect(placement(l,{id:'new',kind:'stageSmall',x:12,z:12,rotation:0},'challenge').level).toBe('invalid');expect(itemCost({id:'s',kind:'tent',x:0,z:0,rotation:0,scale:2})).toBe(CATALOG.tent.cost*4);});
 it('编辑场地后继续模拟，保留进度并更新容量与通行能力',()=>{const l=freshLayout('conference');const before=step(start(l),15);l.items.push({id:'new-checkin',kind:'checkinLarge',x:12,z:12,rotation:0});const after=reconcile(before,l);expect(after.minute).toBe(before.minute);expect(after.rng).toBe(before.rng);expect(after.served).toBe(before.served);expect(after.parameters.serviceRate).toBeGreaterThan(before.parameters.serviceRate);});
 it('现场评分由预算、场地问题和模拟结果计算',()=>{const l=freshLayout('conference'),baseline=evaluate(l,null);l.activity.budget=0;expect(evaluate(l,null).score).toBeLessThan(baseline.score);const sim=step(start(freshLayout('conference')),60);expect(evaluate(freshLayout('conference'),sim).service).toBeGreaterThan(0);});
 it('志愿者计入现场人力，弯道属于道路设施',()=>{const l=freshLayout('performance');const base=start(l);l.volunteers=(l.volunteers??0)+5;const boosted=start(l);expect(boosted.parameters.staff).toBe(base.parameters.staff+5);expect(boosted.snapshot.roles.some(r=>r.name==='志愿者'&&r.count>=5)).toBe(true);expect(CATALOG.roadCurve.group).toBe('道路');expect(CATALOG.roadCurve.solid).toBe(false);});
});

describe('V4.1 批量选择与编辑',()=>{
 const make=()=>{const l=freshLayout('performance');l.items=[
  {id:'a',kind:'tree' as const,x:-12,z:0,rotation:0,height:1,scale:1},
  {id:'b',kind:'tree' as const,x:-8,z:0,rotation:0,height:1,scale:1},
  {id:'c',kind:'tent' as const,x:8,z:0,rotation:0,height:1,scale:1},
 ];return l;};
 it('批量移动同时更新所选设施，越界时整批拒绝',()=>{const l=make();const moved=batchMove(l,['a','b'],2,1);expect(moved.ok).toBe(true);expect(moved.changed).toBe(2);expect(moved.items.find(i=>i.id==='a')).toMatchObject({x:-10,z:1});expect(moved.items.find(i=>i.id==='c')).toMatchObject({x:8,z:0});const rejected=batchMove(l,['a'],100,0);expect(rejected.ok).toBe(false);expect(rejected.items).toBe(l.items);expect(rejected.reason).toContain('边界');});
 it('锁定设施被跳过，批量旋转与对齐保持放置合法',()=>{const l=make();l.items=l.items.map(i=>i.id==='b'?{...i,locked:true}:i);const moved=batchMove(l,['a','b'],1,0);expect(moved.changed).toBe(1);expect(moved.items.find(i=>i.id==='b')!.x).toBe(-8);const rotated=batchRotate(l,['c'],1);expect(rotated.ok).toBe(true);expect(rotated.items.find(i=>i.id==='c')!.rotation).toBe(90);const aligned=alignItems(l,['a','c'],'z');expect(aligned.ok).toBe(true);expect(aligned.items.find(i=>i.id==='c')!.z).toBe(aligned.items.find(i=>i.id==='a')!.z);});
 it('批量旋转可叠加并保留角度，空选择返回失败原因',()=>{const l=make();const first=batchRotate(l,['c'],1);const second=batchRotate({...l,items:first.items},['c'],1);expect(second.items.find(i=>i.id==='c')!.rotation).toBe(180);const empty=batchMove(l,[],1,0);expect(empty.ok).toBe(false);expect(empty.reason).toContain('没有');});
});

describe('设施原地自由旋转',()=>{
 it('斜角旋转按实际外接范围计算占地',()=>{
  const item={id:'stage',kind:'stage' as const,x:0,z:0,rotation:45};
  expect(bounds(item).w).toBeCloseTo(Math.SQRT1_2*10);
  expect(bounds(item).d).toBeCloseTo(Math.SQRT1_2*10);
 });
 it('松手时保存角度和原坐标，越界或锁定时拒绝',()=>{
  const layout=freshLayout('performance');
  layout.items=[{id:'stage',kind:'stage' as const,x:0,z:0,rotation:0}];
  const rotated=rotateItem(layout,'stage',35);
  expect(rotated.ok).toBe(true);
  expect(rotated.items[0]).toMatchObject({x:0,z:0,rotation:35});
  layout.items[0]={...layout.items[0],x:layout.size/2-3};
  expect(rotateItem(layout,'stage',45).ok).toBe(false);
  layout.items[0]={...layout.items[0],x:0,locked:true};
  expect(rotateItem(layout,'stage',35).ok).toBe(false);
 });
});
