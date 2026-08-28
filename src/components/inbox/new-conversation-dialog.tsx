"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { Search, Plus, MessageSquare, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { maskPhoneNumber } from "@/lib/audit/masking";
import type { Contact } from "@/types";

interface NewConversationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectConversation: (conversationId: string, contact: Contact) => void;
  onAddNewContact?: () => void;
}

export function NewConversationDialog({
  open,
  onOpenChange,
  onSelectConversation,
  onAddNewContact,
}: NewConversationDialogProps) {
  const { accountId } = useAuth();
  const supabase = createClient();

  const [search, setSearch] = useState("");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(false);
  const [creatingId, setCreatingId] = useState<string | null>(null);
  const [revealedPhones, setRevealedPhones] = useState<Set<string>>(new Set());

  const fetchContacts = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("contacts")
        .select("id, name, phone, company, avatar_url, created_at, account_id")
        .eq("account_id", accountId)
        .order("name");

      if (error) throw error;
      setContacts((data ?? []) as Contact[]);
    } catch (err) {
      console.error("Failed to fetch contacts:", err);
      toast.error("Failed to load contacts");
    } finally {
      setLoading(false);
    }
  }, [accountId, supabase]);

  useEffect(() => {
    if (open) {
      fetchContacts();
      setSearch("");
    }
  }, [open, fetchContacts]);

  const filteredContacts = search.trim()
    ? contacts.filter(
        (c) =>
          c.name?.toLowerCase().includes(search.toLowerCase()) ||
          c.phone?.includes(search)
      )
    : contacts;

  const togglePhone = (id: string) => {
    setRevealedPhones((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectContact = async (contact: Contact) => {
    if (!accountId) return;
    setCreatingId(contact.id);

    try {
      const { data: existing } = await supabase
        .from("conversations")
        .select("id")
        .eq("account_id", accountId)
        .eq("contact_id", contact.id)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (existing) {
        onSelectConversation(existing.id, contact);
        onOpenChange(false);
        return;
      }

      const { data: newConv, error } = await supabase
        .from("conversations")
        .insert({
          account_id: accountId,
          contact_id: contact.id,
        })
        .select("id")
        .single();

      if (error) throw error;

      onSelectConversation(newConv.id, contact);
      onOpenChange(false);
    } catch (err) {
      console.error("Failed to create conversation:", err);
      toast.error("Failed to start conversation");
    } finally {
      setCreatingId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            New Conversation
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <Button
            variant="outline"
            className="w-full justify-start gap-2"
            onClick={() => {
              onOpenChange(false);
              onAddNewContact?.();
            }}
          >
            <Plus className="h-4 w-4" />
            Add New Contact
          </Button>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search contacts..."
              className="pl-9"
            />
          </div>

          <ScrollArea className="max-h-[300px]">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : filteredContacts.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                {search ? "No contacts found" : "No contacts yet"}
              </p>
            ) : (
              <div className="space-y-1">
                {filteredContacts.map((contact) => {
                  const isCreating = creatingId === contact.id;
                  const phoneRevealed = revealedPhones.has(contact.id);
                  const displayPhone = phoneRevealed
                    ? contact.phone
                    : maskPhoneNumber(contact.phone || "");

                  return (
                    <button
                      key={contact.id}
                      disabled={isCreating}
                      onClick={() => handleSelectContact(contact)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-muted",
                        isCreating && "opacity-50"
                      )}
                    >
                      <Avatar className="size-9">
                        {contact.avatar_url ? (
                          <img
                            src={contact.avatar_url}
                            alt={contact.name || ""}
                            className="size-9 rounded-full object-cover"
                          />
                        ) : (
                          <AvatarFallback className="bg-muted text-sm">
                            {(contact.name || contact.phone || "?")?.charAt(0).toUpperCase()}
                          </AvatarFallback>
                        )}
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {contact.name || contact.phone || "Unknown"}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {displayPhone}
                          {phoneRevealed ? (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                togglePhone(contact.id);
                              }}
                              className="ml-1 text-primary hover:underline"
                            >
                              Hide
                            </button>
                          ) : (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                togglePhone(contact.id);
                              }}
                              className="ml-1 text-primary hover:underline"
                            >
                              Show
                            </button>
                          )}
                        </p>
                      </div>
                      {isCreating ? (
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      ) : (
                        <MessageSquare className="h-4 w-4 text-muted-foreground" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
}
