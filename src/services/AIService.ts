export async function aiRequest<T=Record<string,unknown>>(path:string,body:unknown,signal?:AbortSignal):Promise<T>{
 const response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.any([AbortSignal.timeout(65000),...(signal?[signal]:[])])});
 const data=await response.json().catch(()=>({error:'服务返回格式错误'}));if(!response.ok)throw new Error(data.error||'AI 服务请求失败');return data;
}
export type AITask='analyzeActivity'|'reviseActivity'|'generateDocuments'|'recommendStaff'|'analyzeRisks'|'generateEmergencyPlan'|'explainSimulation'|'reviewActivity';
const task=(name:AITask)=>(context:unknown,signal?:AbortSignal)=>aiRequest<{text:string}>('/api/ai/task',{task:name,context},signal);
export const AIService={analyzeActivity:task('analyzeActivity'),reviseActivity:task('reviseActivity'),generateDocuments:task('generateDocuments'),recommendStaff:task('recommendStaff'),analyzeRisks:task('analyzeRisks'),generateEmergencyPlan:task('generateEmergencyPlan'),explainSimulation:task('explainSimulation'),reviewActivity:task('reviewActivity')};
