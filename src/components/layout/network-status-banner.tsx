'use client';

import { useEffect, useState } from 'react';
import { Loader2, RefreshCw, Wifi, WifiOff } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';

/**
 * Global network-status strip, rendered by the dashboard shell.
 *
 * Offline → amber banner: what's still usable (Chat) + a Retry button
 * that probes `/api/health` (the browser `online` event alone lies on
 * captive portals). After a successful recovery a green "back online"
 * strip flashes for a few seconds.
 */
export function NetworkStatusBanner({
  online,
  checking,
  onRetry,
}: {
  online: boolean;
  checking: boolean;
  onRetry: () => void;
}) {
  const t = useTranslations('Network');
  const [prevOnline, setPrevOnline] = useState(true);
  const [showBackOnline, setShowBackOnline] = useState(false);

  // Track the offline→online transition during render (React's "storing
  // information from previous renders" pattern) instead of an effect:
  // offline hides the flash, online right after offline flashes it.
  if (online !== prevOnline) {
    setPrevOnline(online);
    setShowBackOnline(online);
  }

  useEffect(() => {
    if (!showBackOnline) return;
    const timer = setTimeout(() => setShowBackOnline(false), 4000);
    return () => clearTimeout(timer);
  }, [showBackOnline]);

  if (!online) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2.5"
      >
        <div className="flex min-w-0 items-center gap-2 text-sm">
          <WifiOff className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <span className="font-medium text-amber-800 dark:text-amber-200">
            {t('offlineTitle')}
          </span>
          <span className="truncate text-amber-700 dark:text-amber-100/80">
            {t('offlineDesc')}
          </span>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={onRetry}
          disabled={checking}
          className="h-7 shrink-0 border-amber-500/40 text-amber-800 hover:bg-amber-500/15 hover:text-amber-900 dark:text-amber-200 dark:hover:text-amber-100"
        >
          {checking ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <RefreshCw className="size-3.5" />
          )}
          {checking ? t('checking') : t('retry')}
        </Button>
      </div>
    );
  }

  if (showBackOnline) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex items-center gap-2 border-b border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm"
      >
        <Wifi className="size-4 text-emerald-600 dark:text-emerald-400" />
        <span className="text-emerald-800 dark:text-emerald-200">
          {t('backOnline')}
        </span>
      </div>
    );
  }

  return null;
}
