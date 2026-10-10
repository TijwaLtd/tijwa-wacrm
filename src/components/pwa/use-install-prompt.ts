"use client";

import { useCallback, useEffect, useState } from "react";

import {
  getDeferredInstallPrompt,
  isIosSafari,
  isStandaloneDisplay,
  subscribeInstallPrompt,
} from "@/lib/pwa/install-prompt";

interface UseInstallPromptResult {
  /** True when already running as an installed PWA. */
  standalone: boolean;
  /** True when the browser offered a native install prompt (Chromium). */
  canPrompt: boolean;
  /** True on iOS Safari where only manual "Add to Home Screen" works. */
  iosManual: boolean;
  /**
   * Trigger the native install dialog. Returns the outcome, or null
   * when no prompt is available (caller falls back to manual steps).
   */
  promptInstall: () => Promise<'accepted' | 'dismissed' | null>;
}

export function useInstallPrompt(): UseInstallPromptResult {
  const [standalone, setStandalone] = useState(false);
  const [canPrompt, setCanPrompt] = useState(false);
  const [iosManual, setIosManual] = useState(false);

  useEffect(() => {
    let cancelled = false;

    // Defer past the synchronous effect body (window reads) — same
    // pattern as use-push-notifications, keeps SSR/first render
    // identical and satisfies react-hooks/set-state-in-effect.
    (async () => {
      await Promise.resolve();
      if (cancelled) return;
      setStandalone(isStandaloneDisplay());
      setCanPrompt(getDeferredInstallPrompt() !== null);
      setIosManual(!isStandaloneDisplay() && getDeferredInstallPrompt() === null && isIosSafari());
    })();

    const unsubscribe = subscribeInstallPrompt((event) => {
      if (!cancelled) setCanPrompt(event !== null);
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const promptInstall = useCallback(async () => {
    const event = getDeferredInstallPrompt();
    if (!event) return null;
    try {
      await event.prompt();
      const { outcome } = await event.userChoice;
      return outcome;
    } catch {
      return null;
    }
  }, []);

  return { standalone, canPrompt, iosManual, promptInstall };
}
