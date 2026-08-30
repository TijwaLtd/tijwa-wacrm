'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Loader2, Plus, ShoppingCart, Search, MoreHorizontal, Pencil, Trash2, X } from 'lucide-react';
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

const PAGE_SIZE = 25;

export default function OrdersPage() {
  const { activeAccountId } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
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

  const fetchOrders = useCallback(async () => {
    if (!activeAccountId) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        account_id: activeAccountId,
        page: String(page),
        limit: String(PAGE_SIZE),
      });
      if (statusFilter) params.set('status', statusFilter);

      const res = await fetch(`/api/orders?${params}`);
      if (res.ok) {
        const data = await res.json();
        setOrders(data.orders || []);
        setTotal(data.total || 0);
      }
    } catch (err) {
      console.error('Failed to fetch orders:', err);
    } finally {
      setLoading(false);
    }
  }, [activeAccountId, page, statusFilter]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

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
      fetchOrders();
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
      fetchOrders();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete');
    } finally {
      setDeleting(false);
    }
  };

  const formSubtotal = formItems.reduce((sum, i) => sum + (i.quantity * i.unit_price), 0);
  const formTotal = formSubtotal + (parseFloat(formTax) || 0) - (parseFloat(formDiscount) || 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Orders</h1>
          <p className="text-sm text-muted-foreground">Manage customer orders</p>
        </div>
        <Button onClick={() => openForm()} className="gap-2">
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">New Order</span>
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value as OrderStatus | ''); setPage(0); }}
          className="border-border bg-muted text-foreground rounded-md px-3 py-2 text-sm"
        >
          <option value="">All Statuses</option>
          {Object.entries(ORDER_STATUSES).map(([value, meta]) => (
            <option key={value} value={value}>{meta.label}</option>
          ))}
        </select>
      </div>

      {/* Loading */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : orders.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-border py-12">
          <ShoppingCart className="h-12 w-12 text-muted-foreground" />
          <p className="mt-4 text-sm text-muted-foreground">No orders yet</p>
          <Button variant="outline" onClick={() => openForm()} className="mt-4 border-border">
            <Plus className="h-4 w-4 mr-2" />
            Create First Order
          </Button>
        </div>
      ) : (
        <>
          {/* Desktop Table */}
          <div className="hidden overflow-hidden rounded-lg border border-border md:block">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Order #</th>
                  <th className="hidden px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider md:table-cell">Items</th>
                  <th className="hidden px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider lg:table-cell">Total</th>
                  <th className="hidden px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider sm:table-cell">Status</th>
                  <th className="hidden px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider lg:table-cell">Created</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {orders.map((order) => {
                  const statusMeta = ORDER_STATUSES[order.status];
                  // @ts-expect-error items is joined from API
                  const itemCount = order.items?.length || 0;
                  return (
                    <tr key={order.id} className="hover:bg-muted/50">
                      <td className="px-4 py-3">
                        <Link href={`/orders/${order.id}`} className="text-sm font-medium text-foreground hover:text-primary">
                          {order.order_number}
                        </Link>
                      </td>
                      <td className="hidden px-4 py-3 md:table-cell">
                        <span className="text-sm text-muted-foreground">{itemCount} item{itemCount !== 1 ? 's' : ''}</span>
                      </td>
                      <td className="hidden px-4 py-3 lg:table-cell">
                        <span className="text-sm text-foreground">{formatCurrency(order.total, order.currency)}</span>
                      </td>
                      <td className="hidden px-4 py-3 sm:table-cell">
                        <span className={cn('inline-flex items-center rounded-full px-2 py-1 text-xs font-medium', statusMeta?.color)}>
                          {statusMeta?.label}
                        </span>
                      </td>
                      <td className="hidden px-4 py-3 lg:table-cell">
                        <span className="text-sm text-muted-foreground">
                          {new Date(order.created_at).toLocaleDateString()}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted focus:outline-none">
                            <MoreHorizontal className="h-4 w-4" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openForm(order)}>
                              <Pencil className="h-4 w-4 mr-2" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setDeleteConfirm(order)} className="text-destructive">
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete
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
            {orders.map((order) => {
              const statusMeta = ORDER_STATUSES[order.status];
              // @ts-expect-error items is joined from API
              const itemCount = order.items?.length || 0;
              return (
                <div key={order.id} className="p-4">
                  <div className="flex items-center justify-between">
                    <Link href={`/orders/${order.id}`} className="text-sm font-medium text-foreground hover:text-primary">
                      {order.order_number}
                    </Link>
                    <span className={cn('inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium', statusMeta?.color)}>
                      {statusMeta?.label}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                    <span>{itemCount} item{itemCount !== 1 ? 's' : ''}</span>
                    <span className="text-foreground font-medium">{formatCurrency(order.total, order.currency)}</span>
                  </div>
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
                <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} className="border-border">
                  Previous
                </Button>
                <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)} disabled={(page + 1) * PAGE_SIZE >= total} className="border-border">
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Create/Edit Form Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="bg-popover border-border text-popover-foreground sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingOrder ? `Edit ${editingOrder.order_number}` : 'New Order'}</DialogTitle>
            <DialogDescription>
              {editingOrder ? 'Update order details' : 'Create a new customer order'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Order Items */}
            <div className="space-y-2">
              <Label className="text-muted-foreground">Items</Label>
              {formItems.map((item, idx) => (
                <div key={idx} className="flex gap-2 items-start">
                  <Input
                    placeholder="Item name"
                    value={item.name}
                    onChange={(e) => {
                      const next = [...formItems];
                      next[idx] = { ...next[idx], name: e.target.value };
                      setFormItems(next);
                    }}
                    className="border-border bg-muted flex-1"
                  />
                  <Input
                    type="number"
                    min="1"
                    value={item.quantity}
                    onChange={(e) => {
                      const next = [...formItems];
                      next[idx] = { ...next[idx], quantity: parseInt(e.target.value) || 1 };
                      setFormItems(next);
                    }}
                    className="border-border bg-muted w-16"
                  />
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={item.unit_price}
                    onChange={(e) => {
                      const next = [...formItems];
                      next[idx] = { ...next[idx], unit_price: parseFloat(e.target.value) || 0 };
                      setFormItems(next);
                    }}
                    className="border-border bg-muted w-24"
                  />
                  <button
                    type="button"
                    onClick={() => setFormItems(formItems.filter((_, i) => i !== idx))}
                    className="text-muted-foreground hover:text-destructive mt-2"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setFormItems([...formItems, { name: '', quantity: 1, unit_price: 0 }])}
                className="border-border"
              >
                <Plus className="h-3 w-3 mr-1" />
                Add Item
              </Button>
            </div>

            {/* Tax & Discount */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-muted-foreground">Tax</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formTax}
                  onChange={(e) => setFormTax(e.target.value)}
                  placeholder="0.00"
                  className="border-border bg-muted"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-muted-foreground">Discount</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formDiscount}
                  onChange={(e) => setFormDiscount(e.target.value)}
                  placeholder="0.00"
                  className="border-border bg-muted"
                />
              </div>
            </div>

            {/* Total */}
            <div className="flex justify-between rounded-lg border border-border p-3">
              <span className="text-sm text-muted-foreground">Total</span>
              <span className="text-sm font-medium text-foreground">{formTotal.toFixed(2)}</span>
            </div>

            {/* Status (edit only) */}
            {editingOrder && (
              <div className="space-y-2">
                <Label className="text-muted-foreground">Status</Label>
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
            <div className="space-y-2">
              <Label className="text-muted-foreground">Notes</Label>
              <Textarea
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
                placeholder="Order notes..."
                rows={2}
                className="border-border bg-muted"
              />
            </div>
          </div>

          <DialogFooter className="bg-popover border-border">
            <Button variant="outline" onClick={() => setFormOpen(false)} className="border-border text-muted-foreground hover:bg-muted">
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={saving || formItems.length === 0}>
              {saving && <Loader2 className="size-4 animate-spin" />}
              {editingOrder ? 'Update' : 'Create'}
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
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
