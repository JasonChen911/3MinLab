/* ============================================================
 * 通用活动策划平台 · 领域模型
 *
 * 设计要点：
 * 1. 12 个标准模块构成通用策划框架（ModuleId），所有活动共用；
 * 2. 模块权重（Weight）由活动类型决定，权重同时控制排序与内容深度；
 * 3. Brief 的每个字段都带来源标记（用户输入 / 文本推断 / 合理假设），
 *    保证"不知道的先用假设、并明确标注"这一产品原则可被界面表达；
 * 4. Plan 只存数据，导出（Markdown/打印）与渲染都从数据派生。
 * ============================================================ */

/** 12 个通用策划模块 */
export type ModuleId =
  | 'basic'
  | 'goals'
  | 'audience'
  | 'logistics'
  | 'program'
  | 'organization'
  | 'resources'
  | 'budget'
  | 'promotion'
  | 'execution'
  | 'risk'
  | 'evaluation';

/** 模块权重：key = 本类活动的策划重点，normal = 常规，brief = 简要带过 */
export type Weight = 'key' | 'normal' | 'brief';
export type PlanningMode = 'full' | 'light';
export type PlanningStatus = 'unhandled' | 'self' | 'existing' | 'not-needed' | 'pending' | 'ai-suggested' | 'confirmed';
export interface PlanningModuleState { status: PlanningStatus; note?: string; aiSuggestion?: string; confirmed?: boolean; updatedAt: string }

/** 字段来源，界面据此显示"已识别 / 推测 / 预设 / 假设" */
export type SourceTag = 'user' | 'inferred' | 'assumed' | 'preset';

/** 活动规模分层，影响组织复杂度、风险等级与预算结构 */
export type ScaleTier = 'micro' | 'small' | 'medium' | 'large' | 'mega';

/** 场地大类（比具体场地名更稳定，便于规则判断） */
export type VenueKind =
  | 'indoor-small'
  | 'indoor-large'
  | 'outdoor'
  | 'stadium'
  | 'hotel'
  | 'expo'
  | 'online'
  | 'mixed';

/** 活动大类族：同一族共享议程、预算、风险、角色等知识 */
export type FamilyId =
  | 'campus'
  | 'academic'
  | 'sports'
  | 'charity'
  | 'business'
  | 'startup'
  | 'arts'
  | 'education'
  | 'career'
  | 'social'
  | 'generic';

export type BriefFieldKey =
  | 'category'
  | 'title'
  | 'people'
  | 'budget'
  | 'duration'
  | 'date'
  | 'venue'
  | 'goal'
  | 'audience'
  | 'theme'
  | 'constraints';

/** 活动分类入口（预设系统的第一层） */
export type GroupId =
  | 'campus-education'
  | 'sports'
  | 'charity'
  | 'business'
  | 'culture'
  | 'community'
  | 'tech'
  | 'conference'
  | 'festival'
  | 'custom';

export interface ScenarioGroup {
  id: GroupId;
  label: string;
  summary: string;
  /** 该分类下的活动类型 id */
  categories: string[];
}

export interface Assumption {
  field: BriefFieldKey;
  label: string;
  value: string;
  reason: string;
}

export interface EventBrief {
  /** 用户原始想法，保留原文便于回溯 */
  idea: string;
  /** 可切换的策划展示模式，缺省沿用完整模式以兼容旧项目 */
  planningMode?: PlanningMode;
  fieldStates?: Partial<Record<BriefFieldKey, PlanningModuleState>>;
  aiDraft?: { flow: string[]; staff: string[]; materials: string[]; features: string[]; questions: string[] };
  title: string;
  categoryId: string;
  family: FamilyId;
  people: number;
  budget: number;
  /** 单日活动分钟数 */
  durationMinutes: number;
  /** 持续天数，>1 时按多日安排处理 */
  days: number;
  /** ISO 日期，未识别时为空字符串 */
  date: string;
  dateLabel: string;
  venue: VenueKind;
  venueNote: string;
  goal: string;
  theme: string;
  audience: string;
  constraints: string;
  /** 从预设模板起稿时记录来源，便于"清除预设"与回归测试 */
  presetId?: string;
  /** 自然语言修改后的附加约束 */
  modifiers?: BriefModifiers;
  sources: Partial<Record<BriefFieldKey, SourceTag>>;
  assumptions: Assumption[];
}

/** 一句话修改产生的可执行约束（由 revise.ts 写入，生成器消费） */
export interface BriefModifiers {
  /** 人员编制系数：0.5 表示精简一半，1.3 表示增加三成 */
  staffScale?: number;
  /** 追加的互动环节名称 */
  extraInteractions?: string[];
  /** 是否因涉及未成年人/公众安全而强化安全条款 */
  safetyBoost?: boolean;
  /** 最近一次修改的说明，写入方案备注 */
  revisionNote?: string;
}

export type QuestionField =
  | 'people'
  | 'budget'
  | 'duration'
  | 'date'
  | 'venue'
  | 'goal'
  | 'audience'
  | 'category';

export interface QuestionOption {
  label: string;
  value: string;
  hint?: string;
}

export interface BriefQuestion {
  id: string;
  field: QuestionField;
  prompt: string;
  options: QuestionOption[];
  allowCustom?: boolean;
}

/* ---------------- 类型体系（taxonomy 使用的元数据） ---------------- */

export interface ModuleMeta {
  id: ModuleId;
  title: string;
  /** 一句话说明该模块要回答什么问题 */
  hint: string;
  /** 导出 Markdown 时的章节序号 */
  order: number;
}

export interface FamilyMeta {
  id: FamilyId;
  label: string;
  summary: string;
  emphasis: Record<ModuleId, Weight>;
}

export interface EventCategory {
  id: string;
  label: string;
  family: FamilyId;
  /** 用于从自由文本中识别活动类型，按命中权重计分 */
  keywords: string[];
  /** 该类活动的策划重点，显示在方案概览 */
  summary: string;
  emphasis?: Partial<Record<ModuleId, Weight>>;
  defaultPeople?: number;
  defaultBudget?: number;
  defaultDuration?: number;
  defaultVenue?: VenueKind;
  defaultAudience?: string;
}

/* ---------------- 方案文档块 ---------------- */

export interface TimelineEntry {
  time: string;
  title: string;
  detail?: string;
}

export interface BudgetRow {
  id: string;
  /** 标准预算类别：场地 / 设备 / 物资 / 人员 / 宣传 / 交通 / 餐饮 / 应急备用金 */
  bucket: string;
  category: string;
  item: string;
  amount: number;
  share: number;
  note?: string;
}

export interface KpiRow {
  name: string;
  target: string;
  method: string;
}

export interface StaffRow {
  role: string;
  count: number;
  duty: string;
  /** 组织层级：决策 / 内容 / 传播 / 执行保障 */
  layer?: string;
  /** 人数配置依据，例如「每 80 人配 1 名」 */
  basis?: string;
}

export type Block =
  | { kind: 'text'; text: string }
  | { kind: 'bullets'; title?: string; items: string[] }
  | { kind: 'checklist'; title?: string; items: string[] }
  | { kind: 'timeline'; title?: string; entries: TimelineEntry[] }
  | { kind: 'budget'; title?: string; rows: BudgetRow[]; total: number; note?: string }
  | { kind: 'kpis'; title?: string; rows: KpiRow[] }
  | { kind: 'staff'; title?: string; rows: StaffRow[] }
  | { kind: 'table'; title?: string; head: string[]; rows: string[][] };

export interface PlanModule {
  id: ModuleId;
  title: string;
  weight: Weight;
  summary: string;
  blocks: Block[];
  /** 该模块来自 AI 的补充说明（本地生成时为空） */
  aiNote?: string;
}

export interface EventPlan {
  id: string;
  createdAt: string;
  version: 2;
  planningMode?: PlanningMode;
  moduleStates?: Partial<Record<ModuleId, PlanningModuleState>>;
  title: string;
  oneLiner: string;
  theme: string;
  brief: EventBrief;
  scale: ScaleTier;
  modules: PlanModule[];
  assumptions: Assumption[];
  aiNotes: Partial<Record<ModuleId, string>>;
}

export interface LocalState {
  recent: EventPlan | null;
  favorites: EventPlan[];
  history: EventPlan[];
}

/* ============================================================
 * 环节库（保留原有 25 个互动玩法，作为"活动内容"模块的素材）
 * ============================================================ */

export type ActivityType = 'icebreaker' | 'boardgame' | 'movie' | 'music' | 'party';
export type LibraryVenue = 'classroom' | 'hall' | 'outdoor' | 'online';
export type MaterialCategory = '文具纸张' | '食品饮品' | '设备道具' | '场地布置';

export interface MaterialTemplate {
  name: string;
  category: MaterialCategory;
  unit: string;
  unitPrice: number;
  fixedQuantity?: number;
  perPersonQuantity?: number;
  optional?: boolean;
  borrowable?: boolean;
}

export interface Activity {
  id: string;
  type: ActivityType;
  name: string;
  tagline: string;
  description: string;
  duration: number;
  minPeople: number;
  maxPeople: number;
  venues: LibraryVenue[];
  materials: MaterialTemplate[];
  gameplay: string[];
  hostGuide: string[];
  energy: '轻松' | '适中' | '高能';
}
