import { NextResponse } from 'next/server'
import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account'
import { isSupportStaff } from '@/lib/support/staff'

// Whether the caller is Tijwa support staff (SUPPORT_STAFF_EMAILS
// allowlist). Consumed by the auth context for the sidebar's admin
// link and by /support/admin client pages for gating.

export async function GET() {
  try {
    const ctx = await getCurrentAccount()
    return NextResponse.json({ isStaff: await isSupportStaff(ctx) })
  } catch (err) {
    return toErrorResponse(err)
  }
}
