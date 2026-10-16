import { cn } from '@/lib/utils/cn';
import type { LucideIcon } from 'lucide-react';

/**
 * 统计指标卡
 * 右上角装饰圆用真实元素实现（原型的伪元素无法按 tone 换色）
 */
export function StatCard({
  label,
  value,
  unit,
  icon: Icon,
  tone = 'brand',
  trend,
  onClick,
  className,
}: {
  label: string;
  value: React.ReactNode;
  unit?: string;
  /** 可选：传了才渲染图标区 */
  icon?: LucideIcon;
  tone?: 'brand' | 'success' | 'warning' | 'danger' | 'purple' | 'info';
  trend?: { value: string; up: boolean };
  onClick?: () => void;
  className?: string;
}) {
  const iconTone: Record<typeof tone, string> = {
    brand: 'bg-brand-50 text-brand-500',
    success: 'bg-success-50 text-success-500',
    warning: 'bg-warning-50 text-warning-500',
    danger: 'bg-danger-50 text-danger-500',
    purple: 'bg-purple-50 text-purple-500',
    info: 'bg-info-50 text-info-500',
  };

  return (
    <div
      onClick={onClick}
      className={cn(
        'relative overflow-hidden rounded-[10px] border border-ink-200 bg-white p-4 transition-[box-shadow,border-color,transform]',
        onClick && 'cursor-pointer hover:-translate-y-px hover:border-brand-200 hover:shadow-md',
        className,
      )}
    >
      <div className={cn('stat-decor', `stat-decor-${tone}`)} />

      <div className="relative z-1 mb-2 flex items-center justify-between">
        <span className="text-[13px] font-medium text-ink-500">{label}</span>
        {Icon && (
          <span className={cn('flex size-[30px] items-center justify-center rounded-lg', iconTone[tone])}>
            <Icon size={16} />
          </span>
        )}
      </div>

      <div className="tabular relative z-1 flex items-baseline gap-1 text-[27px] font-bold leading-tight tracking-tight text-ink-900">
        {value}
        {unit && <span className="text-[13px] font-medium text-ink-500">{unit}</span>}
      </div>

      {trend && (
        <div className="relative z-1 mt-2 flex items-center gap-1.5 text-xs text-ink-500">
          <span className={cn('font-semibold', trend.up ? 'text-success-500' : 'text-danger-500')}>
            {trend.up ? '↑' : '↓'} {trend.value}
          </span>
        </div>
      )}
    </div>
  );
}