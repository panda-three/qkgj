'use client';

import { forwardRef, useId } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils/cn';

/**
 * 表单字段容器
 *
 * 无障碍要点：label 与 input 通过 id/htmlFor 关联，
 * 错误信息用 role="alert" + aria-describedby 让读屏器立即播报。
 * 移动端 label 在上、输入框在下，避免横向挤压。
 */

const fieldWrapperVariants = cva('flex flex-col gap-1.5', {
  variants: {
    layout: {
      vertical: 'flex-col',
      horizontal: 'flex-row items-center gap-3',
    },
  },
  defaultVariants: { layout: 'vertical' },
});

export function Field({
  label,
  htmlFor,
  error,
  hint,
  required,
  layout = 'vertical',
  className,
  children,
}: {
  label?: React.ReactNode;
  htmlFor?: string;
  error?: string | null;
  hint?: React.ReactNode;
  required?: boolean;
  layout?: 'vertical' | 'horizontal';
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn(fieldWrapperVariants({ layout }), className)}>
      {label && (
        <label
          htmlFor={htmlFor}
          className={cn(
            'text-[13px] font-medium text-ink-700',
            layout === 'horizontal' && 'shrink-0 whitespace-nowrap',
          )}
        >
          {label}
          {required && (
            <span className="ml-0.5 text-danger-500" aria-hidden>
              *
            </span>
          )}
        </label>
      )}
      <div className="min-w-0 flex-1">
        {children}
        {hint && !error && <p className="mt-1 text-xs text-ink-400">{hint}</p>}
        {error && (
          <p role="alert" className="mt-1 text-xs text-danger-600">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

/* ---------- 输入框 ---------- */
const inputVariants = cva(
  [
    'w-full rounded-[6px] text-[13px] text-ink-800 transition-[border-color,box-shadow]',
    'placeholder:text-ink-400',
    'disabled:cursor-not-allowed disabled:bg-ink-50 disabled:text-ink-400',
    'focus:outline-none focus:ring-[3px]',
    'aria-[invalid=true]:border-danger-300 aria-[invalid=true]:focus:ring-danger-500/12',
  ],
  {
    variants: {
      size: {
        sm: 'h-[30px] px-2 text-xs',
        md: 'h-[34px] px-2.5',
        lg: 'h-10 px-3 text-sm',
      },
      variant: {
        default:
          'border border-ink-200 bg-white focus:border-brand-400 focus:ring-brand-500/12',
        flushed: 'border-b border-ink-200 bg-transparent focus:border-brand-500',
      },
    },
    defaultVariants: { size: 'md', variant: 'default' },
  },
);

export interface InputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'>,
    VariantProps<typeof inputVariants> {
  /** 带前缀图标 */
  icon?: React.ReactNode;
  /** 带后缀内容 */
  suffix?: React.ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, size, variant, icon, suffix, ...props }, ref) => {
    const id = useId();
    const describedBy = props['aria-describedby'];
    return (
      <div className="relative flex items-center">
        {icon && (
          <span className="pointer-events-none absolute left-2.5 flex text-ink-400" aria-hidden>
            {icon}
          </span>
        )}
        <input
          ref={ref}
          id={props.id ?? id}
          className={cn(
            inputVariants({ size, variant }),
            icon && 'pl-8',
            suffix && 'pr-14',
            className,
          )}
          {...props}
          aria-describedby={describedBy}
        />
        {suffix && (
          <span className="pointer-events-none absolute right-2.5 text-xs text-ink-400">
            {suffix}
          </span>
        )}
      </div>
    );
  },
);
Input.displayName = 'Input';

/* ---------- 文本域 ---------- */
export const Textarea = forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      'w-full rounded-[6px] border border-ink-200 bg-white px-2.5 py-2 text-[13px] text-ink-800',
      'placeholder:text-ink-400 transition-[border-color,box-shadow] resize-y',
      'focus:border-brand-400 focus:ring-[3px] focus:ring-brand-500/12 focus:outline-none',
      'disabled:bg-ink-50 disabled:text-ink-400',
      className,
    )}
    {...props}
  />
));
Textarea.displayName = 'Textarea';

/* ---------- 下拉选择 ---------- */
export const Select = forwardRef<
  HTMLSelectElement,
  Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'size'> & { inputSize?: 'sm' | 'md' }
>(({ className, inputSize = 'md', children, ...props }, ref) => (
  <div className="relative">
    <select
      ref={ref}
      className={cn(
        'w-full appearance-none rounded-[6px] border border-ink-200 bg-white pr-7 pl-2.5 text-ink-800',
        'transition-[border-color,box-shadow] cursor-pointer',
        'focus:border-brand-400 focus:ring-[3px] focus:ring-brand-500/12 focus:outline-none',
        'disabled:cursor-not-allowed disabled:bg-ink-50 disabled:text-ink-400',
        inputSize === 'sm' ? 'h-[30px] text-xs' : 'h-[34px] text-[13px]',
        className,
      )}
      {...props}
    >
      {children}
    </select>
    <svg
      className="pointer-events-none absolute top-1/2 right-2 size-3 -translate-y-1/2 text-ink-400"
      viewBox="0 0 12 12"
      fill="none"
      aria-hidden
    >
      <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  </div>
));
Select.displayName = 'Select';

export { inputVariants };