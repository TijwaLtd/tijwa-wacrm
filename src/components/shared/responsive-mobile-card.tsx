'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronUp, ExternalLink, Eye } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button, buttonVariants } from '@/components/ui/button';

export interface CardDetailField {
  label: string;
  value: React.ReactNode;
  fullWidth?: boolean;
}

export interface CardAction {
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  variant?: 'default' | 'outline' | 'ghost' | 'destructive' | 'secondary';
  onClick?: () => void;
  href?: string;
}

export interface ResponsiveMobileCardProps {
  id: string;
  title: string;
  subtitle?: string;
  image?: string | null;
  fallbackIcon?: React.ReactNode;
  statusBadge?: React.ReactNode;
  amount?: React.ReactNode;
  detailFields?: CardDetailField[];
  description?: string | null;
  actions?: CardAction[];
  detailHref?: string;
  className?: string;
}

/**
 * Inline Read More / Show Less component for long text block handling.
 */
export function ExpandableText({
  text,
  maxChars = 120,
  className,
}: {
  text: string;
  maxChars?: number;
  className?: string;
}) {
  const [expanded, setExpanded] = useState(false);

  if (!text) return null;
  if (text.length <= maxChars) {
    return <p className={cn('text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed', className)}>{text}</p>;
  }

  return (
    <div className={className}>
      <p className="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed inline">
        {expanded ? text : `${text.slice(0, maxChars)}... `}
      </p>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setExpanded(!expanded);
        }}
        className="ml-1 text-xs font-semibold text-primary hover:underline focus:outline-none"
      >
        {expanded ? 'Show less' : 'Read more'}
      </button>
    </div>
  );
}

/**
 * Material Design 3 inspired responsive app card component.
 * Features stacked status & amount on top-right, touch-friendly tap expansion,
 * metadata key-value list, expandable read-more text, and touch action buttons.
 */
export function ResponsiveMobileCard({
  title,
  subtitle,
  image,
  fallbackIcon,
  statusBadge,
  amount,
  detailFields = [],
  description,
  actions = [],
  detailHref,
  className,
}: ResponsiveMobileCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const toggleExpand = () => {
    setIsExpanded((prev) => !prev);
  };

  return (
    <div
      className={cn(
        'group relative overflow-hidden rounded-xl border border-border/70 bg-card text-card-foreground transition-all duration-200 shadow-xs hover:shadow-md hover:border-border active:scale-[0.995]',
        isExpanded && 'ring-1 ring-primary/20 border-primary/40 bg-card/95',
        className
      )}
    >
      {/* Header Row (Always Visible) */}
      <div
        onClick={toggleExpand}
        className="flex items-start justify-between gap-3 p-4 cursor-pointer select-none"
        role="button"
        tabIndex={0}
        aria-expanded={isExpanded}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggleExpand();
          }
        }}
      >
        {/* Left Side: Avatar/Icon + Title + Subtitle */}
        <div className="flex items-start gap-3 min-w-0 flex-1">
          {image ? (
            <img
              src={image}
              alt={title}
              className="h-12 w-12 shrink-0 rounded-lg object-cover border border-border/50 shadow-xs"
            />
          ) : fallbackIcon ? (
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-muted/80 text-muted-foreground border border-border/40">
              {fallbackIcon}
            </div>
          ) : null}

          <div className="min-w-0 flex-1 space-y-0.5">
            {detailHref ? (
              <Link
                href={detailHref}
                onClick={(e) => e.stopPropagation()}
                className="font-semibold text-sm text-foreground hover:text-primary transition-colors flex items-center gap-1 group/title"
              >
                <span className="truncate">{title}</span>
                <ExternalLink className="h-3 w-3 opacity-0 group-hover/title:opacity-100 transition-opacity shrink-0 text-muted-foreground" />
              </Link>
            ) : (
              <h4 className="font-semibold text-sm text-foreground truncate">{title}</h4>
            )}

            {subtitle && (
              <p className="text-xs text-muted-foreground font-mono truncate">{subtitle}</p>
            )}
          </div>
        </div>

        {/* Right Side: Stacked Status Badge + Amount */}
        <div className="flex flex-col items-end gap-1 shrink-0 text-right">
          {statusBadge && <div className="shrink-0">{statusBadge}</div>}
          {amount && <div className="text-xs sm:text-sm font-bold text-foreground font-mono">{amount}</div>}
          <div className="text-muted-foreground/60 group-hover:text-muted-foreground transition-colors pt-0.5">
            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </div>
        </div>
      </div>

      {/* Expanded Content Section */}
      {isExpanded && (
        <div className="border-t border-border/50 bg-muted/20 px-4 pt-3 pb-4 space-y-3.5 animate-in fade-in slide-in-from-top-1 duration-150">
          {/* Key-Value Details Grid */}
          {detailFields.length > 0 && (
            <div className="grid grid-cols-2 gap-2 text-xs">
              {detailFields.map((field, idx) => (
                <div
                  key={idx}
                  className={cn(
                    'space-y-0.5 rounded-lg bg-background/70 p-2 border border-border/30',
                    field.fullWidth && 'col-span-2'
                  )}
                >
                  <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider block">
                    {field.label}
                  </span>
                  <div className="font-medium text-foreground text-xs break-words">{field.value}</div>
                </div>
              ))}
            </div>
          )}

          {/* Description with Read More */}
          {description && (
            <div className="rounded-lg bg-background/70 p-2.5 border border-border/30">
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider block mb-1">
                Description / Notes
              </span>
              <ExpandableText text={description} maxChars={100} />
            </div>
          )}

          {/* Touch-Friendly Action Buttons */}
          {(actions.length > 0 || detailHref) && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {detailHref && !actions.some((a) => a.href === detailHref) && (
                <Link
                  href={detailHref}
                  onClick={(e) => e.stopPropagation()}
                  className={cn(
                    buttonVariants({ variant: 'outline', size: 'sm' }),
                    'h-8 text-xs font-medium border-border/80 gap-1.5 flex-1 justify-center'
                  )}
                >
                  <Eye className="h-3.5 w-3.5" />
                  View Details
                </Link>
              )}

              {actions.map((act, idx) => {
                const Icon = act.icon;
                if (act.href) {
                  return (
                    <Link
                      key={idx}
                      href={act.href}
                      onClick={(e) => e.stopPropagation()}
                      className={cn(
                        buttonVariants({ variant: act.variant || 'outline', size: 'sm' }),
                        'h-8 text-xs font-medium gap-1.5 flex-1 justify-center'
                      )}
                    >
                      {Icon && <Icon className="h-3.5 w-3.5" />}
                      {act.label}
                    </Link>
                  );
                }

                return (
                  <Button
                    key={idx}
                    variant={act.variant || 'outline'}
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      act.onClick?.();
                    }}
                    className="h-8 text-xs font-medium gap-1.5 flex-1"
                  >
                    {Icon && <Icon className="h-3.5 w-3.5" />}
                    {act.label}
                  </Button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
