"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, MessageSquare, Pencil, Plus, Trash2, Zap, Workflow } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SettingsPanelHead } from "./settings-panel-head";
import {
  InteractiveBuilder,
  blankButtonsPayload,
} from "@/components/interactive/interactive-builder";
import {
  interactivePayloadPreviewText,
  type InteractiveMessagePayload,
} from "@/lib/whatsapp/interactive";
import type { QuickReply, QuickReplyKind } from "@/types";

interface FlowSummary {
  id: string;
  name: string;
  status: string;
}

interface DraftState {
  id?: string;
  title: string;
  kind: QuickReplyKind;
  content_text: string;
  interactive_payload: InteractiveMessagePayload;
  flow_id: string | null;
}

function emptyDraft(): DraftState {
  return {
    title: "",
    kind: "text",
    content_text: "",
    interactive_payload: blankButtonsPayload(),
    flow_id: null,
  };
}

export function QuickRepliesManager() {
  const t = useTranslations("Settings.quickReplies");
  const [items, setItems] = useState<QuickReply[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<DraftState | null>(null);
  const [saving, setSaving] = useState(false);
  const [flows, setFlows] = useState<FlowSummary[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/quick-replies", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (res.ok) setItems((data.quick_replies as QuickReply[]) ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadFlows = useCallback(async () => {
    try {
      const res = await fetch("/api/flows", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        const active = (data.flows ?? []).filter(
          (f: FlowSummary) => f.status === "active" || f.status === "draft",
        );
        setFlows(active);
      }
    } catch {
      // Flows list is best-effort
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    void loadFlows();
  }, [load, loadFlows]);

  const openCreate = () => setDraft(emptyDraft());
  const openEdit = (qr: QuickReply) =>
    setDraft({
      id: qr.id,
      title: qr.title,
      kind: qr.kind,
      content_text: qr.content_text ?? "",
      interactive_payload:
        qr.interactive_payload ?? blankButtonsPayload(),
      flow_id: qr.flow_id ?? null,
    });

  const save = useCallback(async () => {
    if (!draft) return;
    if (!draft.title.trim()) {
      toast.error(t("nameRequired"));
      return;
    }
    const payload =
      draft.kind === "interactive"
        ? { title: draft.title, kind: "interactive", interactive_payload: draft.interactive_payload, flow_id: draft.flow_id }
        : { title: draft.title, kind: "text", content_text: draft.content_text, flow_id: draft.flow_id };

    setSaving(true);
    try {
      const res = await fetch(
        draft.id ? `/api/quick-replies/${draft.id}` : "/api/quick-replies",
        {
          method: draft.id ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? t("saveFailed"));
        return;
      }
      toast.success(t("saveSuccess"));
      setDraft(null);
      await load();
    } catch {
      toast.error(t("saveFailed"));
    } finally {
      setSaving(false);
    }
  }, [draft, load, t]);

  const remove = useCallback(
    async (id: string) => {
      if (!window.confirm(t("deleteConfirm"))) return;
      const res = await fetch(`/api/quick-replies/${id}`, { method: "DELETE" });
      if (!res.ok) {
        toast.error(t("deleteFailed"));
        return;
      }
      await load();
    },
    [load, t],
  );

  return (
    <div>
      <SettingsPanelHead
        title={t("title")}
        description={t("description")}
        action={
          <Button onClick={openCreate}>
            <Plus className="mr-1 h-4 w-4" />
            {t("newQuickReply")}
          </Button>
        }
      />

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
          No quick replies yet. Create one to reuse it across conversations.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((qr) => (
            <li
              key={qr.id}
              className="flex items-start gap-3 rounded-lg border border-border bg-card p-3"
            >
              {qr.kind === "interactive" ? (
                <Zap className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              ) : (
                <MessageSquare className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-medium text-foreground">{qr.title}</p>
                  {qr.flow_id && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                      <Workflow className="h-2.5 w-2.5" />
                      {t("flowLinked")}
                    </span>
                  )}
                </div>
                <p className="truncate text-xs text-muted-foreground">
                  {qr.kind === "interactive" && qr.interactive_payload
                    ? interactivePayloadPreviewText(qr.interactive_payload)
                    : qr.content_text}
                </p>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button variant="ghost" size="icon-sm" onClick={() => openEdit(qr)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => remove(qr.id)}
                  className="text-red-400 hover:bg-red-500/10 hover:text-red-300"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{draft?.id ? t("editQuickReply") : t("newQuickReply")}</DialogTitle>
          </DialogHeader>
          {draft && (
            <div className="max-h-[70vh] space-y-3 overflow-y-auto">
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">{t("quickReplyName")}</label>
                <Input
                  value={draft.title}
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                  placeholder={t("quickReplyNamePlaceholder")}
                  className="bg-muted text-foreground"
                />
              </div>
              <div className="flex gap-2">
                <KindTab
                  active={draft.kind === "text"}
                  label={t("text")}
                  onClick={() => setDraft({ ...draft, kind: "text" })}
                />
                <KindTab
                  active={draft.kind === "interactive"}
                  label={t("interactive")}
                  onClick={() => setDraft({ ...draft, kind: "interactive" })}
                />
              </div>
              {draft.kind === "text" ? (
                <Textarea
                  value={draft.content_text}
                  onChange={(e) => setDraft({ ...draft, content_text: e.target.value })}
                  placeholder={t("contentTextPlaceholder")}
                  className="min-h-28 bg-muted text-foreground"
                />
              ) : (
                <>
                  <InteractiveBuilder
                    value={draft.interactive_payload}
                    onChange={(p) => setDraft({ ...draft, interactive_payload: p })}
                  />
                  <div>
                    <label className="mb-1 block text-xs text-muted-foreground">
                      {t("linkToFlow")}
                    </label>
                    <p className="mb-2 text-[11px] text-muted-foreground">
                      {t("linkToFlowHint")}
                    </p>
                    <Select
                      value={draft.flow_id ?? "__none__"}
                      onValueChange={(v) =>
                        setDraft({ ...draft, flow_id: v === "__none__" ? null : v })
                      }
                    >
                      <SelectTrigger className="bg-muted text-foreground">
                        <SelectValue placeholder={t("noFlowLinked")} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">{t("noFlowLinked")}</SelectItem>
                        {flows.map((f) => (
                          <SelectItem key={f.id} value={f.id}>
                            {f.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDraft(null)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function KindTab({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? "flex-1 rounded-md border border-primary bg-primary/10 px-3 py-1.5 text-sm font-medium text-primary"
          : "flex-1 rounded-md border border-border bg-muted px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
      }
    >
      {label}
    </button>
  );
}
