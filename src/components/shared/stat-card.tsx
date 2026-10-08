import type { ComponentType } from 'react';
import { cn } from '@/lib/utils';

/**
 * Responsive grid for the 4-card summary strip on catalogue pages:
 * 2-up on phones (compact so the strip doesn't push the list down),
 * 4-up from `sm`.
 */
export const STAT_GRID_CLASS = 'grid grid-cols-2 gap-2 sm:gap-3 sm:grid-cols-4';

/**
 * Compact summary/analytics card. Sized for mobile first — 11px label,
 * p-2.5, 16px value — growing to the desktop treatment at `sm`.
 */
export function StatCard({
  title,
  value,
  icon: Icon,
  iconClassName,
  valueClassName,
  className,
}: {
  title: string;
  value: string | number;
  icon: ComponentType<{ className?: string }>;
  iconClassName?: string;
  valueClassName?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'rounded-xl border border-border/80 bg-card p-2.5 shadow-xs sm:p-3.5',
        className
      )}
    >
      <div className="flex items-center justify-between gap-1 text-muted-foreground">
        <span
          className="min-w-0 truncate text-[11px] leading-tight font-medium sm:text-xs"
          title={title}
        >
          {title}
        </span>
        <Icon
          className={cn('h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4', iconClassName)}
        />
      </div>
      <p
        className={cn(
          'mt-1 truncate text-base leading-tight font-bold text-foreground sm:mt-1.5 sm:text-xl',
          valueClassName
        )}
        title={String(value)}
      >
        {value}
      </p>
    </div>
  );
}
