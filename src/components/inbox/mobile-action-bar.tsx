"use client";

import {
  CornerUpLeft,
  Copy,
  SmilePlus,
  Forward,
  X,
} from "lucide-react";
// TODO: Add when backend support is ready
// import { Pin, Star, StickyNote, Flag, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";

interface MobileActionBarProps {
  /** The message currently selected via long-press, or null to hide */
  messageId: string | null;
  onReply: () => void;
  onCopy: () => void;
  onReact: () => void;
  onForward?: () => void;
  // TODO: Add when backend support is ready
  // onPin?: () => void;
  // onStar?: () => void;
  // onAddToNote?: () => void;
  // onReport?: () => void;
  // onDelete?: () => void;
  onDismiss: () => void;
}

/**
 * WhatsApp-style mobile action bar. Appears at the top of the thread when a
 * message is long-pressed. Shows icon buttons for all actions. Dismisses on
 * tap outside or the X button.
 */
export function MobileActionBar({
  messageId,
  onReply,
  onCopy,
  onReact,
  onForward,
  // onPin,
  // onStar,
  // onAddToNote,
  // onReport,
  // onDelete,
  onDismiss,
}: MobileActionBarProps) {
  const t = useTranslations("Inbox.actions");

  if (!messageId) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/30"
        onClick={onDismiss}
      />

      {/* Action bar */}
      <div
        className={cn(
          "fixed top-0 left-0 right-0 z-50 flex items-center gap-1 overflow-x-auto",
          "border-b border-border bg-popover/95 px-2 py-2 shadow-lg backdrop-blur-sm",
          "scrollbar-none",
        )}
      >
        <button
          type="button"
          onClick={onDismiss}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full hover:bg-muted"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="mx-1 h-5 w-px bg-border" />

        <ActionButton icon={CornerUpLeft} label={t("reply")} onClick={onReply} />
        <ActionButton icon={Copy} label={t("copyText")} onClick={onCopy} />
        <ActionButton icon={SmilePlus} label={t("react")} onClick={onReact} />
        {onForward && (
          <ActionButton icon={Forward} label={t("forward")} onClick={onForward} />
        )}
        {/* TODO: Add when backend support is ready */}
        {/* <ActionButton icon={Pin} label={t("pin")} onClick={onPin} /> */}
        {/* <ActionButton icon={Star} label={t("star")} onClick={onStar} /> */}
        {/* <ActionButton icon={StickyNote} label={t("addToNote")} onClick={onAddToNote} /> */}
        {/* <ActionButton icon={Flag} label={t("report")} onClick={onReport} /> */}
        {/* <ActionButton icon={Trash2} label={t("delete")} onClick={onDelete} destructive /> */}
      </div>
    </>
  );
}

function ActionButton({
  icon: Icon,
  label,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex shrink-0 flex-col items-center gap-0.5 rounded-lg px-3 py-1.5 text-foreground transition-colors hover:bg-muted"
    >
      <Icon className="h-5 w-5" />
      <span className="text-[10px] leading-none">{label}</span>
    </button>
  );
}
