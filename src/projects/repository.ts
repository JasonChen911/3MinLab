import { uid } from '../workbench/model';
import { loadWorkspace, WORKSPACE_PREFIX } from '../workbench/storage';
import { STORAGE_KEY, loadLocalState, saveLocalState } from '../services/storage';
import type { EventBrief, EventPlan } from '../types';
import type { Workspace } from '../workbench/model';
import type { ActivityProject, AttachmentMeta, ProjectRepository, StoredAttachment } from './model';
export const PROJECT_DB='activity-projects-v1';
export class IndexedProjectRepository implements ProjectRepository {
  private connection:Promise<IDBDatabase>|undefined;
  constructor(private factory:IDBFactory|undefined=globalThis.indexedDB,private name=PROJECT_DB){}
  private db() {
    if(!this.factory)return Promise.reject(new Error('浏览器不支持 IndexedDB，活动项目未保存。请更换浏览器或导出备份。'));
    if(!this.connection)this.connection=new Promise<IDBDatabase>((resolve,reject)=>{const req=this.factory!.open(this.name,1);req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains('projects'))db.createObjectStore('projects',{keyPath:'id'});if(!db.objectStoreNames.contains('files'))db.createObjectStore('files',{keyPath:'id'}).createIndex('activityId','activityId');};req.onsuccess=()=>{req.result.onversionchange=()=>{req.result.close();this.connection=undefined;};resolve(req.result);};req.onerror=()=>{this.connection=undefined;reject(new Error('无法打开活动数据库，请检查浏览器存储权限。'));};req.onblocked=()=>reject(new Error('数据库升级被其他页面阻止，请关闭旧页面后重试。'));});
    return this.connection;
  }
  async list() {const db=await this.db();return new Promise<ActivityProject[]>((resolve,reject)=>{const tx=db.transaction('projects');const req=tx.objectStore('projects').getAll();req.onsuccess=()=>resolve((req.result as ActivityProject[]).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)));req.onerror=()=>reject(req.error);});}
  async get(id:string) {const db=await this.db();return new Promise<ActivityProject|undefined>((resolve,reject)=>{const req=db.transaction('projects').objectStore('projects').get(id);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
  async update(id:string,change:(current:ActivityProject|undefined)=>ActivityProject) {
    const db=await this.db();return new Promise<ActivityProject>((resolve,reject)=>{const tx=db.transaction('projects','readwrite');const store=tx.objectStore('projects');let next:ActivityProject;
      const req=store.get(id);req.onsuccess=()=>{try{next=change(req.result);if(next.id!==id||next.schema!==1)throw new Error('项目编号或数据版本无效');next.updatedAt=new Date().toISOString();store.put(next);}catch(error){tx.abort();reject(error);}};
      tx.oncomplete=()=>{if(typeof window!=='undefined')window.dispatchEvent(new Event('activity-projects-changed'));resolve(next);};tx.onerror=()=>reject(new Error('保存活动失败：存储空间不足或权限受限，请导出备份。'));tx.onabort=()=>reject(new Error('活动写入事务未完成，请重试。'));
    });
  }
  async remove(id:string) {const db=await this.db();await new Promise<void>((resolve,reject)=>{const tx=db.transaction(['projects','files'],'readwrite');tx.objectStore('projects').delete(id);const store=tx.objectStore('files');const req=store.index('activityId').getAllKeys(id);req.onsuccess=()=>req.result.forEach(key=>store.delete(key));tx.oncomplete=()=>resolve();tx.onerror=()=>reject(new Error('删除活动失败，原始数据保留'));});}
  async getFile(id:string) {const db=await this.db();return new Promise<StoredAttachment|undefined>((resolve,reject)=>{const req=db.transaction('files').objectStore('files').get(id);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
  async saveFile(meta:AttachmentMeta,blob:Blob) {const db=await this.db();await new Promise<void>((resolve,reject)=>{const tx=db.transaction(['projects','files'],'readwrite');const projects=tx.objectStore('projects');const req=projects.get(meta.activityId);req.onsuccess=()=>{const project=req.result as ActivityProject|undefined;if(!project){tx.abort();return;}tx.objectStore('files').put({id:meta.id,activityId:meta.activityId,blob});projects.put({...project,attachments:[...project.attachments.filter(item=>item.id!==meta.id),meta],updatedAt:new Date().toISOString()});};tx.oncomplete=()=>resolve();tx.onerror=()=>reject(new Error('文件保存失败，可能是存储空间不足'));tx.onabort=()=>reject(new Error('活动不存在或文件保存被中止'));});}
  async deleteFile(activityId:string,id:string) {const db=await this.db();await new Promise<void>((resolve,reject)=>{const tx=db.transaction(['projects','files'],'readwrite');const store=tx.objectStore('projects');const req=store.get(activityId);req.onsuccess=()=>{const project=req.result as ActivityProject|undefined;if(project)store.put({...project,attachments:project.attachments.filter(item=>item.id!==id),updatedAt:new Date().toISOString()});tx.objectStore('files').delete(id);};tx.oncomplete=()=>resolve();tx.onerror=()=>reject(new Error('文件删除失败'));});}
}
export const projectRepository=new IndexedProjectRepository();
export function createProject(id:string,draft:EventBrief):ActivityProject {const now=new Date().toISOString();return {schema:1,id,name:draft.title||draft.idea.slice(0,40)||'未命名活动',categoryId:draft.categoryId,status:'草稿',stage:'intake',draft,createdAt:now,updatedAt:now,attachments:[],chat:[],versions:[]};}
export async function saveProjectParts(id:string,parts:{draft:EventBrief;plan?:EventPlan;workspace?:Workspace;stage?:ActivityProject['stage']},repository:ProjectRepository=projectRepository) {
  return repository.update(id,current=>{const next={...(current??createProject(id,parts.draft)),...parts};next.name=(parts.stage==='intake'?parts.draft.title:parts.plan?.title)||parts.draft.title||next.name;next.categoryId=parts.draft.categoryId;
  if(current?.plan&&parts.plan&&(['people','budget','date','durationMinutes','venue'] as const).some(key=>current.plan!.brief[key]!==parts.plan!.brief[key])){
    next.versions=[...current.versions,{id:uid(),createdAt:new Date().toISOString(),reason:'组织者更新基本需求并重新生成方案',source:'user' as const,before:{plan:current.plan,draft:current.draft,workspace:current.workspace},afterSummary:[`人数 ${current.plan.brief.people} → ${parts.plan.brief.people}`,`预算 ${current.plan.brief.budget} → ${parts.plan.brief.budget}`,`日期 ${current.plan.brief.date} → ${parts.plan.brief.date}`],documentChanges:['关联文档按依赖标记更新，手工文档不自动覆盖']}].slice(-20);
  }
if(parts.workspace)next.status=(parts.workspace.profile.status as ActivityProject['status'])||next.status;else if(parts.plan&&next.status==='草稿')next.status='筹备中';return next;});
}
export async function migrateLegacyProjects(repository:ProjectRepository=projectRepository,storage:Storage=localStorage) {
  const legacy=loadLocalState(storage).data;const plans=[legacy.recent,...legacy.history,...legacy.favorites].filter((plan):plan is EventPlan=>!!plan);const unique=new Map(plans.map(plan=>[plan.id,plan]));
  for(const plan of unique.values())if(!(await repository.get(plan.id))){const workspace=loadWorkspace(plan,storage);await saveProjectParts(plan.id,{draft:plan.brief,plan,workspace:workspace.error?undefined:workspace.data,stage:'plan'},repository);}
}
export async function copyProject(project:ActivityProject,repository:ProjectRepository=projectRepository) {
  const copied=structuredClone(project);const id=uid();copied.id=id;copied.name=`${project.name}（副本）`;copied.status='草稿';copied.createdAt=new Date().toISOString();copied.updatedAt=copied.createdAt;copied.draft.title=copied.name;copied.versions=[];copied.attachments=[];
  if(copied.plan){copied.plan.id=id;copied.plan.title=copied.name;copied.plan.brief.title=copied.name;}
  if(copied.workspace){copied.workspace.activityId=id;copied.workspace.profile.status='草稿';copied.workspace.documents=copied.workspace.documents.map(doc=>({...doc,id:uid(),activityId:id}));}
  await repository.update(id,()=>copied);
  for(const meta of project.attachments){const file=await repository.getFile(meta.id);if(file)await repository.saveFile({...meta,id:uid(),activityId:id},file.blob);}
  return (await repository.get(id))!;
}
export function removeLegacyReferences(id:string,storage:Storage=localStorage) {const {data}=loadLocalState(storage);saveLocalState({recent:data.recent?.id===id?null:data.recent,history:data.history.filter(plan=>plan.id!==id),favorites:data.favorites.filter(plan=>plan.id!==id)},storage);storage.removeItem(WORKSPACE_PREFIX+id);if(storage.getItem('activity-current-project-v1')===id)storage.removeItem('activity-current-project-v1');}
export const LEGACY_PLAN_KEY=STORAGE_KEY;
