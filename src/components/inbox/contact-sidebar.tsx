"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";

import type { Contact, Deal, ContactNote, Tag } from "@/types";
import {
  Phone,
  Mail,
  Copy,
  Check,
  Tag as TagIcon,
  DollarSign,
  StickyNote,
  Plus,
  PhoneCall,
  MessageCircle,
  Eye,
  EyeOff,
  MoreHorizontal,
  X,
} from "lucide-react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { format } from "date-fns";
import { useTranslations } from "next-intl";
import { useAuditLogger } from "@/hooks/use-audit-logger";
import { AuditEventType } from "@/lib/audit/events";
import { maskPhoneNumber, getFullPhone, getPhoneDigits } from "@/lib/audit/masking";

interface ContactSidebarProps {
  contact: Contact | null;
}

export function ContactSidebar({ contact }: ContactSidebarProps) {
  const tSidebar = useTranslations("Inbox.sidebar");
  const tThread = useTranslations("Inbox.messageThread");

  const { accountId } = useAuth();
  const { log: auditLog } = useAuditLogger();
  const [copied, setCopied] = useState(false);
  const [showPhone, setShowPhone] = useState(false);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [notes, setNotes] = useState<ContactNote[]>([]);
  const [tags, setTags] = useState<(Tag & { contact_tag_id: string })[]>([]);
  const [newNote, setNewNote] = useState("");
  const [addingNote, setAddingNote] = useState(false);
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [assigningTags, setAssigningTags] = useState(false);

  // Reset reveal state when contact changes
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShowPhone(false);
    setCopied(false);
  }, [contact?.id]);

  const fetchContactData = useCallback(async () => {
    if (!contact) return;

    const supabase = createClient();

    const [dealsRes, notesRes, tagsRes, allTagsRes] = await Promise.all([
      supabase
        .from("deals")
        .select("*, stage:pipeline_stages(*)")
        .eq("contact_id", contact.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("contact_notes")
        .select("*")
        .eq("contact_id", contact.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("contact_tags")
        .select("id, tag_id, tags(*)")
        .eq("contact_id", contact.id),
      supabase
        .from("tags")
        .select("*")
        .order("name", { ascending: true }),
    ]);

    if (dealsRes.data) setDeals(dealsRes.data);
    if (notesRes.data) setNotes(notesRes.data);
    if (tagsRes.data) {
      const mapped = tagsRes.data
        .filter((ct: Record<string, unknown>) => ct.tags)
        .map((ct: Record<string, unknown>) => ({
          ...(ct.tags as Tag),
          contact_tag_id: ct.id as string,
        }));
      setTags(mapped);
    }
    if (allTagsRes.data) setAllTags(allTagsRes.data);
  }, [contact]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchContactData();
  }, [fetchContactData]);

  const handleCopyPhone = useCallback(async () => {
    if (!contact?.phone) return;
    // Always copy the full number with + prefix
    await navigator.clipboard.writeText(getFullPhone(contact.phone));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    auditLog(AuditEventType.CONTACT_PHONE_COPIED, { contactId: contact.id });
  }, [contact, auditLog]);

  const handleAddNote = useCallback(async () => {
    if (!contact || !newNote.trim()) return;
    if (!accountId) return;
    setAddingNote(true);

    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const user = session?.user;

    const { data, error } = await supabase
      .from("contact_notes")
      .insert({
        contact_id: contact.id,
        account_id: accountId,
        user_id: user?.id,
        note_text: newNote.trim(),
      })
      .select()
      .single();

    if (!error && data) {
      setNotes((prev) => [data, ...prev]);
      setNewNote("");
    }
    setAddingNote(false);
  }, [contact, newNote, accountId]);

  const handleCallClick = useCallback(() => {
    if (!contact?.phone) return;
    auditLog(AuditEventType.CONTACT_CALL_CLICKED, { contactId: contact.id });
    // Use full number with + for tel: link
    window.open(`tel:${getFullPhone(contact.phone)}`, '_self');
  }, [contact, auditLog]);

  const handleWhatsAppClick = useCallback(() => {
    if (!contact?.phone) return;
    auditLog(AuditEventType.CONTACT_WHATSAPP_CLICKED, { contactId: contact.id });
    window.open(`https://wa.me/${getPhoneDigits(contact.phone)}`, '_blank');
  }, [contact, auditLog]);

  const handleTagToggle = useCallback(async (tagId: string, currentlyAssigned: boolean) => {
    if (!contact) return;
    const supabase = createClient();

    if (currentlyAssigned) {
      const ct = tags.find((t) => t.id === tagId);
      if (ct) {
        await supabase.from("contact_tags").delete().eq("id", ct.contact_tag_id);
        setTags((prev) => prev.filter((t) => t.id !== tagId));
      }
    } else {
      const { data } = await supabase
        .from("contact_tags")
        .insert({ contact_id: contact.id, tag_id: tagId })
        .select("id, tag_id, tags(*)")
        .single();
      if (data && data.tags) {
        const tagData = Array.isArray(data.tags) ? data.tags[0] : data.tags;
        setTags((prev) => [
          ...prev,
          { ...(tagData as Tag), contact_tag_id: data.id },
        ]);
      }
    }
  }, [contact, tags]);

  const handleTagRemove = useCallback(async (contactTagId: string, tagId: string) => {
    const supabase = createClient();
    await supabase.from("contact_tags").delete().eq("id", contactTagId);
    setTags((prev) => prev.filter((t) => t.id !== tagId));
  }, []);

  if (!contact) {
    return (
      <div className="flex h-full w-70 items-center justify-center border-l border-border bg-card">
        <p className="text-sm text-muted-foreground">{tThread("selectConversation")}</p>
      </div>
    );
  }

  const displayName = contact.name || maskPhoneNumber(contact.phone);
  const initials = (contact.name || contact.phone || '?').charAt(0).toUpperCase();
  const displayPhone = showPhone ? contact.phone : maskPhoneNumber(contact.phone);

  return (
    <div className="flex h-full w-70 flex-col border-l border-border bg-card">
      <ScrollArea className="flex-1 scrollbar-thin">
        <div className="p-4">
          {/* Contact Info */}
          <div className="flex flex-col items-center text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted text-lg font-semibold text-foreground">
              {contact.avatar_url ? (
                <Image
                  src={contact.avatar_url}
                  alt={displayName}
                  width={64}
                  height={64}
                  unoptimized
                  className="h-16 w-16 rounded-full object-cover"
                />
              ) : (
                initials
              )}
            </div>
            <h3 className="mt-3 text-sm font-semibold text-foreground">
              {displayName}
            </h3>
            {contact.company && (
              <p className="text-xs text-muted-foreground">{contact.company}</p>
            )}
          </div>

          {/* Phone */}
          <div className="mt-4 space-y-2">
            <div className="flex items-center gap-1">
              <button
                onClick={handleCopyPhone}
                className="flex flex-1 items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted"
              >
                <Phone className="h-4 w-4 text-muted-foreground" />
                <span className="flex-1 text-left font-mono text-xs">{displayPhone}</span>
                {copied ? (
                  <Check className="h-3 w-3 text-primary" />
                ) : (
                  <Copy className="h-3 w-3 text-muted-foreground" />
                )}
              </button>
              <button
                onClick={() => {
                  setShowPhone(!showPhone);
                  if (!showPhone) {
                    auditLog(AuditEventType.CONTACT_PHONE_REVEALED, { contactId: contact.id });
                  }
                }}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted"
                title={showPhone ? "Hide number" : "Reveal number"}
              >
                {showPhone ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
            </div>

            {/* Call & WhatsApp actions */}
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={handleCallClick}
              >
                <PhoneCall className="mr-1.5 h-3.5 w-3.5" />
                Call
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={handleWhatsAppClick}
              >
                <MessageCircle className="mr-1.5 h-3.5 w-3.5" />
                WhatsApp
              </Button>
            </div>

            {contact.email && (
              <div className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <span className="truncate">{contact.email}</span>
              </div>
            )}
          </div>

          {/* Divider */}
          <div className="my-4 border-t border-border" />

          {/* Tags */}
          <div>
            <div className="flex items-center gap-2 px-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              <TagIcon className="h-3 w-3" />
              {tSidebar("tags")}
              <DropdownMenu>
                <DropdownMenuTrigger className="ml-auto rounded p-0.5 hover:bg-muted">
                  <Plus className="h-3 w-3 text-muted-foreground" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                    {tSidebar("assignTag")}
                  </div>
                  {allTags.length === 0 ? (
                    <div className="px-2 py-2 text-xs text-muted-foreground">
                      {tSidebar("noTags")}
                    </div>
                  ) : (
                    allTags.map((tag) => {
                      const isAssigned = tags.some((t) => t.id === tag.id);
                      return (
                        <DropdownMenuItem
                          key={tag.id}
                          onClick={() => handleTagToggle(tag.id, isAssigned)}
                          className="flex items-center gap-2 text-xs"
                        >
                          <span
                            className="size-2.5 shrink-0 rounded-full"
                            style={{ backgroundColor: tag.color }}
                          />
                          <span className="flex-1 truncate">{tag.name}</span>
                          {isAssigned && (
                            <Check className="h-3 w-3 text-primary" />
                          )}
                        </DropdownMenuItem>
                      );
                    })
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {tags.length === 0 ? (
                <p className="px-1 text-xs text-muted-foreground">{tSidebar("noTags")}</p>
              ) : (
                tags.map((tag) => (
                  <span
                    key={tag.contact_tag_id}
                    className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
                    style={{
                      backgroundColor: `${tag.color}20`,
                      color: tag.color,
                    }}
                  >
                    {tag.name}
                    <button
                      onClick={() =>
                        handleTagRemove(tag.contact_tag_id, tag.id)
                      }
                      className="hover:opacity-70"
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </span>
                ))
              )}
            </div>
          </div>

          {/* Divider */}
          <div className="my-4 border-t border-border" />

          {/* Active Deals */}
          <div>
            <div className="flex items-center gap-2 px-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              <DollarSign className="h-3 w-3" />
              {tSidebar("deals")}
            </div>
            <div className="mt-2 space-y-2">
              {deals.length === 0 ? (
                <p className="px-1 text-xs text-muted-foreground">{tSidebar("noDeals")}</p>
              ) : (
                deals.map((deal) => (
                  <div
                    key={deal.id}
                    className="rounded-lg bg-muted px-3 py-2"
                  >
                    <p className="text-sm font-medium text-foreground">
                      {deal.title}
                    </p>
                    <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                      <span>
                        {deal.currency ?? "$"}
                        {deal.value.toLocaleString()}
                      </span>
                      {deal.stage && (
                        <span
                          className="rounded-full px-1.5 py-0.5 text-[10px]"
                          style={{
                            backgroundColor: `${deal.stage.color}20`,
                            color: deal.stage.color,
                          }}
                        >
                          {deal.stage.name}
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Divider */}
          <div className="my-4 border-t border-border" />

          {/* Notes */}
          <div>
            <div className="flex items-center gap-2 px-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              <StickyNote className="h-3 w-3" />
              {tSidebar("notes")}
            </div>
            <div className="mt-2">
              <div className="flex gap-2">
                <textarea
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  placeholder={tSidebar("addNotePlaceholder")}
                  rows={2}
                  className="flex-1 resize-none rounded-lg border border-border bg-muted px-3 py-2 text-xs text-foreground placeholder-muted-foreground outline-none focus:border-primary/50"
                />
                <Button
                  size="sm"
                  className="h-auto bg-primary px-2 hover:bg-primary/90"
                  onClick={handleAddNote}
                  disabled={!newNote.trim() || addingNote}
                >
                  <Plus className="h-3 w-3" />
                </Button>
              </div>

              <div className="mt-2 space-y-2">
                {notes.map((note) => (
                  <div
                    key={note.id}
                    className="rounded-lg bg-muted px-3 py-2"
                  >
                    <p className="whitespace-pre-wrap text-xs text-muted-foreground">
                      {note.note_text}
                    </p>
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      {format(new Date(note.created_at), "MMM d, yyyy HH:mm")}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
