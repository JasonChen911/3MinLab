import type {EventPlan,ModuleId} from '../types';import type {Workspace} from '../workbench/model';import {uid} from '../workbench/model';import {projectRepository} from '../projects/repository';import type {ProjectRepository} from '../projects/model';import {applyProposal,adjustmentFingerprint,type AdjustmentProposal} from './service';
export async function acceptAdjustment(id:string,plan:EventPlan,workspace:Workspace,proposal:AdjustmentProposal,selected:string[],overwrite:ModuleId[],repository:ProjectRepository=projectRepository) {
 const result=applyProposal(plan,workspace,proposal,selected,overwrite);
 const project=await repository.update(id,current=>{
  if(!current)throw new Error('请先保存当前活动');
  if(current.plan&&JSON.stringify(current.plan)!==JSON.stringify(plan))throw new Error('活动已被其他操作修改，请重新打开预览');
  if(current.workspace&&JSON.stringify(current.workspace)!==JSON.stringify(workspace))throw new Error('活动资料已更新，请重新生成预览');
  const version={id:uid(),createdAt:new Date().toISOString(),reason:proposal.request,source:'assistant' as const,before:{plan:structuredClone(plan),draft:structuredClone(plan.brief),workspace:structuredClone(workspace)},afterSummary:result.summary,documentChanges:result.documentChanges,afterFingerprint:adjustmentFingerprint(result.plan,result.workspace)};
  return {...current,plan:result.plan,draft:result.plan.brief,workspace:result.workspace,pendingAdjustment:undefined,versions:[...current.versions,version].slice(-20),chat:[...current.chat,{id:uid(),role:'assistant',source:proposal.source,text:`已确认应用：${result.summary.join('；')}`,createdAt:new Date().toISOString()}]};
 });return project;
}
export async function undoAdjustment(id:string,force=false,repository:ProjectRepository=projectRepository) {
 return repository.update(id,current=>{if(!current)throw new Error('活动不存在');const version=[...current.versions].reverse().find(item=>!item.undoneAt);if(!version)throw new Error('没有可撤销的修改');
  if(!force&&version.afterFingerprint&&current.plan&&current.workspace&&adjustmentFingerprint(current.plan,current.workspace)!==version.afterFingerprint)throw new Error('该调整后还有其他编辑，直接恢复会覆盖后续编辑。请先备份，再明确确认恢复。');
  return {...current,plan:structuredClone(version.before.plan),draft:structuredClone(version.before.draft),workspace:structuredClone(version.before.workspace),stage:version.before.plan?'plan':'intake',pendingAdjustment:undefined,attachments:version.before.attachments?current.attachments.map(file=>({...file,importedInto:version.before.attachments?.find(old=>old.id===file.id)?.importedInto})):current.attachments,versions:current.versions.map(item=>item.id===version.id?{...item,undoneAt:new Date().toISOString()}:item),chat:[...current.chat,{id:uid(),role:'assistant',source:'system',text:`已撤销：${version.reason}`,createdAt:new Date().toISOString()}]};});
}
