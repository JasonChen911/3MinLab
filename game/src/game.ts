import {createSimulation,step,intervene,suggestedParameters,type Intervention} from './engine/engine';
import type {ChallengeConfig,MoneyTransaction,Parameters,SimulationState,Snapshot,Task,Scene,RiskKind,DirectorEventKind,DirectorMitigation} from './engine/model';
import {normalizeChallenge} from './challenge';
import {defaultWorld,normalizeWorld,type WorldConfig} from './world/worldgen';
import {makeVenueItems,venueCapacity,venueDefinition,venueForScene,venueVariant,type VenueSize} from './venues';
import {weatherProfile} from './world/weather';
import {analyzeFacilities} from './facilities';
import {difficultyProfile,type DifficultyBaseline,type DifficultyTier} from './difficulty';
export {step,intervene,createSimulation};export type {Parameters,SimulationState,Intervention,Scene};
export type Kind='stage'|'stageSmall'|'stageLarge'|'podium'|'backdrop'|'chair'|'bleachers'|'tent'|'tentSmall'|'speaker'|'light'|'screen'|'checkin'|'checkinSmall'|'checkinLarge'|'service'|'rest'|'fence'|'entrance'|'medical'|'toilet'|'bin'|'storage'|'road'|'roadCurve'|'path'|'tree'|'flower'|'bush'|'planter'|'lamp'|'sign'|'bench'|'fountain';
export type Item={id:string;kind:Kind;x:number;z:number;rotation:number;scale?:number;height?:number;locked?:boolean;anchored?:boolean;damaged?:boolean;parameters?:Partial<FacilityParameters>};
export type WeatherKind='sunny'|'cloudy'|'lightRain'|'heavyRain'|'breeze'|'gale';
export type WallMode='auto'|'translucent'|'full'|'hidden';
export type RoofMode='full'|'translucent'|'hidden';
export type ViewMode='normal'|'section'|'function';
export type BudgetMode='unlimited'|'challenge';
export type OperatingMode='game'|'simulation';
export type SimulationBudgetMode='unlimited'|'limited'|'off';
export interface FacilityParameters {
  purchasePrice:number; rentalPrice:number; useCost:number; maintenanceCost:number;
  transportCost:number; installationCost:number; quantity:number; hours:number;
  capacity:number; servicePerMinute:number; averageUseMinutes:number; staffNeed:number; radius:number;
  source:string; updatedAt:string; region:string; supplier:string;
  acquisition:'rent'|'buy';
}
export interface SimulationFinance {
  budgetMode:SimulationBudgetMode; budget:number; staffHourlyWage:number;
  staffHours:number; overtimeCost:number; mealCost:number; transportCost:number;
  venueRent:number; venueHours:number; cleaningCost:number; powerCost:number;
  deposit:number; otherCost:number; venueCapacityOverride:number;
  actionCosts:Record<DirectorMitigation,number>;
  incidentCosts:Record<RiskKind|DirectorEventKind,number>;
}
export type Role='participant'|'audience'|'performer'|'host'|'referee'|'staff'|'volunteer'|'security'|'medical'|'service'|'vendor';
export const ROLE_LABELS:Record<Role,string>={participant:'参与者',audience:'观众',performer:'演员/运动员',host:'主持人',referee:'裁判',staff:'工作人员',volunteer:'志愿者',security:'安保人员',medical:'医疗人员',service:'服务人员',vendor:'摊位工作人员'};
export type Facility={name:string;group:string;w:number;d:number;cost:number;color:number;solid:boolean;capacity?:number;description?:string};
export const CATALOG:Record<Kind,Facility>={
stage:{name:'中型舞台',group:'活动',w:6,d:4,cost:1600,color:0x9b7edb,solid:true,capacity:180,description:'适合中型演出'},stageSmall:{name:'小舞台',group:'活动',w:4,d:3,cost:800,color:0xb18ce4,solid:true,capacity:50,description:'小型表演与发言'},stageLarge:{name:'大型舞台',group:'活动',w:10,d:8,cost:4000,color:0x7d5fd0,solid:true,capacity:600,description:'大型演出主舞台'},podium:{name:'讲台',group:'活动',w:2,d:1,cost:250,color:0xc99b6b,solid:true},backdrop:{name:'背景板',group:'活动',w:5,d:1,cost:500,color:0x5f86c9,solid:true},chair:{name:'桌椅',group:'观众',w:2,d:2,cost:120,color:0xe0c08d,solid:true,capacity:8},bleachers:{name:'观众席',group:'观众',w:5,d:3,cost:1000,color:0x6fa58e,solid:true,capacity:80},tent:{name:'大型帐篷',group:'观众',w:4,d:4,cost:750,color:0xffd166,solid:true,capacity:25},tentSmall:{name:'小帐篷',group:'观众',w:2,d:2,cost:220,color:0xffdf85,solid:true,capacity:8},speaker:{name:'音响',group:'设备',w:1,d:1,cost:400,color:0x4b5d7a,solid:true},light:{name:'灯光',group:'设备',w:1,d:1,cost:320,color:0xffd84d,solid:true},screen:{name:'显示屏',group:'设备',w:3,d:1,cost:700,color:0x4f7fb5,solid:true},checkin:{name:'签到台',group:'管理',w:3,d:2,cost:260,color:0x64b8b0,solid:true,capacity:2},checkinSmall:{name:'小签到台',group:'管理',w:2,d:1,cost:150,color:0x7ccac2,solid:true,capacity:1},checkinLarge:{name:'大签到台',group:'管理',w:4,d:2,cost:500,color:0x4aa39b,solid:true,capacity:4},service:{name:'服务台',group:'管理',w:3,d:2,cost:220,color:0x66c08a,solid:true},rest:{name:'工作人员休息区',group:'管理',w:3,d:3,cost:380,color:0xa7c99b,solid:true},fence:{name:'围栏',group:'安全',w:3,d:1,cost:90,color:0xc9c6b0,solid:true},entrance:{name:'出入口',group:'安全',w:3,d:1,cost:180,color:0x76cfa3,solid:false,capacity:2},medical:{name:'医疗点',group:'安全',w:3,d:3,cost:460,color:0xff8f8f,solid:true},toilet:{name:'厕所',group:'其他',w:3,d:3,cost:500,color:0xb59bd6,solid:true},bin:{name:'垃圾桶',group:'其他',w:1,d:1,cost:50,color:0x6fc28e,solid:false},storage:{name:'储物区',group:'其他',w:3,d:3,cost:300,color:0xd0b08a,solid:true},road:{name:'主干道',group:'道路',w:4,d:2,cost:45,color:0x8d939b,solid:false,capacity:4,description:'增加主要通行空间'},roadCurve:{name:'90° 弯道',group:'道路',w:4,d:4,cost:55,color:0x8d939b,solid:false,capacity:4,description:'连接横纵主干道的转弯路段'},path:{name:'人行小路',group:'道路',w:2,d:2,cost:18,color:0xd9c8a5,solid:false,capacity:2},tree:{name:'小树',group:'绿植',w:2,d:2,cost:85,color:0x5fb86c,solid:true},flower:{name:'花坛',group:'绿植',w:2,d:2,cost:65,color:0xff7f9c,solid:true},bush:{name:'灌木',group:'绿植',w:1,d:1,cost:30,color:0x6cc45e,solid:true},planter:{name:'盆栽',group:'绿植',w:1,d:1,cost:38,color:0x83c46a,solid:true},lamp:{name:'路灯',group:'装饰',w:1,d:1,cost:120,color:0xffd95c,solid:true},sign:{name:'指示牌',group:'装饰',w:1,d:1,cost:45,color:0x7ec9a8,solid:true},bench:{name:'长椅',group:'装饰',w:2,d:1,cost:80,color:0xc98f5e,solid:true,description:'公园与步道休息点'},fountain:{name:'喷泉',group:'装饰',w:4,d:4,cost:900,color:0x66b8e6,solid:true,description:'广场景观中心'}};
// Keep the existing models and materials; give facility categories clearer color cues.
const FACILITY_ACCENTS:Partial<Record<Kind,number>>={bleachers:0x4d8fce,service:0x35b8c5,rest:0xe4a251,storage:0xa98ace,sign:0xf2c04c,medical:0xe97881,toilet:0x9d7fd8};
for(const [kind,color] of Object.entries(FACILITY_ACCENTS) as [Kind,number][])CATALOG[kind].color=color;
export type Activity={id:string;title:string;scene:Scene;people:number;budget:number;duration:number;date:string;tasks:Task[];source:'自定义'|'3MinLab 备份';sourceId?:string};
export interface PersonSave{id:string;serial?:number;role:Role;state:string;x:number;y?:number;z:number;rotation?:number;seatId:string|null;goal:{x:number;z:number};goalLabel:string;path:{x:number;z:number}[];timer?:number;waiting?:number;speed?:number;task?:string;organization?:string;seed?:number;personality?:{curiosity:number;patience:number;stamina:number;social:number;adventure:number;mobility:number};needs?:{rest:number;water:number;view:number;social:number;exit:number};mood?:number;needRng?:number;needTimer?:number;intent?:string;queueWait?:number}
export type Layout={bridgeVersion?:string;bridgeGroups?:string[];bridgeBudgetItems?:{name:string;amount:number}[];bridgeVenue?:string;activity:Activity;size:number;items:Item[];buildLedger?:MoneyTransaction[];params:Parameters;volunteers?:number;terrain?:'grass'|'plaza'|'track';world?:WorldConfig;venueId?:string;venueVariant?:VenueSize;indoor?:boolean;weather?:WeatherKind;weatherAuto?:boolean;wallMode?:WallMode;roofMode?:RoofMode;viewMode?:ViewMode;budgetMode?:BudgetMode;operatingMode?:OperatingMode;simulationFinance?:SimulationFinance;roles?:Partial<Record<Role,number>>;challenge?:ChallengeConfig;difficulty?:DifficultyTier;difficultyBase?:DifficultyBaseline;run?:SimulationState;gameRun?:SimulationState;simulationRun?:SimulationState;people?:PersonSave[];savedAt?:number;history:SimulationState[]};
const id=()=>crypto.randomUUID();
const OUTDOOR_ONLY:Kind[]=['tent','tentSmall','tree','flower','bush','planter','fountain'];
const INDOOR_ONLY:Kind[]=['screen','backdrop'];
export function roleCounts(layout:Layout):Record<Role,number>{
 const scene=layout.activity.scene, people=Math.max(0,layout.activity.people);
 const outdoor=!layout.indoor;
 const service=layout.items.filter(i=>['service','checkin','checkinSmall','checkinLarge'].includes(i.kind)).length;
 const tents=layout.items.filter(i=>['tent','tentSmall'].includes(i.kind)).length;
 const base:Record<Role,number>={
  participant:['performance','conference','business','sports'].includes(scene)?0:people,
  audience:['performance','conference','business','sports'].includes(scene)?people:0,
  performer:scene==='performance'?4:scene==='athletics'?8:scene==='competition'?3:scene==='community'?2:0,
  host:['performance','conference','business','competition','community'].includes(scene)?1:0,
  referee:['athletics','sports','competition'].includes(scene)?2:0,
  staff:Math.max(1,Math.round(layout.params.staff)),
  volunteer:Math.max(0,Math.round(layout.volunteers??0)),
  security:outdoor&&['performance','community'].includes(scene)||layout.size>=70?2:1,
  medical:1,
  service:Math.max(1,Math.min(4,service)),
  vendor:Math.min(6,tents),
 };
 return {...base,...(layout.roles??{})};
}
export function defaultActivity(scene:Scene='custom'):Activity {const names:Record<string,string>={athletics:'田径运动会',performance:'音乐节',conference:'学术讲座',community:'校园迎新',custom:'自定义活动'};const raw=scene==='athletics'?['检录','比赛','成绩登记']:scene==='performance'?['观众入场','开场演出','转场','压轴演出']:scene==='conference'?['签到','主题讲座','交流']:['签到','开场','互动体验','结束'];return {id:id(),title:names[scene]||'自定义活动',scene,people:100,budget:10000,duration:120,date:'',source:'自定义',tasks:raw.map((name,i)=>({id:`task-${i}`,name,start:i*30,duration:30,staff:2,equipment:/演出|讲座|开场/.test(name),supplies:scene==='community',venue:'主区域',dependencies:i?[`task-${i-1}`]:[]}))};}
export function defaultItems(scene:Scene):Item[]{return makeVenueItems(venueForScene(scene),'medium');}
export function itemCost(item:Item){return Math.round(CATALOG[item.kind].cost*Math.pow(item.scale??1,2));}
export function canEdit(item:Item|undefined|null){return !!item&&!item.locked;}
export function itemHeight(item:Item){return Math.max(.6,Math.min(2.2,item.height??1));}
export function cost(items:Item[]){return items.reduce((n,i)=>n+itemCost(i),0);}
export const defaultSimulationFinance:SimulationFinance={budgetMode:'unlimited',budget:10000,staffHourlyWage:0,staffHours:4,overtimeCost:0,mealCost:0,transportCost:0,venueRent:0,venueHours:4,cleaningCost:0,powerCost:0,deposit:0,otherCost:0,venueCapacityOverride:0,actionCosts:{reserve:0,spare:0,shelter:0,supply:0,capacity:0,medical:0,comfort:0},incidentCosts:{equipment:0,weather:0,traffic:0,supply:0,price:0,absence:0,queue:0,crowd:0,staff:0,medical:0,program:0,comfort:0,positive:0}};
export function facilityParameters(item:Item):FacilityParameters {
 const capacity=CATALOG[item.kind].capacity??(item.kind==='toilet'?4:item.kind==='rest'?6:0);
 const servicePerMinute=item.kind==='toilet'?4/3:item.kind==='tent'||item.kind==='tentSmall'?1:item.kind.startsWith('checkin')?capacity*1.2:0;
 return {purchasePrice:0,rentalPrice:0,useCost:0,maintenanceCost:0,transportCost:0,installationCost:0,quantity:1,hours:4,capacity,servicePerMinute,averageUseMinutes:item.kind==='toilet'?3:item.kind==='tent'||item.kind==='tentSmall'?1:0,staffNeed:item.kind.startsWith('checkin')?capacity:item.kind==='toilet'?1:0,radius:item.kind==='toilet'?20:0,source:'未填写 · 演示假设',updatedAt:'',region:'',supplier:'',acquisition:'rent',...item.parameters};
}
export function simulationItemCost(item:Item):number {
 const p=facilityParameters(item);
 return Math.round(Math.max(0,p.quantity)*(Math.max(0,p.acquisition==='buy'?p.purchasePrice:p.rentalPrice)+Math.max(0,p.useCost)*Math.max(0,p.hours)+Math.max(0,p.maintenanceCost)+Math.max(0,p.transportCost)+Math.max(0,p.installationCost)));
}
export function simulationStaffCost(layout:Layout):number {
 const f={...defaultSimulationFinance,...layout.simulationFinance};
 return Math.round(Math.max(0,layout.params.staff)*Math.max(0,f.staffHourlyWage)*Math.max(0,f.staffHours)+Math.max(0,f.overtimeCost)+Math.max(0,f.mealCost)+Math.max(0,f.transportCost));
}
export function simulationVenueCost(layout:Layout):number {
 const f={...defaultSimulationFinance,...layout.simulationFinance};
 return Math.round(Math.max(0,f.venueRent)*Math.max(0,f.venueHours)+Math.max(0,f.cleaningCost)+Math.max(0,f.powerCost)+Math.max(0,f.deposit)+Math.max(0,f.otherCost));
}
export function layoutCost(layout:Layout):number{return layout.operatingMode==='simulation'?layout.items.reduce((n,item)=>n+simulationItemCost(item),0)+simulationStaffCost(layout)+simulationVenueCost(layout):cost(layout.items);}
export function capacityOf(item:Item,realMode=false){return Math.round(((realMode?item.parameters?.capacity:undefined)??CATALOG[item.kind].capacity??0)*Math.pow(item.scale??1,2));}
export function bounds(i:Item){const c=CATALOG[i.kind],scale=i.scale??1,turn=Math.round(i.rotation/90)%2!==0;return {w:(turn?c.d:c.w)*scale,d:(turn?c.w:c.d)*scale};}
export type Placement={level:'valid'|'warning'|'invalid';reason:string};
export function placement(layout:Layout,item:Item,budgetMode:BudgetMode='unlimited'):Placement{
  const b=bounds(item),half=layout.size/2;
  if(Math.abs(item.x)+b.w/2>half||Math.abs(item.z)+b.d/2>half)return {level:'invalid',reason:'超出场地边界'};
  if(layout.indoor&&OUTDOOR_ONLY.includes(item.kind))return {level:'invalid',reason:`${CATALOG[item.kind].name}属于户外设施，不能放在室内场地`};
  if(!layout.indoor&&INDOOR_ONLY.includes(item.kind)&&layout.weather==='heavyRain')return {level:'warning',reason:'户外暴雨中，室内设备需要额外防雨保护'};
  const total=layout.operatingMode==='simulation'?layoutCost({...layout,items:[...layout.items.filter(i=>i.id!==item.id),item]}):cost(layout.items.filter(i=>i.id!==item.id))+itemCost(item);
  const limit=layout.operatingMode==='simulation'?(layout.simulationFinance?.budget??layout.activity.budget):layout.activity.budget,over=total-limit;
  if(over>0&&(layout.operatingMode==='simulation'?layout.simulationFinance?.budgetMode==='limited':budgetMode==='challenge'))return {level:'invalid',reason:`预算不足 ¥${over}`};
  if(CATALOG[item.kind].solid||item.kind==='road'||item.kind==='roadCurve'||item.kind==='path'){for(const other of layout.items){if(other.id===item.id||!CATALOG[other.kind].solid)continue;const a=bounds(other);if(Math.abs(item.x-other.x)<(a.w+b.w)/2&&Math.abs(item.z-other.z)<(a.d+b.d)/2)return {level:'invalid',reason:`与${CATALOG[other.kind].name}重叠`};}}
  const entrance=layout.items.find(i=>i.kind==='entrance'),desk=layout.items.find(i=>['checkin','checkinSmall','checkinLarge'].includes(i.kind));
  if(item.kind==='entrance'&&desk&&Math.hypot(item.x-desk.x,item.z-desk.z)<4||['checkin','checkinSmall','checkinLarge'].includes(item.kind)&&entrance&&Math.hypot(item.x-entrance.x,item.z-entrance.z)<4)return {level:'warning',reason:'入口与签到区较近，建议留出排队空间'};
  const variant=venueVariant(layout.venueId,layout.venueVariant??'medium');
  if(layout.indoor&&b.w>variant.size*.68)return {level:'warning',reason:`设施宽度接近室内场地边界（${variant.size}m），可能影响通行和门口尺寸`};
  if(layout.indoor&&b.w>4.2&&['stageLarge','stage','backdrop','screen','bleachers'].includes(item.kind))return {level:'warning',reason:'大型设施进入室内的门口净宽有限，请确认搬运通道'};
  if(over>0&&(layout.operatingMode!=='simulation'||layout.simulationFinance?.budgetMode!=='off'))return {level:'warning',reason:`已超预算 ¥${over}（无限资金模式仍可放置）`};
  return {level:'valid',reason:'可以放置'};
}
export interface BatchResult{ok:boolean;items:Item[];reason:string;changed:number}
function batchCheck(layout:Layout,items:Item[],ids:string[],budgetMode:BudgetMode):string{
  const temp={...layout,items};
  for(const id of ids){const item=items.find(i=>i.id===id);if(!item)continue;const check=placement(temp,item,budgetMode);if(check.level==='invalid')return `${CATALOG[item.kind].name}：${check.reason}`;}
  return '';
}
export function batchMove(layout:Layout,ids:string[],dx:number,dz:number,budgetMode:BudgetMode='unlimited'):BatchResult{
  const targets=ids.filter(id=>{const item=layout.items.find(i=>i.id===id);return !!item&&!item.locked;});
  if(!targets.length)return {ok:false,items:layout.items,reason:'没有可移动的设施',changed:0};
  const set=new Set(targets);
  const items=layout.items.map(item=>set.has(item.id)?{...item,x:Math.round((item.x+dx)*100)/100,z:Math.round((item.z+dz)*100)/100}:item);
  const reason=batchCheck(layout,items,targets,budgetMode);
  if(reason)return {ok:false,items:layout.items,reason,changed:0};
  return {ok:true,items,reason:`已移动 ${targets.length} 项设施`,changed:targets.length};
}
export function batchRotate(layout:Layout,ids:string[],steps=1,budgetMode:BudgetMode='unlimited'):BatchResult{
  const targets=ids.filter(id=>{const item=layout.items.find(i=>i.id===id);return !!item&&!item.locked;});
  if(!targets.length)return {ok:false,items:layout.items,reason:'没有可旋转的设施',changed:0};
  const set=new Set(targets);
  const items=layout.items.map(item=>set.has(item.id)?{...item,rotation:((item.rotation+90*steps)%360+360)%360}:item);
  const reason=batchCheck(layout,items,targets,budgetMode);
  if(reason)return {ok:false,items:layout.items,reason,changed:0};
  return {ok:true,items,reason:`已旋转 ${targets.length} 项设施`,changed:targets.length};
}
export function alignItems(layout:Layout,ids:string[],axis:'x'|'z',budgetMode:BudgetMode='unlimited'):BatchResult{
  const anchor=ids.map(id=>layout.items.find(i=>i.id===id)).find(item=>item&&!item.locked);
  if(!anchor)return {ok:false,items:layout.items,reason:'没有可对齐的设施',changed:0};
  const targets=ids.filter(id=>id!==anchor.id&&layout.items.some(i=>i.id===id&&!i.locked));
  if(!targets.length)return {ok:false,items:layout.items,reason:'请选择至少两项设施',changed:0};
  const set=new Set(targets);
  const items=layout.items.map(item=>set.has(item.id)?{...item,[axis]:anchor[axis]}:item);
  const reason=batchCheck(layout,items,[anchor.id,...targets],budgetMode);
  if(reason)return {ok:false,items:layout.items,reason,changed:0};
  return {ok:true,items,reason:`已按 ${axis.toUpperCase()} 轴对齐 ${targets.length+1} 项设施`,changed:targets.length+1};
}
export function issues(layout:Layout){const out:string[]=[];const {items,size,activity}=layout;for(const item of items){const a=bounds(item);if(Math.abs(item.x)+a.w/2>size/2||Math.abs(item.z)+a.d/2>size/2)out.push(`${CATALOG[item.kind].name} 超出场地边界`);if(layout.indoor&&OUTDOOR_ONLY.includes(item.kind))out.push(`${CATALOG[item.kind].name} 不应放在室内场地`);for(const other of items)if(other.id<item.id&&CATALOG[item.kind].solid&&CATALOG[other.kind].solid){const b=bounds(other);if(Math.abs(item.x-other.x)<(a.w+b.w)/2&&Math.abs(item.z-other.z)<(a.d+b.d)/2)out.push(`${CATALOG[item.kind].name} 与 ${CATALOG[other.kind].name} 重叠`);}}if(!items.some(i=>i.kind==='entrance'))out.push('缺少入口');if(!items.some(i=>['checkin','checkinSmall','checkinLarge'].includes(i.kind)))out.push('缺少签到台');if(!items.some(i=>['stage','stageSmall','stageLarge','podium','bleachers','chair'].includes(i.kind)))out.push('缺少主活动区域');const entry=items.find(i=>i.kind==='entrance'),desk=items.find(i=>['checkin','checkinSmall','checkinLarge'].includes(i.kind));if(entry&&desk&&Math.hypot(entry.x-desk.x,entry.z-desk.z)<3)out.push('签到台与入口距离过近，排队区不足');if(cost(items)>activity.budget)out.push('设施费用超出活动预算');const capacity=venueCapacity(layout.venueId,layout.venueVariant??'medium');if(activity.people>capacity)out.push(`场地容量 ${capacity} 人，小于参与人数 ${activity.people} 人`);const weather=weatherProfile(layout.weather);if(!layout.indoor&&weather.tentRisk>.3){const loose=items.filter(i=>['tent','tentSmall'].includes(i.kind)&&!i.anchored);if(loose.length)out.push(`${loose.length} 个帐篷未固定，${weather.name}中可能倾倒或受损`);}const damaged=items.filter(i=>i.damaged);if(damaged.length)out.push(`${damaged.length} 项设施已受损，容量或功能下降`);if(!activity.tasks.length)out.push('缺少活动流程');if(activity.people<1)out.push('参与人数应大于零');const facility=analyzeFacilities(layout,CATALOG);for(const warning of facility.warnings){if(/缺少出入口|缺少签到台|个帐篷未固定/.test(warning)||out.includes(warning))continue;out.push(warning);}return out;}
export function operatingIssues(layout:Layout):string[]{
 const original=issues(layout);
 if(layout.operatingMode!=='simulation')return original;
 const finance={...defaultSimulationFinance,...layout.simulationFinance};
 const filtered=original.filter(warning=>warning!=='设施费用超出活动预算'&&!/^场地容量 \d+ 人，小于参与人数/.test(warning));
 if(finance.budgetMode==='limited'&&layoutCost(layout)>finance.budget)filtered.push('现实配置成本超出指定预算');
 const capacity=finance.venueCapacityOverride>0?finance.venueCapacityOverride:venueCapacity(layout.venueId,layout.venueVariant??'medium');
 if(layout.activity.people>capacity)filtered.push(`场地容量 ${capacity} 人，小于参与人数 ${layout.activity.people} 人`);
 return filtered;
}
export function snapshot(layout:Layout):Snapshot{const {activity:a,items}=layout;const venue=venueDefinition(layout.venueId),variant=venueVariant(layout.venueId,layout.venueVariant??'medium'),weather=weatherProfile(layout.weather),roles=roleCounts(layout);const buildCost=cost(items),challenge=layout.challenge?structuredClone(layout.challenge):undefined,difficulty=layout.difficulty??'normal',difficultyInfo=difficultyProfile(difficulty);return {schema:1,id:a.id,createdAt:a.date||'1970-01-01',fingerprint:JSON.stringify([a,items,layout.size,layout.params,layout.venueId,layout.venueVariant,layout.indoor,layout.weather,layout.challenge,difficulty]),title:a.title,scene:a.scene,people:a.people,duration:a.duration,outdoor:!layout.indoor,equipmentName:a.scene==='performance'?'音响':'活动设备',activityName:a.title,tasks:a.tasks,roles:(Object.keys(ROLE_LABELS) as Role[]).filter(k=>roles[k]>0).map(k=>({name:ROLE_LABELS[k],count:roles[k]})),resources:items.map(i=>CATALOG[i.kind].name),buildCost,challenge,difficulty,assumptions:['使用 3MinLab 原概率引擎；概率参数是演示假设，不代表真实发生率。',`设施布局成本 ¥${buildCost}，设施位置影响寻路与签到服务能力。`,`${Math.max(0,Math.round(layout.volunteers??0))} 名志愿者按一岗一人计入现场人力。`,`场地：${venue.name} · ${variant.label}（${variant.size}×${variant.size}m，${layout.indoor?'室内':'室外'}，容量 ${variant.capacity} 人）。`,`天气：${weather.name}；户外设施与人员速度会受风力、降雨影响。`,`难度：${difficultyInfo.name}（奖励 ×${difficultyInfo.rewardScale}，事件系数 ×${difficultyInfo.hazardScale}，最多 ${difficultyInfo.maxActiveEvents} 个并发事件）。`,...(challenge?[`挑战「${challenge.name}」：${challenge.goals.length} 项目标、${challenge.fails.length} 项失败条件，事件强度 ×${challenge.eventIntensity.toFixed(2)}。`]:[])]};}
export function start(layout:Layout){
 const facility=analyzeFacilities(layout,CATALOG);
 const venue=itemsCapacity(layout.items,layout.weather,layout.indoor,layout.operatingMode==='simulation'),deskCapacity=facility.checkinDesks;
 const volunteers=Math.max(0,Math.min(500,Math.round(layout.volunteers??0)));
 const weather=weatherProfile(layout.weather);
 const simulation=layout.operatingMode==='simulation',finance={...defaultSimulationFinance,...layout.simulationFinance};
 const intensity=simulation?1:Math.max(.4,Math.min(2,layout.challenge?.eventIntensity??1)),hazard=simulation?1:difficultyProfile(layout.difficulty).hazardScale;
 const weatherService=layout.indoor?1:Math.max(.55,1-(1-weather.comfort)*.55);
 const access=Math.max(.45,Math.min(1.2,.55+facility.accessibility/220+facility.shelterCoverage*.08))*weatherService;
 const venueCap=simulation&&finance.venueCapacityOverride>0?finance.venueCapacityOverride:venueCapacity(layout.venueId,layout.venueVariant??'medium');
 const p={...layout.params,staff:layout.params.staff+volunteers,budget:simulation?(finance.budgetMode==='off'?1e8:Math.max(0,finance.budget-layoutCost(layout))):Math.max(0,layout.activity.budget-cost(layout.items)),capacity:Math.max(20,Math.min(layout.params.capacity,venue,venueCap)),checkinStaff:deskCapacity?layout.params.checkinStaff:1,serviceRate:Math.max(.1,Math.min(20,(deskCapacity||.1)*layout.params.serviceRate*access)),equipmentRate:layout.params.equipmentRate*intensity*hazard*(layout.indoor?1:1+weather.rain*1.4+weather.wind*.6)*(1.25-facility.scores.resilience/200),weatherRate:layout.params.weatherRate*intensity*hazard*(1+weather.wind*.8+weather.rain*.5)*(1-facility.shelterCoverage*.25),trafficRate:layout.params.trafficRate*intensity*hazard,supplyRate:layout.params.supplyRate*intensity*hazard,priceRate:layout.params.priceRate*intensity*hazard};
 const snap=snapshot(layout);
 if(simulation){snap.simulationMode=true;snap.simulationActionCosts=finance.actionCosts;snap.simulationIncidentCosts=finance.incidentCosts;snap.buildCost=layoutCost(layout);snap.challenge=undefined;snap.difficulty='novice';snap.assumptions=snap.assumptions.filter(note=>!note.startsWith('难度：')&&!note.startsWith('挑战「')&&!note.startsWith('设施布局成本')&&!note.startsWith('场地：'));snap.assumptions.push(`场地：${venueDefinition(layout.venueId).name}，容量 ${venueCap} 人（${finance.venueCapacityOverride>0?'用户输入':'模板演示假设'}）。`, `现实仿真：当前配置成本 ¥${snap.buildCost}；未填写的价格为未知，不使用游戏金币报价；全部默认能力为演示假设。`);}
 snap.facility=facility;
 snap.assumptions=[...snap.assumptions,`设施功能：${facility.summary}。`,...facility.warnings.slice(0,3).map(w=>`功能提醒：${w}`),...facility.strengths.slice(0,2).map(s=>`功能优势：${s}`)];
 return createSimulation(snap,p);
}
export function reconcile(state:SimulationState,layout:Layout):SimulationState{
 const updated=start(layout);
 const staffDifference=updated.parameters.staff-state.parameters.staff;
 const reserve=state.actions.some(a=>a.name.includes('调用 2 名后备人员'))?1:0;
 const overflow=state.actions.some(a=>a.name.includes('增开分流等候区'))?50:0;
 return {...state,snapshot:updated.snapshot,parameters:{...state.parameters,budget:updated.parameters.budget,capacity:updated.parameters.capacity+overflow,serviceRate:updated.parameters.serviceRate,checkinStaff:updated.parameters.checkinStaff+reserve,staff:updated.parameters.staff},availableStaff:Math.max(0,state.availableStaff+staffDifference)};
}
export function evaluate(layout:Layout,state:SimulationState|null){
 const budgetRemaining=layout.activity.budget-cost(layout.items)-(state?.extraSpend??0);
 const warnings=issues(layout).length;
 const readiness=Math.max(0,40-warnings*8);
 const budget=budgetRemaining>=layout.activity.budget*.1?20:budgetRemaining>=0?10:0;
 const service=state?Math.round(25*state.served/Math.max(1,state.arrived)*(.8+(state.satisfaction??70)/500)):0;
 const schedule=state?Math.max(0,15-Math.min(15,Math.round(state.delay/3))):0;
 return {score:Math.min(100,readiness+budget+service+schedule),readiness,budget,service,schedule,budgetRemaining,warnings,satisfaction:state?.satisfaction??70};
}
export function itemsCapacity(items:Item[],weather?:WeatherKind,indoor?:boolean,realMode=false){const risk=indoor?0:weatherProfile(weather).tentRisk;const seats=items.filter(i=>['chair','bleachers','tent','tentSmall'].includes(i.kind)).reduce((n,i)=>{const base=capacityOf(i,realMode);if(i.kind!=='tent'&&i.kind!=='tentSmall')return n+base;if(i.damaged)return n+Math.round(base*.45);if(!i.anchored&&risk>.3)return n+Math.round(base*.35);return n+base;},0);return Math.max(20,seats);}
export function applyDifficulty(layout:Layout,tier:DifficultyTier):Layout{
 const profile=difficultyProfile(tier),current=difficultyProfile(layout.difficulty);
 const derived:DifficultyBaseline={
  people:Math.round(layout.activity.people/(current.peopleScale||1)),
  staff:Math.round(layout.params.staff/(current.staffScale||1)),
  volunteers:Math.round((layout.volunteers??0)/(current.volunteerScale||1)),
  budget:Math.round(layout.activity.budget/(current.budgetScale||1)),
  checkinStaff:Math.round(layout.params.checkinStaff/(current.checkinScale||1)),
  absence:layout.params.absence/(current.absenceScale||1),
  arrivalSpread:layout.params.arrivalSpread/(current.spreadScale||1),
  weather:layout.weather??'sunny',weatherAuto:!!layout.weatherAuto,budgetMode:layout.budgetMode??'unlimited',
 };
 const stored=layout.difficultyBase;
 const base:DifficultyBaseline=stored?{
  ...derived,...stored,
  weather:stored.weather??derived.weather,weatherAuto:stored.weatherAuto??derived.weatherAuto,budgetMode:stored.budgetMode??derived.budgetMode,
 }:derived;
 const venueCap=venueCapacity(layout.venueId,layout.venueVariant??'medium'),buildCost=cost(layout.items);
 const people=Math.max(1,Math.min(venueCap,Math.round(base.people*profile.peopleScale)));
 const staff=Math.max(2,Math.min(400,Math.round(base.staff*profile.staffScale)));
 const volunteers=Math.max(0,Math.min(500,Math.round(base.volunteers*profile.volunteerScale)));
 const budget=Math.max(1000,Math.round(Math.max(buildCost+profile.budgetSlack,base.budget*profile.budgetScale)));
 const checkinStaff=Math.max(1,Math.min(Math.max(1,staff-1),Math.round(base.checkinStaff*profile.checkinScale)));
 return {...layout,difficulty:tier,difficultyBase:base,
  activity:{...layout.activity,people,budget},
  params:{...layout.params,staff,checkinStaff,capacity:Math.max(20,Math.min(venueCap,Math.ceil(people*1.1))),absence:Math.max(0,Math.min(.6,base.absence*profile.absenceScale)),arrivalSpread:Math.max(5,Math.min(180,Math.round(base.arrivalSpread*profile.spreadScale)))},
  volunteers,
  weather:profile.weather??base.weather??layout.weather??'sunny',
  weatherAuto:profile.weatherAuto!==undefined?profile.weatherAuto:base.weatherAuto??!!layout.weatherAuto,
  budgetMode:profile.budgetMode??base.budgetMode??layout.budgetMode??'unlimited',
 };
}
export function freshLayout(scene:Scene='custom'):Layout{const activity=defaultActivity(scene),venueId=venueForScene(scene),venueVariantName:VenueSize='medium',venue=venueDefinition(venueId),info=venueVariant(venueId,venueVariantName);activity.people=Math.min(activity.people,info.capacity);const base:Snapshot={schema:1,id:activity.id,createdAt:'',fingerprint:'',title:activity.title,scene,people:activity.people,duration:activity.duration,outdoor:venue.type==='outdoor',equipmentName:'设备',activityName:activity.title,tasks:activity.tasks,roles:[{name:'工作组',count:12}],resources:[],assumptions:[]};return {activity,size:info.size,items:makeVenueItems(venueId,venueVariantName),volunteers:6,terrain:venue.terrain,world:defaultWorld(scene==='performance'?20261107:20261106),venueId,venueVariant:venueVariantName,indoor:venue.type==='indoor',weather:'sunny',weatherAuto:false,wallMode:'auto',roofMode:'translucent',budgetMode:'unlimited',difficulty:'normal',params:{...suggestedParameters(base),seed:20261106,budget:activity.budget,capacity:Math.min(info.capacity,Math.max(20,Math.ceil(activity.people*1.1)))},history:[]};}
export function normalizeLayout(layout:Layout):Layout{const scene=layout.activity?.scene??'custom',venueId=layout.venueId??venueForScene(scene),variant:VenueSize=layout.venueVariant??'medium',venue=venueDefinition(venueId),info=venueVariant(venueId,variant),seed=layout.world?.seed??layout.params?.seed??20261106;return {...layout,venueId,venueVariant:variant,indoor:layout.indoor??venue.type==='indoor',weather:layout.weather??'sunny',weatherAuto:!!layout.weatherAuto,wallMode:layout.wallMode??'auto',roofMode:layout.roofMode??'translucent',viewMode:layout.viewMode??'normal',budgetMode:layout.budgetMode??'unlimited',challenge:layout.challenge?normalizeChallenge(layout.challenge):undefined,difficulty:layout.difficulty??'normal',difficultyBase:layout.difficultyBase,size:Math.max(20,Math.min(120,layout.size||info.size)),volunteers:Math.max(0,Math.min(500,Math.round(layout.volunteers??0))),world:normalizeWorld(layout.world,seed),items:(layout.items??[]).map(i=>({...i,height:i.height??1,locked:!!i.locked,anchored:!!i.anchored,damaged:!!i.damaged}))};}
function clockMinutes(value:string){const m=String(value).match(/(\d{1,2}):(\d{2})/);return m?Number(m[1])*60+Number(m[2]):null;}
export function importBackup(value:unknown):Layout {
 const b=value as {format?:string;version?:number;project?:{id:string;plan?:{title:string;brief:{people:number;budget:number;durationMinutes:number;date:string}};workspace?:{scene:Scene;people?:unknown[];flow:{id:string;title:string;start:string;end:string;people?:string[];equipment:string;venue:string;note?:string}[]}}};
 if(b?.format!=='activity-project-backup'||b.version!==1||!b.project?.plan||!b.project.workspace)throw Error('请选择 3MinLab 导出的完整活动备份 JSON');
 const p=b.project.plan,w=b.project.workspace,scene=w.scene||'custom',layout=freshLayout(scene),origin=clockMinutes(w.flow[0]?.start??'');
 layout.activity={id:id(),sourceId:b.project.id,source:'3MinLab 备份',title:p.title,scene,people:p.brief.people,budget:p.brief.budget,duration:p.brief.durationMinutes,date:p.brief.date,tasks:w.flow.map((f,i)=>{const begin=clockMinutes(f.start),end=clockMinutes(f.end);return {id:f.id||`flow-${i}`,name:f.title||`环节 ${i+1}`,start:begin!==null&&origin!==null?Math.max(0,begin-origin):i*25,duration:begin!==null&&end!==null?Math.max(1,(end-begin+1440)%1440):25,staff:Math.max(1,f.people?.length||2),equipment:!!f.equipment,supplies:/物资|材料|补给/.test(f.note??''),venue:f.venue||'主区域',dependencies:i?[w.flow[i-1].id]:[]};})};
 if(!layout.activity.tasks.length)layout.activity.tasks=defaultActivity(scene).tasks;
 layout.params={...layout.params,budget:p.brief.budget,staff:Math.max(2,w.people?.length||layout.params.staff)};
 return layout;
}
