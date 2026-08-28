'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { Loader2, Forward, Search } from 'lucide-react';
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
import type { Conversation } from '@/types';
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
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [forwarding, setForwarding] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');

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

  const filtered = conversations.filter((c) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    const name = c.team_name?.toLowerCase() ?? '';
    return name.includes(q);
  });

  const handleForward = useCallback(async () => {
    if (!selectedId || !messageId) return;
    setForwarding(true);
    try {
      const res = await fetch('/api/team/forward', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_message_id: messageId,
          target_conversation_id: selectedId,
        }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload.error || `HTTP ${res.status}`);
      }
      toast.success(t('success'));
      onOpenChange(false);
    } catch (err) {
      toast.error(t('failed'));
    } finally {
      setForwarding(false);
    }
  }, [selectedId, messageId, onOpenChange, t]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
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
