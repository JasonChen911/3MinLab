import type { EventPlan } from '../types';

export const EMERGENCIES = [
  { id: 'rain', name: '突遇降雨 / 高温', actions: ['暂停受天气影响的户外环节，停止人员进入暴露区域', '现场负责人核实室内备用场地容量、疏散通道和设备条件后，决定转场或延期', '通知参与者新的集合点；物资组转移电器、遮盖物料并排查积水与用电'], flow: '户外环节暂缓；备用场地确认后重排签到、互动和散场顺序。', risk: '天气恶化与转场拥堵：设专人引导，未确认安全前不恢复户外活动。' },
  { id: 'venue', name: '场地临时不可用', actions: ['暂停入场，联系场地方确认恢复时间和替代空间', '核实备用场地容量、无障碍通行、消防和设备条件，不默认可直接使用', '负责人确认转场、线上或延期方案后，统一发布新地址与交通指引'], flow: '场地确认前暂停签到；取消依赖原场地的布置与演示，重新确认开场时间。', risk: '参与者走错场地或滞留：原地址留引导员，逐一通知嘉宾、供应商和参与者。' },
  { id: 'staff', name: '工作人员临时缺席', actions: ['核实缺席岗位与在岗人员，先保障安全、医疗、签到和现场指挥岗位', '由负责人安排经过培训的候补交接，记录新的责任人和联络方式', '无法补足关键岗位时合并非必要环节、限流或暂停对应服务，不让无资质人员顶替专业岗位'], flow: '缩减非必要并行环节，按实际在岗人员重新安排轮班和交接。', risk: '一人多岗导致失守：安全岗位不得兼顾冲突任务，逐岗确认到位后再启动。' },
  { id: 'equipment', name: '音响 / 投影故障', actions: ['暂停故障设备使用，由技术人员隔离故障并检查供电与接线', '测试备用设备；不具备替代条件时切换口头讲解、小组交流或纸质材料', '主持人告知调整安排，技术负责人确认恢复后再接入主流程'], flow: '将依赖音响或屏幕的环节暂缓，先进行不依赖设备的交流与互动。', risk: '触电与抢修风险：禁止非专业人员带电拆修，保持线缆区域隔离。' },
  { id: 'delay', name: '嘉宾迟到 / 流程延误', actions: ['联络嘉宾确认预计到场时间，由主持人与总协调确定环节顺序', '先开展签到、交流或问答，压缩非核心串场并保留必要休息与安全检查', '向参与者和供应商同步更新时间表，确认场地最晚结束时间'], flow: '将迟到嘉宾环节后移；在场地允许的结束时间内重排，无法安排时明确取消并通知。', risk: '超时导致场地与交通冲突：不得默认延长租期，提前确认返程和供应商安排。' },
] as const;
export type EmergencyId = typeof EMERGENCIES[number]['id'];

/** 追加应急安排，保留所有已编辑内容；只有确认应用才写入方案。 */
export function applyEmergency(plan: EventPlan, id: EmergencyId, detail: string): EventPlan {
  const scenario = EMERGENCIES.find((item) => item.id === id);
  if (!scenario) return plan;
  const title = `突发调整：${scenario.name}`;
  return { ...plan, modules: plan.modules.map((module) => {
    if (module.id === 'execution') return { ...module, blocks: [...module.blocks, {
      kind: 'table' as const, title,
      head: ['顺序', '处置行动', '负责人 / 完成情况'],
      rows: scenario.actions.map((action, index) => [String(index + 1), action, '现场负责人确认并指派']),
    }, ...(detail.trim() ? [{ kind: 'text' as const, text: `现场补充：${detail.trim().slice(0, 300)}` }] : [])] };
    if (module.id === 'program') return { ...module, blocks: [...module.blocks, { kind: 'bullets' as const, title, items: [scenario.flow] }] };
    if (module.id === 'risk') return { ...module, blocks: [...module.blocks, { kind: 'bullets' as const, title, items: [scenario.risk] }] };
    return module;
  }) };
}
