import 'server-only';
import { query, queryOne } from '@/server/db';
import { getVisibleDeptIds, type SessionUser } from '@/lib/data-scope/scope';

/**
 * 公海池查询
 *
 * 公海池的特点：
 * · 线索 ownerId 为 NULL，状态为 TO_POOL，全员可见可领
 * · 归属轨迹完整保留，这是 PRD BR-H05 的硬性要求
 * · 「等待天数」是领取紧迫性的核心指标：越久没人领越危险
 */

export async function listPool(
  user: SessionUser,
  q: { keyword?: string; page?: number; pageSize?: number; sortBy?: 'createdAt' | 'updatedAt'; sortOrder?: 'asc' | 'desc' },
) {
  const page = Math.max(1, q.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, q.pageSize ?? 20));
  const offset = (page - 1) * pageSize;

  const params: unknown[] = [];
  const add = (v: unknown): string => {
    params.push(v);
    return `$${params.length}`;
  };

  // 公海池对全员可见，不做归属限制（这是公海的意义）
  const where: string[] = [`l."status" = 'TO_POOL'`, `l."ownerId" IS NULL`, 'l."isDeleted" = FALSE'];

  if (q.keyword) {
    const kw = add(`%${q.keyword}%`);
    where.push(`(l."name" ILIKE ${kw} OR l."phone" ILIKE ${kw})`);
  }

  const whereSql = where.join(' AND ');

  const countRow = await queryOne<{ total: number }>(
    `SELECT COUNT(*)::int AS total FROM "Lead" l WHERE ${whereSql}`,
    params,
  );
  const total = countRow?.total ?? 0;

  const sortCol = q.sortBy === 'updatedAt' ? 'l."updatedAt"' : 'l."createdAt"';
  const sortDir = q.sortOrder === 'asc' ? 'ASC' : 'DESC';

  const rows = await query<{
    id: string;
    code: string;
    name: string;
    phone: string;
    channelName: string | null;
    courseName: string | null;
    followCount: number;
    lastFollowAt: string | null;
    createdAt: string;
    updatedAt: string;
    previousOwners: number;
  }>(
    `SELECT l."id", l."code", l."name", l."phone",
            ch."name" AS "channelName", c."name" AS "courseName",
            l."followCount", l."lastFollowAt", l."createdAt", l."updatedAt",
            (SELECT COUNT(*) FROM "OwnershipHistory" oh
              WHERE oh."bizType" = 'LEAD' AND oh."bizId" = l."id")::int AS "previousOwners"
       FROM "Lead" l
       LEFT JOIN "Channel" ch ON ch."id" = l."sourceChannelId"
       LEFT JOIN "Course" c ON c."id" = l."intentCourseId"
      WHERE ${whereSql}
      ORDER BY ${sortCol} ${sortDir} NULLS LAST, l."id" ASC
      LIMIT ${add(pageSize)} OFFSET ${add(offset)}`,
    params,
  );

  return { rows, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

export async function countPool(user: SessionUser) {
  return queryOne<{ total: number; waiting7: number; waiting30: number; neverFollowed: number }>(
    `SELECT
       COUNT(*)::int AS "total",
       COUNT(*) FILTER (WHERE "createdAt" < NOW() - interval '7 days')::int AS "waiting7",
       COUNT(*) FILTER (WHERE "createdAt" < NOW() - interval '30 days')::int AS "waiting30",
       COUNT(*) FILTER (WHERE "followCount" = 0)::int AS "neverFollowed"
     FROM "Lead"
     WHERE "status" = 'TO_POOL' AND "ownerId" IS NULL AND "isDeleted" = FALSE`,
    [],
  );
}