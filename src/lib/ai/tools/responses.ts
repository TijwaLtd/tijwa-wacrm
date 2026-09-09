// ============================================================
// Order Button Utilities
//
// Button IDs follow the pattern: order_<action>_<pending_order_uuid>
// Actions: confirm, edit, cancel
//
// The pending_orders table stores the actual order data.
// Button IDs are short — just action + UUID reference.
// ============================================================

/** Build a button ID for an order action */
export const ORDER_BUTTONS = {
  confirm: (pendingOrderId: string) => `order_confirm_${pendingOrderId}`,
  edit: (pendingOrderId: string) => `order_edit_${pendingOrderId}`,
  cancel: (pendingOrderId: string) => `order_cancel_${pendingOrderId}`,
} as const

/** Parse an order button ID back to action + pending order ID */
export function parseOrderButtonId(buttonId: string): { action: string; orderId: string } | null {
  const match = buttonId.match(/^order_(confirm|edit|cancel)_(.+)$/)
  if (!match) return null
  return { action: match[1], orderId: match[2] }
}
