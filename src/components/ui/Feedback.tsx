import { cn } from '@/lib/utils/cn';

/**
 * 状态占位组件
 *
 * 设计原则：
 * · 空态要说明「为什么空」并给出下一步动作，而不是只画个灰框
 * · 骨架屏用 shimmer 只动 transform/opacity，属 GPU 属性，不触发重排
 * · 所有状态容器加 role 与 aria-live，读屏器能感知内容变化
 */

/* ---------- 加载骨架 ---------- */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn('relative overflow-hidden rounded bg-ink-100', className)}
      aria-hidden
    >
      <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.6s_infinite] bg-gradient-to-r from-transparent via-white/70 to-transparent" />
      <style>{`@keyframes shimmer { 100% { transform: translateX(100%); } }`}</style>
    </div>
  );
}

/** 表格行骨架，列数与真实表格对齐，避免加载完成时布局跳动 */
export function TableSkeleton({ rows = 8, cols = 6 }: { rows?: number; cols?: number }) {
  return (
    <div role="status" aria-label="加载中">
      <span className="sr-only">正在加载数据</span>
      <div className="divide-y divide-ink-100">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="flex items-center gap-4 px-4 py-3">
            {Array.from({ length: cols }).map((_, c) => (
              <Skeleton
                key={c}
                className={cn('h-3.5', c === 0 ? 'w-32' : c === cols - 1 ? 'w-16' : 'flex-1')}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** 卡片骨架 */
export function CardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('rounded-[10px] border border-ink-200 bg-white p-[18px]', className)}>
      <Skeleton className="mb-4 h-4 w-1/3" />
      <div className="space-y-2.5">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-4/5" />
        <Skeleton className="h-3 w-2/3" />
      </div>
    </div>
  );
}

/* ---------- 空状态 ---------- */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn('flex flex-col items-center justify-center px-6 py-14 text-center', className)}
      role="status"
    >
      {icon && (
        <div
          className="mb-3 flex size-11 items-center justify-center rounded-full bg-ink-100 text-ink-400"
          aria-hidden
        >
          {icon}
        </div>
      )}
      <p className="text-[13.5px] font-medium text-ink-700">{title}</p>
      {description && (
        <p className="mt-1.5 max-w-[42ch] text-xs leading-relaxed text-ink-400">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/* ---------- 错误状态 ---------- */
export function ErrorState({
  title = '加载失败',
  description,
  onRetry,
  className,
}: {
  title?: string;
  description?: React.ReactNode;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center px-6 py-12 text-center', className)} role="alert">
      <div
        className="mb-3 flex size-11 items-center justify-center rounded-full bg-danger-50 text-danger-500"
        aria-hidden
      >
        <svg viewBox="0 0 20 20" className="size-5" fill="none">
          <path
            d="M10 6v5m0 2.5h.01M10 2.5L2.5 16h15L10 2.5z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <p className="text-[13.5px] font-medium text-ink-800">{title}</p>
      {description && <p className="mt-1.5 max-w-[42ch] text-xs text-ink-500">{description}</p>}
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 rounded-[6px] border border-ink-200 px-3 py-1.5 text-xs font-medium text-ink-700 transition-colors hover:border-ink-300 hover:bg-ink-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
        >
          重新加载
        </button>
      )}
    </div>
  );
}

/* ---------- 无权限 ---------- */
export function ForbiddenState({ message = '当前角色无权查看此数据' }: { message?: string }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center" role="alert">
      <div
        className="mb-3 flex size-11 items-center justify-center rounded-full bg-warning-50 text-warning-500"
        aria-hidden
      >
        <svg viewBox="0 0 20 20" className="size-5" fill="none">
          <rect x="4" y="8.5" width="12" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
          <path d="M7 8.5V6a3 3 0 016 0v2.5" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </div>
      <p className="text-[13.5px] font-medium text-ink-800">无访问权限</p>
      <p className="mt-1.5 text-xs text-ink-500">{message}</p>
    </div>
  );
}