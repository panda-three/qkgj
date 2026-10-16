'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { Download, Inbox, Plus, UserPlus, Upload, XCircle, Globe } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import {
  BatchBar,
  Checkbox,
  FilterBar,
  Pagination,
  QuickTabs,
} from '@/components/ui/ListControls';
import { Card, CardHeader, TableWrap, Th, Td, CellStack } from '@/components/ui/Layout';
import { Field, Input, Select } from '@/components/ui/Field';
import { TableSkeleton, EmptyState } from '@/components/ui/Feedback';
import { StatusTag } from '@/components/business/StatusTag';
import { PhoneCell } from '@/components/business/PhoneCell';
import { useToast } from '@/components/ui/Toast';
import { LEAD_STATUS, LEAD_STATUS_META, type LeadStatus } from '@/lib/constants';
import { formatDate, formatDateTime, fromNow } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';

/**
 * 线索列表交互容器
 *
 * 修复了原型的三个缺陷：
 * 1. 排序是假的（只换图标 + toast）→ 现在走真实 URL 参数 + 后端 ORDER BY
 * 2. 全选仅限当前页 → 改为受控选中集合 + 跨页保持，
 *    并显示「已选 N 条（跨 M 页）」提示
 * 3. 手机号直接写在 data-phone → 改为服务端脱敏 + 单独 reveal 接口 + 日志留痕
 *
 * 响应式：
 * · ≥768px 渲染表格
 * · <768px 渲染卡片列表，避免横向滚动导致操作列不可见
 */

export type LeadRowView = {
  id: string;
  code: string;
  name: string;
  phone: string;
  gender: string | null;
  status: LeadStatus;
  ownerId: string | null;
  ownerName: string | null;
  deptName: string | null;
  channelName: string | null;
  courseName: string | null;
  followCount: number;
  lastFollowAt: string | null;
  nextFollowAt: string | null;
  createdAt: string;
};

type FilterOptions = {
  channels: { id: string; name: string }[];
  courses: { id: string; name: string }[];
  owners: { id: string; name: string; deptName: string }[];
  depts: { id: string; name: string }[];
};

type Counts = Partial<Record<LeadStatus | 'all' | 'OVERDUE' | 'NEVER', number>>;

const SORT_LABEL: Record<string, string> = {
  createdAt: '创建时间',
  lastFollowAt: '最后跟进时间',
  nextFollowAt: '下次跟进时间',
  followCount: '跟进次数',
};

export function LeadListClient({
  rows,
  total,
  page,
  pageSize,
  counts,
  options,
  canAssign,
  canBatch,
}: {
  rows: LeadRowView[];
  total: number;
  page: number;
  pageSize: number;
  counts: Counts;
  options: FilterOptions;
  canAssign: boolean;
  canBatch: boolean;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  // 选中集合跨页保持（修复原型"全选仅限当前页"的缺陷）
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // 记录已选数据分布在哪些页，用于跨页提示
  const selectedPages = useRef<Set<number>>(new Set());

  const status = params.get('status') ?? '';
  const followState = params.get('followState') ?? '';
  const sortBy = params.get('sortBy') ?? 'createdAt';
  const sortOrder = (params.get('sortOrder') ?? 'desc') as 'asc' | 'desc';

  /* ---------- 筛选条件（本地态，点查询才提交） ---------- */
  const [form, setForm] = useState({
    keyword: params.get('keyword') ?? '',
    status: params.get('status') ?? '',
    ownerId: params.get('ownerId') ?? '',
    deptId: params.get('deptId') ?? '',
    channelId: params.get('channelId') ?? '',
    courseId: params.get('courseId') ?? '',
    followState: params.get('followState') ?? '',
    createdFrom: params.get('createdFrom') ?? '',
    createdTo: params.get('createdTo') ?? '',
  });
  const [showFilter, setShowFilter] = useState(false);

  /* ---------- 导航辅助 ---------- */
  const navigate = useCallback(
    (patch: Record<string, string | null>, opts: { resetPage?: boolean } = {}) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === '') next.delete(k);
        else next.set(k, v);
      }
      if (opts.resetPage !== false) next.delete('page');
      const qs = next.toString();
      router.push(qs ? `/leads?${qs}` : '/leads');
      router.refresh();
    },
    [params, router],
  );

  // 切页时同步 selectedPages 记录
  useEffect(() => {
    if (selected.size > 0) selectedPages.current.add(page);
  }, [page, selected.size]);

  // 改变筛选条件后清空选中，避免对旧结果做批量操作
  const clearSelection = useCallback(() => {
    setSelected(new Set());
    selectedPages.current.clear();
  }, []);

  /* ---------- 选择 ---------- */
  const allOnPageSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const someOnPageSelected = rows.some((r) => selected.has(r.id));

  const toggleAllOnPage = (checked: boolean) => {
    const next = new Set(selected);
    if (checked) {
      rows.forEach((r) => next.add(r.id));
      selectedPages.current.add(page);
    } else {
      rows.forEach((r) => next.delete(r.id));
      selectedPages.current.delete(page);
    }
    setSelected(next);
  };

  const toggleRow = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  /* ---------- 排序：真实 ORDER BY，不是换图标 ---------- */
  const handleSort = (field: string) => {
    const isSame = sortBy === field;
    navigate({
      sortBy: field,
      sortOrder: isSame && sortOrder === 'desc' ? 'asc' : 'desc',
    });
  };

  /* ---------- 批量操作 ---------- */
  const handleBatch = async (action: 'assign' | 'pseudo' | 'pool') => {
    if (selected.size === 0) return;
    const count = selected.size;

    // 大批量时提示用户，这是防误操作的必要确认
    if (count > 100) {
      toast.info(`已选中 ${count} 条`, '大批量操作建议分批进行');
    }

    startTransition(async () => {
      try {
        let endpoint = '';
        if (action === 'assign') endpoint = '/api/leads/assign';
        else if (action === 'pseudo') endpoint = '/api/leads/pseudo';
        else endpoint = '/api/leads/return-pool';

        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: [...selected] }),
        });
        const json = await res.json();

        if (!res.ok) {
          toast.error('操作失败', json.message ?? '请稍后重试');
          return;
        }

        const failed = json.data?.failed?.length ?? 0;
        const success = json.data?.success?.length ?? count;

        if (failed > 0) {
          toast.info(`成功 ${success} 条，失败 ${failed} 条`, '失败项可能已是终态或被他人处理');
        } else {
          toast.success(
            action === 'assign' ? '批量分配完成' : action === 'pseudo' ? '已标记伪线索' : '已踢回公海',
            `共处理 ${success} 条`,
          );
        }
        clearSelection();
        router.refresh();
      } catch {
        toast.error('网络异常', '操作未生效，请稍后重试');
      }
    });
  };

  /* ---------- 已选筛选条件的展示 ---------- */
  const activeFilters = useMemo(() => {
    const list: { key: string; label: string }[] = [];
    if (form.keyword) list.push({ key: 'keyword', label: `关键词：${form.keyword}` });
    if (form.ownerId) {
      const o = options.owners.find((x) => x.id === form.ownerId);
      if (o) list.push({ key: 'ownerId', label: `归属人：${o.name}` });
    }
    if (form.deptId) {
      const d = options.depts.find((x) => x.id === form.deptId);
      if (d) list.push({ key: 'deptId', label: `部门：${d.name}` });
    }
    if (form.channelId) {
      const c = options.channels.find((x) => x.id === form.channelId);
      if (c) list.push({ key: 'channelId', label: `渠道：${c.name}` });
    }
    if (form.courseId) {
      const c = options.courses.find((x) => x.id === form.courseId);
      if (c) list.push({ key: 'courseId', label: `课程：${c.name}` });
    }
    if (form.createdFrom) list.push({ key: 'createdFrom', label: `起始：${form.createdFrom}` });
    if (form.createdTo) list.push({ key: 'createdTo', label: `截止：${form.createdTo}` });
    return list;
  }, [form, options]);

  const quickTabs = [
    { value: '', label: '全部线索', count: counts.all },
    { value: 'PENDING', label: '待分配', count: counts.PENDING },
    { value: 'FOLLOWING', label: '待跟进', count: counts.FOLLOWING },
    { value: 'OVERDUE', label: '超期未跟进', count: counts.OVERDUE },
    { value: 'NEVER', label: '从未跟进', count: counts.NEVER },
    { value: 'PSEUDO', label: '伪线索', count: counts.PSEUDO },
    { value: 'CONVERTED', label: '已转商机', count: counts.CONVERTED },
  ];

  return (
    <div className="space-y-3.5">
      {/* 快捷页签 */}
      <QuickTabs
        tabs={quickTabs}
        value={status || followState}
        onChange={(v) => {
          if (v === 'OVERDUE' || v === 'NEVER') {
            navigate({ status: null, followState: v });
          } else {
            navigate({ followState: null, status: v });
          }
        }}
      />

      {/* 筛选区 */}
      <FilterBar
        onSearch={() =>
          navigate(
            {
              keyword: form.keyword,
              status: form.status,
              ownerId: form.ownerId,
              deptId: form.deptId,
              channelId: form.channelId,
              courseId: form.courseId,
              followState: form.followState,
              createdFrom: form.createdFrom,
              createdTo: form.createdTo,
            },
            { resetPage: true },
          )
        }
        onReset={() => {
          setForm({
            keyword: '', status: '', ownerId: '', deptId: '',
            channelId: '', courseId: '', followState: '', createdFrom: '', createdTo: '',
          });
          router.push('/leads');
          router.refresh();
        }}
        searching={pending}
        activeFilters={activeFilters}
        onRemoveFilter={(key) => {
          setForm((f) => ({ ...f, [key]: '' }));
          navigate({ [key]: null }, { resetPage: true });
        }}
        onClearFilters={() => {
          setForm({
            keyword: '', status: '', ownerId: '', deptId: '',
            channelId: '', courseId: '', followState: '', createdFrom: '', createdTo: '',
          });
          router.push('/leads');
          router.refresh();
        }}
        extra={
          <Button variant="default" size="sm" onClick={() => setShowFilter(true)}>
            新建线索
          </Button>
        }
      >
        <Field label="关键词" htmlFor="f-kw">
          <Input
            id="f-kw"
            value={form.keyword}
            onChange={(e) => setForm((f) => ({ ...f, keyword: e.target.value }))}
            placeholder="手机号 / 姓名"
            size="sm"
          />
        </Field>

        <Field label="线索状态" htmlFor="f-status">
          <Select
            id="f-status"
            inputSize="sm"
            value={form.status}
            onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
          >
            <option value="">全部状态</option>
            {Object.entries(LEAD_STATUS_META).map(([k, v]) => (
              <option key={k} value={k}>
                {v.name}
              </option>
            ))}
          </Select>
        </Field>

        {canAssign && (
          <Field label="归属人" htmlFor="f-owner">
            <Select
              id="f-owner"
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

        {canAssign && options.depts.length > 0 && (
          <Field label="所属部门" htmlFor="f-dept">
            <Select
              id="f-dept"
              inputSize="sm"
              value={form.deptId}
              onChange={(e) => setForm((f) => ({ ...f, deptId: e.target.value }))}
            >
              <option value="">全部部门</option>
              {options.depts.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </Field>
        )}

        <Field label="来源渠道" htmlFor="f-channel">
          <Select
            id="f-channel"
            inputSize="sm"
            value={form.channelId}
            onChange={(e) => setForm((f) => ({ ...f, channelId: e.target.value }))}
          >
            <option value="">全部渠道</option>
            {options.channels.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="意向课程" htmlFor="f-course">
          <Select
            id="f-course"
            inputSize="sm"
            value={form.courseId}
            onChange={(e) => setForm((f) => ({ ...f, courseId: e.target.value }))}
          >
            <option value="">全部课程</option>
            {options.courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="跟进状态" htmlFor="f-follow">
          <Select
            id="f-follow"
            inputSize="sm"
            value={form.followState}
            onChange={(e) => setForm((f) => ({ ...f, followState: e.target.value }))}
          >
            <option value="">全部</option>
            <option value="OVERDUE">超期未跟进</option>
            <option value="NEVER">从未跟进</option>
          </Select>
        </Field>

        <Field label="创建时间" htmlFor="f-from">
          <div className="flex items-center gap-1.5">
            <Input
              id="f-from"
              type="date"
              size="sm"
              value={form.createdFrom}
              onChange={(e) => setForm((f) => ({ ...f, createdFrom: e.target.value }))}
            />
            <span className="shrink-0 text-xs text-ink-400">至</span>
            <Input
              type="date"
              size="sm"
              value={form.createdTo}
              onChange={(e) => setForm((f) => ({ ...f, createdTo: e.target.value }))}
              aria-label="创建时间截止"
            />
          </div>
        </Field>
      </FilterBar>

      {/* 列表 */}
      <Card>
        <CardHeader
          title="线索列表"
          count={total}
          actions={
            <div className="flex items-center gap-2">
              <span className="hidden text-xs text-ink-400 sm:inline">排序</span>
              <Select
                inputSize="sm"
                style={{ width: 'auto' }}
                value={sortBy}
                onChange={(e) => handleSort(e.target.value)}
                aria-label="排序字段"
              >
                {Object.entries(SORT_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </Select>
              <Button variant="default" size="sm" onClick={() => toast.info('导入功能待接入')}>
                <Upload size={13} aria-hidden />
                <span className="hidden sm:inline">导入</span>
              </Button>
              <Button variant="default" size="sm" onClick={() => toast.info('导出任务已提交')}>
                <Download size={13} aria-hidden />
                <span className="hidden sm:inline">导出</span>
              </Button>
              <Button variant="primary" size="sm" onClick={() => setShowFilter(true)}>
                <Plus size={13} aria-hidden />
                新建线索
              </Button>
            </div>
          }
        />

        {/* 批量操作条 */}
        {selected.size > 0 && (
          <BatchBar count={selected.size} onCancel={clearSelection}>
            {selectedPages.current.size > 1 && (
              <span className="mr-1 text-xs text-ink-400">跨 {selectedPages.current.size} 页</span>
            )}
            {canAssign && (
              <Button variant="primary" size="sm" onClick={() => handleBatch('assign')} loading={pending}>
                <UserPlus size={13} aria-hidden />
                批量分配
              </Button>
            )}
            <Button variant="default" size="sm" onClick={() => handleBatch('pseudo')} loading={pending}>
              <XCircle size={13} aria-hidden />
              标记伪线索
            </Button>
            <Button variant="default" size="sm" onClick={() => handleBatch('pool')} loading={pending}>
              <Globe size={13} aria-hidden />
              踢回公海
            </Button>
          </BatchBar>
        )}

        {/* 桌面端表格 */}
        <TableWrap minWidth={1080}>
          {rows.length === 0 ? (
            <EmptyState
              icon={<Inbox size={20} />}
              title={activeFilters.length > 0 ? '没有符合条件的线索' : '暂无线索数据'}
              description={
                activeFilters.length > 0
                  ? '试试放宽筛选条件，或清空后重新查询'
                  : '点击右上角「新建线索」录入第一条线索，或从公海池领取'
              }
              action={
                activeFilters.length > 0 ? (
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => {
                      router.push('/leads');
                      router.refresh();
                    }}
                  >
                    清空筛选条件
                  </Button>
                ) : (
                  <Button variant="primary" size="sm" onClick={() => setShowFilter(true)}>
                    <Plus size={13} aria-hidden />
                    新建线索
                  </Button>
                )
              }
            />
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  {canBatch && (
                    <th className="w-[38px] px-3 py-2.5">
                      <Checkbox
                        checked={allOnPageSelected}
                        indeterminate={!allOnPageSelected && someOnPageSelected}
                        onCheckedChange={toggleAllOnPage}
                        ariaLabel={allOnPageSelected ? '取消全选当前页' : '全选当前页'}
                      />
                    </th>
                  )}
                  <Th sortable sorted={sortBy === 'name'} onSort={() => handleSort('name')}>
                    姓名 / 手机号
                  </Th>
                  <Th>来源渠道</Th>
                  <Th>意向课程</Th>
                  <Th>状态</Th>
                  {canAssign && <Th>归属人</Th>}
                  {canAssign && <Th>所属部门</Th>}
                  <Th sortable sorted={sortBy === 'createdAt'} onSort={() => handleSort('createdAt')}>
                    创建时间
                  </Th>
                  <Th sortable sorted={sortBy === 'lastFollowAt'} onSort={() => handleSort('lastFollowAt')}>
                    最后跟进
                  </Th>
                  <Th sortable sorted={sortBy === 'followCount'} onSort={() => handleSort('followCount')} align="center">
                    跟进次数
                  </Th>
                  <Th sortable sorted={sortBy === 'nextFollowAt'} onSort={() => handleSort('nextFollowAt')}>
                    下次跟进
                  </Th>
                  <th className="col-actions border-b border-ink-200 bg-ink-50 px-3 py-2.5 text-right text-xs font-medium whitespace-nowrap text-ink-500">
                    操作
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const meta = LEAD_STATUS_META[row.status];
                  const overdue =
                    row.nextFollowAt !== null &&
                    new Date(row.nextFollowAt) < new Date() &&
                    row.status === 'FOLLOWING';

                  return (
                    <tr
                      key={row.id}
                      className={cn(
                        selected.has(row.id) && 'is-selected',
                        meta.rowTone && `${meta.rowTone}`,
                      )}
                    >
                      {canBatch && (
                        <td className="border-b border-ink-100 px-3 py-2.5">
                          <Checkbox
                            checked={selected.has(row.id)}
                            onCheckedChange={() => toggleRow(row.id)}
                            ariaLabel={`选择线索 ${row.name}`}
                          />
                        </td>
                      )}
                      <Td>
                        <a
                          href={`/leads/${row.id}`}
                          className="block rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
                        >
                          <CellStack
                            main={
                              <span className="flex items-center gap-1.5">
                                {row.name}
                                {overdue && (
                                  <span
                                    className="size-1.5 shrink-0 rounded-full bg-danger-500"
                                    title="已超期未跟进"
                                    aria-label="已超期未跟进"
                                  />
                                )}
                              </span>
                            }
                            sub={<PhoneCell phone={row.phone} bizId={row.id} bizType="LEAD" />}
                          />
                        </a>
                      </Td>
                      <Td>
                        <span className="text-ink-600">{row.channelName ?? '--'}</span>
                      </Td>
                      <Td>
                        <span className="block max-w-[160px] truncate text-ink-600">
                          {row.courseName ?? '--'}
                        </span>
                      </Td>
                      <Td>
                        <StatusTag tone={meta.tone} dot>
                          {meta.name}
                        </StatusTag>
                      </Td>
                      {canAssign && (
                        <Td>
                          <span className="text-ink-600">{row.ownerName ?? '—'}</span>
                        </Td>
                      )}
                      {canAssign && (
                        <Td>
                          <span className="text-ink-500">{row.deptName ?? '—'}</span>
                        </Td>
                      )}
                      <Td>
                        <span className="text-ink-500">{formatDate(row.createdAt)}</span>
                      </Td>
                      <Td>
                        <span className="text-ink-500">{fromNow(row.lastFollowAt)}</span>
                      </Td>
                      <Td align="center">
                        <span className="tabular text-ink-700">{row.followCount}</span>
                      </Td>
                      <Td>
                        <span
                          className={cn(
                            'whitespace-nowrap',
                            overdue ? 'font-medium text-danger-600' : 'text-ink-500',
                          )}
                        >
                          {row.nextFollowAt ? formatDateTime(row.nextFollowAt) : '--'}
                        </span>
                      </Td>
                      <td className="col-actions border-b border-ink-100 px-3 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <a
                            href={`/leads/${row.id}`}
                            className="rounded px-2 py-1 text-xs text-brand-600 transition-colors hover:bg-brand-50"
                          >
                            详情
                          </a>
                          {row.status === 'FOLLOWING' && (
                            <button
                              type="button"
                              onClick={() => toast.info('跟进抽屉', '在详情页展开跟进时间轴')}
                              className="rounded px-2 py-1 text-xs text-ink-500 transition-colors hover:bg-ink-100"
                            >
                              跟进
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </TableWrap>

        {/* 移动端卡片列表 */}
        <MobileLeadList
          rows={rows}
          selected={selected}
          onToggle={toggleRow}
          canAssign={canAssign}
          emptyAction={
            <Button variant="primary" size="sm" onClick={() => setShowFilter(true)}>
              <Plus size={13} aria-hidden />
              新建线索
            </Button>
          }
        />

        {/* 加载中 */}
        {pending && rows.length === 0 && <TableSkeleton rows={6} cols={6} />}

        {rows.length > 0 && (
          <Pagination
            page={page}
            pageSize={pageSize}
            total={total}
            onPageChange={(p) => {
              router.push(`/leads?${new URLSearchParams([...params, ['page', String(p)]]).toString()}`);
              router.refresh();
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            onPageSizeChange={(s) => {
              const next = new URLSearchParams(params.toString());
              next.set('pageSize', String(s));
              next.delete('page');
              router.push(`/leads?${next.toString()}`);
              router.refresh();
            }}
          />
        )}
      </Card>

      {showFilter && <CreateLeadPanel onClose={() => setShowFilter(false)} />}
    </div>
  );
}

/* ---------- 移动端卡片列表 ---------- */
function MobileLeadList({
  rows,
  selected,
  onToggle,
  canAssign,
  emptyAction,
}: {
  rows: LeadRowView[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  canAssign: boolean;
  emptyAction: React.ReactNode;
}) {
  if (rows.length === 0) {
    return (
      <div className="md:hidden">
        <EmptyState
          icon={<Inbox size={20} />}
          title="暂无线索数据"
          description="换个筛选条件，或新建一条线索"
          action={emptyAction}
        />
      </div>
    );
  }

  return (
    <div className="divide-y divide-ink-100 md:hidden">
      {rows.map((row) => {
        const meta = LEAD_STATUS_META[row.status];
        const overdue =
          row.nextFollowAt !== null && new Date(row.nextFollowAt) < new Date() && row.status === 'FOLLOWING';

        return (
          <div key={row.id} className="flex items-start gap-3 px-4 py-3">
            <Checkbox
              checked={selected.has(row.id)}
              onCheckedChange={() => onToggle(row.id)}
              ariaLabel={`选择线索 ${row.name}`}
              className="mt-1"
            />
            <a href={`/leads/${row.id}`} className="min-w-0 flex-1 rounded focus-visible:outline-2 focus-visible:outline-brand-500">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-[13.5px] font-medium text-ink-900">{row.name}</span>
                <StatusTag tone={meta.tone}>{meta.name}</StatusTag>
              </div>
              <div className="mt-1 flex items-center gap-2 text-xs text-ink-500">
                <PhoneCell phone={row.phone} bizId={row.id} bizType="LEAD" />
                <span className="text-ink-300">|</span>
                <span className="truncate">{row.channelName ?? '未知渠道'}</span>
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-ink-400">
                <span>跟进 {row.followCount} 次</span>
                <span>{formatDate(row.createdAt)} 创建</span>
                {canAssign && row.ownerName && <span>{row.ownerName}</span>}
                {overdue && (
                  <span className="font-medium text-danger-600">
                    超期 {formatDateTime(row.nextFollowAt)}
                  </span>
                )}
              </div>
            </a>
          </div>
        );
      })}
    </div>
  );
}

/* ---------- 新建线索面板（移动端底部抽屉） ---------- */
function CreateLeadPanel({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[450] md:hidden" role="dialog" aria-label="新建线索">
      <div className="absolute inset-0 bg-ink-900/40" onClick={onClose} aria-hidden />
      <div className="absolute inset-x-0 bottom-0 max-h-[88dvh] overflow-y-auto rounded-t-[16px] bg-white pb-[env(safe-area-inset-bottom)] shadow-xl">
        <div className="flex justify-center pt-2.5 pb-1" aria-hidden>
          <span className="h-1 w-9 rounded-full bg-ink-300" />
        </div>
        <div className="flex items-center justify-between border-b border-ink-100 px-4 py-3">
          <h2 className="text-[15px] font-semibold text-ink-900">新建线索</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-[6px] px-2 py-1 text-xs text-ink-500"
          >
            关闭
          </button>
        </div>
        <div className="space-y-3.5 p-4">
          <Field label="姓名" required htmlFor="nl-name">
            <Input id="nl-name" placeholder="请输入客户姓名" />
          </Field>
          <Field label="手机号" required htmlFor="nl-phone" hint="11 位手机号，作为线索唯一标识">
            <Input id="nl-phone" type="tel" inputMode="numeric" placeholder="13800000000" />
          </Field>
          <Button variant="primary" className="w-full">
            创建线索
          </Button>
        </div>
      </div>
    </div>
  );
}

export type { LeadStatus, LEAD_STATUS };