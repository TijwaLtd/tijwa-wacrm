'use client';

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';

// `navigator.onLine` as an external store: SSR-safe (true on the server),
// and re-renders on the browser's own `online`/`offline` events without
// any setState-in-effect.
const subscribe = (onStoreChange: () => void) => {
  window.addEventListener('online', onStoreChange);
  window.addEventListener('offline', onStoreChange);
  return () => {
    window.removeEventListener('online', onStoreChange);
    window.removeEventListener('offline', onStoreChange);
  };
};
const getSnapshot = () => navigator.onLine;
const getServerSnapshot = () => true;

/**
 * Device connectivity for the offline UX.
 *
 * - `online` combines the browser's carrier signal (`navigator.onLine`
 *   via useSyncExternalStore) with an active `/api/health` probe: the
 *   browser's `online` event only proves the socket has a carrier —
 *   captive portals and dead upstreams still fire it — so a failed
 *   probe marks the app unreachable until the browser reports online
 *   again (which clears the mark).
 * - `retry()` returns whether the probe succeeded, so callers can give
 *   immediate feedback ("still offline").
 */
export function useNetworkStatus() {
  const browserOnline = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [probeFailed, setProbeFailed] = useState(false);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    const clearProbeFailure = () => setProbeFailed(false);
    window.addEventListener('online', clearProbeFailure);
    return () => window.removeEventListener('online', clearProbeFailure);
  }, []);

  const retry = useCallback(async () => {
    setChecking(true);
    try {
      await fetch('/api/health', {
        cache: 'no-store',
        signal: AbortSignal.timeout(5000),
      });
      setProbeFailed(false);
      return true;
    } catch {
      // Server unreachable = effectively offline for this app.
      setProbeFailed(true);
      return false;
    } finally {
      setChecking(false);
    }
  }, []);

  return { online: browserOnline && !probeFailed, checking, retry };
}
