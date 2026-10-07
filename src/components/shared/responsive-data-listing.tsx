'use client';

import React, { useState } from 'react';
import { Search, Loader2, Plus, SlidersHorizontal, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { GatedButton } from '@/components/ui/gated-button';
import { InfiniteScrollSentinel } from './infinite-scroll-sentinel';
import { ResponsiveMobileCard, type CardDetailField, type CardAction } from './responsive-mobile-card';
import { cn } from '@/lib/utils';

export interface ColumnDef<T> {
  header: React.ReactNode;
  cell: (item: T) => React.ReactNode;
  className?: string;
  headerClassName?: string;
}

export interface CardMapper<T> {
  id: (item: T) => string;
  title: (item: T) => string;
  subtitle?: (item: T) => string | undefined;
  image?: (item: T) => string | null | undefined;
  fallbackIcon?: (item: T) => React.ReactNode;
  statusBadge?: (item: T) => React.ReactNode;
  amount?: (item: T) => React.ReactNode;
  detailFields?: (item: T) => CardDetailField[];
  description?: (item: T) => string | null | undefined;
  actions?: (item: T) => CardAction[];
  detailHref?: (item: T) => string | undefined;
}

export interface FilterSelectOption {
  label: string;
  value: string;
}

export interface FilterConfig {
  key: string;
  label: string;
  options: FilterSelectOption[];
  value?: string;
  onChange?: (value: string) => void;
  /** Multi-select filter: renders a checkbox group instead of a <select>. */
  multi?: boolean;
  values?: string[];
  onValuesChange?: (values: string[]) => void;
}

export interface ListingAction {
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  onClick: () => void;
  variant?: 'outline' | 'ghost' | 'secondary';
  canAct?: boolean;
  gateReason?: string;
}

export interface ResponsiveDataListingProps<T> {
  title: string;
  description?: string;
  items: T[];
  columns: ColumnDef<T>[];
  cardMapper: CardMapper<T>;
  loading: boolean;
  searchQuery?: string;
  onSearchChange?: (q: string) => void;
  onSearchSubmit?: () => void;
  searchPlaceholder?: string;
  filters?: FilterConfig[];
  primaryAction?: ListingAction;
  secondaryActions?: ListingAction[];
  bulkBar?: React.ReactNode;
  emptyState?: {
    icon?: React.ComponentType<{ className?: string }>;
    title: string;
    description?: string;
    actionLabel?: string;
    onAction?: () => void;
  };
  hasMore?: boolean;
  isLoadingMore?: boolean;
  onLoadMore?: () => void;
  rowKey: (item: T) => string;
}

export function ResponsiveDataListing<T>({
  title,
  description,
  items,
  columns,
  cardMapper,
  loading,
  searchQuery = '',
  onSearchChange,
  onSearchSubmit,
  searchPlaceholder = 'Search...',
  filters = [],
  primaryAction,
  secondaryActions = [],
  bulkBar,
  emptyState,
  hasMore = false,
  isLoadingMore = false,
  onLoadMore,
  rowKey,
}: ResponsiveDataListingProps<T>) {
  const [filtersOpen, setFiltersOpen] = useState(false);

  const activeFiltersCount = filters.reduce(
    (n, f) => n + (f.multi ? f.values?.length || 0 : f.value ? 1 : 0),
    0
  );

  return (
    <div className="space-y-5">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">{title}</h1>
          {description && <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">{description}</p>}
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
          {secondaryActions.map((sec, idx) => {
            const Icon = sec.icon;
            return (
              <GatedButton
                key={idx}
                variant={sec.variant || 'outline'}
                canAct={sec.canAct}
                gateReason={sec.gateReason}
                onClick={sec.onClick}
                className="border-border gap-2 text-xs sm:text-sm h-9"
              >
                {Icon && <Icon className="h-4 w-4" />}
                <span>{sec.label}</span>
              </GatedButton>
            );
          })}

          {primaryAction && (
            <GatedButton
              canAct={primaryAction.canAct}
              gateReason={primaryAction.gateReason}
              onClick={primaryAction.onClick}
              className="gap-2 text-xs sm:text-sm h-9 shadow-xs"
            >
              {primaryAction.icon ? (
                <primaryAction.icon className="h-4 w-4" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              <span>{primaryAction.label}</span>
            </GatedButton>
          )}
        </div>
      </div>

      {/* Search & Filters Controls */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
          {/* Search Box */}
          {onSearchChange && (
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={searchPlaceholder}
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && onSearchSubmit) {
                    onSearchSubmit();
                  }
                }}
                className="border-border bg-card pl-9 pr-8 h-10 shadow-xs focus-visible:ring-1"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    onSearchChange('');
                    if (onSearchSubmit) onSearchSubmit();
                  }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          )}

          {/* Filter Trigger Toggle for Mobile & Desktop Filters */}
          {filters.length > 0 && (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={() => setFiltersOpen(!filtersOpen)}
                className={cn(
                  'border-border h-10 gap-2 text-xs sm:text-sm flex-1 sm:flex-initial justify-between sm:justify-center',
                  activeFiltersCount > 0 && 'border-primary/50 text-primary bg-primary/5 font-medium'
                )}
              >
                <div className="flex items-center gap-1.5">
                  <SlidersHorizontal className="h-4 w-4" />
                  <span>Filters</span>
                </div>
                {activeFiltersCount > 0 && (
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground font-bold">
                    {activeFiltersCount}
                  </span>
                )}
              </Button>
            </div>
          )}
        </div>

        {/* Filter Options Drawer / Dropdowns */}
        {filters.length > 0 && filtersOpen && (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 p-3.5 rounded-xl border border-border/80 bg-card shadow-xs animate-in fade-in slide-in-from-top-2 duration-150">
            {filters.map((filter) =>
              filter.multi ? (
                <div key={filter.key} className="space-y-1 sm:col-span-1">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider block">
                      {filter.label}
                    </label>
                    {(filter.values?.length ?? 0) > 0 && (
                      <button
                        type="button"
                        onClick={() => filter.onValuesChange?.([])}
                        className="text-[11px] text-muted-foreground hover:text-foreground"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                  <div className="max-h-40 overflow-y-auto rounded-lg border border-border/60 bg-background/50 p-1">
                    {filter.options.length === 0 ? (
                      <p className="px-2 py-2 text-xs text-muted-foreground">No options</p>
                    ) : (
                      filter.options.map((opt) => {
                        const isSelected = filter.values?.includes(opt.value) ?? false;
                        return (
                          <label
                            key={opt.value}
                            className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/60"
                          >
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() => {
                                const current = filter.values ?? [];
                                filter.onValuesChange?.(
                                  isSelected
                                    ? current.filter((v) => v !== opt.value)
                                    : [...current, opt.value]
                                );
                              }}
                            />
                            <span className="truncate text-xs text-foreground">{opt.label}</span>
                          </label>
                        );
                      })
                    )}
                  </div>
                </div>
              ) : (
                <div key={filter.key} className="space-y-1">
                  <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider block">
                    {filter.label}
                  </label>
                  <select
                    value={filter.value ?? ''}
                    onChange={(e) => filter.onChange?.(e.target.value)}
                    className="w-full border-border bg-background text-foreground rounded-lg px-3 py-2 text-xs sm:text-sm focus:ring-1 focus:ring-primary focus:outline-none"
                  >
                    <option value="">All {filter.label}s</option>
                    {filter.options.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              )
            )}
          </div>
        )}
      </div>

      {/* Bulk action bar slot (selection UI supplied by the page) */}
      {bulkBar && <div className="pt-1">{bulkBar}</div>}

      {/* Main Content Area */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-16 rounded-xl border border-border/60 bg-card">
          <Loader2 className="h-7 w-7 animate-spin text-primary" />
          <p className="mt-3 text-xs text-muted-foreground animate-pulse">Loading data...</p>
        </div>
      ) : items.length === 0 ? (
        /* Empty State */
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-14 px-4 text-center bg-card">
          {emptyState?.icon ? (
            <emptyState.icon className="h-12 w-12 text-muted-foreground/60" />
          ) : (
            <Search className="h-12 w-12 text-muted-foreground/60" />
          )}
          <h3 className="mt-4 text-base font-semibold text-foreground">{emptyState?.title || 'No items found'}</h3>
          {emptyState?.description && (
            <p className="mt-1 text-xs text-muted-foreground max-w-sm">{emptyState.description}</p>
          )}
          {emptyState?.onAction && (
            <Button variant="outline" onClick={emptyState.onAction} className="mt-4 border-border text-xs gap-1.5">
              <Plus className="h-3.5 w-3.5" />
              {emptyState.actionLabel || 'Create New'}
            </Button>
          )}
        </div>
      ) : (
        <>
          {/* Desktop Table View (lg:block / md:block) */}
          <div className="hidden md:block overflow-hidden rounded-xl border border-border/80 bg-card shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm border-collapse">
                <thead>
                  <tr className="border-b border-border/80 bg-muted/40 font-medium text-xs text-muted-foreground uppercase tracking-wider">
                    {columns.map((col, idx) => (
                      <th
                        key={idx}
                        className={cn('px-4 py-3.5 font-semibold', col.headerClassName || col.className)}
                      >
                        {col.header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {items.map((item) => (
                    <tr
                      key={rowKey(item)}
                      className="hover:bg-muted/30 transition-colors group/row"
                    >
                      {columns.map((col, cIdx) => (
                        <td key={cIdx} className={cn('px-4 py-3.5 align-middle', col.className)}>
                          {col.cell(item)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile App Cards View (md:hidden) */}
          <div className="space-y-3 md:hidden">
            {items.map((item) => {
              const k = rowKey(item);
              return (
                <ResponsiveMobileCard
                  key={k}
                  id={cardMapper.id(item)}
                  title={cardMapper.title(item)}
                  subtitle={cardMapper.subtitle?.(item)}
                  image={cardMapper.image?.(item)}
                  fallbackIcon={cardMapper.fallbackIcon?.(item)}
                  statusBadge={cardMapper.statusBadge?.(item)}
                  amount={cardMapper.amount?.(item)}
                  detailFields={cardMapper.detailFields?.(item)}
                  description={cardMapper.description?.(item)}
                  actions={cardMapper.actions?.(item)}
                  detailHref={cardMapper.detailHref?.(item)}
                />
              );
            })}
          </div>

          {/* Infinite Scroll Sentinel for Auto Loading */}
          {onLoadMore && (
            <InfiniteScrollSentinel
              onLoadMore={onLoadMore}
              hasMore={hasMore}
              isLoadingMore={isLoadingMore}
            />
          )}
        </>
      )}
    </div>
  );
}
