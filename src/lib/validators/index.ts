import { z } from 'zod';
import {
  CUSTOMER_STATUS,
  FOLLOW_METHODS,
  FOLLOW_RESULTS,
  LOST_REASONS,
  PSEUDO_REASONS,
  POOL_RETURN_REASONS,
  CUSTOMER_STATUS_META,
} from '@/lib/constants';

const options = <T extends readonly { value: string }[]>(arr: T) =>
  arr.map((o) => o.value) as [string, ...string[]];

/** 客户状态是从常量对象派生的枚举，取其 value 列表 */
const CUSTOMER_STATUS_VALUES = Object.keys(CUSTOMER_STATUS_META) as [
  string,
  ...string[],
];

/** 手机号：11 位数字 */
export const phoneSchema = z
  .string()
  .regex(/^1[3-9]\d{9}$/, '请输入 11 位有效手机号');

/** 跟进内容 10–1000 字（PRD 4.2.4） */
export const followUpContentSchema = z
  .string()
  .min(10, '跟进内容至少 10 字')
  .max(1000, '跟进内容不能超过 1000 字');

/** 备注 ≤ 500 字 */
export const remarkSchema = z.string().max(500, '备注不能超过 500 字').optional();

/* ---------- 登录 ---------- */
export const loginSchema = z.object({
  employeeNo: z.string().min(1, '请输入工号或手机号'),
  password: z.string().min(1, '请输入密码'),
  remember: z.boolean().optional(),
});
export type LoginInput = z.infer<typeof loginSchema>;

/* ---------- 新建线索（PRD 4.2.2） ---------- */
export const createLeadSchema = z.object({
  name: z.string().min(1, '请输入姓名').max(50, '姓名不能超过 50 字'),
  phone: phoneSchema,
  gender: z.enum(['MALE', 'FEMALE', 'UNKNOWN']).optional(),
  sourceChannelId: z.string().min(1, '请选择来源渠道'),
  intentCourseId: z.string().min(1, '请选择意向课程'),
  remark: remarkSchema,
  // 顾问新建时归属人强制为本人，后端会覆盖
  ownerId: z.string().optional(),
});
export type CreateLeadInput = z.infer<typeof createLeadSchema>;

/* ---------- 跟进记录 ---------- */
export const createFollowUpSchema = z.object({
  bizType: z.enum(['LEAD', 'OPPORTUNITY', 'CUSTOMER']),
  bizId: z.string().min(1),
  method: z.enum(options(FOLLOW_METHODS)),
  result: z.enum(options(FOLLOW_RESULTS)).optional(),
  content: followUpContentSchema,
  nextPlan: z.string().max(500).optional(),
  nextFollowAt: z.string().optional(),
  attachmentIds: z.array(z.string()).max(5, '最多上传 5 个附件').optional(),
});
export type CreateFollowUpInput = z.infer<typeof createFollowUpSchema>;

/* ---------- 标记伪线索（PRD 4.2.5） ---------- */
export const markPseudoSchema = z
  .object({
    reason: z.enum(options(PSEUDO_REASONS)),
    // 选择「其他」时备注必填
    remark: z.string().max(200, '备注不能超过 200 字').optional(),
  })
  .refine((d) => d.reason !== 'OTHER' || (d.remark && d.remark.trim().length > 0), {
    message: '选择「其他」时必须填写备注',
    path: ['remark'],
  });
export type MarkPseudoInput = z.infer<typeof markPseudoSchema>;

/* ---------- 踢回公海（PRD 4.3.4） ---------- */
export const returnPoolSchema = z
  .object({
    bizType: z.enum(['LEAD', 'OPPORTUNITY']),
    bizId: z.string().min(1),
    reason: z.enum(options(POOL_RETURN_REASONS)),
    remark: z.string().max(200).optional(),
  })
  .refine((d) => d.reason !== 'OTHER' || (d.remark && d.remark.trim().length > 0), {
    message: '选择「其他」时必须填写备注',
    path: ['remark'],
  });
export type ReturnPoolInput = z.infer<typeof returnPoolSchema>;

/* ---------- 转商机（PRD 4.2.6） ---------- */
export const convertLeadSchema = z.object({
  leadId: z.string().min(1),
  name: z.string().min(1, '请输入商机名称').max(100),
  customerName: z.string().min(1).max(50),
  phone: phoneSchema,
  courseId: z.string().min(1, '请选择关联课程'),
  amount: z.number().positive('商机金额必须大于 0'),
  expectedCloseDate: z.string().min(1, '请选择预计成交日期'),
  sourceChannelId: z.string().optional(),
  ownerId: z.string().optional(),
  stage: z.enum(['FOLLOWING', 'NEGOTIATING']).default('FOLLOWING'),
  description: z.string().max(1000).optional(),
});
export type ConvertLeadInput = z.infer<typeof convertLeadSchema>;

/* ---------- 商机阶段推进 / 赢单 / 输单（PRD 4.3.3） ---------- */
export const advanceStageSchema = z.object({
  oppId: z.string().min(1),
  toStage: z.enum(['NEGOTIATING']),
});

export const markWonSchema = z.object({
  oppId: z.string().min(1),
  wonAmount: z.number().positive('成交金额必须大于 0'),
  wonDate: z.string().min(1, '请选择成交日期'),
  remark: z.string().max(500).optional(),
});

export const markLostSchema = z
  .object({
    oppId: z.string().min(1),
    lostReason: z.enum(options(LOST_REASONS)),
    lostRemark: z.string().max(500).optional(),
  })
  .refine((d) => d.lostReason !== 'OTHER' || (d.lostRemark && d.lostRemark.trim().length > 0), {
    message: '选择「其他」时必须填写说明',
    path: ['lostRemark'],
  });
export type MarkLostInput = z.infer<typeof markLostSchema>;

/* ---------- 分配 ---------- */
export const assignSchema = z.object({
  bizType: z.enum(['LEAD', 'OPPORTUNITY']),
  ids: z.array(z.string()).min(1, '请选择要分配的数据').max(500, '单次最多分配 500 条'),
  ownerId: z.string().min(1, '请选择归属人'),
  /** 均衡分配：按当前待跟进数量自动均衡 */
  strategy: z.enum(['MANUAL', 'BALANCED', 'BY_DEPT']).default('MANUAL'),
});

/* ---------- 客户状态变更（BR-CU02 必填原因） ---------- */
export const changeCustomerStatusSchema = z.object({
  customerId: z.string().min(1),
  status: z.enum(CUSTOMER_STATUS_VALUES),
  reason: z.string().min(1, '请填写变更原因').max(200),
});

/* ---------- 服务记录 ---------- */
export const createServiceRecordSchema = z.object({
  customerId: z.string().min(1),
  type: z.enum(['TRIAL', 'LESSON', 'TUTOR', 'QA']),
  serviceDate: z.string().min(1, '请选择服务日期'),
  duration: z.number().int().min(0).max(1440).optional(),
  staffId: z.string().optional(),
  content: z.string().min(5, '服务内容至少 5 字').max(1000),
  rating: z.number().int().min(1).max(5).optional(),
  abnormal: z.boolean().optional(),
});
export type CreateServiceRecordInput = z.infer<typeof createServiceRecordSchema>;