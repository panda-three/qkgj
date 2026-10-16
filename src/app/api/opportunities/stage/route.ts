import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/auth/session';
import { changeOppStage } from '@/server/services/oppStage';

/**
 * 商机阶段流转接口
 * 看板拖拽与详情页阶段推进共用此接口。
 *
 * 失败时返回明确的业务错误，前端据此做回滚并提示原因，
 * 不允许前端假装成功——阶段流转是核心业务动作，必须真实落库。
 */

const schema = z.object({
  oppId: z.string().min(1),
  toStage: z.enum(['FOLLOWING', 'NEGOTIATING', 'WON', 'LOST']),
  lostReason: z.string().optional(),
  remark: z.string().optional(),
});

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

  try {
    const result = await changeOppStage(parsed.data, session);
    return NextResponse.json({ code: 0, data: result });
  } catch (e) {
    const err = e as { status?: number; message?: string };
    return NextResponse.json(
      { code: err.status ?? 500, message: err.message ?? '阶段推进失败' },
      { status: err.status ?? 500 },
    );
  }
}