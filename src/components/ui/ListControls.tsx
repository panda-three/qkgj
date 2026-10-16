'use client';

import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import { Check, ChevronDown, ChevronLeft, ChevronRight, Filter, X } from 'lucide-react';
import * as React from 'react';
import { useId } from 'react';
import { cn } from '@/lib/utils/cn';
import { Button } from './Button';

/* ---------- 复选框 ---------- */
export function Checkbox({
  checked,
  onCheckedChange,
  disabled,
  indeterminate,
  ariaLabel,
  className,
}: {
  checked?: boolean | 'indeterminate';
  onCheckedChange?: (v: boolean) => void;
  disabled?: boolean;
  indeterminate?: boolean;
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <CheckboxPrimitive.Root
      checked={indeterminate ? 'indeterminate' : checked}
      onCheckedChange={(v) => onCheckedChange?.(v === true)}
      disabled={disabled}
      aria-label={ariaLabel}
      className={cn(
        'peer size-[15px] shrink-0 rounded-[3px] border transition-colors',
        'data-[state=checked]:border-brand-500 data-[state=checked]:bg-brand-500',
        'data-[state=indeterminate]:border-brand-500 data-[state=indeterminate]:bg-brand-500',
        'border-ink-300 hover:border-brand-400',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500',
        'disabled:cursor-not-allowed disabled:opacity-40',
        className,
      )}
    >
      <CheckboxPrimitive.Indicator className="flex items-center justify-center text-white">
        {indeterminate ? (
          <span className="h-[1.5px] w-2 bg-white rounded-full" />
        ) : (
          <Check size={11} strokeWidth={3} />
        )}
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

/* ---------- 快捷筛选页签 ---------- */
export type QuickTab = { value: string; label: string; count?: number; tone?: 'danger' | 'warning' };

export function QuickTabs({
  tabs,
  value,
  onChange,
  className,
}: {
  tabs: QuickTab[];
  value: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        // 移动端横向滚动，避免页签换行撑破布局
        'scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0',
        className,
      )}
      role="tablist"
      aria-label="快捷筛选"
    >
      {tabs.map((t) => {
        const active = value === t.value;
        return (
          <button
            key={t.value || 'all'}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.value)}
            className={cn(
              'flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] whitespace-nowrap',
              'transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500',
              active
                ? 'border-brand-500 bg-brand-500 font-medium text-white'
                : 'border-ink-200 bg-white text-ink-600 hover:border-brand-300 hover:text-brand-600',
            )}
          >
            {t.label}
            {t.count !== undefined && (
              <span
                className={cn(
                  'tabular rounded-full px-1.5 py-px text-[11px]',
                  active ? 'bg-white/25 text-white' : 'bg-ink-100 text-ink-500',
                )}
              >
                {t.count.toLocaleString('zh-CN')}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/* ---------- 筛选区 ---------- */
export function FilterBar({
  children,
  onSearch,
  onReset,
  searching = false,
  extra,
  activeFilters = [],
  onRemoveFilter,
  onClearFilters,
  defaultExpanded = true,
}: {
  children: React.ReactNode;
  onSearch?: () => void;
  onReset?: () => void;
  searching?: boolean;
  extra?: React.ReactNode;
  activeFilters?: { key: string; label: string }[];
  onRemoveFilter?: (key: string) => void;
  onClearFilters?: () => void;
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = React.useState(defaultExpanded);

  return (
    <div className="rounded-[10px] border border-ink-200 bg-white shadow-xs">
      <div className="p-4">
        <div
          className={cn(
            'grid gap-x-4 gap-y-3.5 transition-[grid-template-rows,opacity]',
            expanded
              ? 'grid-rows-[1fr] opacity-100'
              : 'grid-rows-[0fr] overflow-hidden opacity-0',
          )}
        >
          <div className="min-h-0">
            <div className="grid grid-cols-1 gap-x-4 gap-y-3.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {children}
            </div>
          </div>
        </div>

        <div className="mt-3.5 flex flex-wrap items-center gap-2">
          {expanded && onSearch && (
            <Button variant="primary" size="sm" onClick={onSearch} loading={searching}>
              查询
            </Button>
          )}
          {expanded && onReset && (
            <Button variant="default" size="sm" onClick={onReset}>
              重置
            </Button>
          )}
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="inline-flex items-center gap-1 rounded px-1 text-xs text-ink-500 transition-colors hover:text-brand-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
            aria-expanded={expanded}
          >
            <Filter size={12} aria-hidden />
            {expanded ? '收起筛选' : '展开筛选'}
            <ChevronDown
              size={12}
              className={cn('transition-transform', expanded && 'rotate-180')}
              aria-hidden
            />
          </button>
          {extra && <div className="ml-auto flex items-center gap-2">{extra}</div>}
        </div>

        {activeFilters.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-ink-100 pt-3">
            <span className="text-xs text-ink-400">已选条件</span>
            {activeFilters.map((f) => (
              <span
                key={f.key}
                className="inline-flex items-center gap-1 rounded-full bg-brand-50 py-0.5 pr-1 pl-2 text-xs text-brand-700"
              >
                {f.label}
                {onRemoveFilter && (
                  <button
                    type="button"
                    onClick={() => onRemoveFilter(f.key)}
                    className="flex size-4 items-center justify-center rounded-full transition-colors hover:bg-brand-100 focus-visible:outline-2 focus-visible:outline-brand-500"
                    aria-label={`移除筛选条件 ${f.label}`}
                  >
                    <X size={10} />
                  </button>
                )}
              </span>
            ))}
            {onClearFilters && (
              <button
                type="button"
                onClick={onClearFilters}
                className="ml-1 text-xs text-ink-400 underline-offset-2 transition-colors hover:text-danger-600 hover:underline"
              >
                清空
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- 批量操作条 ---------- */
export function BatchBar({
  count,
  onCancel,
  children,
}: {
  count: number;
  onCancel: () => void;
  children?: React.ReactNode;
}) {
  const labelId = useId();
  return (
    <div
      className="flex flex-wrap items-center gap-2 border-b border-brand-100 bg-brand-50 px-4 py-2.5 animate-[batchIn_180ms_cubic-bezier(0.16,1,0.3,1)]"
      role="region"
      aria-labelledby={labelId}
    >
      <span id={labelId} className="text-[13px] text-ink-700">
        已选择 <strong className="tabular font-semibold text-brand-700">{count}</strong> 项
      </span>
      <div className="ml-auto flex flex-wrap items-center gap-1.5">{children}</div>
      <button
        type="button"
        onClick={onCancel}
        className="rounded px-2 py-1 text-xs text-ink-500 transition-colors hover:bg-brand-100 hover:text-ink-700 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-500"
      >
        取消选择
      </button>
      <style>{`@keyframes batchIn { from { opacity:0; transform: translateY(-4px) } to { opacity:1; transform:none } }`}</style>
    </div>
  );
}

/* ---------- 分页 ---------- */
export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  className,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (p: number) => void;
  onPageSizeChange?: (s: number) => void;
  className?: string;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  // 页码窗口：当前页前后各 2 页，首尾页固定
  const pages: (number | 'gap')[] = [];
  for (let i = 1; i <= totalPages; i += 1) {
    if (i === 1 || i === totalPages || Math.abs(i - page) <= 1) {
      pages.push(i);
    } else if (pages[pages.length - 1] !== 'gap') {
      pages.push('gap');
    }
  }

  return (
    <div
      className={cn(
        'flex flex-col gap-2.5 border-t border-ink-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between',
        className,
      )}
    >
      <span className="text-xs text-ink-400">
        {total === 0 ? '暂无数据' : `第 ${from} - ${to} 条，共 ${total.toLocaleString('zh-CN')} 条`}
      </span>

      <div className="flex items-center gap-3">
        {onPageSizeChange && (
          <label className="hidden items-center gap-1.5 text-xs text-ink-500 sm:flex">
            每页
            <select
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              className="h-[28px] rounded-[6px] border border-ink-200 bg-white px-1.5 text-xs focus:border-brand-400 focus:outline-none"
            >
              {[20, 50, 100].map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            条
          </label>
        )}

        <nav className="flex items-center gap-1" aria-label="分页导航">
          <button
            type="button"
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            className="flex size-7 items-center justify-center rounded-[6px] border border-ink-200 text-ink-600 transition-colors hover:bg-ink-50 disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-500"
            aria-label="上一页"
          >
            <ChevronLeft size={14} />
          </button>

          {pages.map((p, i) =>
            p === 'gap' ? (
              <span key={`gap-${i}`} className="px-0.5 text-xs text-ink-400" aria-hidden>
                …
              </span>
            ) : (
              <button
                key={p}
                type="button"
                onClick={() => onPageChange(p)}
                aria-current={p === page ? 'page' : undefined}
                className={cn(
                  'tabular flex size-7 items-center justify-center rounded-[6px] text-xs transition-colors',
                  'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-500',
                  p === page
                    ? 'bg-brand-500 font-medium text-white'
                    : 'border border-ink-200 text-ink-600 hover:bg-ink-50',
                )}
              >
                {p}
              </button>
            ),
          )}

          <button
            type="button"
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
            className="flex size-7 items-center justify-center rounded-[6px] border border-ink-200 text-ink-600 transition-colors hover:bg-ink-50 disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-500"
            aria-label="下一页"
          >
            <ChevronRight size={14} />
          </button>
        </nav>
      </div>
    </div>
  );
}