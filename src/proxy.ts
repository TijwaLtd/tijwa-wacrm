import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  console.log('[middleware] getUser result:', { userId: user?.id, hasUser: !!user });

  // getUser() transparently refreshes an expired access token, which
  // ROTATES the refresh token and writes the new cookies onto
  // `supabaseResponse` via setAll() above. Any response we return in
  // place of `supabaseResponse` (every redirect / JSON branch below)
  // is a fresh object that does NOT carry those Set-Cookie headers, so
  // the rotated token never reaches the browser. The next request then
  // replays the old, now-consumed refresh token, the refresh fails, and
  // the session wedges — the user gets a broken reload after idling and
  // can only recover by manually clearing cookies (issue #288). Copy the
  // refreshed cookies onto whatever response we hand back to fix that.
  const withRefreshedCookies = <T extends NextResponse>(response: T): T => {
    supabaseResponse.cookies.getAll().forEach((cookie) => {
      response.cookies.set(cookie)
    })
    return response
  }

  // ── PUBLIC PATHS (no auth, ever) ─────────────────────────────
  // Tenant-facing pages/APIs addressed by capability URL, not by a
  // login session:
  //   /[slug]/c/<contactId>  customer profile & data-rights page
  //   /[slug]/legal/*        Terms / Privacy for that tenant
  //   /api/public/*          profile + data APIs those pages call
  // Returned AFTER getUser() so refresh-cookie rotation still lands
  // on the response, and BEFORE every auth/membership redirect below.
  const pathname = request.nextUrl.pathname
  const isPublicPath =
    pathname.startsWith('/api/public/') ||
    /^\/[^/]+\/(c|legal)(\/|$)/.test(pathname)
  if (isPublicPath) return supabaseResponse

  // Auth pages - redirect to home (chats) if already logged in.
  // Exception: when an invite token is in the query string we
  // send the already-signed-in user to /join/<token> instead so
  // they can accept the invitation in one click. Without this,
  // a forwarded invite link to someone who's already signed in
  // would silently drop them on /inbox.
  if (user && (
    request.nextUrl.pathname === '/login' ||
    request.nextUrl.pathname === '/signup' ||
    request.nextUrl.pathname === '/forgot-password'
  )) {
    const url = request.nextUrl.clone()
    const inviteToken = request.nextUrl.searchParams.get('invite')
    if (
      inviteToken &&
      (request.nextUrl.pathname === '/login' ||
        request.nextUrl.pathname === '/signup')
    ) {
      url.pathname = `/join/${encodeURIComponent(inviteToken)}`
      url.search = ''
    } else {
      url.pathname = '/inbox'
      url.search = ''
    }
    return withRefreshedCookies(NextResponse.redirect(url))
  }

  // Protected pages - redirect to login if not authenticated
  // Note: /login, /signup, /forgot-password are handled above (auth pages)
  const protectedPaths = ['/dashboard', '/inbox', '/contacts', '/pipelines', '/broadcasts', '/automations', '/settings', '/onboarding', '/plans', '/select-workspace']
  if (!user && protectedPaths.some(path => request.nextUrl.pathname.startsWith(path))) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return withRefreshedCookies(NextResponse.redirect(url))
  }

  // Check for workspace membership when accessing protected pages
  // Note: /onboarding is excluded from membership check - users without workspaces need to access it
  const membershipProtectedPaths = protectedPaths.filter(path => path !== '/onboarding');
  if (user && membershipProtectedPaths.some(path => request.nextUrl.pathname.startsWith(path))) {
    // Use get_user_accounts RPC (SECURITY DEFINER) to bypass RLS recursion issue
    const { data: userAccounts, error: rpcError } = await supabase.rpc('get_user_accounts', {
      p_user_id: user.id,
    });

    if (rpcError) {
      console.error('[middleware] get_user_accounts RPC error:', rpcError);
    }

    const memberships = userAccounts && userAccounts.length > 0 ? userAccounts : null;

    if (!memberships || memberships.length === 0) {
      // Only redirect to onboarding if not already there
      if (request.nextUrl.pathname !== '/onboarding') {
        const url = request.nextUrl.clone()
        url.pathname = '/onboarding'
        url.search = ''
        return withRefreshedCookies(NextResponse.redirect(url))
      }
    } else {
      // Has memberships - check for active account cookie
      const activeAccount = request.cookies.get('wacrm_active_account')?.value
      if (!activeAccount) {
        // Only redirect to select-workspace if not already there
        if (request.nextUrl.pathname !== '/select-workspace') {
          const url = request.nextUrl.clone()
          url.pathname = '/select-workspace'
          url.search = ''
          return withRefreshedCookies(NextResponse.redirect(url))
        }
      }

      // Part of the session (see (dashboard)/layout.tsx → SubscriptionGate):
      // this RPC already runs on every protected navigation, so the active
      // account's plan status + role are forwarded as REQUEST headers —
      // NextResponse.next({ request }) encodes them as x-middleware-request-*
      // upstream, where headers() in the dashboard layout reads them. The
      // gate then decides on first client render with zero fetching. They
      // never reach the browser (unlike response headers) and are refreshed
      // on every navigation.
      const active = activeAccount
        ? memberships.find((m: { account_id: string }) => m.account_id === activeAccount)
        : null

      // Second layer under the client SubscriptionGate: owners without an
      // active plan never even receive dashboard HTML — proxy sends them
      // straight to /billing. Same rules as the gate so the two can't
      // disagree and loop: owner-only (non-owners would ping-pong with the
      // billing page's own redirect) and /settings exempt (gate treats
      // /billing, /settings, /ai-test as public; /billing and /ai-test are
      // not in membershipProtectedPaths, so only /settings needs checking
      // here). The gate stays as the client-side backstop for mid-session
      // status changes; the real enforcement is requireActiveSubscription
      // on the APIs.
      if (
        active &&
        String(active.role) === 'owner' &&
        (active.subscription_status ?? 'none') !== 'active' &&
        !request.nextUrl.pathname.startsWith('/settings')
      ) {
        const url = request.nextUrl.clone()
        url.pathname = '/billing'
        url.search = ''
        return withRefreshedCookies(NextResponse.redirect(url))
      }

      if (active) {
        request.headers.set('x-wacrm-account-id', active.account_id)
        request.headers.set(
          'x-wacrm-subscription-status',
          active.subscription_status ?? 'none',
        )
        request.headers.set('x-wacrm-role', String(active.role ?? ''))

        // Rebuild the response so the augmented request snapshot is what
        // passes upstream. Carry Set-Cookie from any token refresh that
        // already landed on the previous response (see issue #288 note).
        const refreshedCookies = supabaseResponse.cookies.getAll()
        supabaseResponse = NextResponse.next({ request })
        refreshedCookies.forEach((cookie) => supabaseResponse.cookies.set(cookie))
      }
    }
  }

  // If user has memberships and tries to access /onboarding directly,
  // redirect to home. Exception: ?create=1 — the workspace switcher's
  // "Create new" action legitimately needs the create-workspace flow
  // even when the user already belongs to other workspaces.
  if (user && request.nextUrl.pathname === '/onboarding' && !request.nextUrl.searchParams.has('create')) {
    // Use get_user_accounts RPC to bypass RLS
    const { data: userAccounts } = await supabase.rpc('get_user_accounts', {
      p_user_id: user.id,
    });

    if (userAccounts && userAccounts.length > 0) {
      const url = request.nextUrl.clone()
      url.pathname = '/inbox'
      url.search = ''
      return withRefreshedCookies(NextResponse.redirect(url))
    }
  }

  // API routes that need auth (not webhooks)
  if (!user && request.nextUrl.pathname.startsWith('/api/whatsapp/') &&
      !request.nextUrl.pathname.includes('/webhook')) {
    return withRefreshedCookies(
      NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    )
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
