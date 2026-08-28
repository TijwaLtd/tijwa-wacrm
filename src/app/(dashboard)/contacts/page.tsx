'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import type { Contact, Tag, ContactTag } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Search,
  Plus,
  Upload,
  MoreHorizontal,
  Pencil,
  Trash2,
  Loader2,
  Users,
  ChevronLeft,
  ChevronRight,
  SlidersHorizontal,
  Filter,
  X,
  Eye,
  EyeOff,
} from 'lucide-react';
import { ContactForm } from '@/components/contacts/contact-form';
import { ContactDetailView } from '@/components/contacts/contact-detail-view';
import { ImportModal } from '@/components/contacts/import-modal';
import { CustomFieldsManager } from '@/components/contacts/custom-fields-manager';
import { useCan } from '@/hooks/use-can';
import { GatedButton } from '@/components/ui/gated-button';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/hooks/use-auth';
import { WorkspaceBadge } from '@/components/shared/workspace-badge';
import { Building2, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { maskPhoneNumber } from '@/lib/audit/masking';
import { getContactsByTenant } from '@/lib/db';

const PAGE_SIZE = 25;

interface ContactWithTags extends Contact {
  tags?: Tag[];
}

export default function ContactsPage() {
  const t = useTranslations('Contacts.page');
  const supabase = createClient();
  const canEdit = useCan('send-messages');
  const canEditSettings = useCan('edit-settings');
  const { workspaces, accountId } = useAuth();

  const [contacts, setContacts] = useState<ContactWithTags[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [revealedPhones, setRevealedPhones] = useState<Set<string>>(new Set());
  // Tag filter — contacts shown must have ANY of these tags (OR).
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);

  // Multi-workspace filter
  const [workspaceFilter, setWorkspaceFilter] = useState<string | null>(null);
  const showWorkspaceSelector = workspaces.length > 1;

  // Modals
  const [formOpen, setFormOpen] = useState(false);
  const [editContact, setEditContact] = useState<Contact | null>(null);
  const [editContactTags, setEditContactTags] = useState<ContactTag[]>([]);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailContactId, setDetailContactId] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [customFieldsOpen, setCustomFieldsOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Contact | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Bulk selection (page-scoped — only the loaded rows are selectable)
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

  // All tags for display
  const [tagsMap, setTagsMap] = useState<Record<string, Tag>>({});

  // Guards against out-of-order fetch responses: each fetchContacts run
  // claims a sequence number and only the latest is allowed to commit its
  // results. Without this, rapidly toggling tag filters could let a slower
  // earlier request resolve last and render stale rows.
  const fetchSeq = useRef(0);

  const fetchTags = useCallback(async () => {
    const { data } = await supabase.from('tags').select('*');
    if (data) {
      const map: Record<string, Tag> = {};
      data.forEach((t) => (map[t.id] = t));
      setTagsMap(map);
      // Drop any filter selections whose tag no longer exists (e.g. a tag
      // deleted elsewhere) so it can't linger invisibly in the query.
      setSelectedTagIds((prev) => {
        const pruned = prev.filter((id) => map[id]);
        return pruned.length === prev.length ? prev : pruned;
      });
    }
  }, [supabase]);

  const fetchContacts = useCallback(async () => {
    const seq = ++fetchSeq.current;
    setLoading(true);
    // The visible rows are about to change — drop any selection that
    // referred to the old page/search results so the bulk bar can't
    // act on rows the user can no longer see.
    setSelected(new Set());

    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    const term = search.trim();

    let contactRows: Contact[] = [];
    let count = 0;

    if (workspaceFilter === null) {
      // All workspaces mode - use RPC
      const { data, error } = await supabase.rpc('get_user_contacts', {
        p_user_id: (await supabase.auth.getUser()).data.user?.id,
      });
      if (seq !== fetchSeq.current) return;
      if (error) {
        console.error(
          '[contacts] get_user_contacts RPC failed:',
          JSON.stringify(error),
          error.message,
          error.code,
          error.details,
          error.hint
        );
        toast.error(t('toastFailedLoad'));
        setLoading(false);
        return;
      }
      let allContacts = (data ?? []) as Contact[];
      // Apply search filter client-side
      if (term) {
        const lower = term.toLowerCase();
        allContacts = allContacts.filter(
          (c) =>
            c.name?.toLowerCase().includes(lower) ||
            c.phone?.toLowerCase().includes(lower) ||
            c.email?.toLowerCase().includes(lower)
        );
      }
      count = allContacts.length;
      contactRows = allContacts.slice(from, to + 1);
    } else if (selectedTagIds.length > 0) {
      // Tag filter active — resolve it server-side (join + distinct +
      // windowed total count + pagination) so a tag covering many
      // contacts can't silently truncate the result or overflow an IN
      // clause. See migration 025_filter_contacts_by_tags.
      const { data, error } = await supabase.rpc('filter_contacts_by_tags', {
        p_tag_ids: selectedTagIds,
        p_search: term || null,
        p_limit: PAGE_SIZE,
        p_offset: from,
      });
      if (seq !== fetchSeq.current) return; // superseded by a newer fetch
      if (error) {
        toast.error(t('toastFailedLoad'));
        setLoading(false);
        return;
      }
      const rows = (data ?? []) as { contact: Contact; total_count: number }[];
      contactRows = rows.map((r) => r.contact);
      count = rows.length > 0 ? Number(rows[0].total_count) : 0;
    } else {
      let query = supabase
        .from('contacts')
        .select('*', { count: 'exact' })
        .eq('account_id', workspaceFilter)
        .order('created_at', { ascending: false })
        .range(from, to);

      if (term) {
        const like = `%${term}%`;
        query = query.or(
          `name.ilike.${like},phone.ilike.${like},email.ilike.${like}`
        );
      }

      const { data, count: exactCount, error } = await query;
      if (seq !== fetchSeq.current) return; // superseded by a newer fetch

      if (error) {
        // Fallback to IndexedDB when offline
        console.warn(
          '[contacts] Supabase query failed, falling back to IndexedDB:',
          error.message
        );
        try {
          const offlineContacts = await getContactsByTenant(workspaceFilter);
          let filtered = offlineContacts;
          if (term) {
            const lower = term.toLowerCase();
            filtered = filtered.filter(
              (c) =>
                c.name?.toLowerCase().includes(lower) ||
                c.phone?.toLowerCase().includes(lower) ||
                c.email?.toLowerCase().includes(lower)
            );
          }
          count = filtered.length;
          contactRows = filtered.slice(from, to + 1);
          if (contactRows.length === 0) {
            setContacts([]);
            setTotalCount(0);
            setLoading(false);
            return;
          }
        } catch (dbError) {
          console.error('[contacts] IndexedDB fallback also failed:', dbError);
          toast.error(t('toastFailedLoad'));
          setLoading(false);
          return;
        }
      } else {
        contactRows = data ?? [];
        count = exactCount ?? 0;
      }
      count = exactCount ?? 0;
    }

    setTotalCount(count);

    if (contactRows.length === 0) {
      setContacts([]);
      setLoading(false);
      return;
    }

    // Fetch tags for these contacts
    const contactIds = contactRows.map((c) => c.id);
    const { data: contactTags } = await supabase
      .from('contact_tags')
      .select('contact_id, tag_id')
      .in('contact_id', contactIds);
    if (seq !== fetchSeq.current) return; // superseded by a newer fetch

    const tagsByContact: Record<string, string[]> = {};
    contactTags?.forEach((ct) => {
      if (!tagsByContact[ct.contact_id]) tagsByContact[ct.contact_id] = [];
      tagsByContact[ct.contact_id].push(ct.tag_id);
    });

    const enriched: ContactWithTags[] = contactRows.map((c) => ({
      ...c,
      tags: (tagsByContact[c.id] ?? [])
        .map((tid) => tagsMap[tid])
        .filter(Boolean),
    }));

    setContacts(enriched);
    setLoading(false);
  }, [supabase, page, search, selectedTagIds, tagsMap, t, workspaceFilter]);

  // Load-once-on-mount-ish data fetches. Each setter inside runs
  // inside an async promise completion (Supabase await), not
  // synchronously in the effect body, so the cascade the lint rule
  // warns about doesn't apply here.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchTags();
  }, [fetchTags]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchContacts();
  }, [fetchContacts]);

  function openAddForm() {
    setEditContact(null);
    setEditContactTags([]);
    setFormOpen(true);
  }

  async function openEditForm(contact: Contact) {
    const { data } = await supabase
      .from('contact_tags')
      .select('*')
      .eq('contact_id', contact.id);
    setEditContact(contact);
    setEditContactTags(data ?? []);
    setFormOpen(true);
  }

  function openDetail(contactId: string) {
    setDetailContactId(contactId);
    setDetailOpen(true);
  }

  function confirmDelete(contact: Contact) {
    setDeleteTarget(contact);
    setDeleteConfirmOpen(true);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);

    const { error } = await supabase
      .from('contacts')
      .delete()
      .eq('id', deleteTarget.id);

    if (error) {
      toast.error(t('toastFailedDelete'));
    } else {
      toast.success(t('toastDeleted'));
      fetchContacts();
    }

    setDeleting(false);
    setDeleteConfirmOpen(false);
    setDeleteTarget(null);
  }

  const allOnPageSelected =
    contacts.length > 0 && contacts.every((c) => selected.has(c.id));
  const someOnPageSelected = contacts.some((c) => selected.has(c.id));

  function toggleSelectAll() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) {
        contacts.forEach((c) => next.delete(c.id));
      } else {
        contacts.forEach((c) => next.add(c.id));
      }
      return next;
    });
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleBulkDelete() {
    const ids = [...selected];
    if (ids.length === 0) return;
    setDeleting(true);

    const { error } = await supabase.from('contacts').delete().in('id', ids);

    if (error) {
      toast.error(t('toastBulkFailedDelete'));
    } else {
      toast.success(t('toastBulkDeleted', { count: ids.length }));
      setSelected(new Set());
      fetchContacts();
    }

    setDeleting(false);
    setBulkDeleteOpen(false);
  }

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  const hasNext = page < totalPages - 1;
  const hasPrev = page > 0;

  // Tag filter helpers. Every change resets to page 0 — the result set
  // shrinks/grows so page N may no longer be valid (mirrors the search box).
  const allTags = Object.values(tagsMap).sort((a, b) =>
    a.name.localeCompare(b.name)
  );
  const hasActiveFilters =
    search.trim().length > 0 || selectedTagIds.length > 0;

  function toggleTagFilter(tagId: string) {
    setSelectedTagIds((prev) =>
      prev.includes(tagId)
        ? prev.filter((id) => id !== tagId)
        : [...prev, tagId]
    );
    setPage(0);
  }

  function clearTagFilters() {
    setSelectedTagIds([]);
    setPage(0);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 sm:gap-4">
        <div className="min-w-0">
          <h1 className="text-foreground text-2xl font-bold">{t('title')}</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {totalCount > 0
              ? t('subtitle', { count: totalCount })
              : t('subtitleZero')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Workspace filter — desktop only */}
          {showWorkspaceSelector && (
            <DropdownMenu>
              <DropdownMenuTrigger className="border-border bg-background text-muted-foreground hover:bg-muted data-[state=open]:bg-muted hidden h-9 items-center gap-1.5 rounded-md border px-3 text-sm sm:flex">
                <Building2 className="h-4 w-4" />
                {workspaceFilter === null ? (
                  <span>All</span>
                ) : (
                  <span>
                    {workspaces.find((w) => w.account_id === workspaceFilter)
                      ?.account_name ?? 'Workspace'}
                  </span>
                )}
                <ChevronDown className="h-3 w-3" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-fit min-w-[160px]">
                <DropdownMenuItem
                  onClick={() => {
                    setWorkspaceFilter(null);
                    setPage(0);
                  }}
                  className={cn(
                    'text-sm',
                    workspaceFilter === null && 'bg-muted text-primary'
                  )}
                >
                  All
                </DropdownMenuItem>
                {workspaces.map((ws) => (
                  <DropdownMenuItem
                    key={ws.account_id}
                    onClick={() => {
                      setWorkspaceFilter(ws.account_id);
                      setPage(0);
                    }}
                    className={cn(
                      'text-sm',
                      workspaceFilter === ws.account_id &&
                        'bg-muted text-primary'
                    )}
                  >
                    <div className="flex w-full items-center justify-between">
                      <span className="truncate">{ws.account_name}</span>
                      <span className="text-muted-foreground text-xs capitalize">
                        {ws.role}
                      </span>
                    </div>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {/* Mobile: actions in ... menu */}
          <DropdownMenu>
            <DropdownMenuTrigger className="border-border bg-background text-muted-foreground hover:bg-muted data-[state=open]:bg-muted flex h-9 w-9 items-center justify-center rounded-md border px-0 sm:hidden">
              <MoreHorizontal className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {showWorkspaceSelector && (
                <>
                  <DropdownMenuItem
                    onClick={() => setWorkspaceFilter(null)}
                    className={cn(
                      'text-sm',
                      workspaceFilter === null && 'bg-muted text-primary'
                    )}
                  >
                    <Building2 className="size-4" />
                    All Workspaces
                  </DropdownMenuItem>
                  {workspaces.map((ws) => (
                    <DropdownMenuItem
                      key={ws.account_id}
                      onClick={() => {
                        setWorkspaceFilter(ws.account_id);
                        setPage(0);
                      }}
                      className={cn(
                        'text-sm',
                        workspaceFilter === ws.account_id &&
                          'bg-muted text-primary'
                      )}
                    >
                      <Building2 className="size-4" />
                      {ws.account_name}
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                </>
              )}
              {canEditSettings && (
                <DropdownMenuItem
                  onClick={() => setCustomFieldsOpen(true)}
                  className="text-sm"
                >
                  <SlidersHorizontal className="size-4" />
                  {t('customFieldsBtn')}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                onClick={() => setImportOpen(true)}
                className="text-sm"
              >
                <Upload className="size-4" />
                {t('importBtn')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={openAddForm} className="text-sm">
                <Plus className="size-4" />
                {t('addContactBtn')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {/* Desktop: direct buttons */}
          {canEditSettings && (
            <Button
              variant="outline"
              onClick={() => setCustomFieldsOpen(true)}
              className="border-border text-muted-foreground hover:bg-muted hidden sm:flex"
            >
              <SlidersHorizontal className="size-4" />
              {t('customFieldsBtn')}
            </Button>
          )}
          <GatedButton
            variant="outline"
            canAct={canEdit}
            gateReason="add or import contacts"
            onClick={() => setImportOpen(true)}
            className="border-border text-muted-foreground hover:bg-muted hidden sm:flex"
          >
            <Upload className="size-4" />
            {t('importBtn')}
          </GatedButton>
          <GatedButton
            canAct={canEdit}
            gateReason="add or import contacts"
            onClick={openAddForm}
            className="bg-primary hover:bg-primary/90 text-primary-foreground hidden sm:flex"
          >
            <Plus className="size-4" />
            {t('addContactBtn')}
          </GatedButton>
        </div>
      </div>

      {/* Search + tag filter */}
      <div className="space-y-3 px-1">
        <div className="flex flex-row flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <Input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                // Reset pagination when the query changes — the result
                // set shrinks/grows, page N may no longer be valid.
                setPage(0);
              }}
              placeholder={t('searchPlaceholder')}
              className="bg-card border-border text-foreground placeholder:text-muted-foreground h-11 pl-10 text-base"
            />
          </div>

          <Popover>
            <PopoverTrigger
              render={
                <Button
                  variant="outline"
                  className="border-border text-muted-foreground hover:bg-muted h-11 shrink-0 px-4 text-base"
                />
              }
            >
              <Filter className="size-4" />
              {t('filterByTags')}
              {selectedTagIds.length > 0 && (
                <span className="bg-primary text-primary-foreground ml-1 inline-flex items-center justify-center rounded-full px-1.5 text-[10px] font-semibold">
                  {selectedTagIds.length}
                </span>
              )}
            </PopoverTrigger>
            <PopoverContent align="start" className="w-64 p-0">
              <div className="border-border flex items-center justify-between border-b px-3 py-2">
                <span className="text-popover-foreground text-sm font-medium">
                  {t('filterByTags')}
                </span>
                {selectedTagIds.length > 0 && (
                  <button
                    onClick={clearTagFilters}
                    className="text-muted-foreground hover:text-foreground text-xs"
                  >
                    {t('clearAll')}
                  </button>
                )}
              </div>
              {allTags.length === 0 ? (
                <p className="text-muted-foreground px-3 py-4 text-center text-sm">
                  {t('noTagsYet')}
                </p>
              ) : (
                <div className="max-h-64 overflow-y-auto py-1">
                  {allTags.map((tag) => (
                    <label
                      key={tag.id}
                      className="hover:bg-muted/50 flex cursor-pointer items-center gap-2.5 px-3 py-1.5"
                    >
                      <Checkbox
                        checked={selectedTagIds.includes(tag.id)}
                        onCheckedChange={() => toggleTagFilter(tag.id)}
                        aria-label={`Filter by ${tag.name}`}
                      />
                      <span
                        className="size-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: tag.color }}
                      />
                      <span className="text-popover-foreground truncate text-sm">
                        {tag.name}
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </PopoverContent>
          </Popover>
        </div>

        {/* Active tag-filter chips */}
        {selectedTagIds.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {selectedTagIds.map((id) => {
              const tag = tagsMap[id];
              if (!tag) return null;
              return (
                <span
                  key={id}
                  className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
                  style={{
                    backgroundColor: tag.color + '20',
                    color: tag.color,
                  }}
                >
                  {tag.name}
                  <button
                    onClick={() => toggleTagFilter(id)}
                    aria-label={`Remove ${tag.name} filter`}
                    className="hover:opacity-70"
                  >
                    <X className="size-3" />
                  </button>
                </span>
              );
            })}
            <button
              onClick={clearTagFilters}
              className="text-muted-foreground hover:text-foreground px-1 text-xs"
            >
              {t('clearAll')}
            </button>
          </div>
        )}
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="border-border bg-muted/40 flex items-center justify-between gap-4 rounded-lg border px-4 py-2">
          <p className="text-foreground text-sm">
            {t('selectedCount', { count: selected.size })}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelected(new Set())}
              className="text-muted-foreground hover:text-foreground"
            >
              {t('clearSelection')}
            </Button>
            <GatedButton
              variant="destructive"
              size="sm"
              canAct={canEdit}
              gateReason="delete contacts"
              onClick={() => setBulkDeleteOpen(true)}
            >
              <Trash2 className="size-4" />
              {t('deleteSelected')}
            </GatedButton>
          </div>
        </div>
      )}

      {/* Table — desktop only */}
      <div className="border-border hidden overflow-hidden rounded-lg border md:block">
        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              <TableHead className="w-10">
                <Checkbox
                  checked={allOnPageSelected}
                  indeterminate={!allOnPageSelected && someOnPageSelected}
                  onCheckedChange={toggleSelectAll}
                  disabled={contacts.length === 0}
                  aria-label="Select all contacts on this page"
                />
              </TableHead>
              <TableHead className="text-muted-foreground">
                {t('tableColumns.name')}
              </TableHead>
              <TableHead className="text-muted-foreground">
                {t('tableColumns.phone')}
              </TableHead>
              <TableHead className="text-muted-foreground hidden md:table-cell">
                {t('tableColumns.email')}
              </TableHead>
              <TableHead className="text-muted-foreground hidden lg:table-cell">
                {t('tableColumns.company')}
              </TableHead>
              <TableHead className="text-muted-foreground hidden md:table-cell">
                {t('tableColumns.tags')}
              </TableHead>
              <TableHead className="text-muted-foreground hidden lg:table-cell">
                {t('tableColumns.createdAt')}
              </TableHead>
              <TableHead className="text-muted-foreground w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow className="border-border">
                <TableCell colSpan={8} className="py-12 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="text-primary size-6 animate-spin" />
                    <p className="text-muted-foreground text-sm">
                      {t('loading')}
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            ) : contacts.length === 0 ? (
              <TableRow className="border-border">
                <TableCell colSpan={8} className="py-12 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <Users className="text-muted-foreground size-8" />
                    <p className="text-muted-foreground text-sm">
                      {hasActiveFilters
                        ? t('noContactsMatch')
                        : t('noContactsYet')}
                    </p>
                    {!hasActiveFilters && (
                      <GatedButton
                        canAct={canEdit}
                        gateReason="add or import contacts"
                        variant="outline"
                        size="sm"
                        onClick={openAddForm}
                        className="border-border text-muted-foreground hover:bg-muted mt-2"
                      >
                        <Plus className="size-3.5" />
                        {t('addFirstContact')}
                      </GatedButton>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              contacts.map((contact) => (
                <TableRow
                  key={contact.id}
                  className="border-border hover:bg-muted/50 cursor-pointer"
                  onClick={() => openDetail(contact.id)}
                >
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={selected.has(contact.id)}
                      onCheckedChange={() => toggleSelect(contact.id)}
                      aria-label={`Select ${contact.name || contact.phone}`}
                    />
                  </TableCell>
                  <TableCell className="text-foreground font-medium">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate">
                        {contact.name || (
                          <span className="text-muted-foreground italic">
                            {t('unnamed')}
                          </span>
                        )}
                      </span>
                      {contact.account_id && (
                        <WorkspaceBadge
                          accountId={contact.account_id}
                          size="sm"
                        />
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground font-mono text-xs">
                    <div className="flex items-center gap-1.5">
                      <span>
                        {revealedPhones.has(contact.id)
                          ? contact.phone
                          : maskPhoneNumber(contact.phone)}
                      </span>
                      <button
                        onClick={() => {
                          setRevealedPhones((prev) => {
                            const next = new Set(prev);
                            if (next.has(contact.id)) {
                              next.delete(contact.id);
                            } else {
                              next.add(contact.id);
                            }
                            return next;
                          });
                        }}
                        className="text-muted-foreground hover:text-primary flex cursor-pointer items-center justify-center p-1 transition-colors"
                        title={
                          revealedPhones.has(contact.id)
                            ? 'Hide number'
                            : 'Reveal number'
                        }
                      >
                        {revealedPhones.has(contact.id) ? (
                          <EyeOff className="size-3" />
                        ) : (
                          <Eye className="size-3" />
                        )}
                      </button>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground hidden text-sm md:table-cell">
                    {contact.email || (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground hidden text-sm lg:table-cell">
                    {contact.company || (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <div className="flex flex-wrap gap-1">
                      {contact.tags && contact.tags.length > 0 ? (
                        contact.tags.slice(0, 3).map((tag) => (
                          <span
                            key={tag.id}
                            className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium"
                            style={{
                              backgroundColor: tag.color + '20',
                              color: tag.color,
                            }}
                          >
                            {tag.name}
                          </span>
                        ))
                      ) : (
                        <span className="text-muted-foreground text-xs">-</span>
                      )}
                      {contact.tags && contact.tags.length > 3 && (
                        <span className="text-muted-foreground text-[10px]">
                          +{contact.tags.length - 3}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground hidden text-xs lg:table-cell">
                    {new Date(contact.created_at).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="text-muted-foreground hover:text-foreground"
                            onClick={(e) => e.stopPropagation()}
                          />
                        }
                      >
                        <MoreHorizontal className="size-4" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="end"
                        className="bg-popover border-border"
                      >
                        {contact.account_id &&
                        contact.account_id !== accountId ? (
                          <Tooltip>
                            <TooltipTrigger
                              render={
                                <DropdownMenuItem
                                  disabled
                                  className="text-popover-foreground focus:bg-muted focus:text-foreground opacity-50"
                                />
                              }
                            >
                              <Pencil className="size-4" />
                              {t('editAction')}
                            </TooltipTrigger>
                            <TooltipContent>
                              {t('crossWorkspaceEditHint')}
                            </TooltipContent>
                          </Tooltip>
                        ) : (
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              openEditForm(contact);
                            }}
                            className="text-popover-foreground focus:bg-muted focus:text-foreground"
                          >
                            <Pencil className="size-4" />
                            {t('editAction')}
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator className="bg-border" />
                        {contact.account_id &&
                        contact.account_id !== accountId ? (
                          <Tooltip>
                            <TooltipTrigger
                              render={
                                <DropdownMenuItem
                                  disabled
                                  variant="destructive"
                                  className="opacity-50"
                                />
                              }
                            >
                              <Trash2 className="size-4" />
                              {t('deleteAction')}
                            </TooltipTrigger>
                            <TooltipContent>
                              {t('crossWorkspaceDeleteHint')}
                            </TooltipContent>
                          </Tooltip>
                        ) : (
                          <DropdownMenuItem
                            variant="destructive"
                            onClick={(e) => {
                              e.stopPropagation();
                              confirmDelete(contact);
                            }}
                          >
                            <Trash2 className="size-4" />
                            {t('deleteAction')}
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Mobile contact cards */}
      <div className="divide-border divide-y md:hidden">
        {loading ? (
          <div className="flex flex-col items-center justify-center gap-3 py-12">
            <Loader2 className="text-primary size-6 animate-spin" />
            <p className="text-muted-foreground text-sm">{t('loading')}</p>
          </div>
        ) : contacts.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-12">
            <Users className="text-muted-foreground size-8" />
            <p className="text-muted-foreground text-sm">
              {hasActiveFilters ? t('noContactsMatch') : t('noContactsYet')}
            </p>
            {!hasActiveFilters && (
              <GatedButton
                canAct={canEdit}
                gateReason="add or import contacts"
                variant="outline"
                size="sm"
                onClick={openAddForm}
                className="border-border text-muted-foreground hover:bg-muted mt-2"
              >
                <Plus className="size-3.5" />
                {t('addFirstContact')}
              </GatedButton>
            )}
          </div>
        ) : (
          contacts.map((contact) => {
            const initials = (contact.name || contact.phone || '?')
              .charAt(0)
              .toUpperCase();
            const displayPhone = revealedPhones.has(contact.id)
              ? contact.phone
              : maskPhoneNumber(contact.phone);
            return (
              <div
                key={contact.id}
                className="hover:bg-muted/50 flex cursor-pointer items-start gap-3 p-4"
                onClick={() => openDetail(contact.id)}
              >
                <Checkbox
                  checked={selected.has(contact.id)}
                  onCheckedChange={() => toggleSelect(contact.id)}
                  onClick={(e) => e.stopPropagation()}
                  aria-label={`Select ${contact.name || contact.phone}`}
                  className="mt-1"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <div className="bg-muted text-foreground flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-sm font-medium">
                        {contact.avatar_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={contact.avatar_url}
                            alt={contact.name || 'Avatar'}
                            className="h-10 w-10 rounded-full object-cover"
                          />
                        ) : (
                          initials
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-foreground truncate text-sm font-medium">
                          {contact.name || (
                            <span className="text-muted-foreground italic">
                              {t('unnamed')}
                            </span>
                          )}
                        </p>
                        {contact.company && (
                          <p className="text-muted-foreground truncate text-xs">
                            {contact.company}
                          </p>
                        )}
                      </div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="text-muted-foreground hover:text-foreground flex-shrink-0"
                            onClick={(e) => e.stopPropagation()}
                          />
                        }
                      >
                        <MoreHorizontal className="size-4" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="end"
                        className="bg-popover border-border"
                      >
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            openEditForm(contact);
                          }}
                          className="text-popover-foreground focus:bg-muted focus:text-foreground"
                        >
                          <Pencil className="size-4" />
                          {t('editAction')}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator className="bg-border" />
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            confirmDelete(contact);
                          }}
                        >
                          <Trash2 className="size-4" />
                          {t('deleteAction')}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <div className="mt-2 flex items-center gap-1">
                    <span className="text-muted-foreground font-mono text-xs">
                      {displayPhone}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setRevealedPhones((prev) => {
                          const next = new Set(prev);
                          if (next.has(contact.id)) {
                            next.delete(contact.id);
                          } else {
                            next.add(contact.id);
                          }
                          return next;
                        });
                      }}
                      className="text-muted-foreground hover:text-primary flex items-center justify-center p-1 transition-colors"
                    >
                      {revealedPhones.has(contact.id) ? (
                        <EyeOff className="size-3" />
                      ) : (
                        <Eye className="size-3" />
                      )}
                    </button>
                  </div>
                  {contact.email && (
                    <p className="text-muted-foreground mt-1 truncate text-xs">
                      {contact.email}
                    </p>
                  )}
                  {contact.tags && contact.tags.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {contact.tags.slice(0, 3).map((tag) => (
                        <span
                          key={tag.id}
                          className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium"
                          style={{
                            backgroundColor: tag.color + '20',
                            color: tag.color,
                          }}
                        >
                          {tag.name}
                        </span>
                      ))}
                      {contact.tags.length > 3 && (
                        <span className="text-muted-foreground text-[10px]">
                          +{contact.tags.length - 3}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-muted-foreground text-xs">
            {t('showingPagination', {
              start: page * PAGE_SIZE + 1,
              end: Math.min((page + 1) * PAGE_SIZE, totalCount),
              total: totalCount,
            })}
          </p>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon-sm"
              disabled={!hasPrev}
              onClick={() => setPage((p) => p - 1)}
              className="border-border text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
            >
              <ChevronLeft className="size-4" />
            </Button>
            <span className="text-muted-foreground px-2 text-xs">
              {t('pageCount', { page: page + 1, total: totalPages })}
            </span>
            <Button
              variant="outline"
              size="icon-sm"
              disabled={!hasNext}
              onClick={() => setPage((p) => p + 1)}
              className="border-border text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Contact Form Dialog */}
      <ContactForm
        open={formOpen}
        onOpenChange={setFormOpen}
        contact={editContact}
        contactTags={editContactTags}
        onSaved={() => {
          fetchContacts();
          fetchTags();
        }}
        onViewExisting={(id) => {
          setFormOpen(false);
          openDetail(id);
        }}
      />

      {/* Contact Detail Sheet */}
      <ContactDetailView
        open={detailOpen}
        onOpenChange={setDetailOpen}
        contactId={detailContactId}
        onUpdated={fetchContacts}
      />

      {/* Import Modal */}
      <ImportModal
        open={importOpen}
        onOpenChange={setImportOpen}
        onImported={fetchContacts}
      />

      {/* Custom Fields Manager (admin+) */}
      {canEditSettings && (
        <CustomFieldsManager
          open={customFieldsOpen}
          onOpenChange={setCustomFieldsOpen}
        />
      )}

      {/* Delete Confirmation */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent className="bg-popover border-border text-popover-foreground sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-popover-foreground">
              {t('deleteContactTitle')}
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              {t('deleteContactDesc', {
                name: deleteTarget?.name || deleteTarget?.phone || '',
              })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="bg-popover border-border">
            <Button
              variant="outline"
              onClick={() => setDeleteConfirmOpen(false)}
              className="border-border text-muted-foreground hover:bg-muted"
            >
              {t('cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting && <Loader2 className="size-4 animate-spin" />}
              {t('deleteBtn')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Delete Confirmation */}
      <Dialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <DialogContent className="bg-popover border-border text-popover-foreground sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-popover-foreground">
              {t('deleteBulkTitle')}
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              {t('deleteBulkDesc', { count: selected.size })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="bg-popover border-border">
            <Button
              variant="outline"
              onClick={() => setBulkDeleteOpen(false)}
              className="border-border text-muted-foreground hover:bg-muted"
            >
              {t('cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={handleBulkDelete}
              disabled={deleting}
            >
              {deleting && <Loader2 className="size-4 animate-spin" />}
              {t('deleteBtn')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
