'use client';

import { useState, useEffect, useCallback } from 'react';
import { Loader2, Bed, Plus, MoreHorizontal, Pencil, Trash2, Users, Wifi, Car, Coffee } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/use-auth';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/business/orders';
import { ResponsiveDataListing, type ColumnDef, type CardMapper } from '@/components/shared/responsive-data-listing';

const PAGE_SIZE = 25;

interface Room {
  id: string;
  name: string;
  slug: string;
  short_description: string | null;
  description: string | null;
  price: number;
  currency: string;
  status: string;
  metadata: Record<string, unknown>;
  category_id: string | null;
  created_at: string;
}

export default function RoomsPage() {
  const { activeAccountId } = useAuth();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);

  const fetchRooms = useCallback(async (isLoadMore = false) => {
    if (!activeAccountId) return;
    if (isLoadMore) setIsLoadingMore(true);
    else setLoading(true);

    try {
      const currentPage = isLoadMore ? page + 1 : 0;
      const params = new URLSearchParams({
        account_id: activeAccountId,
        type: 'room',
        page: String(currentPage),
        limit: String(PAGE_SIZE),
      });

      const res = await fetch(`/api/offerings?${params}`);
      if (res.ok) {
        const data = await res.json();
        const newRooms = data.offerings || [];
        setTotal(data.total || 0);

        if (isLoadMore) {
          setRooms((prev) => [...prev, ...newRooms]);
          setPage(currentPage);
        } else {
          setRooms(newRooms);
          setPage(0);
        }
      }
    } catch (err) {
      console.error('Failed to fetch rooms:', err);
    } finally {
      setLoading(false);
      setIsLoadingMore(false);
    }
  }, [activeAccountId, page]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    fetchRooms(false);
  }, [activeAccountId]);

  const filteredRooms = rooms.filter((r) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      r.name.toLowerCase().includes(q) ||
      (r.short_description && r.short_description.toLowerCase().includes(q))
    );
  });

  const columns: ColumnDef<Room>[] = [
    {
      header: 'Room',
      cell: (room) => (
        <div>
          <p className="text-sm font-semibold text-foreground">{room.name}</p>
          {room.short_description && (
            <p className="text-xs text-muted-foreground max-w-[200px] truncate">{room.short_description}</p>
          )}
        </div>
      ),
    },
    {
      header: 'Price/Night',
      cell: (room) => (
        <span className="text-sm font-semibold text-foreground font-mono">
          {formatCurrency(room.price, room.currency)}
        </span>
      ),
    },
    {
      header: 'Capacity',
      cell: (room) => {
        const meta = (room.metadata || {}) as Record<string, unknown>;
        const capacity = (meta.capacity as Record<string, unknown>) || {};
        const maxGuests = (capacity.max_guests as number) || 2;
        return (
          <span className="text-sm text-muted-foreground flex items-center gap-1">
            <Users className="h-3.5 w-3.5" /> {maxGuests}
          </span>
        );
      },
    },
    {
      header: 'Bed Type',
      cell: (room) => {
        const meta = (room.metadata || {}) as Record<string, unknown>;
        const capacity = (meta.capacity as Record<string, unknown>) || {};
        const bedType = (capacity.bed_type as string) || 'Standard';
        return <span className="text-sm text-muted-foreground capitalize">{bedType}</span>;
      },
    },
    {
      header: 'Amenities',
      cell: (room) => {
        const meta = (room.metadata || {}) as Record<string, unknown>;
        const amenities = (meta.amenities as string[]) || [];
        const display = amenities.slice(0, 3).join(', ');
        return (
          <span className="text-xs text-muted-foreground">
            {display || '—'}{amenities.length > 3 ? ` +${amenities.length - 3}` : ''}
          </span>
        );
      },
    },
    {
      header: 'Status',
      cell: (room) => (
        <span className={cn(
          'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
          room.status === 'active'
            ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
            : 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400'
        )}>
          {room.status}
        </span>
      ),
    },
  ];

  const cardMapper: CardMapper<Room> = {
    id: (room) => room.id,
    title: (room) => room.name,
    subtitle: (room) => room.short_description || 'Hotel room',
    fallbackIcon: () => <Bed className="h-6 w-6 text-muted-foreground" />,
    statusBadge: (room) => (
      <span className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider',
        room.status === 'active'
          ? 'bg-green-100 text-green-800'
          : 'bg-gray-100 text-gray-800'
      )}>
        {room.status}
      </span>
    ),
    amount: (room) => formatCurrency(room.price, room.currency),
    detailFields: (room) => {
      const meta = (room.metadata || {}) as Record<string, unknown>;
      const capacity = (meta.capacity as Record<string, unknown>) || {};
      const amenities = (meta.amenities as string[]) || [];
      return [
        { icon: Users, label: 'Max Guests', value: `${capacity.max_guests || 2}` },
        { icon: Bed, label: 'Bed Type', value: `${(capacity.bed_type as string) || 'Standard'}` },
        { icon: Coffee, label: 'Amenities', value: amenities.slice(0, 3).join(', ') || 'Standard' },
      ];
    },
  };

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-border/80 bg-card p-3.5 shadow-xs">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium">Total Rooms</span>
            <Bed className="h-4 w-4 text-primary" />
          </div>
          <p className="text-xl font-bold text-foreground mt-1.5">{total}</p>
        </div>
        <div className="rounded-xl border border-border/80 bg-card p-3.5 shadow-xs">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium">Active</span>
            <Bed className="h-4 w-4 text-green-500" />
          </div>
          <p className="text-xl font-bold text-foreground mt-1.5">
            {rooms.filter(r => r.status === 'active').length}
          </p>
        </div>
        <div className="rounded-xl border border-border/80 bg-card p-3.5 shadow-xs">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium">Avg Price</span>
            <Bed className="h-4 w-4 text-blue-500" />
          </div>
          <p className="text-xl font-bold text-foreground mt-1.5 font-mono">
            {rooms.length > 0
              ? formatCurrency(rooms.reduce((sum, r) => sum + r.price, 0) / rooms.length, 'KES')
              : '—'}
          </p>
        </div>
        <div className="rounded-xl border border-border/80 bg-card p-3.5 shadow-xs">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium">Draft</span>
            <Bed className="h-4 w-4 text-amber-500" />
          </div>
          <p className="text-xl font-bold text-foreground mt-1.5">
            {rooms.filter(r => r.status === 'draft').length}
          </p>
        </div>
      </div>

      {/* Data Listing */}
      <ResponsiveDataListing<Room>
        title="Rooms"
        description="Manage hotel room types and pricing"
        items={filteredRooms}
        columns={columns}
        cardMapper={cardMapper}
        loading={loading}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder="Search room name or description..."
        emptyState={{
          icon: Bed,
          title: 'No rooms',
          description: 'Add room types to your catalog to get started',
        }}
        hasMore={rooms.length < total}
        isLoadingMore={isLoadingMore}
        onLoadMore={() => fetchRooms(true)}
        rowKey={(r) => r.id}
      />
    </div>
  );
}
