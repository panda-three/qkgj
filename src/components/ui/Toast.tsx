'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

/**
 * 轻提示（Toast）
 *
 * 关键设计：
 * · 用 aria-live="polite" 让读屏器播报，但不打断当前朗读
 * · 移动端从顶部滑入，桌面端右上角，避开拇指热区
 * · 只动 transform/opacity，符合 GPU 动画约束
 * · 尊重 prefers-reduced-motion
 */

type ToastKind = 'success' | 'error' | 'info';

type ToastItem = {
  id: number;
  kind: ToastKind;
  message: string;
  description?: string;
};

type ToastApi = {
  success: (message: string, description?: string) => void;
  error: (message: string, description?: string) => void;
  info: (message: string, description?: string) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

const ICONS = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
} as const;

const TONE = {
  success: 'text-success-500',
  error: 'text-danger-500',
  info: 'text-info-500',
} as const;

let seed = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const [mounted, setMounted] = useState(false);
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => setMounted(true), []);

  const remove = useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const push = useCallback(
    (kind: ToastKind, message: string, description?: string) => {
      seed += 1;
      const id = seed;
      setItems((prev) => [...prev.slice(-2), { id, kind, message, description }]);
      // 错误信息停留更久，用户需要时间阅读
      timers.current.set(id, setTimeout(() => remove(id), kind === 'error' ? 5000 : 3000));
    },
    [remove],
  );

  // 组件卸载时清掉所有定时器，避免内存泄漏
  useEffect(() => {
    const map = timers.current;
    return () => {
      map.forEach((t) => clearTimeout(t));
      map.clear();
    };
  }, []);

  const api = useRef<ToastApi>({
    success: (m, d) => push('success', m, d),
    error: (m, d) => push('error', m, d),
    info: (m, d) => push('info', m, d),
  });
  api.current = {
    success: (m, d) => push('success', m, d),
    error: (m, d) => push('error', m, d),
    info: (m, d) => push('info', m, d),
  };

  if (!mounted) return <>{children}</>;

  return (
    <ToastContext.Provider value={api.current}>
      {children}
      {createPortal(
        <div
          className={cn(
            'pointer-events-none fixed z-[600] flex flex-col gap-2',
            // 移动端：顶部居中，横扫
            'inset-x-3 top-3 items-center',
            // 桌面端：右上角
            'sm:inset-x-auto sm:top-4 sm:right-4 sm:items-end',
          )}
          role="region"
          aria-label="通知"
        >
          <div aria-live="polite" aria-atomic="false" className="contents">
            {items.map((t) => {
              const Icon = ICONS[t.kind];
              return (
                <div
                  key={t.id}
                  className={cn(
                    'pointer-events-auto flex w-full max-w-[92vw] items-start gap-2.5 sm:w-[340px] sm:max-w-none',
                    'rounded-[10px] border border-ink-200 bg-white px-3.5 py-2.5 shadow-lg',
                    'animate-[toastIn_220ms_cubic-bezier(0.16,1,0.3,1)]',
                  )}
                >
                  <Icon size={16} className={cn('mt-px shrink-0', TONE[t.kind])} aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] leading-snug font-medium text-ink-800">{t.message}</p>
                    {t.description && (
                      <p className="mt-0.5 text-xs leading-snug text-ink-500">{t.description}</p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => remove(t.id)}
                    className="-mt-0.5 -mr-1 flex size-6 shrink-0 items-center justify-center rounded text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-600 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-500"
                    aria-label="关闭通知"
                  >
                    <X size={13} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>,
        document.body,
      )}
      <style>{`
        @keyframes toastIn {
          from { opacity: 0; transform: translateY(-12px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @media (prefers-reduced-motion: reduce) {
          [class*="toastIn"] { animation: none !important; }
        }
      `}</style>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  // Provider 缺失时退化为 no-op，避免整棵树崩溃
  return ctx ?? { success: () => {}, error: () => {}, info: () => {} };
}