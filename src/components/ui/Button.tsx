'use client';

import { forwardRef } from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

/**
 * 按钮
 *
 * 无障碍要点：
 * · loading 时用 aria-busy 告知读屏器，且禁用交互
 * · icon-only 按钮强制要求 aria-label（类型层面无法约束，文档已注明）
 * · 触觉反馈用 active:scale-[0.98]，只动 transform，属GPU 属性
 */
const buttonVariants = cva(
  [
    'inline-flex items-center justify-center gap-1.5 whitespace-nowrap',
    'rounded-[6px] font-medium select-none',
    'transition-[background-color,border-color,color,box-shadow,transform] duration-150',
    'active:scale-[0.98]',
    'disabled:pointer-events-none disabled:opacity-45',
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500',
  ],
  {
    variants: {
      variant: {
        primary:
          'bg-brand-500 text-white shadow-[0_1px_2px_rgba(58,99,240,0.3)] hover:bg-brand-600',
        default:
          'border border-ink-200 bg-white text-ink-700 hover:border-ink-300 hover:bg-ink-50',
        ghost: 'text-ink-600 hover:bg-ink-100',
        subtle: 'bg-ink-100 text-ink-700 hover:bg-ink-200',
        danger: 'bg-danger-500 text-white hover:bg-danger-700',
        dangerGhost: 'text-danger-700 hover:bg-danger-50',
        link: 'text-brand-600 underline-offset-4 hover:underline',
      },
      size: {
        sm: 'h-[30px] px-2.5 text-xs',
        md: 'h-[34px] px-3 text-[13px]',
        lg: 'h-10 px-4 text-sm',
        icon: 'size-[34px] p-0',
        iconSm: 'size-[30px] p-0',
      },
    },
    defaultVariants: { variant: 'default', size: 'md' },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading = false, children, disabled, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        disabled={disabled ?? loading}
        aria-busy={loading || undefined}
        {...props}
      >
        {loading && <Loader2 size={size === 'sm' ? 13 : 15} className="animate-spin" aria-hidden />}
        {children}
      </Comp>
    );
  },
);
Button.displayName = 'Button';

export { buttonVariants };