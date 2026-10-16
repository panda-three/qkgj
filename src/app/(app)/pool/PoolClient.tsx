'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useState, useTransition } from 'react';
import { Globe, Hand, Search } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, PageHeader } from '@/components/ui/Layout';
import { EmptyState } from '@/components/ui/Feedback';
import { Field, Input } from '@/components/ui/Field';
import { Pagination } from '@/components/ui/ListControls';
import { StatusTag } from '@/components/business/StatusTag';
import { PhoneCell } from '@/components/business/PhoneCell';
import { StatCard } from '@/components/business/StatCard';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { LEAD_STATUS_META } from '@/lib/constants';
import { formatDate, daysSince } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';

/**
 * 公海池
 *
 * 核心操作是「领取」，必须处理并发冲突：
 * 两人同时点领取，后到的那位会收到「已被他人领取」提示并刷新列表。
 * 这不是异常情况，是公海池的正常业务场景，提示要友好而不是报错。
 */

export type PoolRowView = {
  id: string;
  code: string;
  name: string;
  phone: string;
  channelName: string | null;
  courseName: string | null;
  followCount: number;
  lastFollowAt: string | null;
  createdAt: string;
  previousOwners: number;
};

export function PoolClient({
  rows,
  total,
  page,
  pageSize,
  counts,
}: {
  rows: PoolRowView[];
  total: number;
  page: number;
  pageSize: number;
  counts: { total: number; waiting7: number; waiting30: number; neverFollowed: number };
}) {
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  const [keyword, setKeyword] = useState(params.get('keyword') ?? '');
  const [claiming, setClaiming] = useState<PoolRowView | null>(null);
  const [busy, setBusy] = useState(false);

  const navigate = useCallback(
    (patch: Record<string, string | null>, resetPage = true) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === '') next.delete(k);
        else next.set(k, v);
      }
      if (resetPage) next.delete('page');
      const qs = next.toString();
      router.push(qs ? `/pool?${qs}` : '/pool');
      router.refresh();
    },
    [params, router],
  );

  async function doClaim(targets: PoolRowView[]) {
    setBusy(true);
    try {
      const res = await fetch('/api/pool/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bizType: 'LEAD', ids: targets.map((t) => t.id) }),
      });
      const json = await res.json();

      if (!res.ok) {
        // 并发冲突是公海池的常态，用提示而非报错
        toast.error('领取未完成', json.message ?? '请稍后重试');
        router.refresh();
        return;
      }

      const success = json.data?.success?.length ?? 0;
      const failed = json.data?.failed?.length ?? 0;

      if (failed > 0 && success > 0) {
        toast.info(`领取成功 ${success} 条，${failed} 条已被他人领取`, '列表已刷新');
      } else if (failed > 0) {
        toast.info('所选线索已被他人领取', '公海池刷新后可看到最新状态');
      } else {
        toast.success(
          targets.length > 1 ? `成功领取 ${success} 条线索` : `已领取 ${targets[0]?.name} 的线索`,
          '请及时跟进，避免长期未跟进被自动回收',
        );
      }

      setClaiming(null);
      router.refresh();
    } catch {
      toast.error('网络异常', '领取未生效，请稍后重试');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="公海池"
        description="无归属人的线索对全员可见可领 · 归属轨迹完整保留可追溯"
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="公海线索" value={counts.total ?? 0} unit="条" tone="info" />
        <StatCard label="等待超 7 天" value={counts.waiting7 ?? 0} unit="条" tone="warning" />
        <StatCard label="等待超 30 天" value={counts.waiting30 ?? 0} unit="条" tone="danger" />
        <StatCard label="从未跟进" value={counts.neverFollowed ?? 0} unit="条" tone="brand" />
      </div>

      <Card>
        <CardHeader
          title="可领取线索"
          count={total}
          actions={
            <form
              className="flex items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                navigate({ keyword });
              }}
            >
              <div className="relative">
                <Search
                  size={14}
                  className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-ink-400"
                  aria-hidden
                />
                <Input
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  placeholder="姓名 / 手机号"
                  size="sm"
                  style={{ width: 180 }}
                  icon={<span className="sr-only">搜索</span>}
                />
              </div>
              <Button type="submit" variant="default" size="sm">
                查询
              </Button>
            </form>
          }
        />

        {rows.length === 0 ? (
          <EmptyState
            icon={<Globe size={20} />}
            title="公海池暂无线索"
            description="所有线索都有归属人，无需领取"
          />
        ) : (
          <div className="divide-y divide-ink-100">
            {rows.map((r) => {
              const waiting = daysSince(r.createdAt);
              const urgent = waiting > 30;
              const meta = LEAD_STATUS_META.TO_POOL;

              return (
                <div
                  key={r.id}
                  className={cn('flex flex-wrap items-center gap-3 px-4 py-3', urgent && 'bg-danger-50/40')}
                >
                  <div className="min-w-[180px] flex-1">
                    <div className="flex items-center gap-2">
                      <a
                        href={`/leads/${r.id}`}
                        className="truncate text-[13.5px] font-medium text-ink-900 hover:text-brand-600"
                      >
                        {r.name}
                      </a>
                      <StatusTag tone={meta.tone}>{meta.name}</StatusTag>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-ink-500">
                      <PhoneCell phone={r.phone} bizId={r.id} bizType="LEAD" />
                      <span className="text-ink-300">|</span>
                      <span>{r.code}</span>
                      {r.channelName && (
                        <>
                          <span className="text-ink-300">|</span>
                          <span className="truncate">{r.channelName}</span>
                        </>
                      )}
                      {r.courseName && (
                        <>
                          <span className="text-ink-300">|</span>
                          <span className="truncate">{r.courseName}</span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex w-28 shrink-0 flex-col text-xs">
                    <span className="text-ink-400">跟进记录</span>
                    <span className="tabular text-ink-700">{r.followCount} 次</span>
                  </div>

                  <div className="flex w-24 shrink-0 flex-col text-xs">
                    <span className="text-ink-400">进入公海</span>
                    <span className={cn('tabular', urgent ? 'font-medium text-danger-600' : 'text-ink-700')}>
                      {waiting} 天
                    </span>
                  </div>

                  {r.previousOwners > 0 && (
                    <span
                      className="hidden w-20 shrink-0 text-xs text-ink-400 lg:block"
                      title="曾被其他顾问持有过"
                    >
                      经手 {r.previousOwners} 人
                    </span>
                  )}

                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => setClaiming(r)}
                    className="shrink-0"
                  >
                    <Hand size={13} aria-hidden />
                    领取
                  </Button>
                </div>
              );
            })}
          </div>
        )}

        {rows.length > 0 && (
          <Pagination
            page={page}
            pageSize={pageSize}
            total={total}
            onPageChange={(p) => {
              const next = new URLSearchParams(params.toString());
              next.set('page', String(p));
              router.push(`/pool?${next.toString()}`);
              router.refresh();
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            onPageSizeChange={(s) => {
              const next = new URLSearchParams(params.toString());
              next.set('pageSize', String(s));
              next.delete('page');
              router.push(`/pool?${next.toString()}`);
              router.refresh();
            }}
          />
        )}
      </Card>

      {/* 领取确认弹窗 */}
      <Modal
        open={!!claiming}
        onOpenChange={(o) => !o && setClaiming(null)}
        title="领取线索"
        description={claiming ? `${claiming.code} ${claiming.name}` : undefined}
        size="sm"
        footer={
          <>
            <Button variant="default" onClick={() => setClaiming(null)}>
              取消
            </Button>
            <Button
              variant="primary"
              loading={busy}
              onClick={() => claiming && doClaim([claiming])}
            >
              确认领取
            </Button>
          </>
        }
      >
        {claiming && (
          <div className="space-y-3">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[13px]">
              <dt className="text-ink-500">来源渠道</dt>
              <dd className="text-ink-800">{claiming.channelName ?? '--'}</dd>
              <dt className="text-ink-500">意向课程</dt>
              <dd className="text-ink-800">{claiming.courseName ?? '--'}</dd>
              <dt className="text-ink-500">历史跟进</dt>
              <dd className="text-ink-800">{claiming.followCount} 次</dd>
              <dt className="text-ink-500">已在公海</dt>
              <dd className="text-ink-800">{daysSince(claiming.createdAt)} 天</dd>
            </dl>
            <div className="rounded-[6px] border border-brand-100 bg-brand-50 px-3 py-2 text-xs leading-relaxed text-brand-700">
              领取后线索归属人变为你，状态转为「待跟进」，并写入归属轨迹。
              请及时跟进，长期未跟进会被自动踢回公海。
            </div>
          </div>
        )}
      </Modal>

      <span className="sr-only" aria-live="polite">
        {pending ? '处理中' : ''}
      </span>
    </div>
  );
}