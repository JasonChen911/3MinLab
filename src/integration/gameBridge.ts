import {projectRepository} from '../projects/repository';
import {PRESETS} from '../data/presets';
import type {ActivityProject} from '../projects/model';

export const BRIDGE_KEY='3minlab-v6-activity-bridge';
export const RESULT_KEY='3minlab-v6-simulation-results';
export type BridgeResult={schema:1;simulationId:string;activityId:string;scenarioId:string;at:string;attendance:number;budgetPlanned:number;budgetUsed:number;budgetVariance:number;satisfaction:number;delay:number;incidents:string[];completedTasks:string[];failedTasks:string[]};
export function readGameResults(activityId:string):BridgeResult[]{try{const raw=JSON.parse(localStorage.getItem(RESULT_KEY)||'[]');return Array.isArray(raw)?raw.filter((item:BridgeResult)=>item?.schema===1&&item.activityId===activityId):[];}catch{return [];}}
export type BridgePlan={schema:1;activityId:string;templateId:string;name:string;category:string;people:number|null;budget:number|null;duration:number|null;date:string;venue:string;venueKind?:string;staff:number;volunteers:number;workGroups:{name:string;leader:string;tasks:string[]}[];workflow:{id:string;title:string;start:string;end:string;owner:string;equipment:string;venue:string}[];budgetItems:{name:string;amount:number}[];updatedAt:string};
export type BridgeTemplate={id:string;name:string;category:string;description:string;people:number;budget:number;duration:number;venue:string;workflow:string[];roles:string[];facilities:string[]};
export type BridgeStore={schema:1;exportedAt:string;plans:BridgePlan[];templates:BridgeTemplate[]};
const text=(value:unknown)=>typeof value==='string'?value:'';
export function toBridgePlan(project:ActivityProject):BridgePlan{
 const brief=project.plan?.brief??project.draft,workspace=project.workspace;
 const timeline=project.plan?.modules.find(module=>module.id==='program')?.blocks.find(block=>block.kind==='timeline');
 const flow=workspace?.flow.length?workspace.flow:timeline?.kind==='timeline'?timeline.entries.map((entry,i)=>({id:`plan-${i}`,title:entry.title,start:entry.time.split(/[–—-]/)[0]||'',end:entry.time.split(/[–—-]/)[1]||'',owner:'',equipment:'',venue:''})):[];
 const plannedStaff=project.plan?.modules.find(module=>module.id==='organization')?.blocks.find(block=>block.kind==='staff');
 const rows=plannedStaff?.kind==='staff'?plannedStaff.rows:[];
 const rosterStaff=workspace?.people.filter(p=>p.roles.some(r=>/工作|员工|裁判|主持|志愿|会务|后勤/.test(r))).length??0;
 const rosterVolunteers=workspace?.people.filter(p=>p.roles.some(r=>/志愿/.test(r))).length??0;
 const staff=rosterStaff||rows.reduce((sum,row)=>sum+Math.max(0,row.count),0);
 const volunteers=rosterVolunteers||rows.filter(row=>/志愿/.test(row.role)).reduce((sum,row)=>sum+Math.max(0,row.count),0);
 const actual=(workspace?.tables.expenses?.rows??[]).map(row=>({name:text(row.item||row.name||row.category),amount:Number(row.amount||row.cost)||0})).filter(row=>row.name);
 const planned=project.plan?.modules.find(module=>module.id==='budget')?.blocks.find(block=>block.kind==='budget');
 const budgetItems=actual.length?actual:planned?.kind==='budget'?planned.rows.map(row=>({name:row.item||row.category,amount:row.amount})):[];
 return {schema:1,activityId:project.id,templateId:text(brief.categoryId),name:project.plan?.title||project.name,category:text(brief.family),people:Number.isFinite(brief.people)?brief.people:null,budget:Number.isFinite(brief.budget)?brief.budget:null,duration:Number.isFinite(brief.durationMinutes)?brief.durationMinutes:null,date:text(brief.date),venue:workspace?.profile.location||text(brief.venueNote),venueKind:text(brief.venue),staff,volunteers,workGroups:(workspace?.workGroups??[]).map(g=>({name:g.name,leader:g.leader,tasks:g.tasks.map(t=>t.title)})),workflow:flow.map(f=>({id:f.id,title:f.title,start:f.start,end:f.end,owner:f.owner,equipment:f.equipment,venue:f.venue})),budgetItems,updatedAt:project.updatedAt};
}
export function bridgeTemplates():BridgeTemplate[]{return PRESETS.map(p=>({id:p.id,name:p.name,category:p.categoryId,description:p.intro,people:p.people,budget:p.budget,duration:p.duration,venue:p.venue,workflow:p.flow.map(a=>a.name),roles:p.roles.map(r=>r.role),facilities:p.materials}));}
export async function publishGameBridge(){const plans=(await projectRepository.list()).map(toBridgePlan);const store:BridgeStore={schema:1,exportedAt:new Date().toISOString(),plans,templates:bridgeTemplates()};localStorage.setItem(BRIDGE_KEY,JSON.stringify(store));return store;}

