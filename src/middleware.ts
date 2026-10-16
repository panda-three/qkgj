import { NextResponse, type NextRequest } from 'next/server';
import { verifySessionToken, SESSION_COOKIE } from '@/lib/auth/session';

/**
 * 路由级登录拦截
 *
 * 注意：前端按钮隐藏不是权限控制，本文件只做「是否登录」的粗筛，
 * 真正的功能权限与数据权限一律在接口层独立校验（PRD 规则 3）。
 */

/** 无需登录即可访问的路径 */
const PUBLIC_PATHS = ['/login', '/api/auth/login'];

/** 角色限制路由：顾问不可访问系统管理（PRD 2.2） */
const ADMIN_ONLY = ['/system'];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await verifySessionToken(token) : null;

  // 未登录 → 跳登录页（API 直接返回 401）
  if (!session) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ code: 401, message: '登录已失效，请重新登录' }, { status: 401 });
    }
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  // 管理员专属路由
  if (ADMIN_ONLY.some((p) => pathname.startsWith(p)) && session.role === 'SALES') {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ code: 403, message: '无操作权限' }, { status: 403 });
    }
    const url = req.nextUrl.clone();
    url.pathname = '/dashboard';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // 排除静态资源与原型目录
    '/((?!_next/static|_next/image|favicon.ico|prototype|.*\\.(?:svg|png|jpg|ico)$).*)',
  ],
};