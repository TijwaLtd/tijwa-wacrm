"use client";

import {
  FileText,
  Image as ImageIcon,
  Mic,
  MessageSquareDashed,
  Zap,
  LayoutTemplate,
  Sparkles,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

export type ActionKind =
  | "document"
  | "photo"
  | "audio"
  | "interactive"
  | "quick-reply"
  | "template"
  | "ai-draft";

interface ActionPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (kind: ActionKind) => void;
  /** When true, media actions (document/photo/audio) are disabled. */
  mediaDisabled?: boolean;
  /** When true, text-based actions (interactive/quick-reply/template/ai-draft) are disabled. */
  textDisabled?: boolean;
}

interface ActionItem {
  kind: ActionKind;
  icon: React.ElementType;
  labelKey: string;
  color: string;
  bgColor: string;
  disabled?: boolean;
}

/**
 * WhatsApp-style action picker dialog. The single "+" button in the
 * composer opens this dialog, which shows all available actions in a
 * clean vertical list with colored icons.
 */
export function ActionPickerDialog({
  open,
  onOpenChange,
  onSelect,
  mediaDisabled = false,
  textDisabled = false,
}: ActionPickerDialogProps) {
  const t = useTranslations("Inbox.composer");

  const actions: ActionItem[] = [
    {
      kind: "document",
      icon: FileText,
      labelKey: "actionDocument",
      color: "text-blue-600 dark:text-blue-400",
      bgColor: "bg-blue-100 dark:bg-blue-900/30",
      disabled: mediaDisabled,
    },
    {
      kind: "photo",
      icon: ImageIcon,
      labelKey: "actionPhoto",
      color: "text-purple-600 dark:text-purple-400",
      bgColor: "bg-purple-100 dark:bg-purple-900/30",
      disabled: mediaDisabled,
    },
    {
      kind: "audio",
      icon: Mic,
      labelKey: "actionAudio",
      color: "text-orange-600 dark:text-orange-400",
      bgColor: "bg-orange-100 dark:bg-orange-900/30",
      disabled: mediaDisabled,
    },
    {
      kind: "interactive",
      icon: MessageSquareDashed,
      labelKey: "actionInteractive",
      color: "text-teal-600 dark:text-teal-400",
      bgColor: "bg-teal-100 dark:bg-teal-900/30",
      disabled: textDisabled,
    },
    {
      kind: "quick-reply",
      icon: Zap,
      labelKey: "actionQuickReply",
      color: "text-amber-600 dark:text-amber-400",
      bgColor: "bg-amber-100 dark:bg-amber-900/30",
      disabled: textDisabled,
    },
    {
      kind: "template",
      icon: LayoutTemplate,
      labelKey: "actionTemplate",
      color: "text-indigo-600 dark:text-indigo-400",
      bgColor: "bg-indigo-100 dark:bg-indigo-900/30",
      disabled: textDisabled,
    },
    {
      kind: "ai-draft",
      icon: Sparkles,
      labelKey: "actionAiDraft",
      color: "text-emerald-600 dark:text-emerald-400",
      bgColor: "bg-emerald-100 dark:bg-emerald-900/30",
      disabled: textDisabled,
    },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-xs p-0 gap-0 overflow-hidden"
        showCloseButton={false}
      >
        <DialogHeader className="px-4 pt-4 pb-2">
          <DialogTitle>{t("actions")}</DialogTitle>
        </DialogHeader>
        <div className="px-2 pb-2">
          {actions.map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.kind}
                type="button"
                disabled={action.disabled}
                onClick={() => {
                  onSelect(action.kind);
                  onOpenChange(false);
                }}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors",
                  action.disabled
                    ? "cursor-not-allowed opacity-40"
                    : "hover:bg-muted active:bg-muted/80"
                )}
              >
                <span
                  className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
                    action.bgColor
                  )}
                >
                  <Icon className={cn("h-4 w-4", action.color)} />
                </span>
                <span className="text-foreground">{t(action.labelKey)}</span>
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
