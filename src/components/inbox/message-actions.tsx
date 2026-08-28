"use client";

import { useState, useRef, useCallback, type ReactNode } from "react";
import {
  CornerUpLeft,
  Copy,
  Forward,
  SmilePlus,
  MoreVertical,
} from "lucide-react";
// TODO: Add these when backend support is ready
// import { Pin, Star, StickyNote, Flag, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Message } from "@/types";
import { useTranslations } from "next-intl";

const QUICK_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

/** Minimum horizontal distance (px) to count as a swipe */
const SWIPE_THRESHOLD = 60;

interface MessageActionsProps {
  message: Message;
  onReply: () => void;
  onReact: (emoji: string) => void;
  onForward?: () => void;
  // TODO: Add when backend support is ready
  // onDelete?: () => void;
  // onPin?: () => void;
  // onStar?: () => void;
  // onReport?: () => void;
  // onAddToNote?: () => void;
  /** Called on mobile long-press so the thread can show a mobile action bar */
  onMobileLongPress?: (messageId: string) => void;
  children: ReactNode;
}

/**
 * WhatsApp-style message action surface.
 *
 * Desktop: Right-click or click the ⋮ trigger opens a vertical dropdown menu.
 * Mobile: Long-press shows a thread-level action bar (via onMobileLongPress).
 * Mobile: Horizontal swipe right triggers reply.
 */
export function MessageActions({
  message,
  onReply,
  onReact,
  onForward,
  // onDelete,
  // onPin,
  // onStar,
  // onReport,
  // onAddToNote,
  onMobileLongPress,
  children,
}: MessageActionsProps) {
  const t = useTranslations("Inbox.actions");

  const [dropdownOpen, setDropdownOpen] = useState(false);

  const isAgent =
    message.sender_type === "agent" || message.sender_type === "bot";

  // ── Swipe-to-reply (mobile) ──────────────────────────────
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const swiping = useRef(false);
  const [swipeOffset, setSwipeOffset] = useState(0);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    swiping.current = false;
  }, []);

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      const dx = e.touches[0].clientX - touchStartX.current;
      const dy = e.touches[0].clientY - touchStartY.current;

      // Only track horizontal swipes (right direction, agent messages)
      if (Math.abs(dx) > Math.abs(dy) && dx > 10 && isAgent) {
        swiping.current = true;
        setSwipeOffset(Math.min(dx, 120));
      }
    },
    [isAgent],
  );

  const handleTouchEnd = useCallback(() => {
    if (swiping.current && swipeOffset > SWIPE_THRESHOLD) {
      onReply();
    }
    setSwipeOffset(0);
    swiping.current = false;
  }, [swipeOffset, onReply]);

  // ── Long-press (mobile) ──────────────────────────────────
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleTouchStartForLongPress = useCallback(() => {
    longPressTimer.current = setTimeout(() => {
      onMobileLongPress?.(message.id);
    }, 500);
  }, [message.id, onMobileLongPress]);

  const handleTouchEndForLongPress = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const handleTouchMoveForLongPress = useCallback(() => {
    // Cancel long-press if finger moves
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  // ── Desktop right-click ──────────────────────────────────
  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setDropdownOpen(true);
    },
    [],
  );

  // ── Action handlers ──────────────────────────────────────
  const handleCopy = async () => {
    const text = message.content_text ?? "";
    if (!text) {
      toast.error(t("nothingToCopy"));
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      toast.success(t("copied"));
    } catch {
      toast.error(t("copyFailed"));
    }
    setDropdownOpen(false);
  };

  const handlePickEmoji = (emoji: string) => {
    onReact(emoji);
    setDropdownOpen(false);
  };

  const handleReply = () => {
    onReply();
    setDropdownOpen(false);
  };

  const handleForward = () => {
    onForward?.();
    setDropdownOpen(false);
  };

  // TODO: Add when backend support is ready
  // const handlePin = () => { onPin?.(); toast.success(t("pinned")); setDropdownOpen(false); };
  // const handleStar = () => { onStar?.(); toast.success(t("starred")); setDropdownOpen(false); };
  // const handleAddToNote = () => { onAddToNote?.(); toast.success(t("addedToNote")); setDropdownOpen(false); };
  // const handleReport = () => { onReport?.(); toast.success(t("reported")); setDropdownOpen(false); };
  // const handleDelete = () => { onDelete?.(); setDropdownOpen(false); };

  return (
    <div
      className={cn(
        "flex w-full",
        isAgent ? "justify-end" : "justify-start",
      )}
      onContextMenu={handleContextMenu}
    >
      <div
        className={cn(
          "group/actions relative min-w-0 max-w-[75%]",
          // Swipe visual feedback
          swipeOffset > 0 && "transition-transform",
        )}
        style={
          swipeOffset > 0
            ? { transform: `translateX(-${swipeOffset}px)` }
            : undefined
        }
        onTouchStart={(e) => {
          handleTouchStart(e);
          handleTouchStartForLongPress();
        }}
        onTouchMove={(e) => {
          handleTouchMove(e);
          handleTouchMoveForLongPress();
        }}
        onTouchEnd={() => {
          handleTouchEnd();
          handleTouchEndForLongPress();
        }}
      >
        {/* Swipe reply indicator (visible when swiping agent messages) */}
        {swipeOffset > 20 && isAgent && (
          <div className="absolute -left-10 top-1/2 z-20 -translate-y-1/2 text-primary opacity-60">
            <CornerUpLeft className="h-5 w-5" />
          </div>
        )}

        {children}

        {/* Desktop: Dropdown trigger (hover-visible, inside the bubble) */}
        <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
          <DropdownMenuTrigger
            className={cn(
              "absolute z-10 flex h-7 w-7 items-center justify-center rounded-full",
              "opacity-0 transition-opacity",
              "bg-muted/80 hover:bg-muted",
              "group-hover/actions:opacity-100 group-focus-within/actions:opacity-100",
              isAgent ? "left-0 -translate-x-1/2 -translate-y-1/2" : "right-0 translate-x-1/2 -translate-y-1/2",
              "top-0",
            )}
          >
            <MoreVertical className="h-4 w-4 font-bold text-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align={isAgent ? "start" : "end"}
            side={isAgent ? "right" : "left"}
            className="w-56"
          >
            <DropdownMenuItem onClick={handleReply}>
              <CornerUpLeft className="mr-2 h-4 w-4" />
              {t("reply")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleCopy}>
              <Copy className="mr-2 h-4 w-4" />
              {t("copyText")}
            </DropdownMenuItem>

            {/* React submenu trigger */}
            <DropdownMenu>
              <DropdownMenuTrigger
                className="flex w-full cursor-pointer items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
              >
                <SmilePlus className="mr-2 h-4 w-4" />
                {t("react")}
              </DropdownMenuTrigger>
              <DropdownMenuContent
                side="right"
                className="flex w-auto flex-row gap-1 p-1.5"
              >
                {QUICK_EMOJIS.map((e) => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => handlePickEmoji(e)}
                    className="flex h-8 w-8 items-center justify-center rounded-full text-lg leading-none transition-transform hover:scale-125 hover:bg-muted"
                    aria-label={t("reactWith", { emoji: e })}
                  >
                    {e}
                  </button>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {onForward && (
              <DropdownMenuItem onClick={handleForward}>
                <Forward className="mr-2 h-4 w-4" />
                {t("forward")}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
