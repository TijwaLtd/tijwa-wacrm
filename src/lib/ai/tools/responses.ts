// ============================================================
// Button Utilities for all business types
//
// Button IDs follow patterns:
//   order_<action>_<uuid>        - logistics delivery orders
//   food_order_<action>_<uuid>   - restaurant food orders
//   reservation_<action>_<uuid>  - restaurant table reservations
//   booking_<action>_<uuid>      - hotel room bookings
//   menu_more_<offset>           - restaurant menu pagination
//   room_more_<offset>           - hotel room pagination
//
// Actions: confirm, edit, cancel
// ============================================================

// ---- Logistics ----

export const ORDER_BUTTONS = {
  confirm: (pendingOrderId: string) => `order_confirm_${pendingOrderId}`,
  edit: (pendingOrderId: string) => `order_edit_${pendingOrderId}`,
  cancel: (pendingOrderId: string) => `order_cancel_${pendingOrderId}`,
} as const

export function parseOrderButtonId(buttonId: string): { action: string; orderId: string } | null {
  const match = buttonId.match(/^order_(confirm|edit|cancel)_(.+)$/)
  if (!match) return null
  return { action: match[1], orderId: match[2] }
}

// ---- Restaurant Food Orders ----

export const FOOD_ORDER_BUTTONS = {
  confirm: (pendingOrderId: string) => `food_order_confirm_${pendingOrderId}`,
  edit: (pendingOrderId: string) => `food_order_edit_${pendingOrderId}`,
  cancel: (pendingOrderId: string) => `food_order_cancel_${pendingOrderId}`,
} as const

export function parseFoodOrderButtonId(buttonId: string): { action: string; orderId: string } | null {
  const match = buttonId.match(/^food_order_(confirm|edit|cancel)_(.+)$/)
  if (!match) return null
  return { action: match[1], orderId: match[2] }
}

// ---- Restaurant Reservations ----

export const RESERVATION_BUTTONS = {
  confirm: (pendingId: string) => `reservation_confirm_${pendingId}`,
  edit: (pendingId: string) => `reservation_edit_${pendingId}`,
  cancel: (pendingId: string) => `reservation_cancel_${pendingId}`,
} as const

export function parseReservationButtonId(buttonId: string): { action: string; reservationId: string } | null {
  const match = buttonId.match(/^reservation_(confirm|edit|cancel)_(.+)$/)
  if (!match) return null
  return { action: match[1], reservationId: match[2] }
}

// ---- Hotel Bookings ----

export const BOOKING_BUTTONS = {
  confirm: (pendingId: string) => `booking_confirm_${pendingId}`,
  edit: (pendingId: string) => `booking_edit_${pendingId}`,
  cancel: (pendingId: string) => `booking_cancel_${pendingId}`,
} as const

export function parseBookingButtonId(buttonId: string): { action: string; bookingId: string } | null {
  const match = buttonId.match(/^booking_(confirm|edit|cancel)_(.+)$/)
  if (!match) return null
  return { action: match[1], bookingId: match[2] }
}

// ---- Pagination (More) Buttons ----

export function parseMenuMoreButtonId(buttonId: string): { offset: number } | null {
  const match = buttonId.match(/^menu_more_(\d+)$/)
  if (!match) return null
  return { offset: parseInt(match[1], 10) }
}

export function parseRoomMoreButtonId(buttonId: string): { offset: number } | null {
  const match = buttonId.match(/^room_more_(\d+)$/)
  if (!match) return null
  return { offset: parseInt(match[1], 10) }
}
