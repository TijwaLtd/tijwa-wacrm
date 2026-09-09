'use client';

import { useState, useEffect, useCallback } from 'react';
import { Loader2, Plus, Package, Folder, Pencil, Archive, Image as ImageIcon, CheckCircle, Clock, ArchiveX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { MoreHorizontal } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/use-auth';
import { cn } from '@/lib/utils';
import {
  type Offering,
  type OfferingType,
  type OfferingStatus,
  OFFERING_TYPES,
  OFFERING_STATUSES,
  formatPrice,
} from '@/lib/business/offerings';
import { CatalogForm } from '@/components/catalog/catalog-form';
import { CategoryManager } from '@/components/catalog/category-manager';
import { ResponsiveDataListing, type ColumnDef, type CardMapper } from '@/components/shared/responsive-data-listing';

const PAGE_SIZE = 25;

export default function CatalogPage() {
  const { activeAccountId } = useAuth();
  const [offerings, setOfferings] = useState<Offering[]>([]);
  const [loading, setLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<OfferingType | ''>('');
  const [statusFilter, setStatusFilter] = useState<OfferingStatus | ''>('');
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [formOpen, setFormOpen] = useState(false);
  const [editingOffering, setEditingOffering] = useState<Offering | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<Offering | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [categoryManagerOpen, setCategoryManagerOpen] = useState(false);

  const fetchOfferings = useCallback(async (isLoadMore = false) => {
    if (!activeAccountId) return;
    if (isLoadMore) setIsLoadingMore(true);
    else setLoading(true);

    try {
      const currentPage = isLoadMore ? page + 1 : 0;
      const params = new URLSearchParams({
        account_id: activeAccountId,
        page: String(currentPage),
        limit: String(PAGE_SIZE),
      });
      if (typeFilter) params.set('type', typeFilter);
      if (statusFilter) params.set('status', statusFilter);

      const res = await fetch(`/api/offerings?${params}`);
      if (res.ok) {
        const data = await res.json();
        const newItems = data.offerings || [];
        setTotal(data.total || 0);

        if (isLoadMore) {
          setOfferings((prev) => [...prev, ...newItems]);
          setPage(currentPage);
        } else {
          setOfferings(newItems);
          setPage(0);
        }
      }
    } catch (err) {
      console.error('Failed to fetch offerings:', err);
    } finally {
      setLoading(false);
      setIsLoadingMore(false);
    }
  }, [activeAccountId, page, typeFilter, statusFilter]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    fetchOfferings(false);
  }, [activeAccountId, typeFilter, statusFilter]);

  const handleSearch = async () => {
    if (!activeAccountId || !searchQuery.trim()) {
      fetchOfferings(false);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(
        `/api/offerings/search?q=${encodeURIComponent(searchQuery)}&account_id=${activeAccountId}`
      );
      if (res.ok) {
        const data = await res.json();
        setOfferings(data.results || []);
        setTotal(data.results?.length || 0);
        setPage(0);
      }
    } catch (err) {
      console.error('Search failed:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/offerings/${deleteConfirm.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to archive');
      toast.success('Offering archived');
      setDeleteConfirm(null);
      fetchOfferings(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to archive');
    } finally {
      setDeleting(false);
    }
  };

  const getOfferingImage = (offering: Offering) => {
    // @ts-expect-error media is joined from API
    const media = offering.media;
    if (media && media.length > 0) {
      const primary = media.find((m: { is_primary: boolean }) => m.is_primary) || media[0];
      return primary.url;
    }
    return null;
  };

  const activeCount = offerings.filter((o) => o.status === 'active').length;
  const draftCount = offerings.filter((o) => o.status === 'draft').length;
  const archivedCount = offerings.filter((o) => o.status === 'archived').length;

  // Table Columns Definition
  const columns: ColumnDef<Offering>[] = [
    {
      header: 'Offering Name',
      cell: (offering) => {
        const imageUrl = getOfferingImage(offering);
        return (
          <div className="flex items-center gap-3">
            {imageUrl ? (
              <img src={imageUrl} alt={offering.name} className="h-10 w-10 rounded-lg object-cover border border-border/50 shrink-0" />
            ) : (
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted border border-border/40">
                <ImageIcon className="h-5 w-5 text-muted-foreground" />
              </div>
            )}
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground truncate">{offering.name}</p>
              {offering.short_description && (
                <p className="text-xs text-muted-foreground truncate max-w-[240px]">{offering.short_description}</p>
              )}
            </div>
          </div>
        );
      },
    },
    {
      header: 'Type',
      cell: (offering) => (
        <span className="text-sm text-muted-foreground">{OFFERING_TYPES[offering.type]?.label || offering.type}</span>
      ),
    },
    {
      header: 'Price',
      cell: (offering) => (
        <span className="text-sm font-semibold text-foreground font-mono">
          {formatPrice(offering.price, offering.currency, offering.price_type)}
        </span>
      ),
    },
    {
      header: 'Status',
      cell: (offering) => {
        const statusMeta = OFFERING_STATUSES[offering.status];
        return (
          <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold', statusMeta?.color)}>
            {statusMeta?.label || offering.status}
          </span>
        );
      },
    },
    {
      header: 'Actions',
      className: 'text-right',
      headerClassName: 'text-right',
      cell: (offering) => (
        <DropdownMenu>
          <DropdownMenuTrigger className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted focus:outline-none ml-auto">
            <MoreHorizontal className="h-4 w-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-36">
            <DropdownMenuItem onClick={() => { setEditingOffering(offering); setFormOpen(true); }}>
              <Pencil className="h-4 w-4 mr-2" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setDeleteConfirm(offering)} className="text-destructive">
              <Archive className="h-4 w-4 mr-2" />
              Archive
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  // Mobile App Card Mapper
  const cardMapper: CardMapper<Offering> = {
    id: (offering) => offering.id,
    title: (offering) => offering.name,
    subtitle: (offering) => offering.reference_code || OFFERING_TYPES[offering.type]?.label,
    image: (offering) => getOfferingImage(offering),
    fallbackIcon: () => <Package className="h-6 w-6 text-muted-foreground" />,
    statusBadge: (offering) => {
      const statusMeta = OFFERING_STATUSES[offering.status];
      return (
        <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider', statusMeta?.color)}>
          {statusMeta?.label}
        </span>
      );
    },
    amount: (offering) => formatPrice(offering.price, offering.currency, offering.price_type),
    detailFields: (offering) => [
      { label: 'Type', value: OFFERING_TYPES[offering.type]?.label || offering.type },
      { label: 'Price Type', value: offering.price_type },
      ...(offering.reference_code ? [{ label: 'Ref Code', value: offering.reference_code }] : []),
    ],
    description: (offering) => offering.description || offering.short_description,
    actions: (offering) => [
      {
        label: 'Edit',
        icon: Pencil,
        variant: 'outline',
        onClick: () => { setEditingOffering(offering); setFormOpen(true); },
      },
      {
        label: 'Archive',
        icon: Archive,
        variant: 'destructive',
        onClick: () => setDeleteConfirm(offering),
      },
    ],
  };

  return (
    <div className="space-y-6">
      {/* Top Overview Metric Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-border/80 bg-card p-3.5 shadow-xs">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium">Total Offerings</span>
            <Package className="h-4 w-4 text-primary" />
          </div>
          <p className="text-xl font-bold text-foreground mt-1.5">{total}</p>
        </div>

        <div className="rounded-xl border border-border/80 bg-card p-3.5 shadow-xs">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium">Active</span>
            <CheckCircle className="h-4 w-4 text-emerald-500" />
          </div>
          <p className="text-xl font-bold text-foreground mt-1.5">{activeCount}</p>
        </div>

        <div className="rounded-xl border border-border/80 bg-card p-3.5 shadow-xs">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium">Drafts</span>
            <Clock className="h-4 w-4 text-amber-500" />
          </div>
          <p className="text-xl font-bold text-foreground mt-1.5">{draftCount}</p>
        </div>

        <div className="rounded-xl border border-border/80 bg-card p-3.5 shadow-xs">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium">Archived</span>
            <ArchiveX className="h-4 w-4 text-zinc-500" />
          </div>
          <p className="text-xl font-bold text-foreground mt-1.5">{archivedCount}</p>
        </div>
      </div>

      {/* Main Responsive Data Listing */}
      <ResponsiveDataListing<Offering>
        title="Catalog"
        description="Manage products, services, rooms, menu items, and catalog offerings"
        items={offerings}
        columns={columns}
        cardMapper={cardMapper}
        loading={loading}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onSearchSubmit={handleSearch}
        searchPlaceholder="Search offerings by name, description, SKU..."
        filters={[
          {
            key: 'type',
            label: 'Type',
            value: typeFilter,
            onChange: (val) => setTypeFilter(val as OfferingType | ''),
            options: Object.entries(OFFERING_TYPES).map(([value, meta]) => ({
              label: meta.label,
              value,
            })),
          },
          {
            key: 'status',
            label: 'Status',
            value: statusFilter,
            onChange: (val) => setStatusFilter(val as OfferingStatus | ''),
            options: Object.entries(OFFERING_STATUSES).map(([value, meta]) => ({
              label: meta.label,
              value,
            })),
          },
        ]}
        primaryAction={{
          label: 'Add Offering',
          icon: Plus,
          onClick: () => { setEditingOffering(null); setFormOpen(true); },
        }}
        secondaryActions={[
          {
            label: 'Categories',
            icon: Folder,
            onClick: () => setCategoryManagerOpen(true),
          },
        ]}
        emptyState={{
          icon: Package,
          title: 'No offerings found',
          description: searchQuery || typeFilter || statusFilter
            ? 'Try adjusting your search query or active filters'
            : 'Get started by creating your first product or service offering',
          actionLabel: 'Add First Offering',
          onAction: () => { setEditingOffering(null); setFormOpen(true); },
        }}
        hasMore={offerings.length < total}
        isLoadingMore={isLoadingMore}
        onLoadMore={() => fetchOfferings(true)}
        rowKey={(o) => o.id}
      />

      {/* Create/Edit Form */}
      <CatalogForm
        open={formOpen}
        onOpenChange={setFormOpen}
        offering={editingOffering}
        onSuccess={() => { setFormOpen(false); fetchOfferings(false); }}
      />

      {/* Category Manager */}
      <CategoryManager
        open={categoryManagerOpen}
        onOpenChange={setCategoryManagerOpen}
      />

      {/* Delete Confirmation */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent className="bg-popover border-border text-popover-foreground sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Archive Offering?</DialogTitle>
            <DialogDescription>
              This will archive &ldquo;{deleteConfirm?.name}&rdquo;. It can be restored later.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="bg-popover border-border">
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}
              className="border-border text-muted-foreground hover:bg-muted">
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting && <Loader2 className="size-4 animate-spin" />}
              Archive
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
