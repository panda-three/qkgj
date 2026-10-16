import { requireSession } from '@/lib/auth/guard';
import { listCustomers, countCustomers } from '@/server/services/customerQuery';
import { getVisibleDeptIds } from '@/lib/data-scope/scope';
import { query } from '@/server/db';
import { CustomerListClient, type CustomerRowView } from './CustomerListClient';
import type { CustomerStatus } from '@/lib/constants';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function CustomersPage({
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
    listCustomers(user, {
      status: one('status') || undefined,
      keyword: one('keyword') || undefined,
      ownerId: one('ownerId') || undefined,
      expiringOnly: one('expiring') === '1' || undefined,
      page: Number(one('page')) || 1,
      pageSize: Number(one('pageSize')) || 20,
      sortBy:
        (['dealDate', 'amount', 'serviceExpireDate', 'createdAt'] as const).find(
          (v) => v === one('sortBy'),
        ) ?? 'dealDate',
      sortOrder: one('sortOrder') === 'asc' ? 'asc' : 'desc',
    }),
    countCustomers(user),
  ]);

  // 归属人下拉按角色裁剪
  let owners: { id: string; name: string; deptName: string }[] = [];
  if (session.role === 'SUPER_ADMIN') {
    owners = await query(
      `SELECT u."id", u."name", d."name" AS "deptName" FROM "User" u
         JOIN "Dept" d ON d."id" = u."deptId"
        WHERE u."status" = 'ACTIVE' AND u."role" <> 'SUPER_ADMIN' ORDER BY u."employeeNo"`,
    );
  } else if (session.role === 'SALES_MANAGER') {
    owners = await query(
      `SELECT u."id", u."name", d."name" AS "deptName" FROM "User" u
         JOIN "Dept" d ON d."id" = u."deptId"
        WHERE u."status" = 'ACTIVE' AND u."role" = 'SALES'
          AND u."deptId" = ANY($1::text[]) ORDER BY u."employeeNo`,
      [await getVisibleDeptIds(session.deptId)],
    );
  } else {
    owners = await query(
      `SELECT u."id", u."name", d."name" AS "deptName" FROM "User" u
         JOIN "Dept" d ON d."id" = u."deptId" WHERE u."id" = $1`,
      [session.userId],
    );
  }

  const list: CustomerRowView[] = rows.map((r) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    phone: r.phone,
    status: r.status as CustomerStatus,
    amount: r.amount,
    ownerId: r.ownerId,
    ownerName: r.ownerName,
    deptName: r.deptName,
    courseName: r.courseName,
    serviceExpireDate: r.serviceExpireDate,
    dealDate: r.dealDate,
  }));

  return (
    <CustomerListClient
      rows={list}
      total={total}
      page={page}
      pageSize={pageSize}
      counts={counts ?? {}}
      options={{ owners }}
      canAssign={session.role !== 'SALES'}
    />
  );
}