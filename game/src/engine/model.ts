// Extracted from 3MinLab/src/simulation/model.ts for independent builds.
import type {FacilityMetrics} from '../facilities';

export type Scene = 'athletics' | 'performance' | 'conference' | 'sports' | 'charity' | 'business' | 'competition' | 'community' | 'custom';

export type ProbabilitySource = '系统演示假设' | '用户提供数据' | '专家估计' | '历史数据';
export interface Parameters {
  seed: number; attendance: number; late: number; absence: number; arrivalSpread: number;
  serviceRate: number; durationCV: number; equipmentRate: number; weatherRate: number;
  trafficRate: number; supplyRate: number; priceRate: number; repairMean: number;
  staff: number; checkinStaff: number; capacity: number; spare: number; budget: number;
  source: ProbabilitySource; sourceNote: string;
}
export interface Task { id: string; name: string; start: number; duration: number; staff: number; equipment: boolean; supplies?: boolean; venue: string; dependencies: string[]; }
export type ChallengeMetric = 'served' | 'servedRate' | 'satisfaction' | 'peakQueue' | 'delay' | 'spend' | 'timeout';
export type ChallengeOperator = 'atLeast' | 'atMost';
export interface ChallengeGoal {
  id: string; metric: ChallengeMetric; operator: ChallengeOperator; target: number; label: string;
}
export interface ChallengeFail {
  id: string; metric: ChallengeMetric; operator: ChallengeOperator; target: number; label: string;
}
export interface ChallengeConfig {
  name: string; brief: string; goals: ChallengeGoal[]; fails: ChallengeFail[];
  eventIntensity: number; director: boolean;
}
export interface ChallengeGoalResult {
  id: string; label: string; metric: ChallengeMetric; value: number; target: number; met: boolean;
}
export interface ChallengeResult {
  total: number; met: number; goals: ChallengeGoalResult[];
  failed: boolean; failure?: string; completed: boolean;
}
export interface Snapshot {
  schema: 1; id: string; createdAt: string; fingerprint: string; title: string; scene: Scene;
  people: number; duration: number; outdoor: boolean; equipmentName: string; activityName: string;
  tasks: Task[]; assumptions: string[]; roles: {name:string; count:number}[]; resources: string[];
  facility?: FacilityMetrics; buildCost?: number; challenge?: ChallengeConfig; difficulty?: 'novice' | 'normal' | 'hard' | 'expert' | 'extreme';simulationMode?:boolean;
  simulationActionCosts?:Partial<Record<DirectorMitigation,number>>;
  simulationIncidentCosts?:Partial<Record<RiskKind|DirectorEventKind,number>>;
}
export interface RuntimeTask extends Task { remaining: number; actualStart?: number; actualEnd?: number; status: '等待' | '进行中' | '已完成'; }
export type RiskKind = 'equipment' | 'weather' | 'traffic' | 'supply' | 'price' | 'absence';
export interface Incident { id: number; kind: RiskKind; at: number; until: number; severity: number; cost: number; message: string; }
export interface Action { at: number; name: string; cost: number; }
export type DirectorMitigation = 'reserve' | 'spare' | 'shelter' | 'supply' | 'capacity' | 'medical' | 'comfort';
export type DirectorEventKind = 'queue' | 'crowd' | 'weather' | 'staff' | 'medical' | 'equipment' | 'program' | 'comfort' | 'positive';
export type DirectorEventStatus = 'warning' | 'active' | 'resolved' | 'prevented';
export interface DirectorEventImpact {
  serviceFactor?: number;
  departureFactor?: number;
  satisfactionPerMinute?: number;
  satisfactionOnActivation?: number;
  budgetCost?: number;
  addIncident?: RiskKind;
  pauseTaskId?: string;
}
export interface DirectorEvent {
  id: number; kind: DirectorEventKind; title: string; status: DirectorEventStatus;
  at: number; activeAt: number; until: number; severity: 1 | 2 | 3; risk: number;
  reason: string; chain: string[]; effects: string[];
  mitigation?: DirectorMitigation;
  impact: DirectorEventImpact;
  resolution?: string;
}
export interface DirectorMetrics {
  time: number; queue: number; occupancy: number; capacityUse: number; satisfaction: number; staffLoad: number;
  queuePressure: number; crowdPressure: number; weatherPressure: number; medicalPressure: number; equipmentPressure: number;
  comfort: number; atmosphere: number; progress: number; arrivalsRemaining: number; risk: number;
}
export interface DirectorState {
  schema: 1; rng: number; nextReview: number; serial: number; events: DirectorEvent[];
  metrics?: DirectorMetrics; positiveStreak: number; lastTrigger: Record<string, number>;
}
export type ReplayEventKind = 'start' | 'director' | 'incident' | 'action' | 'task' | 'weather' | 'milestone';
export type ReplaySpot = 'entrance' | 'checkin' | 'queue' | 'stage' | 'rest' | 'medical' | 'venue' | 'field';
export interface ReplayLogEntry {
  id: number; at: number; kind: ReplayEventKind; title: string; detail: string;
  severity?: number; directorId?: number; location?: ReplaySpot; cost?: number;
  reason?: string; chain?: string[]; effects?: string[]; weather?: string; dedupe?: string;
  tone?: 'positive' | 'negative' | 'progress' | 'warning' | 'action' | 'info';
  status?: string; relatedId?: number;
}
export interface MoneyTransaction {
  id: string; at: number; title: string; amount: number;
  category: 'facility' | 'incident' | 'action' | 'program' | 'refund';
  sourceId: string; eventId?: number;
}
export interface FacilityRuntime {
  toiletQueue: number; vendorQueue: number; toiletServed: number; vendorServed: number;
  restingStaff: number; toiletCongested: boolean; vendorCongested: boolean;
}
export interface ReplayFrame {
  t: number; arrived: number; served: number; departed: number; queue: number; peakQueue: number;
  occupancy: number; capacityUse: number; satisfaction: number; delay: number; spend: number;
  risk: number; queuePressure: number; crowdPressure: number; staffLoad: number;
  comfort: number; atmosphere: number; progress: number; tasksDone: number; tasksTotal: number;
  activeEvents: number[]; warningEvents: number[]; incidents: number[];
  weatherClosed: boolean; equipmentDown: boolean; supplyDown: boolean;
  toiletQueue?: number; vendorQueue?: number; restingStaff?: number;
}
export interface ReplayState { schema: 1; frames: ReplayFrame[]; events: ReplayLogEntry[]; serial: number; }
export interface SimulationState {
  staffBusyMinutes?: number; staffCapacityMinutes?: number; schema: 1; snapshot: Snapshot; parameters: Parameters; rng: number; minute: number; status: 'ready' | 'running' | 'finished';
  tasks: RuntimeTask[]; arrivals: number[]; departed: number; arrived: number; served: number; queue: number;
  availableStaff: number; assignedStaff: number; equipmentDown: boolean; weatherClosed: boolean; supplyDown: boolean;
  sheltered: boolean; usedSpare: number; baseSpend: number; extraSpend: number; delay: number; peakQueue: number; queuePersonMinutes: number;
  incidents: Incident[]; actions: Action[]; trace: {time:number;queue:number;delay:number;cost:number}[];
  transfers:{at:number;kind:'arrival'|'admission'|'exit';count:number}[]; attendanceTotal: number; missingStaff: number; timeout: boolean;
  satisfaction?: number; director?: DirectorState; replay?: ReplayState; challenge?: ChallengeResult;
  transactions?: MoneyTransaction[];
  facilities?: FacilityRuntime;
  staffFatigue?: number;
}
export interface RunRecord { id: string; savedAt: string; state: SimulationState; }
export const defaults: Parameters = {seed:20261105, attendance:.92,late:.15,absence:.05,arrivalSpread:35, serviceRate:1.2,durationCV:.18,equipmentRate:.16,weatherRate:.12,trafficRate:.12,supplyRate:.08,priceRate:.06,repairMean:18,staff:12,checkinStaff:3,capacity:200,spare:1,budget:10000,source:'系统演示假设',sourceNote:''};
