import 'server-only';
import { query, queryOne, transaction, newId } from '@/server/db';
import { BusinessError } from '@/lib/auth/guard';
import { writeLog } from '@/server/log';
import type { SessionPayload } from '@/lib/auth/session';

/**
 * 商机阶段流转
 *
 * PRD 3.2 状态机：
 *   跟进中 → 谈判中 / 已赢单 / 已输单
 *   谈判中 → 已赢单 / 已输单
 *   已赢单 / 已输单 为终态，不可再流转
 *
 * BR-O01：阶段推进记录进入当前时间，作为超期判定基准
 * BR-O02：输单必须填原因，且为必填项
 * BR-O04：赢单后自动关联客户档案（由 convertOpportunityToCustomer 完成）
 *
 * 并发防护：与项目其他原子操作一致，用条件更新代替行锁。
 * 拖拽看板时可能有多个操作同时打到同一条商机，
 * 条件更新保证「同一条商机不会被推进两次到不同阶段」。
 */

/** 合法跃迁表 */
const STAGE_TRANSITIONS: Record<string, string[]> = {
  FOLLOWING: ['NEGOTIATING', 'WON', 'LOST'],
  NEGOTIATING: ['WON', 'LOST'],
  WON: [],
  LOST: [],
};

const STAGE_NAMES: Record<string, string> = {
  FOLLOWING: '跟进中',
  NEGOTIATING: '谈判中',
  WON: '已赢单',
  LOST: '已输单',
};

export async function changeOppStage(
  params: {
    oppId: string;
    toStage: string;
    lostReason?: string;
    remark?: string;
  },
  user: SessionPayload,
) {
  const opp = await queryOne<{
    id: string;
    code: string;
    name: string;
    stage: string;
    amount: number;
    ownerId: string | null;
    version: number;
  }>(
    `SELECT "id","code","name","stage","amount","ownerId","version"
       FROM "Opportunity" WHERE "id" = $1 AND "isDeleted" = FALSE`,
    [params.oppId],
  );

  if (!opp) throw new BusinessError(404, '商机不存在');

  // 顾问只能推进自己的商机；无归属人的商机属于公海，任何人可推进
  if (user.role === 'SALES' && opp.ownerId !== user.userId) {
    throw new BusinessError(403, '只能推进本人负责的商机');
  }

  // BR-O02：输单必须填原因
  if (params.toStage === 'LOST' && !params.lostReason) {
    throw new BusinessError(400, '请填写输单原因');
  }

  // 终态不可再流转
  if (opp.stage === params.toStage) {
    throw new BusinessError(400, `该商机已处于「${STAGE_NAMES[opp.stage]}」阶段`);
  }

  const allowed = STAGE_TRANSITIONS[opp.stage] ?? [];
  if (!allowed.includes(params.toStage)) {
    throw new BusinessError(
      400,
      `不允许从「${STAGE_NAMES[opp.stage]}」流转到「${STAGE_NAMES[params.toStage]}」`,
    );
  }

  const now = new Date();

  await transaction(async () => {
    // 条件更新即乐观锁：状态已被他人改动时影响行数为 0
    const sets: string[] = [
      '"stage" = $1',
      '"stageEnteredAt" = $2', // BR-O01 超期判定的重新起算点
      '"version" = "version" + 1',
      '"updatedAt" = NOW()',
    ];
    const values: unknown[] = [params.toStage, now];
    let i = 3;

    if (params.toStage === 'WON') {
      sets.push(`"wonAt" = $${i}`, `"wonAmount" = $${i + 1}`, `"wonDate" = $${i + 2}`);
      values.push(now, opp.amount, now);
      i += 3;
    }

    const rows = await query<{ id: string }>(
      `UPDATE "Opportunity" SET ${sets.join(', ')}
        WHERE "id" = $${i} AND "stage" = $${i + 1} AND "version" = $${i + 2}
        RETURNING "id"`,
      [...values, params.oppId, opp.stage, opp.version],
    );

    if (rows.length === 0) {
      throw new BusinessError(409, '该商机已被他人操作，请刷新后重试');
    }

    // 状态流转日志
    await query(
      `INSERT INTO "StatusChangeLog"
       ("id","bizType","bizId","fromStatus","toStatus","action","remark","changedById","changedAt")
       VALUES ($1,'OPPORTUNITY',$2,$3,$4,$5,$6,$7,$8)`,
      [
        newId('scl-'),
        params.oppId,
        opp.stage,
        params.toStage,
        params.toStage === 'LOST' ? 'OPP_LOST' : params.toStage === 'WON' ? 'OPP_WON' : 'OPP_STAGE',
        params.lostReason ?? params.remark ?? null,
        user.userId,
        now,
      ],
    );

    // 赢单后自动建档客户档案（BR-O04）
    if (params.toStage === 'WON') {
      const existing = await queryOne<{ id: string }>(
        `SELECT "id" FROM "Customer" WHERE "sourceOppId" = $1 AND "isDeleted" = FALSE LIMIT 1`,
        [params.oppId],
      );
      // 已有客户档案则不重复创建，交由 convertOpportunityToCustomer 处理
      if (!existing) {
        // 仅写待建档标记，由后续流程或用户手动触发建档
        await query(
          `INSERT INTO "Todo" ("id","bizType","bizId","type","title","dueAt","ownerId")
           VALUES ($1,'OPPORTUNITY',$2,'CONVERT_CUSTOMER','商机赢单，待建档客户',$3,$4)`,
          [newId('todo-'), params.oppId, now, opp.ownerId ?? user.userId],
        );
      }
    }
  });

  await writeLog({
    operatorId: user.userId,
    operatorDeptId: user.deptId,
    operatorName: user.name,
    action: params.toStage === 'LOST' ? 'OPP_LOST' : params.toStage === 'WON' ? 'OPP_WON' : 'OPP_STAGE',
    targetType: 'OPPORTUNITY',
    targetId: params.oppId,
    summary: `商机 ${opp.code} 阶段推进：${STAGE_NAMES[opp.stage]} → ${STAGE_NAMES[params.toStage]}`,
    before: { stage: opp.stage },
    after: { stage: params.toStage },
  });

  return { id: params.oppId, stage: params.toStage };
}

/**
 * 判断商机当前是否超期
 * 跟进中 3 天、谈判中 7 天为阈值（PRD 3.2 stayLimitDays）
 */
export async function isOppOverdue(oppId: string): Promise<boolean> {
  const row = await queryOne<{ stage: string; stageEnteredAt: string; overdue: boolean }>(
    `SELECT "stage", "stageEnteredAt",
            CASE
              WHEN "stage" = 'FOLLOWING'  AND "stageEnteredAt" < NOW() - interval '3 days' THEN TRUE
              WHEN "stage" = 'NEGOTIATING' AND "stageEnteredAt" < NOW() - interval '7 days' THEN TRUE
              ELSE FALSE
            END AS "overdue"
       FROM "Opportunity" WHERE "id" = $1`,
    [oppId],
  );
  return row?.overdue ?? false;
}