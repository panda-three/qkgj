import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getSession, type SessionPayload } from '@/lib/auth/session';
import { ROLE_LEVEL, type RoleKey } from '@/lib/constants';
import { queryOne } from '@/server/db';

export class BusinessError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'BusinessError';
  }
}

/** 未登录 → 跳转登录页 */
export async function requireSession(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) redirect('/login');
  return session;
}

/** 角色等级校验。PRD 2.4：角色无该功能权限 → 403「无操作权限」 */
export function hasRoleLevel(session: SessionPayload, min: RoleKey): boolean {
  return ROLE_LEVEL[session.role as RoleKey] >= ROLE_LEVEL[min];
}

/**
 * 功能权限校验（读 RolePerm 表）。
 * 超管恒有权限；其余角色查开关配置，调整后下次请求即生效（PRD 4.6.2）。
 * 未配置的权限点默认放行，避免漏配导致功能不可用。
 */
export async function hasPermission(session: SessionPayload, permKey: string): Promise<boolean> {
  if (session.role === 'SUPER_ADMIN') return true;

  const row = await queryOne<{ allowed: boolean }>(
    `SELECT "allowed" FROM "RolePerm" WHERE "role" = $1 AND "permKey" = $2 LIMIT 1`,
    [session.role, permKey],
  );
  return row?.allowed ?? true;
}

export async function requirePermission(session: SessionPayload, permKey: string): Promise<void> {
  if (!(await hasPermission(session, permKey))) {
    throw new BusinessError(403, '无操作权限');
  }
}