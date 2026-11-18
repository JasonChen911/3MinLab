import {expect,it} from 'vitest';
import {layoutFromPlan,layoutFromTemplate} from './integration';
import {analyzeLayout,optimizeLayout} from './analysis';
import {start} from './game';
import type {BridgePlan,BridgeTemplate} from '../../src/integration/gameBridge';
const plan:BridgePlan={schema:1,activityId:'campus-1',templateId:'custom',name:'校园科技文化节',category:'campus',people:800,budget:20000,duration:300,date:'',venue:'校园广场',staff:30,volunteers:20,workGroups:[{name:'宣传组',leader:'',tasks:['海报']},{name:'设备组',leader:'',tasks:['设备检查']}],workflow:['入场','开幕','展览','互动','闭幕'].map((title,i)=>({id:`f${i}`,title,start:`0${8+i}:00`,end:`0${8+i}:30`,owner:'',equipment:'',venue:''})),budgetItems:[{name:'场地',amount:3000}],updatedAt:'v2'};
it('自定义活动完整导入，保留原预算与活动 ID，游戏场景独立',()=>{const original=JSON.stringify(plan),layout=layoutFromPlan(plan);expect(layout.activity.sourceId).toBe('campus-1');expect(layout.activity.id).not.toBe('campus-1');expect(layout.activity.people).toBe(800);expect(layout.activity.budget).toBe(20000);expect(layout.params.staff).toBe(30);expect(layout.volunteers).toBe(20);expect(layout.bridgeGroups).toEqual(['宣传组','设备组']);expect(layout.bridgeGroupTasks?.[0].tasks).toEqual(['海报']);expect(layout.activity.tasks.map(t=>t.name)).toEqual(['入场','开幕','展览','互动','闭幕']);expect(layout.bridgeVersion).toBe('v2');expect(JSON.stringify(plan)).toBe(original);});
it('不同预设生成适配场地和设施',()=>{for(const [name,venue] of [['音乐节与文艺演出','festival'],['田径运动会','stadium'],['桌游局','restaurant'],['露营','lawn']]){const template:BridgeTemplate={id:name,name,category:'custom',description:'',people:100,budget:10000,duration:180,venue:'',workflow:['签到','活动','结束'],roles:[],facilities:[]};const layout=layoutFromTemplate(template);expect(layout.venueId).toBe(venue);expect(layout.items.length).toBeGreaterThan(0);expect(layout.activity.tasks.length).toBe(3);}
});
it('餐厅桥接保留室内属性、人员编制，建造和现实仿真均按预算约束',()=>{const layout=layoutFromPlan({...plan,name:'部门聚会',people:12,budget:300,venue:'校内餐厅',venueKind:'indoor-small',staff:4,volunteers:1});expect(layout.venueId).toBe('restaurant');expect(layout.indoor).toBe(true);expect(layout.params.staff).toBe(4);expect(layout.volunteers).toBe(1);expect(layout.budgetMode).toBe('challenge');expect(layout.simulationFinance?.budgetMode).toBe('limited');expect(layout.simulationFinance?.budget).toBe(300);});
it('500 人户外音乐节推荐容量足够的演出场地',()=>{const layout=layoutFromPlan({...plan,name:'校园音乐节',people:500,budget:20000,venue:'',venueKind:'outdoor'});expect(layout.venueId).toBe('festival');expect(layout.venueVariant).toBe('medium');expect(layout.activity.people).toBe(500);});
it('指定草坪时按真实容量选择尺寸',()=>{const layout=layoutFromPlan({...plan,name:'校园文化节',people:500,venue:'校园草坪'});expect(layout.venueId).toBe('lawn');expect(layout.venueVariant).toBe('large');});
it('800 人马拉松导入推荐草坪后有效容量覆盖报名规模',()=>{
  const layout=layoutFromPlan({...plan,name:'800人校园马拉松',people:800,category:'sports',venue:'',venueKind:'outdoor',staff:59,volunteers:30});
  expect(layout.venueId).toBe('lawn');
  expect(layout.volunteers).toBe(30);
  expect(start(layout).parameters.capacity).toBeGreaterThanOrEqual(730);
});
it('优化预览为座位不足的大型活动补齐观众席',()=>{
  const layout=layoutFromPlan({...plan,name:'800人校园马拉松',people:800,category:'sports',venue:'',venueKind:'outdoor',staff:59,volunteers:30});
  const preview=optimizeLayout(layout);
  expect(preview.changes.some(change=>change.label.includes('观众席'))).toBe(true);
  expect(preview.after.facility.seating).toBeGreaterThanOrEqual(layout.activity.people*.55);
});
it('旧场景容量不足时给出换场地建议',()=>{const layout=layoutFromPlan({...plan,name:'校园文化节',people:500,venue:'校园草坪'});const old={...layout,venueVariant:'medium' as const,size:46};const finding=analyzeLayout(old).findings.find(item=>item.title.includes('场地容量'));expect(finding?.fix).toContain('大型场地');});

