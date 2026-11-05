import type { EventPlan } from '../types';
export type Scene = 'athletics' | 'performance' | 'conference' | 'sports' | 'charity' | 'business' | 'competition' | 'community' | 'custom';
export interface Field { key: string; label: string; type?: 'text' | 'number' | 'date' | 'time'; options?: string[] }
export interface DataRow { id: string; [key: string]: string }
export interface DataTable { id: string; name: string; fields: Field[]; rows: DataRow[]; revision: number; hiddenFields?: string[] }
export interface Person { id: string; name: string; roles: string[]; organizationId?: string; fields: Record<string, string> }
export interface Organization { id: string; name: string; kind: '组织单位' | '参赛队伍' | '演出团队' | '工作小组' | '部门' | '志愿者团队' }
export interface FlowNode { id: string; start: string; end: string; title: string; owner: string; people: string[]; venue: string; equipment: string; status: string; note: string }
export interface ActivityProfile { organizer: string; coorganizer: string; owner: string; status: string; location: string }
export interface EventProject { id: string; name: string; group: string; kind: 'track' | 'field' | 'height'; relay: boolean; lanes: number; duration: number; capacity: number; rounds: 'final' | 'heats-final'; venue: string; officials: string; start: string; tieRule: 'shared' | 'manual' }
export interface Athlete { status?: '已报名' | '退赛'; id: string; number: string; name: string; team: string; group: string; projects: string[]; seed: string }
export type ResultStatus = '有效' | '未出赛' | '弃权' | '犯规' | '无成绩';
export interface AthleticResult { id: string; projectId: string; athleteId: string; round: '预赛' | '决赛'; value: string; status: ResultStatus; tieBreak: string; note: string }
export interface Race { id: string; projectId: string; round: '预赛' | '决赛'; heat: number; start: string; duration: number; venue: string; officials: string; athletes: string[] }
export interface AthleticsData { projects: EventProject[]; athletes: Athlete[]; results: AthleticResult[]; races: Race[]; scheduleSource: string; restMinutes: number; maxEntries: number; points: number[]; relayFactor: number; teamTie: 'shared' | 'gold'; tiePoints: 'average' | 'place'; awardPlaces: number }
export type DocumentCategory = '活动策划文件' | '报名与人员资料' | '活动流程文件' | '任务分工文件' | '预算与物资文件' | '活动专属文件' | '成绩与统计文件' | '总结与反馈文件';
export interface ActivityDocument { id: string; activityId: string; toolId: string; type: 'text' | 'table'; name: string; category: DocumentCategory; text: string; headers: string[]; rows: string[][]; createdAt: string; updatedAt: string; version: number; source: string; manual: boolean; ai: boolean; formats: string[] }
export interface CustomTemplate { id: string; name: string; text: string; fields: Field[]; kind: 'text' | 'table' }
export interface Workspace { planningReview?: Record<string, { status: 'done' | 'skip'; fingerprint: string }>; version: 1; activityId: string; scene: Scene; profile: ActivityProfile; people: Person[]; organizations: Organization[]; flow: FlowNode[]; tools: string[]; tables: Record<string, DataTable>; documents: ActivityDocument[]; athletics: AthleticsData; customTemplates: CustomTemplate[] }
export interface ToolDefinition { id: string; name: string; description: string; scene: Scene; kind: 'text' | 'table' | 'athletics' | 'sports' | 'performance' | 'scoring'; category: DocumentCategory; fields?: Field[]; body?: string; source?: string }
export function uid() { return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`; }
export function detectScene(plan: EventPlan): Scene {
  if (plan.brief.categoryId === 'sports-meet' || /田径|校运会/.test(plan.title)) return 'athletics';
  const family = plan.brief.family;
  return ({ arts: 'performance', academic: 'conference', education: 'conference', sports: 'sports', charity: 'charity', business: 'business', startup: 'competition', career: 'business', social: 'community', campus: 'custom' } as Record<string, Scene>)[family] ?? 'custom';
}
export function createWorkspace(plan: EventPlan): Workspace {
  const timeline=plan.modules.find(module=>module.id==='program')?.blocks.find(block=>block.kind==='timeline');
  const flow:FlowNode[]=timeline?.kind==='timeline'?timeline.entries.map(entry=>({id:uid(),start:entry.time.split(/[–—-]/)[0]??'',end:entry.time.split(/[–—-]/)[1]??'',title:entry.title,owner:'',people:[],venue:plan.brief.venueNote||'',equipment:'',status:'待执行',note:entry.detail??''})):[];
  return { version: 1, activityId: plan.id, scene: detectScene(plan), profile: { organizer: '', coorganizer: '', owner: '', status: '筹备中', location: plan.brief.venueNote || '' }, people: [], organizations: [], flow, tools: [], tables: {}, documents: [], customTemplates: [], athletics: { projects: [], athletes: [], results: [], races: [], scheduleSource: '', restMinutes: 30, maxEntries: 3, points: [9,7,6,5,4,3,2,1], relayFactor: 2, teamTie: 'shared', tiePoints: 'average', awardPlaces: 8 } };
}
