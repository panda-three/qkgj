import 'server-only';
import { query, queryOne } from '@/server/db';
import { getVisibleDeptIds, type SessionUser } from '@/lib/data-scope/scope';

/**
 * 线索列表查询
 *
 * 关键约束（PRD 规则 3）：
 * · 数据权限必须在 SQL 层拼接，不能查全量后内存过滤
 * · 排序必须是真实 ORDER BY（原型里只换图标 + toast，是假的）
 * · 排序字段必须走白名单映射，禁止拼接用户输入到 SQL
 */

export type LeadSortField = 'createdAt' | 'lastFollowAt' | 'nextFollowAt' | 'followCount' | 'name';

export type LeadQuery = {
  status?: string;
  keyword?: string;
  ownerId?: string;
  deptId?: string;
  channelId?: string;
  courseId?: string;
  createdFrom?: string;
  createdTo?: string;
  /** OVERDUE 超期未跟进 / NEVER 从未跟进 —— 派生筛选，非表字段 */
  followState?: string;
  page?: number;
  pageSize?: number;
  sortBy?: LeadSortField;
  sortOrder?: 'asc' | 'desc';
};

/** 排序字段白名单：把外部输入映射到真实列名，杜绝 SQL 注入 */
const SORT_COLUMNS: Record<LeadSortField, string> = {
  createdAt: '"createdAt"',
  lastFollowAt: '"lastFollowAt"',
  nextFollowAt: '"nextFollowAt"',
  followCount: '"followCount"',
  name: '"name"',
};

export type LeadRow = {
  id: string;
  code: string;
  name: string;
  phone: string;
  gender: string | null;
  status: string;
  ownerId: string | null;
  ownerName: string | null;
  deptId: string | null;
  deptName: string | null;
  channelName: string | null;
  courseName: string | null;
  followCount: number;
  lastFollowAt: string | null;
  nextFollowAt: string | null;
  createdAt: string;
  version: number;
};

export async function listLeads(user: SessionUser, q: LeadQuery) {
  const page = Math.max(1, q.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, q.pageSize ?? 20));
  const offset = (page - 1) * pageSize;

  const params: unknown[] = [];
  const add = (v: unknown): string => {
    params.push(v);
    return `$${params.length}`;
  };

  /* ---------- 数据权限条件 ---------- */
  let scopeSql: string;
  if (user.role === 'SUPER_ADMIN') {
    scopeSql = 'TRUE';
  } else if (user.role === 'SALES_MANAGER') {
    const deptIds = await getVisibleDeptIds(user.deptId);
    const uid = add(user.userId);
    const did = add(deptIds);
    scopeSql = `(l."ownerId" = ${uid} OR l."deptId" = ANY(${did}) OR l."status" = 'TO_POOL')`;
  } else {
    const uid = add(user.userId);
    scopeSql = `(l."ownerId" = ${uid} OR l."status" = 'TO_POOL')`;
  }

  /* ---------- 业务筛选 ---------- */
  const where: string[] = [scopeSql, 'l."isDeleted" = FALSE'];

  if (q.status) {
    where.push(`l."status" = ${add(q.status)}`);
  } else {
    // 未指定状态时，伪线索默认隐藏（PRD 4.2.5：伪线索为终态默认隐藏）
    where.push(`l."status" <> 'PSEUDO'`);
  }

  if (q.keyword) {
    const kw = add(`%${q.keyword}%`);
    where.push(`(l."name" ILIKE ${kw} OR l."phone" ILIKE ${kw})`);
  }

  if (q.ownerId) where.push(`l."ownerId" = ${add(q.ownerId)}`);
  if (q.deptId) where.push(`l."deptId" = ${add(q.deptId)}`);
  if (q.channelId) where.push(`l."sourceChannelId" = ${add(q.channelId)}`);
  if (q.courseId) where.push(`l."intentCourseId" = ${add(q.courseId)}`);
  if (q.createdFrom) where.push(`l."createdAt" >= ${add(q.createdFrom)}`);
  if (q.createdTo) where.push(`l."createdAt" <= ${add(q.createdTo)}::timestamptz + interval '1 day'`);

  // 派生筛选：超期未跟进 / 从未跟进
  if (q.followState === 'OVERDUE') {
    where.push(`l."nextFollowAt" IS NOT NULL AND l."nextFollowAt" < NOW() AND l."status" = 'FOLLOWING'`);
  } else if (q.followState === 'NEVER') {
    where.push(`(l."lastFollowAt" IS NULL AND l."followCount" = 0)`);
  }

  const whereSql = where.join(' AND ');

  /* ---------- 总数 ---------- */
  const countRow = await queryOne<{ total: number }>(
    `SELECT COUNT(*)::int AS total FROM "Lead" l WHERE ${whereSql}`,
    params,
  );
  const total = countRow?.total ?? 0;

  /* ---------- 排序（真实 ORDER BY，走白名单） ---------- */
  const sortCol = SORT_COLUMNS[q.sortBy ?? 'createdAt'];
  const sortDir = q.sortOrder === 'asc' ? 'ASC' : 'DESC';
  // NULL 统一排最后，避免"未设下次跟进"的行插在中间干扰浏览
  const nullRule = sortDir === 'DESC' ? 'NULLS LAST' : 'NULLS FIRST';

  const limitP = add(pageSize);
  const offsetP = add(offset);

  const rows = await query<LeadRow>(
    `SELECT l."id", l."code", l."name", l."phone", l."gender", l."status",
            l."ownerId", u."name" AS "ownerName",
            l."deptId", d."name" AS "deptName",
            ch."name" AS "channelName", c."name" AS "courseName",
            l."followCount", l."lastFollowAt", l."nextFollowAt", l."createdAt", l."version"
       FROM "Lead" l
       LEFT JOIN "User" u ON u."id" = l."ownerId"
       LEFT JOIN "Dept" d ON d."id" = l."deptId"
       LEFT JOIN "Channel" ch ON ch."id" = l."sourceChannelId"
       LEFT JOIN "Course" c ON c."id" = l."intentCourseId"
      WHERE ${whereSql}
      ORDER BY ${sortCol} ${sortDir} ${nullRule}, l."id" ASC
      LIMIT ${limitP} OFFSET ${offsetP}`,
    params,
  );

  return { rows, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

/** 各状态计数，用于快捷页签的角标 */
export async function countLeadsByStatus(user: SessionUser) {
  const params: unknown[] = [];
  const add = (v: unknown): string => {
    params.push(v);
    return `$${params.length}`;
  };

  let scopeSql: string;
  if (user.role === 'SUPER_ADMIN') {
    scopeSql = 'TRUE';
  } else if (user.role === 'SALES_MANAGER') {
    const deptIds = await getVisibleDeptIds(user.deptId);
    scopeSql = `(l."ownerId" = ${add(user.userId)} OR l."deptId" = ANY(${add(deptIds)}) OR l."status" = 'TO_POOL')`;
  } else {
    scopeSql = `(l."ownerId" = ${add(user.userId)} OR l."status" = 'TO_POOL')`;
  }

  return queryOne<Record<string, number>>(
    `SELECT
       COUNT(*) FILTER (WHERE l."status" <> 'PSEUDO')::int AS "all",
       COUNT(*) FILTER (WHERE l."status" = 'PENDING')::int AS "PENDING",
       COUNT(*) FILTER (WHERE l."status" = 'FOLLOWING')::int AS "FOLLOWING",
       COUNT(*) FILTER (WHERE l."status" = 'PSEUDO')::int AS "PSEUDO",
       COUNT(*) FILTER (WHERE l."status" = 'CONVERTED')::int AS "CONVERTED",
       COUNT(*) FILTER (WHERE l."status" = 'TO_POOL')::int AS "TO_POOL",
       COUNT(*) FILTER (
         WHERE l."nextFollowAt" IS NOT NULL
           AND l."nextFollowAt" < NOW()
           AND l."status" = 'FOLLOWING'
       )::int AS "OVERDUE",
       COUNT(*) FILTER (
         WHERE l."lastFollowAt" IS NULL AND l."followCount" = 0
       )::int AS "NEVER"
     FROM "Lead" l
     WHERE ${scopeSql} AND l."isDeleted" = FALSE`,
    params,
  );
}

/** 筛选器选项：来源渠道、意向课程、归属人、部门 */
export async function getLeadFilterOptions(user: SessionUser) {
  const [channels, courses] = await Promise.all([
    query<{ id: string; name: string }>(
      `SELECT "id","name" FROM "Channel" WHERE "isDeleted" = FALSE ORDER BY "name"`,
    ),
    query<{ id: string; name: string }>(
      `SELECT "id","name" FROM "Course" WHERE "isDeleted" = FALSE ORDER BY "code"`,
    ),
  ]);

  // 归属人下拉：按角色裁剪可见范围，避免顾问看到无关同事
  let owners: { id: string; name: string; deptName: string }[] = [];
  if (user.role === 'SUPER_ADMIN') {
    owners = await query<{ id: string; name: string; deptName: string }>(
      `SELECT u."id", u."name", d."name" AS "deptName"
         FROM "User" u JOIN "Dept" d ON d."id" = u."deptId"
        WHERE u."status" = 'ACTIVE' AND u."role" <> 'SUPER_ADMIN'
        ORDER BY u."employeeNo"`,
    );
  } else if (user.role === 'SALES_MANAGER') {
    const deptIds = await getVisibleDeptIds(user.deptId);
    owners = await query<{ id: string; name: string; deptName: string }>(
      `SELECT u."id", u."name", d."name" AS "deptName"
         FROM "User" u JOIN "Dept" d ON d."id" = u."deptId"
        WHERE u."status" = 'ACTIVE'
          AND u."role" = 'SALES'
          AND u."deptId" = ANY($1::text[])
        ORDER BY u."employeeNo"`,
      [deptIds],
    );
  } else {
    owners = await query<{ id: string; name: string; deptName: string }>(
      `SELECT u."id", u."name", d."name" AS "deptName"
         FROM "User" u JOIN "Dept" d ON d."id" = u."deptId"
        WHERE u."id" = $1`,
      [user.userId],
    );
  }

  // 部门下拉：仅超管与主管可见
  const depts =
    user.role === 'SUPER_ADMIN'
      ? await query<{ id: string; name: string }>(
          `SELECT "id","name" FROM "Dept" WHERE "status" = 'ACTIVE' ORDER BY "sortNo"`,
        )
      : user.role === 'SALES_MANAGER'
        ? await query<{ id: string; name: string }>(
            `SELECT "id","name" FROM "Dept" WHERE "id" = ANY($1::text[]) ORDER BY "sortNo"`,
            [await getVisibleDeptIds(user.deptId)],
          )
        : [];

  return { channels, courses, owners, depts };
}