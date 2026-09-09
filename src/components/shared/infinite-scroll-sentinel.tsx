'use client';

import React, { useEffect, useRef } from 'react';
import { Loader2 } from 'lucide-react';

interface InfiniteScrollSentinelProps {
  onLoadMore: () => void;
  hasMore: boolean;
  isLoadingMore: boolean;
  className?: string;
}

export function InfiniteScrollSentinel({
  onLoadMore,
  hasMore,
  isLoadingMore,
  className,
}: InfiniteScrollSentinelProps) {
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!hasMore || isLoadingMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          onLoadMore();
        }
      },
      { rootMargin: '200px' }
    );

    const currentSentinel = sentinelRef.current;
    if (currentSentinel) {
      observer.observe(currentSentinel);
    }

    return () => {
      if (currentSentinel) {
        observer.unobserve(currentSentinel);
      }
    };
  }, [hasMore, isLoadingMore, onLoadMore]);

  if (!hasMore) return null;

  return (
    <div ref={sentinelRef} className={`flex items-center justify-center py-6 ${className || ''}`}>
      {isLoadingMore && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium bg-muted/50 px-3 py-1.5 rounded-full border border-border/40 animate-pulse">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          <span>Loading more items...</span>
        </div>
      )}
    </div>
  );
}
