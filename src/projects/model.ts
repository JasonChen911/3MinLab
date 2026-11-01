import type { EventBrief, EventPlan } from '../types';
import type { Workspace } from '../workbench/model';
export const PROJECT_STATUSES=['草稿','筹备中','报名中','即将举行','进行中','已结束','已归档','已取消'] as const;
export type ProjectStatus=typeof PROJECT_STATUSES[number];
export interface AttachmentMeta {id:string;activityId:string;name:string;mime:string;size:number;category:string;createdAt:string;updatedAt:string;parsed:boolean;importedInto?:string}
export interface ChatMessage {id:string;role:'user'|'assistant';text:string;createdAt:string;source:'local'|'model'|'system'}
export interface ProjectVersion {afterFingerprint?:string;undoneAt?:string;id:string;createdAt:string;reason:string;source:'user'|'assistant';before:{plan?:EventPlan;draft:EventBrief;workspace?:Workspace;attachments?:AttachmentMeta[]};afterSummary:string[];documentChanges:string[]}
export interface ActivityProject {schema:1;id:string;name:string;categoryId:string;status:ProjectStatus;createdAt:string;updatedAt:string;stage:'intake'|'plan';draft:EventBrief;plan?:EventPlan;workspace?:Workspace;attachments:AttachmentMeta[];chat:ChatMessage[];versions:ProjectVersion[];pendingAdjustment?:import('../assistant/service').AdjustmentProposal}
export interface StoredAttachment {id:string;activityId:string;blob:Blob}
export interface ProjectRepository {list():Promise<ActivityProject[]>;get(id:string):Promise<ActivityProject|undefined>;update(id:string,change:(current:ActivityProject|undefined)=>ActivityProject):Promise<ActivityProject>;remove(id:string):Promise<void>;getFile(id:string):Promise<StoredAttachment|undefined>;saveFile(meta:AttachmentMeta,blob:Blob):Promise<void>;deleteFile(activityId:string,id:string):Promise<void>}
export function projectProgress(project:ActivityProject) {const tasks=project.workspace?.tables.tasks?.rows??[];if(tasks.length)return Math.round(tasks.filter(task=>task.status==='已完成').length/tasks.length*100);return project.plan?30:0;}
