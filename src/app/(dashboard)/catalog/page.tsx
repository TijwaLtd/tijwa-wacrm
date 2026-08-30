'use client';

import { useState, useEffect, useCallback } from 'react';
import { Loader2, Plus, Package, Search, MoreHorizontal, Pencil, Archive, Image as ImageIcon, Folder } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
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

const PAGE_SIZE = 25;

export default function CatalogPage() {
  const { activeAccountId } = useAuth();
  const [offerings, setOfferings] = useState<Offering[]>([]);
  const [loading, setLoading] = useState(true);
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

  const fetchOfferings = useCallback(async () => {
    if (!activeAccountId) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        account_id: activeAccountId,
        page: String(page),
        limit: String(PAGE_SIZE),
      });
      if (typeFilter) params.set('type', typeFilter);
      if (statusFilter) params.set('status', statusFilter);

      const res = await fetch(`/api/offerings?${params}`);
      if (res.ok) {
        const data = await res.json();
        setOfferings(data.offerings || []);
        setTotal(data.total || 0);
      }
    } catch (err) {
      console.error('Failed to fetch offerings:', err);
    } finally {
      setLoading(false);
    }
  }, [activeAccountId, page, typeFilter, statusFilter]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    fetchOfferings();
  }, [fetchOfferings]);

  const handleSearch = async () => {
    if (!activeAccountId || !searchQuery.trim()) {
      fetchOfferings();
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
      fetchOfferings();
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Catalog</h1>
          <p className="text-sm text-muted-foreground">Manage your offerings</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setCategoryManagerOpen(true)} className="border-border gap-2">
            <Folder className="h-4 w-4" />
            <span className="hidden sm:inline">Categories</span>
          </Button>
          <Button onClick={() => { setEditingOffering(null); setFormOpen(true); }} className="gap-2">
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Add Offering</span>
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search offerings..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            className="border-border bg-muted pl-10"
          />
        </div>
        <select
          value={typeFilter}
          onChange={(e) => { setTypeFilter(e.target.value as OfferingType | ''); setPage(0); }}
          className="border-border bg-muted text-foreground rounded-md px-3 py-2 text-sm"
        >
          <option value="">All Types</option>
          {Object.entries(OFFERING_TYPES).map(([value, meta]) => (
            <option key={value} value={value}>{meta.label}</option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value as OfferingStatus | ''); setPage(0); }}
          className="border-border bg-muted text-foreground rounded-md px-3 py-2 text-sm"
        >
          <option value="">All Statuses</option>
          {Object.entries(OFFERING_STATUSES).map(([value, meta]) => (
            <option key={value} value={value}>{meta.label}</option>
          ))}
        </select>
      </div>

      {/* Loading */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : offerings.length === 0 ? (
        /* Empty State */
        <div className="flex flex-col items-center justify-center rounded-lg border border-border py-12">
          <Package className="h-12 w-12 text-muted-foreground" />
          <p className="mt-4 text-sm text-muted-foreground">No offerings yet</p>
          <Button
            variant="outline"
            onClick={() => { setEditingOffering(null); setFormOpen(true); }}
            className="mt-4 border-border"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Your First Offering
          </Button>
        </div>
      ) : (
        <>
          {/* Desktop Table */}
          <div className="hidden overflow-hidden rounded-lg border border-border md:block">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Name</th>
                  <th className="hidden px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider md:table-cell">Type</th>
                  <th className="hidden px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider lg:table-cell">Price</th>
                  <th className="hidden px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider sm:table-cell">Status</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {offerings.map((offering) => {
                  const imageUrl = getOfferingImage(offering);
                  const typeMeta = OFFERING_TYPES[offering.type];
                  const statusMeta = OFFERING_STATUSES[offering.status];
                  return (
                    <tr key={offering.id} className="hover:bg-muted/50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {imageUrl ? (
                            <img src={imageUrl} alt={offering.name} className="h-10 w-10 rounded-lg object-cover" />
                          ) : (
                            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                              <ImageIcon className="h-5 w-5 text-muted-foreground" />
                            </div>
                          )}
                          <div>
                            <p className="text-sm font-medium text-foreground">{offering.name}</p>
                            {offering.short_description && (
                              <p className="text-xs text-muted-foreground truncate max-w-[200px]">{offering.short_description}</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="hidden px-4 py-3 md:table-cell">
                        <span className="text-sm text-muted-foreground">{typeMeta?.label || offering.type}</span>
                      </td>
                      <td className="hidden px-4 py-3 lg:table-cell">
                        <span className="text-sm text-foreground">
                          {formatPrice(offering.price, offering.currency, offering.price_type)}
                        </span>
                      </td>
                      <td className="hidden px-4 py-3 sm:table-cell">
                        <span className={cn('inline-flex items-center rounded-full px-2 py-1 text-xs font-medium', statusMeta?.color)}>
                          {statusMeta?.label || offering.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted focus:outline-none">
                            <MoreHorizontal className="h-4 w-4" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
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
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="divide-y divide-border rounded-lg border border-border md:hidden">
            {offerings.map((offering) => {
              const imageUrl = getOfferingImage(offering);
              const typeMeta = OFFERING_TYPES[offering.type];
              const statusMeta = OFFERING_STATUSES[offering.status];
              return (
                <div key={offering.id} className="flex items-start gap-3 p-4">
                  {imageUrl ? (
                    <img src={imageUrl} alt={offering.name} className="h-12 w-12 rounded-lg object-cover" />
                  ) : (
                    <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-muted">
                      <ImageIcon className="h-6 w-6 text-muted-foreground" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-foreground truncate">{offering.name}</p>
                      <span className={cn('inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium', statusMeta?.color)}>
                        {statusMeta?.label}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">{typeMeta?.label}</p>
                    <p className="text-xs text-foreground mt-1">
                      {formatPrice(offering.price, offering.currency, offering.price_type)}
                    </p>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted focus:outline-none">
                      <MoreHorizontal className="h-4 w-4" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
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
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          {total > PAGE_SIZE && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Showing {page * PAGE_SIZE + 1}-{Math.min((page + 1) * PAGE_SIZE, total)} of {total}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="border-border"
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => p + 1)}
                  disabled={(page + 1) * PAGE_SIZE >= total}
                  className="border-border"
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Create/Edit Form */}
      <CatalogForm
        open={formOpen}
        onOpenChange={setFormOpen}
        offering={editingOffering}
        onSuccess={() => { setFormOpen(false); fetchOfferings(); }}
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
