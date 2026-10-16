import 'server-only';
import { query, queryOne, transaction, nextSeq, makeCode, newId } from '@/server/db';
import { BusinessError } from '@/lib/auth/guard';
import { writeLog } from '@/server/log';
import type { SessionPayload } from '@/lib/auth/session';
import type { ConvertLeadInput } from '@/lib/validators';

/**
 * 转商机 —— 整个项目最核心的原子操作（BR-C01）
 *
 * 要求：
 *  · 线索与商机同时创建，任一失败整体回滚
 *  · 成功后线索转终态，跟进记录在此处分界（BR-C02）
 *  · 保留双向关联，详情页可互相跳转（BR-C03）
 *  · 同一线索只能转化一次，不允许重复转化（BR-C04）
 *  · 记录转化耗时用于看板转化周期分析（BR-C05）
 *
 * 并发防护说明：
 * 标准 PostgreSQL 可以用 SELECT ... FOR UPDATE 行锁，
 * 但 PGlite 不支持行锁，因此这里改用**条件更新**保证原子性：
 *   UPDATE ... WHERE status = 'FOLLOWING' AND convertedOppId IS NULL
 * 影响行数为 0 说明已被他人处理，直接抛错。
 * 条件本身就是乐观锁，效果与行锁等价。
 */

interface LeadRow {
  id: string;
  status: string;
  owner_id: string | null;
  dept_id: string | null;
  intent_course_id: string | null;
  source_channel_id: string | null;
  created_at: string;
  converted_opp_id: string | null;
}

export async function convertLeadToOpportunity(
  input: ConvertLeadInput,
  user: SessionPayload,
): Promise<{ id: string; code: string }> {
  return transaction(async () => {
    const lead = await queryOne<LeadRow>(
      `SELECT "id","status","ownerId" AS owner_id,"deptId" AS dept_id,
              "intentCourseId" AS intent_course_id,
              "sourceChannelId" AS source_channel_id,
              "createdAt" AS created_at,
              "convertedOppId" AS converted_opp_id
         FROM "Lead"
        WHERE "id" = $1 AND "isDeleted" = FALSE`,
      [input.leadId],
    );

    if (!lead) throw new BusinessError(404, '线索不存在或已删除');
    if (lead.converted_opp_id) {
      throw new BusinessError(400, '该线索已转为商机，不可重复转化');
    }
    if (lead.status !== 'FOLLOWING') {
      throw new BusinessError(400, '仅「待跟进」状态的线索可转为商机');
    }

    // 归属人：顾问不可改（PRD 2.2）
    const ownerId = user.role !== 'SALES' && input.ownerId ? input.ownerId : lead.owner_id;
    if (!ownerId) throw new BusinessError(400, '请先为线索指定归属人再转商机');

    const now = new Date();
    const conversionDays = Math.floor((now.getTime() - new Date(lead.created_at).getTime()) / 86400000);

    const seq = await nextSeq('Opportunity', 'OP');
    const oppId = newId('o-');
    const oppCode = makeCode('OP', seq, now);

    // 1. 创建商机
    await query(
      `INSERT INTO "Opportunity"
       ("id","code","name","customerName","phone","courseId","amount","expectedCloseDate",
        "stage","stageEnteredAt","ownerId","deptId","sourceChannelId","sourceLeadId","description","createdAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
      [
        oppId, oppCode, input.name, input.customerName, input.phone, input.courseId,
        input.amount, input.expectedCloseDate, input.stage, now,
        ownerId, lead.dept_id, input.sourceChannelId ?? lead.source_channel_id,
        lead.id, input.description ?? null, now,
      ],
    );

    // 2. 线索转终态（条件更新即乐观锁）
    const updated = await query<{ id: string }>(
      `UPDATE "Lead"
          SET "status" = 'CONVERTED',
              "convertedAt" = $1,
              "convertedOppId" = $2,
              "conversionDays" = $3,
              "nextFollowAt" = NULL,
              "version" = "version" + 1
        WHERE "id" = $4
          AND "status" = 'FOLLOWING'
          AND "convertedOppId" IS NULL
        RETURNING "id"`,
      [now, oppId, conversionDays, lead.id],
    );

    if (updated.length === 0) {
      throw new BusinessError(409, '该线索状态已变更，请刷新后重试');
    }

    // 3. 状态变更日志（看板统计的唯一依据）
    await query(
      `INSERT INTO "StatusChangeLog" ("id","bizType","bizId","fromStatus","toStatus","action","remark","changedById","changedAt")
       VALUES ($1,'LEAD',$2,'FOLLOWING','CONVERTED','CONVERT_LEAD',$3,$4,$5)`,
      [newId('scl-'), lead.id, `转化为商机 ${oppCode}，耗时 ${conversionDays} 天`, user.userId, now],
    );
    await query(
      `INSERT INTO "StatusChangeLog" ("id","bizType","bizId","toStatus","action","changedById","changedAt")
       VALUES ($1,'OPPORTUNITY',$2,'FOLLOWING','CREATE',$3,$4)`,
      [newId('scl-'), oppId, user.userId, now],
    );

    await writeLog({
      operatorId: user.userId,
      operatorDeptId: user.deptId,
      operatorName: user.name,
      action: 'CONVERT_LEAD',
      targetType: 'LEAD',
      targetId: lead.id,
      summary: `线索转为商机 ${oppCode}，金额 ${input.amount} 元，耗时 ${conversionDays} 天`,
      after: { oppCode, amount: input.amount, conversionDays },
    });

    return { id: oppId, code: oppCode };
  });
}

/** 转客户（BR-T01 / BR-T03） */
export async function convertOpportunityToCustomer(
  params: { oppId: string; mergeIntoCustomerId?: string },
  user: SessionPayload,
): Promise<{ id: string; code: string; merged: boolean }> {
  return transaction(async () => {
    const opp = await queryOne<{
      id: string; code: string; stage: string; customerName: string; phone: string;
      ownerId: string | null; deptId: string | null; courseId: string | null;
      sourceChannelId: string | null; wonAmount: number | null; wonDate: string | null;
      amount: number; isDeleted: boolean;
    }>(
      `SELECT "id","code","stage","customerName","phone","ownerId","deptId","courseId",
              "sourceChannelId","wonAmount","wonDate","amount","isDeleted"
         FROM "Opportunity" WHERE "id" = $1`,
      [params.oppId],
    );

    if (!opp || opp.isDeleted) throw new BusinessError(404, '商机不存在');
    if (opp.stage !== 'WON') throw new BusinessError(400, '需先将商机标记为「已赢单」');

    // 已有客户：可选择合并（PRD 4.3.5）
    if (params.mergeIntoCustomerId) {
      await query(
        `UPDATE "Customer"
            SET "amount" = "amount" + $1,
                "sourceOppId" = $2,
                "serviceStartDate" = COALESCE("serviceStartDate", $3)
          WHERE "id" = $4`,
        [opp.wonAmount ?? opp.amount, opp.id, opp.wonDate ?? new Date(), params.mergeIntoCustomerId],
      );
      return { id: params.mergeIntoCustomerId, code: '', merged: true };
    }

    // 查重：手机号 + 姓名
    const exist = await queryOne<{ id: string; code: string }>(
      `SELECT "id","code" FROM "Customer"
        WHERE "phone" = $1 AND "name" = $2 AND "isDeleted" = FALSE LIMIT 1`,
      [opp.phone, opp.customerName],
    );
    if (exist) {
      throw new BusinessError(409, `客户已存在（${exist.code}），可选择合并到已有客户`);
    }

    const dealDate = opp.wonDate ?? new Date();
    const seq = await nextSeq('Customer', 'CU');
    const custId = newId('cu-');
    const custCode = makeCode('CU', seq, new Date(dealDate));
    const amount = opp.wonAmount ?? opp.amount;

    // 继承 11 个字段（PRD 4.3.5）
    await query(
      `INSERT INTO "Customer"
       ("id","code","name","phone","courseId","amount","dealDate","status",
        "ownerId","deptId","sourceChannelId","sourceOppId","serviceStartDate")
       VALUES ($1,$2,$3,$4,$5,$6,$7,'ACTIVE',$8,$9,$10,$11,$12)`,
      [
        custId, custCode, opp.customerName, opp.phone, opp.courseId, amount,
        dealDate, opp.ownerId, opp.deptId, opp.sourceChannelId, opp.id, dealDate,
      ],
    );

    // BR-T04：转客户触发渠道成本归集，供 ROI 核算
    await query(
      `INSERT INTO "StatusChangeLog" ("id","bizType","bizId","toStatus","action","remark","changedById","changedAt")
       VALUES ($1,'CUSTOMER',$2,'ACTIVE','CONVERT_CUSTOMER',$3,$4,$5)`,
      [newId('scl-'), custId, `由商机 ${opp.code} 转化`, user.userId, new Date()],
    );

    await writeLog({
      operatorId: user.userId,
      operatorDeptId: user.deptId,
      operatorName: user.name,
      action: 'CONVERT_CUSTOMER',
      targetType: 'OPPORTUNITY',
      targetId: opp.id,
      summary: `商机 ${opp.code} 转为客户 ${custCode}，成交金额 ${amount} 元`,
      after: { customerCode: custCode, amount, channelId: opp.sourceChannelId },
    });

    return { id: custId, code: custCode, merged: false };
  });
}