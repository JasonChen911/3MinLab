import type { ScaleTier, VenueKind } from '../types';

/* ============================================================
 * 策划知识库
 *
 * 结构分两层：
 *   1) FAMILY_KNOWLEDGE —— 大类族共有的议程、预算结构、角色、风险、KPI；
 *   2) CATEGORY_KNOWLEDGE —— 具体活动类型的覆盖项（真正的差异化内容）。
 *
 * 生成器只做"取数 + 按规模/预算/时长折算"，不把文案写死在逻辑里，
 * 便于后续继续扩充活动类型而不用改引擎。
 * ============================================================ */

export interface KnowledgeContext {
  people: number;
  budget: number;
  duration: number;
  days: number;
  outdoor: boolean;
  venue: VenueKind;
  scale: ScaleTier;
  categoryLabel: string;
}

export interface AgendaSegment {
  name: string;
  /** 占单日总时长的比例，同组内合计约 1 */
  share: number;
  detail: string;
}

export interface BudgetTemplateLine {
  category: string;
  item: string;
  ratio: number;
  note: string;
}

export interface RoleTemplate {
  role: string;
  fixed: number;
  /** 每 N 名参与者增加 1 人，0 表示不随人数增长 */
  perPeople: number;
  min: number;
  max: number;
  duty: string;
}

export interface RiskTemplate {
  title: string;
  cause: string;
  likelihood: 1 | 2 | 3;
  impact: 1 | 2 | 3;
  mitigation: string;
  contingency: string;
  owner: string;
}

export interface KpiTemplate {
  name: string;
  target: (ctx: KnowledgeContext) => string;
  method: string;
}

export interface FamilyKnowledge {
  agenda: AgendaSegment[];
  budget: BudgetTemplateLine[];
  roles: RoleTemplate[];
  risks: RiskTemplate[];
  kpis: KpiTemplate[];
  channels: string[];
  resources: string[];
  interactions: string[];
  evaluation: string[];
  notes: string[];
}

export interface CategoryKnowledge {
  agenda?: AgendaSegment[];
  budget?: BudgetTemplateLine[];
  roles?: RoleTemplate[];
  risks?: RiskTemplate[];
  kpis?: KpiTemplate[];
  resources?: string[];
  interactions?: string[];
  notes?: string[];
}

const pct = (value: number) => `${Math.round(value * 100)}%`;

/* ============================================================
 * 一、大类族知识
 * ============================================================ */

export const FAMILY_KNOWLEDGE: Record<string, FamilyKnowledge> = {
  campus: {
    agenda: [
      { name: '签到与引导', share: 0.15, detail: '分区签到、发放物料、引导入座或参观动线。' },
      { name: '开场暖场', share: 0.12, detail: '主持人开场、社团/学院风采展示，先把气氛抬起来。' },
      { name: '核心环节', share: 0.5, detail: '主题内容与互动体验，控制在参与者注意力窗口内。' },
      { name: '收尾与留资', share: 0.13, detail: '抽奖或合影、扫码进群、收集意向。' },
      { name: '散场与清理', share: 0.1, detail: '引导离场、物资清点、场地恢复。' },
    ],
    budget: [
      { category: '场地布置', item: '背景板、桌旗、指引牌', ratio: 0.22, note: '优先复用学院/社团库存，只做局部更新' },
      { category: '宣传物料', item: '海报、传单、线上投放', ratio: 0.18, note: '以学生自有渠道为主，付费投放控制在 1/3 以内' },
      { category: '设备租赁', item: '音响、投影、灯光', ratio: 0.15, note: '校内可借设备先登记，缺口再外租' },
      { category: '礼品纪念', item: '周边、奖品、纪念品', ratio: 0.18, note: '按实际到场人数备货，不按报名数' },
      { category: '餐饮茶歇', item: '饮用水、茶点', ratio: 0.12, note: '按 80% 到场率准备' },
      { category: '应急机动', item: '不可预见支出', ratio: 0.15, note: '至少保留 10%，不得提前花掉' },
    ],
    roles: [
      { role: '总协调', fixed: 1, perPeople: 0, min: 1, max: 2, duty: '统一决策、对接校方、控制预算与进度' },
      { role: '现场执行', fixed: 2, perPeople: 80, min: 2, max: 12, duty: '流程推进、突发处理、各环节衔接' },
      { role: '宣传招募', fixed: 1, perPeople: 150, min: 1, max: 4, duty: '文案、渠道投放、报名管理与答疑' },
      { role: '物资后勤', fixed: 2, perPeople: 120, min: 2, max: 8, duty: '采购、搬运、布场与撤场' },
      { role: '机动志愿者', fixed: 2, perPeople: 60, min: 2, max: 20, duty: '引导、签到、补位' },
    ],
    risks: [
      { title: '到场人数低于预期', cause: '宣传不足、时间冲突、天气影响', likelihood: 2, impact: 2, mitigation: '提前 3 天确认报名、设置候补名单', contingency: '压缩互动规模、合并分组，物资按实际人数发放', owner: '宣传招募' },
      { title: '现场人流拥堵', cause: '签到口过少、动线设计不合理', likelihood: 2, impact: 2, mitigation: '按每 50 人 1 个签到口配置，设置单向动线', contingency: '开放备用入口、分批放行', owner: '现场执行' },
      { title: '设备故障', cause: '音响/投影未提前测试、接口不兼容', likelihood: 2, impact: 2, mitigation: '提前 1 天全套彩排，准备备用音频线', contingency: '切换备用设备、改为口令主持', owner: '物资后勤' },
      { title: '天气突变', cause: '户外环节遇雨或高温', likelihood: 2, impact: 3, mitigation: '查看 3 天预报，锁定室内备用场地', contingency: '启动室内方案或顺延 1 天', owner: '总协调' },
      { title: '物料不足或浪费', cause: '按报名数备货、未设领用登记', likelihood: 2, impact: 1, mitigation: '按 80% 到场率备货，设领用登记表', contingency: '就近补货，优先保障核心环节', owner: '物资后勤' },
    ],
    kpis: [
      { name: '实际到场人数', target: (c) => `${Math.round(c.people * 0.8)} 人以上（报名到场率 ≥80%）`, method: '签到表/扫码统计' },
      { name: '参与度', target: () => '≥70% 的参与者完成至少 1 次互动', method: '现场观察 + 互动记录' },
      { name: '满意度', target: () => '平均 ≥4.2 / 5', method: '散场二维码问卷（3 题）' },
      { name: '传播触达', target: (c) => `内容曝光 ≥ ${c.people * 3} 人次`, method: '公众号/社群阅读与转发数据' },
    ],
    channels: ['学院/社团公众号推文', '班级群与年级群转发', '校园墙与树洞投稿', '线下海报与易拉宝', '短视频平台同城话题', '合作社团互推'],
    resources: ['签到表/扫码工具', '背景板与指引牌', '音响与无线麦', '投影或 LED 屏', '桌椅与桌布', '饮用水与茶点', '垃圾袋与清洁工具', '应急医药包'],
    interactions: ['扫码签到抽盲盒', '现场打卡墙与合影框', '分组破冰小游戏', '实时投票/弹幕上墙', '集章兑奖动线'],
    evaluation: ['散场 3 题问卷（满意度、最有价值环节、改进建议）', '签到与报名数据对比分析', '工作人员复盘会（活动后 48 小时内）', '照片、推文与物料归档'],
    notes: ['涉及校外人员进场需提前报备', '使用校内场地需走场地审批', '抽奖活动需公示规则，避免内定争议'],
  },

  academic: {
    agenda: [
      { name: '签到与资料领取', share: 0.12, detail: '胸牌、会议手册、议程单，引导入座。' },
      { name: '开幕与致辞', share: 0.1, detail: '主办方致辞、嘉宾介绍、议程说明。' },
      { name: '主旨报告', share: 0.3, detail: '1–2 位主旨讲者，每位含 5 分钟提问。' },
      { name: '茶歇与交流', share: 0.1, detail: '茶歇区设交流位，安排引导话题。' },
      { name: '分论坛/论文交流', share: 0.28, detail: '并行分会场，每场 3–4 个报告 + 点评。' },
      { name: '总结与闭幕', share: 0.1, detail: '总结要点、感谢致辞、后续合作说明。' },
    ],
    budget: [
      { category: '嘉宾酬金', item: '主讲嘉宾酬金与差旅', ratio: 0.3, note: '提前确认税前/税后与报销口径' },
      { category: '场地会务', item: '会议室、茶歇区、引导', ratio: 0.2, note: '按半天的实际使用时段计费，避免整天包场' },
      { category: '餐饮茶歇', item: '茶歇、午餐', ratio: 0.15, note: '按确认出席人数 +10% 备餐' },
      { category: '资料印刷', item: '会议手册、论文集、胸牌', ratio: 0.1, note: '优先电子版，纸质只印给嘉宾与主持人' },
      { category: '设备租赁', item: '投影、话筒、录播', ratio: 0.1, note: '录播设备可复用学院资产' },
      { category: '宣传推广', item: '海报、网站、社群', ratio: 0.05, note: '以学术社群与邮件列表为主' },
      { category: '应急机动', item: '不可预见支出', ratio: 0.1, note: '预留用于临时增补嘉宾或延长场地' },
    ],
    roles: [
      { role: '会议主席', fixed: 1, perPeople: 0, min: 1, max: 1, duty: '把控学术质量与整体议程' },
      { role: '会务统筹', fixed: 1, perPeople: 100, min: 1, max: 6, duty: '场地、物料、餐饮、供应商对接' },
      { role: '学术秘书', fixed: 1, perPeople: 80, min: 1, max: 4, duty: '征稿、评审、议程编排与嘉宾联络' },
      { role: '现场主持', fixed: 2, perPeople: 150, min: 1, max: 6, duty: '分会场主持、控时与提问组织' },
      { role: '签到与接待', fixed: 2, perPeople: 100, min: 2, max: 8, duty: '签到、胸牌、引导与嘉宾接待' },
      { role: '技术支持', fixed: 1, perPeople: 200, min: 1, max: 4, duty: '投影、录音录像、线上会议' },
    ],
    risks: [
      { title: '嘉宾临时缺席或迟到', cause: '行程冲突、交通延误', likelihood: 2, impact: 3, mitigation: '提前 1 周确认行程，准备备选讲者', contingency: '调整议程顺序，用圆桌讨论填补时段', owner: '学术秘书' },
      { title: '议程超时', cause: '报告人超时、提问过多', likelihood: 3, impact: 2, mitigation: '每场设计时员，报告 20 分钟 + 提问 5 分钟', contingency: '压缩茶歇、顺延后续场次并广播说明', owner: '现场主持' },
      { title: '参会人数不足', cause: '征稿与宣传周期短', likelihood: 2, impact: 2, mitigation: '提前 4 周启动征稿与定向邀请', contingency: '合并分会场，改为圆桌形式', owner: '会务统筹' },
      { title: '设备或网络故障', cause: '临时场地设备老旧', likelihood: 2, impact: 2, mitigation: '提前半天进场测试，准备转接头与备用电脑', contingency: '切换备用设备，线上参会改为录播', owner: '技术支持' },
      { title: '论文/成果保密与版权', cause: '未明确录用与传播授权', likelihood: 1, impact: 3, mitigation: '征稿时明确版权与录制授权条款', contingency: '撤下相关内容并致歉说明', owner: '会议主席' },
    ],
    kpis: [
      { name: '有效参会人数', target: (c) => `${Math.round(c.people * 0.9)} 人`, method: '签到系统统计' },
      { name: '报告完成率', target: () => '100% 议程内报告按时完成', method: '现场计时记录' },
      { name: '学术产出', target: () => '收录/交流论文 ≥ 20 篇或形成 1 份会议纪要', method: '论文集与纪要' },
      { name: '满意度', target: () => '≥4.3 / 5', method: '会后问卷' },
    ],
    channels: ['学会/院系官网与邮件列表', '学术社群与同行转发', '征稿启事定向投递', '合作机构联合宣传', '会议网站与报名系统'],
    resources: ['投影与幕布', '无线麦与讲台', '签到系统/胸牌', '会议手册', '茶歇与饮用水', '录播设备', '指示牌与易拉宝'],
    interactions: ['报告后 5 分钟集中提问', '茶歇引导话题卡', '海报快闪展示（1 分钟/人）', '圆桌讨论与共识记录'],
    evaluation: ['会后问卷（内容质量、组织、场地）', '投稿与录用数据统计', '嘉宾与赞助方回访', '会议纪要归档与下一届交接'],
    notes: ['校外嘉宾进校需报备并办理门禁', '收取注册费需明确发票与退费规则', '录音录像需取得讲者书面同意'],
  },

  sports: {
    agenda: [
      { name: '检录与热身', share: 0.15, detail: '身份核验、号码发放、集体热身。' },
      { name: '开幕与规则说明', share: 0.1, detail: '队伍入场、裁判宣誓、安全提示。' },
      { name: '竞赛主体', share: 0.55, detail: '按赛程推进，裁判与计时同步记录。' },
      { name: '颁奖与合影', share: 0.1, detail: '成绩公示、颁奖、合影。' },
      { name: '收尾与场地恢复', share: 0.1, detail: '器材回收、场地检查、医疗记录归档。' },
    ],
    budget: [
      { category: '场地器材', item: '场地租赁、器材与球具', ratio: 0.2, note: '校内场地优先，外部场地按小时计价' },
      { category: '裁判计时', item: '裁判酬金、计时记分', ratio: 0.15, note: '按场次计酬，提前签确认单' },
      { category: '医疗保障', item: '医护人员、AED、急救包', ratio: 0.15, note: '不可压缩项，按人数配置' },
      { category: '物资补给', item: '饮用水、号码布、补给', ratio: 0.15, note: '按参赛人数 +20% 备水' },
      { category: '安保', item: '安保人员、隔离设施', ratio: 0.1, note: '大型活动需按公安要求报批' },
      { category: '奖品', item: '奖杯、奖牌、奖品', ratio: 0.1, note: '可寻求赞助以降低现金支出' },
      { category: '宣传', item: '海报、直播、摄影', ratio: 0.05, note: '摄影可招募学生志愿者' },
      { category: '应急机动', item: '不可预见支出', ratio: 0.1, note: '含天气改期、临时医疗转运' },
    ],
    roles: [
      { role: '总指挥', fixed: 1, perPeople: 0, min: 1, max: 2, duty: '整体调度、对外沟通、启动应急预案' },
      { role: '竞赛组', fixed: 3, perPeople: 50, min: 3, max: 30, duty: '赛程编排、检录、计时记分、成绩公示' },
      { role: '裁判组', fixed: 4, perPeople: 40, min: 4, max: 40, duty: '执裁、争议裁定、规则解释' },
      { role: '医疗组', fixed: 2, perPeople: 300, min: 2, max: 12, duty: '现场急救、转运对接、健康观察' },
      { role: '安保组', fixed: 2, perPeople: 150, min: 2, max: 30, duty: '入口管控、动线隔离、人流疏导' },
      { role: '后勤组', fixed: 2, perPeople: 100, min: 2, max: 15, duty: '器材、补给、场地布置与恢复' },
      { role: '宣传组', fixed: 1, perPeople: 300, min: 1, max: 6, duty: '摄影摄像、成绩发布、媒体对接' },
    ],
    risks: [
      { title: '运动损伤', cause: '热身不足、对抗激烈、场地湿滑', likelihood: 3, impact: 3, mitigation: '强制热身 10 分钟、场边设医疗点、配备 AED', contingency: '立即停止比赛、急救处置并送医，启动保险报案', owner: '医疗组' },
      { title: '高温/低温与天气', cause: '户外长时间暴晒或降雨', likelihood: 2, impact: 3, mitigation: '避开正午时段、设补水点、准备遮阳/雨棚', contingency: '调整赛程或延期，启用室内备用场地', owner: '总指挥' },
      { title: '赛程延误', cause: '项目超时、队伍迟到', likelihood: 3, impact: 2, mitigation: '每项目预留 10 分钟缓冲，设检录截止时间', contingency: '并行场地分流、压缩中场休息', owner: '竞赛组' },
      { title: '判罚争议', cause: '规则理解不一致、关键判罚', likelihood: 2, impact: 2, mitigation: '赛前规则宣讲、争议由裁判长终裁并记录', contingency: '调取录像复核，必要时重赛该回合', owner: '裁判组' },
      { title: '观众与选手混行', cause: '场地无隔离、出入口单一', likelihood: 2, impact: 3, mitigation: '设置隔离带与单向动线，观众区与赛道分离', contingency: '增派安保、暂停比赛疏导人流', owner: '安保组' },
      { title: '器材故障或缺失', cause: '未清点、临时借用', likelihood: 2, impact: 2, mitigation: '赛前 1 天全量清点并贴标，关键器材准备备件', contingency: '就近借用或调整赛制', owner: '后勤组' },
    ],
    kpis: [
      { name: '参赛规模', target: (c) => `${Math.round(c.people * 0.9)} 人实际参赛`, method: '检录系统统计' },
      { name: '完赛率', target: () => '≥85%', method: '计时系统/成绩表' },
      { name: '安全事故', target: () => '0 起重大事故，轻伤处置 ≤5 起', method: '医疗记录' },
      { name: '赛程准时率', target: () => '≥90% 场次按计划开赛', method: '赛程执行记录' },
      { name: '满意度', target: () => '≥4.0 / 5', method: '赛后问卷' },
    ],
    channels: ['体育社团与院系队伍群', '报名小程序/表单', '校园广播与公众号', '往届选手社群', '合作场馆与品牌联动'],
    resources: ['场地与赛道布置', '计时记分系统', '号码布与别针', '饮用水与补给', 'AED 与急救包', '隔离带与指示牌', '对讲机', '奖杯奖牌', '遮阳棚/雨棚'],
    interactions: ['赛前集体热身', '中场啦啦队/社团表演', '成绩实时公示屏', '完赛打卡与照片墙'],
    evaluation: ['成绩与赛程数据分析', '参赛者问卷（组织、场地、裁判）', '医疗与安保事件复盘', '赛事报告与下一届筹备建议'],
    notes: ['大型体育赛事需提前报公安与体育主管部门', '必须为参赛者购买意外险', '未成年人参赛需监护人签署同意书'],
  },

  charity: {
    agenda: [
      { name: '集合与培训', share: 0.15, detail: '签到、分组、服务规范与安全提示。' },
      { name: '服务启动', share: 0.1, detail: '与服务对象/社区对接，说明流程。' },
      { name: '服务实施', share: 0.55, detail: '按分工开展服务，记录服务对象反馈。' },
      { name: '分享与总结', share: 0.15, detail: '志愿者分享、问题汇总、合影。' },
      { name: '收尾与归档', share: 0.05, detail: '物资回收、服务记录与影像归档。' },
    ],
    budget: [
      { category: '服务物资', item: '直接用于服务对象的物资', ratio: 0.4, note: '占比不低于 35%，并保留采购凭证' },
      { category: '志愿者保障', item: '餐水、交通、保险', ratio: 0.2, note: '志愿者补贴需符合规定，不发现金红包' },
      { category: '场地', item: '活动场地与布置', ratio: 0.1, note: '优先申请社区/学校公益场地' },
      { category: '宣传招募', item: '招募海报、记录拍摄', ratio: 0.1, note: '服务对象肖像需单独授权' },
      { category: '管理与审计', item: '账目管理、公示制作', ratio: 0.05, note: '善款需专账管理、公开明细' },
      { category: '应急机动', item: '不可预见支出', ratio: 0.15, note: '含服务对象临时需求与物资补货' },
    ],
    roles: [
      { role: '项目负责人', fixed: 1, perPeople: 0, min: 1, max: 2, duty: '对接服务对象、统筹安全与合规' },
      { role: '志愿者领队', fixed: 2, perPeople: 20, min: 2, max: 15, duty: '分组带队、培训、考勤与情绪支持' },
      { role: '服务组', fixed: 4, perPeople: 10, min: 4, max: 80, duty: '直接提供服务、记录对象反馈' },
      { role: '物资与后勤', fixed: 2, perPeople: 40, min: 2, max: 10, duty: '物资采购、发放、回收与盘点' },
      { role: '宣传记录', fixed: 1, perPeople: 50, min: 1, max: 5, duty: '影像记录、推文、服务数据整理' },
    ],
    risks: [
      { title: '服务对象需求错配', cause: '未做前期调研、按想象设计服务', likelihood: 2, impact: 3, mitigation: '提前走访或电话确认需求清单', contingency: '现场调整服务内容，保留弹性物资', owner: '项目负责人' },
      { title: '志愿者安全与边界', cause: '服务场景复杂、缺乏培训', likelihood: 2, impact: 3, mitigation: '岗前培训、两人一组、购买意外险', contingency: '立即撤离并上报，安排心理支持', owner: '志愿者领队' },
      { title: '肖像与隐私泄露', cause: '拍摄未授权、信息登记不规范', likelihood: 2, impact: 3, mitigation: '拍摄前取得书面同意，隐去敏感信息', contingency: '撤下内容并致歉，销毁未授权素材', owner: '宣传记录' },
      { title: '善款与物资去向质疑', cause: '账目不清、公示不及时', likelihood: 2, impact: 3, mitigation: '专账管理、7 日内公示明细与凭证', contingency: '公开说明并接受第三方核查', owner: '项目负责人' },
      { title: '天气与场地变更', cause: '户外服务遇雨、社区临时闭馆', likelihood: 2, impact: 2, mitigation: '提前确认备用室内场地', contingency: '改期或转为入户服务', owner: '物资与后勤' },
    ],
    kpis: [
      { name: '服务人次', target: (c) => `${Math.round(c.people * 1.2)} 人次服务对象`, method: '服务登记表' },
      { name: '志愿者到岗率', target: () => '≥90%', method: '签到记录' },
      { name: '服务对象满意度', target: () => '≥4.3 / 5', method: '服务后口头/问卷回访' },
      { name: '物资到位率', target: () => '100% 按清单发放并签收', method: '物资签收单' },
    ],
    channels: ['志愿平台（志愿汇/志愿北京等）', '社区公告栏与居委会群', '高校公益社团群', '公众号服务纪实', '合作基金会与企业 CSR 渠道'],
    resources: ['服务物资清单', '志愿者马甲/工牌', '签到与考勤表', '急救包', '拍摄设备', '物资签收单', '饮用水与简餐'],
    interactions: ['服务对象心愿卡', '志愿者结对陪伴', '服务成果照片墙', '现场便民服务摊位'],
    evaluation: ['服务对象回访与满意度', '志愿者反馈与留存率', '物资与善款公示', '项目复盘与下期改进清单'],
    notes: ['募捐需具备公开募捐资格或与有资质机构合作', '服务对象个人信息按最小必要原则收集', '未成年人服务需监护人陪同或授权'],
  },

  business: {
    agenda: [
      { name: '签到与迎宾', share: 0.15, detail: '电子签到、胸牌、迎宾饮品与引导。' },
      { name: '开场', share: 0.1, detail: '主持人开场、主办方致辞、嘉宾介绍。' },
      { name: '主题内容', share: 0.35, detail: '主旨演讲/产品发布，配合演示与视频。' },
      { name: '茶歇与交流', share: 0.12, detail: '茶歇区、洽谈区、媒体采访位。' },
      { name: '圆桌/互动', share: 0.18, detail: '圆桌对话、Q&A、体验区。' },
      { name: '收尾与转化', share: 0.1, detail: '抽奖、合影、资料发放、销售跟进。' },
    ],
    budget: [
      { category: '场地', item: '场地租赁与基础服务', ratio: 0.25, note: '按半天计费，确认超时费用' },
      { category: '搭建与 AV', item: '舞台、LED、音响、灯光', ratio: 0.25, note: '搭建方案需提前审图与消防报备' },
      { category: '餐饮', item: '茶歇、午餐、酒会', ratio: 0.15, note: '按确认出席人数 +10% 备餐' },
      { category: '嘉宾', item: '讲师酬金、差旅接待', ratio: 0.15, note: '明确税前税后与发票要求' },
      { category: '宣传媒体', item: '媒体邀约、直播、物料', ratio: 0.1, note: '预留媒体车马费与通稿费用' },
      { category: '物料礼品', item: '伴手礼、手册、胸牌', ratio: 0.07, note: '伴手礼按 VIP 与普通观众分级' },
      { category: '应急机动', item: '不可预见支出', ratio: 0.03, note: '商业活动超支多来自搭建与餐饮' },
    ],
    roles: [
      { role: '项目总监', fixed: 1, perPeople: 0, min: 1, max: 2, duty: '对客户/管理层负责，控制预算与关键节点' },
      { role: '会务统筹', fixed: 2, perPeople: 100, min: 2, max: 10, duty: '场地、搭建、供应商、餐饮协调' },
      { role: '嘉宾接待', fixed: 2, perPeople: 80, min: 2, max: 10, duty: '行程、接送、休息室、伴手礼' },
      { role: '签到与引导', fixed: 3, perPeople: 80, min: 3, max: 15, duty: '电子签到、胸牌、动线引导' },
      { role: '媒体与传播', fixed: 1, perPeople: 150, min: 1, max: 6, duty: '媒体邀约、采访安排、直播与通稿' },
      { role: '技术支持', fixed: 2, perPeople: 150, min: 2, max: 8, duty: 'AV 调试、PPT 播放、备用方案' },
      { role: '安保与应急', fixed: 1, perPeople: 200, min: 1, max: 8, duty: '入口管控、消防通道、突发事件' },
    ],
    risks: [
      { title: '演示/设备故障', cause: '未彩排、接口不兼容、网络不稳', likelihood: 3, impact: 3, mitigation: '全流程彩排 1 次，准备备用电脑与离线视频', contingency: '切换备用设备，主持人用讲稿过渡', owner: '技术支持' },
      { title: '关键嘉宾缺席', cause: '行程变更、航班延误', likelihood: 2, impact: 3, mitigation: '提前确认并准备备选讲者/录播', contingency: '调整议程，改为连线或圆桌', owner: '嘉宾接待' },
      { title: '现场人数超员', cause: '报名审核不严、临时到访', likelihood: 2, impact: 3, mitigation: '实名预约、按场地容量 80% 放票', contingency: '启用备用区，协调消防与安保', owner: '安保与应急' },
      { title: '负面舆情/媒体提问失控', cause: '敏感话题、现场采访无准备', likelihood: 2, impact: 3, mitigation: '准备 Q&A 口径，指定唯一发言人', contingency: '引导至专访，会后统一回应', owner: '媒体与传播' },
      { title: '搭建与消防不合规', cause: '临时更改结构、材料不合规', likelihood: 2, impact: 3, mitigation: '搭建图审、材料阻燃证明、预留消防通道', contingency: '现场整改，必要时拆除部分结构', owner: '会务统筹' },
      { title: '预算超支', cause: '临时增项、供应商加价', likelihood: 2, impact: 2, mitigation: '合同锁定单价，变更走书面审批', contingency: '压缩非核心项（礼品、餐饮升级）', owner: '项目总监' },
    ],
    kpis: [
      { name: '到场率', target: (c) => `≥${pct(0.8)}（${Math.round(c.people * 0.8)} 人）`, method: '电子签到数据' },
      { name: '内容传播', target: () => '媒体报道 ≥5 篇，直播观看 ≥1 万人次', method: '媒体监测与直播后台' },
      { name: '商务转化', target: () => '有效线索 ≥30 条，会后 7 日内完成首轮跟进', method: 'CRM 线索登记' },
      { name: '嘉宾与客户满意度', target: () => '≥4.5 / 5', method: 'VIP 回访' },
    ],
    channels: ['客户与合作伙伴定向邀请', '行业媒体与 KOL', '企业公众号/视频号/官网', '行业协会与商会渠道', '电梯/户外广告（视预算）', '直播平台同步'],
    resources: ['签到系统与胸牌', 'LED 屏与音响', '舞台搭建', '直播设备', '茶歇与酒会', '伴手礼', '指引与易拉宝', '对讲机', '备用电源'],
    interactions: ['产品体验区', '圆桌对话与现场提问', '抽奖与签约仪式', '媒体专访间', '社交合影墙'],
    evaluation: ['签到与报名数据', '媒体曝光与传播报告', '客户/嘉宾回访', '结案报告（含成本与转化）'],
    notes: ['大型群众性活动需按当地规定备案', '搭建与消防需符合场馆要求', '直播与拍摄需明确肖像与版权授权'],
  },

  startup: {
    agenda: [
      { name: '签到与抽签', share: 0.15, detail: '选手签到、路演出场顺序抽签、设备调试。' },
      { name: '开幕与规则说明', share: 0.1, detail: '介绍评委、赛制、评分维度与时间规则。' },
      { name: '路演环节', share: 0.45, detail: '每个项目 8 分钟展示 + 5 分钟问答。' },
      { name: '评审与茶歇', share: 0.12, detail: '评委合议、观众交流、茶歇。' },
      { name: '点评与颁奖', share: 0.13, detail: '评委点评、成绩公示、颁奖与合影。' },
      { name: '对接与收尾', share: 0.05, detail: '投资人/产业方一对一对接，资料回收。' },
    ],
    budget: [
      { category: '奖金', item: '赛事奖金与扶持金', ratio: 0.3, note: '明确发放条件与税费承担方' },
      { category: '评审', item: '评委酬金与差旅', ratio: 0.15, note: '评委需签署回避与保密承诺' },
      { category: '场地', item: '路演厅、洽谈区', ratio: 0.15, note: '优先使用孵化器/高校场地' },
      { category: '设备', item: '投影、计时、直播', ratio: 0.1, note: '计时器与大屏倒计时必须可用' },
      { category: '宣传', item: '招募、赛事传播', ratio: 0.1, note: '重点投放在创业社群与高校' },
      { category: '餐饮茶歇', item: '选手与评委茶歇', ratio: 0.08, note: '按半天配置' },
      { category: '物料', item: '证书、手册、易拉宝', ratio: 0.07, note: '证书可电子化' },
      { category: '应急机动', item: '不可预见支出', ratio: 0.05, note: '' },
    ],
    roles: [
      { role: '赛事负责人', fixed: 1, perPeople: 0, min: 1, max: 2, duty: '规则制定、评委邀请、争议裁定' },
      { role: '评审组', fixed: 5, perPeople: 40, min: 3, max: 12, duty: '独立打分、提问、合议' },
      { role: '选手服务', fixed: 2, perPeople: 25, min: 2, max: 10, duty: '签到、抽签、候场、材料收集' },
      { role: '计时与统分', fixed: 2, perPeople: 50, min: 2, max: 6, duty: '严格计时、分数录入与复核' },
      { role: '技术保障', fixed: 1, perPeople: 50, min: 1, max: 5, duty: '投影、麦克风、演示文件' },
      { role: '宣传与投资对接', fixed: 1, perPeople: 100, min: 1, max: 4, duty: '传播、投资人邀约、对接安排' },
    ],
    risks: [
      { title: '评分争议与公平性质疑', cause: '评分维度不透明、评委构成单一', likelihood: 2, impact: 3, mitigation: '赛前公布评分表，评委签署回避声明，去掉最高最低分', contingency: '现场复核评分表，必要时增设复议环节', owner: '赛事负责人' },
      { title: '路演超时', cause: '选手拖延、问答失控', likelihood: 3, impact: 2, mitigation: '大屏倒计时 + 铃声，超时 30 秒强制停止', contingency: '压缩茶歇，顺延后续项目', owner: '计时与统分' },
      { title: '演示文件或设备故障', cause: '格式不兼容、临时修改', likelihood: 2, impact: 2, mitigation: '提前 1 小时收集并统一测试', contingency: '使用备份 PDF 或录屏', owner: '技术保障' },
      { title: '项目知识产权泄露', cause: '公开路演、拍摄传播', likelihood: 2, impact: 2, mitigation: '签署保密与拍摄授权，敏感内容可申请闭门路演', contingency: '撤下相关视频与材料', owner: '赛事负责人' },
      { title: '评委临时缺席', cause: '行程冲突', likelihood: 2, impact: 2, mitigation: '邀请 1–2 位备选评委', contingency: '调整评分权重，保持评审人数为奇数', owner: '赛事负责人' },
    ],
    kpis: [
      { name: '参赛项目数', target: (c) => `≥${Math.round(c.people / 5)} 个项目`, method: '报名系统' },
      { name: '路演完成率', target: () => '100% 项目完成路演', method: '出场记录' },
      { name: '投资/产业对接', target: () => '≥10 场一对一对接，≥3 个进入下一轮', method: '对接登记表' },
      { name: '参赛者满意度', target: () => '≥4.2 / 5', method: '赛后问卷' },
    ],
    channels: ['高校创业学院与孵化器', '创业社群与投资机构网络', '赛事合作媒体', '往届项目社群', '公众号与短视频'],
    resources: ['路演厅与舞台', '倒计时计时器', '评分系统/评分表', '选手手册', '证书与奖杯', '直播设备', '茶歇'],
    interactions: ['1 分钟电梯演讲', '投资人一对一洽谈', '观众投票人气奖', '项目展板展示'],
    evaluation: ['评分表与评委反馈汇总', '项目后续发展跟踪（3/6 个月）', '参赛者问卷', '赛事结案与下一届改进'],
    notes: ['奖金发放需明确个税与发放条件', '评委需签回避与保密协议', '项目材料涉及商业秘密的应限制拍摄'],
  },

  arts: {
    agenda: [
      { name: '入场与安检', share: 0.15, detail: '验票、安检、引导入座或进入观演区。' },
      { name: '开场', share: 0.1, detail: '主持开场、嘉宾致辞、观演须知。' },
      { name: '主体演出/展陈', share: 0.55, detail: '按节目单推进，技术组跟场。' },
      { name: '互动与高潮', share: 0.1, detail: '互动环节、返场、合影。' },
      { name: '散场与撤场', share: 0.1, detail: '分批散场、设备撤场、场地恢复。' },
    ],
    budget: [
      { category: '舞台技术', item: '灯光、音响、LED、舞台', ratio: 0.3, note: '技术方案需与场地承重、电力匹配' },
      { category: '演出内容', item: '演出团队、节目编排、排练', ratio: 0.2, note: '排练场地与餐补常被低估' },
      { category: '场地', item: '场地租赁与安保要求', ratio: 0.15, note: '确认超时费与撤场时间' },
      { category: '安保医疗', item: '安保、医疗、隔离设施', ratio: 0.1, note: '按人流密度配置，不可压缩' },
      { category: '宣传售票', item: '海报、短视频、票务系统', ratio: 0.1, note: '预留票务平台手续费' },
      { category: '物料', item: '节目单、工作证、布景', ratio: 0.08, note: '布景优先复用' },
      { category: '应急机动', item: '不可预见支出', ratio: 0.07, note: '含天气、设备抢修、退票' },
    ],
    roles: [
      { role: '总导演', fixed: 1, perPeople: 0, min: 1, max: 2, duty: '整体艺术与技术把控、节目终审' },
      { role: '舞台监督', fixed: 1, perPeople: 100, min: 1, max: 4, duty: '节目衔接、后台秩序、cue 号发布' },
      { role: '技术组', fixed: 4, perPeople: 150, min: 3, max: 15, duty: '灯光、音响、视频、电力' },
      { role: '节目统筹', fixed: 1, perPeople: 80, min: 1, max: 5, duty: '节目征集、排练、顺序编排' },
      { role: '安保与引导', fixed: 3, perPeople: 100, min: 3, max: 25, duty: '验票、安检、人流疏导、应急疏散' },
      { role: '宣传票务', fixed: 1, perPeople: 150, min: 1, max: 5, duty: '宣传、售票、核销' },
      { role: '后台保障', fixed: 2, perPeople: 80, min: 2, max: 10, duty: '化妆间、饮水、道具、服装' },
    ],
    risks: [
      { title: '人流拥挤与踩踏', cause: '入口过少、散场集中', likelihood: 2, impact: 3, mitigation: '分时入场、设置单向动线与疏散通道，按容量 80% 售票', contingency: '暂停入场、分批散场、启动疏散预案', owner: '安保与引导' },
      { title: '舞台设备故障', cause: '线路老化、临时加设备', likelihood: 2, impact: 3, mitigation: '提前 1 天进场调试，关键设备双备份', contingency: '切换备用通道，主持人救场', owner: '技术组' },
      { title: '节目临时变更', cause: '演员缺席、排练不足', likelihood: 2, impact: 2, mitigation: '准备 1–2 个备选节目，彩排全流程', contingency: '调整顺序，压缩或延长互动', owner: '总导演' },
      { title: '天气影响（户外）', cause: '降雨、大风、高温', likelihood: 2, impact: 3, mitigation: '查看预报，准备雨棚与备用室内场地', contingency: '顺延或转室内，及时公告退票规则', owner: '总导演' },
      { title: '票务与黄牛', cause: '热门场次、实名不严', likelihood: 1, impact: 2, mitigation: '实名购票、入场核验', contingency: '现场核验身份，异常票拒绝入场', owner: '宣传票务' },
      { title: '版权与音乐授权', cause: '使用未授权曲目/影像', likelihood: 2, impact: 2, mitigation: '优先使用原创或已授权素材，保留授权凭证', contingency: '撤换曲目并公开说明', owner: '节目统筹' },
    ],
    kpis: [
      { name: '上座率/入场人数', target: (c) => `≥${pct(0.85)}（${Math.round(c.people * 0.85)} 人）`, method: '验票系统' },
      { name: '节目完成率', target: () => '100% 节目按单完成', method: '舞台监督记录' },
      { name: '观众满意度', target: () => '≥4.3 / 5', method: '散场问卷/线上评价' },
      { name: '传播声量', target: () => '短视频播放 ≥5 万，话题互动 ≥500', method: '平台后台数据' },
    ],
    channels: ['票务平台与校园售票点', '公众号/视频号预告', '演出社群与粉丝群', '校园广播与海报', '合作媒体与 KOL 探班'],
    resources: ['舞台与灯光音响', 'LED 屏/投影', '节目单与工作证', '对讲机', '化妆间与休息室', '安保隔离设施', '急救点', '雨棚/备用电源'],
    interactions: ['返场与观众合唱', '合影墙与应援物', '现场投票选最受欢迎节目', '后台探班直播'],
    evaluation: ['验票与上座数据', '观众问卷与线上评价', '技术复盘（cue 表执行情况）', '影像素材与结案报告'],
    notes: ['演出需办理文化演出备案（涉外/营业性演出要求更严）', '音乐与影像使用需授权', '未成年人参演需监护人同意'],
  },

  education: {
    agenda: [
      { name: '签到与分组', share: 0.12, detail: '签到、分组、发放学习材料。' },
      { name: '导入', share: 0.1, detail: '用一个问题或案例引出主题。' },
      { name: '知识讲解', share: 0.3, detail: '核心概念讲解，控制单段不超过 20 分钟。' },
      { name: '动手实践', share: 0.3, detail: '分组练习/实验/体验，讲师巡场。' },
      { name: '分享与答疑', share: 0.13, detail: '成果展示、集中答疑。' },
      { name: '总结与反馈', share: 0.05, detail: '要点回顾、问卷、后续资源。' },
    ],
    budget: [
      { category: '讲师', item: '讲师酬金与差旅', ratio: 0.25, note: '明确课时与备课费口径' },
      { category: '教具材料', item: '实验/手工/学习材料', ratio: 0.25, note: '按人均一份 +10% 损耗备货' },
      { category: '场地', item: '教室/场地租赁', ratio: 0.15, note: '确认桌椅布局与电源' },
      { category: '设备', item: '投影、实验设备', ratio: 0.1, note: '精密设备需提前调试与保险' },
      { category: '宣传', item: '招募与物料', ratio: 0.1, note: '面向家长的活动需说明适龄段' },
      { category: '餐饮', item: '饮用水/茶歇', ratio: 0.05, note: '' },
      { category: '应急机动', item: '不可预见支出', ratio: 0.1, note: '含材料补货与意外医疗' },
    ],
    roles: [
      { role: '课程负责人', fixed: 1, perPeople: 0, min: 1, max: 2, duty: '内容设计、讲师对接、质量把控' },
      { role: '主讲', fixed: 1, perPeople: 40, min: 1, max: 6, duty: '授课、答疑、现场节奏' },
      { role: '助教', fixed: 2, perPeople: 15, min: 2, max: 20, duty: '分组指导、材料分发、秩序' },
      { role: '签到与安全', fixed: 1, perPeople: 50, min: 1, max: 8, duty: '签到、家长对接、安全巡视' },
      { role: '摄影记录', fixed: 1, perPeople: 100, min: 1, max: 3, duty: '记录、成果整理' },
    ],
    risks: [
      { title: '内容难度不适配', cause: '未了解参与者基础', likelihood: 2, impact: 2, mitigation: '报名时收集基础信息，准备分层任务卡', contingency: '现场分组，助教一对一补位', owner: '主讲' },
      { title: '实验/工具安全', cause: '操作不当、材料不合规', likelihood: 2, impact: 3, mitigation: '风险操作演示 + 防护用品，助教全程盯守', contingency: '立即停止操作，急救并通知家长', owner: '课程负责人' },
      { title: '参与者注意力流失', cause: '讲解过长、互动不足', likelihood: 3, impact: 2, mitigation: '每 20 分钟切换一次形式', contingency: '插入快速互动或休息', owner: '主讲' },
      { title: '未成年人安全与接送', cause: '家长交接不清', likelihood: 2, impact: 3, mitigation: '签到签退双确认，佩戴姓名牌', contingency: '联系监护人，禁止自行离场', owner: '签到与安全' },
      { title: '材料不足', cause: '报名超预期', likelihood: 2, impact: 1, mitigation: '按报名 +10% 备料，设置共享材料', contingency: '两人一组共用，紧急补货', owner: '助教' },
    ],
    kpis: [
      { name: '完课率', target: () => '≥90% 参与者完成全部环节', method: '签到与任务卡' },
      { name: '学习达成', target: () => '≥80% 完成实践任务并达标', method: '任务卡评分/作品检查' },
      { name: '满意度', target: () => '≥4.4 / 5', method: '课后问卷' },
      { name: '复参意愿', target: () => '≥60% 表示愿意参加下一次', method: '问卷附加题' },
    ],
    channels: ['学校/社区通知群', '家长群与家委会', '公众号科普推文', '科技馆/图书馆合作渠道', '短视频实验预告'],
    resources: ['投影与白板', '学习材料包', '实验器材与防护用品', '分组桌牌', '签到表', '奖品/证书', '急救包'],
    interactions: ['动手实验', '小组竞赛与积分', '作品展示与互评', '有奖问答'],
    evaluation: ['课前/课后小测对比', '作品与任务卡评分', '家长与学员问卷', '课程迭代记录'],
    notes: ['面向未成年人的活动需监护人知情同意', '实验类活动需做风险评估并配备急救', '涉及食品的体验需注意过敏原标注'],
  },

  career: {
    agenda: [
      { name: '布展与签到', share: 0.15, detail: '企业布展、学生签到、发放导览图。' },
      { name: '开幕', share: 0.08, detail: '主办方致辞、企业代表发言、规则说明。' },
      { name: '双选洽谈', share: 0.55, detail: '学生按动线投递简历、企业初面。' },
      { name: '配套活动', share: 0.12, detail: '简历诊断、面试模拟、政策咨询。' },
      { name: '收尾与统计', share: 0.1, detail: '企业撤展、简历与意向统计。' },
    ],
    budget: [
      { category: '展位搭建', item: '展位、桁架、桌椅', ratio: 0.3, note: '标准展位统一配置，降低企业自建成本' },
      { category: '企业接待', item: '企业邀约、接待、伴手礼', ratio: 0.15, note: '按确认参会企业数准备' },
      { category: '场地', item: '场馆租赁与保洁', ratio: 0.15, note: '确认布展与撤展时间窗口' },
      { category: '宣传', item: '导览手册、线上推广', ratio: 0.15, note: '提前 2 周发布岗位预告' },
      { category: '物料', item: '指引、胸牌、简历袋', ratio: 0.1, note: '按学生人数 1.2 倍备简历袋' },
      { category: '餐饮', item: '企业人员餐水', ratio: 0.05, note: '' },
      { category: '应急机动', item: '不可预见支出', ratio: 0.1, note: '含企业临时增补展位' },
    ],
    roles: [
      { role: '总协调', fixed: 1, perPeople: 0, min: 1, max: 2, duty: '企业邀约、场地、整体调度' },
      { role: '企业服务', fixed: 2, perPeople: 20, min: 2, max: 20, duty: '企业签到、展位引导、需求响应' },
      { role: '学生引导', fixed: 3, perPeople: 100, min: 3, max: 20, duty: '入场引导、动线维护、咨询' },
      { role: '简历与数据', fixed: 1, perPeople: 200, min: 1, max: 6, duty: '简历收集、投递统计、会后跟进' },
      { role: '宣传与直播', fixed: 1, perPeople: 300, min: 1, max: 4, duty: '现场传播、企业采访、线上同步' },
      { role: '安保与后勤', fixed: 2, perPeople: 200, min: 2, max: 10, duty: '入口管控、消防通道、物资' },
    ],
    risks: [
      { title: '企业到场率低', cause: '邀约确认不实、招聘需求变化', likelihood: 2, impact: 3, mitigation: '提前 3 天二次确认，签署参会确认函', contingency: '调整展位布局，合并空展位', owner: '企业服务' },
      { title: '学生人流集中', cause: '开场集中入场、热门企业排队', likelihood: 3, impact: 2, mitigation: '分时段预约入场，热门企业设排队区', contingency: '开放备用入口，引导至分会场', owner: '学生引导' },
      { title: '岗位与专业不匹配', cause: '企业结构单一', likelihood: 2, impact: 2, mitigation: '按专业分布邀请企业，提前公布岗位表', contingency: '增设综合岗位区与实习专区', owner: '总协调' },
      { title: '简历与个人信息泄露', cause: '纸质简历随意堆放', likelihood: 2, impact: 3, mitigation: '统一简历回收箱，企业签署信息使用承诺', contingency: '回收并销毁遗留简历', owner: '简历与数据' },
      { title: '现场秩序与安全', cause: '人流密集、展位用电', likelihood: 2, impact: 3, mitigation: '预留消防通道，展位用电统一接入', contingency: '限流、断电排查', owner: '安保与后勤' },
    ],
    kpis: [
      { name: '参会企业数', target: (c) => `≥${Math.max(20, Math.round(c.people / 25))} 家`, method: '企业签到表' },
      { name: '学生入场人数', target: (c) => `${Math.round(c.people * 0.9)} 人`, method: '扫码入场统计' },
      { name: '简历投递量', target: (c) => `≥${c.people * 2} 份`, method: '简历回收/线上投递' },
      { name: '初步意向', target: () => '≥200 人次达成面试意向', method: '企业反馈表' },
    ],
    channels: ['就业网与就业公众号', '院系就业群与辅导员通知', '企业 HR 社群与行业协会', '岗位预告 H5', '校园大使与班级联络员'],
    resources: ['标准展位与桌椅', '企业楣板/指示牌', '签到与门禁设备', '简历袋与导览图', '面试洽谈区', '饮用水', '应急电源'],
    interactions: ['简历门诊', '模拟面试', '企业宣讲快闪（15 分钟）', '扫码投递与在线测评'],
    evaluation: ['企业与学生到场数据', '简历投递与面试意向统计', '企业与学生双向问卷', '就业跟进报告（1 个月后）'],
    notes: ['企业资质需提前审核', '学生个人信息按最小必要收集并限期销毁', '场馆消防与限流需符合规定'],
  },

  social: {
    agenda: [
      { name: '到场与破冰', share: 0.2, detail: '签到、自由交流、简单破冰。' },
      { name: '主体环节', share: 0.5, detail: '用餐/游戏/主题环节，穿插自由交流。' },
      { name: '高潮与合影', share: 0.2, detail: '抽奖、庆祝、合影。' },
      { name: '散场', share: 0.1, detail: '送别、物品清点。' },
    ],
    budget: [
      { category: '餐饮', item: '餐食、饮品、零食', ratio: 0.4, note: '按人数 +10% 备餐，提前确认忌口' },
      { category: '场地', item: '场地/包间租赁', ratio: 0.2, note: '确认最低消费与超时费' },
      { category: '活动物料', item: '布置、道具、游戏材料', ratio: 0.15, note: '可复用道具优先借用' },
      { category: '设备', item: '音响、投影、桌游', ratio: 0.1, note: '' },
      { category: '礼品', item: '小礼品、伴手礼', ratio: 0.1, note: '人均 20–50 元为宜' },
      { category: '应急机动', item: '不可预见支出', ratio: 0.05, note: '' },
    ],
    roles: [
      { role: '召集人', fixed: 1, perPeople: 0, min: 1, max: 1, duty: '定场地、定预算、通知与收款' },
      { role: '现场组织', fixed: 1, perPeople: 40, min: 1, max: 4, duty: '流程、游戏、时间控制' },
      { role: '采购与后勤', fixed: 1, perPeople: 50, min: 1, max: 3, duty: '采买、搬运、清点' },
      { role: '摄影', fixed: 0, perPeople: 50, min: 0, max: 2, duty: '拍照、合影、素材整理' },
    ],
    risks: [
      { title: '人数临时变动', cause: '口头确认、临时有事', likelihood: 3, impact: 2, mitigation: '提前 2 天收定金/确认接龙', contingency: '按实际人数调整餐量，多余餐食打包', owner: '召集人' },
      { title: '饮食禁忌与过敏', cause: '未提前收集', likelihood: 2, impact: 2, mitigation: '报名时收集忌口与过敏信息', contingency: '单独准备替代餐食', owner: '采购与后勤' },
      { title: '儿童/老人安全', cause: '家庭聚会人多、看护不足', likelihood: 2, impact: 2, mitigation: '指定看护人，收好尖锐与热水', contingency: '就近就医，通知家属', owner: '现场组织' },
      { title: '费用分摊争议', cause: '事前未说清', likelihood: 2, impact: 1, mitigation: '提前公布人均预算与分摊规则', contingency: '现场公示账单，多退少补', owner: '召集人' },
    ],
    kpis: [
      { name: '实际到场', target: (c) => `≥${Math.round(c.people * 0.85)} 人`, method: '签到/接龙' },
      { name: '体验满意度', target: () => '≥4.3 / 5', method: '群内匿名投票' },
      { name: '预算执行', target: () => '实际支出 ≤ 预算 105%', method: '账单核对' },
    ],
    channels: ['微信群/朋友圈接龙', '私聊定向邀请', '小程序报名收款', '社群公告'],
    resources: ['餐食与饮品', '一次性餐具', '桌游/道具', '音响', '拍照设备', '垃圾袋', '急救包'],
    interactions: ['破冰问答', '桌游/互动游戏', '抽奖', '合影墙'],
    evaluation: ['群内满意度投票', '账单公示', '照片归档', '下次活动改进点'],
    notes: ['饮酒场合需安排代驾并控制酒量', '家庭聚会注意儿童与宠物安全'],
  },

  generic: {
    agenda: [
      { name: '签到与开场', share: 0.15, detail: '签到、说明目标与流程。' },
      { name: '主体环节', share: 0.55, detail: '按活动目标安排核心内容。' },
      { name: '互动与交流', share: 0.15, detail: '问答、分组交流或体验。' },
      { name: '收尾', share: 0.15, detail: '总结、反馈、合影与清场。' },
    ],
    budget: [
      { category: '场地', item: '场地租赁', ratio: 0.25, note: '确认使用时段与超时费' },
      { category: '物料', item: '布置与物料', ratio: 0.2, note: '优先复用现有资源' },
      { category: '设备', item: '设备租赁', ratio: 0.15, note: '提前测试' },
      { category: '宣传', item: '宣传与报名', ratio: 0.1, note: '' },
      { category: '餐饮', item: '餐饮茶歇', ratio: 0.1, note: '按到场率备餐' },
      { category: '人力', item: '兼职/志愿者补贴', ratio: 0.1, note: '' },
      { category: '应急机动', item: '不可预见支出', ratio: 0.1, note: '保留 10% 不提前花掉' },
    ],
    roles: [
      { role: '总协调', fixed: 1, perPeople: 0, min: 1, max: 2, duty: '统筹进度、预算与对外沟通' },
      { role: '执行', fixed: 2, perPeople: 60, min: 2, max: 12, duty: '现场流程与突发处理' },
      { role: '宣传', fixed: 1, perPeople: 150, min: 1, max: 4, duty: '宣传、报名与答疑' },
      { role: '后勤', fixed: 1, perPeople: 100, min: 1, max: 8, duty: '物资、场地与收尾' },
    ],
    risks: [
      { title: '参与人数不足', cause: '宣传不足、时间冲突', likelihood: 2, impact: 2, mitigation: '提前确认报名，设置提醒', contingency: '缩小规模，保证核心环节', owner: '总协调' },
      { title: '流程延误', cause: '环节超时、准备不足', likelihood: 2, impact: 2, mitigation: '提前彩排，设置时间缓冲', contingency: '压缩非核心环节', owner: '执行' },
      { title: '预算超支', cause: '临时增项', likelihood: 2, impact: 2, mitigation: '保留 10% 机动，变更需审批', contingency: '削减非必要支出', owner: '总协调' },
      { title: '现场安全', cause: '场地不熟、人流集中', likelihood: 1, impact: 3, mitigation: '提前踏勘、确认疏散通道', contingency: '启动应急预案并联系场馆', owner: '执行' },
    ],
    kpis: [
      { name: '到场人数', target: (c) => `${Math.round(c.people * 0.85)} 人以上`, method: '签到统计' },
      { name: '满意度', target: () => '≥4.2 / 5', method: '活动后问卷' },
      { name: '预算执行率', target: () => '90%–105%', method: '决算表' },
    ],
    channels: ['社群与朋友圈', '公众号推文', '定向邀请', '合作方互推'],
    resources: ['签到表', '指引牌', '音响/投影', '饮用水', '桌椅', '垃圾袋'],
    interactions: ['破冰问答', '分组讨论', '抽奖', '合影'],
    evaluation: ['签到与报名数据', '参与者问卷', '工作人员复盘', '素材归档'],
    notes: ['确认场地消防与疏散要求', '涉及收费需明确退费规则'],
  },
};

/* ============================================================
 * 二、具体活动类型的覆盖内容
 * 只写"和族默认不一样"的部分，避免重复。
 * ============================================================ */

export const CATEGORY_KNOWLEDGE: Record<string, CategoryKnowledge> = {
  'campus-welcome': {
    agenda: [
      { name: '分区签到', share: 0.18, detail: '按学院/专业分区签到，发放新生礼包与校园地图。' },
      { name: '暖场视频与社团展示', share: 0.17, detail: '校园生活混剪 + 社团快闪，建立第一印象。' },
      { name: '师长寄语与政策讲解', share: 0.25, detail: '院系介绍、学业与安全须知，控制在 40 分钟内。' },
      { name: '破冰与班级见面', share: 0.25, detail: '按班级分组，辅导员与学长学姐带队破冰。' },
      { name: '校园导览与答疑', share: 0.15, detail: '分批导览宿舍、食堂、图书馆，设固定答疑点。' },
    ],
    interactions: ['新生心愿墙', '学长学姐一对一带逛', '扫码领取电子手册', '班级合影打卡'],
    notes: ['新生信息收集需符合个人信息保护要求', '涉及家长入校需提前报备'],
  },
  'campus-club': {
    agenda: [
      { name: '布展与签到', share: 0.2, detail: '社团摊位布置、物资领取、摊位号确认。' },
      { name: '集中展演', share: 0.2, detail: '主舞台轮番表演，每社团 5–8 分钟。' },
      { name: '自由逛展与报名', share: 0.45, detail: '摊位互动、扫码报名、集章。' },
      { name: '收尾与统计', share: 0.15, detail: '撤展、报名数据汇总、场地恢复。' },
    ],
    interactions: ['集章兑奖', '社团快闪表演', '扫码入群', '现场报名抽奖'],
    risks: [
      { title: '摊位人流不均', cause: '位置与吸引力差异', likelihood: 3, impact: 2, mitigation: '主舞台轮演导流，热门社团分散布局', contingency: '临时调整摊位或增设引导', owner: '现场执行' },
      { title: '噪音与场地冲突', cause: '音响互相干扰', likelihood: 2, impact: 2, mitigation: '统一音响功率与朝向，划分静音区', contingency: '临时降噪或调整时段', owner: '总协调' },
    ],
  },
  'academic-conference': {
    agenda: [
      { name: '签到与资料领取', share: 0.12, detail: '胸牌、会议手册、纪念品，设嘉宾通道。' },
      { name: '开幕与主旨报告', share: 0.3, detail: '主办方致辞 + 2 场主旨报告（各 25 分钟）。' },
      { name: '茶歇与海报交流', share: 0.1, detail: '茶歇区设海报展示与作者在场交流。' },
      { name: '平行分论坛', share: 0.3, detail: '2–3 个分会场并行，每场 4 个报告 + 点评。' },
      { name: '圆桌与闭幕', share: 0.13, detail: '圆桌讨论、优秀论文颁奖、下届预告。' },
      { name: '晚宴/自由交流', share: 0.05, detail: '可选环节，按预算决定。' },
    ],
    interactions: ['海报快闪（1 分钟/人）', '茶歇话题卡', '最佳提问奖', '线上同步直播'],
    notes: ['涉外嘉宾需按外事规定报批', '会议论文集需明确版权归属'],
  },
  'academic-lecture': {
    agenda: [
      { name: '签到入场', share: 0.15, detail: '签到、发放资料、引导入座。' },
      { name: '开场介绍', share: 0.1, detail: '介绍讲者背景与讲座主题。' },
      { name: '主题讲座', share: 0.5, detail: '45–60 分钟主讲，留 15 分钟提问。' },
      { name: '互动提问', share: 0.15, detail: '集中提问，主持人筛选与控时。' },
      { name: '散场与交流', share: 0.1, detail: '合影、个别交流、资料回收。' },
    ],
    interactions: ['提问有奖', '讲后小型座谈', '扫码获取讲义', '合影留念'],
  },
  'academic-contest': {
    agenda: [
      { name: '检录与抽签', share: 0.15, detail: '选手检录、抽取顺序、设备调试。' },
      { name: '规则说明', share: 0.08, detail: '宣读赛制、评分标准、申诉流程。' },
      { name: '竞赛环节', share: 0.55, detail: '按赛制分轮次进行，评委独立打分。' },
      { name: '评审合议', share: 0.1, detail: '评委合议、去极值、成绩复核。' },
      { name: '颁奖与点评', share: 0.12, detail: '成绩公示、点评、颁奖。' },
    ],
    interactions: ['观众投票', '现场解题展示', '评委点评', '优秀作品展板'],
    risks: [
      { title: '成绩争议与申诉', cause: '评分标准理解不一致', likelihood: 2, impact: 3, mitigation: '赛前公布评分细则，设申诉窗口与复核流程', contingency: '调取记录复核，必要时加赛', owner: '评审组' },
      { title: '设备与环境故障', cause: '编程环境/实验设备不稳', likelihood: 2, impact: 2, mitigation: '统一环境镜像，准备备用机', contingency: '延长对应时长并记录', owner: '技术支持' },
    ],
  },
  'sports-match': {
    agenda: [
      { name: '检录与热身', share: 0.18, detail: '核对名单、发放号码、集体热身。' },
      { name: '开场与规则说明', share: 0.07, detail: '入场仪式、裁判说明规则。' },
      { name: '比赛', share: 0.6, detail: '按赛制进行，记录比分与犯规。' },
      { name: '颁奖与合影', share: 0.1, detail: '成绩公示、颁奖。' },
      { name: '收尾', share: 0.05, detail: '器材回收与场地检查。' },
    ],
    interactions: ['中场啦啦队表演', '观众互动抽奖', 'MVP 评选', '赛后合影'],
    risks: [
      { title: '对抗受伤', cause: '动作过大、热身不足', likelihood: 3, impact: 2, mitigation: '赛前热身、裁判控场、场边急救', contingency: '立即处置并送医', owner: '医疗组' },
    ],
  },
  'sports-meet': {
    agenda: [
      { name: '入场与检录', share: 0.15, detail: '各代表队入场、检录、号码布发放。' },
      { name: '开幕式', share: 0.12, detail: '方阵入场、升旗、致辞、运动员宣誓。' },
      { name: '田径项目', share: 0.5, detail: '径赛与田赛并行，广播即时播报。' },
      { name: '趣味项目/团体赛', share: 0.13, detail: '降低门槛，提高参与率。' },
      { name: '闭幕与颁奖', share: 0.1, detail: '团体总分公布、颁奖、合影。' },
    ],
    interactions: ['广播加油稿', '团体趣味项目', '摄影抓拍', '院系应援'],
  },
  'sports-marathon': {
    agenda: [
      { name: '检录与存包', share: 0.15, detail: '号码布核验、芯片检测、存包与分区集结。' },
      { name: '热身与开幕', share: 0.1, detail: '集体热身、致辞、安全提示。' },
      { name: '起跑与赛中', share: 0.5, detail: '分区起跑，补给点、医疗点与收容车同步运行。' },
      { name: '关门与颁奖', share: 0.15, detail: '关门时间到，公布成绩、颁奖。' },
      { name: '疏散与清场', share: 0.1, detail: '分批疏散、赛道解封、物资撤除。' },
    ],
    budget: [
      { category: '赛道与场地', item: '赛道布置、隔离、指示', ratio: 0.18, note: '含封路许可与交警协调' },
      { category: '医疗保障', item: '医疗点、AED、救护车', ratio: 0.18, note: '每 2.5 km 设医疗点，不可压缩' },
      { category: '计时与芯片', item: '计时系统、号码布、芯片', ratio: 0.12, note: '按报名人数 +5% 备芯片' },
      { category: '补给', item: '水、电解质、香蕉、海绵', ratio: 0.15, note: '按每人 3 杯水估算' },
      { category: '安保', item: '安保、志愿者、收容车', ratio: 0.15, note: '志愿者需专项培训' },
      { category: '奖牌与物料', item: '完赛奖牌、T 恤、参赛包', ratio: 0.12, note: '完赛奖牌按报名数备货' },
      { category: '宣传', item: '报名平台、摄影直播', ratio: 0.05, note: '' },
      { category: '应急机动', item: '不可预见支出', ratio: 0.05, note: '含天气改期与医疗转运' },
    ],
    interactions: ['赛道加油点/音乐站', '完赛打卡墙', '成绩实时查询', '赛后拉伸区'],
    risks: [
      { title: '运动性猝死/重症中暑', cause: '高温、选手隐瞒病史、强度过大', likelihood: 1, impact: 3, mitigation: '报名健康承诺、赛前体检建议、沿途 AED 与救护车', contingency: '立即心肺复苏并转运，启动保险与上报', owner: '医疗组' },
      { title: '赛道交通事故', cause: '封路不彻底、路口失守', likelihood: 2, impact: 3, mitigation: '提前报批封路，每个路口配交警/志愿者', contingency: '暂停比赛、分流选手', owner: '安保组' },
      { title: '补给不足或断档', cause: '估算偏低、选手滞留', likelihood: 2, impact: 2, mitigation: '按人均需求 1.3 倍备货，设机动补给车', contingency: '紧急调货，延长关门时间', owner: '后勤组' },
      { title: '天气突变', cause: '降雨、高温、大风', likelihood: 2, impact: 3, mitigation: '赛前 72/24/6 小时三次天气会商，设定熔断标准', contingency: '延期或缩短赛道，及时公告', owner: '总指挥' },
    ],
    kpis: [
      { name: '报名与完赛', target: (c) => `报名 ${c.people} 人，完赛率 ≥90%`, method: '计时芯片数据' },
      { name: '医疗事件', target: () => '重症 0 起，轻症处置 ≤3%', method: '医疗点记录' },
      { name: '关门准时率', target: () => '100% 按计划关门', method: '赛道记录' },
      { name: '选手满意度', target: () => '≥4.4 / 5', method: '赛后问卷' },
    ],
    notes: ['路跑赛事需向体育与公安部门报批', '必须购买赛事责任险与参赛者意外险', '需公示熔断机制与退费规则'],
  },
  'sports-outdoor': {
    agenda: [
      { name: '集合与安全宣讲', share: 0.15, detail: '签到、装备检查、路线与安全说明。' },
      { name: '分组出发', share: 0.1, detail: '按体能分组，明确领队与收队。' },
      { name: '行进/拓展项目', share: 0.55, detail: '按路线推进，设置打卡点与休息点。' },
      { name: '总结与返程', share: 0.2, detail: '团队分享、合影、清点人数返程。' },
    ],
    risks: [
      { title: '迷路或掉队', cause: '路线标识不清、体能差异', likelihood: 2, impact: 3, mitigation: '领队+收队双人负责，关键岔路设标识', contingency: '原地等待，启动搜救与定位', owner: '领队' },
      { title: '中暑/失温/扭伤', cause: '天气与地形', likelihood: 2, impact: 3, mitigation: '随队医药包、按天气备装备、控制强度', contingency: '就地处置并下撤', owner: '医疗组' },
      { title: '通信中断', cause: '山区无信号', likelihood: 2, impact: 2, mitigation: '配备对讲机，登记紧急联系人', contingency: '按预案时间点报平安', owner: '总指挥' },
    ],
    notes: ['需购买户外意外险并收集紧急联系人', '提前查询天气与景区/林区规定', '未成年人需监护人陪同'],
  },
  'charity-service': {
    agenda: [
      { name: '集合与岗前培训', share: 0.18, detail: '签到、分组、服务规范与话术培训。' },
      { name: '服务实施', share: 0.6, detail: '按小组进入服务场景，记录对象需求。' },
      { name: '分享与复盘', share: 0.17, detail: '志愿者分享、问题汇总。' },
      { name: '收尾', share: 0.05, detail: '物资回收、影像与记录归档。' },
    ],
    resources: ['志愿者马甲与工牌', '服务物资（按对象清单）', '签到与考勤表', '急救包', '拍摄设备', '物资签收单', '饮用水'],
    interactions: ['结对陪伴', '便民服务摊位', '心愿卡', '服务成果照片墙'],
  },
  'charity-fundraise': {
    agenda: [
      { name: '布展与签到', share: 0.2, detail: '摊位布置、义卖品上架、志愿者签到。' },
      { name: '开场说明', share: 0.1, detail: '介绍项目背景、善款用途与监督方式。' },
      { name: '义卖/募捐', share: 0.5, detail: '分区义卖、扫码捐赠、捐赠人登记。' },
      { name: '公示与收尾', share: 0.2, detail: '现场公布筹款总额、合影、物资清点。' },
    ],
    risks: [
      { title: '善款合规与公信力', cause: '无资质募捐、账目不清', likelihood: 2, impact: 3, mitigation: '与具备公募资质的机构合作，专账管理', contingency: '暂停募捐并公开说明', owner: '项目负责人' },
      { title: '义卖品来源与质量', cause: '捐赠物品未检查', likelihood: 2, impact: 2, mitigation: '上架前检查并登记来源', contingency: '下架问题商品并说明', owner: '物资与后勤' },
    ],
    resources: ['义卖摊位与桌布', '收款码/捐款箱', '善款登记表', '公示板', '志愿者马甲', '包装袋'],
  },
  'charity-green': {
    agenda: [
      { name: '集合与科普', share: 0.15, detail: '签到、环保知识快讲、工具发放。' },
      { name: '分组行动', share: 0.55, detail: '净滩/植树/分类宣传分组推进。' },
      { name: '成果称重与展示', share: 0.2, detail: '垃圾称重、分类统计、成果展示。' },
      { name: '总结与倡议', share: 0.1, detail: '合影、发布行动倡议。' },
    ],
    interactions: ['垃圾称重排行榜', '分类小游戏', '环保承诺签名墙', '旧物改造展示'],
    resources: ['手套与夹子', '分类垃圾袋', '电子秤', '宣传展板', '饮用水', '急救包'],
    notes: ['户外行动需避开危险区域并购买保险', '垃圾分类需对接属地环卫'],
  },
  'business-launch': {
    agenda: [
      { name: '签到与体验区', share: 0.2, detail: '媒体签到、产品体验区开放、迎宾。' },
      { name: '开场影片', share: 0.08, detail: '品牌短片，控制在 90 秒内。' },
      { name: '主题演讲', share: 0.3, detail: '创始人/产品负责人讲解，现场演示。' },
      { name: '产品发布仪式', share: 0.12, detail: '揭幕、价格公布、首销政策。' },
      { name: '媒体问答', share: 0.2, detail: 'Q&A 与专访，统一口径。' },
      { name: '体验与转化', share: 0.1, detail: '体验、预订、媒体素材发放。' },
    ],
    risks: [
      { title: '演示翻车', cause: '现场网络/设备/产品故障', likelihood: 3, impact: 3, mitigation: '录屏备份、双机位、彩排 3 次', contingency: '切录屏并说明，主持人承接', owner: '技术支持' },
      { title: '信息提前泄露', cause: '物料外流、媒体抢跑', likelihood: 2, impact: 3, mitigation: '物料编号管理、签署保密协议、定时发布', contingency: '提前发布官方口径，控制传播节奏', owner: '媒体与传播' },
    ],
    kpis: [
      { name: '媒体到场与报道', target: () => '≥30 家媒体，报道 ≥50 篇', method: '媒体签到与监测' },
      { name: '直播观看', target: () => '≥10 万人次', method: '直播平台数据' },
      { name: '首销转化', target: () => '发布会后 72 小时订单 ≥1000 单', method: '销售后台' },
    ],
    notes: ['预热物料需按既定时间解禁', '涉及价格与承诺的宣传需符合广告法'],
  },
  'business-annual': {
    agenda: [
      { name: '签到与合影', share: 0.15, detail: '签到、领取伴手礼、合影墙。' },
      { name: '年度回顾', share: 0.15, detail: '年度视频、CEO 致辞。' },
      { name: '表彰颁奖', share: 0.2, detail: '优秀员工/团队颁奖。' },
      { name: '晚宴', share: 0.25, detail: '用餐、节目表演。' },
      { name: '抽奖与互动', share: 0.2, detail: '多轮抽奖、互动游戏。' },
      { name: '散场', share: 0.05, detail: '伴手礼发放、交通安排。' },
    ],
    interactions: ['抽奖', '部门节目', '年度照片墙', '现场投票选节目'],
    risks: [
      { title: '酒后安全与交通', cause: '饮酒过量、代驾不足', likelihood: 2, impact: 3, mitigation: '提前预约代驾/大巴，控制酒水供应', contingency: '安排专人护送，必要时送医', owner: '会务统筹' },
      { title: '抽奖争议', cause: '规则不清、重复中奖', likelihood: 2, impact: 1, mitigation: '提前公示规则、系统随机、全程录屏', contingency: '现场复核并补抽', owner: '项目总监' },
    ],
  },
  'business-expo': {
    agenda: [
      { name: '布展与安检', share: 0.2, detail: '展商进场、搭建验收、安检开启。' },
      { name: '开幕与巡馆', share: 0.15, detail: '开幕式、领导/嘉宾巡馆。' },
      { name: '专业观众洽谈', share: 0.45, detail: '展位洽谈、论坛同步、配对洽谈。' },
      { name: '公众开放', share: 0.1, detail: '面向公众开放，体验与互动。' },
      { name: '撤展', share: 0.1, detail: '展商撤展、场馆验收。' },
    ],
    interactions: ['展位打卡集章', '新品发布区', '配对洽谈', '行业论坛'],
    risks: [
      { title: '搭建安全与消防', cause: '结构不合规、材料不阻燃', likelihood: 2, impact: 3, mitigation: '搭建图审、材料证明、预留消防通道', contingency: '停工整改，必要时拆除', owner: '会务统筹' },
      { title: '展商与观众数量不及预期', cause: '招商与推广不足', likelihood: 2, impact: 2, mitigation: '提前 3 个月招商，设置早鸟价', contingency: '合并展区，加强现场活动引流', owner: '项目总监' },
    ],
    notes: ['大型展会需办理消防、安保与大型活动备案', '展位用电与搭建需场馆书面确认'],
  },
  'startup-contest': {
    agenda: [
      { name: '签到与抽签', share: 0.12, detail: '选手签到、抽签、材料拷贝与测试。' },
      { name: '开幕与规则', share: 0.08, detail: '介绍评委、赛制与评分维度。' },
      { name: '路演（上半场）', share: 0.3, detail: '每项目 8 分钟展示 + 5 分钟问答。' },
      { name: '茶歇与合议', share: 0.1, detail: '茶歇、评委初步合议。' },
      { name: '路演（下半场）', share: 0.25, detail: '继续路演，严格控制时间。' },
      { name: '点评与颁奖', share: 0.15, detail: '评委点评、成绩公示、颁奖。' },
    ],
    budget: [
      { category: '奖金', item: '奖金与扶持金', ratio: 0.35, note: '明确税费与发放条件' },
      { category: '评审', item: '评委酬金与差旅', ratio: 0.15, note: '签署回避与保密协议' },
      { category: '场地', item: '路演厅与洽谈区', ratio: 0.15, note: '' },
      { category: '设备', item: '投影、计时、直播', ratio: 0.1, note: '倒计时必须可靠' },
      { category: '宣传', item: '项目招募与传播', ratio: 0.1, note: '' },
      { category: '物料', item: '证书、手册、展板', ratio: 0.08, note: '证书可电子化' },
      { category: '餐饮', item: '茶歇', ratio: 0.07, note: '' },
    ],
  },
  'startup-roadshow': {
    agenda: [
      { name: '签到与项目抽签', share: 0.15, detail: '项目签到、抽签、资料发放。' },
      { name: '开场', share: 0.1, detail: '主办方介绍、投资人介绍。' },
      { name: '项目路演', share: 0.5, detail: '每项目 6 分钟 + 4 分钟问答。' },
      { name: '自由对接', share: 0.2, detail: '一对一洽谈、茶歇。' },
      { name: '收尾', share: 0.05, detail: '意向登记、合影。' },
    ],
    kpis: [
      { name: '对接场次', target: () => '≥20 场一对一洽谈', method: '对接登记表' },
      { name: '后续跟进', target: () => '≥50% 项目获得二次沟通', method: '3 周后回访' },
    ],
  },
  'arts-festival': {
    agenda: [
      { name: '入场与安检', share: 0.2, detail: '分时验票、安检、寄存与引导。' },
      { name: '暖场', share: 0.1, detail: 'DJ/暖场乐队，聚集人气。' },
      { name: '主舞台演出', share: 0.5, detail: '按阵容表轮换，换场控制在 15 分钟内。' },
      { name: '互动与市集', share: 0.12, detail: '市集、互动装置、签名合影。' },
      { name: '散场', share: 0.08, detail: '分批散场、接驳车、清场。' },
    ],
    risks: [
      { title: '拥挤踩踏', cause: '人流密度过高、通道不足', likelihood: 2, impact: 3, mitigation: '限流售票、分区围栏、单向动线、医疗点', contingency: '暂停演出、启动疏散与广播引导', owner: '安保组' },
      { title: '噪音扰民投诉', cause: '音量超标、超时演出', likelihood: 2, impact: 2, mitigation: '提前报备、设定分贝上限与结束时间', contingency: '降噪、提前结束并致歉', owner: '总导演' },
      { title: '艺人临时变更', cause: '行程/身体原因', likelihood: 2, impact: 2, mitigation: '合同约定变更条款，准备替补阵容', contingency: '调整阵容并公告', owner: '节目统筹' },
    ],
    notes: ['户外演出需办理营业性演出许可与安保方案', '需设置医疗点、饮水点与女性关怀物资', '噪音与结束时间需与属地沟通'],
  },
  'community-festival': {
    agenda: [
      { name: '开市与布置', share: 0.15, detail: '摊主入场、摊位布置、志愿者分组与动线确认。' },
      { name: '民俗巡游', share: 0.12, detail: '居民队伍巡游开场，营造节日气氛。' },
      { name: '舞台展演', share: 0.25, detail: '居民与社团节目轮番上演，主持人串场。' },
      { name: '手作工坊', share: 0.2, detail: '非遗与亲子手作，按场次预约体验。' },
      { name: '邻里市集', share: 0.18, detail: '居民摊位、旧物交换、公益义卖同步开放。' },
      { name: '闭幕抽奖', share: 0.1, detail: '抽奖、合影、摊主撤场与场地恢复。' },
    ],
    resources: ['帐篷摊位', '舞台音响', '桌椅', '指示牌', '手作材料', '抽奖奖品', '分类垃圾桶', '急救包', '扩音器'],
    interactions: ['居民才艺舞台', '非遗手作体验', '邻里旧物交换', '集章兑礼'],
    risks: [
      { title: '天气影响户外摊位', cause: '降雨或大风', likelihood: 2, impact: 3, mitigation: '查看预报，帐篷配重，确认室内备用场地', contingency: '转入室内或顺延一周', owner: '社区协调' },
      { title: '儿童走失', cause: '人流密集、看护不足', likelihood: 2, impact: 3, mitigation: '儿童手环登记、出口值守、广播点', contingency: '广播寻人并管控出入口', owner: '安保与保洁' },
      { title: '食品卫生', cause: '居民自制食品无监管', likelihood: 2, impact: 2, mitigation: '摊主报备食材与制作时间，不售生食', contingency: '下架问题食品并说明', owner: '摊位管理' },
    ],
    notes: ['占用公共区域需向街道/物业报备', '食品摊贩需符合属地卫生要求', '音响与结束时间需与周边居民沟通'],
  },
  'arts-culture': {    agenda: [
      { name: '开市/开幕', share: 0.15, detail: '摊位开市、开幕表演。' },
      { name: '展演与体验', share: 0.5, detail: '非遗体验、舞台展演、手作工坊轮转。' },
      { name: '互动与集章', share: 0.25, detail: '集章打卡、文化问答、合影。' },
      { name: '收尾', share: 0.1, detail: '撤展、清点、场地恢复。' },
    ],
    interactions: ['非遗手作体验', '汉服/民俗巡游', '文化问答', '集章兑礼'],
  },
  'arts-exhibition': {
    agenda: [
      { name: '布展与验收', share: 0.2, detail: '作品上墙、灯光调试、展签核对。' },
      { name: '开幕与导览', share: 0.2, detail: '开幕致辞、策展人导览、媒体采访。' },
      { name: '自由观展', share: 0.45, detail: '观众自由观展，设置讲解与互动区。' },
      { name: '沙龙与撤展', share: 0.15, detail: '艺术家沙龙、撤展与作品归还。' },
    ],
    interactions: ['策展人导览', '观众留言墙', '艺术家对谈', '周边文创'],
    resources: ['展墙与射灯', '展签与作品标签', '挂钩与水平仪', '运输与保险', '导览手册'],
    notes: ['作品运输与保险需明确责任', '灯光与用电需场馆确认'],
  },
  'arts-performance': {
    agenda: [
      { name: '入场', share: 0.15, detail: '验票、引导入座、发放节目单。' },
      { name: '开场', share: 0.08, detail: '主持开场、观演须知。' },
      { name: '节目演出', share: 0.6, detail: '按节目单推进，后台 cue 表执行。' },
      { name: '谢幕与合影', share: 0.1, detail: '谢幕、嘉宾合影、观众有序离场。' },
      { name: '撤场', share: 0.07, detail: '设备撤场、场地恢复。' },
    ],
    interactions: ['返场', '观众投票', '合影墙', '节目单签名'],
  },
  'arts-graduation': {
    agenda: [
      { name: '入场与暖场', share: 0.15, detail: '毕业生入场、暖场视频与照片轮播。' },
      { name: '致辞与表彰', share: 0.2, detail: '师长寄语、优秀毕业生表彰。' },
      { name: '毕业演出', share: 0.4, detail: '班级/社团节目，穿插回忆影像。' },
      { name: '拨穗/赠礼', share: 0.15, detail: '拨穗仪式、纪念品发放。' },
      { name: '合影与散场', share: 0.1, detail: '班级合影、有序散场。' },
    ],
    interactions: ['毕业纪念视频', '写给四年后的信', '班级合影', '纪念品发放'],
  },
  'education-popular': {
    agenda: [
      { name: '签到与导览', share: 0.15, detail: '签到、发放探索手册、区域导览。' },
      { name: '主题讲解', share: 0.2, detail: '20 分钟科普讲解，配合演示实验。' },
      { name: '动手体验', share: 0.45, detail: '分展区轮转体验，每区 15 分钟。' },
      { name: '挑战与兑奖', share: 0.15, detail: '知识挑战、集章兑奖。' },
      { name: '收尾', share: 0.05, detail: '问卷、合影、清场。' },
    ],
    interactions: ['集章探索', '演示实验', '知识问答', '科学小制作'],
  },
  'education-workshop': {
    agenda: [
      { name: '签到与破冰', share: 0.15, detail: '签到、自我介绍、说明学习目标。' },
      { name: '讲解与示范', share: 0.25, detail: '核心方法讲解 + 讲师示范。' },
      { name: '分组练习', share: 0.4, detail: '动手练习，讲师与助教巡场。' },
      { name: '成果展示', share: 0.15, detail: '小组展示、互评、讲师点评。' },
      { name: '总结', share: 0.05, detail: '要点回顾、资料发放、问卷。' },
    ],
  },
  'career-jobfair': {
    agenda: [
      { name: '布展与签到', share: 0.18, detail: '企业布展、学生扫码入场、发放导览图。' },
      { name: '开幕', share: 0.07, detail: '致辞、企业代表发言、流程说明。' },
      { name: '双选洽谈', share: 0.55, detail: '按动线投递简历、现场初面。' },
      { name: '配套服务', share: 0.12, detail: '简历门诊、政策咨询、面试模拟。' },
      { name: '收尾', share: 0.08, detail: '撤展、简历与意向统计。' },
    ],
    budget: [
      { category: '展位搭建', item: '标准展位与桁架', ratio: 0.28, note: '统一配置降低企业成本' },
      { category: '企业接待', item: '企业邀约与接待', ratio: 0.15, note: '' },
      { category: '场地', item: '场馆租赁与保洁', ratio: 0.15, note: '' },
      { category: '宣传', item: '岗位预告与推广', ratio: 0.15, note: '提前 2 周发布' },
      { category: '物料', item: '指引、简历袋、胸牌', ratio: 0.12, note: '' },
      { category: '餐饮', item: '企业人员餐水', ratio: 0.05, note: '' },
      { category: '应急机动', item: '不可预见支出', ratio: 0.1, note: '' },
    ],
    interactions: ['简历门诊', '模拟面试', '企业快闪宣讲', '扫码投递'],
  },
  'career-talk': {
    agenda: [
      { name: '签到', share: 0.15, detail: '签到、发放问题卡。' },
      { name: '嘉宾分享', share: 0.5, detail: '2–3 位嘉宾各 20 分钟，聚焦真实经历。' },
      { name: '圆桌问答', share: 0.25, detail: '主持人提问 + 现场提问。' },
      { name: '自由交流', share: 0.1, detail: '分组交流、加微信、合影。' },
    ],
    interactions: ['问题卡收集', '现场提问', '一对一交流', '简历点评'],
  },
  'career-info': {
    agenda: [
      { name: '签到', share: 0.15, detail: '签到、扫码登记、发放宣传册。' },
      { name: '企业介绍', share: 0.3, detail: '公司业务、文化、岗位与发展路径。' },
      { name: '校友分享', share: 0.2, detail: '在职校友真实体验。' },
      { name: 'Q&A', share: 0.25, detail: '集中答疑，收集简历。' },
      { name: '收尾', share: 0.1, detail: '现场初面或登记意向。' },
    ],
  },
  'social-teambuilding': {
    agenda: [
      { name: '集合与分组', share: 0.15, detail: '签到、随机分组、规则说明。' },
      { name: '破冰', share: 0.15, detail: '低门槛互动，打散部门界限。' },
      { name: '协作挑战', share: 0.45, detail: '分组完成任务，积分制。' },
      { name: '复盘与分享', share: 0.15, detail: '每组分享协作感受。' },
      { name: '聚餐/自由活动', share: 0.1, detail: '轻松收尾。' },
    ],
    interactions: ['随机分组', '团队积分榜', '协作挑战', '复盘分享'],
  },
  'social-party': {
    agenda: [
      { name: '到场与暖场', share: 0.25, detail: '自由交流、饮品小食。' },
      { name: '主题环节', share: 0.45, detail: '游戏/庆祝/主题互动。' },
      { name: '合影与散场', share: 0.3, detail: '合影、伴手礼、送别。' },
    ],
    interactions: ['破冰问答', '桌游', '抽奖', '合影'],
  },
  'social-festival': {
    agenda: [
      { name: '布置与签到', share: 0.15, detail: '节日布置、签到、发放节日小物。' },
      { name: '节日仪式', share: 0.2, detail: '节日由来/祝福环节。' },
      { name: '互动体验', share: 0.45, detail: '手作、游戏、品尝。' },
      { name: '合影与收尾', share: 0.2, detail: '合影、分发剩余物资。' },
    ],
    interactions: ['节日手作', '灯谜/知识问答', '节日美食', '合影墙'],
  },
  'social-trip': {
    agenda: [
      { name: '集合出发', share: 0.1, detail: '清点人数、行李、发放行程单。' },
      { name: '交通与到达', share: 0.15, detail: '车上破冰、注意事项。' },
      { name: '游览/活动', share: 0.45, detail: '按行程推进，控制集合时间。' },
      { name: '用餐与自由活动', share: 0.2, detail: '统一用餐、自由活动。' },
      { name: '返程', share: 0.1, detail: '清点人数、返程。' },
    ],
    risks: [
      { title: '交通延误', cause: '路况、车辆故障', likelihood: 2, impact: 2, mitigation: '预留缓冲，确认车辆资质与保险', contingency: '调整行程，减少非核心景点', owner: '总协调' },
      { title: '人员走失', cause: '自由活动时间、景区人流', likelihood: 2, impact: 3, mitigation: '分组带队、建立微信群、约定集合点', contingency: '广播寻人、联系景区', owner: '领队' },
      { title: '饮食与住宿问题', cause: '供应商质量', likelihood: 2, impact: 2, mitigation: '提前踩点、签订合同、留存凭证', contingency: '更换供应商并索赔', owner: '后勤组' },
    ],
    notes: ['旅行社业务需资质，自组活动需购买旅游意外险', '包车需核验营运资质与保险'],
  },
};

/** 读取某活动类型的知识：族默认 + 类型覆盖 */
export function knowledgeFor(familyId: string, categoryId: string): FamilyKnowledge {
  const family = FAMILY_KNOWLEDGE[familyId] ?? FAMILY_KNOWLEDGE.generic;
  const override = CATEGORY_KNOWLEDGE[categoryId] ?? {};
  return {
    agenda: override.agenda ?? family.agenda,
    budget: override.budget ?? family.budget,
    roles: override.roles ?? family.roles,
    risks: override.risks ?? family.risks,
    kpis: override.kpis ?? family.kpis,
    channels: family.channels,
    resources: override.resources ?? family.resources,
    interactions: override.interactions ?? family.interactions,
    evaluation: family.evaluation,
    notes: [...(override.notes ?? []), ...family.notes].slice(0, 6),
  };
}
