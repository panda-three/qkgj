'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo, useState, useTransition } from 'react';
import { Inbox, Users } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { FilterBar, Pagination, QuickTabs } from '@/components/ui/ListControls';
import { Card, CardHeader, TableWrap, Th, Td, CellStack, PageHeader } from '@/components/ui/Layout';
import { EmptyState } from '@/components/ui/Feedback';
import { Field, Input, Select } from '@/components/ui/Field';
import { StatusTag } from '@/components/business/StatusTag';
import { PhoneCell } from '@/components/business/PhoneCell';
import { StatCard } from '@/components/business/StatCard';
import { CUSTOMER_STATUS_META, type CustomerStatus } from '@/lib/constants';
import { formatAmount, formatDate, daysRemaining } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';

/**
 * 客户列表
 *
 * 移动端转卡片列表，客户档案的核心信息（状态、剩余服务、服务到期）不能藏在横向滚动里。
 */

export type CustomerRowView = {
  id: string;
  code: string;
  name: string;
  phone: string;
  status: CustomerStatus;
  amount: number;
  ownerId: string | null;
  ownerName: string | null;
  deptName: string | null;
  courseName: string | null;
  serviceExpireDate: string | null;
  dealDate: string | null;
};

type Counts = Record<string, number>;

export function CustomerListClient({
  rows,
  total,
  page,
  pageSize,
  counts,
  options,
  canAssign,
}: {
  rows: CustomerRowView[];
  total: number;
  page: number;
  pageSize: number;
  counts: Counts;
  options: {
    owners: { id: string; name: string; deptName: string }[];
  };
  canAssign: boolean;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const status = params.get('status') ?? '';
  const expiring = params.get('expiring') === '1';
  const sortBy = params.get('sortBy') ?? 'dealDate';
  const sortOrder = (params.get('sortOrder') ?? 'desc') as 'asc' | 'desc';

  const [form, setForm] = useState({
    keyword: params.get('keyword') ?? '',
    status: params.get('status') ?? '',
    ownerId: params.get('ownerId') ?? '',
  });

  const navigate = useCallback(
    (patch: Record<string, string | null>, resetPage = true) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === '') next.delete(k);
        else next.set(k, v);
      }
      if (resetPage) next.delete('page');
      const qs = next.toString();
      router.push(qs ? `/customers?${qs}` : '/customers');
      router.refresh();
    },
    [params, router],
  );

  const handleSort = (field: string) => {
    if (sortBy === field) {
      navigate({ sortBy: field, sortOrder: sortOrder === 'desc' ? 'asc' : 'desc' }, false);
    } else {
      navigate({ sortBy: field, sortOrder: 'desc' }, false);
    }
  };

  const tabs = [
    { value: '', label: '全部客户', count: counts.all },
    { value: 'ACTIVE', label: '正常在读', count: counts.ACTIVE },
    { value: 'PAUSED', label: '暂停服务', count: counts.PAUSED },
    { value: 'COMPLETED', label: '已结课', count: counts.COMPLETED },
    { value: 'REFUNDED', label: '已退费', count: counts.REFUNDED },
    { value: 'LOST', label: '已流失', count: counts.LOST },
  ];

  const activeFilters = useMemo(() => {
    const list: { key: string; label: string }[] = [];
    if (form.keyword) list.push({ key: 'keyword', label: `关键词：${form.keyword}` });
    if (form.ownerId) {
      const o = options.owners.find((x) => x.id === form.ownerId);
      if (o) list.push({ key: 'ownerId', label: `归属人：${o.name}` });
    }
    if (expiring) list.push({ key: 'expiring', label: '服务 30 天内到期' });
    return list;
  }, [form, options, expiring]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="客户管理"
        description="客户档案与商机永久关联（BR-T01）· 跟进、服务、状态、资金流水合并为完整时间轴"
      />

      {/* 指标概览 */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="客户总数" value={counts.all ?? 0} unit="位" tone="brand" />
        <StatCard label="正常在读" value={counts.ACTIVE ?? 0} unit="位" tone="success" />
        <StatCard label="30 天内到期" value={counts.EXPIRING ?? 0} unit="位" tone="warning" />
        <StatCard label="累计成交" value={formatAmount(counts.totalAmount ?? 0)} tone="purple" />
      </div>

      <QuickTabs
        tabs={tabs}
        value={status}
        onChange={(v) => navigate({ status: v || null, expiring: null })}
      />

      <FilterBar
        onSearch={() =>
          navigate({
            keyword: form.keyword,
            status: form.status,
            ownerId: form.ownerId,
          })
        }
        onReset={() => {
          setForm({ keyword: '', status: '', ownerId: '' });
          router.push('/customers');
          router.refresh();
        }}
        searching={pending}
        activeFilters={activeFilters}
        onRemoveFilter={(key) => {
          setForm((f) => ({ ...f, [key]: '' }));
          navigate({ [key]: null });
        }}
        onClearFilters={() => {
          setForm({ keyword: '', status: '', ownerId: '' });
          router.push('/customers');
          router.refresh();
        }}
        extra={
          <Button
            variant={expiring ? 'primary' : 'default'}
            size="sm"
            onClick={() => navigate({ expiring: expiring ? null : '1' })}
          >
            仅看即将到期
          </Button>
        }
      >
        <Field label="关键词" htmlFor="c-kw">
          <Input
            id="c-kw"
            value={form.keyword}
            onChange={(e) => setForm((f) => ({ ...f, keyword: e.target.value }))}
            placeholder="姓名 / 手机号 / 客户编号"
            size="sm"
          />
        </Field>
        <Field label="客户状态" htmlFor="c-status">
          <Select
            id="c-status"
            inputSize="sm"
            value={form.status}
            onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
          >
            <option value="">全部状态</option>
            {Object.entries(CUSTOMER_STATUS_META).map(([k, v]) => (
              <option key={k} value={k}>
                {v.name}
              </option>
            ))}
          </Select>
        </Field>
        {canAssign && (
          <Field label="归属人" htmlFor="c-owner">
            <Select
              id="c-owner"
              inputSize="sm"
              value={form.ownerId}
              onChange={(e) => setForm((f) => ({ ...f, ownerId: e.target.value }))}
            >
              <option value="">全部归属人</option>
              {options.owners.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}（{o.deptName}）
                </option>
              ))}
            </Select>
          </Field>
        )}
      </FilterBar>

      <Card>
        <CardHeader
          title="客户列表"
          count={total}
          actions={
            <Select
              inputSize="sm"
              style={{ width: 'auto' }}
              value={sortBy}
              onChange={(e) => handleSort(e.target.value)}
              aria-label="排序字段"
            >
              <option value="dealDate">成交日期</option>
              <option value="amount">成交金额</option>
              <option value="serviceExpireDate">服务到期日</option>
            </Select>
          }
        />

        {/* 桌面端表格 */}
        <TableWrap minWidth={980}>
          {rows.length === 0 ? (
            <EmptyState
              icon={<Users size={20} />}
              title={activeFilters.length > 0 ? '没有符合条件的客户' : '暂无客户档案'}
              description={
                activeFilters.length > 0
                  ? '试试放宽筛选条件'
                  : '商机赢单后转客户会自动建立档案'
              }
            />
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <Th>客户姓名 / 手机号</Th>
                  <Th>购买课程</Th>
                  <Th>状态</Th>
                  <Th sortable sorted={sortBy === 'amount'} onSort={() => handleSort('amount')} align="right">
                    成交金额
                  </Th>
                  <Th sortable sorted={sortBy === 'dealDate'} onSort={() => handleSort('dealDate')}>
                    成交日期
                  </Th>
                  <Th sortable sorted={sortBy === 'serviceExpireDate'} onSort={() => handleSort('serviceExpireDate')}>
                    服务到期
                  </Th>
                  {canAssign && <Th>归属人</Th>}
                  <th className="col-actions border-b border-ink-200 bg-ink-50 px-3 py-2.5 text-right text-xs font-medium whitespace-nowrap text-ink-500">
                    操作
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const meta = CUSTOMER_STATUS_META[row.status];
                  const remain = daysRemaining(row.serviceExpireDate);
                  const expiringSoon = remain !== null && remain >= 0 && remain <= 30;
                  const expired = remain !== null && remain < 0;

                  return (
                    <tr
                      key={row.id}
                      className={cn(
                        row.status === 'LOST' && 'row-muted',
                        expired && row.status === 'ACTIVE' && 'row-danger',
                      )}
                    >
                      <Td>
                        <a
                          href={`/customers/${row.id}`}
                          className="block rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
                        >
                          <CellStack
                            main={row.name}
                            sub={<PhoneCell phone={row.phone} bizId={row.id} bizType="CUSTOMER" />}
                          />
                        </a>
                      </Td>
                      <Td>
                        <span className="block max-w-[180px] truncate text-ink-600">
                          {row.courseName ?? '--'}
                        </span>
                      </Td>
                      <Td>
                        <StatusTag tone={meta.tone} dot>
                          {meta.name}
                        </StatusTag>
                      </Td>
                      <Td align="right">
                        <span className="tabular font-medium text-ink-900">
                          {formatAmount(row.amount)}
                        </span>
                      </Td>
                      <Td>
                        <span className="text-ink-500">{formatDate(row.dealDate)}</span>
                      </Td>
                      <Td>
                        {remain === null ? (
                          <span className="text-ink-400">--</span>
                        ) : expired ? (
                          <span className="font-medium text-danger-600">
                            已过期 {Math.abs(remain)} 天
                          </span>
                        ) : expiringSoon ? (
                          <span className="font-medium text-warning-700">
                            {remain} 天后到期
                          </span>
                        ) : (
                          <span className="text-ink-500">
                            {formatDate(row.serviceExpireDate)}
                          </span>
                        )}
                      </Td>
                      {canAssign && (
                        <Td>
                          <span className="text-ink-600">{row.ownerName ?? '—'}</span>
                        </Td>
                      )}
                      <td className="col-actions border-b border-ink-100 px-3 py-2.5 text-right">
                        <a
                          href={`/customers/${row.id}`}
                          className="rounded px-2 py-1 text-xs text-brand-600 transition-colors hover:bg-brand-50"
                        >
                          档案
                        </a>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </TableWrap>

        {/* 移动端卡片列表 */}
        <div className="divide-y divide-ink-100 md:hidden">
          {rows.length === 0 ? (
            <EmptyState icon={<Inbox size={20} />} title="暂无客户档案" />
          ) : (
            rows.map((row) => {
              const meta = CUSTOMER_STATUS_META[row.status];
              const remain = daysRemaining(row.serviceExpireDate);
              return (
                <a
                  key={row.id}
                  href={`/customers/${row.id}`}
                  className="block px-4 py-3 transition-colors hover:bg-ink-50"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-[13.5px] font-medium text-ink-900">
                      {row.name}
                    </span>
                    <StatusTag tone={meta.tone}>{meta.name}</StatusTag>
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-500">
                    <span className="tabular font-medium text-ink-800">
                      {formatAmount(row.amount)}
                    </span>
                    {row.courseName && <span className="truncate">{row.courseName}</span>}
                    {remain !== null && (
                      <span
                        className={cn(
                          remain < 0 ? 'text-danger-600' : remain <= 30 ? 'text-warning-700' : '',
                        )}
                      >
                        {remain < 0 ? `已过期 ${Math.abs(remain)} 天` : `${remain} 天后到期`}
                      </span>
                    )}
                  </div>
                </a>
              );
            })
          )}
        </div>

        {rows.length > 0 && (
          <Pagination
            page={page}
            pageSize={pageSize}
            total={total}
            onPageChange={(p) => {
              const next = new URLSearchParams(params.toString());
              next.set('page', String(p));
              router.push(`/customers?${next.toString()}`);
              router.refresh();
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            onPageSizeChange={(s) => {
              const next = new URLSearchParams(params.toString());
              next.set('pageSize', String(s));
              next.delete('page');
              router.push(`/customers?${next.toString()}`);
              router.refresh();
            }}
          />
        )}
      </Card>
    </div>
  );
}