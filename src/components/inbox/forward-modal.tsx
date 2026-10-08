'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { Loader2, Forward, Search, Plus, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatWhatsAppInline } from '@/lib/whatsapp-format';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';
import { fetchAccountMembers, memberLabel } from '@/lib/account/members';
import type { AccountMember, Conversation } from '@/types';
import { formatDistanceToNow } from 'date-fns';

interface ForwardModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  messageId: string;
  messagePreview: string;
}

/**
 * Modal that lists the user's team conversations so they can pick one
 * to forward the selected message into.
 */
export function ForwardModal({
  open,
  onOpenChange,
  messageId,
  messagePreview,
}: ForwardModalProps) {
  const t = useTranslations('Inbox.forward');
  const { user } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [forwarding, setForwarding] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  // Inline "create a new team conversation" panel — for when the right
  // target doesn't exist yet. Creation is DB-only (`/api/team/conversations`);
  // forwarding writes straight into `messages`. Neither touches Meta.
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newSelected, setNewSelected] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);
  // null = not loaded yet (also drives the panel's spinner).
  const [members, setMembers] = useState<AccountMember[] | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setSelectedId(null);
    setSearch('');

    fetch('/api/team/conversations')
      .then((res) => res.json())
      .then((data) => {
        setConversations(data.conversations ?? []);
      })
      .catch(() => {
        toast.error(t('loadFailed'));
      })
      .finally(() => setLoading(false));
  }, [open, t]);

  // Load the member roster the first time the create panel opens. All
  // state writes happen in the promise callback (no sync setState in
  // the effect body).
  useEffect(() => {
    if (!showCreate || members !== null) return;
    let cancelled = false;
    fetchAccountMembers().then((rows) => {
      if (!cancelled) setMembers(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [showCreate, members]);

  // Reset create-panel state on close (event handler, so plain setState
  // is fine here).
  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) {
        setShowCreate(false);
        setNewName('');
        setNewSelected(new Set());
        setMembers(null);
      }
      onOpenChange(next);
    },
    [onOpenChange]
  );

  const searchableMembers = useMemo(() => {
    if (!members) return [];
    return members.filter((m) => m.user_id !== user?.id);
  }, [members, user?.id]);

  const filtered = conversations.filter((c) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    const name = c.team_name?.toLowerCase() ?? '';
    return name.includes(q);
  });

  const forwardTo = useCallback(
    async (targetConversationId: string): Promise<void> => {
      const res = await fetch('/api/team/forward', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_message_id: messageId,
          target_conversation_id: targetConversationId,
        }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload.error || `HTTP ${res.status}`);
      }
    },
    [messageId]
  );

  const handleForward = useCallback(async () => {
    if (!selectedId || !messageId) return;
    setForwarding(true);
    try {
      await forwardTo(selectedId);
      toast.success(t('success'));
      handleOpenChange(false);
    } catch {
      toast.error(t('failed'));
    } finally {
      setForwarding(false);
    }
  }, [selectedId, messageId, forwardTo, handleOpenChange, t]);

  const toggleNewMember = useCallback((userId: string) => {
    setNewSelected((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }, []);

  // Create the missing team conversation and forward into it in one step.
  const handleCreateAndForward = useCallback(async () => {
    if (newSelected.size === 0 || creating || !messageId) return;
    setCreating(true);
    try {
      const res = await fetch('/api/team/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName.trim() || null,
          participant_ids: Array.from(newSelected),
        }),
      });
      const payload = (await res.json().catch(() => ({}))) as {
        error?: string;
        conversation?: Record<string, unknown>;
      };
      if (!res.ok || !payload.conversation) {
        throw new Error(payload.error || `HTTP ${res.status}`);
      }

      const c = payload.conversation;
      const created: Conversation = {
        id: c.id as string,
        user_id: c.user_id as string,
        account_id: c.account_id as string,
        contact_id: null,
        type: 'team',
        status: (c.status as Conversation['status']) ?? 'open',
        assigned_agent_id: (c.assigned_agent_id as string | null) ?? undefined,
        last_message_text: (c.last_message_text as string | null) ?? undefined,
        last_message_at: (c.last_message_at as string | null) ?? undefined,
        unread_count: (c.unread_count as number) ?? 0,
        created_at: c.created_at as string,
        updated_at: c.updated_at as string,
        team_name: (c.team_name as string | null) ?? null,
        team_participant_ids:
          (c.team_participant_ids as string[]) ?? Array.from(newSelected),
      };

      // Surface it in the picker (covers the case below where the
      // forward itself fails and the user needs to retry manually).
      setConversations((prev) =>
        prev.some((x) => x.id === created.id) ? prev : [created, ...prev]
      );
      setSelectedId(created.id);
      setShowCreate(false);

      await forwardTo(created.id);
      toast.success(t('success'));
      handleOpenChange(false);
    } catch (err) {
      console.error('Failed to create team conversation:', err);
      toast.error(
        err instanceof Error && err.message ? err.message : t('failed')
      );
    } finally {
      setCreating(false);
    }
  }, [newSelected, creating, messageId, newName, forwardTo, handleOpenChange, t]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Forward className="h-4 w-4" />
            {t('title')}
          </DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>

        {/* Message preview */}
        {messagePreview && (
          <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground line-clamp-2">
            {formatWhatsAppInline(messagePreview)}
          </div>
        )}

        {/* Create-a-new-conversation panel — inline alternative to the
            separate Team-tab dialog, so forwarding can create its target. */}
        {!showCreate ? (
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="hover:bg-muted flex w-full items-center gap-2 rounded-md border border-border px-3 py-2 text-left text-sm text-foreground transition-colors"
          >
            <Plus className="h-4 w-4 text-muted-foreground" />
            {t('createNew')}
          </button>
        ) : (
          <div className="space-y-2 rounded-md border border-border p-3">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={t('newNamePlaceholder')}
              maxLength={80}
              autoFocus
            />
            <div className="max-h-40 space-y-1 overflow-y-auto">
              {members === null ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              ) : searchableMembers.length === 0 ? (
                <p className="py-3 text-center text-xs text-muted-foreground">
                  {t('noMembers')}
                </p>
              ) : (
                searchableMembers.map((m) => {
                  const isSelected = newSelected.has(m.user_id);
                  return (
                    <button
                      key={m.user_id}
                      type="button"
                      onClick={() => toggleNewMember(m.user_id)}
                      className={cn(
                        'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors',
                        isSelected
                          ? 'bg-primary/10 text-primary'
                          : 'hover:bg-muted'
                      )}
                    >
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
                        {(memberLabel(m) || '?').charAt(0).toUpperCase()}
                      </div>
                      <span className="min-w-0 flex-1 truncate">
                        {memberLabel(m)}
                      </span>
                      <div
                        className={cn(
                          'flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2',
                          isSelected
                            ? 'border-primary bg-primary'
                            : 'border-muted-foreground/40'
                        )}
                      >
                        {isSelected && (
                          <Check className="h-3 w-3 text-primary-foreground" />
                        )}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                {newSelected.size > 0
                  ? t('memberCount', { count: newSelected.size + 1 })
                  : t('selectOne')}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowCreate(false)}
                  disabled={creating}
                >
                  {t('cancel')}
                </Button>
                <Button
                  size="sm"
                  disabled={newSelected.size === 0 || creating}
                  onClick={() => void handleCreateAndForward()}
                >
                  {creating && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  {t('createAndForward')}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('searchPlaceholder')}
            className="pl-9"
          />
        </div>

        {/* Conversation list */}
        <ScrollArea className="max-h-64">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              {t('noConversations')}
            </div>
          ) : (
            <div className="space-y-1">
              {filtered.map((conv) => (
                <button
                  key={conv.id}
                  onClick={() => setSelectedId(conv.id)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left transition-colors',
                    selectedId === conv.id
                      ? 'bg-primary/10 text-primary'
                      : 'hover:bg-muted'
                  )}
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-medium text-primary">
                    {(conv.team_name ?? 'T').charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">
                      {conv.team_name || t('unnamed')}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {conv.team_participant_ids?.length ?? 0} members
                      {conv.last_message_at && (
                        <> · {formatDistanceToNow(new Date(conv.last_message_at), { addSuffix: false })}</>
                      )}
                    </p>
                  </div>
                  {selectedId === conv.id && (
                    <div className="h-4 w-4 shrink-0 rounded-full border-2 border-primary bg-primary" />
                  )}
                </button>
              ))}
            </div>
          )}
        </ScrollArea>

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" size="sm" onClick={() => handleOpenChange(false)}>
            {t('cancel')}
          </Button>
          <Button
            size="sm"
            disabled={!selectedId || forwarding}
            onClick={handleForward}
          >
            {forwarding && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('forward')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
