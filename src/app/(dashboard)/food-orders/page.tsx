'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Loader2, UtensilsCrossed, Clock, CheckCircle2, ChefHat, PackageCheck, XCircle, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/use-auth';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/business/orders';
import { ResponsiveDataListing, type ColumnDef, type CardMapper } from '@/components/shared/responsive-data-listing';

const PAGE_SIZE = 25;

const FOOD_ORDER_STATUSES: Record<string, { label: string; color: string }> = {
  pending: { label: 'Pending', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' },
  confirmed: { label: 'Confirmed', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' },
  preparing: { label: 'Preparing', color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400' },
  ready: { label: 'Ready', color: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400' },
  delivered: { label: 'Delivered', color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' },
  cancelled: { label: 'Cancelled', color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' },
};

type FoodOrderStatus = keyof typeof FOOD_ORDER_STATUSES;

interface FoodOrder {
  id: string;
  order_number: string;
  status: FoodOrderStatus;
  total: number;
  currency: string;
  metadata: Record<string, unknown>;
  created_at: string;
  items?: Array<{ name: string; quantity: number; unit_price: number }>;
}

export default function FoodOrdersPage() {
  const { activeAccountId } = useAuth();
  const [orders, setOrders] = useState<FoodOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<FoodOrderStatus | ''>('');
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);

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

      const res = await fetch(`/api/food-orders?${params}`);
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
      console.error('Failed to fetch food orders:', err);
    } finally {
      setLoading(false);
      setIsLoadingMore(false);
    }
  }, [activeAccountId, page, statusFilter]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    fetchOrders(false);
  }, [activeAccountId, statusFilter]);

  const filteredOrders = orders.filter((ord) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const meta = (ord.metadata || {}) as Record<string, unknown>;
    const customerName = (meta.customer_name as string) || '';
    return (
      ord.order_number.toLowerCase().includes(q) ||
      customerName.toLowerCase().includes(q)
    );
  });

  const columns: ColumnDef<FoodOrder>[] = [
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
      header: 'Customer',
      cell: (order) => {
        const meta = (order.metadata || {}) as Record<string, unknown>;
        const name = (meta.customer_name as string) || 'Walk-in';
        const type = (meta.order_type as string) || 'takeaway';
        const typeIcon = type === 'dine_in' ? '🍽️' : type === 'room_service' ? '🛎️' : '🥡';
        return (
          <div>
            <p className="text-sm font-medium">{name}</p>
            <p className="text-xs text-muted-foreground">{typeIcon} {type.replace('_', ' ')}</p>
          </div>
        );
      },
    },
    {
      header: 'Items',
      cell: (order) => {
        const meta = (order.metadata || {}) as Record<string, unknown>;
        const items = (meta.items as Array<{ name: string; quantity: number }>) || [];
        const count = items.reduce((sum, i) => sum + (i.quantity || 1), 0);
        return <span className="text-sm text-muted-foreground">{count} item{count !== 1 ? 's' : ''}</span>;
      },
    },
    {
      header: 'Total',
      cell: (order) => (
        <span className="text-sm font-semibold text-foreground font-mono">
          {formatCurrency(order.total, order.currency)}
        </span>
      ),
    },
    {
      header: 'Status',
      cell: (order) => {
        const status = FOOD_ORDER_STATUSES[order.status] || FOOD_ORDER_STATUSES.pending;
        return (
          <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', status.color)}>
            {status.label}
          </span>
        );
      },
    },
    {
      header: 'Time',
      cell: (order) => (
        <span className="text-xs text-muted-foreground">
          {new Date(order.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      ),
    },
  ];

  const cardMapper: CardMapper<FoodOrder> = {
    id: (order) => order.id,
    title: (order) => order.order_number,
    subtitle: (order) => {
      const meta = (order.metadata || {}) as Record<string, unknown>;
      const name = (meta.customer_name as string) || 'Walk-in';
      const type = (meta.order_type as string) || 'takeaway';
      return `${name} • ${type.replace('_', ' ')}`;
    },
    fallbackIcon: () => <UtensilsCrossed className="h-6 w-6 text-muted-foreground" />,
    statusBadge: (order) => {
      const status = FOOD_ORDER_STATUSES[order.status] || FOOD_ORDER_STATUSES.pending;
      return (
        <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider', status.color)}>
          {status.label}
        </span>
      );
    },
    amount: (order) => formatCurrency(order.total, order.currency),
    detailFields: (order) => {
      const meta = (order.metadata || {}) as Record<string, unknown>;
      const items = (meta.items as Array<{ name: string; quantity: number }>) || [];
      return [
        { label: 'Items', value: items.map(i => `${i.quantity}x ${i.name}`).join(', ') || 'No items' },
        { label: 'Time', value: new Date(order.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) },
      ];
    },
    detailHref: (order) => `/orders/${order.id}`,
  };

  return (
    <div className="space-y-6">
      {/* Overview Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-border/80 bg-card p-3.5 shadow-xs">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium">Total Orders</span>
            <UtensilsCrossed className="h-4 w-4 text-primary" />
          </div>
          <p className="text-xl font-bold text-foreground mt-1.5">{total}</p>
        </div>
        <div className="rounded-xl border border-border/80 bg-card p-3.5 shadow-xs">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium">Pending</span>
            <Clock className="h-4 w-4 text-amber-500" />
          </div>
          <p className="text-xl font-bold text-foreground mt-1.5">
            {orders.filter(o => o.status === 'pending').length}
          </p>
        </div>
        <div className="rounded-xl border border-border/80 bg-card p-3.5 shadow-xs">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium">Preparing</span>
            <ChefHat className="h-4 w-4 text-purple-500" />
          </div>
          <p className="text-xl font-bold text-foreground mt-1.5">
            {orders.filter(o => o.status === 'preparing').length}
          </p>
        </div>
        <div className="rounded-xl border border-border/80 bg-card p-3.5 shadow-xs">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium">Delivered</span>
            <PackageCheck className="h-4 w-4 text-emerald-500" />
          </div>
          <p className="text-xl font-bold text-foreground mt-1.5">
            {orders.filter(o => o.status === 'delivered').length}
          </p>
        </div>
      </div>

      {/* Data Listing */}
      <ResponsiveDataListing<FoodOrder>
        title="Food Orders"
        description="Track and manage restaurant orders"
        items={filteredOrders}
        columns={columns}
        cardMapper={cardMapper}
        loading={loading}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder="Search order number or customer..."
        filters={[
          {
            key: 'status',
            label: 'Status',
            value: statusFilter,
            onChange: (val) => setStatusFilter(val as FoodOrderStatus | ''),
            options: Object.entries(FOOD_ORDER_STATUSES).map(([value, meta]) => ({
              label: meta.label,
              value,
            })),
          },
        ]}
        emptyState={{
          icon: UtensilsCrossed,
          title: 'No food orders',
          description: statusFilter
            ? 'Try adjusting your status filter'
            : 'Food orders from WhatsApp will appear here',
        }}
        hasMore={orders.length < total}
        isLoadingMore={isLoadingMore}
        onLoadMore={() => fetchOrders(true)}
        rowKey={(o) => o.id}
      />
    </div>
  );
}
