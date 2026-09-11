'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { Loader2, ArrowLeft, Package, CheckCircle, Clock, Truck, CheckCircle2, XCircle, MapPin, User, CreditCard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/use-auth';
import { hasMinRole, type AccountRole } from '@/lib/auth/roles';
import { cn } from '@/lib/utils';
import { type Order, type OrderItem, type OrderStatus, ORDER_STATUSES, formatCurrency } from '@/lib/business/orders';

interface RiderOption {
  profile_id: string;
  full_name: string;
  user_id: string;
}

export default function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { activeAccountId, accountRole } = useAuth();
  const [order, setOrder] = useState<Order | null>(null);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [riders, setRiders] = useState<RiderOption[]>([]);
  const [assigningRider, setAssigningRider] = useState(false);

  const canAssignRider = accountRole && hasMinRole(accountRole as AccountRole, 'manager');

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

  const fetchRiders = () => {
    if (!activeAccountId || !canAssignRider) return;
    fetch(`/api/account/members`)
      .then(res => res.json())
      .then(data => {
        const members = data.members || [];
        const riderList = members
          .filter((m: any) => ['rider', 'driver'].includes(m.role))
          .map((m: any) => ({
            profile_id: m.profile_id || m.user_id,
            full_name: m.full_name || 'Unknown',
            user_id: m.user_id,
          }));
        setRiders(riderList);
      })
      .catch(() => {});
  };

  useEffect(() => {
    fetchOrder();
  }, [id]);

  useEffect(() => {
    fetchRiders();
  }, [activeAccountId, canAssignRider]);

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

  const handleAssignRider = async (profileId: string | null) => {
    if (!order || !activeAccountId) return;
    setAssigningRider(true);
    try {
      const res = await fetch(`/api/orders/${order.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          account_id: activeAccountId,
          assigned_team_member_id: profileId,
        }),
      });

      if (!res.ok) throw new Error('Failed to assign rider');

      toast.success(profileId ? 'Rider assigned' : 'Rider removed');
      fetchOrder();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to assign rider');
    } finally {
      setAssigningRider(false);
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
  const meta = (order.metadata || {}) as Record<string, unknown>;
  const customerName = (meta.customer_name as string) || null;
  const pickupLocation = (meta.pickup_location as string) || null;
  const dropoffLocation = (meta.dropoff_location as string) || null;
  const zoneType = (meta.zone_type as string) || null;
  const itemDescription = (meta.item_description as string) || null;
  const weight = (meta.weight as number) || null;
  const paymentMode = (meta.payment_mode as string) || null;
  const paymentStatus = (meta.payment_status as string) || 'pending';
  const paymentAmount = (meta.payment_amount as number) || order.total;
  const rider = (order as any).rider;

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

      {/* Delivery Details - only shown when logistics metadata exists */}
      {(pickupLocation || dropoffLocation || zoneType || customerName) && (
        <div className="rounded-xl border border-border/80 bg-card overflow-hidden shadow-xs">
          <div className="border-b border-border/80 px-4 py-3 bg-muted/30">
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Truck className="h-4 w-4 text-primary" />
              Delivery Details
            </h2>
          </div>
          <div className="p-4 space-y-3">
            {/* Customer */}
            {customerName && (
              <div className="flex items-start gap-3">
                <User className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium">Customer</p>
                  <p className="text-sm font-medium text-foreground">{customerName}</p>
                </div>
              </div>
            )}

            {/* Pickup */}
            {pickupLocation && (
              <div className="flex items-start gap-3">
                <MapPin className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
                <div>
                  <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium">Pickup</p>
                  <p className="text-sm text-foreground">{pickupLocation}</p>
                </div>
              </div>
            )}

            {/* Dropoff */}
            {dropoffLocation && (
              <div className="flex items-start gap-3">
                <MapPin className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                <div>
                  <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium">Dropoff</p>
                  <p className="text-sm text-foreground">{dropoffLocation}</p>
                </div>
              </div>
            )}

            {/* Zone + Item details row */}
            <div className="flex flex-wrap gap-3 pt-1">
              {zoneType && (
                <div className="rounded-lg border border-border/60 bg-muted/30 px-2.5 py-1.5">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Zone</p>
                  <p className="text-xs font-medium text-foreground capitalize">{zoneType}</p>
                </div>
              )}
              {itemDescription && (
                <div className="rounded-lg border border-border/60 bg-muted/30 px-2.5 py-1.5">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Item</p>
                  <p className="text-xs font-medium text-foreground">{itemDescription}</p>
                </div>
              )}
              {weight && (
                <div className="rounded-lg border border-border/60 bg-muted/30 px-2.5 py-1.5">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Weight</p>
                  <p className="text-xs font-medium text-foreground">{weight} kg</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Rider Assignment + Payment Side by Side */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Rider Assignment */}
        <div className="rounded-xl border border-border/80 bg-card p-4 shadow-xs">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <Truck className="h-3.5 w-3.5" /> Assigned Rider
          </h3>
          {canAssignRider ? (
            <select
              value={(order as any).rider?.id || ''}
              onChange={(e) => handleAssignRider(e.target.value || null)}
              disabled={assigningRider}
              className="w-full border-border bg-muted text-foreground rounded-lg px-3 py-2 text-sm disabled:opacity-50"
            >
              <option value="">Unassigned</option>
              {riders.map((r) => (
                <option key={r.profile_id} value={r.profile_id}>
                  {r.full_name}
                </option>
              ))}
            </select>
          ) : (
            <p className="text-sm text-foreground">
              {rider?.full_name || <span className="text-muted-foreground italic">Unassigned</span>}
            </p>
          )}
        </div>

        {/* Payment Status */}
        <div className="rounded-xl border border-border/80 bg-card p-4 shadow-xs">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <CreditCard className="h-3.5 w-3.5" /> Payment
          </h3>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Method</span>
              <span className="text-xs font-medium text-foreground capitalize">{paymentMode || 'Not set'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Amount</span>
              <span className="text-xs font-semibold text-foreground font-mono">{formatCurrency(paymentAmount, order.currency)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Status</span>
              <span className={cn(
                'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider',
                paymentStatus === 'confirmed'
                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                  : paymentStatus === 'pending'
                    ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                    : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
              )}>
                {paymentStatus}
              </span>
            </div>
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
