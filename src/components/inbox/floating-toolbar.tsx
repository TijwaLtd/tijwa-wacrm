"use client";

import {
  Bold,
  Italic,
  Strikethrough,
  Code,
  List,
  ListOrdered,
  Quote,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export type ToolbarAction = "bold" | "italic" | "strikethrough" | "code" | "bullet" | "ordered" | "quote";

interface FloatingToolbarProps {
  onAction: (action: ToolbarAction) => void;
  visible: boolean;
  position: { top: number; left: number };
}

const tools: { action: ToolbarAction; icon: typeof Bold; label: string; shortcut: string }[] = [
  { action: "bold", icon: Bold, label: "Bold", shortcut: "Ctrl+B" },
  { action: "italic", icon: Italic, label: "Italic", shortcut: "Ctrl+I" },
  { action: "strikethrough", icon: Strikethrough, label: "Strikethrough", shortcut: "Ctrl+Shift+X" },
  { action: "code", icon: Code, label: "Code", shortcut: "Ctrl+E" },
  { action: "bullet", icon: List, label: "Bulleted List", shortcut: "" },
  { action: "ordered", icon: ListOrdered, label: "Numbered List", shortcut: "" },
  { action: "quote", icon: Quote, label: "Blockquote", shortcut: "" },
];

export function FloatingToolbar({ onAction, visible, position }: FloatingToolbarProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!visible || !ref.current) return;
    const el = ref.current;

    // Keep toolbar within viewport
    const rect = el.getBoundingClientRect();
    const viewW = window.innerWidth;
    const viewH = window.innerHeight;

    let { top, left } = position;

    // Horizontal overflow → shift left
    if (left + rect.width / 2 > viewW - 8) {
      left = viewW - rect.width / 2 - 8;
    }
    // Left overflow → shift right
    if (left - rect.width / 2 < 8) {
      left = rect.width / 2 + 8;
    }
    // Vertical overflow → show below selection instead of above
    if (top < 0) {
      top = Math.abs(top) + 40;
    }

    el.style.top = `${top}px`;
    el.style.left = `${left}px`;
  }, [visible, position]);

  if (!visible) return null;

  return (
    <div
      ref={ref}
      data-floating-toolbar
      className={cn(
        "fixed z-50 -translate-x-1/2 -translate-y-full",
        "flex items-center gap-0.5 rounded-lg border bg-popover px-1.5 py-1 shadow-lg",
        "animate-in fade-in-0 zoom-in-95 duration-100",
      )}
    >
      {tools.map(({ action, icon: Icon, label, shortcut }) => (
        <button
          key={action}
          type="button"
          title={`${label}${shortcut ? ` (${shortcut})` : ""}`}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onAction(action);
          }}
          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          <Icon className="h-4 w-4" />
        </button>
      ))}
    </div>
  );
}
