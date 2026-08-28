"use client";

import {
  useState,
  useRef,
  useCallback,
  useEffect,
  useMemo,
  KeyboardEvent,
} from "react";
import {
  Send,
  Mic,
  Square,
  X,
  Loader2,
  Plus,
  LayoutTemplate,
  Zap,
  FileText,
  Smile,
  Camera,
  Paperclip,
} from "lucide-react";
import EmojiPicker from "emoji-picker-react";
import { Button } from "@/components/ui/button";
import { GatedButton } from "@/components/ui/gated-button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useCan } from "@/hooks/use-can";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  uploadAccountMedia,
  deleteAccountMedia,
  MEDIA_MAX_BYTES_BY_KIND,
} from "@/lib/storage/upload-media";
import { ReplyQuote } from "./reply-quote";
import { useTranslations } from "next-intl";
import {
  InteractiveBuilder,
  blankButtonsPayload,
} from "@/components/interactive/interactive-builder";
import { validateInteractivePayload } from "@/lib/whatsapp/interactive";
import type { InteractiveMessagePayload, QuickReply } from "@/types";
import { QuickReplyPicker } from "./quick-reply-picker";
import { ActionPickerDialog, type ActionKind } from "./action-picker-dialog";
import { FloatingToolbar, type ToolbarAction } from "./floating-toolbar";

/** Media content types an agent can send from the composer. */
export type ComposerMediaKind = "image" | "video" | "document" | "audio";

/** Supabase Storage bucket holding agent-sent chat attachments (migration 023). */
export const CHAT_MEDIA_BUCKET = "chat-media";

/** Meta caps media captions at 1024 chars. Enforced here and in the send route. */
export const MEDIA_CAPTION_MAX = 1024;

/** Hard cap on a single voice recording so it can't blow the upload/
 *  transcode limits — auto-stops the recorder when reached. */
const MAX_RECORDING_SECONDS = 5 * 60;

export interface SendMediaPayload {
  kind: ComposerMediaKind;
  /** Public chat-media URL Meta fetches at send time. */
  mediaUrl: string;
  /** Storage object path — lets the caller GC the object if the send fails. */
  path: string;
  /** Optional caption (image/video/document only). */
  caption?: string;
  /** Original file name — surfaced to the recipient for documents. */
  filename?: string;
  replyToId?: string;
}

interface ReplyDraft {
  /** Internal UUID of the message being replied to — sent back through onSend. */
  id: string;
  authorLabel: string;
  preview: string;
}

// Mirrors the chat-media bucket's allowed_mime_types (migration 023) for
// the file picker so unsupported files are rejected before upload rather
// than failing with a confusing Storage error. Audio has no picker — it's
// captured via the recorder.
const PICKER_ACCEPT: Record<"image" | "video" | "document", string> = {
  image: "image/png,image/jpeg,image/webp",
  video: "video/mp4,video/3gpp",
  document:
    "application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,text/plain",
};

interface MediaDraft {
  kind: ComposerMediaKind;
  mediaUrl: string;
  /** Storage path — used to GC the object if the draft is discarded. */
  path: string;
  filename: string;
  caption: string;
}

interface MessageComposerProps {
  conversationId: string;
  sessionExpired: boolean;
  onSend: (text: string, replyToId?: string) => void;
  onSendMedia?: (payload: SendMediaPayload) => void;
  onSendInteractive?: (payload: InteractiveMessagePayload, replyToId?: string) => void;
  onOpenTemplates?: () => void;
  replyTo?: ReplyDraft | null;
  onClearReply?: () => void;
  /** When true, only text input is shown (team conversations). */
  isTeam?: boolean;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Worker that encodes mic input to Ogg/Opus entirely in the browser
 *  (vendored from opus-recorder into /public). Recording client-side in a
 *  Meta-accepted format means no server ffmpeg / transcode step. */
const OPUS_ENCODER_PATH = "/opus/encoderWorker.min.js";

export function MessageComposer({
  conversationId,
  sessionExpired,
  onSend,
  onSendMedia,
  onSendInteractive,
  onOpenTemplates,
  replyTo,
  onClearReply,
  isTeam = false,
}: MessageComposerProps) {
  const t = useTranslations("Inbox.composer");

  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);

  // Two textareas exist in the DOM simultaneously (desktop + mobile
  // layouts, toggled purely via `hidden sm:flex` / `flex sm:hidden`), so
  // each needs its own ref. A single shared ref would always resolve to
  // whichever textarea React committed last (the mobile one), regardless
  // of which is actually visible/focused — silently breaking selection
  // detection, focus restoration, and auto-grow on desktop.
  const desktopTextareaRef = useRef<HTMLTextAreaElement>(null);
  const mobileTextareaRef = useRef<HTMLTextAreaElement>(null);

  // Resolves to whichever textarea the user is actually interacting with.
  // Prefers the currently-focused one; falls back to whichever is
  // actually rendered/visible (offsetParent is null for display:none
  // elements) for cases where nothing is focused yet.
  const getActiveTextarea = useCallback((): HTMLTextAreaElement | null => {
    const active = document.activeElement;
    if (active === desktopTextareaRef.current) return desktopTextareaRef.current;
    if (active === mobileTextareaRef.current) return mobileTextareaRef.current;
    return desktopTextareaRef.current?.offsetParent
      ? desktopTextareaRef.current
      : mobileTextareaRef.current;
  }, []);

  // Interactive-message builder dialog + quick-reply picker.
  const [interactiveOpen, setInteractiveOpen] = useState(false);
  const [interactivePayload, setInteractivePayload] =
    useState<InteractiveMessagePayload>(blankButtonsPayload);
  const [savingQuickReply, setSavingQuickReply] = useState(false);
  const [quickReplyOpen, setQuickReplyOpen] = useState(false);

  // Action picker dialog (WhatsApp-style "+" menu).
  const [actionPickerOpen, setActionPickerOpen] = useState(false);

  // Floating formatting toolbar state.
  const [toolbarVisible, setToolbarVisible] = useState(false);
  const [toolbarPos, setToolbarPos] = useState({ top: 0, left: 0 });
  const selectionRef = useRef<{ start: number; end: number } | null>(null);

  // Slash-command quick-reply menu state.
  const [slashMenuOpen, setSlashMenuOpen] = useState(false);
  const [slashItems, setSlashItems] = useState<QuickReply[]>([]);
  const [slashQuery, setSlashQuery] = useState("");
  const [slashIndex, setSlashIndex] = useState(0);
  const slashMenuRef = useRef<HTMLDivElement>(null);

  // Media attachment state. `draft` holds an uploaded-but-not-yet-sent
  // attachment; `busy` covers the upload/transcode window.
  const [draft, setDraft] = useState<MediaDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const documentInputRef = useRef<HTMLInputElement>(null);
  // Mirror of `draft` for the unmount cleanup, which can't read render
  // state. Kept in sync below so navigating away with a staged-but-unsent
  // attachment GCs the orphaned object.
  const draftRef = useRef<MediaDraft | null>(null);
  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  // Best-effort GC of a staged object the user never sent. Fire-and-forget.
  const removeStaged = useCallback((path: string | undefined) => {
    if (!path) return;
    void deleteAccountMedia(CHAT_MEDIA_BUCKET, path).catch(() => {});
  }, []);

  // Voice recording state. The recorder encodes Ogg/Opus in-browser
  // (opus-recorder) so there's no server-side transcode.
  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const recorderRef = useRef<import("opus-recorder").default | null>(null);
  const cancelledRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Viewers (read-only role) can browse the inbox but never send.
  // For solo users this is always true — single-owner accounts pass
  // every capability — so the disabled branch is a no-op there.
  const canSend = useCan("send-messages");
  const readOnly = !canSend;
  // Media (like free-form text) is only allowed inside the 24h window.
  const inputsDisabled = readOnly || sessionExpired;

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Tear down any live recording + timer on unmount so a mid-record
  // navigation doesn't leak the mic, and GC a staged-but-unsent
  // attachment so it doesn't orphan in the bucket.
  useEffect(() => {
    return () => {
      clearTimer();
      cancelledRef.current = true;
      // stop() releases the mic stream + audio context inside opus-recorder.
      void recorderRef.current?.stop().catch(() => {});
      removeStaged(draftRef.current?.path);
    };
  }, [clearTimer, removeStaged]);

  const adjustHeight = useCallback(() => {
    const el = getActiveTextarea();
    if (!el) return;
    el.style.height = "auto";
    // Max 4 lines (~96px)
    el.style.height = `${Math.min(el.scrollHeight, 96)}px`;
  }, [getActiveTextarea]);

  const handleSend = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed || sending || sessionExpired) return;

    setSending(true);
    try {
      onSend(trimmed, replyTo?.id);
      setText("");
      const el = getActiveTextarea();
      if (el) {
        el.style.height = "auto";
      }
    } finally {
      setSending(false);
    }
  }, [text, sending, sessionExpired, onSend, replyTo?.id, getActiveTextarea]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const val = e.target.value;
      setText(val);
      adjustHeight();

      // Slash-command detection: text ends with "/" or "/query"
      const lines = val.split("\n");
      const lastLine = lines[lines.length - 1] ?? "";
      const slashMatch = lastLine.match(/^\/(.*)$/);
      if (slashMatch) {
        const q = slashMatch[1].toLowerCase();
        setSlashQuery(q);
        setSlashIndex(0);
        setSlashMenuOpen(true);
        // Load from IndexedDB (instant)
        void (async () => {
          try {
            const { getAllQuickReplies } = await import("@/lib/db");
            const all = await getAllQuickReplies();
            setSlashItems(all);
          } catch {
            setSlashItems([]);
          }
        })();
      } else {
        setSlashMenuOpen(false);
      }
    },
    [adjustHeight],
  );

  // Ask the AI assistant for a suggested reply and drop it into the
  // composer for the agent to edit + send. Read-only server-side —
  // nothing is sent until the agent hits Send.
  const handleDraft = useCallback(async () => {
    if (drafting) return;
    setDrafting(true);
    try {
      const res = await fetch("/api/ai/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversation_id: conversationId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.code === "ai_not_configured") {
          toast.error("AI isn't set up yet — enable it in Settings → AI Assistant.");
        } else {
          toast.error(data.error ?? "Couldn't draft a reply.");
        }
        return;
      }
      const draftText = typeof data.draft === "string" ? data.draft.trim() : "";
      if (!draftText) {
        toast.error("The assistant didn't return a reply.");
        return;
      }
      setText(draftText);
      // Let the textarea grow to fit and drop the cursor at the end so
      // the agent can tweak immediately.
      requestAnimationFrame(() => {
        adjustHeight();
        const el = getActiveTextarea();
        if (el) {
          el.focus();
          el.setSelectionRange(el.value.length, el.value.length);
        }
      });
    } catch {
      toast.error("Couldn't reach the AI assistant.");
    } finally {
      setDrafting(false);
    }
  }, [drafting, conversationId, adjustHeight, getActiveTextarea]);

  // ---- Interactive message + quick replies --------------------------

  const openInteractiveBuilder = useCallback(
    (seed?: InteractiveMessagePayload) => {
      setInteractivePayload(seed ?? blankButtonsPayload());
      setInteractiveOpen(true);
    },
    [],
  );

  // ---- Slash-command quick-reply menu -----------------------------------

  const filteredSlashItems = useMemo(() => {
    if (!slashQuery) return slashItems;
    return slashItems.filter(
      (qr) =>
        qr.title.toLowerCase().includes(slashQuery) ||
        (qr.content_text ?? "").toLowerCase().includes(slashQuery),
    );
  }, [slashItems, slashQuery]);

  const selectSlashItem = useCallback(
    (qr: QuickReply) => {
      const lines = text.split("\n");
      lines.pop(); // remove the "/query" line
      if (qr.kind === "interactive" && qr.interactive_payload) {
        openInteractiveBuilder(qr.interactive_payload);
      } else {
        const insertion = qr.content_text ?? "";
        if (insertion) lines.push(insertion);
      }
      const next = lines.join("\n");
      setText(next);
      setSlashMenuOpen(false);
      requestAnimationFrame(() => {
        adjustHeight();
        const el = getActiveTextarea();
        if (el) {
          el.focus();
          el.setSelectionRange(el.value.length, el.value.length);
        }
      });
    },
    [text, openInteractiveBuilder, adjustHeight, getActiveTextarea],
  );

  // Scroll the selected slash-menu item into view.
  useEffect(() => {
    if (!slashMenuOpen) return;
    const container = slashMenuRef.current;
    if (!container) return;
    const btn = container.children[slashIndex] as HTMLElement | undefined;
    btn?.scrollIntoView({ block: "nearest" });
  }, [slashMenuOpen, slashIndex]);

  // Close the slash menu on click-outside.
  useEffect(() => {
    if (!slashMenuOpen) return;
    const handle = (e: MouseEvent) => {
      if (slashMenuRef.current && !slashMenuRef.current.contains(e.target as Node)) {
        setSlashMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [slashMenuOpen]);

  // Close the emoji picker on click-outside.
  useEffect(() => {
    if (!emojiPickerOpen) return;
    const handle = (e: MouseEvent) => {
      if (!(e.target as Element).closest(".emoji-picker-react")) {
        setEmojiPickerOpen(false);
      }
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [emojiPickerOpen]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      // Formatting shortcuts (Ctrl+B/I/E/X) — must come before slash-menu
      // check so they fire even when the slash menu is open.
      handleToolbarShortcut(e);

      // Slash-menu keyboard navigation
      if (slashMenuOpen && filteredSlashItems.length > 0) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setSlashIndex((i) => (i + 1) % filteredSlashItems.length);
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setSlashIndex((i) => (i - 1 + filteredSlashItems.length) % filteredSlashItems.length);
          return;
        }
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          selectSlashItem(filteredSlashItems[slashIndex]);
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          setSlashMenuOpen(false);
          return;
        }
      }

      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [handleSend, slashMenuOpen, filteredSlashItems, slashIndex, selectSlashItem],
  );

  const sendInteractive = useCallback(() => {
    const result = validateInteractivePayload(interactivePayload);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    onSendInteractive?.(interactivePayload, replyTo?.id);
    setInteractiveOpen(false);
    onClearReply?.();
  }, [interactivePayload, onSendInteractive, replyTo?.id, onClearReply]);

  // Persist the current builder payload as a reusable interactive snippet.
  const saveAsQuickReply = useCallback(async () => {
    const result = validateInteractivePayload(interactivePayload);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    const title = window
      .prompt(t("quickReplyNamePrompt"))
      ?.trim();
    if (!title) return;
    setSavingQuickReply(true);
    try {
      const res = await fetch("/api/quick-replies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          kind: "interactive",
          interactive_payload: interactivePayload,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? t("quickReplySaveError"));
        return;
      }
      toast.success(t("quickReplySaved"));
    } catch {
      toast.error(t("quickReplySaveError"));
    } finally {
      setSavingQuickReply(false);
    }
  }, [interactivePayload, t]);

  // A picked quick reply: text fills the composer; interactive opens the
  // builder pre-filled so the agent can tweak before sending.
  const handlePickQuickReply = useCallback(
    (qr: QuickReply) => {
      setQuickReplyOpen(false);
      if (qr.kind === "interactive" && qr.interactive_payload) {
        openInteractiveBuilder(qr.interactive_payload);
        return;
      }
      const body = qr.content_text ?? "";
      // Separate the snippet from any existing draft with a newline so the
      // words don't run together ("Thanks" + "we'll…" → "Thankswe'll…").
      setText((prev) =>
        prev && !/\s$/.test(prev) ? `${prev}\n${body}` : `${prev}${body}`,
      );
      requestAnimationFrame(() => {
        adjustHeight();
        const el = getActiveTextarea();
        if (el) {
          el.focus();
          el.setSelectionRange(el.value.length, el.value.length);
        }
      });
    },
    [openInteractiveBuilder, adjustHeight, getActiveTextarea],
  );

  // ---- Voice recording (client-side Ogg/Opus, no server transcode) ---

  // The encoded Ogg/Opus file from opus-recorder → upload as an audio
  // draft. WhatsApp renders Ogg/Opus as a playable voice note.
  const finalizeRecording = useCallback(
    async (bytes: Uint8Array) => {
      // Uint8Array is a valid BlobPart at runtime; the cast sidesteps the
      // lib.dom ArrayBufferLike-vs-ArrayBuffer generic mismatch.
      const file = new File([bytes as unknown as BlobPart], `voice-${Date.now()}.ogg`, {
        type: "audio/ogg",
      });
      if (file.size === 0) return; // cancelled / empty take
      if (file.size > MEDIA_MAX_BYTES_BY_KIND.audio) {
        toast.error("Recording is too long (over 16 MB).");
        return;
      }
      setBusy(true);
      try {
        const { publicUrl, path } = await uploadAccountMedia(CHAT_MEDIA_BUCKET, file);
        removeStaged(draftRef.current?.path);
        setDraft({ kind: "audio", mediaUrl: publicUrl, path, filename: file.name, caption: "" });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Upload failed.");
      } finally {
        setBusy(false);
      }
    },
    [removeStaged],
  );

  const startRecording = useCallback(async () => {
    if (inputsDisabled || busy || recording) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof AudioContext === "undefined") {
      toast.error("Voice recording isn't supported in this browser.");
      return;
    }
    try {
      // Lazy-load the encoder (≈400 KB worker) only when the user records,
      // keeping it out of the main bundle.
      const { default: Recorder } = await import("opus-recorder");
      const recorder = new Recorder({
        encoderPath: OPUS_ENCODER_PATH,
        numberOfChannels: 1,
        encoderApplication: 2048, // VOIP — tuned for speech
        encoderSampleRate: 48000,
        streamPages: false, // one callback with the complete file on stop
      });
      cancelledRef.current = false;
      recorder.ondataavailable = (bytes) => {
        if (cancelledRef.current) return;
        void finalizeRecording(bytes);
      };
      recorderRef.current = recorder;
      await recorder.start();
      setRecording(true);
      setRecordSeconds(0);
      timerRef.current = setInterval(() => setRecordSeconds((s) => s + 1), 1000);
    } catch {
      void recorderRef.current?.stop().catch(() => {});
      recorderRef.current = null;
      toast.error("Microphone access denied or unavailable.");
    }
  }, [inputsDisabled, busy, recording, finalizeRecording]);

  // Handle action selection from the ActionPickerDialog.
  const handleActionSelect = useCallback(
    (kind: ActionKind) => {
      switch (kind) {
        case "document":
          documentInputRef.current?.click();
          break;
        case "photo":
          imageInputRef.current?.click();
          break;
        case "audio":
          void startRecording();
          break;
        case "interactive":
          openInteractiveBuilder();
          break;
        case "quick-reply":
          setQuickReplyOpen(true);
          break;
        case "template":
          onOpenTemplates?.();
          break;
        case "ai-draft":
          void handleDraft();
          break;
      }
    },
    [openInteractiveBuilder, onOpenTemplates, handleDraft, startRecording]
  );

  // Upload a captured file to chat-media and stage it as a draft.
  const stageUpload = useCallback(
    async (kind: ComposerMediaKind, file: File) => {
      // Per-kind ceiling mirrors Meta's caps (image 5 MB, etc.) so we
      // reject before upload rather than orphaning an object that Meta
      // would then refuse at send.
      const max = MEDIA_MAX_BYTES_BY_KIND[kind];
      if (file.size > max) {
        toast.error(
          `File is ${(file.size / 1024 / 1024).toFixed(1)} MB — ${kind} limit is ${Math.round(
            max / 1024 / 1024,
          )} MB.`,
        );
        return;
      }
      setBusy(true);
      try {
        const { publicUrl, path } = await uploadAccountMedia(CHAT_MEDIA_BUCKET, file);
        // Replacing an existing draft? GC the previous object first.
        removeStaged(draftRef.current?.path);
        setDraft({ kind, mediaUrl: publicUrl, path, filename: file.name, caption: "" });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Upload failed.");
      } finally {
        setBusy(false);
      }
    },
    [removeStaged],
  );

  const handlePicked = useCallback(
    (kind: "image" | "video" | "document", file: File | undefined) => {
      if (file) void stageUpload(kind, file);
    },
    [stageUpload],
  );

  // ── Paste-to-upload ────────────────────────────────────────
  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      if (inputsDisabled || !onSendMedia) return;
      const items = Array.from(e.clipboardData.items);
      for (const item of items) {
        const kind = item.kind;
        if (kind === "file") {
          const file = item.getAsFile();
          if (!file) continue;
          e.preventDefault();
          const mime = file.type;
          if (mime.startsWith("image/")) {
            void stageUpload("image", file);
          } else if (mime.startsWith("video/")) {
            void stageUpload("video", file);
          } else {
            void stageUpload("document", file);
          }
          return;
        }
      }
    },
    [inputsDisabled, onSendMedia, stageUpload],
  );

  const stopRecording = useCallback(() => {
    clearTimer();
    setRecording(false);
    void recorderRef.current?.stop().catch(() => {});
  }, [clearTimer]);

  // ── Formatting toolbar helpers ──────────────────────────────

  /** Wrap the current selection in WhatsApp formatting markers. */
  const applyFormatting = useCallback(
    (action: ToolbarAction) => {
      const el = getActiveTextarea();
      if (!el) return;

      const start = el.selectionStart;
      const end = el.selectionEnd;
      const selected = text.slice(start, end);

      // No selection → nothing to wrap
      if (start === end || !selected) {
        setToolbarVisible(false);
        return;
      }

      let wrapped: string;
      let cursorOffset = 0;

      switch (action) {
        case "bold":
          wrapped = `*${selected}*`;
          cursorOffset = 1;
          break;
        case "italic":
          wrapped = `_${selected}_`;
          cursorOffset = 1;
          break;
        case "strikethrough":
          wrapped = `~${selected}~`;
          cursorOffset = 1;
          break;
        case "code":
          wrapped = `\`${selected}\``;
          cursorOffset = 1;
          break;
        case "bullet": {
          // Wrap each selected line with "- "
          const lines = selected.split("\n");
          wrapped = lines.map((l) => `- ${l}`).join("\n");
          cursorOffset = 2;
          break;
        }
        case "ordered": {
          const lines = selected.split("\n");
          wrapped = lines.map((l, i) => `${i + 1}. ${l}`).join("\n");
          cursorOffset = 3;
          break;
        }
        case "quote": {
          const lines = selected.split("\n");
          wrapped = lines.map((l) => `> ${l}`).join("\n");
          cursorOffset = 2;
          break;
        }
        default:
          return;
      }

      const newText = text.slice(0, start) + wrapped + text.slice(end);
      setText(newText);
      setToolbarVisible(false);

      // Restore cursor inside the wrapped text
      requestAnimationFrame(() => {
        el.focus();
        const newCursorPos = start + cursorOffset + selected.length;
        el.setSelectionRange(newCursorPos, newCursorPos);
      });
    },
    [text, getActiveTextarea],
  );

  /** Keyboard shortcuts: Ctrl/Cmd+B/I/E, Ctrl/Cmd+Shift+X */
  const handleToolbarShortcut = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;

      const el = getActiveTextarea();
      if (!el) return;

      const start = el.selectionStart;
      const end = el.selectionEnd;
      if (start === end) return; // no selection

      let action: ToolbarAction | null = null;

      if (e.key === "b" || e.key === "B") {
        action = "bold";
      } else if (e.key === "i" || e.key === "I") {
        action = "italic";
      } else if (e.key === "e" || e.key === "E") {
        action = "code";
      } else if (e.shiftKey && (e.key === "x" || e.key === "X")) {
        action = "strikethrough";
      }

      if (action) {
        e.preventDefault();
        applyFormatting(action);
      }
    },
    [applyFormatting, getActiveTextarea],
  );

  /** Detect text selection to show/hide the floating toolbar. */
  const checkSelection = useCallback(() => {
    const el = getActiveTextarea();
    if (!el || document.activeElement !== el) {
      setToolbarVisible(false);
      return;
    }

    const start = el.selectionStart;
    const end = el.selectionEnd;

    if (start === end) {
      setToolbarVisible(false);
      return;
    }

    // Store selection for restoration
    selectionRef.current = { start, end };

    // Position: centered above the textarea, near the top.
    // We can't precisely measure caret position in a textarea,
    // so we show it centered horizontally above the input.
    const elRect = el.getBoundingClientRect();
    const top = elRect.top - 48;
    const left = elRect.left + elRect.width / 2;

    setToolbarPos({ top, left });
    setToolbarVisible(true);
  }, [getActiveTextarea]);

  // Listen for selection changes via multiple events for reliability.
  // selectionchange covers most cases; mouseup/keyup catch edge cases
  // where selectionchange fires before the selection is finalized.
  useEffect(() => {
    const onSelection = () => checkSelection();
    document.addEventListener("selectionchange", onSelection);
    return () => document.removeEventListener("selectionchange", onSelection);
  }, [checkSelection]);

  // Hide toolbar on click outside either textarea and outside the toolbar
  useEffect(() => {
    if (!toolbarVisible) return;
    const hide = (e: MouseEvent) => {
      const target = e.target as Node;
      // Don't hide if clicking either textarea or inside the toolbar
      if (desktopTextareaRef.current?.contains(target)) return;
      if (mobileTextareaRef.current?.contains(target)) return;
      if (document.querySelector("[data-floating-toolbar]")?.contains(target)) return;
      setToolbarVisible(false);
    };
    document.addEventListener("mousedown", hide);
    return () => document.removeEventListener("mousedown", hide);
  }, [toolbarVisible]);

  const cancelRecording = useCallback(() => {
    cancelledRef.current = true;
    clearTimer();
    setRecording(false);
    void recorderRef.current?.stop().catch(() => {});
  }, [clearTimer]);

  // Auto-stop at the cap so a forgotten recording can't blow the
  // upload size limit.
  useEffect(() => {
    if (recording && recordSeconds >= MAX_RECORDING_SECONDS) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      stopRecording();
    }
  }, [recording, recordSeconds, stopRecording]);

  // ---- Draft send / discard -----------------------------------------

  const sendDraft = useCallback(() => {
    if (!draft || busy || !onSendMedia) return;
    onSendMedia({
      kind: draft.kind,
      mediaUrl: draft.mediaUrl,
      path: draft.path,
      // Audio takes no caption (Meta rejects it). Everything else: the
      // trimmed caption, or undefined when blank.
      caption:
        draft.kind === "audio" ? undefined : draft.caption.trim() || undefined,
      filename: draft.kind === "document" ? draft.filename : undefined,
      replyToId: replyTo?.id,
    });
    // The object is now owned by the sent message — clear without GC.
    setDraft(null);
    onClearReply?.();
  }, [draft, busy, onSendMedia, replyTo?.id, onClearReply]);

  // Discard GCs the staged object — it was uploaded but never sent.
  const discardDraft = useCallback(() => {
    removeStaged(draft?.path);
    setDraft(null);
  }, [draft?.path, removeStaged]);

  const setCaption = useCallback((caption: string) => {
    setDraft((d) => (d ? { ...d, caption } : d));
  }, []);

  // ---- Render --------------------------------------------------------

  return (
    <div className="border-t border-border bg-card p-3">
      {replyTo && (
        <div className="mb-2">
          <ReplyQuote
            authorLabel={replyTo.authorLabel}
            preview={replyTo.preview}
            onDismiss={onClearReply}
          />
        </div>
      )}
      {sessionExpired && (
        <div className="mb-2 flex items-center justify-between rounded-lg bg-amber-500/10 px-3 py-2">
          <p className="text-xs text-amber-400">
            {t("sessionExpiredHint")}
          </p>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-amber-400 hover:text-amber-300"
            onClick={() => onOpenTemplates?.()}
          >
            <LayoutTemplate className="mr-1 h-3 w-3" />
            {t("templates")}
          </Button>
        </div>
      )}

      {/* Hidden file inputs driven by the attach menu. */}
      <input
        ref={imageInputRef}
        type="file"
        accept={PICKER_ACCEPT.image}
        className="hidden"
        onChange={(e) => {
          handlePicked("image", e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <input
        ref={videoInputRef}
        type="file"
        accept={PICKER_ACCEPT.video}
        className="hidden"
        onChange={(e) => {
          handlePicked("video", e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <input
        ref={documentInputRef}
        type="file"
        accept={PICKER_ACCEPT.document}
        className="hidden"
        onChange={(e) => {
          handlePicked("document", e.target.files?.[0]);
          e.target.value = "";
        }}
      />

      {draft ? (
        <MediaDraftPreview
          draft={draft}
          busy={busy}
          readOnly={readOnly}
          onCaptionChange={setCaption}
          onDiscard={discardDraft}
          onSend={sendDraft}
          t={t}
        />
      ) : recording ? (
        // Recording bar — replaces the composer while the mic is live.
        <div className="flex items-center gap-3 rounded-xl border border-border bg-muted px-4 py-2.5">
          <span className="flex h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-red-500" />
          <span className="flex-1 text-sm text-foreground">
            {t("recording", { current: formatDuration(recordSeconds), max: formatDuration(MAX_RECORDING_SECONDS) })}
          </span>
          <button
            type="button"
            onClick={cancelRecording}
            className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-card hover:text-foreground"
          >
            {t("cancel")}
          </button>
          <Button
            size="sm"
            onClick={stopRecording}
            className="h-9 w-9 shrink-0 bg-primary p-0 hover:bg-primary/90"
            title={t("stopAndAttach")}
          >
            <Square className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <>
          {/* Slash-command quick-reply dropdown */}
          {slashMenuOpen && filteredSlashItems.length > 0 && (
            <div
              ref={slashMenuRef}
              className="mb-1 max-h-48 overflow-y-auto rounded-lg border border-border bg-popover shadow-md"
            >
              {filteredSlashItems.map((qr, i) => (
                <button
                  key={qr.id}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    selectSlashItem(qr);
                  }}
                  onMouseEnter={() => setSlashIndex(i)}
                  className={cn(
                    "flex w-full items-center gap-2 px-3 py-2 text-left text-sm",
                    i === slashIndex
                      ? "bg-accent text-accent-foreground"
                      : "text-foreground hover:bg-accent/50",
                  )}
                >
                  {qr.kind === "interactive" ? (
                    <Zap className="h-3.5 w-3.5 shrink-0 text-primary" />
                  ) : (
                    <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  )}
                  <span className="min-w-0 flex-1 truncate font-medium">{qr.title}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {qr.kind === "interactive" && qr.interactive_payload
                      ? "interactive"
                      : qr.content_text}
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* Desktop: single-line dark bar layout */}
          <div className="hidden sm:flex flex-col gap-1">
            {drafting && (
              <div className="flex items-center gap-2 rounded-t-xl border border-border border-b-0 bg-muted px-4 py-2">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <span className="text-sm text-muted-foreground">Generating draft...</span>
              </div>
            )}
            <div className="flex items-end gap-2">
              {/* "+" button — opens the action picker dialog */}
              {!isTeam && (
                <GatedButton
                  variant="ghost"
                  size="sm"
                  canAct={!readOnly}
                  gateReason="send messages"
                  disabled={busy || drafting}
                  title={readOnly ? undefined : t("attachMedia")}
                  className="h-10 w-10 shrink-0 p-0 text-muted-foreground hover:text-foreground"
                  onClick={() => setActionPickerOpen(true)}
                >
                  {busy ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <Plus className="h-5 w-5" />
                  )}
                </GatedButton>
              )}

              {/* Emoji picker */}
              {!isTeam && (
                <div className="relative">
                  <button
                    type="button"
                    disabled={drafting}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:text-foreground disabled:opacity-40"
                    onClick={() => setEmojiPickerOpen((v) => !v)}
                  >
                    <Smile className="h-5 w-5" />
                  </button>
                  {emojiPickerOpen && (
                    <div className="absolute bottom-full left-0 mb-2 z-50">
                      <div className="relative">
                        <EmojiPicker
                          onEmojiClick={(emoji) => {
                            setText((prev) => prev + emoji.emoji)
                            setEmojiPickerOpen(false)
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => setEmojiPickerOpen(false)}
                          className="absolute -top-2 -right-2 flex h-6 w-6 items-center justify-center rounded-full bg-muted text-muted-foreground hover:text-foreground"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <textarea
                ref={desktopTextareaRef}
                value={text}
                onChange={handleChange}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                onMouseUp={checkSelection}
                onKeyUp={checkSelection}
                placeholder={
                  readOnly
                    ? t("readOnlyPlaceholder")
                    : sessionExpired
                      ? t("sessionExpiredPlaceholder")
                      : t("typeMessagePlaceholder")
                }
                disabled={sessionExpired || readOnly || drafting}
                rows={1}
                title={readOnly ? t("readOnlyTitle") : undefined}
                className={cn(
                  "flex-1 resize-none rounded-xl border border-border bg-muted px-4 py-2.5 text-sm text-foreground placeholder-muted-foreground outline-none transition-colors focus:border-primary/50 scrollbar-hidden",
                  (sessionExpired || readOnly || drafting) && "cursor-not-allowed opacity-50"
                )}
              />

            {text.trim() ? (
              <GatedButton
                size="sm"
                canAct={!readOnly}
                gateReason="send messages"
                disabled={sessionExpired || sending}
                onClick={handleSend}
                className="h-10 w-10 shrink-0 bg-primary p-0 hover:bg-primary/90 disabled:opacity-40"
              >
                <Send className="h-4 w-4" />
              </GatedButton>
            ) : (
              <GatedButton
                size="sm"
                canAct={!readOnly}
                gateReason="send messages"
                disabled={sessionExpired || busy}
                onClick={() => void startRecording()}
                className="h-10 w-10 shrink-0 p-0 text-muted-foreground hover:text-foreground disabled:opacity-40"
              >
                <Mic className="h-5 w-5" />
              </GatedButton>
            )}
            </div>
          </div>

          {/* Mobile: rounded layout with action row below */}
          <div className="flex flex-col sm:hidden">
            {drafting && (
              <div className="flex items-center gap-2 rounded-t-2xl border border-border border-b-0 bg-muted px-4 py-3">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <span className="text-sm text-muted-foreground">Generating draft...</span>
              </div>
            )}
            <textarea
              ref={mobileTextareaRef}
              value={text}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              onMouseUp={checkSelection}
              onKeyUp={checkSelection}
              placeholder={
                readOnly
                  ? t("readOnlyPlaceholder")
                  : sessionExpired
                    ? t("sessionExpiredPlaceholder")
                    : t("typeMessagePlaceholder")
              }
              disabled={sessionExpired || readOnly || drafting}
              rows={1}
              title={readOnly ? t("readOnlyTitle") : undefined}
              className={cn(
                "w-full resize-none border border-border bg-muted px-4 py-3 text-sm text-foreground placeholder-muted-foreground outline-none transition-colors focus:border-primary/50 scrollbar-hidden",
                drafting ? "rounded-t-none border-t-0" : "rounded-t-2xl",
                (sessionExpired || readOnly || drafting) && "cursor-not-allowed opacity-50"
              )}
            />

            <div className="flex items-center justify-between rounded-b-2xl border border-border border-t-0 bg-muted px-2 py-1.5">
              {/* Reply chip — shown when replying */}
              {replyTo && (
                <span className="ml-1 max-w-[100px] truncate rounded-full bg-primary/10 px-2.5 py-1 text-xs text-primary">
                  {replyTo.authorLabel}
                </span>
              )}

              <div className="ml-auto flex items-center gap-1">
                {/* Paperclip / attach */}
                {!isTeam && (
                  <GatedButton
                    variant="ghost"
                    size="sm"
                    canAct={!readOnly}
                    gateReason="send messages"
                    disabled={busy}
                    className="h-9 w-9 shrink-0 p-0 text-muted-foreground hover:text-foreground"
                    onClick={() => setActionPickerOpen(true)}
                  >
                    {busy ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <Paperclip className="h-5 w-5" />
                    )}
                  </GatedButton>
                )}

                {/* Camera */}
                {!isTeam && (
                  <button
                    type="button"
                    className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
                    onClick={() => imageInputRef.current?.click()}
                  >
                    <Camera className="h-5 w-5" />
                  </button>
                )}

                {/* Mic / Send — large white circle on mobile */}
                {text.trim() ? (
                  <GatedButton
                    size="sm"
                    canAct={!readOnly}
                    gateReason="send messages"
                    disabled={sessionExpired || sending}
                    onClick={handleSend}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary p-0 text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
                  >
                    <Send className="h-5 w-5" />
                  </GatedButton>
                ) : (
                  <GatedButton
                    size="sm"
                    canAct={!readOnly}
                    gateReason="send messages"
                    disabled={sessionExpired || busy}
                    onClick={() => void startRecording()}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-foreground p-0 text-background hover:bg-foreground/90 disabled:opacity-40"
                  >
                    <Mic className="h-5 w-5" />
                  </GatedButton>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Hint sits outside the flex row so its height doesn't push
          `items-end` buttons below the textarea. Indented to line up
          under the textarea left edge. */}
      {!draft && !recording && (
        <p className="mt-1 pl-[3.5rem] text-[10px] text-muted-foreground">
          {t("draftHint")}
        </p>
      )}

      {/* Interactive-message builder dialog. */}
      <Dialog open={interactiveOpen} onOpenChange={setInteractiveOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t("interactiveMessage")}</DialogTitle>
          </DialogHeader>
          <div className="max-h-[70vh] overflow-y-auto">
            <InteractiveBuilder
              value={interactivePayload}
              onChange={setInteractivePayload}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={savingQuickReply}
              onClick={saveAsQuickReply}
            >
              {savingQuickReply ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <Zap className="mr-1 h-4 w-4" />
              )}
              {t("saveAsQuickReply")}
            </Button>
            <Button onClick={sendInteractive}>
              <Send className="mr-1 h-4 w-4" />
              {t("send")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Quick-reply picker. */}
      <QuickReplyPicker
        open={quickReplyOpen}
        onOpenChange={setQuickReplyOpen}
        onPick={handlePickQuickReply}
      />

      {/* Action picker dialog (WhatsApp-style "+" menu). */}
      <ActionPickerDialog
        open={actionPickerOpen}
        onOpenChange={setActionPickerOpen}
        onSelect={handleActionSelect}
        mediaDisabled={inputsDisabled}
        textDisabled={inputsDisabled}
      />

      {/* Floating formatting toolbar — appears on text selection */}
      <FloatingToolbar
        visible={toolbarVisible}
        position={toolbarPos}
        onAction={applyFormatting}
      />
    </div>
  );
}

/**
 * Staged-attachment preview with caption + send/discard. Declared at
 * module scope (not nested in MessageComposer) so React keeps it mounted
 * across the parent's re-renders — a nested component would remount the
 * caption input on every keystroke and drop focus.
 */
function MediaDraftPreview({
  draft,
  busy,
  readOnly,
  onCaptionChange,
  onDiscard,
  onSend,
  t,
}: {
  draft: MediaDraft;
  busy: boolean;
  readOnly: boolean;
  onCaptionChange: (caption: string) => void;
  onDiscard: () => void;
  onSend: () => void;
  t: ReturnType<typeof useTranslations>;
}) {
  return (
    <div className="rounded-xl border border-border bg-muted/40 p-3">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          {draft.kind === "image" && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={draft.mediaUrl}
              alt={draft.filename}
              className="max-h-40 rounded-lg object-cover"
            />
          )}
          {draft.kind === "video" && (
            <video src={draft.mediaUrl} controls className="max-h-40 rounded-lg" />
          )}
          {draft.kind === "audio" && (
            <audio src={draft.mediaUrl} controls className="w-full" />
          )}
          {draft.kind === "document" && (
            <div className="flex items-center gap-2 text-sm text-foreground">
              <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
              <span className="truncate">{draft.filename}</span>
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={onDiscard}
          aria-label={t("removeAttachment")}
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-2 flex items-end gap-2">
        {draft.kind !== "audio" && (
          <input
            value={draft.caption}
            maxLength={MEDIA_CAPTION_MAX}
            onChange={(e) => onCaptionChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                onSend();
              }
            }}
            placeholder={t("addCaption")}
            className="flex-1 rounded-xl border border-border bg-muted px-4 py-2.5 text-sm text-foreground placeholder-muted-foreground outline-none transition-colors focus:border-primary/50"
          />
        )}
        <GatedButton
          size="sm"
          canAct={!readOnly}
          gateReason="send messages"
          disabled={busy}
          onClick={onSend}
          className={cn(
            "h-9 w-9 shrink-0 bg-primary p-0 hover:bg-primary/90 disabled:opacity-40",
            draft.kind === "audio" && "ml-auto",
          )}
        >
          <Send className="h-4 w-4" />
        </GatedButton>
      </div>
    </div>
  );
}
