import { cn } from '@/lib/utils/cn';

/**
 * 卡片容器
 * 对应原型的 .card：白底 + 细边框 + 轻阴影 + 统一圆角。
 */

export function Card({
  children,
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('rounded-[10px] border border-ink-200 bg-white shadow-xs', className)}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  description,
  count,
  actions,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  count?: number;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex min-h-[52px] flex-wrap items-center justify-between gap-3 border-b border-ink-100 px-4 py-3',
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <span className="h-3.5 w-[3px] shrink-0 rounded-sm bg-brand-500" aria-hidden />
        <h2 className="truncate text-sm font-medium text-ink-900">{title}</h2>
        {count !== undefined && (
          <span className="tabular shrink-0 text-xs text-ink-400">
            共 {count.toLocaleString('zh-CN')} 条
          </span>
        )}
        {description && <span className="truncate text-xs text-ink-400">{description}</span>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

export function CardBody({
  children,
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('p-4', className)} {...props}>
      {children}
    </div>
  );
}

/**
 * 页头
 * 移动端标题与操作按钮改为上下堆叠，按钮横向铺满，避免挤压标题。
 */
export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between', className)}>
      <div className="min-w-0">
        <h1 className="text-[19px] font-semibold text-ink-900 sm:text-[21px]">{title}</h1>
        {description && (
          <p className="mt-1 text-[13px] leading-relaxed text-ink-500">{description}</p>
        )}
      </div>
      {actions && (
        <div className="flex shrink-0 flex-wrap items-center gap-2 [&>*]:flex-1 sm:[&>*]:flex-none">
          {actions}
        </div>
      )}
    </div>
  );
}

/**
 * 表格容器
 *
 * 响应式关键：移动端不做横向滚动（表格列太多会挤爆），
 * 改为由各页面用 CardLeadList 渲染卡片式列表。
 * 这里只负责桌面端的横向滚动。
 */
export function TableWrap({
  children,
  className,
  minWidth = 1080,
}: {
  children: React.ReactNode;
  className?: string;
  minWidth?: number;
}) {
  return (
    <div className={cn('hidden overflow-x-auto md:block', className)}>
      <div style={{ minWidth }} className="w-full">
        {children}
      </div>
    </div>
  );
}

/** 表头单元格，支持排序按钮 */
export function Th({
  children,
  sortable = false,
  sorted = false,
  onSort,
  align = 'left',
  className,
  ...props
}: Omit<React.ThHTMLAttributes<HTMLTableCellElement>, 'align'> & {
  sortable?: boolean;
  sorted?: boolean;
  onSort?: () => void;
  align?: 'left' | 'right' | 'center';
}) {
  return (
    <th
      className={cn(
        'border-b border-ink-200 bg-ink-50 px-3 py-2.5 text-xs font-medium whitespace-nowrap text-ink-500',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        className,
      )}
      aria-sort={sorted ? 'descending' : sortable ? 'none' : undefined}
      {...props}
    >
      {sortable ? (
        <button
          type="button"
          onClick={onSort}
          className={cn(
            'inline-flex items-center gap-1 rounded transition-colors hover:text-ink-800',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500',
            align === 'right' && 'flex-row-reverse',
          )}
        >
          {children}
          <span className="flex flex-col gap-px" aria-hidden>
            <svg width="6" height="4" viewBox="0 0 6 4" className={sorted ? 'text-brand-500' : 'text-ink-300'}>
              <path d="M1 3.5L3 1.5L5 3.5" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round" />
            </svg>
            <svg width="6" height="4" viewBox="0 0 6 4" className={sorted ? 'text-brand-500' : 'text-ink-300'}>
              <path d="M1 0.5L3 2.5L5 0.5" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round" />
            </svg>
          </span>
        </button>
      ) : (
        children
      )}
    </th>
  );
}

export function Td({
  children,
  align = 'left',
  className,
  ...props
}: Omit<React.TdHTMLAttributes<HTMLTableCellElement>, 'align'> & {
  align?: 'left' | 'right' | 'center';
}) {
  return (
    <td
      className={cn(
        'border-b border-ink-100 px-3 py-2.5 text-[13px] text-ink-700',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        className,
      )}
      {...props}
    >
      {children}
    </td>
  );
}

/** 表格内主/副两行文本 */
export function CellStack({ main, sub }: { main: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="cell-main truncate">{main}</div>
      {sub && <div className="cell-sub truncate">{sub}</div>}
    </div>
  );
}