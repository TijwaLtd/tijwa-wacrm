"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { createClient } from "@/lib/supabase/client";
import type { Notification } from "@/types";

/**
 * Client shell for the PWA + browser-notification layer. Mounted once
 * in the root layout. Three responsibilities:
 *
 *   1. Register the service worker (public/sw.js) so the app becomes
 *      installable and can receive Web Push.
 *   2. Relay SW→page push messages to an in-app toast (the SW skips
 *      showing an OS bubble when a window is already focused).
 *   3. Subscribe to own `notifications` inserts over Supabase realtime
 *      (RLS scopes delivery to the signed-in user) and:
 *         - document visible  → sonner toast (grouped by tag so a
 *           burst of messages replaces one bubble instead of stacking)
 *         - document hidden   → local SW notification with the same
 *           tag; the Web Push path uses that tag too, so whichever
 *           arrives first wins and the other collapses into it.
 *
 * Durable history (bell badge, /notifications page) is untouched —
 * this layer is presentation only.
 */
export function PwaProvider() {
  const router = useRouter();

  // ── 1. Service worker registration ──────────────────────────
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const register = () => {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .catch((err) => console.error("[pwa] SW registration failed:", err));
    };

    // Wait for load so registration never competes with first paint.
    if (document.readyState === "complete") {
      register();
    } else {
      window.addEventListener("load", register, { once: true });
      return () => window.removeEventListener("load", register);
    }
  }, []);

  // ── 2. SW → page relay (push arrived while focused) ─────────
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const onMessage = (event: MessageEvent) => {
      const data = event.data as
        | { type?: string; payload?: { title?: string; body?: string; url?: string; tag?: string } }
        | undefined;
      if (data?.type !== "tijwa:push" || !data.payload) return;
      const { title, body, url, tag } = data.payload;
      toast(title ?? "Tijwa CRM", {
        id: tag ?? "tijwa-push",
        description: body,
        action: url
          ? {
              label: "Open",
              onClick: () => router.push(url),
            }
          : undefined,
      });
    };

    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [router]);

  // ── 3. Realtime durable notifications → toast / local bubble ─
  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel("browser-notifications")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications" },
        (payload) => {
          const row = payload.new as Notification;
          const meta = (row.metadata ?? {}) as { url?: string; tag?: string };
          const tag = meta.tag ?? row.type;

          if (document.visibilityState === "visible") {
            toast(row.title, {
              id: tag,
              description: row.body,
              action: meta.url
                ? {
                    label: "Open",
                    onClick: () => router.push(meta.url as string),
                  }
                : undefined,
            });
            return;
          }

          // Tab hidden / PWA backgrounded — raise a local OS bubble.
          // Same tag as the server push, so if push lands too the two
          // collapse into one notification.
          navigator.serviceWorker?.ready
            .then((reg) =>
              reg.showNotification(row.title, {
                body: row.body ?? "",
                icon: "/icons/icon-192.png",
                badge: "/icons/icon-192.png",
                tag,
                data: { url: meta.url ?? "/notifications" },
              }),
            )
            .catch(() => {
              /* notification permission probably denied */
            });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [router]);

  return null;
}
