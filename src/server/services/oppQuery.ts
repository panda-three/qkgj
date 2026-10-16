import 'server-only';
import { query, queryOne } from '@/server/db';
import { getVisibleDeptIds, type SessionUser } from '@/lib/data-scope/scope';

/**
 * 商机查询层
 *
 * 与线索列表同构，但有两个额外关注点：
 * 1. 阶段停留天数 —— PRD 规定跟进中 3 天、谈判中 7 天为超期阈值，
 *    超期商机在看板上要标红，这是销售及时推进的抓手
 * 2. 无归属人的商机（ownerId IS NULL）对全员可见
 */

export type OppQuery = {
  stage?: string;
  keyword?: string;
  ownerId?: string;
  courseId?: string;
  overdueOnly?: boolean;
  page?: number;
  pageSize?: number;
  sortBy?: 'createdAt' | 'amount' | 'expectedCloseDate' | 'stageEnteredAt';
  sortOrder?: 'asc' | 'desc';
};

const SORT_COLUMNS = {
  createdAt: 'o."createdAt"',
  amount: 'o."amount"',
  expectedCloseDate: 'o."expectedCloseDate"',
  stageEnteredAt: 'o."stageEnteredAt"',
} as const;

/** PRD 3.2：各阶段停留天数上限 */
export const STAGE_STAY_LIMIT = {
  FOLLOWING: 3,
  NEGOTIATING: 7,
  WON: null,
  LOST: null,
} as const;

export type OppRow = {
  id: string;
  code: string;
  name: string;
  customerName: string;
  phone: string;
  amount: number;
  stage: string;
  ownerId: string | null;
  ownerName: string | null;
  deptId: string | null;
  deptName: string | null;
  courseName: string | null;
  sourceOppId: string | null;
  stageEnteredAt: string;
  expectedCloseDate: string | null;
  createdAt: string;
};

export async function listOpportunities(user: SessionUser, q: OppQuery) {
  const page = Math.max(1, q.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, q.pageSize ?? 20));
  const offset = (page - 1) * pageSize;

  const params: unknown[] = [];
  const add = (v: unknown): string => {
    params.push(v);
    return `$${params.length}`;
  };

  // 数据权限：无归属人的商机对全员可见
  let scopeSql: string;
  if (user.role === 'SUPER_ADMIN') {
    scopeSql = 'TRUE';
  } else if (user.role === 'SALES_MANAGER') {
    scopeSql = `(o."ownerId" = ${add(user.userId)} OR o."deptId" = ANY(${add(await getVisibleDeptIds(user.deptId))}) OR o."ownerId" IS NULL)`;
  } else {
    scopeSql = `(o."ownerId" = ${add(user.userId)} OR o."ownerId" IS NULL)`;
  }

  const where: string[] = [scopeSql, 'o."isDeleted" = FALSE'];

  if (q.stage) where.push(`o."stage" = ${add(q.stage)}`);
  if (q.keyword) {
    const kw = add(`%${q.keyword}%`);
    where.push(`(o."name" ILIKE ${kw} OR o."customerName" ILIKE ${kw} OR o."phone" ILIKE ${kw})`);
  }
  if (q.ownerId) where.push(`o."ownerId" = ${add(q.ownerId)}`);
  if (q.courseId) where.push(`o."courseId" = ${add(q.courseId)}`);

  // 超期筛选：按阶段停留阈值判断，与看板标红口径一致
  if (q.overdueOnly) {
    where.push(`(
      (o."stage" = 'FOLLOWING'  AND o."stageEnteredAt" < NOW() - interval '3 days') OR
      (o."stage" = 'NEGOTIATING' AND o."stageEnteredAt" < NOW() - interval '7 days')
    )`);
  }

  const whereSql = where.join(' AND ');

  const countRow = await queryOne<{ total: number }>(
    `SELECT COUNT(*)::int AS total FROM "Opportunity" o WHERE ${whereSql}`,
    params,
  );
  const total = countRow?.total ?? 0;

  const sortCol = SORT_COLUMNS[q.sortBy ?? 'createdAt'];
  const sortDir = q.sortOrder === 'asc' ? 'ASC' : 'DESC';

  const rows = await query<OppRow>(
    `SELECT o."id", o."code", o."name", o."customerName", o."phone", o."amount", o."stage",
            o."ownerId", u."name" AS "ownerName",
            o."deptId", d."name" AS "deptName",
            c."name" AS "courseName", o."sourceOppId",
            o."stageEnteredAt", o."expectedCloseDate", o."createdAt"
       FROM "Opportunity" o
       LEFT JOIN "User" u ON u."id" = o."ownerId"
       LEFT JOIN "Dept" d ON d."id" = o."deptId"
       LEFT JOIN "Course" c ON c."id" = o."courseId"
      WHERE ${whereSql}
      ORDER BY ${sortCol} ${sortDir} NULLS LAST, o."id" ASC
      LIMIT ${add(pageSize)} OFFSET ${add(offset)}`,
    params,
  );

  return { rows, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

/** 各阶段数量 + 超期数，用于看板列头统计 */
export async function countOpportunities(user: SessionUser) {
  const params: unknown[] = [];
  const add = (v: unknown): string => {
    params.push(v);
    return `$${params.length}`;
  };

  let scopeSql: string;
  if (user.role === 'SUPER_ADMIN') {
    scopeSql = 'TRUE';
  } else if (user.role === 'SALES_MANAGER') {
    scopeSql = `(o."ownerId" = ${add(user.userId)} OR o."deptId" = ANY(${add(await getVisibleDeptIds(user.deptId))}) OR o."ownerId" IS NULL)`;
  } else {
    scopeSql = `(o."ownerId" = ${add(user.userId)} OR o."ownerId" IS NULL)`;
  }

  return queryOne<Record<string, number>>(
    `SELECT
       COUNT(*) FILTER (WHERE o."stage" = 'FOLLOWING')::int AS "FOLLOWING",
       COUNT(*) FILTER (WHERE o."stage" = 'NEGOTIATING')::int AS "NEGOTIATING",
       COUNT(*) FILTER (WHERE o."stage" = 'WON')::int AS "WON",
       COUNT(*) FILTER (WHERE o."stage" = 'LOST')::int AS "LOST",
       COUNT(*) FILTER (WHERE o."stage" <> 'WON' AND o."stage" <> 'LOST')::int AS "OPEN",
       COALESCE(SUM(o."amount") FILTER (WHERE o."stage" <> 'WON' AND o."stage" <> 'LOST'), 0) AS "OPEN_AMOUNT",
       COUNT(*) FILTER (
         WHERE (o."stage" = 'FOLLOWING'  AND o."stageEnteredAt" < NOW() - interval '3 days') OR
               (o."stage" = 'NEGOTIATING' AND o."stageEnteredAt" < NOW() - interval '7 days')
       )::int AS "OVERDUE"
     FROM "Opportunity" o
     WHERE ${scopeSql} AND o."isDeleted" = FALSE`,
    params,
  );
}

/** 商机看板：按阶段分组返回，供看板视图使用 */
export async function getOppBoard(user: SessionUser) {
  const { rows } = await listOpportunities(user, { pageSize: 100, sortBy: 'stageEnteredAt', sortOrder: 'asc' });
  return rows;
}

/** 商机详情（含状态流转历史） */
export async function getOppDetail(user: SessionUser, oppId: string) {
  const params: unknown[] = [];
  const add = (v: unknown): string => {
    params.push(v);
    return `$${params.length}`;
  };

  let scopeSql: string;
  if (user.role === 'SUPER_ADMIN') {
    scopeSql = 'TRUE';
  } else if (user.role === 'SALES_MANAGER') {
    scopeSql = `(o."ownerId" = ${add(user.userId)} OR o."deptId" = ANY(${add(await getVisibleDeptIds(user.deptId))}) OR o."ownerId" IS NULL)`;
  } else {
    scopeSql = `(o."ownerId" = ${add(user.userId)} OR o."ownerId" IS NULL)`;
  }

  const opp = await queryOne<OppRow & { lastFollowAt: string | null; nextFollowAt: string | null }>(
    `SELECT o."id", o."code", o."name", o."customerName", o."phone", o."amount", o."stage",
            o."ownerId", u."name" AS "ownerName",
            o."deptId", d."name" AS "deptName",
            c."name" AS "courseName", o."sourceOppId",
            o."stageEnteredAt", o."expectedCloseDate", o."createdAt",
            o."lastFollowAt", o."nextFollowAt"
       FROM "Opportunity" o
       LEFT JOIN "User" u ON u."id" = o."ownerId"
       LEFT JOIN "Dept" d ON d."id" = o."deptId"
       LEFT JOIN "Course" c ON c."id" = o."courseId"
      WHERE o."id" = ${add(oppId)} AND o."isDeleted" = FALSE AND ${scopeSql}`,
    params,
  );

  if (!opp) return null;

  const [logs, followUps] = await Promise.all([
    query<{ id: string; fromStatus: string | null; toStatus: string; action: string; changedBy: string; changedAt: string; remark: string | null }>(
      `SELECT s."id", s."fromStatus", s."toStatus", s."action",
              COALESCE(u."name", '系统') AS "changedBy", s."changedAt", s."remark"
         FROM "StatusChangeLog" s
         LEFT JOIN "User" u ON u."id" = s."changedById"
        WHERE s."bizType" = 'OPPORTUNITY' AND s."bizId" = $1
        ORDER BY s."changedAt" DESC`,
      [oppId],
    ),
    query<{ id: string; method: string; result: string | null; content: string; nextPlan: string | null; createdBy: string; createdAt: string }>(
      `SELECT f."id", f."method", f."result", f."content", f."nextPlan",
              COALESCE(u."name", '系统') AS "createdBy", f."createdAt"
         FROM "FollowUp" f
         LEFT JOIN "User" u ON u."id" = f."createdById"
        WHERE f."bizType" = 'OPPORTUNITY' AND f."bizId" = $1
        ORDER BY f."createdAt" DESC
        LIMIT 50`,
      [oppId],
    ),
  ]);

  return { opp, logs, followUps };
}

/** 商机筛选选项 */
export async function getOppFilterOptions(user: SessionUser) {
  const courses = await query<{ id: string; name: string }>(
    `SELECT "id","name" FROM "Course" WHERE "isDeleted" = FALSE ORDER BY "code"`,
  );

  let owners: { id: string; name: string; deptName: string }[] = [];
  if (user.role === 'SUPER_ADMIN') {
    owners = await query(
      `SELECT u."id", u."name", d."name" AS "deptName" FROM "User" u
         JOIN "Dept" d ON d."id" = u."deptId"
        WHERE u."status" = 'ACTIVE' AND u."role" <> 'SUPER_ADMIN' ORDER BY u."employeeNo"`,
    );
  } else if (user.role === 'SALES_MANAGER') {
    owners = await query(
      `SELECT u."id", u."name", d."name" AS "deptName" FROM "User" u
         JOIN "Dept" d ON d."id" = u."deptId"
        WHERE u."status" = 'ACTIVE' AND u."role" = 'SALES'
          AND u."deptId" = ANY($1::text[]) ORDER BY u."employeeNo`,
      [await getVisibleDeptIds(user.deptId)],
    );
  } else {
    owners = await query(
      `SELECT u."id", u."name", d."name" AS "deptName" FROM "User" u
         JOIN "Dept" d ON d."id" = u."deptId" WHERE u."id" = $1`,
      [user.userId],
    );
  }

  return { courses, owners };
}