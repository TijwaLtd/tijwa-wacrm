"use client";

import { useCallback, useEffect, useState } from "react";

import {
  disablePush,
  enablePush,
  getCurrentPushSubscription,
  isPushSupported,
  permissionState,
  showTestNotification,
} from "@/lib/notifications/push-client";

interface UsePushNotificationsResult {
  supported: boolean;
  /** 'unsupported' when the browser can't do Web Push at all. */
  permission: NotificationPermission | "unsupported";
  subscribed: boolean;
  /** True when NEXT_PUBLIC_VAPID_PUBLIC_KEY is present in the bundle. */
  vapidConfigured: boolean;
  /** In-flight enable/disable — drives button spinners. */
  loading: boolean;
  enable: () => Promise<void>;
  disable: () => Promise<void>;
  sendTest: () => Promise<void>;
}

/**
 * State for the browser-notification toggle: permission, whether this
 * device is subscribed, and enable/disable actions. Safe to render
 * everywhere — reports `supported: false` on insecure origins.
 */
export function usePushNotifications(): UsePushNotificationsResult {
  const [supported, setSupported] = useState(false);
  const [permission, setPermission] =
    useState<NotificationPermission | "unsupported">("unsupported");
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);
  const vapidConfigured = Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY);

  useEffect(() => {
    let cancelled = false;

    // Defer past the synchronous effect body: supported/permission are
    // read from window, which must wait for the client. Keeps SSR and
    // the first client render identical (no hydration mismatch) while
    // staying quiet under react-hooks/set-state-in-effect.
    (async () => {
      await Promise.resolve();
      if (cancelled) return;
      setSupported(isPushSupported());
      setPermission(permissionState());
      try {
        const sub = await getCurrentPushSubscription();
        if (!cancelled) setSubscribed(Boolean(sub));
      } catch {
        /* treat as unsubscribed */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const enable = useCallback(async () => {
    setLoading(true);
    try {
      const sub = await enablePush();
      setSubscribed(Boolean(sub));
      setPermission(permissionState());
    } finally {
      setLoading(false);
    }
  }, []);

  const disable = useCallback(async () => {
    setLoading(true);
    try {
      await disablePush();
      setSubscribed(false);
      setPermission(permissionState());
    } finally {
      setLoading(false);
    }
  }, []);

  const sendTest = useCallback(async () => {
    await showTestNotification();
  }, []);

  return {
    supported,
    permission,
    subscribed,
    vapidConfigured,
    loading,
    enable,
    disable,
    sendTest,
  };
}
