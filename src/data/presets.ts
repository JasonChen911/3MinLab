import type { AgendaSegment, BudgetTemplateLine, RiskTemplate, RoleTemplate } from './knowledge';
import type { GroupId, VenueKind } from '../types';

/* ============================================================
 * 预设活动模板
 *
 * 定位：帮用户"快速起稿"，不是限制范围。
 * 每个预设都是**独立的配置**——有自己的流程、角色、物资、预算结构与风险，
 * 因此不同预设生成的方案在结构上就不同，而不是换个名字。
 *
 * 与类型知识（knowledge.ts）的关系：
 *   族默认 ← 类型覆盖 ← 预设覆盖（预设优先级最高）
 * 生成器只做合并，不认具体预设。
 * ============================================================ */

export interface ScenarioPreset {
  id: string;
  name: string;
  group: GroupId;
  categoryId: string;
  /** 卡片副标题 */
  tagline: string;
  /** 活动场景介绍 */
  intro: string;
  /** 适用人群 */
  audience: string;
  /** 预设活动目标 */
  goal: string;
  people: number;
  budget: number;
  duration: number;
  days?: number;
  venue: VenueKind;
  /** 推荐活动流程 */
  flow: AgendaSegment[];
  /** 常见人员配置 */
  roles: RoleTemplate[];
  /** 常见物资需求 */
  materials: string[];
  /** 预算参考结构 */
  budgetLines: BudgetTemplateLine[];
  /** 特有风险提示 */
  risks: RiskTemplate[];
  /** 预设特色环节 */
  highlights: string[];
}

export const PRESETS: ScenarioPreset[] = [
  {
    id: 'preset-welcome',
    name: '新生迎新活动',
    group: 'campus-education',
    categoryId: 'campus-welcome',
    tagline: '让新生第一天就找到归属感',
    intro: '面向刚入学的本科生与研究生，用「报到引导 + 学院介绍 + 班级破冰 + 社团嘉年华」把陌生校园变成熟悉的地方。核心不是表演，而是让每个人离场前至少认识三个人、加进一个群。',
    audience: '新生、家长、辅导员与社团骨干',
    goal: '帮新生完成从「到家」到「入学」的心理过渡，并沉淀班级与社团的初始关系',
    people: 400,
    budget: 8000,
    duration: 240,
    venue: 'indoor-large',
    flow: [
      { name: '分区签到', share: 0.15, detail: '按学院/专业分区签到，发放新生礼包与校园地图，家长单独设咨询位。' },
      { name: '校园导览', share: 0.2, detail: '学长学姐带队分批导览宿舍、食堂、图书馆与教学楼，每队 20 人。' },
      { name: '师长寄语', share: 0.15, detail: '院系介绍、学业与安全须知，控制在 35 分钟内，避免长篇讲话。' },
      { name: '班级破冰', share: 0.25, detail: '以班级为单位，辅导员带队完成 2 个低门槛互动，建立班级群。' },
      { name: '社团嘉年华', share: 0.17, detail: '社团展位与快闪表演，扫码报名，集章兑换小礼品。' },
      { name: '合影散场', share: 0.08, detail: '班级合影、指引返程与次日安排。' },
    ],
    roles: [
      { role: '总协调', fixed: 1, perPeople: 0, min: 1, max: 2, duty: '对接院系、统筹流程与突发处理' },
      { role: '签到引导', fixed: 3, perPeople: 80, min: 3, max: 16, duty: '分区签到、礼包发放、家长咨询' },
      { role: '班级带队', fixed: 4, perPeople: 40, min: 4, max: 20, duty: '导览带队、班级破冰、群管理' },
      { role: '舞台与音响', fixed: 2, perPeople: 0, min: 2, max: 2, duty: '社团展演音响、话筒与音乐' },
      { role: '机动志愿', fixed: 2, perPeople: 60, min: 2, max: 14, duty: '补位、指引、物资补给' },
      { role: '宣传记录', fixed: 1, perPeople: 0, min: 1, max: 3, duty: '拍照、短视频、推文素材' },
    ],
    materials: ['新生礼包', '校园地图', '分区指示牌', '姓名贴', '签到二维码', '手持喇叭', '打卡背景板', '饮用水', '急救包'],
    budgetLines: [
      { category: '礼包与物料', item: '新生礼包、地图、指示牌', ratio: 0.3, note: '按实际报到人数 +10% 备货' },
      { category: '场地布置', item: '背景板、打卡点、桌旗', ratio: 0.2, note: '优先复用院系库存' },
      { category: '设备租赁', item: '音响、话筒、投影', ratio: 0.12, note: '校内可借设备先登记' },
      { category: '餐饮饮水', item: '饮用水、志愿者餐', ratio: 0.1, note: '按工作人员数量备' },
      { category: '社团补贴', item: '社团展位与小礼品', ratio: 0.13, note: '按展位数量定额补贴' },
      { category: '宣传', item: '海报、推文、拍摄', ratio: 0.08, note: '' },
      { category: '应急机动', item: '补货与不可预见支出', ratio: 0.07, note: '保留至活动结束' },
    ],
    risks: [
      { title: '家长与新生人流交叉', cause: '签到口与咨询位过近', likelihood: 2, impact: 2, mitigation: '签到与家长咨询分区，设单向动线', contingency: '开放备用通道，分批放行', owner: '签到引导' },
      { title: '户外导览遇雨或高温', cause: '天气突变', likelihood: 2, impact: 3, mitigation: '导览改为室内路线，准备一次性雨衣', contingency: '启用室内备选路线并广播通知', owner: '总协调' },
      { title: '新生信息登记错误', cause: '手写登记、多人代填', likelihood: 2, impact: 2, mitigation: '扫码自助登记，现场核对手机号', contingency: '活动后 24 小时内补录核对', owner: '签到引导' },
      { title: '导览队伍走失', cause: '队伍过长、岔路多', likelihood: 2, impact: 2, mitigation: '每队不超过 20 人，队尾设收队人', contingency: '原地集合，广播联系', owner: '班级带队' },
    ],
    highlights: ['学长学姐一对一带逛', '班级第一次合影', '社团集章兑换'],
  },

  {
    id: 'preset-lecture',
    name: '学术讲座',
    group: 'conference',
    categoryId: 'academic-lecture',
    tagline: '把一个问题讲透，而不是讲满',
    intro: '一位讲者、一个真问题、一段能讨论的时间。讲座的价值往往在"讲完之后还能聊"，因此控时、提问设计与讲后的小范围交流比场地豪华更重要。',
    audience: '相关专业师生、研究者与跨学科听众',
    goal: '让听众带走一个可复述的观点，并促成讲者与院系的后续合作',
    people: 120,
    budget: 3000,
    duration: 120,
    venue: 'indoor-large',
    flow: [
      { name: '签到入场', share: 0.15, detail: '签到、发放资料与提问卡，引导入座。' },
      { name: '讲者介绍', share: 0.08, detail: '主持人用 3 分钟介绍讲者与主题背景。' },
      { name: '主题报告', share: 0.45, detail: '50 分钟主讲，留 10 分钟缓冲。' },
      { name: '集中提问', share: 0.17, detail: '主持人筛选提问卡，优先争议性问题。' },
      { name: '自由交流', share: 0.1, detail: '讲者与 15–20 位听众的小范围座谈。' },
      { name: '散场', share: 0.05, detail: '合影、资料回收与后续合作沟通。' },
    ],
    roles: [
      { role: '主持人', fixed: 1, perPeople: 0, min: 1, max: 1, duty: '介绍讲者、控场、筛选提问' },
      { role: '讲者接待', fixed: 2, perPeople: 0, min: 2, max: 3, duty: '接送、休息室、设备与资料' },
      { role: '签到', fixed: 2, perPeople: 60, min: 2, max: 4, duty: '签到、资料发放、座位引导' },
      { role: '设备技术', fixed: 1, perPeople: 0, min: 1, max: 2, duty: '投影、话筒、录音录像' },
      { role: '宣传记录', fixed: 1, perPeople: 0, min: 1, max: 2, duty: '海报、现场拍摄、讲座纪要' },
    ],
    materials: ['投影与翻页笔', '无线麦', '讲者席卡', '海报与易拉宝', '签到表', '录音设备', '饮用水', '讲义或二维码'],
    budgetLines: [
      { category: '讲者酬金', item: '讲课费与差旅', ratio: 0.4, note: '明确税前税后与报销口径' },
      { category: '场地', item: '报告厅租赁', ratio: 0.15, note: '按半天计，确认超时费' },
      { category: '设备', item: '投影、录音、话筒', ratio: 0.1, note: '优先借用院系设备' },
      { category: '宣传', item: '海报、推文、社群', ratio: 0.1, note: '' },
      { category: '资料印刷', item: '讲义、议题单', ratio: 0.08, note: '优先电子版' },
      { category: '茶歇', item: '饮用水与茶点', ratio: 0.07, note: '按到场人数 80% 备' },
      { category: '应急机动', item: '不可预见支出', ratio: 0.1, note: '' },
    ],
    risks: [
      { title: '讲者迟到或临时缺席', cause: '行程冲突、交通延误', likelihood: 2, impact: 3, mitigation: '提前一天确认行程，准备备选讲者或线上接入', contingency: '顺延开场，改为圆桌或播放录播', owner: '讲者接待' },
      { title: '提问冷场', cause: '听众顾虑、问题准备不足', likelihood: 3, impact: 1, mitigation: '签到发提问卡，主持人预留 3 个引导问题', contingency: '主持人代问并邀请举手', owner: '主持人' },
      { title: '设备故障', cause: '接口不兼容、未提前测试', likelihood: 2, impact: 2, mitigation: '提前 1 小时联调，准备转接头与备用电脑', contingency: '切换备用设备或改为无 PPT 讲述', owner: '设备技术' },
      { title: '严重超时', cause: '讲者投入、提问过多', likelihood: 3, impact: 2, mitigation: '设倒计时提示牌，主持人提前 5 分钟示意', contingency: '压缩问答，安排讲后单独交流', owner: '主持人' },
    ],
    highlights: ['讲后 20 分钟小圆桌', '提问卡筛选机制', '讲座纪要整理成文'],
  },

  {
    id: 'preset-startup',
    name: '创新创业比赛',
    group: 'tech',
    categoryId: 'startup-contest',
    tagline: '用一套可复核的规则，把好项目挑出来',
    intro: '比赛的公信力来自赛制与评分表，而不是奖金数字。路演 8 分钟 + 问答 5 分钟、评委去极值、成绩当场公示，是让参赛者服气的三个动作。',
    audience: '参赛团队、评委、投资人、创业导师',
    goal: '筛出可进入孵化或投资视野的项目，并让所有参赛者拿到可用的反馈',
    people: 200,
    budget: 50000,
    duration: 480,
    venue: 'indoor-large',
    flow: [
      { name: '签到抽签', share: 0.1, detail: '选手签到、抽取出场顺序、演示文件统一测试。' },
      { name: '开幕与规则', share: 0.08, detail: '介绍评委、赛制、评分维度与申诉流程。' },
      { name: '初赛路演', share: 0.3, detail: '每项目 8 分钟展示 + 5 分钟问答，超时 30 秒强制停止。' },
      { name: '午休', share: 0.08, detail: '评委初步合议，选手用餐与交流。' },
      { name: '决赛路演', share: 0.24, detail: '入围项目复赛，可增加投资人提问环节。' },
      { name: '评委合议', share: 0.1, detail: '去极值计分、成绩复核、争议处理。' },
      { name: '颁奖与对接', share: 0.1, detail: '成绩公示、颁奖、投资人与项目一对一对接。' },
    ],
    roles: [
      { role: '赛事负责人', fixed: 1, perPeople: 0, min: 1, max: 2, duty: '规则制定、评委邀请、争议裁定' },
      { role: '评委', fixed: 5, perPeople: 0, min: 3, max: 9, duty: '独立打分、提问、合议' },
      { role: '选手服务', fixed: 2, perPeople: 25, min: 2, max: 8, duty: '签到、抽签、候场、材料收集' },
      { role: '计时统分', fixed: 2, perPeople: 0, min: 2, max: 4, duty: '严格计时、分数录入与复核' },
      { role: '技术保障', fixed: 1, perPeople: 0, min: 1, max: 3, duty: '投影、麦克风、演示文件' },
      { role: '投资对接', fixed: 1, perPeople: 0, min: 1, max: 3, duty: '投资人邀约与一对一洽谈安排' },
    ],
    materials: ['倒计时器', '评分表或评分系统', '项目手册', '胸牌', '项目展板', '证书与奖杯', '直播设备', '茶歇'],
    budgetLines: [
      { category: '奖金', item: '赛事奖金与扶持金', ratio: 0.3, note: '明确税费承担与发放条件' },
      { category: '评审', item: '评委酬金与差旅', ratio: 0.15, note: '签署回避与保密协议' },
      { category: '场地', item: '路演厅与洽谈区', ratio: 0.15, note: '优先使用孵化器场地' },
      { category: '设备', item: '投影、计时、直播', ratio: 0.1, note: '倒计时必须可靠' },
      { category: '宣传', item: '项目招募与赛事传播', ratio: 0.1, note: '' },
      { category: '餐饮', item: '选手与评委茶歇', ratio: 0.08, note: '' },
      { category: '物料', item: '证书、手册、展板', ratio: 0.07, note: '' },
      { category: '应急机动', item: '不可预见支出', ratio: 0.05, note: '' },
    ],
    risks: [
      { title: '评分争议与公平性质疑', cause: '评分维度不透明、评委构成单一', likelihood: 2, impact: 3, mitigation: '赛前公布评分表，评委签回避声明，去极值计分', contingency: '现场复核评分表，必要时增设复议环节', owner: '赛事负责人' },
      { title: '路演超时', cause: '选手拖延、问答失控', likelihood: 3, impact: 2, mitigation: '大屏倒计时 + 铃声，超时 30 秒强制停止', contingency: '压缩茶歇，顺延后续项目', owner: '计时统分' },
      { title: '演示文件或设备故障', cause: '格式不兼容、临时修改', likelihood: 2, impact: 2, mitigation: '提前 1 小时统一收集并测试', contingency: '使用备份 PDF 或录屏', owner: '技术保障' },
      { title: '项目知识产权泄露', cause: '公开路演与拍摄传播', likelihood: 2, impact: 2, mitigation: '签署保密与拍摄授权，敏感项目可闭门路演', contingency: '撤下相关视频与材料', owner: '赛事负责人' },
    ],
    highlights: ['投资人一对一对接', '观众人气奖', '赛前商业计划书辅导'],
  },

  {
    id: 'preset-sports-match',
    name: '体育赛事',
    group: 'sports',
    categoryId: 'sports-match',
    tagline: '先保证公平与安全，再谈精彩',
    intro: '一场比赛的体验由三件事决定：赛程是否准时、判罚是否可信、受伤是否有人管。场地、裁判、医疗必须在报名开始前锁定，而不是活动当天再找。',
    audience: '参赛队伍、裁判、观众与教职工',
    goal: '在零重伤前提下完成全部赛程，并让每支队伍都有完整参赛体验',
    people: 200,
    budget: 12000,
    duration: 240,
    venue: 'stadium',
    flow: [
      { name: '检录与热身', share: 0.15, detail: '核对名单、发放号码布、集体热身与安全提示。' },
      { name: '开幕与规则', share: 0.08, detail: '队伍入场、裁判说明规则与争议处理流程。' },
      { name: '小组赛', share: 0.35, detail: '分组循环，记录比分、犯规与黄牌。' },
      { name: '中场互动', share: 0.07, detail: '啦啦队表演、观众互动与补水。' },
      { name: '决赛', share: 0.25, detail: '决赛与三四名赛，裁判长现场执裁。' },
      { name: '颁奖合影', share: 0.1, detail: '成绩公示、颁奖、合影与场地恢复。' },
    ],
    roles: [
      { role: '总指挥', fixed: 1, perPeople: 0, min: 1, max: 2, duty: '整体调度、争议终裁、应急启动' },
      { role: '裁判组', fixed: 4, perPeople: 40, min: 4, max: 20, duty: '执裁、判罚解释、比赛记录' },
      { role: '竞赛记录', fixed: 2, perPeople: 50, min: 2, max: 10, duty: '计分、计时、成绩公示' },
      { role: '医疗组', fixed: 2, perPeople: 0, min: 2, max: 6, duty: '场边急救、转运对接' },
      { role: '安保组', fixed: 2, perPeople: 150, min: 2, max: 10, duty: '入口管控、观众区隔离' },
      { role: '后勤组', fixed: 2, perPeople: 100, min: 2, max: 8, duty: '器材、补给、场地布置' },
    ],
    materials: ['比赛用球', '号码布', '计分牌', '哨子与裁判服', 'AED 与急救包', '隔离带', '饮用水', '奖杯奖牌', '对讲机'],
    budgetLines: [
      { category: '场地器材', item: '场地租赁与器材', ratio: 0.2, note: '校内场地优先' },
      { category: '裁判', item: '裁判酬金', ratio: 0.15, note: '按场次计酬并签确认单' },
      { category: '医疗保障', item: '医护、AED、急救包', ratio: 0.15, note: '不可压缩项' },
      { category: '物资补给', item: '饮用水、号码布、补给', ratio: 0.15, note: '按参赛人数 +20% 备水' },
      { category: '安保', item: '安保与隔离设施', ratio: 0.1, note: '大型赛事需报批' },
      { category: '奖品', item: '奖杯、奖牌、奖品', ratio: 0.1, note: '可寻求赞助' },
      { category: '宣传', item: '海报、摄影、直播', ratio: 0.05, note: '' },
      { category: '应急机动', item: '不可预见支出', ratio: 0.1, note: '含天气改期与转运' },
    ],
    risks: [
      { title: '对抗受伤', cause: '动作过大、热身不足', likelihood: 3, impact: 2, mitigation: '赛前热身、裁判控场、场边急救', contingency: '立即处置并送医，启动保险', owner: '医疗组' },
      { title: '判罚争议', cause: '规则理解不一致', likelihood: 2, impact: 2, mitigation: '赛前规则宣讲，裁判长终裁并记录', contingency: '调取录像复核，必要时重赛该回合', owner: '裁判组' },
      { title: '赛程延误', cause: '项目超时、队伍迟到', likelihood: 3, impact: 2, mitigation: '每场预留 10 分钟缓冲，设检录截止', contingency: '并行场地分流，压缩中场', owner: '竞赛记录' },
      { title: '观众与选手混行', cause: '无隔离、出入口单一', likelihood: 2, impact: 3, mitigation: '隔离带 + 单向动线，观众区与赛场分离', contingency: '增派安保、暂停比赛疏导', owner: '安保组' },
    ],
    highlights: ['中场啦啦队表演', 'MVP 评选', '赛后合影墙'],
  },

  {
    id: 'preset-charity-service',
    name: '公益志愿活动',
    group: 'charity',
    categoryId: 'charity-service',
    tagline: '把善意落到具体的人身上',
    intro: '志愿服务最怕"来了、拍了照、走了"。先确认服务对象的真实需求，再决定志愿者人数与分工；服务结束要有可核验的记录与回访，否则很难持续。',
    audience: '服务对象、志愿者、社区工作者',
    goal: '让服务对象获得可感知的帮助，并留下可复用的服务记录',
    people: 80,
    budget: 5000,
    duration: 240,
    venue: 'mixed',
    flow: [
      { name: '集合与岗前培训', share: 0.18, detail: '签到、分组、服务规范与话术培训，明确禁忌。' },
      { name: '分组出发', share: 0.1, detail: '按服务场景分组，领取物资与记录表。' },
      { name: '服务实施', share: 0.5, detail: '按分工开展服务，记录对象需求与反馈。' },
      { name: '分享与复盘', share: 0.17, detail: '志愿者分享、问题汇总、合影。' },
      { name: '收尾归档', share: 0.05, detail: '物资回收、服务记录与影像归档。' },
    ],
    roles: [
      { role: '项目负责人', fixed: 1, perPeople: 0, min: 1, max: 2, duty: '对接服务对象、统筹安全与合规' },
      { role: '志愿者领队', fixed: 2, perPeople: 20, min: 2, max: 8, duty: '分组带队、培训、考勤与情绪支持' },
      { role: '服务组', fixed: 4, perPeople: 5, min: 4, max: 40, duty: '直接提供服务、记录反馈' },
      { role: '物资后勤', fixed: 2, perPeople: 40, min: 2, max: 6, duty: '物资发放、回收与盘点' },
      { role: '记录宣传', fixed: 1, perPeople: 0, min: 1, max: 3, duty: '影像记录、服务数据整理' },
    ],
    materials: ['志愿者马甲', '服务物资清单', '签到考勤表', '急救包', '拍摄设备', '物资签收单', '饮用水'],
    budgetLines: [
      { category: '服务物资', item: '直接用于服务对象的物资', ratio: 0.4, note: '占比不低于 35%，保留采购凭证' },
      { category: '志愿者保障', item: '餐水、交通、保险', ratio: 0.2, note: '不发现金红包' },
      { category: '交通', item: '往返交通与物资运输', ratio: 0.1, note: '' },
      { category: '宣传', item: '招募与记录拍摄', ratio: 0.05, note: '肖像需单独授权' },
      { category: '保险', item: '志愿者意外险', ratio: 0.05, note: '按人投保' },
      { category: '管理与公示', item: '账目管理与公示制作', ratio: 0.05, note: '7 日内公示' },
      { category: '应急机动', item: '临时需求与补货', ratio: 0.15, note: '' },
    ],
    risks: [
      { title: '服务对象需求错配', cause: '未做前期调研', likelihood: 2, impact: 3, mitigation: '提前走访或电话确认需求清单', contingency: '现场调整服务内容，保留弹性物资', owner: '项目负责人' },
      { title: '志愿者安全与边界', cause: '场景复杂、缺乏培训', likelihood: 2, impact: 3, mitigation: '岗前培训、两人一组、购买意外险', contingency: '立即撤离并上报，安排心理支持', owner: '志愿者领队' },
      { title: '肖像与隐私泄露', cause: '拍摄未授权、登记不规范', likelihood: 2, impact: 3, mitigation: '拍摄前书面同意，隐去敏感信息', contingency: '撤下内容并销毁未授权素材', owner: '记录宣传' },
      { title: '物资去向质疑', cause: '签收缺失、账目不清', likelihood: 2, impact: 2, mitigation: '物资签收单 + 7 日内公示', contingency: '公开说明并接受核查', owner: '项目负责人' },
    ],
    highlights: ['服务对象心愿卡', '志愿者一对一结对', '服务时长证明'],
  },

  {
    id: 'preset-green',
    name: '环保宣传活动',
    group: 'charity',
    categoryId: 'charity-green',
    tagline: '把倡议变成可参与、可称重的行动',
    intro: '环保宣传最容易变成发传单。用"称重"和"兑换"把抽象理念变成可量化的成果：捡了多少、分类对了多少、多少人签了承诺，这些数字才是下一次活动的说服力。',
    audience: '社区居民、学生志愿者、环卫与物业',
    goal: '让参与者在两小时内完成一次真实环保行动，并带走一个能坚持的习惯',
    people: 150,
    budget: 6000,
    duration: 180,
    venue: 'outdoor',
    flow: [
      { name: '集合与科普', share: 0.15, detail: '签到、发放工具、5 分钟环保知识快讲。' },
      { name: '布展与游戏', share: 0.15, detail: '分类闯关、旧物改造展位开放。' },
      { name: '净滩/植树行动', share: 0.4, detail: '分组进入行动区，佩戴手套，按类别装袋。' },
      { name: '成果称重', share: 0.15, detail: '电子秤称重、分类统计、上榜展示。' },
      { name: '倡议签名', share: 0.1, detail: '承诺墙签名、合影、发放纪念品。' },
      { name: '收尾', share: 0.05, detail: '垃圾分类清运、工具回收、场地恢复。' },
    ],
    roles: [
      { role: '项目负责人', fixed: 1, perPeople: 0, min: 1, max: 2, duty: '对接属地环卫、统筹安全' },
      { role: '行动领队', fixed: 3, perPeople: 30, min: 3, max: 10, duty: '分组带队、路线与安全' },
      { role: '展位志愿', fixed: 3, perPeople: 50, min: 3, max: 8, duty: '游戏讲解、旧物改造指导' },
      { role: '称重记录', fixed: 2, perPeople: 0, min: 2, max: 4, duty: '称重、统计、上墙' },
      { role: '宣传记录', fixed: 1, perPeople: 0, min: 1, max: 2, duty: '拍摄、短视频、倡议文案' },
    ],
    materials: ['手套与夹子', '分类垃圾袋', '电子秤', '展板与易拉宝', '承诺签名墙', '饮用水', '急救包', '扩音器'],
    budgetLines: [
      { category: '工具物资', item: '手套、夹子、垃圾袋', ratio: 0.3, note: '按人均 1 套 +10% 备' },
      { category: '展陈', item: '展板、游戏道具、承诺墙', ratio: 0.2, note: '可复用设计' },
      { category: '宣传', item: '海报、短视频、物料', ratio: 0.15, note: '' },
      { category: '保险', item: '户外活动意外险', ratio: 0.05, note: '按参与人数投保' },
      { category: '清运', item: '垃圾分类清运', ratio: 0.1, note: '与环卫约定' },
      { category: '饮水', item: '饮用水与防暑物资', ratio: 0.08, note: '' },
      { category: '应急机动', item: '不可预见支出', ratio: 0.12, note: '' },
    ],
    risks: [
      { title: '户外伤害或中暑', cause: '高温、地形复杂、工具使用不当', likelihood: 2, impact: 3, mitigation: '避开正午、配备急救包与防暑物资、工具示范', contingency: '就近处置并送医，暂停行动', owner: '行动领队' },
      { title: '垃圾分类不合规', cause: '对属地分类标准不熟', likelihood: 2, impact: 2, mitigation: '提前对接环卫确认标准，现场设分类牌', contingency: '现场二次分拣并说明', owner: '称重记录' },
      { title: '天气突变', cause: '降雨、大风', likelihood: 2, impact: 3, mitigation: '查看 72 小时预报，设室内备用场地', contingency: '改为室内分类课堂或顺延', owner: '项目负责人' },
      { title: '影像授权不清', cause: '拍摄居民与儿童', likelihood: 1, impact: 2, mitigation: '拍摄前告知并取得同意，儿童需监护人同意', contingency: '撤下未授权素材', owner: '宣传记录' },
    ],
    highlights: ['垃圾称重排行榜', '分类闯关游戏', '旧物改造展示'],
  },

  {
    id: 'preset-business-meeting',
    name: '商务交流会议',
    group: 'business',
    categoryId: 'business-conference',
    tagline: '让一群人对同一件事形成共识',
    intro: '商务会议卖的是效率：谁来了、聊了什么、会后谁跟进。议程、嘉宾与对接环节设计好了，会议才有商业价值，否则只是一次昂贵的聚会。',
    audience: '客户、合作伙伴、行业从业者与媒体',
    goal: '完成信息传递并产生可跟进的商务线索',
    people: 300,
    budget: 150000,
    duration: 480,
    venue: 'hotel',
    flow: [
      { name: '签到迎宾', share: 0.12, detail: '电子签到、胸牌、迎宾饮品，VIP 单独通道。' },
      { name: '开幕致辞', share: 0.08, detail: '主办方致辞、嘉宾介绍与议程说明。' },
      { name: '主旨演讲', share: 0.25, detail: '2 场主旨演讲，每场 25 分钟 + 5 分钟提问。' },
      { name: '茶歇交流', share: 0.1, detail: '茶歇区与洽谈区并行，安排引导话题。' },
      { name: '圆桌对话', share: 0.2, detail: '4–5 位嘉宾圆桌，主持人控时。' },
      { name: '商务对接', share: 0.15, detail: '预约制一对一洽谈，登记合作意向。' },
      { name: '晚宴', share: 0.1, detail: '晚宴与自由交流，安排座位表。' },
    ],
    roles: [
      { role: '项目总监', fixed: 1, perPeople: 0, min: 1, max: 2, duty: '对客户负责，控制预算与关键节点' },
      { role: '会务统筹', fixed: 2, perPeople: 100, min: 2, max: 8, duty: '场地、搭建、供应商、餐饮' },
      { role: '嘉宾接待', fixed: 2, perPeople: 80, min: 2, max: 8, duty: '行程、接送、休息室、伴手礼' },
      { role: '签到引导', fixed: 3, perPeople: 80, min: 3, max: 12, duty: '签到、胸牌、动线引导' },
      { role: '媒体传播', fixed: 1, perPeople: 0, min: 1, max: 5, duty: '媒体邀约、采访、直播与通稿' },
      { role: '技术支持', fixed: 2, perPeople: 0, min: 2, max: 6, duty: 'AV 调试、PPT、备用方案' },
      { role: '安保应急', fixed: 1, perPeople: 200, min: 1, max: 6, duty: '入口管控、消防通道、突发事件' },
    ],
    materials: ['签到系统', 'LED 屏', '音响', '胸牌', '会议手册', '指引牌', '直播设备', '伴手礼', '对讲机'],
    budgetLines: [
      { category: '场地', item: '场地租赁与基础服务', ratio: 0.25, note: '按半天计，确认超时费' },
      { category: '搭建与 AV', item: '舞台、LED、音响、灯光', ratio: 0.25, note: '搭建图需提前审' },
      { category: '餐饮', item: '茶歇、午餐、晚宴', ratio: 0.15, note: '按确认人数 +10% 备餐' },
      { category: '嘉宾', item: '讲师酬金与差旅', ratio: 0.15, note: '明确税前税后' },
      { category: '媒体', item: '媒体邀约、直播、通稿', ratio: 0.1, note: '预留车马费' },
      { category: '物料', item: '伴手礼、手册、胸牌', ratio: 0.07, note: '按 VIP 分级' },
      { category: '应急机动', item: '不可预见支出', ratio: 0.03, note: '含搭建与餐饮超支' },
    ],
    risks: [
      { title: '演示或设备故障', cause: '未彩排、接口不兼容', likelihood: 3, impact: 3, mitigation: '全流程彩排，准备备用电脑与离线视频', contingency: '切换备用设备，主持人承接', owner: '技术支持' },
      { title: '关键嘉宾缺席', cause: '行程变更', likelihood: 2, impact: 3, mitigation: '提前确认，准备备选讲者或录播', contingency: '调整议程为圆桌', owner: '嘉宾接待' },
      { title: '现场超员', cause: '报名审核不严', likelihood: 2, impact: 3, mitigation: '实名预约，按容量 80% 放票', contingency: '启用备用区，协调消防', owner: '安保应急' },
      { title: '负面舆情', cause: '敏感提问、采访失控', likelihood: 2, impact: 3, mitigation: '准备 Q&A 口径，指定唯一发言人', contingency: '引导至专访，会后统一回应', owner: '媒体传播' },
    ],
    highlights: ['预约制一对一商务配对', 'CEO 圆桌', '会后线索跟进报告'],
  },

  {
    id: 'preset-music-festival',
    name: '音乐节与文艺演出',
    group: 'culture',
    categoryId: 'arts-festival',
    tagline: '舞台上是内容，舞台外是秩序',
    intro: '音乐节的成败在人流与舞台技术，而不只是阵容。分时入场、分区围栏、医疗点与散场接驳，必须在开票前定好，否则再好的乐队也救不回体验。',
    audience: '学生与本地乐迷、参演乐队、媒体',
    goal: '安全完成一场有记忆点的演出，并形成可持续传播的现场素材',
    people: 2000,
    budget: 300000,
    duration: 480,
    venue: 'outdoor',
    flow: [
      { name: '入场与安检', share: 0.2, detail: '分时验票、安检、寄存，按区域引导。' },
      { name: '暖场', share: 0.1, detail: '暖场 DJ 或本地乐队，聚集人气。' },
      { name: '乐队轮演', share: 0.35, detail: '按阵容表轮换，换场控制在 15 分钟内。' },
      { name: '市集互动', share: 0.1, detail: '市集、打卡装置、签售同时开放。' },
      { name: '主舞台压轴', share: 0.17, detail: '压轴艺人演出，安保进入最高等级。' },
      { name: '散场接驳', share: 0.08, detail: '分批散场、接驳车、清场与物资回收。' },
    ],
    roles: [
      { role: '总导演', fixed: 1, perPeople: 0, min: 1, max: 2, duty: '艺术与技术总控、应急决策' },
      { role: '舞台监督', fixed: 2, perPeople: 100, min: 2, max: 6, duty: '节目衔接、后台秩序、cue 号' },
      { role: '技术组', fixed: 4, perPeople: 150, min: 4, max: 15, duty: '灯光、音响、视频、电力' },
      { role: '节目统筹', fixed: 1, perPeople: 80, min: 1, max: 4, duty: '阵容、排练、顺序编排' },
      { role: '安保与引导', fixed: 6, perPeople: 100, min: 6, max: 40, duty: '验票、安检、人流疏导、疏散' },
      { role: '票务宣传', fixed: 1, perPeople: 150, min: 1, max: 6, duty: '宣传、售票、核销' },
      { role: '后台保障', fixed: 2, perPeople: 80, min: 2, max: 8, duty: '化妆间、饮水、道具、服装' },
    ],
    materials: ['舞台桁架', '灯光音响', 'LED 屏', '对讲机', '隔离栏', '验票设备', '急救点物资', '雨棚', '接驳车'],
    budgetLines: [
      { category: '舞台技术', item: '灯光、音响、LED、舞台', ratio: 0.3, note: '电力与承重需场馆确认' },
      { category: '艺人', item: '演出阵容与差旅', ratio: 0.2, note: '合同约定变更条款' },
      { category: '场地', item: '场地租赁与安保要求', ratio: 0.15, note: '确认撤场时间' },
      { category: '安保医疗', item: '安保、医疗、隔离设施', ratio: 0.1, note: '按人流密度配置' },
      { category: '宣传票务', item: '海报、短视频、票务', ratio: 0.1, note: '预留平台手续费' },
      { category: '物料', item: '工作证、市集物料、雨棚', ratio: 0.08, note: '' },
      { category: '应急机动', item: '天气、设备抢修、退票', ratio: 0.07, note: '' },
    ],
    risks: [
      { title: '拥挤踩踏', cause: '人流密度过高、通道不足', likelihood: 2, impact: 3, mitigation: '限流售票、分区围栏、单向动线、医疗点', contingency: '暂停演出、启动疏散与广播引导', owner: '安保与引导' },
      { title: '舞台设备故障', cause: '线路老化、临时加设备', likelihood: 2, impact: 3, mitigation: '提前一天调试，关键设备双备份', contingency: '切换备用通道，主持人救场', owner: '技术组' },
      { title: '艺人临时变更', cause: '行程或身体原因', likelihood: 2, impact: 2, mitigation: '合同约定变更条款，准备替补阵容', contingency: '调整阵容并公告退票规则', owner: '节目统筹' },
      { title: '噪音扰民投诉', cause: '音量超标、超时演出', likelihood: 2, impact: 2, mitigation: '提前报备，设分贝上限与结束时间', contingency: '降噪、提前结束并致歉', owner: '总导演' },
      { title: '天气突变', cause: '降雨、大风', likelihood: 2, impact: 3, mitigation: '查看预报，准备雨棚与熔断标准', contingency: '暂停或延期，公告退票', owner: '总导演' },
    ],
    highlights: ['市集与打卡装置', '应援物交换', '散场接驳车'],
  },

  {
    id: 'preset-jobfair',
    name: '招聘与职业交流会',
    group: 'business',
    categoryId: 'career-jobfair',
    tagline: '让简历递到对的人手里',
    intro: '招聘会的价值不在到场企业数量，而在匹配。按专业邀企业、提前公布岗位、现场设简历门诊，三项做到位，投递才有质量，企业才会再来。',
    audience: '应届毕业生、实习生、用人单位 HR',
    goal: '提升人岗匹配效率，促成面试与录用',
    people: 1000,
    budget: 30000,
    duration: 300,
    venue: 'expo',
    flow: [
      { name: '布展与签到', share: 0.15, detail: '企业布展、学生扫码入场、发放导览图。' },
      { name: '开幕', share: 0.07, detail: '致辞、企业代表发言、流程与规则说明。' },
      { name: '双选洽谈', share: 0.5, detail: '按动线投递简历、现场初面、面试登记。' },
      { name: '简历门诊', share: 0.13, detail: '专业教师一对一修改简历，限号进行。' },
      { name: '企业宣讲', share: 0.1, detail: '重点企业 15 分钟快闪宣讲。' },
      { name: '收尾统计', share: 0.05, detail: '撤展、简历与意向统计、场地恢复。' },
    ],
    roles: [
      { role: '总协调', fixed: 1, perPeople: 0, min: 1, max: 2, duty: '企业邀约、场地、整体调度' },
      { role: '企业服务', fixed: 3, perPeople: 20, min: 3, max: 20, duty: '企业签到、展位引导、需求响应' },
      { role: '学生引导', fixed: 4, perPeople: 100, min: 4, max: 20, duty: '入场引导、动线维护、咨询' },
      { role: '简历数据', fixed: 2, perPeople: 200, min: 2, max: 6, duty: '简历收集、投递统计、会后跟进' },
      { role: '宣传直播', fixed: 1, perPeople: 300, min: 1, max: 4, duty: '现场传播、企业采访、线上同步' },
      { role: '安保后勤', fixed: 2, perPeople: 200, min: 2, max: 10, duty: '入口管控、消防通道、物资' },
    ],
    materials: ['标准展位', '企业楣板', '签到门禁', '简历袋', '导览图', '面试洽谈桌椅', '饮用水', '应急电源'],
    budgetLines: [
      { category: '展位搭建', item: '标准展位与桁架', ratio: 0.28, note: '统一配置降低企业成本' },
      { category: '企业接待', item: '企业邀约与接待', ratio: 0.15, note: '按确认企业数准备' },
      { category: '场地', item: '场馆租赁与保洁', ratio: 0.15, note: '确认布撤展窗口' },
      { category: '宣传', item: '岗位预告与推广', ratio: 0.15, note: '提前 2 周发布' },
      { category: '物料', item: '指引、简历袋、胸牌', ratio: 0.12, note: '' },
      { category: '餐饮', item: '企业人员餐水', ratio: 0.05, note: '' },
      { category: '应急机动', item: '临时增补展位', ratio: 0.1, note: '' },
    ],
    risks: [
      { title: '企业到场率低', cause: '邀约确认不实、招聘需求变化', likelihood: 2, impact: 3, mitigation: '提前 3 天二次确认，签参会确认函', contingency: '调整展位布局，合并空展位', owner: '企业服务' },
      { title: '学生人流集中', cause: '开场集中入场、热门企业排队', likelihood: 3, impact: 2, mitigation: '分时段预约入场，热门企业设排队区', contingency: '开放备用入口，引导至分会场', owner: '学生引导' },
      { title: '岗位与专业不匹配', cause: '企业结构单一', likelihood: 2, impact: 2, mitigation: '按专业分布邀请，提前公布岗位表', contingency: '增设综合岗位区与实习专区', owner: '总协调' },
      { title: '简历与个人信息泄露', cause: '纸质简历随意堆放', likelihood: 2, impact: 3, mitigation: '统一回收箱，企业签信息使用承诺', contingency: '回收并销毁遗留简历', owner: '简历数据' },
    ],
    highlights: ['简历门诊', '模拟面试', '企业快闪宣讲'],
  },

  {
    id: 'preset-science',
    name: '科普教育活动',
    group: 'campus-education',
    categoryId: 'education-popular',
    tagline: '先让他动手，再告诉他原理',
    intro: '科普不是把知识搬上台。一个能亲手操作的展项，胜过二十分钟讲解；动线要让家庭观众能边走边玩，还要保证每个实验都能安全收场。',
    audience: '中小学生、家长、科技教师与志愿者',
    goal: '让参与者在体验中理解三个科学原理，并愿意参加下一次活动',
    people: 200,
    budget: 15000,
    duration: 240,
    venue: 'mixed',
    flow: [
      { name: '签到与导览', share: 0.15, detail: '签到、发放探索手册、说明展区与规则。' },
      { name: '演示实验', share: 0.2, detail: '主舞台液氮/静电演示，讲解安全要点。' },
      { name: '展区轮转', share: 0.35, detail: '分展区体验，每区 15 分钟，助教指导。' },
      { name: '科学挑战', share: 0.15, detail: '知识问答与动手挑战，积分兑奖。' },
      { name: '兑奖与分享', share: 0.1, detail: '集章兑奖、合影、问卷。' },
      { name: '收尾', share: 0.05, detail: '器材回收、展区复位、场地清洁。' },
    ],
    roles: [
      { role: '课程负责人', fixed: 1, perPeople: 0, min: 1, max: 2, duty: '内容设计、讲解质量、安全把关' },
      { role: '讲解员', fixed: 2, perPeople: 40, min: 2, max: 8, duty: '演示实验、集中讲解' },
      { role: '展区助教', fixed: 4, perPeople: 20, min: 4, max: 20, duty: '分区指导、秩序与安全' },
      { role: '安全巡视', fixed: 1, perPeople: 100, min: 1, max: 4, duty: '动线巡视、应急处理' },
      { role: '记录宣传', fixed: 1, perPeople: 0, min: 1, max: 2, duty: '拍摄、素材整理' },
    ],
    materials: ['实验器材', '展板', '任务卡与集章册', '防护用品', '奖品', '扩音器', '急救包', '桌椅'],
    budgetLines: [
      { category: '教具材料', item: '实验与手工材料', ratio: 0.3, note: '按人均 1 套 +10% 损耗' },
      { category: '展项制作', item: '展板、装置、道具', ratio: 0.2, note: '可复用设计' },
      { category: '讲师助教', item: '讲师酬金与助教补贴', ratio: 0.15, note: '' },
      { category: '场地', item: '场地租赁', ratio: 0.1, note: '确认桌椅与电源' },
      { category: '宣传', item: '招募与物料', ratio: 0.1, note: '面向家长说明适龄段' },
      { category: '保险', item: '活动意外险', ratio: 0.05, note: '' },
      { category: '应急机动', item: '材料补货与医疗', ratio: 0.1, note: '' },
    ],
    risks: [
      { title: '实验操作受伤', cause: '器材使用不当、防护不足', likelihood: 2, impact: 3, mitigation: '风险实验由讲师操作，观众保持 2 米，配防护用品', contingency: '立即停止、急救并通知家长', owner: '安全巡视' },
      { title: '儿童走失', cause: '人流密集、家长分心', likelihood: 2, impact: 3, mitigation: '发放亲子手环并登记联系方式，出口设值守', contingency: '广播寻人，启动出入口管控', owner: '安全巡视' },
      { title: '材料不足或浪费', cause: '报名超预期', likelihood: 2, impact: 1, mitigation: '按报名 +10% 备料，设共享材料', contingency: '两人一组共用，紧急补货', owner: '展区助教' },
      { title: '内容难度不适配', cause: '未了解参与者年龄', likelihood: 2, impact: 2, mitigation: '报名时收集年龄，准备分层任务卡', contingency: '现场分组，助教一对一', owner: '课程负责人' },
    ],
    highlights: ['集章闯关', '液氮与静电演示', '科学小制作带走'],
  },

  {
    id: 'preset-community-festival',
    name: '社区文化节',
    group: 'community',
    categoryId: 'community-festival',
    tagline: '把邻里从「住在一起」变成「认识彼此」',
    intro: '社区文化节的主角是居民，不是外请团队。摊位由居民报名、节目由社团自排、志愿者来自楼栋，组织者只需要把动线、噪音与安全兜住。',
    audience: '社区居民、业委会、社工与志愿者',
    goal: '提升社区参与度与邻里关系，并沉淀一个可延续的居民社群',
    people: 500,
    budget: 40000,
    duration: 240,
    venue: 'mixed',
    flow: [
      { name: '开市与布置', share: 0.15, detail: '摊主入场、摊位布置、志愿者分组。' },
      { name: '民俗巡游', share: 0.12, detail: '居民队伍巡游开场，营造节日气氛。' },
      { name: '舞台展演', share: 0.25, detail: '居民与社团节目轮番上演。' },
      { name: '手作工坊', share: 0.2, detail: '非遗与亲子手作，按场次报名。' },
      { name: '邻里市集', share: 0.18, detail: '居民摊位、旧物交换、公益义卖。' },
      { name: '闭幕抽奖', share: 0.1, detail: '抽奖、合影、摊主撤场。' },
    ],
    roles: [
      { role: '社区协调', fixed: 1, perPeople: 0, min: 1, max: 2, duty: '对接居委会、物业与商户' },
      { role: '舞台统筹', fixed: 1, perPeople: 100, min: 1, max: 3, duty: '节目、音响、主持' },
      { role: '摊位管理', fixed: 2, perPeople: 50, min: 2, max: 10, duty: '摊位报名、分区、卫生' },
      { role: '志愿者领队', fixed: 3, perPeople: 30, min: 3, max: 12, duty: '楼栋动员、现场引导' },
      { role: '安保与保洁', fixed: 2, perPeople: 150, min: 2, max: 8, duty: '人流、消防通道、垃圾清运' },
      { role: '宣传记录', fixed: 1, perPeople: 0, min: 1, max: 3, duty: '招募、拍摄、社区群运营' },
    ],
    materials: ['帐篷摊位', '舞台音响', '桌椅', '指示牌', '手作材料', '抽奖奖品', '分类垃圾桶', '急救包', '扩音器'],
    budgetLines: [
      { category: '舞台音响', item: '舞台、音响、灯光', ratio: 0.22, note: '优先用社区现有设备' },
      { category: '摊位帐篷', item: '帐篷、桌椅、指示', ratio: 0.2, note: '按摊位数配置' },
      { category: '民俗团队', item: '巡游与演出补贴', ratio: 0.15, note: '居民团队给定额补贴' },
      { category: '宣传物料', item: '海报、横幅、集章卡', ratio: 0.13, note: '' },
      { category: '手作材料', item: '工坊耗材', ratio: 0.12, note: '按场次备料' },
      { category: '安保保洁', item: '安保、保洁、垃圾清运', ratio: 0.1, note: '' },
      { category: '应急机动', item: '天气与补货', ratio: 0.08, note: '' },
    ],
    risks: [
      { title: '天气影响', cause: '户外摊位遇雨或大风', likelihood: 2, impact: 3, mitigation: '查看预报，帐篷配重，准备室内备用场地', contingency: '转入室内或顺延一周', owner: '社区协调' },
      { title: '人流与儿童走失', cause: '摊位密集、看护不足', likelihood: 2, impact: 3, mitigation: '分时活动、儿童手环、出口值守', contingency: '广播寻人并管控出入口', owner: '安保与保洁' },
      { title: '食品卫生', cause: '居民自制食品无监管', likelihood: 2, impact: 2, mitigation: '要求摊主报备食材与制作时间，不售生食', contingency: '下架问题食品并说明', owner: '摊位管理' },
      { title: '噪音扰民', cause: '音响过大、超时', likelihood: 2, impact: 2, mitigation: '约定分贝上限与结束时间，提前告知周边', contingency: '降噪或提前结束', owner: '舞台统筹' },
    ],
    highlights: ['居民才艺舞台', '非遗手作工坊', '邻里旧物交换'],
  },

  {
    id: 'preset-annual',
    name: '企业年会与颁奖典礼',
    group: 'business',
    categoryId: 'business-annual',
    tagline: '一年一次的仪式感，给对的人',
    intro: '年会不是节目汇演。表彰谁、怎么讲他的故事、抽奖是否公平，决定了员工第二天还愿不愿意留下来。把预算花在"被看见"上，比花在布景上更值。',
    audience: '全体员工、管理层、优秀员工与家属',
    goal: '回顾年度成果、表彰贡献者并提升员工归属感',
    people: 200,
    budget: 80000,
    duration: 240,
    venue: 'hotel',
    flow: [
      { name: '签到合影', share: 0.15, detail: '签到、领取伴手礼、合影墙拍照。' },
      { name: '年度回顾', share: 0.15, detail: '年度视频、CEO 致辞与关键数据。' },
      { name: '表彰颁奖', share: 0.2, detail: '奖项设置、颁奖词、获奖者短片。' },
      { name: '晚宴', share: 0.25, detail: '用餐与部门节目穿插。' },
      { name: '抽奖互动', share: 0.2, detail: '多轮抽奖、互动游戏、合影。' },
      { name: '散场', share: 0.05, detail: '伴手礼发放、代驾与交通安排。' },
    ],
    roles: [
      { role: '项目总监', fixed: 1, perPeople: 0, min: 1, max: 2, duty: '对管理层负责，控制预算与节奏' },
      { role: '会务统筹', fixed: 2, perPeople: 100, min: 2, max: 6, duty: '场地、餐饮、供应商' },
      { role: '节目编导', fixed: 1, perPeople: 0, min: 1, max: 2, duty: '节目征集、彩排、顺序' },
      { role: '奖品管理', fixed: 1, perPeople: 0, min: 1, max: 2, duty: '奖项、抽奖系统、发放登记' },
      { role: '签到礼仪', fixed: 2, perPeople: 80, min: 2, max: 8, duty: '签到、引导、合影' },
      { role: '技术支持', fixed: 1, perPeople: 0, min: 1, max: 3, duty: 'LED、音响、抽奖系统' },
    ],
    materials: ['背景板', 'LED 屏', '音响', '奖杯证书', '抽奖系统', '伴手礼', '桌卡', '摄影设备', '代驾券'],
    budgetLines: [
      { category: '场地', item: '宴会厅租赁', ratio: 0.22, note: '确认最低消费与超时费' },
      { category: '餐饮', item: '晚宴与酒水', ratio: 0.28, note: '按确认人数 +5% 备餐' },
      { category: '舞台 AV', item: '舞台、LED、音响、灯光', ratio: 0.18, note: '需与场地承重匹配' },
      { category: '奖品', item: '抽奖奖品与伴手礼', ratio: 0.15, note: '按人数与奖项分级' },
      { category: '节目', item: '节目编排与演出', ratio: 0.08, note: '优先员工自演' },
      { category: '物料', item: '奖杯、桌卡、背景板', ratio: 0.05, note: '' },
      { category: '应急机动', item: '交通与不可预见', ratio: 0.04, note: '' },
    ],
    risks: [
      { title: '酒后安全与交通', cause: '饮酒过量、代驾不足', likelihood: 2, impact: 3, mitigation: '提前预约代驾或大巴，控制酒水供应', contingency: '专人护送，必要时送医', owner: '会务统筹' },
      { title: '抽奖争议', cause: '规则不清、重复中奖', likelihood: 2, impact: 1, mitigation: '提前公示规则，系统随机，全程录屏', contingency: '现场复核并补抽', owner: '奖品管理' },
      { title: '节目冷场或超时', cause: '排练不足、流程松散', likelihood: 2, impact: 2, mitigation: '彩排两次，设主持人控时', contingency: '压缩节目，提前进入抽奖', owner: '节目编导' },
      { title: '关键环节设备故障', cause: 'LED/音响未联调', likelihood: 2, impact: 2, mitigation: '提前 2 小时进场联调，准备备用音频', contingency: '切备用方案，主持人承接', owner: '技术支持' },
    ],
    highlights: ['年度照片墙', '员工故事短片', '多轮抽奖与家属感谢环节'],
  },
];

const presetIndex = new Map(PRESETS.map((preset) => [preset.id, preset]));

export const getPreset = (id?: string | null): ScenarioPreset | undefined =>
  id ? presetIndex.get(id) : undefined;

export const presetsInGroup = (groupId: string) => PRESETS.filter((preset) => preset.group === groupId);
