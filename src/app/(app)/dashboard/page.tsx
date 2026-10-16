import { query, queryOne } from '@/server/db';
import { requireSession } from '@/lib/auth/guard';
import { StatCard } from '@/components/business/StatCard';
import {
  AlertTriangle,
  Briefcase,
  CircleDollarSign,
  Clock,
  Target,
  TrendingUp,
  UserCheck,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { formatAmount, formatAmountShort, formatRate } from '@/lib/utils/format';
import { LEAD_STATUS, OPP_STAGE } from '@/lib/constants';
import { getVisibleDeptIds } from '@/lib/data-scope/scope';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const session = await requireSession();

  // ★ BR-D01：所有统计受数据权限约束
  // 超管全量 / 主管本部门及下属 / 顾问本人 + 公海
  const deptIds =
    session.role === 'SALES_MANAGER' ? await getVisibleDeptIds(session.deptId) : null;

  // 构造数据权限条件（SQL 层拼接，禁止查全量后内存过滤）
  const scope =
    session.role === 'SUPER_ADMIN'
      ? { sql: 'TRUE', params: [] as unknown[] }
      : session.role === 'SALES_MANAGER'
        ? {
            sql: `("l"."ownerId" = $2 OR "l"."deptId" = ANY($3) OR "l"."status" = 'TO_POOL')`,
            params: [null, session.userId, deptIds],
          }
        : {
            sql: `("l"."ownerId" = $2 OR "l"."status" = 'TO_POOL')`,
            params: [null, session.userId],
          };

  const oppScope =
    session.role === 'SUPER_ADMIN'
      ? { sql: 'TRUE', params: [] as unknown[] }
      : session.role === 'SALES_MANAGER'
        ? {
            sql: `("o"."ownerId" = $2 OR "o"."deptId" = ANY($3) OR "o"."ownerId" IS NULL)`,
            params: [null, session.userId, deptIds],
          }
        : {
            sql: `("o"."ownerId" = $2 OR "o"."ownerId" IS NULL)`,
            params: [null, session.userId],
          };

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const leadRow = await queryOne<{
    total: number; following: number; pending: number;
  }>(
    `SELECT
       COUNT(*) FILTER (WHERE "createdAt" >= $1 AND "status" <> 'PSEUDO')::int AS total,
       COUNT(*) FILTER (WHERE "status" = 'FOLLOWING')::int AS following,
       COUNT(*) FILTER (WHERE "status" = 'PENDING')::int AS pending
     FROM "Lead" l
     WHERE ${scope.sql} AND "isDeleted" = FALSE`,
    [monthStart, ...scope.params.slice(1)],
  );

  const oppRow = await queryOne<{
    total: number; won: number; following: number; negotiating: number;
    expectAmount: number; wonAmount: number;
  }>(
    `SELECT
       COUNT(*) FILTER (WHERE "createdAt" >= $1)::int AS total,
       COUNT(*) FILTER (WHERE "stage" = 'WON')::int AS won,
       COUNT(*) FILTER (WHERE "stage" = 'FOLLOWING')::int AS following,
       COUNT(*) FILTER (WHERE "stage" = 'NEGOTIATING')::int AS negotiating,
       COALESCE(SUM("amount") FILTER (WHERE "stage" IN ('FOLLOWING','NEGOTIATING')), 0) AS "expectAmount",
       COALESCE(SUM("wonAmount") FILTER (WHERE "stage" = 'WON'), 0) AS "wonAmount"
     FROM "Opportunity" o
     WHERE ${oppScope.sql} AND "isDeleted" = FALSE`,
    [monthStart, ...oppScope.params.slice(1)],
  );

  // ★ BR-D04：转商机数按状态跃迁时间统计，不是数据创建时间
  const converted = await queryOne<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM "StatusChangeLog"
      WHERE "bizType" = 'LEAD' AND "action" = 'CONVERT_LEAD' AND "changedAt" >= $1`,
    [monthStart],
  );

  const custRow = await queryOne<{ amount: number }>(
    `SELECT COALESCE(SUM("amount"), 0) AS amount FROM "Customer"
      WHERE "isDeleted" = FALSE
        AND ($1::text IS NULL OR "deptId" = ANY($2) OR "ownerId" = $3)`,
    [
      session.role === 'SUPER_ADMIN' ? null : 'x',
      deptIds ?? [],
      session.userId,
    ],
  );

  const leadTotal = leadRow?.total ?? 0;
  const oppTotal = oppRow?.total ?? 0;
  const wonCount = oppRow?.won ?? 0;
  const convertedCount = converted?.n ?? 0;

  const stats = [
    { label: '线索总量', value: leadTotal, unit: '条', icon: Users, tone: 'brand' as const },
    {
      label: '待跟进线索',
      value: (leadRow?.following ?? 0) + (leadRow?.pending ?? 0),
      unit: '条',
      icon: UserCheck,
      tone: 'warning' as const,
    },
    { label: '商机总量', value: oppTotal, unit: '个', icon: Briefcase, tone: 'purple' as const },
    { label: '赢单数', value: wonCount, unit: '个', icon: Target, tone: 'success' as const },
    // ★ BR-D03：分母为 0 时显示 -- 而非 0
    { label: '赢单率', value: formatRate(wonCount, oppTotal), icon: TrendingUp, tone: 'success' as const },
    {
      label: '线索转商机率',
      value: formatRate(convertedCount, leadTotal),
      icon: CircleDollarSign,
      tone: 'brand' as const,
    },
    {
      label: '预计成交金额',
      value: formatAmountShort(oppRow?.expectAmount ?? 0),
      icon: Clock,
      tone: 'warning' as const,
    },
    {
      label: '实际成交金额',
      value: formatAmountShort(custRow?.amount ?? oppRow?.wonAmount ?? 0),
      icon: AlertTriangle,
      tone: 'danger' as const,
    },
  ];

  // 五级漏斗
  const funnel = [
    { name: '线索总量', value: leadTotal, tone: 'from-[#3a63f0] to-[#5d86fb]' },
    { name: '已跟进', value: leadRow?.following ?? 0, tone: 'from-[#5d86fb] to-[#91b2ff]' },
    { name: '转商机', value: convertedCount, tone: 'from-[#8b5cf6] to-[#a78bfa]' },
    { name: '谈判中', value: oppRow?.negotiating ?? 0, tone: 'from-[#f59e0b] to-[#fbbf24]' },
    { name: '赢单', value: wonCount, tone: 'from-[#10b981] to-[#34d399]' },
  ];
  const maxFunnel = Math.max(...funnel.map((f) => f.value), 1);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[21px] font-semibold text-ink-900">数据看板</h1>
        <p className="mt-1 text-[13px] text-ink-500">
          {session.deptName} · {session.name} · 本月数据
        </p>
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(212px,1fr))] gap-3.5">
        {stats.map((s) => (
          <StatCard key={s.label} {...s} />
        ))}
      </div>

      {/* 五级转化漏斗 */}
      <div className="rounded-[10px] border border-ink-200 bg-white shadow-xs">
        <div className="flex min-h-[52px] items-center justify-between border-b border-ink-100 px-[18px]">
          <h2 className="flex items-center gap-2 text-sm font-medium text-ink-900">
            <span className="h-3.5 w-[3px] rounded-sm bg-brand-500" />
            转化漏斗
          </h2>
          <span className="text-xs text-ink-400">
            本月 · {session.role === 'SUPER_ADMIN' ? '全系统' : session.role === 'SALES_MANAGER' ? '本部门及下属' : '仅本人'}
          </span>
        </div>
        <div className="space-y-3 p-[18px]">
          {funnel.map((f, i) => {
            const prev = i > 0 ? funnel[i - 1] : null;
            const lost = prev ? Math.max((prev?.value ?? 0) - f.value, 0) : 0;
            return (
              <div key={f.name} className="flex items-center gap-3">
                <span className="w-16 shrink-0 text-xs text-ink-500">{f.name}</span>
                <div className="h-8 flex-1 overflow-hidden rounded-md bg-ink-100">
                  <div
                    className={`flex h-full items-center justify-end rounded-md bg-gradient-to-r px-3 text-xs font-medium text-white ${f.tone}`}
                    style={{ width: `${Math.max((f.value / maxFunnel) * 100, f.value > 0 ? 8 : 0)}%` }}
                  >
                    {f.value}
                  </div>
                </div>
                <span className="w-32 shrink-0 text-right text-xs text-ink-400">
                  {prev ? `转化 ${formatRate(f.value, prev.value)} · 流失 ${lost}` : '起始'}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* 我的待办：BR-D02 不做缓存 */}
      <MyTodo ownerId={session.userId} />

      <div className="rounded-[10px] border border-ink-200 bg-white p-[18px] shadow-xs">
        <div className="text-sm font-medium text-ink-900">商机阶段分布</div>
        <div className="mt-4 grid grid-cols-3 gap-3">
          {[
            ['跟进中', oppRow?.following ?? 0, 'text-brand-600', 'bg-brand-50'],
            ['谈判中', oppRow?.negotiating ?? 0, 'text-warning-700', 'bg-warning-50'],
            ['已赢单', wonCount, 'text-success-700', 'bg-success-50'],
          ].map(([label, value, textCls, bgCls]) => (
            <div key={label as string} className={`rounded-lg p-4 ${bgCls}`}>
              <div className={`tabular text-2xl font-semibold ${textCls}`}>{value as number}</div>
              <div className="mt-0.5 text-xs text-ink-500">{label as string}</div>
            </div>
          ))}
        </div>
        <div className="mt-3 text-xs text-ink-400">
          预计成交金额 {formatAmount(oppRow?.expectAmount ?? 0)} ·
          赢单金额 {formatAmount(oppRow?.wonAmount ?? 0)}
        </div>
      </div>
    </div>
  );
}

async function MyTodo({ ownerId }: { ownerId: string }) {
  const leads = await query<{ id: string; name: string; nextFollowAt: string | null }>(
    `SELECT "id","name","nextFollowAt" FROM "Lead"
      WHERE "ownerId" = $1
        AND "status" = 'FOLLOWING'
        AND "isDeleted" = FALSE
        AND ("nextFollowAt" IS NULL OR "nextFollowAt" <= NOW())
      ORDER BY "nextFollowAt" ASC NULLS FIRST
      LIMIT 5`,
    [ownerId],
  );

  return (
    <div className="rounded-[10px] border border-ink-200 bg-white shadow-xs">
      <div className="flex min-h-[52px] items-center justify-between border-b border-ink-100 px-[18px]">
        <h2 className="flex items-center gap-2 text-sm font-medium text-ink-900">
          <span className="h-3.5 w-[3px] rounded-sm bg-warning-500" />
          我的待跟进
        </h2>
        <span className="text-xs text-ink-400">不缓存 · 实时</span>
      </div>
      <div className="p-[18px]">
        {leads.length === 0 ? (
          <div className="py-6 text-center text-[13px] text-ink-400">
            暂无待跟进任务，保持得不错
          </div>
        ) : (
          <ul className="divide-y divide-ink-100">
            {leads.map((l) => (
              <li key={l.id}>
                <Link
                  href={`/leads/${l.id}`}
                  className="flex items-center justify-between py-2.5 text-[13px] text-ink-800 transition-colors hover:text-brand-600"
                >
                  <span>{l.name}</span>
                  <span className="text-xs text-ink-400">
                    {l.nextFollowAt
                      ? new Date(l.nextFollowAt).toLocaleString('zh-CN', {
                          month: '2-digit',
                          day: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : '未设下次跟进'}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
