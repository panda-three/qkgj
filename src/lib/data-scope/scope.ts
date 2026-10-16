import { query } from '@/server/db';

/**
 * 数据权限
 *
 * PRD 规则 3 明确要求：
 * · 列表查询必须在 SQL 层拼接数据权限条件
 * · 禁止查询全量后在内存过滤（10 万条数据量下不可行）
 * · 详情/编辑/操作接口需二次校验，防止直接输入 ID 越权
 * · 前端按钮隐藏不作为权限控制
 *
 * 可见数据 = ( 归属人 == 当前用户 )
 *          OR ( 数据部门 ∈ 用户可见部门集合 )
 *          OR ( 数据状态 == 公海 )
 */

export type SessionUser = {
  userId: string;
  role: string;
  deptId: string;
  deptName: string;
  name: string;
  employeeNo: string;
};

/**
 * 计算用户可见部门集合（PRD 规则 1）。
 * 主管可见「本部门 + 所有子孙部门」，走 Dept.path 物化路径前缀匹配，
 * 避免递归查询。
 */
export async function getVisibleDeptIds(deptId: string): Promise<string[]> {
  const rows = await query<{ id: string; path: string }>(
    `SELECT "id","path" FROM "Dept" WHERE "id" = $1 LIMIT 1`,
    [deptId],
  );
  const self = rows[0];
  if (!self) return [deptId];

  const children = await query<{ id: string }>(
    `SELECT "id" FROM "Dept" WHERE "path" LIKE $1`,
    [`${self.path}%`],
  );
  return [self.id, ...children.map((c) => c.id)];
}

/**
 * 构造数据权限条件片段。
 * 返回的 SQL 直接插入 WHERE 子句，params 顺序与 $N 严格对应。
 *
 * @param startAt 参数占位符起始序号（前面已占用几个 $N）
 * @param opts.isLead 线索用 status 判定公海；商机用 ownerId IS NULL 判定
 */
export async function buildDataScope(
  user: SessionUser,
  startAt: number,
  opts: { isLead: boolean } = { isLead: true },
): Promise<{ sql: string; params: unknown[] }> {
  // 超级管理员：全系统数据
  if (user.role === 'SUPER_ADMIN') {
    return { sql: 'TRUE', params: [] };
  }

  const poolExpr = opts.isLead ? `"status" = 'TO_POOL'` : '"ownerId" IS NULL';

  // 销售顾问：仅本人 + 公海
  if (user.role === 'SALES') {
    return {
      sql: `("ownerId" = $${startAt} OR ${poolExpr})`,
      params: [user.userId],
    };
  }

  // 销售主管：本部门及所有子孙部门 + 本人 + 公海
  const deptIds = await getVisibleDeptIds(user.deptId);
  if (deptIds.length === 0) {
    return { sql: `("ownerId" = $${startAt} OR ${poolExpr})`, params: [user.userId] };
  }

  const placeholders = deptIds.map((_, i) => `$${startAt + 1 + i}`).join(', ');
  return {
    sql: `("ownerId" = $${startAt} OR "deptId" IN (${placeholders}) OR ${poolExpr})`,
    params: [user.userId, ...deptIds],
  };
}

/**
 * 详情 / 操作前的二次校验。
 * 用于 POST / PUT / DELETE 接口，防止直接输入 ID 越权访问。
 */
export async function canAccessRecord(
  user: SessionUser,
  record: { ownerId: string | null; deptId: string | null; status?: string | null },
  bizType: 'LEAD' | 'OPPORTUNITY' | 'CUSTOMER',
): Promise<{ allowed: boolean; reason?: string }> {
  if (user.role === 'SUPER_ADMIN') return { allowed: true };

  // 公海数据对全员可见
  if (record.ownerId === null) return { allowed: true };
  if (bizType === 'LEAD' && record.status === 'TO_POOL') return { allowed: true };

  if (record.ownerId === user.userId) return { allowed: true };

  if (user.role === 'SALES_MANAGER') {
    const visible = await getVisibleDeptIds(user.deptId);
    if (record.deptId && visible.includes(record.deptId)) return { allowed: true };
  }

  return { allowed: false, reason: '数据不属于您或您的部门' };
}