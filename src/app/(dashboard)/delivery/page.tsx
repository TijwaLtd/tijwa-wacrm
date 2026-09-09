'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Loader2, Truck, MapPin, Clock, CheckCircle2, Package } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/use-auth';
import { cn } from '@/lib/utils';
import { type Order, type OrderStatus, formatCurrency } from '@/lib/business/orders';
import { ResponsiveDataListing, type ColumnDef, type CardMapper } from '@/components/shared/responsive-data-listing';

const PAGE_SIZE = 25;

const DELIVERY_TABS = [
  { key: 'pending', label: 'Pending', icon: Clock },
  { key: 'confirmed', label: 'Confirmed', icon: Package },
  { key: 'processing', label: 'In Transit', icon: Truck },
  { key: 'delivered', label: 'Delivered', icon: CheckCircle2 },
] as const;

type DeliveryTab = typeof DELIVERY_TABS[number]['key'];

export default function DeliveryPage() {
  const { activeAccountId } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<DeliveryTab>('pending');
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);

  const fetchDeliveries = useCallback(async (isLoadMore = false) => {
    if (!activeAccountId) return;
    if (isLoadMore) setIsLoadingMore(true);
    else setLoading(true);

    try {
      const currentPage = isLoadMore ? page + 1 : 0;
      const params = new URLSearchParams({
        account_id: activeAccountId,
        page: String(currentPage),
        limit: String(PAGE_SIZE),
        status: activeTab,
      });

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
      console.error('Failed to fetch deliveries:', err);
    } finally {
      setLoading(false);
      setIsLoadingMore(false);
    }
  }, [activeAccountId, activeTab, page]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    fetchDeliveries(false);
  }, [fetchDeliveries]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleStatusUpdate = async (orderId: string, newStatus: OrderStatus) => {
    try {
      const res = await fetch(`/api/orders/${orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });

      if (res.ok) {
        toast.success(`Order updated to ${newStatus}`);
        fetchDeliveries(false);
      } else {
        const data = await res.json();
        toast.error(data.error || 'Failed to update order');
      }
    } catch {
      toast.error('Failed to update order');
    }
  };

  const getNextStatus = (status: OrderStatus): OrderStatus | null => {
    const map: Partial<Record<OrderStatus, OrderStatus>> = {
      pending: 'confirmed',
      confirmed: 'processing',
      processing: 'delivered',
    };
    return map[status] ?? null;
  };

  const getActionLabel = (status: OrderStatus): string => {
    const map: Record<string, string> = {
      confirmed: 'Accept',
      processing: 'Start Transit',
      delivered: 'Mark Delivered',
    };
    const next = getNextStatus(status);
    return next ? map[next] || next : '';
  };

  const columns: ColumnDef<Order>[] = [
    {
      header: 'Order #',
      cell: (row) => (
        <Link href={`/orders/${row.id}`} className="font-medium text-foreground hover:underline">
          {row.order_number}
        </Link>
      ),
    },
    {
      header: 'Customer',
      cell: (row) => {
        const meta = row.metadata as Record<string, unknown> | null;
        const customerName = (meta?.customer_name as string) || 'Unknown';
        const pickup = (meta?.pickup_location as string) || '';
        const dropoff = (meta?.dropoff_location as string) || '';
        return (
          <div>
            <p className="text-sm font-medium">{customerName}</p>
            {(pickup || dropoff) && (
              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                <MapPin className="h-3 w-3" />
                {pickup} → {dropoff}
              </p>
            )}
          </div>
        );
      },
    },
    {
      header: 'Amount',
      cell: (row) => (
        <span className="font-medium">{formatCurrency(row.total, row.currency)}</span>
      ),
    },
    {
      header: 'Rider',
      cell: (row) => {
        const meta = row.metadata as Record<string, unknown> | null;
        const riderName = (meta?.assigned_rider_name as string) || 'Unassigned';
        return <span className="text-sm">{riderName}</span>;
      },
    },
    {
      header: 'Time',
      cell: (row) => (
        <span className="text-xs text-muted-foreground">
          {new Date(row.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      ),
    },
    {
      header: 'Status',
      cell: (row) => {
        const statusColors: Record<string, string> = {
          pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
          confirmed: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
          processing: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
          shipped: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400',
          delivered: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
          cancelled: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
        };
        return (
          <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', statusColors[row.status] || '')}>
            {row.status}
          </span>
        );
      },
    },
    {
      header: '',
      cell: (row) => {
        const next = getNextStatus(row.status);
        return next ? (
          <Button
            variant="outline"
            size="sm"
            onClick={(e) => { e.preventDefault(); handleStatusUpdate(row.id, next); }}
            className="h-7 text-xs"
          >
            {getActionLabel(row.status)}
          </Button>
        ) : null;
      },
    },
  ];

  const cardMapper: CardMapper<Order> = {
    id: (row) => row.id,
    title: (row) => row.order_number,
    subtitle: (row) => {
      const meta = row.metadata as Record<string, unknown> | null;
      const name = (meta?.customer_name as string) || 'Unknown';
      const dropoff = (meta?.dropoff_location as string) || '';
      return dropoff ? `${name} → ${dropoff}` : name;
    },
    statusBadge: (row) => {
      const statusColors: Record<string, string> = {
        pending: 'bg-yellow-100 text-yellow-800',
        confirmed: 'bg-blue-100 text-blue-800',
        processing: 'bg-purple-100 text-purple-800',
        delivered: 'bg-green-100 text-green-800',
      };
      return (
        <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', statusColors[row.status] || 'bg-muted')}>
          {row.status}
        </span>
      );
    },
    detailFields: (row) => {
      const meta = row.metadata as Record<string, unknown> | null;
      return [
        { icon: Clock, label: 'Time', value: new Date(row.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) },
        { icon: MapPin, label: 'Dropoff', value: (meta?.dropoff_location as string) || 'No dropoff' },
      ];
    },
    actions: (row) => {
      const next = getNextStatus(row.status);
      return next ? [
        { label: getActionLabel(row.status), onClick: () => handleStatusUpdate(row.id, next) },
      ] : [];
    },
    detailHref: (row) => `/orders/${row.id}`,
  };

  const tabDescription: Record<DeliveryTab, string> = {
    pending: 'New deliveries awaiting confirmation',
    confirmed: 'Confirmed deliveries ready for pickup',
    processing: 'Deliveries currently in transit',
    delivered: 'Completed deliveries',
  };

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 sm:p-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-foreground">Delivery</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Track and manage deliveries in real-time.</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg border border-border bg-muted/50 p-1">
        {DELIVERY_TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => { setActiveTab(tab.key); setPage(0); }}
              className={cn(
                'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                isActive
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Data listing */}
      <ResponsiveDataListing<Order>
        title="Deliveries"
        description={tabDescription[activeTab]}
        items={orders}
        columns={columns}
        cardMapper={cardMapper}
        loading={loading}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder="Search order number or customer..."
        emptyState={{
          icon: Truck,
          title: 'No deliveries',
          description: `No ${activeTab} deliveries found.`,
        }}
        hasMore={orders.length < total}
        isLoadingMore={isLoadingMore}
        onLoadMore={() => fetchDeliveries(true)}
        rowKey={(o) => o.id}
      />
    </div>
  );
}
