import 'server-only';
import { query, transaction, newId } from '@/server/db';
import { BusinessError } from '@/lib/auth/guard';
import { writeLog } from '@/server/log';
import type { SessionPayload } from '@/lib/auth/session';

/**
 * 公海池领域服务
 *
 * 关键设计：领取与释放是**通用能力**，线索与商机共用（BR-H03）。
 *
 * 并发领取的实现原理：
 * 用「条件更新 + RETURNING」代替「先查后改」——
 *   UPDATE ... SET owner_id = $1
 *    WHERE id = $2 AND owner_id IS NULL AND status = 'TO_POOL'
 *   RETURNING id
 *
 * 数据库保证这条语句的原子性：多个并发请求中只有一个能让
 * `owner_id IS NULL` 成立，其余的影响行数为 0，业务层据此返回 409。
 * 这样就不需要行锁（PGlite 也不支持行锁），效果完全等价。
 */

/** 并发领取：线索与商机走同一套逻辑 */
export async function claimPoolItem(params: {
  bizType: 'LEAD' | 'OPPORTUNITY';
  ids: string[];
  user: SessionPayload;
}): Promise<{ success: string[]; failed: { id: string; reason: string }[] }> {
  const { bizType, ids, user } = params;
  const success: string[] = [];
  const failed: { id: string; reason: string }[] = [];

  await transaction(async () => {
    for (const id of ids) {
      if (bizType === 'LEAD') {
        const rows = await query<{ id: string }>(
          `UPDATE "Lead"
              SET "ownerId" = $1, "deptId" = $2, "status" = 'FOLLOWING',
                  "claimedAt" = NOW(), "version" = "version" + 1, "updatedAt" = NOW()
            WHERE "id" = $3
              AND "ownerId" IS NULL
              AND "status" = 'TO_POOL'
              AND "isDeleted" = FALSE
            RETURNING "id"`,
          [user.userId, user.deptId, id],
        );
        if (rows.length > 0) success.push(id);
        else failed.push({ id, reason: '数据已被他人领取' });
      } else {
        const rows = await query<{ id: string }>(
          `UPDATE "Opportunity"
              SET "ownerId" = $1, "deptId" = $2, "claimedAt" = NOW(),
                  "version" = "version" + 1, "updatedAt" = NOW()
            WHERE "id" = $3
              AND "ownerId" IS NULL
              AND "stage" IN ('FOLLOWING','NEGOTIATING')
              AND "isDeleted" = FALSE
            RETURNING "id"`,
          [user.userId, user.deptId, id],
        );
        if (rows.length > 0) success.push(id);
        else failed.push({ id, reason: '数据已被他人领取' });
      }
    }

    // 归属轨迹与状态日志（BR-H05 保留完整归属轨迹）
    for (const id of success) {
      await query(
        `INSERT INTO "OwnershipHistory" ("id","bizType","bizId","toOwnerId","action","changedById")
         VALUES ($1,$2,$3,$4,'CLAIM',$5)`,
        [newId('own-'), bizType, id, user.userId, user.userId],
      );
      await query(
        `INSERT INTO "StatusChangeLog" ("id","bizType","bizId","fromStatus","toStatus","action","changedById")
         VALUES ($1,$2,$3,'TO_POOL','FOLLOWING','POOL_CLAIM',$4)`,
        [newId('scl-'), bizType, id, user.userId],
      );
    }
  });

  await writeLog({
    operatorId: user.userId,
    operatorDeptId: user.deptId,
    operatorName: user.name,
    action: 'POOL_CLAIM',
    targetType: bizType,
    summary: `从公海池领取 ${success.length} 条，失败 ${failed.length} 条`,
  });

  return { success, failed };
}

/**
 * 踢回公海
 * BR-H01：踢回后归属人清空，状态变为公海
 * 商机阶段回退至「跟进中」，但 stageEnteredAt 不变，停留天数继续累计
 */
export async function returnToPool(params: {
  bizType: 'LEAD' | 'OPPORTUNITY';
  bizId: string;
  reason: string;
  remark?: string;
  user: SessionPayload;
}): Promise<void> {
  const { bizType, bizId, reason, remark, user } = params;
  const remarkText = `${reason}${remark ? ` / ${remark}` : ''}`;

  await transaction(async () => {
    if (bizType === 'LEAD') {
      const rows = await query<{ id: string }>(
        `UPDATE "Lead"
            SET "ownerId" = NULL, "deptId" = NULL, "status" = 'TO_POOL',
                "nextFollowAt" = NULL, "version" = "version" + 1, "updatedAt" = NOW()
          WHERE "id" = $1 AND "isDeleted" = FALSE AND "status" NOT IN ('PSEUDO','CONVERTED')
          RETURNING "id"`,
        [bizId],
      );
      if (rows.length === 0) throw new BusinessError(400, '该线索状态不允许踢回公海');

      await query(
        `INSERT INTO "StatusChangeLog" ("id","bizType","bizId","fromStatus","toStatus","action","remark","changedById")
         SELECT $1,'LEAD',$2,"status",'TO_POOL','POOL_RETURN',$3,$4
           FROM "Lead" WHERE "id" = $2`,
        [newId('scl-'), bizId, remarkText, user.userId],
      );
    } else {
      // 商机：赢单/输单是终态，不可踢回
      const rows = await query<{ id: string }>(
        `UPDATE "Opportunity"
            SET "ownerId" = NULL, "deptId" = NULL, "stage" = 'FOLLOWING',
                "version" = "version" + 1, "updatedAt" = NOW()
          WHERE "id" = $1 AND "isDeleted" = FALSE AND "stage" IN ('FOLLOWING','NEGOTIATING')
          RETURNING "id"`,
        [bizId],
      );
      if (rows.length === 0) throw new BusinessError(400, '已赢单或已输单的商机不能踢回公海');

      await query(
        `INSERT INTO "StatusChangeLog" ("id","bizType","bizId","fromStatus","toStatus","action","remark","changedById")
         SELECT $1,'OPPORTUNITY',$2,"stage",'FOLLOWING','POOL_RETURN',$3,$4
           FROM "Opportunity" WHERE "id" = $2`,
        [newId('scl-'), bizId, remarkText, user.userId],
      );
    }

    await query(
      `INSERT INTO "OwnershipHistory" ("id","bizType","bizId","action","reason","remark","changedById")
       VALUES ($1,$2,$3,'RETURN_POOL',$4,$5,$6)`,
      [newId('own-'), bizType, bizId, reason, remark ?? null, user.userId],
    );
  });

  await writeLog({
    operatorId: user.userId,
    operatorDeptId: user.deptId,
    operatorName: user.name,
    action: 'POOL_RETURN',
    targetType: bizType,
    targetId: bizId,
    summary: `踢回公海：${reason}`,
  });
}

/**
 * 公海自动回收（BR-H04）
 * 被领取后若 N 天未跟进，自动回收至公海。定时任务每日执行。
 */
export async function autoRecyclePool(recycleDays = 15): Promise<number> {
  const threshold = new Date(Date.now() - recycleDays * 86400000);

  const expired = await query<{ id: string; ownerId: string | null; status: string }>(
    `SELECT "id","ownerId","status" FROM "Lead"
      WHERE "status" = 'FOLLOWING'
        AND "ownerId" IS NOT NULL
        AND "claimedAt" <= $1
        AND ("lastFollowAt" IS NULL OR "lastFollowAt" < $1)
        AND "isDeleted" = FALSE`,
    [threshold],
  );

  if (expired.length === 0) return 0;

  await transaction(async () => {
    for (const lead of expired) {
      await query(
        `UPDATE "Lead"
            SET "ownerId" = NULL, "deptId" = NULL, "status" = 'TO_POOL',
                "nextFollowAt" = NULL, "version" = "version" + 1, "updatedAt" = NOW()
          WHERE "id" = $1`,
        [lead.id],
      );
      await query(
        `INSERT INTO "OwnershipHistory" ("id","bizType","bizId","fromOwnerId","action","reason","changedById")
         VALUES ($1,'LEAD',$2,$3,'AUTO_RECYCLE',$4,$5)`,
        [
          newId('own-'), lead.id, lead.ownerId,
          `领取后 ${recycleDays} 天未跟进，自动回收`, lead.ownerId ?? '',
        ],
      );
      await query(
        `INSERT INTO "StatusChangeLog" ("id","bizType","bizId","fromStatus","toStatus","action","remark","changedById")
         VALUES ($1,'LEAD',$2,$3,'TO_POOL','POOL_RETURN',$4,$5)`,
        [
          newId('scl-'), lead.id, lead.status,
          `自动回收：${recycleDays} 天未跟进`, lead.ownerId ?? '',
        ],
      );
    }
  });

  return expired.length;
}