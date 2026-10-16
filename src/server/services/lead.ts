import 'server-only';
import { query, queryOne, transaction, nextSeq, makeCode, newId } from '@/server/db';
import { BusinessError } from '@/lib/auth/guard';
import { writeLog, diffOf } from '@/server/log';
import type { SessionPayload } from '@/lib/auth/session';
import type { CreateLeadInput, CreateFollowUpInput } from '@/lib/validators';

/**
 * 线索领域服务
 */

/**
 * 新建线索（PRD 4.2.2）
 * BR-L01：手机号为去重唯一键，重复录入时不得创建新线索
 * BR-L02：顾问新建线索归属人强制为本人
 * BR-L04：有归属人则状态为「待跟进」，否则「待分配」
 */
export async function createLead(input: CreateLeadInput, user: SessionPayload) {
  // 查重：仅当存在有效线索（同手机号且状态非伪线索/已转商机）时拦截
  const exist = await queryOne<{
    id: string; code: string; name: string; status: string; ownerName: string | null;
  }>(
    `SELECT l."id", l."code", l."name", l."status", u."name" AS "ownerName"
       FROM "Lead" l
       LEFT JOIN "User" u ON u."id" = l."ownerId"
      WHERE l."phone" = $1
        AND l."status" NOT IN ('PSEUDO','CONVERTED')
        AND l."isDeleted" = FALSE
      LIMIT 1`,
    [input.phone],
  );

  if (exist) {
    const ownerName = exist.ownerName ?? '公海（无归属人）';
    throw new BusinessError(
      409,
      `手机号已存在线索【${exist.code} ${exist.name}】，当前归属人：${ownerName}`,
    );
  }

  // BR-L02：顾问归属人强制为本人，无权选择他人
  const ownerId = user.role === 'SALES' ? user.userId : (input.ownerId ?? null);
  const deptId = ownerId ? user.deptId : null;
  // BR-L04
  const status = ownerId ? 'FOLLOWING' : 'PENDING';

  const now = new Date();
  const seq = await nextSeq('Lead', 'LD');
  const code = makeCode('LD', seq, now);
  const leadId = newId('l-');

  await transaction(async () => {
    await query(
      `INSERT INTO "Lead"
       ("id","code","name","phone","gender","sourceChannelId","intentCourseId","status",
        "ownerId","deptId","remark","createdAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        leadId, code, input.name, input.phone, input.gender ?? null,
        input.sourceChannelId, input.intentCourseId, status,
        ownerId, deptId, input.remark ?? null, now,
      ],
    );

    // 状态日志：看板统计依据，漏写会导致漏斗数字错误
    await query(
      `INSERT INTO "StatusChangeLog" ("id","bizType","bizId","toStatus","action","changedById","changedAt")
       VALUES ($1,'LEAD',$2,'PENDING','CREATE',$3,$4)`,
      [newId('scl-'), leadId, user.userId, now],
    );
    if (status === 'FOLLOWING') {
      await query(
        `INSERT INTO "StatusChangeLog" ("id","bizType","bizId","fromStatus","toStatus","action","changedById","changedAt")
         VALUES ($1,'LEAD',$2,'PENDING','FOLLOWING','ASSIGN',$3,$4)`,
        [newId('scl-'), leadId, user.userId, now],
      );
    }
    if (ownerId) {
      await query(
        `INSERT INTO "OwnershipHistory" ("id","bizType","bizId","toOwnerId","action","changedById","changedAt")
         VALUES ($1,'LEAD',$2,$3,'ASSIGN',$4,$5)`,
        [newId('own-'), leadId, ownerId, user.userId, now],
      );
    }
  });

  await writeLog({
    operatorId: user.userId,
    operatorDeptId: user.deptId,
    operatorName: user.name,
    action: 'CREATE',
    targetType: 'LEAD',
    targetId: leadId,
    summary: `新建线索 ${code} ${input.name}`,
  });

  return { id: leadId, code };
}

/**
 * 追加跟进记录（PRD 4.2.4）
 * · 更新最后跟进时间与跟进次数
 * · 设置了下次跟进时间则生成待办
 * · 记录不可编辑、不可删除，只能追加
 */
export async function appendFollowUp(input: CreateFollowUpInput, user: SessionPayload) {
  const now = new Date();
  const nextAt = input.nextFollowAt ? new Date(input.nextFollowAt) : null;
  const followUpId = newId('fu-');

  await transaction(async () => {
    await query(
      `INSERT INTO "FollowUp"
       ("id","bizType","bizId","method","result","content","nextPlan","nextFollowAt","createdById","createdAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        followUpId, input.bizType, input.bizId, input.method,
        input.result ?? null, input.content, input.nextPlan ?? null,
        nextAt, user.userId, now,
      ],
    );

    if (input.bizType === 'LEAD') {
      await query(
        `UPDATE "Lead"
            SET "followCount" = "followCount" + 1,
                "lastFollowAt" = $1, "nextFollowAt" = $2,
                "version" = "version" + 1, "updatedAt" = NOW()
          WHERE "id" = $3`,
        [now, nextAt, input.bizId],
      );
    } else if (input.bizType === 'OPPORTUNITY') {
      await query(
        `UPDATE "Opportunity"
            SET "nextFollowAt" = $1, "version" = "version" + 1, "updatedAt" = NOW()
          WHERE "id" = $2`,
        [nextAt, input.bizId],
      );
    } else {
      await query(`UPDATE "Customer" SET "version" = "version" + 1 WHERE "id" = $1`, [input.bizId]);
    }

    if (nextAt && input.bizType !== 'CUSTOMER') {
      await query(
        `INSERT INTO "Todo" ("id","bizType","bizId","type","dueAt","ownerId")
         VALUES ($1,$2,$3,'FOLLOW_UP',$4,$5)`,
        [newId('todo-'), input.bizType, input.bizId, nextAt, user.userId],
      );
    }
  });

  // 跟进记录仅概要记入操作日志，不含全文（PRD 4.6.4）
  await writeLog({
    operatorId: user.userId,
    operatorDeptId: user.deptId,
    operatorName: user.name,
    action: 'FOLLOW_UP',
    targetType: input.bizType,
    targetId: input.bizId,
    summary: `追加跟进记录（${input.method}）`,
  });

  return { id: followUpId };
}

/**
 * 标记伪线索（PRD 4.2.5）
 * BR-P01：终态不可恢复，不计入转化率
 * BR-P03：保留历史跟进记录，不物理删除
 */
export async function markPseudo(
  params: { leadId: string; reason: string; remark?: string },
  user: SessionPayload,
) {
  const lead = await queryOne<{ id: string; code: string; status: string; followCount: number }>(
    `SELECT "id","code","status","followCount" FROM "Lead"
      WHERE "id" = $1 AND "isDeleted" = FALSE`,
    [params.leadId],
  );
  if (!lead) throw new BusinessError(404, '线索不存在');
  // BR-P01：伪线索是终态，已转商机的线索不能标记
  if (lead.status === 'CONVERTED' || lead.status === 'PSEUDO') {
    throw new BusinessError(400, '该线索已是终态，不可标记为伪线索');
  }

  await transaction(async () => {
    // 条件更新即乐观锁，防止并发重复标记
    const rows = await query<{ id: string }>(
      `UPDATE "Lead"
          SET "status" = 'PSEUDO', "nextFollowAt" = NULL,
              "version" = "version" + 1, "updatedAt" = NOW()
        WHERE "id" = $1 AND "status" NOT IN ('PSEUDO','CONVERTED')
        RETURNING "id"`,
      [params.leadId],
    );
    if (rows.length === 0) throw new BusinessError(409, '该线索状态已变更，请刷新后重试');

    // BR-P03：跟进记录全部保留，仅追加状态日志
    await query(
      `INSERT INTO "StatusChangeLog" ("id","bizType","bizId","fromStatus","toStatus","action","remark","changedById")
       VALUES ($1,'LEAD',$2,$3,'PSEUDO','PSEUDO_MARK',$4,$5)`,
      [
        newId('scl-'), params.leadId, lead.status,
        `${params.reason}${params.remark ? ` / ${params.remark}` : ''}`, user.userId,
      ],
    );
  });

  await writeLog({
    operatorId: user.userId,
    operatorDeptId: user.deptId,
    operatorName: user.name,
    action: 'PSEUDO_MARK',
    targetType: 'LEAD',
    targetId: params.leadId,
    summary: `标记伪线索 ${lead.code}，原因：${params.reason}（保留 ${lead.followCount} 条跟进记录）`,
    after: { status: 'PSEUDO', reason: params.reason },
  });
}

/**
 * 分配线索（PRD 4.2.3）
 * 三种策略：MANUAL 指定 / BALANCED 按负载均衡 / BY_DEPT 部门均分
 */
export async function assignLeads(
  params: {
    ids: string[];
    strategy: 'MANUAL' | 'BALANCED' | 'BY_DEPT';
    ownerId?: string;
  },
  user: SessionPayload,
) {
  const { ids, strategy } = params;
  const success: string[] = [];
  const failed: { id: string; reason: string }[] = [];

  // 顾问无权分配（PRD 2.2）
  if (user.role === 'SALES') throw new BusinessError(403, '无操作权限');

  let targets: string[] = [];
  if (strategy === 'MANUAL') {
    if (!params.ownerId) throw new BusinessError(400, '请选择归属人');
    targets = [params.ownerId];
  } else {
    targets = await pickBalancedTargets(
      strategy === 'BY_DEPT' && params.ownerId ? params.ownerId : null,
      ids.length,
    );
    if (targets.length === 0) throw new BusinessError(400, '没有可分配的顾问');
  }

  const ownerOf: Record<string, string> = {};

  await transaction(async () => {
    let ti = 0;
    for (const id of ids) {
      const targetId = targets[ti % targets.length]!;
      ti += 1;

      // 条件更新即原子性：终态线索影响行数为 0
      const rows = await query<{ id: string }>(
        `UPDATE "Lead"
            SET "ownerId" = $1, "status" = 'FOLLOWING',
                "version" = "version" + 1, "updatedAt" = NOW()
          WHERE "id" = $2 AND "isDeleted" = FALSE
            AND "status" NOT IN ('PSEUDO','CONVERTED')
          RETURNING "id"`,
        [targetId, id],
      );

      if (rows.length > 0) {
        success.push(id);
        ownerOf[id] = targetId;
      } else {
        failed.push({ id, reason: '该线索已是终态或不存在' });
      }
    }

    for (const id of success) {
      await query(
        `INSERT INTO "OwnershipHistory" ("id","bizType","bizId","toOwnerId","action","changedById")
         VALUES ($1,'LEAD',$2,$3,'ASSIGN',$4)`,
        [newId('own-'), id, ownerOf[id], user.userId],
      );
      await query(
        `INSERT INTO "StatusChangeLog" ("id","bizType","bizId","fromStatus","toStatus","action","changedById")
         VALUES ($1,'LEAD',$2,'PENDING','FOLLOWING','ASSIGN',$3)`,
        [newId('scl-'), id, user.userId],
      );
    }
  });

  await writeLog({
    operatorId: user.userId,
    operatorDeptId: user.deptId,
    operatorName: user.name,
    action: 'ASSIGN',
    targetType: 'LEAD',
    summary: `分配 ${success.length} 条线索（策略：${strategy}），失败 ${failed.length} 条`,
  });

  return { success, failed };
}

/**
 * 均衡分配：按当前在跟线索数升序取人，负载越低越优先。
 * 近似算法，不追求绝对最优，保证分布均匀即可。
 */
async function pickBalancedTargets(deptId: string | null, count: number): Promise<string[]> {
  const users = await query<{ id: string; load: number }>(
    `SELECT u."id",
            (SELECT COUNT(*) FROM "Lead" l
              WHERE l."ownerId" = u."id" AND l."status" = 'FOLLOWING' AND l."isDeleted" = FALSE) AS load
       FROM "User" u
      WHERE u."role" = 'SALES'
        AND u."status" = 'ACTIVE'
        AND ($1::text IS NULL OR u."deptId" = $1)
      ORDER BY load ASC`,
    [deptId],
  );

  if (users.length === 0) return [];
  return users.slice(0, Math.min(count, users.length)).map((u) => u.id);
}

/** 编辑线索（PRD 4.2.1） */
export async function updateLead(
  params: { leadId: string; data: Partial<CreateLeadInput> },
  user: SessionPayload,
) {
  const before = await queryOne<Record<string, unknown>>(
    `SELECT "name","phone","gender","sourceChannelId","intentCourseId","remark","ownerId"
       FROM "Lead" WHERE "id" = $1 AND "isDeleted" = FALSE`,
    [params.leadId],
  );
  if (!before) throw new BusinessError(404, '线索不存在');

  // 顾问只能编辑本人数据
  if (user.role === 'SALES' && before.ownerId !== user.userId) {
    throw new BusinessError(403, '数据不属于您或您的部门');
  }

  await query(
    `UPDATE "Lead"
        SET "name" = COALESCE($1, "name"),
            "phone" = COALESCE($2, "phone"),
            "gender" = COALESCE($3, "gender"),
            "sourceChannelId" = COALESCE($4, "sourceChannelId"),
            "intentCourseId" = COALESCE($5, "intentCourseId"),
            "remark" = COALESCE($6, "remark"),
            "version" = "version" + 1, "updatedAt" = NOW()
      WHERE "id" = $7`,
    [
      params.data.name ?? null,
      params.data.phone ?? null,
      params.data.gender ?? null,
      params.data.sourceChannelId ?? null,
      params.data.intentCourseId ?? null,
      params.data.remark ?? null,
      params.leadId,
    ],
  );

  const { before: b, after: a } = diffOf(before, { ...before, ...params.data });
  await writeLog({
    operatorId: user.userId,
    operatorDeptId: user.deptId,
    operatorName: user.name,
    action: 'UPDATE',
    targetType: 'LEAD',
    targetId: params.leadId,
    summary: '编辑线索',
    before: b,
    after: a,
  });
}