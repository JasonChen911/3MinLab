import type { EventPlan } from '../types';
import type { Scene, Workspace } from '../workbench/model';

export type ProbabilitySource = '系统演示假设' | '用户提供数据' | '专家估计' | '历史数据';
export interface Parameters {
  seed: number; attendance: number; late: number; absence: number; arrivalSpread: number;
  serviceRate: number; durationCV: number; equipmentRate: number; weatherRate: number;
  trafficRate: number; supplyRate: number; priceRate: number; repairMean: number;
  staff: number; checkinStaff: number; capacity: number; spare: number; budget: number;
  source: ProbabilitySource; sourceNote: string;
}
export interface Task { id: string; name: string; start: number; duration: number; staff: number; equipment: boolean; supplies?: boolean; venue: string; dependencies: string[]; }
export interface Snapshot {
  schema: 1; id: string; createdAt: string; fingerprint: string; title: string; scene: Scene;
  people: number; duration: number; outdoor: boolean; equipmentName: string; activityName: string;
  tasks: Task[]; assumptions: string[]; roles: {name:string; count:number}[]; resources: string[];
}
export interface RuntimeTask extends Task { remaining: number; actualStart?: number; actualEnd?: number; status: '等待' | '进行中' | '已完成'; }
export type RiskKind = 'equipment' | 'weather' | 'traffic' | 'supply' | 'price' | 'absence';
export interface Incident { id: number; kind: RiskKind; at: number; until: number; severity: number; cost: number; message: string; }
export interface Action { at: number; name: string; cost: number; }
export interface SimulationState {
  staffBusyMinutes?: number; staffCapacityMinutes?: number; schema: 1; snapshot: Snapshot; parameters: Parameters; rng: number; minute: number; status: 'ready' | 'running' | 'finished';
  tasks: RuntimeTask[]; arrivals: number[]; departed: number; arrived: number; served: number; queue: number;
  availableStaff: number; assignedStaff: number; equipmentDown: boolean; weatherClosed: boolean; supplyDown: boolean;
  sheltered: boolean; usedSpare: number; baseSpend: number; extraSpend: number; delay: number; peakQueue: number; queuePersonMinutes: number;
  incidents: Incident[]; actions: Action[]; trace: {time:number;queue:number;delay:number;cost:number}[];
  transfers:{at:number;kind:'arrival'|'admission'|'exit';count:number}[]; attendanceTotal: number; missingStaff: number; timeout: boolean;
}
export interface RunRecord { id: string; savedAt: string; state: SimulationState; }
export const defaults: Parameters = {seed:20261105, attendance:.92,late:.15,absence:.05,arrivalSpread:35, serviceRate:1.2,durationCV:.18,equipmentRate:.16,weatherRate:.12,trafficRate:.12,supplyRate:.08,priceRate:.06,repairMean:18,staff:12,checkinStaff:3,capacity:200,spare:1,budget:10000,source:'系统演示假设',sourceNote:''};
export function fingerprint(plan:EventPlan,workspace:Workspace) { return JSON.stringify([plan,workspace.flow,workspace.people,workspace.scene,workspace.profile,workspace.tables]); }
