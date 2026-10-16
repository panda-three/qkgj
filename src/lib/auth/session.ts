import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { DEFAULT_CONFIG } from '@/lib/constants';

const SECRET = process.env.SESSION_SECRET ?? 'dev-only-secret-change-me-in-production';
const KEY = new TextEncoder().encode(SECRET);

export const SESSION_COOKIE = 'qk_session';

/** 会话载荷。只放必要信息，敏感数据不落 token */
export type SessionPayload = {
  userId: string;
  name: string;
  role: string;
  deptId: string;
  deptName: string;
  employeeNo: string;
};

export async function createSessionToken(payload: SessionPayload): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    // 会话超时 2 小时（PRD 6.2）
    .setExpirationTime(`${DEFAULT_CONFIG.SESSION_TIMEOUT_MINUTES}m`)
    .sign(KEY);
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, KEY, { algorithms: ['HS256'] });
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

/** 从 Cookie 读取当前会话。未登录返回 null */
export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

/** 供 Server Actions / Route Handlers 设置会话 Cookie */
export async function setSessionCookie(token: string) {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: DEFAULT_CONFIG.SESSION_TIMEOUT_MINUTES * 60,
  });
}

export async function clearSessionCookie() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}