"use client";

import { BellRing, BellOff, Loader2, Send, ShieldCheck } from "lucide-react";

import { usePushNotifications } from "@/hooks/use-push-notifications";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Toggle card for browser / PWA notifications. Lives at the top of
 * the notifications page — one place to grant permission, subscribe
 * this device, and verify with a test notification.
 */
export function BrowserNotificationsCard() {
  const {
    supported,
    permission,
    subscribed,
    vapidConfigured,
    loading,
    enable,
    disable,
    sendTest,
  } = usePushNotifications();

  if (!supported) {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-border bg-card p-4">
        <BellOff className="mt-0.5 h-5 w-5 flex-shrink-0 text-muted-foreground" />
        <div>
          <p className="text-sm font-semibold text-foreground">
            Browser notifications unavailable
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            This browser doesn&apos;t support notifications. In-app alerts
            still appear in the bell and on this page.
          </p>
        </div>
      </div>
    );
  }

  const blocked = permission === "denied";

  return (
    <div className="flex flex-wrap items-center gap-4 rounded-xl border border-border bg-card p-4">
      <div
        className={cn(
          "flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg",
          subscribed ? "bg-emerald-500/15" : "bg-muted",
        )}
        aria-hidden
      >
        {subscribed ? (
          <BellRing className="h-5 w-5 text-emerald-500" />
        ) : (
          <BellOff className="h-5 w-5 text-muted-foreground" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-foreground">
            Browser notifications
          </p>
          {subscribed && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-500">
              <ShieldCheck className="h-3 w-3" />
              On for this device
            </span>
          )}
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {blocked
            ? "Notifications are blocked in your browser settings. Allow them for this site, then re-enable here."
            : subscribed
              ? "Get notified of new messages, assignments and billing events even when the app is closed."
              : "Get notified of new messages, assignments and billing events — works in the browser and installed PWA."}
        </p>
      </div>

      <div className="flex items-center gap-2">
        {subscribed && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => void sendTest()}
            disabled={loading}
          >
            <Send className="mr-1.5 h-3.5 w-3.5" />
            Send test
          </Button>
        )}
        <Button
          size="sm"
          variant={subscribed ? "outline" : "default"}
          disabled={loading || blocked || !vapidConfigured}
          title={
            !vapidConfigured
              ? "Server push keys not configured — set NEXT_PUBLIC_VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY"
              : undefined
          }
          onClick={() => void (subscribed ? disable() : enable())}
        >
          {loading ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : subscribed ? (
            <BellOff className="mr-1.5 h-3.5 w-3.5" />
          ) : (
            <BellRing className="mr-1.5 h-3.5 w-3.5" />
          )}
          {subscribed ? "Turn off" : "Enable"}
        </Button>
      </div>
    </div>
  );
}
