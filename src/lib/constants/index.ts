/* ==========================================================================
   业务常量 · 全站唯一事实来源
   状态机定义见《功能需求.md》第 3 章
   ========================================================================== */

/* ---------- 角色（3 个固定角色，不支持自定义） ---------- */
export const ROLES = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  SALES_MANAGER: 'SALES_MANAGER',
  SALES: 'SALES',
} as const;
export type RoleKey = (typeof ROLES)[keyof typeof ROLES];

export const ROLE_META: Record<RoleKey, { name: string; short: string }> = {
  SUPER_ADMIN: { name: '超级管理员', short: '超管' },
  SALES_MANAGER: { name: '销售主管', short: '主管' },
  SALES: { name: '销售顾问', short: '顾问' },
};

/** 角色权限等级，数字越大权限越高 */
export const ROLE_LEVEL: Record<RoleKey, number> = {
  SALES: 1,
  SALES_MANAGER: 2,
  SUPER_ADMIN: 3,
};

/* ---------- 线索状态机（PRD 3.1） ---------- */
export const LEAD_STATUS = {
  PENDING: 'PENDING',
  FOLLOWING: 'FOLLOWING',
  PSEUDO: 'PSEUDO',
  TO_POOL: 'TO_POOL',
  CONVERTED: 'CONVERTED',
} as const;
export type LeadStatus = (typeof LEAD_STATUS)[keyof typeof LEAD_STATUS];

/**
 * 状态元信息
 * tone 用于 StatusTag 组件换色，rowTone 用于表格整行底色
 */
export const LEAD_STATUS_META: Record<
  LeadStatus,
  { name: string; tone: Tone; rowTone?: RowTone; desc: string }
> = {
  PENDING: { name: '待分配', tone: 'warning', desc: '线索已录入但未指派归属人' },
  FOLLOWING: { name: '待跟进', tone: 'brand', desc: '已有归属人，正在跟进中' },
  PSEUDO: { name: '伪线索', tone: 'default', rowTone: 'muted', desc: '无效/重复/非目标客户，终态' },
  TO_POOL: { name: '公海池', tone: 'info', desc: '无人持有，可被全员领取' },
  CONVERTED: { name: '已转商机', tone: 'success', rowTone: 'muted', desc: '已成为商机，终态' },
};

/** 合法状态跃迁表 */
export const LEAD_TRANSITIONS: Record<LeadStatus, LeadStatus[]> = {
  PENDING: ['FOLLOWING', 'TO_POOL'],
  FOLLOWING: ['CONVERTED', 'PSEUDO', 'TO_POOL'],
  PSEUDO: [],
  TO_POOL: ['FOLLOWING'],
  CONVERTED: [],
};

/* ---------- 商机状态机（PRD 3.2） ---------- */
export const OPP_STAGE = {
  FOLLOWING: 'FOLLOWING',
  NEGOTIATING: 'NEGOTIATING',
  WON: 'WON',
  LOST: 'LOST',
} as const;
export type OppStage = (typeof OPP_STAGE)[keyof typeof OPP_STAGE];

export const OPP_STAGE_META: Record<
  OppStage,
  { name: string; tone: Tone; desc: string; stayLimitDays: number | null }
> = {
  FOLLOWING: { name: '跟进中', tone: 'brand', desc: '初步意向确认', stayLimitDays: 3 },
  NEGOTIATING: { name: '谈判中', tone: 'warning', desc: '方案/报价沟通', stayLimitDays: 7 },
  WON: { name: '已赢单', tone: 'success', desc: '已成交', stayLimitDays: null },
  LOST: { name: '已输单', tone: 'default', desc: '已输单', stayLimitDays: null },
};

/* ---------- 客户状态机（PRD 3.3） ---------- */
export const CUSTOMER_STATUS = {
  ACTIVE: 'ACTIVE',
  PAUSED: 'PAUSED',
  COMPLETED: 'COMPLETED',
  REFUNDED: 'REFUNDED',
  LOST: 'LOST',
} as const;
export type CustomerStatus = (typeof CUSTOMER_STATUS)[keyof typeof CUSTOMER_STATUS];

export const CUSTOMER_STATUS_META: Record<CustomerStatus, { name: string; tone: Tone }> = {
  ACTIVE: { name: '正常在读', tone: 'success' },
  PAUSED: { name: '暂停服务', tone: 'warning' },
  COMPLETED: { name: '已结课', tone: 'brand' },
  REFUNDED: { name: '已退费', tone: 'danger' },
  LOST: { name: '已流失', tone: 'default' },
};

/* ---------- 通用类型 ---------- */
export type Tone = 'default' | 'brand' | 'success' | 'warning' | 'danger' | 'info' | 'purple';
export type RowTone = 'danger' | 'warning' | 'muted';

/** 标签色值映射表，供 StatusTag 组件统一消费 */
export const TONE_CLASS: Record<Tone, string> = {
  default: 'bg-ink-100 text-ink-600 border-ink-200',
  brand: 'bg-brand-50 text-brand-700 border-brand-100',
  success: 'bg-success-50 text-success-700 border-success-100',
  warning: 'bg-warning-50 text-warning-700 border-warning-100',
  danger: 'bg-danger-50 text-danger-700 border-danger-100',
  info: 'bg-info-50 text-info-700 border-info-100',
  purple: 'bg-purple-50 text-purple-700 border-purple-100',
};

/** 圆点色值映射表 */
export const TONE_DOT: Record<Tone, string> = {
  default: 'bg-ink-400',
  brand: 'bg-brand-500',
  success: 'bg-success-500',
  warning: 'bg-warning-500',
  danger: 'bg-danger-500',
  info: 'bg-info-500',
  purple: 'bg-purple-500',
};

/** 表格整行底色映射 */
export const ROW_TONE_CLASS: Record<RowTone, string> = {
  danger: 'row-danger',
  warning: 'row-warning',
  muted: 'row-muted',
};

/* ---------- 枚举字典（PRD 4.2.4 / 4.2.5 / 4.3.3 / 4.3.4） ---------- */

export const FOLLOW_METHODS = [
  { value: 'PHONE', label: '电话' },
  { value: 'WECHAT', label: '微信' },
  { value: 'MEETING', label: '面谈' },
  { value: 'SMS', label: '短信' },
  { value: 'OTHER', label: '其他' },
] as const;

export const FOLLOW_RESULTS = [
  { value: 'INTERESTED', label: '有意向' },
  { value: 'NOT_INTERESTED', label: '无意向' },
  { value: 'OBSERVE', label: '待观察' },
  { value: 'WECHAT_ADDED', label: '已加微信' },
  { value: 'TRIAL_SIGNED', label: '已报名试听' },
  { value: 'OTHER', label: '其他' },
] as const;

/** 伪线索原因（BR-P01） */
export const PSEUDO_REASONS = [
  { value: 'INVALID_NUMBER', label: '空号/停机' },
  { value: 'NOT_TARGET', label: '非目标人群' },
  { value: 'DUPLICATE', label: '重复线索' },
  { value: 'COMPETITOR', label: '竞对' },
  { value: 'NO_DEMAND', label: '无真实需求' },
  { value: 'REJECTED', label: '明确拒绝' },
  { value: 'OTHER', label: '其他' },
] as const;

/** 输单原因，必填（BR-O02） */
export const LOST_REASONS = [
  { value: 'OVER_BUDGET', label: '价格超预算' },
  { value: 'SCHEDULE_CONFLICT', label: '排期冲突' },
  { value: 'COMPETITOR_WON', label: '竞品胜出' },
  { value: 'QUALIFICATION', label: '资质不满足' },
  { value: 'GAVE_UP', label: '学员放弃' },
  { value: 'UNREACHABLE', label: '联系不上' },
  { value: 'OTHER', label: '其他' },
] as const;

/** 踢回公海原因 */
export const POOL_RETURN_REASONS = [
  { value: 'LONG_NO_FOLLOW', label: '长期未跟进' },
  { value: 'NO_INTENT', label: '无真实意向' },
  { value: 'CONTACT_INVALID', label: '联系方式失效' },
  { value: 'CLOSED_ELSEWHERE', label: '客户已成交他处' },
  { value: 'GIVE_UP', label: '主动放弃' },
  { value: 'RESIGNED', label: '离职调岗' },
  { value: 'OTHER', label: '其他' },
] as const;

export const GENDERS = [
  { value: 'MALE', label: '男' },
  { value: 'FEMALE', label: '女' },
  { value: 'UNKNOWN', label: '未知' },
] as const;

/** 客户状态变更原因（BR-CU02 必填） */
export const CUSTOMER_STATUS_REASONS = [
  { value: 'EXTEND', label: '延期' },
  { value: 'LEAVE', label: '休学' },
  { value: 'RESUME', label: '复课' },
  { value: 'FINISH', label: '结课' },
  { value: 'REFUND', label: '退费' },
  { value: 'CHURN', label: '流失' },
  { value: 'OTHER', label: '其他' },
] as const;

export const SERVICE_TYPES = [
  { value: 'TRIAL', label: '试听' },
  { value: 'LESSON', label: '正课' },
  { value: 'TUTOR', label: '辅导' },
  { value: 'QA', label: '答疑' },
] as const;

/* ---------- 通用选项（新增下拉项在此登记） ---------- */
export const CATEGORY_OPTIONS = [
  { value: 'K12', label: 'K12' },
  { value: 'ADULT_EDU', label: '成人学历' },
  { value: 'VOCATIONAL', label: '职业技能' },
  { value: 'INTEREST', label: '兴趣素养' },
] as const;

export const COURSE_MODES = [
  { value: 'LIVE', label: '直播' },
  { value: 'RECORDED', label: '录播' },
  { value: 'OFFLINE', label: '线下面授' },
  { value: 'HYBRID', label: '混合' },
] as const;

export const SHELF_STATUS = [
  { value: 'OFF', label: '未上架' },
  { value: 'ON', label: '已上架' },
  { value: 'REMOVED', label: '已下架' },
] as const;

export const CHANNEL_TYPES = [
  { value: 'PAID_AD', label: '付费广告' },
  { value: 'CONTENT', label: '内容营销' },
  { value: 'REFERRAL', label: '转介绍' },
  { value: 'CROSS', label: '异业合作' },
  { value: 'ORGANIC', label: '自然流量' },
  { value: 'OTHER', label: '其他' },
] as const;

export const ACTIVITY_TYPES = [
  { value: 'TRIAL', label: '试听' },
  { value: 'OPEN_CLASS', label: '公开课' },
  { value: 'LECTURE', label: '讲座' },
  { value: 'CAMP', label: '训练营' },
] as const;

export const ACTIVITY_STATUS = [
  { value: 'NOT_STARTED', label: '未开始' },
  { value: 'ONGOING', label: '进行中' },
  { value: 'ENDED', label: '已结束' },
  { value: 'CANCELLED', label: '已取消' },
] as const;

/* ---------- 系统参数默认值（PRD 4.6.5，可在系统管理中修改） ---------- */
export const DEFAULT_CONFIG = {
  /** 线索超时未跟进阈值（小时） */
  LEAD_OVERDUE_HOURS: 24,
  /** 商机跟进中阶段停留超期阈值（天） */
  OPP_FOLLOWING_LIMIT_DAYS: 3,
  /** 商机谈判中阶段停留超期阈值（天） */
  OPP_NEGOTIATING_LIMIT_DAYS: 7,
  /** 公海数据自动回收天数（BR-H04） */
  POOL_RECYCLE_DAYS: 15,
  /** 客户到期提醒提前天数 */
  CUSTOMER_EXPIRE_WARN_DAYS: 30,
  /** 看板缓存秒数（BR-D02） */
  DASHBOARD_CACHE_SECONDS: 300,
  /** 批量操作同步执行上限（超过转异步） */
  BATCH_SYNC_LIMIT: 500,
  /** 附件大小上限 MB */
  ATTACHMENT_MAX_MB: 10,
  /** 附件数量上限 */
  ATTACHMENT_MAX_COUNT: 5,
  /** 登录失败锁定次数 */
  LOGIN_FAIL_LIMIT: 5,
  /** 登录失败锁定分钟数 */
  LOGIN_LOCK_MINUTES: 30,
  /** 会话超时分钟数 */
  SESSION_TIMEOUT_MINUTES: 120,
} as const;

/* ---------- 业务对象类型（用于过程记录表的 bizType） ---------- */
export const BIZ_TYPE = {
  LEAD: 'LEAD',
  OPPORTUNITY: 'OPPORTUNITY',
  CUSTOMER: 'CUSTOMER',
} as const;
export type BizType = (typeof BIZ_TYPE)[keyof typeof BIZ_TYPE];