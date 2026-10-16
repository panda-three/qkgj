import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/auth/session';
import { claimPoolItem, returnToPool } from '@/server/services/pool';

/**
 * 公海池领取 / 踢回
 *
 * 领取失败（已被他人领取）是正常业务结果而非系统错误，
 * 因此返回 200 + failed 明细，由前端用友好提示呈现，
 * 不让用户以为系统出了故障。
 */

const claimSchema = z.object({
  bizType: z.enum(['LEAD', 'OPPORTUNITY']).default('LEAD'),
  ids: z.array(z.string().min(1)).min(1),
});

const returnSchema = z.object({
  bizType: z.enum(['LEAD', 'OPPORTUNITY']).default('LEAD'),
  bizId: z.string().min(1),
  reason: z.string().min(1, '请选择原因'),
  remark: z.string().optional(),
});

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ code: 401, message: '登录已失效，请重新登录' }, { status: 401 });
  }

  const body = await req.json().catch(() => null);

  // 领取
  const claimParsed = claimSchema.safeParse(body);
  if (claimParsed.success) {
    try {
      const result = await claimPoolItem({ ...claimParsed.data, user: session });
      return NextResponse.json({ code: 0, data: result });
    } catch (e) {
      const err = e as { status?: number; message?: string };
      return NextResponse.json(
        { code: err.status ?? 500, message: err.message ?? '领取失败' },
        { status: err.status ?? 500 },
      );
    }
  }

  // 踢回公海
  const returnParsed = returnSchema.safeParse(body);
  if (returnParsed.success) {
    try {
      await returnToPool({ ...returnParsed.data, user: session });
      return NextResponse.json({ code: 0, data: { success: [returnParsed.data.bizId], failed: [] } });
    } catch (e) {
      const err = e as { status?: number; message?: string };
      return NextResponse.json(
        { code: err.status ?? 500, message: err.message ?? '踢回失败' },
        { status: err.status ?? 500 },
      );
    }
  }

  return NextResponse.json({ code: 400, message: '参数错误' }, { status: 400 });
}