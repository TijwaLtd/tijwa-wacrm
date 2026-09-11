// ============================================================
// Shared Payment Message Builder
//
// Used by all business types (logistics, restaurant, hotel)
// after order/booking confirmation to display payment details.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js'

export interface PaymentMethod {
  type: string
  name: string
  till_number?: string
  paybill_number?: string
  account_number?: string
  bank_name?: string
  instructions?: string
}

const PAYMENT_TYPE_LABELS: Record<string, string> = {
  mpesa_till: 'M-Pesa Till',
  mpesa_paybill: 'M-Pesa Paybill',
  bank_transfer: 'Bank Transfer',
  cash: 'Cash',
  card: 'Card',
}

/**
 * Fetches payment methods from tenant_settings and builds
 * a formatted payment message for WhatsApp.
 *
 * @param db - Supabase client
 * @param accountId - The account ID
 * @param currency - Currency code (e.g. 'KES')
 * @param total - Total amount to pay
 * @param referenceNumber - Order or booking number
 * @returns Formatted payment message string
 */
export async function buildPaymentMessage(
  db: SupabaseClient,
  accountId: string,
  currency: string,
  total: number,
  referenceNumber: string,
): Promise<string> {
  const { data: settings } = await db
    .from('tenant_settings')
    .select('payment_methods')
    .eq('account_id', accountId)
    .maybeSingle()

  const paymentMethods = (settings?.payment_methods || []) as PaymentMethod[]

  if (paymentMethods.length === 0) {
    return (
      `💳 *Payment*\n\n` +
      `*Amount:* ${currency} ${total}\n` +
      `*Ref:* ${referenceNumber}\n\n` +
      `Our payment handler will reach out to you shortly with payment instructions.\n` +
      `Please standby.`
    )
  }

  let lines = `*Amount:* ${currency} ${total}\n*Ref:* ${referenceNumber}\n`
  lines += `\n*Payment Methods:*\n`

  for (const method of paymentMethods) {
    const typeLabel = PAYMENT_TYPE_LABELS[method.type] || method.type

    if (method.type === 'mpesa_till' && method.till_number) {
      lines += `• *${method.name}* (${typeLabel})\n  Till: ${method.till_number}\n`
    } else if (method.type === 'mpesa_paybill' && method.paybill_number) {
      lines += `• *${method.name}* (${typeLabel})\n  Paybill: ${method.paybill_number}`
      if (method.account_number) lines += `\n  Account: ${method.account_number}`
      lines += `\n`
    } else if (method.type === 'bank_transfer') {
      lines += `• *${method.name}* (${typeLabel})\n`
      if (method.bank_name) lines += `  Bank: ${method.bank_name}\n`
      if (method.account_number) lines += `  Account: ${method.account_number}\n`
    } else if (method.type === 'cash') {
      lines += `• *${method.name}* (${typeLabel})\n`
    } else {
      lines += `• *${method.name}* (${typeLabel})\n`
    }

    if (method.instructions) {
      lines += `  _${method.instructions}_\n`
    }
  }

  lines += `\nForward your payment confirmation message once paid.`

  return `💳 *Payment Details*\n\n${lines}`
}
