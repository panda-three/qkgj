import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const session = await getSession();
  // 已登录直接进看板，未登录去登录页
  redirect(session ? '/dashboard' : '/login');
}