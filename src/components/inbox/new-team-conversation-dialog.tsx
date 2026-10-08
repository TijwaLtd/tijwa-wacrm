'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { Loader2, Users, Search, Check } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';
import { fetchAccountMembers, memberLabel } from '@/lib/account/members';
import type { AccountMember, Conversation } from '@/types';

interface NewTeamConversationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with the freshly created conversation so the page can open it. */
  onCreate: (conversation: Conversation) => void;
}

/**
 * Creates an internal (type='team') conversation and picks its
 * participants. Never touches Meta/WhatsApp — creation goes through
 * `POST /api/team/conversations`, which is DB-only.
 */
export function NewTeamConversationDialog({
  open,
  onOpenChange,
  onCreate,
}: NewTeamConversationDialogProps) {
  const t = useTranslations('Inbox.newTeam');
  const { user, profile } = useAuth();
  const selfLabel = profile?.full_name || user?.email || t('you');

  const [members, setMembers] = useState<AccountMember[] | null>(null);
  const [name, setName] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);

  // Load the roster the first time the dialog opens (state is nulled on
  // close, so reopening refetches). All state writes live inside the
  // promise callback — no sync setState in the effect body.
  useEffect(() => {
    if (!open || members !== null) return;
    let cancelled = false;
    fetchAccountMembers()
      .then((rows) => {
        if (!cancelled) setMembers(rows);
      })
      .catch(() => {
        if (!cancelled) setMembers([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, members]);

  // Reset the form on close (event handler, so plain setState is fine).
  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) {
        setName('');
        setSearch('');
        setSelected(new Set());
        setMembers(null);
      }
      onOpenChange(next);
    },
    [onOpenChange]
  );

  const others = useMemo(
    () => (members ?? []).filter((m) => m.user_id !== user?.id),
    [members, user?.id]
  );

  const filtered = useMemo(() => {
    if (!search.trim()) return others;
    const q = search.toLowerCase();
    return others.filter((m) => memberLabel(m).toLowerCase().includes(q));
  }, [others, search]);

  const toggleMember = useCallback((userId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }, []);

  const handleCreate = useCallback(async () => {
    if (selected.size === 0 || creating) return;
    setCreating(true);
    try {
      const res = await fetch('/api/team/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim() || null,
          participant_ids: Array.from(selected),
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
      onCreate({
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
          (c.team_participant_ids as string[]) ?? Array.from(selected),
      });
      handleOpenChange(false);
    } catch (err) {
      console.error('Failed to create team conversation:', err);
      toast.error(err instanceof Error && err.message ? err.message : t('failed'));
    } finally {
      setCreating(false);
    }
  }, [selected, creating, name, onCreate, handleOpenChange, t]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            {t('title')}
          </DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('namePlaceholder')}
            maxLength={80}
          />

          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('searchPlaceholder')}
              className="pl-9"
            />
          </div>

          <ScrollArea className="max-h-[280px]">
            {members === null ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : filtered.length === 0 && others.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                {t('soloWorkspace')}
              </p>
            ) : filtered.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                {t('empty')}
              </p>
            ) : (
              <div className="space-y-1">
                {/* Current user — always included, shown for clarity */}
                {user && !search.trim() && (
                  <div className="flex w-full items-center gap-3 rounded-md bg-muted/50 px-3 py-2.5 text-left">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-medium text-primary">
                      {selfLabel.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">
                        {selfLabel}
                        <span className="ml-1 text-xs font-normal text-muted-foreground">
                          {t('you')}
                        </span>
                      </p>
                    </div>
                    <div className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 border-primary bg-primary">
                      <Check className="h-3 w-3 text-primary-foreground" />
                    </div>
                  </div>
                )}

                {filtered.map((m) => {
                  const isSelected = selected.has(m.user_id);
                  return (
                    <button
                      key={m.user_id}
                      type="button"
                      onClick={() => toggleMember(m.user_id)}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left transition-colors',
                        isSelected ? 'bg-primary/10 text-primary' : 'hover:bg-muted'
                      )}
                    >
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-medium text-foreground">
                        {(memberLabel(m) || '?').charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">
                          {memberLabel(m)}
                        </p>
                        {m.email && m.email !== memberLabel(m) && (
                          <p className="truncate text-xs text-muted-foreground">
                            {m.email}
                          </p>
                        )}
                      </div>
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
                })}
              </div>
            )}
          </ScrollArea>

          <div className="flex items-center justify-between gap-2 pt-1">
            <p className="text-xs text-muted-foreground">
              {selected.size > 0
                ? t('memberCount', { count: selected.size + 1 })
                : t('selectOne')}
            </p>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleOpenChange(false)}
                disabled={creating}
              >
                {t('cancel')}
              </Button>
              <Button
                size="sm"
                disabled={selected.size === 0 || creating}
                onClick={() => void handleCreate()}
              >
                {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t('create')}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
