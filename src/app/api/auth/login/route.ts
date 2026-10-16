import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { queryOne, query } from '@/server/db';
import { writeLog } from '@/server/log';
import { createSessionToken, setSessionCookie } from '@/lib/auth/session';
import { DEFAULT_CONFIG } from '@/lib/constants';
import { loginSchema } from '@/lib/validators';

/** 与 seed 脚本保持一致的密码哈希 */
function hashPassword(plain: string): string {
  return createHash('sha256').update(`qingkeguanjia:${plain}`).digest('hex');
}

/**
 * 定长比较，避免时序攻击。
 * 纯字符串实现，不依赖 node:crypto 的 Buffer 类型，
 * 这样浏览器端复用本函数时也无需 polyfill。
 */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

interface UserRow {
  id: string;
  name: string;
  role: string;
  employeeNo: string;
  status: string;
  passwordHash: string;
  mustChangePwd: boolean;
  failCount: number;
  lockedUntil: string | null;
  deptId: string;
  deptName: string;
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { code: 400, message: parsed.error.issues[0]?.message ?? '参数错误' },
      { status: 400 },
    );
  }

  const { employeeNo, password } = parsed.data;

  const fail = (message: string, status = 401) =>
    NextResponse.json({ code: status, message }, { status });

  // 支持工号或手机号登录
  const user = await queryOne<UserRow>(
    `SELECT u."id", u."name", u."role", u."employeeNo", u."status", u."passwordHash",
            u."mustChangePwd", u."failCount", u."lockedUntil", u."deptId",
            d."name" AS "deptName"
       FROM "User" u
       JOIN "Dept" d ON d."id" = u."deptId"
      WHERE (u."employeeNo" = $1 OR u."phone" = $1)
      LIMIT 1`,
    [employeeNo],
  );

  if (!user) {
    await writeLog({
      operatorName: employeeNo,
      action: 'LOGIN_FAILED',
      summary: `登录失败：账号不存在 ${employeeNo}`,
    });
    return fail('工号或密码错误');
  }

  if (user.status !== 'ACTIVE') {
    return fail('账号已停用，请联系管理员', 403);
  }

  // 连续 5 次失败锁定 30 分钟
  if (user.lockedUntil && new Date(user.lockedUntil) > new Date()) {
    const mins = Math.ceil((new Date(user.lockedUntil).getTime() - Date.now()) / 60000);
    return fail(`密码错误次数过多，账号已锁定，请 ${mins} 分钟后再试`, 403);
  }

  if (!safeEqual(user.passwordHash, hashPassword(password))) {
    const failCount = user.failCount + 1;
    const shouldLock = failCount >= DEFAULT_CONFIG.LOGIN_FAIL_LIMIT;

    await query(
      `UPDATE "User"
          SET "failCount" = $1,
              "lockedUntil" = CASE WHEN $2 THEN NOW() + ($3 || ' minutes')::interval ELSE NULL END
        WHERE "id" = $4`,
      [
        failCount,
        shouldLock,
        String(DEFAULT_CONFIG.LOGIN_LOCK_MINUTES),
        user.id,
      ],
    );

    await writeLog({
      operatorId: user.id,
      operatorDeptId: user.deptId,
      operatorName: user.name,
      action: 'LOGIN_FAILED',
      summary: shouldLock
        ? `登录失败次数超限，账号锁定 ${DEFAULT_CONFIG.LOGIN_LOCK_MINUTES} 分钟`
        : `密码错误（第 ${failCount} 次）`,
    });

    return shouldLock
      ? fail(`密码错误次数过多，账号已锁定 ${DEFAULT_CONFIG.LOGIN_LOCK_MINUTES} 分钟`, 403)
      : fail(`工号或密码错误，还剩 ${DEFAULT_CONFIG.LOGIN_FAIL_LIMIT - failCount} 次机会`);
  }

  // 登录成功
  await query(
    `UPDATE "User" SET "failCount" = 0, "lockedUntil" = NULL, "lastLoginAt" = NOW()
      WHERE "id" = $1`,
    [user.id],
  );

  const token = await createSessionToken({
    userId: user.id,
    name: user.name,
    role: user.role,
    deptId: user.deptId,
    deptName: user.deptName,
    employeeNo: user.employeeNo,
  });
  await setSessionCookie(token);

  await writeLog({
    operatorId: user.id,
    operatorDeptId: user.deptId,
    operatorName: user.name,
    action: 'LOGIN',
    summary: `${user.name} 登录成功`,
  });

  return NextResponse.json({
    code: 0,
    data: {
      id: user.id,
      name: user.name,
      role: user.role,
      deptName: user.deptName,
      mustChangePwd: user.mustChangePwd,
    },
  });
}