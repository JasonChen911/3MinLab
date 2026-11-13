import type { Scene } from './model';
/** Relative risk weights are explicit demo assumptions, not observed frequencies. */
export const SCENARIO_MODELS:Record<Scene,{equipment:string;area:string;equipmentFactor:number;supplyFactor:number;dwell:number;essentialEquipment:boolean}>={
 athletics:{equipment:'计时设备',area:'赛场',equipmentFactor:1.1,supplyFactor:1,dwell:.85,essentialEquipment:true},
 sports:{equipment:'比赛记分设备',area:'球场',equipmentFactor:.8,supplyFactor:1,dwell:.85,essentialEquipment:true},
 performance:{equipment:'音响',area:'舞台',equipmentFactor:1.5,supplyFactor:.6,dwell:.9,essentialEquipment:true},
 conference:{equipment:'投影设备',area:'报告厅',equipmentFactor:1,supplyFactor:.4,dwell:.9,essentialEquipment:true},
 business:{equipment:'音视频设备',area:'会议区',equipmentFactor:1.1,supplyFactor:.6,dwell:.8,essentialEquipment:true},
 charity:{equipment:'服务设备',area:'服务区',equipmentFactor:.3,supplyFactor:1.6,dwell:.3,essentialEquipment:false},
 competition:{equipment:'展示设备',area:'路演区',equipmentFactor:1.2,supplyFactor:.7,dwell:.8,essentialEquipment:true},
 community:{equipment:'扩音设备',area:'文化广场',equipmentFactor:.6,supplyFactor:1.2,dwell:.4,essentialEquipment:false},
 custom:{equipment:'主活动设备',area:'主活动区',equipmentFactor:1,supplyFactor:1,dwell:.75,essentialEquipment:false},
};
