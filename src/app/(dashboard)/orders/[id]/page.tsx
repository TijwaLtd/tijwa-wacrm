'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { Loader2, ArrowLeft, Package, CheckCircle, Clock, Truck, CheckCircle2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/use-auth';
import { cn } from '@/lib/utils';
import { type Order, type OrderItem, type OrderStatus, ORDER_STATUSES, formatCurrency } from '@/lib/business/orders';

export default function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { activeAccountId } = useAuth();
  const [order, setOrder] = useState<Order | null>(null);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  const fetchOrder = () => {
    if (!id) return;
    fetch(`/api/orders/${id}`)
      .then(res => res.json())
      .then(data => {
        if (data.order) {
          setOrder(data.order);
          setItems(data.order.items || []);
        }
      })
      .catch(err => console.error('Failed to fetch order:', err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchOrder();
  }, [id]);

  const handleUpdateStatus = async (newStatus: OrderStatus) => {
    if (!order || !activeAccountId) return;
    setUpdatingStatus(true);
    try {
      const res = await fetch(`/api/orders/${order.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          account_id: activeAccountId,
          status: newStatus,
        }),
      });

      if (!res.ok) throw new Error('Failed to update status');

      toast.success(`Order marked as ${ORDER_STATUSES[newStatus]?.label}`);
      fetchOrder();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update status');
    } finally {
      setUpdatingStatus(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-7 w-7 animate-spin text-primary" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="space-y-4">
        <Link href="/orders" className="text-xs sm:text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
          <ArrowLeft className="h-4 w-4" /> Back to Orders
        </Link>
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-12 text-center bg-card">
          <Package className="h-12 w-12 text-muted-foreground/60" />
          <p className="mt-4 text-sm font-semibold text-foreground">Order not found</p>
        </div>
      </div>
    );
  }

  const statusMeta = ORDER_STATUSES[order.status];

  return (
    <div className="space-y-6">
      <Link href="/orders" className="text-xs sm:text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1 transition-colors">
        <ArrowLeft className="h-4 w-4" /> Back to Orders
      </Link>

      {/* Top Header Card */}
      <div className="rounded-xl border border-border/80 bg-card p-4 sm:p-5 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-bold font-mono text-foreground">{order.order_number}</h1>
              <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider', statusMeta?.color)}>
                {statusMeta?.label}
              </span>
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">
              Placed on {new Date(order.created_at).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>

          {/* Quick Status Buttons */}
          <div className="flex flex-wrap items-center gap-1.5 pt-2 sm:pt-0">
            {order.status === 'pending' && (
              <Button
                size="sm"
                variant="outline"
                disabled={updatingStatus}
                onClick={() => handleUpdateStatus('confirmed')}
                className="h-8 text-xs gap-1 border-emerald-500/30 text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700 dark:hover:bg-emerald-950/40"
              >
                <CheckCircle className="h-3.5 w-3.5" />
                Confirm Order
              </Button>
            )}

            {(order.status === 'confirmed' || order.status === 'pending') && (
              <Button
                size="sm"
                variant="outline"
                disabled={updatingStatus}
                onClick={() => handleUpdateStatus('processing')}
                className="h-8 text-xs gap-1 border-blue-500/30 text-blue-600 hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-blue-950/40"
              >
                <Clock className="h-3.5 w-3.5" />
                Process Order
              </Button>
            )}

            {(order.status === 'processing' || order.status === 'confirmed') && (
              <Button
                size="sm"
                variant="outline"
                disabled={updatingStatus}
                onClick={() => handleUpdateStatus('shipped')}
                className="h-8 text-xs gap-1 border-purple-500/30 text-purple-600 hover:bg-purple-50 hover:text-purple-700 dark:hover:bg-purple-950/40"
              >
                <Truck className="h-3.5 w-3.5" />
                Mark Shipped
              </Button>
            )}

            {order.status === 'shipped' && (
              <Button
                size="sm"
                disabled={updatingStatus}
                onClick={() => handleUpdateStatus('delivered')}
                className="h-8 text-xs gap-1 bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                Mark Delivered
              </Button>
            )}

            {order.status !== 'cancelled' && order.status !== 'delivered' && (
              <Button
                size="sm"
                variant="ghost"
                disabled={updatingStatus}
                onClick={() => handleUpdateStatus('cancelled')}
                className="h-8 text-xs gap-1 text-destructive hover:bg-destructive/10"
              >
                <XCircle className="h-3.5 w-3.5" />
                Cancel
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Summary Metrics */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-border/80 bg-card p-3.5 shadow-xs">
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Subtotal</p>
          <p className="text-base sm:text-lg font-semibold text-foreground font-mono mt-1">{formatCurrency(order.subtotal, order.currency)}</p>
        </div>
        <div className="rounded-xl border border-border/80 bg-card p-3.5 shadow-xs">
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Tax</p>
          <p className="text-base sm:text-lg font-semibold text-foreground font-mono mt-1">{formatCurrency(order.tax_amount, order.currency)}</p>
        </div>
        <div className="rounded-xl border border-border/80 bg-card p-3.5 shadow-xs">
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Discount</p>
          <p className="text-base sm:text-lg font-semibold text-emerald-600 dark:text-emerald-400 font-mono mt-1">-{formatCurrency(order.discount_amount, order.currency)}</p>
        </div>
        <div className="rounded-xl border border-primary/40 bg-primary/5 p-3.5 shadow-xs">
          <p className="text-[11px] font-semibold text-primary uppercase tracking-wider">Total</p>
          <p className="text-lg sm:text-xl font-bold text-foreground font-mono mt-1">{formatCurrency(order.total, order.currency)}</p>
        </div>
      </div>

      {/* Items Section */}
      <div className="rounded-xl border border-border/80 bg-card overflow-hidden shadow-xs">
        <div className="border-b border-border/80 px-4 py-3 bg-muted/30">
          <h2 className="text-sm font-semibold text-foreground">Line Items ({items.length})</h2>
        </div>
        {items.length === 0 ? (
          <div className="px-4 py-8 text-center text-xs text-muted-foreground">No line items in this order</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm border-collapse">
              <thead>
                <tr className="border-b border-border/80 bg-muted/20 font-medium text-xs text-muted-foreground uppercase tracking-wider">
                  <th className="px-4 py-3">Item Description</th>
                  <th className="px-4 py-3 text-right">Quantity</th>
                  <th className="px-4 py-3 text-right">Unit Price</th>
                  <th className="px-4 py-3 text-right">Total Price</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {items.map((item) => (
                  <tr key={item.id} className="hover:bg-muted/20">
                    <td className="px-4 py-3 text-foreground font-medium">{item.name}</td>
                    <td className="px-4 py-3 text-muted-foreground text-right font-mono">{item.quantity}</td>
                    <td className="px-4 py-3 text-muted-foreground text-right font-mono">{formatCurrency(item.unit_price, order.currency)}</td>
                    <td className="px-4 py-3 font-semibold text-foreground text-right font-mono">{formatCurrency(item.total_price, order.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Notes */}
      {order.notes && (
        <div className="rounded-xl border border-border/80 bg-card p-4 shadow-xs">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Order Notes & Instructions</h2>
          <p className="text-xs sm:text-sm text-foreground whitespace-pre-wrap leading-relaxed bg-muted/30 p-3 rounded-lg border border-border/40">
            {order.notes}
          </p>
        </div>
      )}
    </div>
  );
}
