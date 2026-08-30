// ============================================================
// Orders & Bookings types
// ============================================================

export type OrderStatus = 'pending' | 'confirmed' | 'processing' | 'shipped' | 'delivered' | 'cancelled';

export type BookingStatus = 'pending' | 'confirmed' | 'checked_in' | 'checked_out' | 'cancelled';

export interface Order {
  id: string;
  account_id: string;
  order_number: string;
  contact_id: string | null;
  status: OrderStatus;
  currency: string;
  subtotal: number;
  tax_amount: number;
  discount_amount: number;
  total: number;
  notes: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface OrderItem {
  id: string;
  order_id: string;
  offering_id: string | null;
  name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface OrderWithItems extends Order {
  items: OrderItem[];
}

export interface Booking {
  id: string;
  account_id: string;
  booking_number: string;
  contact_id: string | null;
  offering_id: string | null;
  status: BookingStatus;
  start_date: string | null;
  end_date: string | null;
  guests: number;
  currency: string;
  total: number;
  notes: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export const ORDER_STATUSES: Record<OrderStatus, { label: string; color: string }> = {
  pending: { label: 'Pending', color: 'bg-yellow-500/10 text-yellow-500' },
  confirmed: { label: 'Confirmed', color: 'bg-blue-500/10 text-blue-500' },
  processing: { label: 'Processing', color: 'bg-purple-500/10 text-purple-500' },
  shipped: { label: 'Shipped', color: 'bg-indigo-500/10 text-indigo-500' },
  delivered: { label: 'Delivered', color: 'bg-green-500/10 text-green-500' },
  cancelled: { label: 'Cancelled', color: 'bg-red-500/10 text-red-500' },
};

export const BOOKING_STATUSES: Record<BookingStatus, { label: string; color: string }> = {
  pending: { label: 'Pending', color: 'bg-yellow-500/10 text-yellow-500' },
  confirmed: { label: 'Confirmed', color: 'bg-blue-500/10 text-blue-500' },
  checked_in: { label: 'Checked In', color: 'bg-green-500/10 text-green-500' },
  checked_out: { label: 'Checked Out', color: 'bg-muted text-muted-foreground' },
  cancelled: { label: 'Cancelled', color: 'bg-red-500/10 text-red-500' },
};

export function formatCurrency(amount: number, currency: string): string {
  return `${currency} ${amount.toFixed(2)}`;
}
