'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { Loader2, ArrowLeft, Package } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/use-auth';
import { cn } from '@/lib/utils';
import { type Order, type OrderItem, ORDER_STATUSES, formatCurrency } from '@/lib/business/orders';

export default function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { activeAccountId } = useAuth();
  const [order, setOrder] = useState<Order | null>(null);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
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
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="space-y-4">
        <Link href="/orders" className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1">
          <ArrowLeft className="h-4 w-4" /> Back to Orders
        </Link>
        <div className="flex flex-col items-center justify-center rounded-lg border border-border py-12">
          <Package className="h-12 w-12 text-muted-foreground" />
          <p className="mt-4 text-sm text-muted-foreground">Order not found</p>
        </div>
      </div>
    );
  }

  const statusMeta = ORDER_STATUSES[order.status];

  return (
    <div className="space-y-6">
      <Link href="/orders" className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1">
        <ArrowLeft className="h-4 w-4" /> Back to Orders
      </Link>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{order.order_number}</h1>
          <p className="text-sm text-muted-foreground">
            Created {new Date(order.created_at).toLocaleDateString()}
          </p>
        </div>
        <span className={cn('inline-flex items-center rounded-full px-3 py-1 text-xs font-medium', statusMeta?.color)}>
          {statusMeta?.label}
        </span>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="rounded-lg border border-border p-4">
          <p className="text-xs text-muted-foreground">Subtotal</p>
          <p className="text-lg font-medium text-foreground mt-1">{formatCurrency(order.subtotal, order.currency)}</p>
        </div>
        <div className="rounded-lg border border-border p-4">
          <p className="text-xs text-muted-foreground">Tax</p>
          <p className="text-lg font-medium text-foreground mt-1">{formatCurrency(order.tax_amount, order.currency)}</p>
        </div>
        <div className="rounded-lg border border-border p-4">
          <p className="text-xs text-muted-foreground">Discount</p>
          <p className="text-lg font-medium text-foreground mt-1">-{formatCurrency(order.discount_amount, order.currency)}</p>
        </div>
        <div className="rounded-lg border border-border p-4">
          <p className="text-xs text-muted-foreground">Total</p>
          <p className="text-lg font-bold text-foreground mt-1">{formatCurrency(order.total, order.currency)}</p>
        </div>
      </div>

      {/* Items */}
      <div className="rounded-lg border border-border">
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-sm font-medium text-foreground">Items ({items.length})</h2>
        </div>
        {items.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">No items</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Name</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">Qty</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">Price</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.map((item) => (
                <tr key={item.id}>
                  <td className="px-4 py-3 text-sm text-foreground">{item.name}</td>
                  <td className="px-4 py-3 text-sm text-muted-foreground text-right">{item.quantity}</td>
                  <td className="px-4 py-3 text-sm text-muted-foreground text-right">{formatCurrency(item.unit_price, order.currency)}</td>
                  <td className="px-4 py-3 text-sm font-medium text-foreground text-right">{formatCurrency(item.total_price, order.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Notes */}
      {order.notes && (
        <div className="rounded-lg border border-border p-4">
          <h2 className="text-sm font-medium text-foreground mb-2">Notes</h2>
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">{order.notes}</p>
        </div>
      )}
    </div>
  );
}
