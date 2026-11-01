import type {
  EventCategory,
  FamilyId,
  FamilyMeta,
  ModuleId,
  ModuleMeta,
  ScenarioGroup,
  VenueKind,
  Weight,
} from '../types';

/* ============================================================
 * 一、通用策划框架：12 个模块
 * 顺序即方案章节顺序；权重由活动类型覆盖，控制深度与视觉层级。
 * ============================================================ */

export const MODULES: ModuleMeta[] = [
  { id: 'basic', order: 1, title: '活动基本信息', hint: '这是什么活动、为什么现在办' },
  { id: 'goals', order: 2, title: '活动目标', hint: '要达到什么、怎么算达到' },
  { id: 'audience', order: 3, title: '参与对象', hint: '为谁而办、来多少人、怎么构成' },
  { id: 'logistics', order: 4, title: '时间地点', hint: '什么时候、在哪、场地有什么硬要求' },
  { id: 'program', order: 5, title: '活动内容', hint: '现场发生什么、环节如何衔接' },
  { id: 'organization', order: 6, title: '人员组织', hint: '谁负责什么、需要多少人' },
  { id: 'resources', order: 7, title: '资源需求', hint: '要买什么、借什么、准备什么' },
  { id: 'budget', order: 8, title: '经费预算', hint: '钱怎么分、哪里能省' },
  { id: 'promotion', order: 9, title: '宣传招募', hint: '怎么让人知道、怎么报名' },
  { id: 'execution', order: 10, title: '执行安排', hint: '从筹备到收尾的时间表' },
  { id: 'risk', order: 11, title: '风险管理', hint: '可能出什么事、怎么兜底' },
  { id: 'evaluation', order: 12, title: '效果评估', hint: '怎么衡量成功、留下什么' },
];

export const MODULE_IDS: ModuleId[] = MODULES.map((m) => m.id);

const moduleIndex = new Map(MODULES.map((m) => [m.id, m]));
export const getModule = (id: ModuleId) => moduleIndex.get(id)!;

/* ============================================================
 * 二、活动大类族：共享议程风格、预算结构、角色与风险知识
 * ============================================================ */

const baseWeights: Record<ModuleId, Weight> = {
  basic: 'normal',
  goals: 'normal',
  audience: 'normal',
  logistics: 'normal',
  program: 'normal',
  organization: 'normal',
  resources: 'normal',
  budget: 'normal',
  promotion: 'normal',
  execution: 'normal',
  risk: 'normal',
  evaluation: 'normal',
};

const w = (patch: Partial<Record<ModuleId, Weight>>): Record<ModuleId, Weight> => ({
  ...baseWeights,
  ...patch,
});

export const FAMILIES: FamilyMeta[] = [
  {
    id: 'campus',
    label: '校园活动',
    summary: '以参与感和传播力取胜，组织成本可控',
    emphasis: w({ program: 'key', promotion: 'key', audience: 'normal', evaluation: 'brief' }),
  },
  {
    id: 'academic',
    label: '学术活动',
    summary: '以内容质量与议程秩序为核心',
    emphasis: w({ program: 'key', organization: 'key', risk: 'brief', evaluation: 'brief' }),
  },
  {
    id: 'sports',
    label: '体育户外',
    summary: '以竞赛规则、医疗保障与现场安全为底线',
    emphasis: w({ program: 'key', logistics: 'key', risk: 'key', organization: 'key' }),
  },
  {
    id: 'charity',
    label: '公益志愿',
    summary: '以服务对象需求与实际成效为导向',
    emphasis: w({ audience: 'key', program: 'key', organization: 'key', evaluation: 'key', promotion: 'normal' }),
  },
  {
    id: 'business',
    label: '商业活动',
    summary: '以流程精度、嘉宾体验与传播效果为目标',
    emphasis: w({ program: 'key', organization: 'key', promotion: 'key', logistics: 'key', budget: 'key' }),
  },
  {
    id: 'startup',
    label: '创新创业',
    summary: '以赛制公平、评审专业与资源对接为价值',
    emphasis: w({ program: 'key', resources: 'key', evaluation: 'key', promotion: 'normal' }),
  },
  {
    id: 'arts',
    label: '文化艺术',
    summary: '以舞台呈现、节目编排与现场秩序为重',
    emphasis: w({ program: 'key', logistics: 'key', risk: 'key', promotion: 'key' }),
  },
  {
    id: 'education',
    label: '教育科普',
    summary: '以知识传递效率与参与式体验为目标',
    emphasis: w({ program: 'key', audience: 'key', evaluation: 'key', promotion: 'normal' }),
  },
  {
    id: 'career',
    label: '就业职业',
    summary: '以人岗匹配效率与现场动线为核心',
    emphasis: w({ audience: 'key', organization: 'key', program: 'key', promotion: 'key' }),
  },
  {
    id: 'social',
    label: '社交聚会',
    summary: '以氛围、体验与低组织成本为优先',
    emphasis: w({ program: 'key', organization: 'brief', promotion: 'brief', goals: 'brief', evaluation: 'brief' }),
  },
  {
    id: 'generic',
    label: '通用活动',
    summary: '标准十二模块，按实际情况裁剪',
    emphasis: w({}),
  },
];

const familyIndex = new Map(FAMILIES.map((f) => [f.id, f]));
export const getFamily = (id: FamilyId) => familyIndex.get(id) ?? familyIndex.get('generic')!;

/* ============================================================
 * 三、活动类型库
 * keywords 用于从自由文本识别类型；default* 仅在没有用户输入时
 * 作为"合理假设"的来源，界面上会明确标注为假设。
 * ============================================================ */

export const CATEGORIES: EventCategory[] = [
  /* ---------- 校园 ---------- */
  {
    id: 'campus-welcome',
    label: '校园迎新',
    family: 'campus',
    keywords: ['迎新', '新生入学', '新生报到', '入学教育', '开学典礼', '迎新晚会'],
    summary: '让新生快速建立归属感，流程要顺、信息要清楚',
    defaultPeople: 400,
    defaultBudget: 8000,
    defaultDuration: 240,
    defaultVenue: 'indoor-large',
    defaultAudience: '新入学本科生、研究生与家长',
    emphasis: { audience: 'key', program: 'key', promotion: 'key' },
  },
  {
    id: 'campus-club',
    label: '社团招新',
    family: 'campus',
    keywords: ['社团招新', '百团大战', '招新', '纳新', '社团招募', '社团纳新'],
    summary: '在有限摊位与时间里让新生记住你',
    defaultPeople: 300,
    defaultBudget: 2000,
    defaultDuration: 300,
    defaultVenue: 'outdoor',
    defaultAudience: '全校学生',
  },
  {
    id: 'campus-anniversary',
    label: '校庆/周年活动',
    family: 'campus',
    keywords: ['校庆', '周年庆', '周年活动', '建校'],
    summary: '兼顾仪式感、校友接待与对外传播',
    defaultPeople: 800,
    defaultBudget: 30000,
    defaultDuration: 180,
    defaultVenue: 'stadium',
    defaultAudience: '校友、师生与嘉宾',
    emphasis: { organization: 'key', promotion: 'key' },
  },

  /* ---------- 学术 ---------- */
  {
    id: 'academic-lecture',
    label: '学术讲座',
    family: 'academic',
    keywords: ['学术讲座', '讲座', '学术报告', '报告会', '名家讲坛', 'lecture'],
    summary: '讲者、主题与到场体验决定成败',
    defaultPeople: 120,
    defaultBudget: 3000,
    defaultDuration: 120,
    defaultVenue: 'indoor-large',
    defaultAudience: '相关专业师生',
    emphasis: { organization: 'key', promotion: 'normal' },
  },
  {
    id: 'academic-conference',
    label: '学术会议/研讨会',
    family: 'academic',
    keywords: ['学术会议', '学术研讨会', '研讨会', '学术论坛', '学术年会', 'symposium', 'conference'],
    summary: '议程、嘉宾与论文交流是核心资产',
    defaultPeople: 200,
    defaultBudget: 40000,
    defaultDuration: 480,
    defaultVenue: 'hotel',
    defaultAudience: '领域研究者、教师与研究生',
    emphasis: { program: 'key', organization: 'key', resources: 'normal' },
  },
  {
    id: 'academic-contest',
    label: '学术/学科竞赛',
    family: 'academic',
    keywords: ['学科竞赛', '学术竞赛', '数学建模', '程序设计竞赛', '辩论赛', '知识竞赛', '竞赛'],
    summary: '规则公平、评审专业、结果可申诉',
    defaultPeople: 150,
    defaultBudget: 15000,
    defaultDuration: 480,
    defaultVenue: 'indoor-large',
    defaultAudience: '参赛选手与指导教师',
    emphasis: { program: 'key', evaluation: 'key', risk: 'normal' },
  },
  {
    id: 'academic-salon',
    label: '学术沙龙/读书会',
    family: 'academic',
    keywords: ['学术沙龙', '沙龙', '读书会', '论文分享', '组会'],
    summary: '小而深，靠议题与讨论质量',
    defaultPeople: 30,
    defaultBudget: 800,
    defaultDuration: 120,
    defaultVenue: 'indoor-small',
    defaultAudience: '同方向研究者与学生',
    emphasis: { program: 'key', audience: 'normal', promotion: 'brief' },
  },

  /* ---------- 体育 ---------- */
  {
    id: 'sports-match',
    label: '体育比赛',
    family: 'sports',
    keywords: ['篮球赛', '足球赛', '排球赛', '羽毛球赛', '乒乓球赛', '联赛', '锦标赛', '体育比赛', '比赛'],
    summary: '赛制、裁判与场地保障先于一切创意',
    defaultPeople: 200,
    defaultBudget: 12000,
    defaultDuration: 240,
    defaultVenue: 'stadium',
    defaultAudience: '参赛队伍、观众与教职工',
    emphasis: { logistics: 'key', risk: 'key', organization: 'key' },
  },
  {
    id: 'sports-meet',
    label: '运动会',
    family: 'sports',
    keywords: ['运动会', '田径', '校运会', '体育节', '趣味运动会'],
    summary: '多项目并行，检录、计时与广播是骨架',
    defaultPeople: 1000,
    defaultBudget: 30000,
    defaultDuration: 480,
    defaultVenue: 'stadium',
    defaultAudience: '各院系代表队与观众',
    emphasis: { logistics: 'key', organization: 'key', risk: 'key', resources: 'key' },
  },
  {
    id: 'sports-marathon',
    label: '马拉松/路跑',
    family: 'sports',
    keywords: ['马拉松', '路跑', '半马', '全马', '越野跑', '夜跑', '跑步活动', '长跑'],
    summary: '赛道、补给、医疗与关门时间构成安全闭环',
    defaultPeople: 800,
    defaultBudget: 60000,
    defaultDuration: 360,
    defaultVenue: 'outdoor',
    defaultAudience: '在校学生、教职工与校友跑者',
    emphasis: { logistics: 'key', risk: 'key', resources: 'key', organization: 'key' },
  },
  {
    id: 'sports-outdoor',
    label: '户外拓展',
    family: 'sports',
    keywords: ['户外拓展', '拓展训练', '徒步', '露营', '定向越野', '溯溪', '户外活动', '团建徒步'],
    summary: '天气、保险与随队医疗是硬约束',
    defaultPeople: 60,
    defaultBudget: 12000,
    defaultDuration: 360,
    defaultVenue: 'outdoor',
    defaultAudience: '团队/班级成员',
    emphasis: { risk: 'key', logistics: 'key', organization: 'key' },
  },

  /* ---------- 公益 ---------- */
  {
    id: 'charity-service',
    label: '志愿服务/社区服务',
    family: 'charity',
    keywords: ['志愿服务', '志愿者', '义工', '社区服务', '敬老', '支教', '助残', '探访', '公益服务'],
    summary: '服务对象真实需求优先，志愿者要培训与保障',
    defaultPeople: 80,
    defaultBudget: 5000,
    defaultDuration: 240,
    defaultVenue: 'mixed',
    defaultAudience: '服务对象与志愿者',
    emphasis: { audience: 'key', organization: 'key', evaluation: 'key' },
  },
  {
    id: 'charity-fundraise',
    label: '公益募捐/义卖',
    family: 'charity',
    keywords: ['募捐', '义卖', '慈善', '筹款', '捐赠', '公益集市'],
    summary: '善款透明与合规披露决定公信力',
    defaultPeople: 200,
    defaultBudget: 4000,
    defaultDuration: 240,
    defaultVenue: 'outdoor',
    defaultAudience: '捐赠人、志愿者与受助方',
    emphasis: { audience: 'key', evaluation: 'key', risk: 'normal' },
  },
  {
    id: 'charity-green',
    label: '环保宣传/行动',
    family: 'charity',
    keywords: ['环保', '垃圾分类', '低碳', '植树', '净滩', '节能', '绿色行动', '环保宣传'],
    summary: '把倡议变成可参与、可量化的行动',
    defaultPeople: 150,
    defaultBudget: 6000,
    defaultDuration: 180,
    defaultVenue: 'outdoor',
    defaultAudience: '社区居民、学生与志愿者',
    emphasis: { program: 'key', evaluation: 'key', promotion: 'normal' },
  },

  /* ---------- 商业 ---------- */
  {
    id: 'business-conference',
    label: '商业会议/行业峰会',
    family: 'business',
    keywords: ['行业峰会', '商业会议', '商务会议', '招商会', '经销商大会', '峰会', '论坛'],
    summary: '嘉宾、议程、会务与商务转化四件事',
    defaultPeople: 300,
    defaultBudget: 150000,
    defaultDuration: 480,
    defaultVenue: 'hotel',
    defaultAudience: '客户、合作伙伴与行业从业者',
    emphasis: { program: 'key', organization: 'key', budget: 'key', promotion: 'key' },
  },
  {
    id: 'business-launch',
    label: '产品发布会',
    family: 'business',
    keywords: ['发布会', '新品发布', '产品发布', '媒体沟通会', '上市发布', '品牌发布'],
    summary: '一场发布会是一次传播事件，节奏与素材同等重要',
    defaultPeople: 150,
    defaultBudget: 120000,
    defaultDuration: 120,
    defaultVenue: 'indoor-large',
    defaultAudience: '媒体、客户、合作伙伴与KOL',
    emphasis: { program: 'key', promotion: 'key', logistics: 'key', risk: 'normal' },
  },
  {
    id: 'business-annual',
    label: '企业年会',
    family: 'business',
    keywords: ['企业年会', '公司年会', '年终盛典', '尾牙', '年会'],
    summary: '表彰、回顾与氛围，把员工放在中心',
    defaultPeople: 200,
    defaultBudget: 80000,
    defaultDuration: 240,
    defaultVenue: 'hotel',
    defaultAudience: '全体员工与管理层',
    emphasis: { program: 'key', logistics: 'key', budget: 'normal' },
  },
  {
    id: 'business-expo',
    label: '展览/展会',
    family: 'business',
    keywords: ['展会', '展览会', '博览会', '展销会', '交易会', 'expo', '展位'],
    summary: '展位规划、观众动线与搭建安全是底座',
    defaultPeople: 1000,
    defaultBudget: 200000,
    defaultDuration: 480,
    defaultVenue: 'expo',
    defaultAudience: '专业观众、展商与媒体',
    emphasis: { logistics: 'key', resources: 'key', risk: 'key', organization: 'key' },
  },

  /* ---------- 创业创新 ---------- */
  {
    id: 'startup-contest',
    label: '创业比赛',
    family: 'startup',
    keywords: ['创业比赛', '创业大赛', '创新创业大赛', '互联网+', '挑战杯', '商业计划书', '创业计划'],
    summary: '赛制、评委与项目辅导决定比赛含金量',
    defaultPeople: 200,
    defaultBudget: 50000,
    defaultDuration: 480,
    defaultVenue: 'indoor-large',
    defaultAudience: '参赛团队、评委与投资人',
    emphasis: { program: 'key', evaluation: 'key', resources: 'key' },
  },
  {
    id: 'startup-roadshow',
    label: '创新路演/项目对接',
    family: 'startup',
    keywords: ['路演', '项目对接', '投融资', 'demo day', '创新路演', '项目交流'],
    summary: '让好项目在有限时间里被看见、被对接',
    defaultPeople: 120,
    defaultBudget: 20000,
    defaultDuration: 180,
    defaultVenue: 'indoor-large',
    defaultAudience: '创业者、投资机构与产业方',
    emphasis: { program: 'key', audience: 'key', evaluation: 'normal' },
  },

  /* ---------- 文化艺术 ---------- */
  {
    id: 'arts-festival',
    label: '音乐节',
    family: 'arts',
    keywords: ['音乐节', '演唱会', '乐队', 'livehouse', '音乐现场'],
    summary: '舞台、阵容、安保与人流是四条主线',
    defaultPeople: 2000,
    defaultBudget: 300000,
    defaultDuration: 480,
    defaultVenue: 'outdoor',
    defaultAudience: '学生与本地乐迷',
    emphasis: { logistics: 'key', risk: 'key', organization: 'key', budget: 'key' },
  },
  {
    id: 'arts-culture',
    label: '文化节',
    family: 'arts',
    keywords: ['文化节', '艺术节', '传统文化', '非遗', '文化周', '民俗'],
    summary: '内容有文化根基，体验要可参与',
    defaultPeople: 500,
    defaultBudget: 40000,
    defaultDuration: 360,
    defaultVenue: 'mixed',
    defaultAudience: '学生、社区居民与游客',
    emphasis: { program: 'key', promotion: 'key', logistics: 'key' },
  },
  {
    id: 'arts-exhibition',
    label: '展览/艺术展',
    family: 'arts',
    keywords: ['艺术展', '画展', '摄影展', '装置展', '展陈', '作品展', '展览'],
    summary: '内容策展、动线与布展施工是核心',
    defaultPeople: 300,
    defaultBudget: 30000,
    defaultDuration: 480,
    defaultVenue: 'expo',
    defaultAudience: '观众、艺术家与媒体',
    emphasis: { logistics: 'key', resources: 'key', program: 'key' },
  },
  {
    id: 'arts-performance',
    label: '文艺演出/晚会',
    family: 'arts',
    keywords: ['文艺演出', '文艺汇演', '汇演', '演出', '晚会', '话剧', '舞蹈专场', '音乐会'],
    summary: '节目单、彩排与舞台技术决定观感',
    defaultPeople: 600,
    defaultBudget: 50000,
    defaultDuration: 150,
    defaultVenue: 'indoor-large',
    defaultAudience: '师生、观众与嘉宾',
    emphasis: { program: 'key', logistics: 'key', risk: 'normal' },
  },
  {
    id: 'arts-graduation',
    label: '毕业晚会',
    family: 'arts',
    keywords: ['毕业晚会', '毕业季', '毕业典礼', '送别晚会', '毕业演出'],
    summary: '情绪与仪式感优先，节目要讲共同记忆',
    defaultPeople: 800,
    defaultBudget: 45000,
    defaultDuration: 150,
    defaultVenue: 'indoor-large',
    defaultAudience: '毕业生、家长与教师',
    emphasis: { program: 'key', promotion: 'normal', audience: 'normal' },
  },

  /* ---------- 教育科普 ---------- */
  {
    id: 'education-popular',
    label: '科普教育/开放日',
    family: 'education',
    keywords: ['科普', '开放日', '科学展', '科普教育', '科技节', '体验日'],
    summary: '把知识变成可动手的体验',
    defaultPeople: 200,
    defaultBudget: 15000,
    defaultDuration: 240,
    defaultVenue: 'mixed',
    defaultAudience: '中小学生、家长与公众',
    emphasis: { program: 'key', risk: 'normal', promotion: 'normal' },
  },
  {
    id: 'education-workshop',
    label: '工作坊/培训',
    family: 'education',
    keywords: ['工作坊', '培训', '训练营', '课程', '研讨班', 'workshop'],
    summary: '目标可测量，练习要占大头',
    defaultPeople: 40,
    defaultBudget: 6000,
    defaultDuration: 180,
    defaultVenue: 'indoor-small',
    defaultAudience: '学员与讲师',
    emphasis: { program: 'key', evaluation: 'key', audience: 'normal' },
  },

  /* ---------- 就业职业 ---------- */
  {
    id: 'career-jobfair',
    label: '招聘会/双选会',
    family: 'career',
    keywords: ['招聘会', '双选会', '人才市场', '校招会', '就业洽谈', '招聘专场'],
    summary: '企业质量与现场匹配效率决定口碑',
    defaultPeople: 1000,
    defaultBudget: 30000,
    defaultDuration: 300,
    defaultVenue: 'expo',
    defaultAudience: '应届毕业生与用人单位',
    emphasis: { organization: 'key', audience: 'key', logistics: 'key' },
  },
  {
    id: 'career-talk',
    label: '职业交流/分享会',
    family: 'career',
    keywords: ['职业交流', '校友分享', '经验分享', '职业规划', '行业交流', '分享会'],
    summary: '嘉宾的实战经验比泛泛而谈更有价值',
    defaultPeople: 100,
    defaultBudget: 5000,
    defaultDuration: 120,
    defaultVenue: 'indoor-small',
    defaultAudience: '在校学生与职场新人',
    emphasis: { program: 'key', audience: 'key', promotion: 'normal' },
  },
  {
    id: 'career-info',
    label: '宣讲会',
    family: 'career',
    keywords: ['宣讲会', '校园宣讲', '企业宣讲', '招聘宣讲'],
    summary: '用一场说明会完成筛选与品牌双重任务',
    defaultPeople: 150,
    defaultBudget: 6000,
    defaultDuration: 90,
    defaultVenue: 'indoor-large',
    defaultAudience: '目标专业应届生',
    emphasis: { program: 'key', promotion: 'normal', organization: 'normal' },
  },

  /* ---------- 社交聚会 ---------- */
  {
    id: 'social-teambuilding',
    label: '团建',
    family: 'social',
    keywords: ['团建', '凝聚力', '部门活动', '员工活动', 'team building', '拓展活动'],
    summary: '低门槛参与，重点在协作与放松',
    defaultPeople: 40,
    defaultBudget: 8000,
    defaultDuration: 300,
    defaultVenue: 'mixed',
    defaultAudience: '团队成员',
    emphasis: { program: 'key', risk: 'normal' },
  },
  {
    id: 'social-party',
    label: '聚会/家庭聚会',
    family: 'social',
    keywords: ['聚餐', '家庭聚会', '生日', '派对', 'party', '轰趴', '朋友聚会', '聚会'],
    summary: '吃好、聊好、有人照应，就是成功',
    defaultPeople: 20,
    defaultBudget: 2000,
    defaultDuration: 240,
    defaultVenue: 'indoor-small',
    defaultAudience: '亲友与同事',
    emphasis: { program: 'normal', risk: 'brief', organization: 'brief' },
  },
  {
    id: 'social-festival',
    label: '节庆活动',
    family: 'social',
    keywords: ['节庆', '中秋', '春节', '元旦', '端午', '国庆', '圣诞', '元宵', '节日活动'],
    summary: '借节日氛围，做轻量但有心意的活动',
    defaultPeople: 100,
    defaultBudget: 5000,
    defaultDuration: 180,
    defaultVenue: 'indoor-large',
    defaultAudience: '员工、学生或社区居民',
    emphasis: { program: 'key', promotion: 'normal' },
  },
  {
    id: 'social-trip',
    label: '旅游/出游',
    family: 'social',
    keywords: ['旅游', '出游', '春游', '秋游', '旅行', '研学', '一日游'],
    summary: '行程、交通与安全预案是主要内容',
    defaultPeople: 50,
    defaultBudget: 20000,
    defaultDuration: 480,
    defaultVenue: 'outdoor',
    defaultAudience: '参与者与带队人员',
    emphasis: { logistics: 'key', risk: 'key', budget: 'normal' },
  },

  /* ---------- 社区 ---------- */
  {
    id: 'community-festival',
    label: '社区文化节',
    family: 'arts',
    keywords: ['社区文化节', '社区文化', '邻里节', '社区嘉年华', '社区活动', '文化节'],
    summary: '以邻里参与和在地文化为内容，摊点与舞台并行',
    defaultPeople: 500,
    defaultBudget: 40000,
    defaultDuration: 240,
    defaultVenue: 'mixed',
    defaultAudience: '社区居民、社工与志愿者',
    emphasis: { program: 'key', promotion: 'key', logistics: 'key' },
  },

  /* ---------- 兜底 ---------- */
  {
    id: 'generic-event',
    label: '其他活动',
    family: 'generic',
    keywords: [],
    summary: '标准十二模块，按实际需求裁剪',
    defaultPeople: 80,
    defaultBudget: 5000,
    defaultDuration: 180,
    defaultVenue: 'indoor-large',
    defaultAudience: '目标参与者',
  },
];

const categoryIndex = new Map(CATEGORIES.map((c) => [c.id, c]));

export const getCategory = (id: string): EventCategory =>
  categoryIndex.get(id) ?? categoryIndex.get('generic-event')!;

/** 用于标题的短名：「马拉松/路跑」→「马拉松」 */
export const shortLabel = (category: EventCategory) => category.label.split('/')[0];

/* ============================================================
 * 分类入口（预设与浏览的第一层）
 * 一个活动类型只归属一个分类；没有归类的走 custom。
 * ============================================================ */

export const GROUPS: ScenarioGroup[] = [
  {
    id: 'campus-education',
    label: '校园教育类',
    summary: '迎新、社团、课程与科普',
    categories: ['campus-welcome', 'campus-club', 'education-workshop', 'education-popular'],
  },
  {
    id: 'sports',
    label: '体育竞技类',
    summary: '赛事、运动会、路跑与户外',
    categories: ['sports-match', 'sports-meet', 'sports-marathon', 'sports-outdoor'],
  },
  {
    id: 'charity',
    label: '公益志愿类',
    summary: '志愿服务、募捐与环保行动',
    categories: ['charity-service', 'charity-fundraise', 'charity-green'],
  },
  {
    id: 'business',
    label: '商业商务类',
    summary: '会议、发布、年会、展会与招聘',
    categories: ['business-conference', 'business-launch', 'business-annual', 'business-expo', 'career-jobfair', 'career-talk', 'career-info'],
  },
  {
    id: 'culture',
    label: '文化娱乐类',
    summary: '音乐、演出、展览与文化节',
    categories: ['arts-festival', 'arts-culture', 'arts-exhibition', 'arts-performance', 'arts-graduation'],
  },
  {
    id: 'community',
    label: '社区社会类',
    summary: '社区文化、团建、聚会与出游',
    categories: ['community-festival', 'social-teambuilding', 'social-party', 'social-trip'],
  },
  {
    id: 'tech',
    label: '科技创新类',
    summary: '创业赛、路演与学科竞赛',
    categories: ['startup-contest', 'startup-roadshow', 'academic-contest'],
  },
  {
    id: 'conference',
    label: '会议论坛类',
    summary: '讲座、学术会议与沙龙',
    categories: ['academic-lecture', 'academic-conference', 'academic-salon'],
  },
  {
    id: 'festival',
    label: '节庆庆典类',
    summary: '节日活动与校庆周年',
    categories: ['social-festival', 'campus-anniversary'],
  },
  {
    id: 'custom',
    label: '自定义活动类',
    summary: '没有合适的预设，就直接描述',
    categories: ['generic-event'],
  },
];

const groupIndex = new Map(GROUPS.map((group) => [group.id, group]));
const categoryGroup = new Map<string, ScenarioGroup>();
GROUPS.forEach((group) => group.categories.forEach((categoryId) => categoryGroup.set(categoryId, group)));

export const getGroup = (id: string) => groupIndex.get(id as ScenarioGroup['id']);
export const groupOfCategory = (categoryId: string): ScenarioGroup => categoryGroup.get(categoryId) ?? groupIndex.get('custom')!;

export const GENERIC_CATEGORY = getCategory('generic-event');

/** 合并族与类型权重，得到本场活动的模块权重表 */
export function resolveWeights(category: EventCategory): Record<ModuleId, Weight> {
  return { ...getFamily(category.family).emphasis, ...category.emphasis };
}

/* ============================================================
 * 四、场地与规模
 * ============================================================ */

export const VENUES: { id: VenueKind; label: string; outdoor: boolean; hint: string }[] = [
  { id: 'indoor-small', label: '室内小场地', outdoor: false, hint: '教室 / 会议室 / 咖啡厅' },
  { id: 'indoor-large', label: '室内大场地', outdoor: false, hint: '礼堂 / 报告厅 / 多功能厅' },
  { id: 'outdoor', label: '户外场地', outdoor: true, hint: '操场 / 广场 / 公园 / 街区' },
  { id: 'stadium', label: '体育场馆', outdoor: false, hint: '体育馆 / 田径场' },
  { id: 'hotel', label: '酒店会议', outdoor: false, hint: '宴会厅 / 会议室' },
  { id: 'expo', label: '展馆/大型场馆', outdoor: false, hint: '会展中心 / 展厅' },
  { id: 'online', label: '线上', outdoor: false, hint: '直播 / 视频会议' },
  { id: 'mixed', label: '室内外结合', outdoor: true, hint: '主会场 + 户外互动区' },
];

const venueIndex = new Map(VENUES.map((v) => [v.id, v]));
export const getVenue = (id: VenueKind) => venueIndex.get(id) ?? VENUES[1];
export const venueLabel = (id: VenueKind) => getVenue(id).label;
export const isOutdoor = (id: VenueKind) => getVenue(id).outdoor;

export const SCALES: { id: 'micro' | 'small' | 'medium' | 'large' | 'mega'; label: string; range: string; min: number }[] = [
  { id: 'micro', label: '微型', range: '10 人以内', min: 0 },
  { id: 'small', label: '小型', range: '10–50 人', min: 10 },
  { id: 'medium', label: '中型', range: '50–300 人', min: 50 },
  { id: 'large', label: '大型', range: '300–1000 人', min: 300 },
  { id: 'mega', label: '超大型', range: '1000 人以上', min: 1000 },
];

export function scaleOf(people: number) {
  if (people >= 1000) return SCALES[4];
  if (people >= 300) return SCALES[3];
  if (people >= 50) return SCALES[2];
  if (people >= 10) return SCALES[1];
  return SCALES[0];
}
