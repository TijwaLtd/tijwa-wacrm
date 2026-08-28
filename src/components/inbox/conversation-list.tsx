"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  CONVERSATION_SELECT,
  matchesContactFilters,
  normalizeConversations,
} from "@/lib/inbox/conversations";
import { cn } from "@/lib/utils";
import { formatWhatsAppInline } from "@/lib/whatsapp-format";
import type { Conversation, ConversationStatus, ConversationType, Tag } from "@/types";
import { Search, ChevronDown, X } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { WorkspaceBadge } from "@/components/shared/workspace-badge";
import { getAllConversations, getConversationsByTenant, type LocalConversation } from "@/lib/db";
import { PresenceDot } from "@/components/presence/presence-dot";
import { usePresence } from "@/hooks/use-presence";

interface ConversationListProps {
  activeConversationId: string | null;
  onSelect: (conversation: Conversation) => void;
  conversations: Conversation[];
  onConversationsLoaded: (conversations: Conversation[]) => void;
  /**
   * Increment to force the fetch effect below to refire. The parent
   * bumps this on realtime reconnect / tab visibility → visible so the
   * list catches up on any events sent while the WS was disconnected
   * or the tab was throttled. Optional so existing callers keep working.
   */
  resyncToken?: number;
  /**
   * When set, fetch only conversations for this account_id.
   * When null, fetch conversations from ALL workspaces via RPC.
   */
  workspaceFilter?: string | null;
  /**
   * Conversation mode: 'whatsapp' (default) shows customer conversations,
   * 'team' shows internal team conversations.
   */
  mode?: 'whatsapp' | 'team';
}

const STATUS_COLORS: Record<ConversationStatus, string> = {
  open: "bg-primary",
  pending: "bg-amber-500",
  closed: "bg-muted-foreground",
};



type InboxFilter = ConversationStatus | "all" | "unread";

export function ConversationList({
  activeConversationId,
  onSelect,
  conversations,
  onConversationsLoaded,
  resyncToken = 0,
  workspaceFilter = null,
  mode = 'whatsapp',
}: ConversationListProps) {
  const t = useTranslations("Inbox.conversationList");
  
  const FILTER_OPTIONS: { label: string; value: InboxFilter }[] = useMemo(() => [
    { label: t("filterAll"), value: "all" },
    { label: t("filterUnread"), value: "unread" },
    { label: t("filterOpen"), value: "open" },
    { label: t("filterPending"), value: "pending" },
    { label: t("filterClosed"), value: "closed" },
  ], [t]);

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<InboxFilter>("all");
  const [loading, setLoading] = useState(true);
  // Contact-based filters (issue #272). Tags use OR logic (a conversation
  // matches if its contact carries any selected tag), consistent with
  // Broadcast audience filtering. Company is an exact match on the field.
  const [tags, setTags] = useState<Tag[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<string | null>(null);

  // Presence for assigned agents
  const { getPresence, getRow, now } = usePresence();

  // Keep the latest callback in a ref so the fetch effect below can
  // have a stable, empty-dep identity. Previously the fetch useCallback
  // depended on `onConversationsLoaded`, which depends on the parent's
  // `deepLinkConvId` — so every URL change (including one the parent
  // triggered via router.replace after a click) caused a fresh
  // conversations fetch. That extra refetch was the trigger for the
  // deep-link auto-select running a second time and wiping the active
  // thread's messages.
  // Mutation lives in an effect (not render) per React 19's refs rule;
  // the fetch runs once on mount so it's fine to read the slightly
  // older value — the very next render updates the ref for any
  // subsequent async completion.
  const onConversationsLoadedRef = useRef(onConversationsLoaded);
  useEffect(() => {
    onConversationsLoadedRef.current = onConversationsLoaded;
  });

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);

      // Team mode: fetch from team conversations API
      if (mode === 'team') {
        try {
          const res = await fetch('/api/team/conversations');
          if (res.ok) {
            const data = await res.json();
            const teamConvs: Conversation[] = (data.conversations ?? []).map((c: Record<string, unknown>) => ({
              id: c.id as string,
              user_id: c.user_id as string,
              account_id: c.account_id as string,
              contact_id: null,
              type: 'team' as const,
              status: (c.status as ConversationStatus) ?? 'open',
              assigned_agent_id: c.assigned_agent_id as string | null,
              last_message_text: c.last_message_text as string | null,
              last_message_at: c.last_message_at as string | null,
              unread_count: (c.unread_count as number) ?? 0,
              created_at: c.created_at as string,
              updated_at: c.updated_at as string,
              team_name: c.team_name as string | null,
              team_participant_ids: (c.team_participant_ids as string[]) ?? [],
            }));
            if (!cancelled) {
              onConversationsLoadedRef.current(teamConvs);
              setLoading(false);
            }
          }
        } catch {
          if (!cancelled) setLoading(false);
        }
        return;
      }

      // WhatsApp mode: existing logic
      // 1. Load from IndexedDB first (instant, works offline)
      let localLoaded = false;
      try {
        const localConvs = workspaceFilter === null
          ? await getAllConversations()
          : await getConversationsByTenant(workspaceFilter);

        if (!cancelled) {
          // Convert LocalConversation to Conversation for the callback
          const asConversations: Conversation[] = localConvs.map((lc) => ({
            id: lc.id,
            user_id: lc.user_id,
            account_id: lc.account_id ?? "",
            contact_id: lc.contact_id,
            type: (lc.type as ConversationType) ?? 'whatsapp',
            status: lc.status,
            assigned_agent_id: lc.assigned_agent_id,
            last_message_text: lc.last_message_text,
            last_message_at: lc.last_message_at,
            unread_count: lc.unread_count,
            created_at: lc.created_at,
            updated_at: lc.updated_at,
            contact: lc.contact_name && lc.contact_id
              ? {
                  id: lc.contact_id,
                  user_id: lc.user_id,
                  account_id: lc.account_id ?? "",
                  name: lc.contact_name,
                  phone: lc.contact_phone || "",
                  company: lc.contact_company,
                  created_at: lc.created_at,
                  updated_at: lc.updated_at,
                }
              : undefined,
          }));
          onConversationsLoadedRef.current(asConversations);
          localLoaded = true;
        }
      } catch {
        // IndexedDB might not be available (private browsing, etc.)
      }

      // Show UI immediately after local load attempt (even if empty — empty state)
      if (!cancelled) setLoading(false);

      // 2. Fetch from Supabase in background (authoritative data)
      const supabase = createClient();

      try {
        let convs: Conversation[] = [];

        if (workspaceFilter === null) {
          // All workspaces mode - use RPC
          const { data, error } = await supabase.rpc("get_user_conversations", {
            p_user_id: (await supabase.auth.getUser()).data.user?.id,
          });
          if (error) {
            console.error("Failed to fetch all conversations:", error);
            if (cancelled) return;
            setLoading(false);
            return;
          }
          // RPC returns flat rows, normalize to conversation shape
          convs = (data ?? []).map((c: Record<string, unknown>) => ({
            id: c.id as string,
            user_id: null,
            account_id: c.account_id as string,
            contact_id: c.contact_id as string | null,
            type: (c.type as ConversationType) ?? 'whatsapp',
            status: c.status as ConversationStatus,
            assigned_agent_id: c.assigned_agent_id as string | null,
            last_message_text: c.last_message_text as string | null,
            last_message_at: c.last_message_at as string | null,
            unread_count: c.unread_count as number,
            created_at: c.created_at as string,
            updated_at: c.updated_at as string,
            team_name: c.team_name as string | null,
            team_participant_ids: (c.team_participant_ids as string[]) ?? [],
            contact: c.contact_name ? {
              id: c.contact_id as string,
              name: c.contact_name as string,
              phone: c.contact_phone as string,
              company: c.contact_company as string,
            } : undefined,
          }));
        } else {
          // Single workspace mode - use RLS
          const { data, error } = await supabase
            .from("conversations")
            .select(CONVERSATION_SELECT)
            .eq("account_id", workspaceFilter)
            .order("last_message_at", { ascending: false });

          if (error) {
            console.error("Failed to fetch conversations:", {
              message: error.message,
              details: error.details,
              hint: error.hint,
              code: error.code,
            });
            if (cancelled) return;
            setLoading(false);
            return;
          }
          convs = data ?? [];
        }

        if (cancelled) return;

        // Update with authoritative server data
        onConversationsLoadedRef.current(normalizeConversations(convs));
        setLoading(false);

        // 3. Persist to IndexedDB for future offline access
        try {
          const { putConversations } = await import("@/lib/db");
          const localConvs: LocalConversation[] = normalizeConversations(convs).map((c) => ({
            ...c,
            contact_name: c.contact?.name,
            contact_phone: c.contact?.phone,
            contact_company: c.contact?.company,
          }));
          await putConversations(localConvs);
        } catch {
          // Best-effort persistence
        }
      } catch {
        // Network error — the UI already has local data
      }
    })();

    return () => {
      cancelled = true;
    };
    // `resyncToken` is included so the parent can force a refetch when
    // the realtime channel reconnects or the tab regains focus — catches
    // up on any events sent while the WS was disconnected or throttled.
  }, [resyncToken, workspaceFilter, mode]);

  // Tag definitions for the filter picker — loaded once so labels/colours
  // stay stable regardless of which conversations happen to be loaded.
  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from("tags").select("*").order("name");
      if (!cancelled && data) setTags(data as Tag[]);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Company options are derived from the loaded conversations — there's no
  // separate companies table, and only companies with a live conversation
  // are worth offering as an inbox filter.
  const companies = useMemo(() => {
    const set = new Set<string>();
    for (const c of conversations) {
      const co = c.contact?.company?.trim();
      if (co) set.add(co);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [conversations]);

  const tagsById = useMemo(() => {
    const m = new Map<string, Tag>();
    for (const t of tags) m.set(t.id, t);
    return m;
  }, [tags]);

  const filtered = useMemo(() => {
    let result = conversations;

    if (filter === "unread") {
      result = result.filter((c) => c.unread_count > 0);
    } else if (filter !== "all") {
      result = result.filter((c) => c.status === filter);
    }

    // Contact-based filters (tags via OR logic, exact company match).
    if (selectedTagIds.length > 0 || selectedCompany !== null) {
      result = result.filter((c) =>
        matchesContactFilters(c, {
          tagIds: selectedTagIds,
          company: selectedCompany,
        })
      );
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((c) => {
        const name = c.contact?.name?.toLowerCase() ?? "";
        const phone = c.contact?.phone?.toLowerCase() ?? "";
        const lastMsg = c.last_message_text?.toLowerCase() ?? "";
        return name.includes(q) || phone.includes(q) || lastMsg.includes(q);
      });
    }

    return result;
  }, [conversations, filter, search, selectedTagIds, selectedCompany]);

  const toggleTag = useCallback((id: string) => {
    setSelectedTagIds((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]
    );
  }, []);

  const clearContactFilters = useCallback(() => {
    setSelectedTagIds([]);
    setSelectedCompany(null);
  }, []);

  const hasContactFilters = selectedTagIds.length > 0 || selectedCompany !== null;

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setSearch(e.target.value);
    },
    []
  );

  const handleSelect = useCallback(
    (conv: Conversation) => {
      onSelect(conv);
    },
    [onSelect]
  );

  const activeFilter = FILTER_OPTIONS.find((o) => o.value === filter);

  return (
    // w-full on mobile so the list occupies the whole viewport when it's
    // the single pane showing; fixed 320px on desktop where it shares the
    // row with the thread + contact sidebar.
    <div className="flex h-full w-full flex-col border-r border-border bg-card lg:w-80">
      {/* Search + Filter */}
      <div className="space-y-2 border-b border-border p-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={handleSearchChange}
            placeholder={t("searchPlaceholder")}
            className="border-border bg-muted pl-9 text-sm text-foreground placeholder-muted-foreground focus:border-primary/50"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex items-center justify-center h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground rounded-md hover:bg-muted">
                {activeFilter?.label ?? t("filterAll")}
                <ChevronDown className="h-3 w-3" />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              className="border-border bg-popover"
            >
              {FILTER_OPTIONS.map((opt) => (
                <DropdownMenuItem
                  key={opt.value}
                  onClick={() => setFilter(opt.value)}
                  className={cn(
                    "text-sm",
                    filter === opt.value
                      ? "text-primary"
                      : "text-popover-foreground"
                  )}
                >
                  {opt.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {tags.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger
                className={cn(
                  "inline-flex items-center justify-center h-7 gap-1 px-2 text-xs rounded-md hover:bg-muted",
                  selectedTagIds.length > 0
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {t("tags")}
                {selectedTagIds.length > 0 && (
                  <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                    {selectedTagIds.length}
                  </span>
                )}
                <ChevronDown className="h-3 w-3" />
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                className="max-h-64 w-56 border-border bg-popover"
              >
                {tags.map((t) => (
                  <DropdownMenuCheckboxItem
                    key={t.id}
                    checked={selectedTagIds.includes(t.id)}
                    onCheckedChange={() => toggleTag(t.id)}
                    className="text-sm text-popover-foreground"
                  >
                    <span className="flex items-center gap-2">
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: t.color }}
                      />
                      <span className="truncate">{t.name}</span>
                    </span>
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {companies.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger
                className={cn(
                  "inline-flex max-w-40 items-center justify-center h-7 gap-1 px-2 text-xs rounded-md hover:bg-muted",
                  selectedCompany
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <span className="truncate">{selectedCompany ?? t("company")}</span>
                <ChevronDown className="h-3 w-3 shrink-0" />
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                className="max-h-64 w-56 border-border bg-popover"
              >
                <DropdownMenuItem
                  onClick={() => setSelectedCompany(null)}
                  className={cn(
                    "text-sm",
                    selectedCompany === null
                      ? "text-primary"
                      : "text-popover-foreground"
                  )}
                >
                  {t("allCompanies")}
                </DropdownMenuItem>
                {companies.map((co) => (
                  <DropdownMenuItem
                    key={co}
                    onClick={() => setSelectedCompany(co)}
                    className={cn(
                      "text-sm",
                      selectedCompany === co
                        ? "text-primary"
                        : "text-popover-foreground"
                    )}
                  >
                    <span className="truncate">{co}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {hasContactFilters && (
          <div className="flex flex-wrap items-center gap-1">
            {selectedTagIds.map((id) => {
              const tag = tagsById.get(id);
              return (
                <button
                  key={id}
                  onClick={() => toggleTag(id)}
                  className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-foreground hover:bg-muted/70"
                >
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ backgroundColor: tag?.color ?? "var(--muted-foreground)" }}
                  />
                  <span className="max-w-24 truncate">{tag?.name ?? t("tags")}</span>
                  <X className="h-3 w-3" />
                </button>
              );
            })}
            {selectedCompany && (
              <button
                onClick={() => setSelectedCompany(null)}
                className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-foreground hover:bg-muted/70"
              >
                <span className="max-w-24 truncate">{selectedCompany}</span>
                <X className="h-3 w-3" />
              </button>
            )}
            <button
              onClick={clearContactFilters}
              className="px-1 text-[11px] text-muted-foreground hover:text-foreground"
            >
              {t("clearAll")}
            </button>
          </div>
        )}
      </div>

      {/* Conversation Items.
          `min-h-0` is load-bearing: a flex child defaults to
          min-height:auto, so without it this ScrollArea grows to fit
          every conversation instead of shrinking to the remaining
          space — the list then overflows and gets clipped by the
          parent's overflow-hidden with no scrollbar (issue #229). */}
      <ScrollArea className="min-h-0 flex-1 scrollbar-thin">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <p className="text-sm text-muted-foreground">{t("noConversations")}</p>
          </div>
        ) : (
          <div className="flex flex-col">
            {filtered.map((conv) => (
              <ConversationItem
                key={conv.id}
                conversation={conv}
                isActive={conv.id === activeConversationId}
                onSelect={handleSelect}
                t={t}
                getPresence={getPresence}
                getRow={getRow}
                now={now}
              />
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

interface ConversationItemProps {
  conversation: Conversation;
  isActive: boolean;
  onSelect: (conversation: Conversation) => void;
  t: ReturnType<typeof useTranslations>;
  getPresence: (userId: string) => import("@/lib/presence").PresenceStatus;
  getRow: (userId: string) => { status: import("@/lib/presence").StoredPresence; last_seen_at: string; } | undefined;
  now: number;
}

function ConversationItem({
  conversation,
  isActive,
  onSelect,
  t,
  getPresence,
  getRow,
  now,
}: ConversationItemProps) {
  const isTeam = conversation.type === 'team';
  const contact = conversation.contact;
  const displayName = isTeam
    ? (conversation.team_name || t("teamChat"))
    : (contact?.name || contact?.phone || t("unknown"));
  const initials = displayName.charAt(0).toUpperCase();

  const assignedPresence = conversation.assigned_agent_id
    ? getPresence(conversation.assigned_agent_id)
    : null;
  const assignedRow = conversation.assigned_agent_id
    ? getRow(conversation.assigned_agent_id)
    : undefined;

  const handleClick = useCallback(() => {
    onSelect(conversation);
  }, [onSelect, conversation]);

  const timeAgo = conversation.last_message_at
    ? formatDistanceToNow(new Date(conversation.last_message_at), {
        addSuffix: false,
      })
    : "";

  return (
    <button
      onClick={handleClick}
      className={cn(
        "flex w-full items-start gap-3 px-3 py-3 text-left transition-colors hover:bg-muted/50",
        isActive && "border-l-2 border-primary bg-muted/70"
      )}
    >
      {/* Avatar */}
      <div className={cn(
        "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-medium text-foreground",
        isTeam ? "bg-primary/10 text-primary" : "bg-muted"
      )}>
        {contact?.avatar_url ? (
          <Image
            src={contact.avatar_url}
            alt={displayName}
            width={40}
            height={40}
            unoptimized
            className="h-10 w-10 rounded-full object-cover"
          />
        ) : (
          initials
        )}
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="truncate text-sm font-medium text-foreground">
              {displayName}
            </span>
            {isTeam ? (
              <span className="shrink-0 rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                Team
              </span>
            ) : conversation.account_id ? (
              <WorkspaceBadge accountId={conversation.account_id} size="sm" />
            ) : null}
            {conversation.department_name && (
              <span
                className="shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-medium"
                style={{
                  backgroundColor: (conversation.department_color || '#6366f1') + '20',
                  color: conversation.department_color || '#6366f1',
                }}
              >
                {conversation.department_name}
              </span>
            )}
            {conversation.priority != null && conversation.priority > 0 && (
              <span className="shrink-0 rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-600">
                {conversation.priority >= 2 ? 'Urgent' : 'High'}
              </span>
            )}
            {assignedPresence && !isTeam && (
              <span className="shrink-0">
                <PresenceDot status={assignedPresence} lastSeenAt={assignedRow?.last_seen_at} now={now} size="sm" />
              </span>
            )}
          </div>
          <span className="shrink-0 text-[10px] text-muted-foreground">{timeAgo}</span>
        </div>
        <div className="mt-0.5 flex items-center justify-between gap-2">
          <p className="truncate text-xs text-muted-foreground">
            {conversation.last_message_text
              ? formatWhatsAppInline(conversation.last_message_text)
              : t("noMessagesYet")}
          </p>
          <div className="flex shrink-0 items-center gap-1.5">
            {conversation.unread_count > 0 && (
              <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                {conversation.unread_count}
              </span>
            )}
            {!isTeam && (
              <span
                className={cn(
                  "h-2 w-2 rounded-full",
                  STATUS_COLORS[conversation.status]
                )}
                title={conversation.status}
              />
            )}
          </div>
        </div>
      </div>
    </button>
  );
}
