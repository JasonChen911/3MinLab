import type {DataRow} from '../workbench/model';
/** Future authenticated backend boundary. The local app does not fake remote sync. */
export interface ExecutionGateway {
 getCapabilities():Promise<{remoteSync:boolean;selfRegistration:boolean;authenticated:boolean}>;
 listMyTasks(activityId:string):Promise<DataRow[]>;
 updateTask(activityId:string,taskId:string,status:string,revision:number):Promise<void>;
 register(activityId:string,fields:Record<string,string>):Promise<{registrationId:string}>;
 checkIn(activityId:string,token:string):Promise<{checkedAt:string}>;
}
export const executionBackendRequirements=['组织者与工作人员身份认证','按活动授权的读取和更新','服务端持久化与版本冲突检测','签到令牌过期/撤销与防重放','HTTPS 和最小化个人信息','实时订阅或可重试轮询'] as const;
