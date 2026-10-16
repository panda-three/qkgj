import { requireSession } from '@/lib/auth/guard';
import { listPool, countPool } from '@/server/services/poolQuery';
import { PoolClient, type PoolRowView } from './PoolClient';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function PoolPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireSession();
  const sp = await searchParams;

  const one = (k: string): string => {
    const v = sp[k];
    return Array.isArray(v) ? (v[0] ?? '') : (v ?? '');
  };

  const user = {
    userId: session.userId,
    role: session.role,
    deptId: session.deptId,
    deptName: session.deptName,
    name: session.name,
    employeeNo: session.employeeNo,
  };

  const [{ rows, total, page, pageSize }, counts] = await Promise.all([
    listPool(user, {
      keyword: one('keyword') || undefined,
      page: Number(one('page')) || 1,
      pageSize: Number(one('pageSize')) || 20,
      sortBy: one('sortBy') === 'updatedAt' ? 'updatedAt' : 'createdAt',
      sortOrder: one('sortOrder') === 'asc' ? 'asc' : 'desc',
    }),
    countPool(user),
  ]);

  const list: PoolRowView[] = rows.map((r) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    phone: r.phone,
    channelName: r.channelName,
    courseName: r.courseName,
    followCount: r.followCount,
    lastFollowAt: r.lastFollowAt,
    createdAt: r.createdAt,
    previousOwners: r.previousOwners,
  }));

  return (
    <PoolClient rows={list} total={total} page={page} pageSize={pageSize} counts={counts ?? { total: 0, waiting7: 0, waiting30: 0, neverFollowed: 0 }} />
  );
}