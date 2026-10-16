import { NextResponse } from 'next/server';
import { clearSessionCookie } from '@/lib/auth/session';
import { writeLog } from '@/server/log';

/** 退出登录：清除 Cookie 并记录操作日志 */
export async function POST() {
  await clearSessionCookie();
  // 此处不强制取 session：token 可能已失效，但仍应尽力记一条日志
  await writeLog({
    operatorName: '未知用户',
    action: 'LOGOUT',
    summary: '退出登录',
  });
  return NextResponse.json({ code: 0 });
}