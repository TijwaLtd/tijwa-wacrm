"use client";

import { cn } from "@/lib/utils";
import { presenceLabel, type PresenceStatus } from "@/lib/presence";

interface PresenceDotProps {
  status: PresenceStatus;
  lastSeenAt?: string | null;
  now?: number;
  showLabel?: boolean;
  size?: "sm" | "md";
  className?: string;
  /** Custom label/tooltip — overrides auto-generated label when provided */
  label?: string;
}

const SIZE_CLASSES = {
  sm: "h-2 w-2",
  md: "h-2.5 w-2.5",
};

const STATUS_CLASSES: Record<PresenceStatus, string> = {
  online: "bg-green-500",
  away: "bg-amber-500",
  offline: "bg-muted-foreground/40",
};

export const PRESENCE_DOT_CLASS: Record<PresenceStatus, string> = {
  online: "bg-green-500",
  away: "bg-amber-500",
  offline: "bg-muted-foreground/40",
};

export function PresenceDot({
  status,
  lastSeenAt,
  now,
  showLabel = false,
  size = "sm",
  className,
  label,
}: PresenceDotProps) {
  const dotClass = STATUS_CLASSES[status];
  const tooltip = label ?? presenceLabel(status, lastSeenAt, now ?? Date.now());

  return (
    <span
      className={cn("inline-flex items-center gap-1.5", className)}
      title={tooltip}
      aria-label={tooltip}
    >
      <span
        className={cn(
          "shrink-0 rounded-full",
          dotClass,
          status === "online" && "animate-pulse",
          SIZE_CLASSES[size],
        )}
      />
      {showLabel && (
        <span className="text-xs text-muted-foreground capitalize">{status}</span>
      )}
    </span>
  );
}
