import { cn } from '@/lib/utils/cn';
import { TONE_CLASS, type Tone } from '@/lib/constants';

/** 状态标签。tone 由各业务常量的 META 表提供 */
export function StatusTag({
  tone = 'default',
  children,
  size = 'sm',
  dot = false,
  className,
}: {
  tone?: Tone;
  children: React.ReactNode;
  size?: 'sm' | 'lg';
  dot?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded border border-transparent font-medium whitespace-nowrap',
        size === 'sm' ? 'h-[22px] px-2 text-xs' : 'h-[26px] rounded-[5px] px-2.5 text-[13px]',
        TONE_CLASS[tone],
        className,
      )}
    >
      {dot && <span className="size-1.5 rounded-full bg-current opacity-70" />}
      {children}
    </span>
  );
}