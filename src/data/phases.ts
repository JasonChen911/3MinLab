import type { FamilyId } from '../types';

/* ============================================================
 * 执行时间轴：六个阶段的标准任务模板
 *
 * 任务不写死负责人姓名，而是写「角色提示」（lead/content/...），
 * 生成时再映射到该场活动真实存在的岗位，避免出现活动里没有的岗位。
 * due 使用相对令牌，生成时按活动日期换算成真实日期。
 * ============================================================ */

export type PhaseId = 'prep' | 'promote' | 'check' | 'run' | 'wrap' | 'review';

export type RoleHint = 'lead' | 'content' | 'promotion' | 'logistics' | 'safety' | 'tech';

export type DueToken = 'T-30' | 'T-21' | 'T-14' | 'T-7' | 'T-3' | 'T-1' | 'D' | 'D-2h' | 'D-start' | 'D-end' | 'D+2h' | 'T+2' | 'T+7';

export interface PhaseTask {
  task: string;
  owner: RoleHint;
  due: DueToken;
  /** 该任务需要的资源（与物资/文件对应） */
  resources: string;
}

export interface PhaseMeta {
  id: PhaseId;
  label: string;
  summary: string;
  tasks: PhaseTask[];
}

export const PHASES: PhaseMeta[] = [
  {
    id: 'prep',
    label: '一、活动筹备',
    summary: '把目标、场地、预算与核心资源先锁定，避免边做边改',
    tasks: [
      { task: '明确活动目标与验收指标，输出一页纸方案', owner: 'lead', due: 'T-30', resources: '方案文档、目标指标表' },
      { task: '完成场地踏勘与预订，确认电力、消防、疏散与备用场地', owner: 'logistics', due: 'T-30', resources: '场地合同、踏勘清单' },
      { task: '编制预算并完成审批，锁定大额供应商', owner: 'lead', due: 'T-25' as DueToken, resources: '预算表、比价单' },
      { task: '组建筹备组，明确岗位、汇报关系与联络表', owner: 'lead', due: 'T-21', resources: '岗位表、通讯录' },
      { task: '确定主视觉与物料清单，启动设计与制作', owner: 'content', due: 'T-21', resources: '主视觉、物料清单' },
    ],
  },
  {
    id: 'promote',
    label: '二、宣传招募',
    summary: '报名通道、渠道排期与名单确认，决定现场到场率',
    tasks: [
      { task: '上线报名通道，发布首轮预告', owner: 'promotion', due: 'T-21', resources: '报名表单、海报' },
      { task: '按渠道排期投放（公众号/社群/短视频/合作方）', owner: 'promotion', due: 'T-14', resources: '渠道排期表、投放素材' },
      { task: '每周复盘报名数据，定向补量', owner: 'promotion', due: 'T-10' as DueToken, resources: '报名数据表' },
      { task: '报名截止，确认最终名单与候补名单', owner: 'promotion', due: 'T-7', resources: '名单、候补表' },
      { task: '发送参与指南并做二次确认', owner: 'promotion', due: 'T-1', resources: '短信模板、参与指南' },
    ],
  },
  {
    id: 'check',
    label: '三、前期检查',
    summary: '物资、人员、设备与安全四项逐条打勾，问题在进场前解决',
    tasks: [
      { task: '物资到货验收与缺件补货，贴标分区', owner: 'logistics', due: 'T-7', resources: '物资清单、验收单' },
      { task: '工作人员与志愿者培训，明确岗位与应急流程', owner: 'lead', due: 'T-5' as DueToken, resources: '培训材料、岗位手册' },
      { task: '全流程彩排与设备联调，确定备用方案', owner: 'tech', due: 'T-2' as DueToken, resources: '流程表、设备清单' },
      { task: '安全排查：通道、用电、医疗点、天气与限流', owner: 'safety', due: 'T-1', resources: '安全检查表、应急包' },
      { task: '嘉宾/供应商最终确认，签署到场确认', owner: 'content', due: 'T-1', resources: '确认函、联络表' },
    ],
  },
  {
    id: 'run',
    label: '四、正式执行',
    summary: '按流程表推进，每小时同步一次进度',
    tasks: [
      { task: '提前 2 小时到场布场，完成签到台、设备与指引就位', owner: 'logistics', due: 'D-2h', resources: '布场图、设备清单' },
      { task: '开始签到与引导，按流程表推进各环节', owner: 'content', due: 'D-start', resources: '签到表、流程表' },
      { task: '全场巡场与突发处理，保持指挥通道畅通', owner: 'lead', due: 'D', resources: '对讲机、应急包' },
      { task: '结束前 30 分钟准备收尾、合影与伴手礼', owner: 'content', due: 'D-end', resources: '合影点、伴手礼' },
      { task: '分批散场与清场，确认无人滞留', owner: 'safety', due: 'D-end', resources: '疏散指引、照明' },
    ],
  },
  {
    id: 'wrap',
    label: '五、活动收尾',
    summary: '当天完成清点、结算与记录，避免拖到第二天遗忘',
    tasks: [
      { task: '物资清点归还，场地恢复并验收', owner: 'logistics', due: 'D+2h', resources: '物资清单、验收单' },
      { task: '费用结算与票据归集，核对超支项', owner: 'lead', due: 'D+2h', resources: '票据、结算表' },
      { task: '医疗与安全事件记录归档', owner: 'safety', due: 'D+2h', resources: '事件记录表' },
      { task: '发布现场图文，感谢参与方与赞助方', owner: 'promotion', due: 'T+1' as DueToken, resources: '现场素材、通稿' },
    ],
  },
  {
    id: 'review',
    label: '六、后期总结',
    summary: '用数据说话，把经验变成下一届可直接复用的资产',
    tasks: [
      { task: '汇总数据：报名、到场、参与度、满意度、预算执行率', owner: 'lead', due: 'T+2', resources: '数据表、问卷结果' },
      { task: '召开复盘会：三个做得好的、三个必须改的', owner: 'lead', due: 'T+3' as DueToken, resources: '复盘模板' },
      { task: '输出结案报告与财务决算', owner: 'lead', due: 'T+7', resources: '结案报告、决算表' },
      { task: '素材归档与下届交接清单', owner: 'promotion', due: 'T+7', resources: '素材库、交接清单' },
    ],
  },
];

/** 不同活动族在执行阶段的关键差异任务 */
export const FAMILY_TASKS: Partial<Record<FamilyId, Partial<Record<PhaseId, PhaseTask[]>>>> = {
  campus: {
    prep: [{ task: '完成院系/社团报备与场地审批，确认指导教师', owner: 'lead', due: 'T-21', resources: '审批单、指导教师确认' }],
    promote: [{ task: '按班级/社团定向动员，指定联络员', owner: 'promotion', due: 'T-14', resources: '班级联络表、动员稿' }],
  },
  academic: {
    prep: [{ task: '征稿/评审与议程编排，确认讲者与主持人', owner: 'content', due: 'T-30', resources: '征稿启事、评审表、议程' }],
    check: [{ task: '论文集/手册定稿印刷，核对讲者姓名与单位', owner: 'logistics', due: 'T-7', resources: '论文集、胸牌' }],
  },
  sports: {
    prep: [
      { task: '完成赛事报批、赛道/场地封控方案与医疗点设置', owner: 'safety', due: 'T-21', resources: '报批材料、赛道图、医疗点位图' },
    ],
    check: [{ task: '器材、计时记分与 AED 逐项测试，确认替补器材', owner: 'tech', due: 'T-2' as DueToken, resources: '器材清单、测试记录' }],
    run: [{ task: '医疗点与收容车全程值守，记录处置情况', owner: 'safety', due: 'D', resources: '急救包、AED、转运车辆' }],
  },
  charity: {
    prep: [{ task: '对接服务对象与社区，确认需求清单与服务名单', owner: 'content', due: 'T-14', resources: '需求清单、服务名单' }],
    check: [{ task: '志愿者分组与岗前培训，签署服务承诺与保险', owner: 'lead', due: 'T-3', resources: '培训材料、保险名单' }],
    run: [{ task: '服务记录与物资签收，留存影像授权凭证', owner: 'logistics', due: 'D', resources: '服务记录表、签收单' }],
  },
  business: {
    prep: [{ task: '嘉宾邀约与议程确认，锁定媒体与直播资源', owner: 'content', due: 'T-21', resources: '邀请函、议程、媒体名单' }],
    check: [{ task: '签到系统、LED 与直播全链路联调', owner: 'tech', due: 'T-1', resources: '签到系统、备用电脑' }],
    run: [{ task: '媒体接待与专访安排，统一对外口径', owner: 'promotion', due: 'D', resources: '采访间、通稿' }],
  },
  startup: {
    prep: [{ task: '评委邀约与赛制发布，确认评分表与回避规则', owner: 'content', due: 'T-21', resources: '评分表、评委确认函' }],
    check: [{ task: '路演文件收集与统一测试，准备备份', owner: 'tech', due: 'T-1', resources: '演示文件、备用电脑' }],
  },
  arts: {
    prep: [{ task: '节目征集与阵容确认，完成报批与版权核查', owner: 'content', due: 'T-21', resources: '节目单、授权凭证、报批材料' }],
    check: [{ task: '舞台灯光音响与视频全流程调试，确认 cue 表', owner: 'tech', due: 'T-2' as DueToken, resources: '技术清单、cue 表' }],
    run: [{ task: '后台 cue 与换场管理，控制换场在 15 分钟内', owner: 'content', due: 'D', resources: 'cue 表、对讲机' }],
  },
  education: {
    prep: [{ task: '课程与教具设计，完成实验风险评估', owner: 'content', due: 'T-21', resources: '课程材料、风险评估表' }],
    check: [{ task: '实验器材与防护用品测试，确认家长知情同意', owner: 'safety', due: 'T-2' as DueToken, resources: '器材、防护用品、同意书' }],
  },
  career: {
    prep: [{ task: '企业邀约与岗位表收集，审核企业资质', owner: 'content', due: 'T-30', resources: '岗位表、资质材料' }],
    check: [{ task: '展位搭建验收与动线演练，确认消防通道', owner: 'logistics', due: 'T-1', resources: '展位图、验收单' }],
  },
  social: {
    prep: [{ task: '确认场地、餐食与人数，收取定金或接龙确认', owner: 'logistics', due: 'T-14', resources: '菜单、定金记录' }],
    review: [{ task: '公示账单与费用分摊，退回剩余款项', owner: 'lead', due: 'T+1' as DueToken, resources: '账单、分摊表' }],
  },
};
