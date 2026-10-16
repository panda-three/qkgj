'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

/**
 * 弹窗
 *
 * 响应式策略（关键）：
 * · 移动端（<640px）自动变为**底部抽屉**——全宽、从下滑入、
 *   最高 92dvh、顶部留出安全区。移动端弹出键盘时不会顶掉输入框。
 * · 桌面端居中显示，最大宽度由 size 控制。
 *
 * 无障碍：Radix Dialog 自带焦点陷阱、ESC 关闭、aria-modal、
 * 关闭后焦点归还触发元素，滚动锁定也已处理。
 */

const SIZES = {
  sm: 'sm:max-w-[420px]',
  md: 'sm:max-w-[560px]',
  lg: 'sm:max-w-[720px]',
  xl: 'sm:max-w-[920px]',
} as const;

export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  size = 'md',
  /** 移动端是否降级为底部抽屉 */
  responsive = true,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: keyof typeof SIZES;
  responsive?: boolean;
  className?: string;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className={cn(
            'fixed inset-0 z-400 bg-ink-900/45',
            'data-[state=open]:animate-[fadeIn_160ms_ease-out]',
            'data-[state=closed]:animate-[fadeOut_160ms_ease-in]',
          )}
        />
        <DialogPrimitive.Content
          className={cn(
            'fixed z-500 bg-white shadow-xl',
            // 移动端：底部抽屉
            responsive &&
              'inset-x-0 bottom-0 max-h-[92dvh] rounded-t-[16px] pb-[env(safe-area-inset-bottom)]',
            'flex flex-col',
            'data-[state=open]:animate-[sheetIn_240ms_cubic-bezier(0.16,1,0.3,1)]',
            'data-[state=closed]:animate-[sheetOut_180ms_ease-in]',
            // 桌面端：居中弹窗
            'sm:inset-auto sm:top-1/2 sm:right-auto sm:bottom-auto sm:left-1/2 sm:max-h-[86dvh]',
            'sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[12px] sm:pb-0',
            'sm:data-[state=open]:animate-[dialogIn_200ms_cubic-bezier(0.16,1,0.3,1)]',
            'sm:data-[state=closed]:animate-[dialogOut_150ms_ease-in]',
            SIZES[size],
            className,
          )}
        >
          {/* 移动端抽屉的拖拽指示条 */}
          {responsive && (
            <div className="flex justify-center pt-2.5 pb-1 sm:hidden" aria-hidden>
              <span className="h-1 w-9 rounded-full bg-ink-300" />
            </div>
          )}

          <div className="flex items-start justify-between gap-4 border-b border-ink-100 px-5 py-3.5">
            <div className="min-w-0">
              <DialogPrimitive.Title className="text-[15px] font-semibold text-ink-900">
                {title}
              </DialogPrimitive.Title>
              {description && (
                <DialogPrimitive.Description className="mt-1 text-xs text-ink-500">
                  {description}
                </DialogPrimitive.Description>
              )}
            </div>
            <DialogPrimitive.Close
              className="-mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-[6px] text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-700 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-500"
              aria-label="关闭"
            >
              <X size={16} />
            </DialogPrimitive.Close>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
            {children}
          </div>

          {footer && (
            <div className="flex items-center justify-end gap-2 border-t border-ink-100 px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:pb-3">
              {footer}
            </div>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>

      <style>{`
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes fadeOut { from { opacity: 1 } to { opacity: 0 } }
        @keyframes sheetIn { from { transform: translateY(100%) } to { transform: translateY(0) } }
        @keyframes sheetOut { from { transform: translateY(0) } to { transform: translateY(100%) } }
        @keyframes dialogIn { from { opacity: 0; transform: translate(-50%,-48%) scale(0.97) } to { opacity: 1; transform: translate(-50%,-50%) scale(1) } }
        @keyframes dialogOut { from { opacity: 1; transform: translate(-50%,-50%) scale(1) } to { opacity: 0; transform: translate(-50%,-50%) scale(0.98) } }
        @media (prefers-reduced-motion: reduce) {
          [data-state] { animation: none !important; }
        }
      `}</style>
    </DialogPrimitive.Root>
  );
}

/**
 * 确认对话框
 * 破坏性操作必须传 danger，走二次确认。
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmText = '确认',
  cancelText = '取消',
  danger = false,
  loading = false,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => void;
}) {
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      size="sm"
      responsive={false}
      footer={
        <>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={loading}
            className="h-[34px] rounded-[6px] border border-ink-200 px-3 text-[13px] font-medium text-ink-700 transition-colors hover:bg-ink-50 disabled:opacity-45 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={cn(
              'h-[34px] rounded-[6px] px-3 text-[13px] font-medium text-white transition-colors disabled:opacity-45',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500',
              danger ? 'bg-danger-500 hover:bg-danger-700' : 'bg-brand-500 hover:bg-brand-600',
            )}
          >
            {loading ? '处理中…' : confirmText}
          </button>
        </>
      }
    >
      <p className="text-[13px] leading-relaxed text-ink-600">{description}</p>
    </Modal>
  );
}