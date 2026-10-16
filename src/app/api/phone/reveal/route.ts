import { NextResponse } from 'next/server';
import { z } from 'zod';
import { queryOne } from '@/server/db';
import { writeLog } from '@/server/log';
import { canAccessRecord } from '@/lib/data-scope/scope';
import { getSession } from '@/lib/auth/session';

/**
 * 查看完整手机号
 *
 * 这是隐私合规的关键接口：
 * 1. 二次校验数据权限，防止直接传 ID 越权查看他人客户
 * 2. 写操作日志，记录「谁、何时、查看了哪条数据的手机号」
 * 3. 列表接口只下发脱敏号码，完整号码必须经此接口单独获取
 */

const schema = z.object({
  bizType: z.enum(['LEAD', 'OPPORTUNITY', 'CUSTOMER']),
  bizId: z.string().min(1),
});

const TABLE = {
  LEAD: 'Lead',
  OPPORTUNITY: 'Opportunity',
  CUSTOMER: 'Customer',
} as const;

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ code: 401, message: '登录已失效，请重新登录' }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ code: 400, message: '参数错误' }, { status: 400 });
  }

  const { bizType, bizId } = parsed.data;
  const table = TABLE[bizType];

  const record = await queryOne<{
    id: string;
    code: string;
    name: string;
    phone: string;
    ownerId: string | null;
    deptId: string | null;
    status: string | null;
  }>(
    `SELECT "id","code","name","phone","ownerId","deptId",${
      bizType === 'LEAD' ? '"status"' : 'NULL::text'
    } AS "status"
       FROM "${table}"
      WHERE "id" = $1 AND "isDeleted" = FALSE`,
    [bizId],
  );

  if (!record) {
    return NextResponse.json({ code: 404, message: '数据不存在' }, { status: 404 });
  }

  // 关键：二次校验数据权限，防止直接输入 ID 越权
  const access = await canAccessRecord(session, record, bizType);
  if (!access.allowed) {
    return NextResponse.json({ code: 403, message: access.reason ?? '无操作权限' }, { status: 403 });
  }

  // 留痕：谁在什么时候查看了哪条数据的完整手机号
  await writeLog({
    operatorId: session.userId,
    operatorDeptId: session.deptId,
    operatorName: session.name,
    action: 'REVEAL_PHONE',
    targetType: bizType,
    targetId: bizId,
    summary: `查看完整手机号：${record.code} ${record.name}`,
  });

  return NextResponse.json({ code: 0, data: { phone: record.phone } });
}