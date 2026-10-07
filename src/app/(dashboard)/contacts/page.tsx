'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import type { Contact, Tag, ContactTag } from '@/types';
import { Button } from '@/components/ui/button';
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
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Plus,
  Upload,
  MoreHorizontal,
  Pencil,
  Trash2,
  Loader2,
  Users,
  SlidersHorizontal,
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
import {
  ResponsiveDataListing,
  type ColumnDef,
  type CardMapper,
  type FilterConfig,
} from '@/components/shared/responsive-data-listing';
import type { CardAction } from '@/components/shared/responsive-mobile-card';
import {
  displayContactPhone,
  displayContactName,
  isPlaceholderPhone,
} from '@/lib/audit/masking';
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
  const [isLoadingMore, setIsLoadingMore] = useState(false);
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

  const fetchContacts = useCallback(
    async (isLoadMore = false) => {
      const seq = ++fetchSeq.current;
      if (isLoadMore) setIsLoadingMore(true);
      else {
        setLoading(true);
        // The visible rows are about to change — drop any selection that
        // referred to the old page/search results so the bulk bar can't
        // act on rows the user can no longer see.
        setSelected(new Set());
      }

      const from = isLoadMore ? (page + 1) * PAGE_SIZE : 0;
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
          setIsLoadingMore(false);
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
        // windowed total count + offset pagination) so a tag covering
        // many contacts can't silently truncate the result or overflow
        // an IN clause. See migration 025_filter_contacts_by_tags.
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
          setIsLoadingMore(false);
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
          } catch (dbError) {
            console.error('[contacts] IndexedDB fallback also failed:', dbError);
            toast.error(t('toastFailedLoad'));
            setLoading(false);
            setIsLoadingMore(false);
            return;
          }
        } else {
          contactRows = data ?? [];
          count = exactCount ?? 0;
        }
      }

      if (seq !== fetchSeq.current) return;
      setTotalCount(count);

      if (contactRows.length === 0) {
        if (!isLoadMore) setContacts([]);
        setLoading(false);
        setIsLoadingMore(false);
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

      if (isLoadMore) {
        setContacts((prev) => [...prev, ...enriched]);
        setPage(page + 1);
      } else {
        setContacts(enriched);
        setPage(0);
      }
      setLoading(false);
      setIsLoadingMore(false);
    },
    [supabase, page, search, selectedTagIds, tagsMap, t, workspaceFilter]
  );

  // Load-once-on-mount-ish data fetches. Each setter inside runs
  // inside an async promise completion (Supabase await), not
  // synchronously in the effect body, so the cascade the lint rule
  // warns about doesn't apply here.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchTags();
  }, [fetchTags]);

  // Fresh fetches only — `page` is deliberately not a dependency: it is
  // incremented by load-more appends, and refetching on that change would
  // replace the appended list with page 0 (mirrors the orders page).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchContacts(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, selectedTagIds, workspaceFilter, tagsMap]);

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

  // Tag filter helpers. Every change triggers a fresh fetch (effect dep
  // above) so results always restart from the first window.
  const allTags = Object.values(tagsMap).sort((a, b) =>
    a.name.localeCompare(b.name)
  );
  const hasActiveFilters =
    search.trim().length > 0 ||
    selectedTagIds.length > 0 ||
    workspaceFilter !== null;

  const columns: ColumnDef<ContactWithTags>[] = [
    {
      header: (
        <Checkbox
          checked={allOnPageSelected}
          indeterminate={!allOnPageSelected && someOnPageSelected}
          onCheckedChange={toggleSelectAll}
          disabled={contacts.length === 0}
          aria-label="Select all contacts"
        />
      ),
      className: 'w-10',
      headerClassName: 'w-10',
      cell: (contact) => (
        <Checkbox
          checked={selected.has(contact.id)}
          onCheckedChange={() => toggleSelect(contact.id)}
          aria-label={`Select ${contact.name || contact.phone}`}
        />
      ),
    },
    {
      header: t('tableColumns.name'),
      cell: (contact) => (
        <div
          className="flex cursor-pointer items-center gap-1.5"
          onClick={() => openDetail(contact.id)}
        >
          <span className="truncate font-medium text-foreground transition-colors hover:text-primary">
            {displayContactName(contact.name, contact.phone, t('unnamed'))}
          </span>
          {showWorkspaceSelector && contact.account_id && (
            <WorkspaceBadge accountId={contact.account_id} size="sm" />
          )}
        </div>
      ),
    },
    {
      header: t('tableColumns.phone'),
      cell: (contact) => (
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-xs text-muted-foreground">
            {displayContactPhone(
              contact.phone,
              revealedPhones.has(contact.id)
            )}
          </span>
          {!isPlaceholderPhone(contact.phone) && (
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
              className="flex cursor-pointer items-center justify-center p-1.5 text-muted-foreground transition-colors hover:text-primary"
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
          )}
        </div>
      ),
    },
    {
      header: t('tableColumns.email'),
      className: 'hidden md:table-cell',
      headerClassName: 'hidden md:table-cell',
      cell: (contact) => (
        <span className="text-sm text-muted-foreground">
          {contact.email || '-'}
        </span>
      ),
    },
    {
      header: t('tableColumns.company'),
      className: 'hidden lg:table-cell',
      headerClassName: 'hidden lg:table-cell',
      cell: (contact) => (
        <span className="text-sm text-muted-foreground">
          {contact.company || '-'}
        </span>
      ),
    },
    {
      header: t('tableColumns.tags'),
      className: 'hidden md:table-cell',
      headerClassName: 'hidden md:table-cell',
      cell: (contact) => (
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
            <span className="text-xs text-muted-foreground">-</span>
          )}
          {contact.tags && contact.tags.length > 3 && (
            <span className="text-[10px] text-muted-foreground">
              +{contact.tags.length - 3}
            </span>
          )}
        </div>
      ),
    },
    {
      header: t('tableColumns.createdAt'),
      className: 'hidden lg:table-cell',
      headerClassName: 'hidden lg:table-cell',
      cell: (contact) => (
        <span className="text-xs text-muted-foreground">
          {new Date(contact.created_at).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })}
        </span>
      ),
    },
    {
      header: '',
      className: 'w-12',
      headerClassName: 'w-12',
      cell: (contact) => (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-muted-foreground hover:text-foreground"
              />
            }
          >
            <MoreHorizontal className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="bg-popover border-border">
            <DropdownMenuItem
              onClick={() => openDetail(contact.id)}
              className="text-popover-foreground focus:bg-muted focus:text-foreground"
            >
              <Eye className="size-4" />
              {t('viewAction')}
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-border" />
            {contact.account_id && contact.account_id !== accountId ? (
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
                onClick={() => {
                  void openEditForm(contact);
                }}
                className="text-popover-foreground focus:bg-muted focus:text-foreground"
              >
                <Pencil className="size-4" />
                {t('editAction')}
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator className="bg-border" />
            {contact.account_id && contact.account_id !== accountId ? (
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
                onClick={() => confirmDelete(contact)}
              >
                <Trash2 className="size-4" />
                {t('deleteAction')}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  // Mobile card — deliberately minimal: avatar, name, phone. Everything
  // else (email, company, tags, actions) lives behind tap-to-expand.
  const cardMapper: CardMapper<ContactWithTags> = {
    id: (contact) => contact.id,
    title: (contact) =>
      displayContactName(contact.name, contact.phone, t('unnamed')),
    subtitle: (contact) =>
      displayContactPhone(contact.phone, revealedPhones.has(contact.id)),
    image: (contact) => contact.avatar_url || null,
    fallbackIcon: (contact) => (
      <span className="text-sm font-medium text-foreground">
        {displayContactName(
          contact.name,
          contact.phone,
          t('unnamed')
        ).charAt(0).toUpperCase()}
      </span>
    ),
    statusBadge: (contact) =>
      showWorkspaceSelector && contact.account_id ? (
        <WorkspaceBadge accountId={contact.account_id} size="sm" />
      ) : undefined,
    detailFields: (contact) => [
      ...(contact.email
        ? [{ label: t('tableColumns.email'), value: contact.email }]
        : []),
      ...(contact.company
        ? [{ label: t('tableColumns.company'), value: contact.company }]
        : []),
      ...(contact.tags && contact.tags.length > 0
        ? [
            {
              label: t('tableColumns.tags'),
              value: (
                <div className="flex flex-wrap gap-1">
                  {contact.tags.map((tag) => (
                    <span
                      key={tag.id}
                      className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                      style={{
                        backgroundColor: tag.color + '20',
                        color: tag.color,
                      }}
                    >
                      {tag.name}
                    </span>
                  ))}
                </div>
              ),
            },
          ]
        : []),
      {
        label: t('tableColumns.createdAt'),
        value: new Date(contact.created_at).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        }),
      },
    ],
    actions: (contact): CardAction[] => {
      const crossWorkspace =
        !!contact.account_id && contact.account_id !== accountId;
      const actions: CardAction[] = [
        {
          label: t('viewAction'),
          icon: Eye,
          variant: 'outline',
          onClick: () => openDetail(contact.id),
        },
      ];
      if (!crossWorkspace) {
        actions.push({
          label: t('editAction'),
          icon: Pencil,
          variant: 'outline',
          onClick: () => {
            void openEditForm(contact);
          },
        });
        actions.push({
          label: t('deleteAction'),
          icon: Trash2,
          variant: 'destructive',
          onClick: () => confirmDelete(contact),
        });
      }
      return actions;
    },
  };

  const filters: FilterConfig[] = [
    ...(showWorkspaceSelector
      ? [
          {
            key: 'workspace',
            label: 'Workspace',
            value: workspaceFilter ?? '',
            onChange: (v: string) => setWorkspaceFilter(v || null),
            options: workspaces.map((w) => ({
              label: w.account_name,
              value: w.account_id,
            })),
          },
        ]
      : []),
    ...(allTags.length > 0
      ? [
          {
            key: 'tags',
            label: t('filterByTags'),
            multi: true,
            values: selectedTagIds,
            onValuesChange: setSelectedTagIds,
            options: allTags.map((tg) => ({
              label: tg.name,
              value: tg.id,
            })),
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-6">
      <ResponsiveDataListing<ContactWithTags>
        title={t('title')}
        description={
          totalCount > 0
            ? t('subtitle', { count: totalCount })
            : t('subtitleZero')
        }
        items={contacts}
        columns={columns}
        cardMapper={cardMapper}
        loading={loading}
        searchQuery={search}
        onSearchChange={setSearch}
        searchPlaceholder={t('searchPlaceholder')}
        filters={filters}
        secondaryActions={[
          ...(canEditSettings
            ? [
                {
                  label: t('customFieldsBtn'),
                  icon: SlidersHorizontal,
                  onClick: () => setCustomFieldsOpen(true),
                },
              ]
            : []),
          {
            label: t('importBtn'),
            icon: Upload,
            onClick: () => setImportOpen(true),
            canAct: canEdit,
            gateReason: 'add or import contacts',
          },
        ]}
        primaryAction={{
          label: t('addContactBtn'),
          icon: Plus,
          onClick: openAddForm,
          canAct: canEdit,
          gateReason: 'add or import contacts',
        }}
        bulkBar={
          selected.size > 0 ? (
            <div className="border-border bg-muted/40 flex items-center justify-between gap-4 rounded-lg border px-4 py-2">
              <p className="text-sm text-foreground">
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
          ) : undefined
        }
        emptyState={{
          icon: Users,
          title: hasActiveFilters ? t('noContactsMatch') : t('noContactsYet'),
          actionLabel: hasActiveFilters ? undefined : t('addFirstContact'),
          onAction: hasActiveFilters ? undefined : openAddForm,
        }}
        hasMore={contacts.length < totalCount}
        isLoadingMore={isLoadingMore}
        onLoadMore={() => fetchContacts(true)}
        rowKey={(contact) => contact.id}
      />

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
