import 'server-only';
import { query, queryOne } from '@/server/db';
import { getVisibleDeptIds, type SessionUser } from '@/lib/data-scope/scope';

/**
 * 客户查询层
 *
 * 客户档案的核心是时间轴（PRD 4.5）：
 * 跟进记录、服务记录、状态变更、资金流水按时间倒序合并，
 * 完整还原「这个客户经历了什么」。
 */

export type CustomerQuery = {
  status?: string;
  keyword?: string;
  ownerId?: string;
  /** SERVICE_EXPIRING 服务即将到期 */
  expiringOnly?: boolean;
  page?: number;
  pageSize?: number;
  sortBy?: 'dealDate' | 'amount' | 'serviceExpireDate' | 'createdAt';
  sortOrder?: 'asc' | 'desc';
};

const SORT_COLUMNS = {
  dealDate: 'cu."dealDate"',
  amount: 'cu."amount"',
  serviceExpireDate: 'cu."serviceExpireDate"',
  createdAt: 'cu."createdAt"',
} as const;

export type CustomerRow = {
  id: string;
  code: string;
  name: string;
  phone: string;
  status: string;
  amount: number;
  ownerId: string | null;
  ownerName: string | null;
  deptId: string | null;
  deptName: string | null;
  courseName: string | null;
  sourceOppId: string | null;
  serviceExpireDate: string | null;
  dealDate: string | null;
  createdAt: string;
};

export async function listCustomers(user: SessionUser, q: CustomerQuery) {
  const page = Math.max(1, q.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, q.pageSize ?? 20));
  const offset = (page - 1) * pageSize;

  const params: unknown[] = [];
  const add = (v: unknown): string => {
    params.push(v);
    return `$${params.length}`;
  };

  let scopeSql: string;
  if (user.role === 'SUPER_ADMIN') {
    scopeSql = 'TRUE';
  } else if (user.role === 'SALES_MANAGER') {
    scopeSql = `(cu."ownerId" = ${add(user.userId)} OR cu."deptId" = ANY(${add(await getVisibleDeptIds(user.deptId))}))`;
  } else {
    scopeSql = `cu."ownerId" = ${add(user.userId)}`;
  }

  const where: string[] = [scopeSql, 'cu."isDeleted" = FALSE'];

  if (q.status) where.push(`cu."status" = ${add(q.status)}`);
  if (q.keyword) {
    const kw = add(`%${q.keyword}%`);
    where.push(`(cu."name" ILIKE ${kw} OR cu."phone" ILIKE ${kw} OR cu."code" ILIKE ${kw})`);
  }
  if (q.ownerId) where.push(`cu."ownerId" = ${add(q.ownerId)}`);
  if (q.expiringOnly) {
    where.push(`(cu."serviceExpireDate" IS NOT NULL AND cu."serviceExpireDate" <= NOW() + interval '30 days')`);
  }

  const whereSql = where.join(' AND ');

  const countRow = await queryOne<{ total: number }>(
    `SELECT COUNT(*)::int AS total FROM "Customer" cu WHERE ${whereSql}`,
    params,
  );
  const total = countRow?.total ?? 0;

  const sortCol = SORT_COLUMNS[q.sortBy ?? 'dealDate'];
  const sortDir = q.sortOrder === 'asc' ? 'ASC' : 'DESC';

  const rows = await query<CustomerRow>(
    `SELECT cu."id", cu."code", cu."name", cu."phone", cu."status", cu."amount",
            cu."ownerId", u."name" AS "ownerName",
            cu."deptId", d."name" AS "deptName",
            c."name" AS "courseName", cu."sourceOppId",
            cu."serviceExpireDate", cu."dealDate", cu."createdAt"
       FROM "Customer" cu
       LEFT JOIN "User" u ON u."id" = cu."ownerId"
       LEFT JOIN "Dept" d ON d."id" = cu."deptId"
       LEFT JOIN "Course" c ON c."id" = cu."courseId"
      WHERE ${whereSql}
      ORDER BY ${sortCol} ${sortDir} NULLS LAST, cu."id" ASC
      LIMIT ${add(pageSize)} OFFSET ${add(offset)}`,
    params,
  );

  return { rows, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

export async function countCustomers(user: SessionUser) {
  const params: unknown[] = [];
  const add = (v: unknown): string => {
    params.push(v);
    return `$${params.length}`;
  };

  let scopeSql: string;
  if (user.role === 'SUPER_ADMIN') {
    scopeSql = 'TRUE';
  } else if (user.role === 'SALES_MANAGER') {
    scopeSql = `(cu."ownerId" = ${add(user.userId)} OR cu."deptId" = ANY(${add(await getVisibleDeptIds(user.deptId))}))`;
  } else {
    scopeSql = `cu."ownerId" = ${add(user.userId)}`;
  }

  return queryOne<Record<string, number>>(
    `SELECT
       COUNT(*)::int AS "all",
       COUNT(*) FILTER (WHERE "status" = 'ACTIVE')::int AS "ACTIVE",
       COUNT(*) FILTER (WHERE "status" = 'PAUSED')::int AS "PAUSED",
       COUNT(*) FILTER (WHERE "status" = 'COMPLETED')::int AS "COMPLETED",
       COUNT(*) FILTER (WHERE "status" = 'REFUNDED')::int AS "REFUNDED",
       COUNT(*) FILTER (WHERE "status" = 'LOST')::int AS "LOST",
       COALESCE(SUM("amount"), 0) AS "totalAmount",
       COUNT(*) FILTER (
         WHERE "serviceExpireDate" IS NOT NULL
           AND "serviceExpireDate" <= NOW() + interval '30 days'
       )::int AS "EXPIRING"
     FROM "Customer" cu
     WHERE ${scopeSql} AND "isDeleted" = FALSE`,
    params,
  );
}

/** 客户详情：基础信息 + 合并时间轴 */
export async function getCustomerDetail(user: SessionUser, id: string) {
  const params: unknown[] = [];
  const add = (v: unknown): string => {
    params.push(v);
    return `$${params.length}`;
  };

  let scopeSql: string;
  if (user.role === 'SUPER_ADMIN') {
    scopeSql = 'TRUE';
  } else if (user.role === 'SALES_MANAGER') {
    scopeSql = `(cu."ownerId" = ${add(user.userId)} OR cu."deptId" = ANY(${add(await getVisibleDeptIds(user.deptId))}))`;
  } else {
    scopeSql = `cu."ownerId" = ${add(user.userId)}`;
  }

  const customer = await queryOne<
    CustomerRow & { lastFollowAt: string | null; refundAmount: number; totalServiceCount: number }
  >(
    `SELECT cu."id", cu."code", cu."name", cu."phone", cu."status", cu."amount",
            cu."ownerId", u."name" AS "ownerName",
            cu."deptId", d."name" AS "deptName",
            c."name" AS "courseName", cu."sourceOppId",
            cu."serviceExpireDate", cu."dealDate", cu."createdAt",
            cu."lastFollowAt", COALESCE(cu."refundAmount", 0) AS "refundAmount",
            (SELECT COUNT(*) FROM "ServiceRecord" s WHERE s."customerId" = cu."id")::int AS "totalServiceCount"
       FROM "Customer" cu
       LEFT JOIN "User" u ON u."id" = cu."ownerId"
       LEFT JOIN "Dept" d ON d."id" = cu."deptId"
       LEFT JOIN "Course" c ON c."id" = cu."courseId"
      WHERE cu."id" = ${add(id)} AND cu."isDeleted" = FALSE AND ${scopeSql}`,
    params,
  );

  if (!customer) return null;

  const [statusLogs, followUps, services, amountChanges] = await Promise.all([
    query<{ id: string; fromStatus: string | null; toStatus: string; action: string; changedBy: string; changedAt: string; remark: string | null }>(
      `SELECT s."id", s."fromStatus", s."toStatus", s."action",
              COALESCE(u."name", '系统') AS "changedBy", s."changedAt", s."remark"
         FROM "StatusChangeLog" s
         LEFT JOIN "User" u ON u."id" = s."changedById"
        WHERE s."bizType" = 'CUSTOMER' AND s."bizId" = $1
        ORDER BY s."changedAt" DESC`,
      [id],
    ),
    query<{ id: string; method: string; result: string | null; content: string; createdBy: string; createdAt: string }>(
      `SELECT f."id", f."method", f."result", f."content",
              COALESCE(u."name", '系统') AS "createdBy", f."createdAt"
         FROM "FollowUp" f
         LEFT JOIN "User" u ON u."id" = f."createdById"
        WHERE f."bizType" = 'CUSTOMER' AND f."bizId" = $1
        ORDER BY f."createdAt" DESC LIMIT 50`,
      [id],
    ),
    query<{ id: string; type: string; serviceDate: string; durationMinutes: number; teacherName: string | null; content: string | null; createdBy: string; createdAt: string }>(
      `SELECT s."id", s."type", s."serviceDate", s."durationMinutes",
              s."teacherName", s."content",
              COALESCE(u."name", '系统') AS "createdBy", s."createdAt"
         FROM "ServiceRecord" s
         LEFT JOIN "User" u ON u."id" = s."createdById"
        WHERE s."customerId" = $1
        ORDER BY s."serviceDate" DESC LIMIT 50`,
      [id],
    ),
    query<{ id: string; changeType: string; amount: number; reason: string | null; operatorName: string; createdAt: string }>(
      `SELECT h."id", h."changeType", h."amount", h."reason",
              COALESCE(u."name", '系统') AS "operatorName", h."createdAt"
         FROM "AmountHistory" h
         LEFT JOIN "User" u ON u."id" = h."operatorId"
        WHERE h."bizType" = 'CUSTOMER' AND h."bizId" = $1
        ORDER BY h."createdAt" DESC LIMIT 30`,
      [id],
    ),
  ]);

  // 合并时间轴：四类事件按时间倒序合并
  const timeline = [
    ...statusLogs.map((s) => ({
      key: s.id,
      kind: 'status' as const,
      at: s.changedAt,
      title: '客户状态变更',
      detail: `${s.fromStatus ?? '—'} → ${s.toStatus}`,
      remark: s.remark,
      operator: s.changedBy,
    })),
    ...followUps.map((f) => ({
      key: f.id,
      kind: 'follow' as const,
      at: f.createdAt,
      title: '跟进记录',
      detail: f.content,
      method: f.method,
      operator: f.createdBy,
    })),
    ...services.map((s) => ({
      key: s.id,
      kind: 'service' as const,
      at: s.serviceDate,
      title: `服务记录 · ${s.type}`,
      detail: s.content ?? '',
      duration: s.durationMinutes,
      operator: s.createdBy,
    })),
    ...amountChanges.map((h) => ({
      key: h.id,
      kind: 'amount' as const,
      at: h.createdAt,
      title: `金额变更 · ${h.changeType}`,
      detail: `${h.amount > 0 ? '+' : ''}${h.amount}`,
      remark: h.reason,
      operator: h.operatorName,
    })),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  return { customer, timeline };
}