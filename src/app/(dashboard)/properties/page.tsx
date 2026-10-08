'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Loader2,
  Plus,
  Home,
  Pencil,
  Archive,
  Image as ImageIcon,
  CheckCircle,
  BadgePercent,
  KeyRound,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { MoreHorizontal } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/use-auth';
import { cn } from '@/lib/utils';
import {
  type Offering,
  type OfferingStatus,
  OFFERING_STATUSES,
  formatPrice,
} from '@/lib/business/offerings';
import { CatalogForm } from '@/components/catalog/catalog-form';
import { ResponsiveDataListing, type ColumnDef, type CardMapper } from '@/components/shared/responsive-data-listing';
import { StatCard, STAT_GRID_CLASS } from '@/components/shared/stat-card';

const PAGE_SIZE = 25;

type PropertyMeta = {
  property_type?: string;
  listing_type?: string;
  bedrooms?: number | string;
  bathrooms?: number | string;
  area_sqft?: number | string;
  location?: string | { area?: string; address?: string };
  parking?: string;
  furnished?: string;
};

function getMeta(offering: Offering): PropertyMeta {
  return (offering.metadata || {}) as PropertyMeta;
}

function getLocationText(offering: Offering): string {
  const loc = getMeta(offering).location;
  if (typeof loc === 'string') return loc;
  if (loc && typeof loc === 'object') return loc.area || loc.address || '';
  return '';
}

function getListingType(offering: Offering): string {
  return (getMeta(offering).listing_type || '').toLowerCase();
}

function getOfferingImage(offering: Offering): string | null {
  // @ts-expect-error media is joined from API
  const media = offering.media;
  if (media && media.length > 0) {
    const primary = media.find((m: { is_primary: boolean }) => m.is_primary) || media[0];
    return primary.url;
  }
  return null;
}

export default function PropertiesPage() {
  const { activeAccountId } = useAuth();
  const [offerings, setOfferings] = useState<Offering[]>([]);
  const [loading, setLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<OfferingStatus | ''>('');
  const [listingFilter, setListingFilter] = useState('');
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [formOpen, setFormOpen] = useState(false);
  const [editingOffering, setEditingOffering] = useState<Offering | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<Offering | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchProperties = useCallback(async (isLoadMore = false) => {
    if (!activeAccountId) return;
    if (isLoadMore) setIsLoadingMore(true);
    else setLoading(true);

    try {
      const currentPage = isLoadMore ? page + 1 : 0;
      const params = new URLSearchParams({
        account_id: activeAccountId,
        page: String(currentPage),
        limit: String(PAGE_SIZE),
        type: 'property',
      });
      if (statusFilter) params.set('status', statusFilter);

      const res = await fetch(`/api/offerings?${params}`);
      if (res.ok) {
        const data = await res.json();
        const newItems: Offering[] = data.offerings || [];
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
      console.error('Failed to fetch properties:', err);
    } finally {
      setLoading(false);
      setIsLoadingMore(false);
    }
  }, [activeAccountId, page, statusFilter]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    fetchProperties(false);
  }, [activeAccountId, statusFilter]);

  const handleSearch = async () => {
    if (!activeAccountId || !searchQuery.trim()) {
      fetchProperties(false);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(
        `/api/offerings/search?q=${encodeURIComponent(searchQuery)}&account_id=${activeAccountId}`
      );
      if (res.ok) {
        const data = await res.json();
        const onlyProperties = (data.results || []).filter(
          (o: Offering) => o.type === 'property'
        );
        setOfferings(onlyProperties);
        setTotal(onlyProperties.length);
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
      toast.success('Property archived');
      setDeleteConfirm(null);
      fetchProperties(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to archive');
    } finally {
      setDeleting(false);
    }
  };

  // Server returns all statuses for type=property; apply listing filter client-side
  const listings = offerings.filter((o) => {
    if (!listingFilter) return true;
    return getListingType(o).includes(listingFilter);
  });

  const activeCount = offerings.filter((o) => o.status === 'active').length;
  const saleCount = offerings.filter((o) => getListingType(o).includes('sale')).length;
  const rentCount = offerings.filter((o) => getListingType(o).includes('rent')).length;

  const columns: ColumnDef<Offering>[] = [
    {
      header: 'Property',
      cell: (offering) => {
        const imageUrl = getOfferingImage(offering);
        const location = getLocationText(offering);
        const meta = getMeta(offering);
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
              <p className="text-xs text-muted-foreground truncate max-w-[240px]">
                {[location, meta.property_type].filter(Boolean).join(' · ') || offering.short_description || ''}
              </p>
            </div>
          </div>
        );
      },
    },
    {
      header: 'Listing',
      cell: (offering) => {
        const meta = getMeta(offering);
        const listingType = getListingType(offering);
        return (
          <div className="text-sm text-muted-foreground">
            <span
              className={cn(
                'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider',
                listingType.includes('rent')
                  ? 'bg-sky-500/10 text-sky-500'
                  : 'bg-emerald-500/10 text-emerald-500'
              )}
            >
              {listingType || 'sale'}
            </span>
            {meta.bedrooms != null && (
              <span className="ml-2">
                {String(meta.bedrooms)} bd · {String(meta.bathrooms ?? '-')} ba
              </span>
            )}
          </div>
        );
      },
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

  const cardMapper: CardMapper<Offering> = {
    id: (offering) => offering.id,
    title: (offering) => offering.name,
    subtitle: (offering) => getLocationText(offering) || getMeta(offering).property_type,
    image: (offering) => getOfferingImage(offering),
    fallbackIcon: () => <Home className="h-6 w-6 text-muted-foreground" />,
    statusBadge: (offering) => {
      const statusMeta = OFFERING_STATUSES[offering.status];
      return (
        <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider', statusMeta?.color)}>
          {statusMeta?.label}
        </span>
      );
    },
    amount: (offering) => formatPrice(offering.price, offering.currency, offering.price_type),
    detailFields: (offering) => {
      const meta = getMeta(offering);
      return [
        { label: 'Listing', value: getListingType(offering) || 'sale' },
        ...(meta.bedrooms != null ? [{ label: 'Bedrooms', value: String(meta.bedrooms) }] : []),
        ...(meta.bathrooms != null ? [{ label: 'Bathrooms', value: String(meta.bathrooms) }] : []),
        ...(meta.area_sqft != null ? [{ label: 'Area (sqft)', value: String(meta.area_sqft) }] : []),
      ];
    },
    description: (offering) => offering.description || offering.short_description,
    actions: (offering) => [
      {
        label: 'Edit',
        icon: Pencil,
        variant: 'outline' as const,
        onClick: () => { setEditingOffering(offering); setFormOpen(true); },
      },
      {
        label: 'Archive',
        icon: Archive,
        variant: 'destructive' as const,
        onClick: () => setDeleteConfirm(offering),
      },
    ],
  };

  return (
    <div className="space-y-6">
      {/* Top Overview Metric Cards */}
      <div className={STAT_GRID_CLASS}>
        <StatCard title="Total Properties" value={total} icon={Home} iconClassName="text-primary" />
        <StatCard title="Active" value={activeCount} icon={CheckCircle} iconClassName="text-emerald-500" />
        <StatCard title="For Sale" value={saleCount} icon={BadgePercent} iconClassName="text-emerald-500" />
        <StatCard title="For Rent" value={rentCount} icon={KeyRound} iconClassName="text-sky-500" />
      </div>

      {/* Main Responsive Data Listing */}
      <ResponsiveDataListing<Offering>
        title="Properties"
        description="Manage property listings — sale, rent, and lease"
        items={listings}
        columns={columns}
        cardMapper={cardMapper}
        loading={loading}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onSearchSubmit={handleSearch}
        searchPlaceholder="Search properties by name, location..."
        filters={[
          {
            key: 'listing',
            label: 'Listing',
            value: listingFilter,
            onChange: setListingFilter,
            options: [
              { label: 'For Sale', value: 'sale' },
              { label: 'For Rent', value: 'rent' },
            ],
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
          label: 'Add Property',
          icon: Plus,
          onClick: () => { setEditingOffering(null); setFormOpen(true); },
        }}
        emptyState={{
          icon: Home,
          title: 'No properties found',
          description: searchQuery || statusFilter || listingFilter
            ? 'Try adjusting your search query or active filters'
            : 'Get started by adding your first property listing',
          actionLabel: 'Add First Property',
          onAction: () => { setEditingOffering(null); setFormOpen(true); },
        }}
        hasMore={offerings.length < total}
        isLoadingMore={isLoadingMore}
        onLoadMore={() => fetchProperties(true)}
        rowKey={(o) => o.id}
      />

      {/* Create/Edit Form (type locked to property) */}
      <CatalogForm
        open={formOpen}
        onOpenChange={setFormOpen}
        offering={editingOffering}
        defaultType="property"
        onSuccess={() => { setFormOpen(false); fetchProperties(false); }}
      />

      {/* Archive Confirmation */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent className="bg-popover border-border text-popover-foreground sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Archive Property?</DialogTitle>
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
