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

export function parsePropertyInquiryButtonId(buttonId: string): { action: string; inquiryId: string } | null {
  // Direct action buttons: property_inquiry_viewing_{id}, property_inquiry_question_{id}, property_inquiry_offer_{id}
  const directMatch = buttonId.match(/^property_inquiry_(viewing|question|offer)_(.+)$/)
  if (directMatch) return { action: directMatch[1], inquiryId: directMatch[2] }
  // Confirm/edit/cancel buttons: property_inquiry_confirm_{id}, etc.
  const confirmMatch = buttonId.match(/^property_inquiry_(confirm|edit|cancel)_(.+)$/)
  if (confirmMatch) return { action: confirmMatch[1], inquiryId: confirmMatch[2] }
  return null
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

// ---- Retailer / Wholesaler Product Orders ----

export const PRODUCT_ORDER_BUTTONS = {
  confirm: (pendingOrderId: string) => `product_order_confirm_${pendingOrderId}`,
  edit: (pendingOrderId: string) => `product_order_edit_${pendingOrderId}`,
  cancel: (pendingOrderId: string) => `product_order_cancel_${pendingOrderId}`,
} as const

export function parseProductOrderButtonId(buttonId: string): { action: string; orderId: string } | null {
  const match = buttonId.match(/^product_order_(confirm|edit|cancel)_(.+)$/)
  if (!match) return null
  return { action: match[1], orderId: match[2] }
}

export function parseProductMoreButtonId(buttonId: string): { offset: number } | null {
  const match = buttonId.match(/^product_more_(\d+)$/)
  if (!match) return null
  return { offset: parseInt(match[1], 10) }
}

export function parseServiceMoreButtonId(buttonId: string): { offset: number } | null {
  const match = buttonId.match(/^service_more_(\d+)$/)
  if (!match) return null
  return { offset: parseInt(match[1], 10) }
}

export function parsePropertyMoreButtonId(buttonId: string): { offset: number } | null {
  const match = buttonId.match(/^property_more_(\d+)$/)
  if (!match) return null
  return { offset: parseInt(match[1], 10) }
}

// ---- Cart Buttons ----

export function parseCartButtonId(buttonId: string): { action: 'checkout' | 'clear' | 'continue' } | null {
  if (buttonId === 'cart_checkout') return { action: 'checkout' }
  if (buttonId === 'cart_clear') return { action: 'clear' }
  if (buttonId === 'cart_continue') return { action: 'continue' }
  return null
}

// ---- Product List Selection (from WhatsApp list message) ----

export function parseProductListSelectionId(id: string): { productId: string; name: string; price: number } | null {
  const match = id.match(/^product_add_(.+)_(\d+)$/)
  if (!match) return null
  const productId = match[1]
  const price = parseInt(match[2], 10)
  // name is not encoded — caller must pass it separately or look it up
  return { productId, name: '', price }
}
