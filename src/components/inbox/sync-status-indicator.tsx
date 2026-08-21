"use client";

import { RefreshCw, WifiOff, Check, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type { SyncProgress } from "@/lib/sync/sync-engine";

// ============================================================
// SyncStatusIndicator — Shows the current sync status in the
// inbox header. Displays:
//   - Syncing: spinning icon + phase
//   - Synced: check icon
//   - Error: retry button
//   - Offline: wifi-off icon
// ============================================================

interface SyncStatusIndicatorProps {
  progress: SyncProgress;
  outboxCount: number;
  onRetrySync?: () => void;
  className?: string;
}

export function SyncStatusIndicator({
  progress,
  outboxCount,
  onRetrySync,
  className,
}: SyncStatusIndicatorProps) {
  const t = useTranslations("Inbox.syncStatus");

  const isOnline =
    typeof navigator !== "undefined" ? navigator.onLine : true;

  if (!isOnline) {
    return (
      <div
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-amber-400",
          className
        )}
      >
        <WifiOff className="h-3 w-3" />
        <span>{t("offline")}</span>
      </div>
    );
  }

  if (progress.status === "syncing") {
    return (
      <div
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground",
          className
        )}
      >
        <Loader2 className="h-3 w-3 animate-spin" />
        <span>{t("syncing")}</span>
      </div>
    );
  }

  if (progress.status === "error") {
    return (
      <button
        onClick={onRetrySync}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-red-400 hover:text-red-300",
          className
        )}
      >
        <RefreshCw className="h-3 w-3" />
        <span>{t("retrySync")}</span>
      </button>
    );
  }

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground",
        className
      )}
    >
      <Check className="h-3 w-3 text-green-500" />
      <span>{t("synced")}</span>
      {outboxCount > 0 && (
        <span className="ml-1 rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[10px] text-amber-400">
          {outboxCount} {t("queued")}
        </span>
      )}
    </div>
  );
}
