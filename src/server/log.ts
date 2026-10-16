import { headers } from 'next/headers';
import { query, newId } from '@/server/db';

/**
 * 操作日志
 *
 * PRD 4.6.4 定义 11 类必记操作，日志不可删除、不可修改，仅追加。
 * 写日志失败不阻断主流程，只在开发环境打印。
 */
export type LogAction =
  | 'LOGIN'
  | 'LOGOUT'
  | 'LOGIN_FAILED'
  | 'CREATE'
  | 'UPDATE'
  | 'DELETE'
  | 'ASSIGN'
  | 'STATUS_CHANGE'
  | 'POOL_RETURN'
  | 'POOL_CLAIM'
  | 'PSEUDO_MARK'
  | 'CONVERT_LEAD'
  | 'CONVERT_CUSTOMER'
  | 'PERM_CHANGE'
  | 'ACCOUNT_CHANGE'
  | 'REVEAL_PHONE'
  | 'EXPORT'
  | 'FOLLOW_UP'
  | 'OPP_STAGE'
  | 'OPP_WON'
  | 'OPP_LOST';

export async function writeLog(params: {
  operatorId?: string;
  operatorDeptId?: string;
  operatorName: string;
  action: LogAction;
  targetType?: string;
  targetId?: string;
  summary?: string;
  before?: unknown;
  after?: unknown;
}): Promise<void> {
  try {
    const hdrs = await headers();
    const ip =
      hdrs.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      hdrs.get('x-real-ip') ||
      undefined;

    await query(
      `INSERT INTO "OperationLog"
       ("id","operatorId","operatorDeptId","operatorName","action",
        "targetType","targetId","summary","before","after","ip","ua")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        newId('log-'),
        params.operatorId ?? null,
        params.operatorDeptId ?? null,
        params.operatorName,
        params.action,
        params.targetType ?? null,
        params.targetId ?? null,
        params.summary ?? null,
        params.before ? JSON.stringify(params.before) : null,
        params.after ? JSON.stringify(params.after) : null,
        ip ?? null,
        hdrs.get('user-agent') ?? null,
      ],
    );
  } catch (e) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[writeLog] 写入失败', e);
    }
  }
}

/** 变更前后值对比，只保留真正变化的字段，否则日志毫无价值 */
export function diffOf(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
) {
  if (!before && !after) return { before: null, after: null };

  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  const b: Record<string, unknown> = {};
  const a: Record<string, unknown> = {};

  for (const k of keys) {
    const bv = before?.[k];
    const av = after?.[k];
    if (JSON.stringify(bv) !== JSON.stringify(av)) {
      if (before) b[k] = bv;
      if (after) a[k] = av;
    }
  }
  return { before: b, after: a };
}