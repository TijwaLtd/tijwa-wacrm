'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Loader2, Plus, ShoppingCart, MoreHorizontal, Pencil, Trash2, X, Clock, CheckCircle2, Truck, PackageX, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/use-auth';
import { cn } from '@/lib/utils';
import { type Order, type OrderStatus, ORDER_STATUSES, formatCurrency } from '@/lib/business/orders';
import { ResponsiveDataListing, type ColumnDef, type CardMapper } from '@/components/shared/responsive-data-listing';

const PAGE_SIZE = 25;

export default function OrdersPage() {
  const { activeAccountId } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<OrderStatus | ''>('');
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [formOpen, setFormOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<Order | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Form state
  const [formItems, setFormItems] = useState<Array<{ name: string; quantity: number; unit_price: number }>>([]);
  const [formNotes, setFormNotes] = useState('');
  const [formStatus, setFormStatus] = useState<OrderStatus>('pending');
  const [formTax, setFormTax] = useState('');
  const [formDiscount, setFormDiscount] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchOrders = useCallback(async (isLoadMore = false) => {
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
      if (statusFilter) params.set('status', statusFilter);

      const res = await fetch(`/api/orders?${params}`);
      if (res.ok) {
        const data = await res.json();
        const newOrders = data.orders || [];
        setTotal(data.total || 0);

        if (isLoadMore) {
          setOrders((prev) => [...prev, ...newOrders]);
          setPage(currentPage);
        } else {
          setOrders(newOrders);
          setPage(0);
        }
      }
    } catch (err) {
      console.error('Failed to fetch orders:', err);
    } finally {
      setLoading(false);
      setIsLoadingMore(false);
    }
  }, [activeAccountId, page, statusFilter]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    fetchOrders(false);
  }, [activeAccountId, statusFilter]);

  // Client-side search filtering fallback for search query
  const filteredOrders = orders.filter((ord) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      ord.order_number.toLowerCase().includes(q) ||
      (ord.notes && ord.notes.toLowerCase().includes(q))
    );
  });

  const openForm = (order?: Order) => {
    if (order) {
      setEditingOrder(order);
      // @ts-expect-error items is joined from API
      const items = order.items || [];
      setFormItems(items.map((i: { name: string; quantity: number; unit_price: number }) => ({
        name: i.name, quantity: i.quantity, unit_price: i.unit_price,
      })));
      setFormNotes(order.notes || '');
      setFormStatus(order.status);
      setFormTax(order.tax_amount ? String(order.tax_amount) : '');
      setFormDiscount(order.discount_amount ? String(order.discount_amount) : '');
    } else {
      setEditingOrder(null);
      setFormItems([{ name: '', quantity: 1, unit_price: 0 }]);
      setFormNotes('');
      setFormStatus('pending');
      setFormTax('');
      setFormDiscount('');
    }
    setFormOpen(true);
  };

  const handleSubmit = async () => {
    if (!activeAccountId || formItems.length === 0) return;
    setSaving(true);
    try {
      const body = {
        account_id: activeAccountId,
        items: formItems.filter(i => i.name.trim()),
        notes: formNotes.trim() || null,
        status: editingOrder ? formStatus : undefined,
        tax_amount: formTax ? parseFloat(formTax) : undefined,
        discount_amount: formDiscount ? parseFloat(formDiscount) : undefined,
      };

      let res;
      if (editingOrder) {
        res = await fetch(`/api/orders/${editingOrder.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
      } else {
        res = await fetch('/api/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
      }

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save');
      }

      toast.success(editingOrder ? 'Order updated' : 'Order created');
      setFormOpen(false);
      fetchOrders(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/orders/${deleteConfirm.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete');
      toast.success('Order deleted');
      setDeleteConfirm(null);
      fetchOrders(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete');
    } finally {
      setDeleting(false);
    }
  };

  const formSubtotal = formItems.reduce((sum, i) => sum + (i.quantity * i.unit_price), 0);
  const formTotal = formSubtotal + (parseFloat(formTax) || 0) - (parseFloat(formDiscount) || 0);

  // Overview stats
  const pendingCount = orders.filter((o) => o.status === 'pending').length;
  const processingCount = orders.filter((o) => o.status === 'confirmed' || o.status === 'processing').length;
  const deliveredCount = orders.filter((o) => o.status === 'delivered' || o.status === 'shipped').length;

  // Table Columns Definition
  const columns: ColumnDef<Order>[] = [
    {
      header: 'Order #',
      cell: (order) => (
        <Link
          href={`/orders/${order.id}`}
          className="text-sm font-semibold text-foreground hover:text-primary transition-colors font-mono"
        >
          {order.order_number}
        </Link>
      ),
    },
    {
      header: 'Items',
      cell: (order) => {
        // @ts-expect-error items is joined from API
        const itemCount = order.items?.length || 0;
        return <span className="text-sm text-muted-foreground">{itemCount} item{itemCount !== 1 ? 's' : ''}</span>;
      },
    },
    {
      header: 'Total Amount',
      cell: (order) => (
        <span className="text-sm font-semibold text-foreground font-mono">
          {formatCurrency(order.total, order.currency)}
        </span>
      ),
    },
    {
      header: 'Status',
      cell: (order) => {
        const statusMeta = ORDER_STATUSES[order.status];
        return (
          <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold', statusMeta?.color)}>
            {statusMeta?.label || order.status}
          </span>
        );
      },
    },
    {
      header: 'Created Date',
      cell: (order) => (
        <span className="text-xs text-muted-foreground">
          {new Date(order.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
        </span>
      ),
    },
    {
      header: 'Actions',
      className: 'text-right',
      headerClassName: 'text-right',
      cell: (order) => (
        <DropdownMenu>
          <DropdownMenuTrigger className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted focus:outline-none ml-auto">
            <MoreHorizontal className="h-4 w-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-36">
            <DropdownMenuItem>
              <Link href={`/orders/${order.id}`} className="flex items-center w-full">
                <Eye className="h-4 w-4 mr-2" /> View Details
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => openForm(order)}>
              <Pencil className="h-4 w-4 mr-2" />
              Edit Order
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setDeleteConfirm(order)} className="text-destructive">
              <Trash2 className="h-4 w-4 mr-2" />
              Delete Order
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  // Mobile App Card Mapper
  const cardMapper: CardMapper<Order> = {
    id: (order) => order.id,
    title: (order) => order.order_number,
    subtitle: (order) => `Created ${new Date(order.created_at).toLocaleDateString()}`,
    fallbackIcon: () => <ShoppingCart className="h-6 w-6 text-muted-foreground" />,
    statusBadge: (order) => {
      const statusMeta = ORDER_STATUSES[order.status];
      return (
        <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider', statusMeta?.color)}>
          {statusMeta?.label}
        </span>
      );
    },
    amount: (order) => formatCurrency(order.total, order.currency),
    detailFields: (order) => {
      // @ts-expect-error items is joined from API
      const itemsList = order.items || [];
      return [
        { label: 'Item Count', value: `${itemsList.length} item${itemsList.length !== 1 ? 's' : ''}` },
        { label: 'Subtotal', value: formatCurrency(order.subtotal, order.currency) },
        ...(order.tax_amount ? [{ label: 'Tax', value: formatCurrency(order.tax_amount, order.currency) }] : []),
        ...(order.discount_amount ? [{ label: 'Discount', value: `-${formatCurrency(order.discount_amount, order.currency)}` }] : []),
      ];
    },
    description: (order) => {
      // @ts-expect-error items is joined from API
      const itemsList = (order.items || []).map((i: { name: string; quantity: number }) => `${i.name} (x${i.quantity})`).join(', ');
      return itemsList ? `Items: ${itemsList}${order.notes ? `\nNotes: ${order.notes}` : ''}` : order.notes;
    },
    detailHref: (order) => `/orders/${order.id}`,
    actions: (order) => [
      {
        label: 'Edit',
        icon: Pencil,
        variant: 'outline',
        onClick: () => openForm(order),
      },
      {
        label: 'Delete',
        icon: Trash2,
        variant: 'destructive',
        onClick: () => setDeleteConfirm(order),
      },
    ],
  };

  return (
    <div className="space-y-6">
      {/* Top Overview Metric Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-border/80 bg-card p-3.5 shadow-xs">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium">Total Orders</span>
            <ShoppingCart className="h-4 w-4 text-primary" />
          </div>
          <p className="text-xl font-bold text-foreground mt-1.5">{total}</p>
        </div>

        <div className="rounded-xl border border-border/80 bg-card p-3.5 shadow-xs">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium">Pending</span>
            <Clock className="h-4 w-4 text-amber-500" />
          </div>
          <p className="text-xl font-bold text-foreground mt-1.5">{pendingCount}</p>
        </div>

        <div className="rounded-xl border border-border/80 bg-card p-3.5 shadow-xs">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium">Processing</span>
            <Truck className="h-4 w-4 text-blue-500" />
          </div>
          <p className="text-xl font-bold text-foreground mt-1.5">{processingCount}</p>
        </div>

        <div className="rounded-xl border border-border/80 bg-card p-3.5 shadow-xs">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium">Delivered</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          </div>
          <p className="text-xl font-bold text-foreground mt-1.5">{deliveredCount}</p>
        </div>
      </div>

      {/* Main Responsive Data Listing */}
      <ResponsiveDataListing<Order>
        title="Orders"
        description="Track customer orders, manage line items, and process transactions"
        items={filteredOrders}
        columns={columns}
        cardMapper={cardMapper}
        loading={loading}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder="Search order number or notes..."
        filters={[
          {
            key: 'status',
            label: 'Status',
            value: statusFilter,
            onChange: (val) => setStatusFilter(val as OrderStatus | ''),
            options: Object.entries(ORDER_STATUSES).map(([value, meta]) => ({
              label: meta.label,
              value,
            })),
          },
        ]}
        primaryAction={{
          label: 'New Order',
          icon: Plus,
          onClick: () => openForm(),
        }}
        emptyState={{
          icon: ShoppingCart,
          title: 'No orders found',
          description: searchQuery || statusFilter
            ? 'Try adjusting your search query or status filter'
            : 'Create your first customer order to start tracking transactions',
          actionLabel: 'Create First Order',
          onAction: () => openForm(),
        }}
        hasMore={orders.length < total}
        isLoadingMore={isLoadingMore}
        onLoadMore={() => fetchOrders(true)}
        rowKey={(o) => o.id}
      />

      {/* Create/Edit Form Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="bg-popover border-border text-popover-foreground sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingOrder ? `Edit ${editingOrder.order_number}` : 'New Order'}</DialogTitle>
            <DialogDescription>
              {editingOrder ? 'Update order line items and status' : 'Create a new customer order'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Order Items */}
            <div className="space-y-3">
              <Label className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">Line Items *</Label>
              <div className="space-y-2">
                {formItems.map((item, idx) => (
                  <div key={idx} className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center bg-muted/40 p-2 rounded-lg border border-border/50">
                    <Input
                      placeholder="Item name / description"
                      value={item.name}
                      onChange={(e) => {
                        const next = [...formItems];
                        next[idx] = { ...next[idx], name: e.target.value };
                        setFormItems(next);
                      }}
                      className="border-border bg-background flex-1 text-sm h-9"
                    />
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1 flex-1 sm:flex-initial">
                        <span className="text-[10px] text-muted-foreground uppercase sm:hidden">Qty:</span>
                        <Input
                          type="number"
                          min="1"
                          placeholder="Qty"
                          value={item.quantity}
                          onChange={(e) => {
                            const next = [...formItems];
                            next[idx] = { ...next[idx], quantity: parseInt(e.target.value) || 1 };
                            setFormItems(next);
                          }}
                          className="border-border bg-background w-20 text-sm h-9"
                        />
                      </div>
                      <div className="flex items-center gap-1 flex-1 sm:flex-initial">
                        <span className="text-[10px] text-muted-foreground uppercase sm:hidden">Price:</span>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="Price"
                          value={item.unit_price}
                          onChange={(e) => {
                            const next = [...formItems];
                            next[idx] = { ...next[idx], unit_price: parseFloat(e.target.value) || 0 };
                            setFormItems(next);
                          }}
                          className="border-border bg-background w-24 text-sm h-9"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => setFormItems(formItems.filter((_, i) => i !== idx))}
                        className="text-muted-foreground hover:text-destructive p-2 rounded-md hover:bg-muted active:scale-95 transition-transform"
                        title="Remove Item"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setFormItems([...formItems, { name: '', quantity: 1, unit_price: 0 }])}
                className="border-border text-xs gap-1"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Item Row
              </Button>
            </div>

            {/* Tax & Discount */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-muted-foreground text-xs">Tax Amount</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formTax}
                  onChange={(e) => setFormTax(e.target.value)}
                  placeholder="0.00"
                  className="border-border bg-muted text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-muted-foreground text-xs">Discount Amount</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formDiscount}
                  onChange={(e) => setFormDiscount(e.target.value)}
                  placeholder="0.00"
                  className="border-border bg-muted text-sm"
                />
              </div>
            </div>

            {/* Total summary */}
            <div className="flex justify-between items-center rounded-xl border border-border p-3.5 bg-muted/30">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Estimated Total</span>
              <span className="text-lg font-bold text-foreground font-mono">{formTotal.toFixed(2)}</span>
            </div>

            {/* Status (edit only) */}
            {editingOrder && (
              <div className="space-y-1.5">
                <Label className="text-muted-foreground text-xs">Order Status</Label>
                <select
                  value={formStatus}
                  onChange={(e) => setFormStatus(e.target.value as OrderStatus)}
                  className="w-full border-border bg-muted text-foreground rounded-md px-3 py-2 text-sm"
                >
                  {Object.entries(ORDER_STATUSES).map(([value, meta]) => (
                    <option key={value} value={value}>{meta.label}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Notes */}
            <div className="space-y-1.5">
              <Label className="text-muted-foreground text-xs">Order Notes</Label>
              <Textarea
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
                placeholder="Additional order instructions or customer notes..."
                rows={2}
                className="border-border bg-muted text-sm"
              />
            </div>
          </div>

          <DialogFooter className="bg-popover border-border">
            <Button variant="outline" onClick={() => setFormOpen(false)} className="border-border text-muted-foreground hover:bg-muted">
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={saving || formItems.length === 0}>
              {saving && <Loader2 className="size-4 animate-spin" />}
              {editingOrder ? 'Update Order' : 'Create Order'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent className="bg-popover border-border text-popover-foreground sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Order?</DialogTitle>
            <DialogDescription>
              This will permanently delete order &ldquo;{deleteConfirm?.order_number}&rdquo;.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="bg-popover border-border">
            <Button variant="outline" onClick={() => setDeleteConfirm(null)} className="border-border text-muted-foreground hover:bg-muted">
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting && <Loader2 className="size-4 animate-spin" />}
              Delete Order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
