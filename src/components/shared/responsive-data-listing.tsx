'use client';

import React, { useState } from 'react';
import { Search, Loader2, Plus, SlidersHorizontal, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { InfiniteScrollSentinel } from './infinite-scroll-sentinel';
import { ResponsiveMobileCard, type CardDetailField, type CardAction } from './responsive-mobile-card';
import { cn } from '@/lib/utils';

export interface ColumnDef<T> {
  header: string;
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
  value: string;
  onChange: (value: string) => void;
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
  primaryAction?: {
    label: string;
    icon?: React.ComponentType<{ className?: string }>;
    onClick: () => void;
  };
  secondaryActions?: Array<{
    label: string;
    icon?: React.ComponentType<{ className?: string }>;
    onClick: () => void;
    variant?: 'outline' | 'ghost' | 'secondary';
  }>;
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
  emptyState,
  hasMore = false,
  isLoadingMore = false,
  onLoadMore,
  rowKey,
}: ResponsiveDataListingProps<T>) {
  const [filtersOpen, setFiltersOpen] = useState(false);

  const activeFiltersCount = filters.filter((f) => f.value !== '').length;

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
              <Button
                key={idx}
                variant={sec.variant || 'outline'}
                onClick={sec.onClick}
                className="border-border gap-2 text-xs sm:text-sm h-9"
              >
                {Icon && <Icon className="h-4 w-4" />}
                <span>{sec.label}</span>
              </Button>
            );
          })}

          {primaryAction && (
            <Button onClick={primaryAction.onClick} className="gap-2 text-xs sm:text-sm h-9 shadow-xs">
              {primaryAction.icon ? (
                <primaryAction.icon className="h-4 w-4" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              <span>{primaryAction.label}</span>
            </Button>
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
                className="border-border bg-card pl-9 pr-8 h-10 text-sm shadow-xs focus-visible:ring-1"
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
            {filters.map((filter) => (
              <div key={filter.key} className="space-y-1">
                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider block">
                  {filter.label}
                </label>
                <select
                  value={filter.value}
                  onChange={(e) => filter.onChange(e.target.value)}
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
            ))}
          </div>
        )}
      </div>

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
