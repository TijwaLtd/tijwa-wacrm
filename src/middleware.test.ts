import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// --- Scenario knobs the mock reads -----------------------------------------
// `mockUser`         — what getUser() resolves to (a refreshed session ⇒ user,
//                      or null for the logged-out path).
// `refreshedCookies` — cookies Supabase writes via setAll() during getUser(),
//                      i.e. the freshly *rotated* auth token. The whole point
//                      of the test is that these must survive onto whatever
//                      response the middleware returns — including redirects.
// `mockMemberships` — what get_user_accounts returns. The active account's
// plan status drives the owner-only /billing redirect, so tests override it
// per scenario. Default = the normal signed-in state: active-plan owner.
let mockMemberships: Array<{
  account_id: string;
  role: string;
  subscription_status?: string | null;
}> = [{ account_id: "acct-1", role: "owner", subscription_status: "active" }];
let mockUser: { id: string } | null = null;
let refreshedCookies: Array<{
  name: string;
  value: string;
  options: Record<string, unknown>;
}> = [];

vi.mock("@supabase/ssr", () => ({
  createServerClient: (
    _url: string,
    _key: string,
    opts: {
      cookies: {
        getAll: () => Array<{ name: string; value: string }>;
        setAll: (c: typeof refreshedCookies) => void;
      };
    },
  ) => ({
    auth: {
      getUser: async () => {
        if (refreshedCookies.length) opts.cookies.setAll(refreshedCookies);
        return { data: { user: mockUser } };
      },
    },
    rpc: async () => ({
      data: mockMemberships,
      error: null,
    }),
  }),
}));

// Imported after the mock is registered.
const { proxy } = await import("./proxy");

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
  mockUser = null;
  refreshedCookies = [];
  mockMemberships = [{ account_id: "acct-1", role: "owner", subscription_status: "active" }];
});

afterEach(() => vi.clearAllMocks());

const ROTATED = {
  name: "sb-test-auth-token",
  value: "rotated-refresh-token",
  options: { path: "/", httpOnly: true },
};

describe("proxy — refreshed auth cookies survive redirects", () => {
  it("carries the rotated token when redirecting a signed-in user off /login", async () => {
    mockUser = { id: "user-1" };
    refreshedCookies = [ROTATED];

    const res = await proxy(
      new NextRequest("https://app.test/login"),
    );

    // Redirect to /inbox (default home)…
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/inbox");
    // …and the rotated cookie MUST ride along, otherwise the browser keeps
    // replaying the now-consumed refresh token and the session wedges until
    // the user manually clears cookies.
    expect(res.cookies.get(ROTATED.name)?.value).toBe(ROTATED.value);
  });

  it("carries the rotated token when redirecting an unauth user to /login", async () => {
    mockUser = null;
    // Even on the logged-out path getUser() may emit cookie writes (e.g.
    // clearing a dead session); those must not be dropped on the redirect.
    refreshedCookies = [{ ...ROTATED, value: "cleared" }];

    const res = await proxy(
      new NextRequest("https://app.test/dashboard"),
    );

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/login");
    expect(res.cookies.get(ROTATED.name)?.value).toBe("cleared");
  });

  it("redirects a signed-in user with an invite token to /join/<token>", async () => {
    mockUser = { id: "user-1" };
    refreshedCookies = [ROTATED];

    const res = await proxy(
      new NextRequest("https://app.test/login?invite=abc123"),
    );

    expect(res.headers.get("location")).toContain("/join/abc123");
    expect(res.cookies.get(ROTATED.name)?.value).toBe(ROTATED.value);
  });

  it("passes through (no redirect) for a signed-in user on a protected page", async () => {
    mockUser = { id: "user-1" };
    refreshedCookies = [ROTATED];

    const req = new NextRequest("https://app.test/dashboard");
    req.cookies.set("wacrm_active_account", "acct-1");
    const res = await proxy(req);

    // No redirect — the normal NextResponse.next() already carries cookies.
    expect(res.headers.get("location")).toBeNull();
    expect(res.cookies.get(ROTATED.name)?.value).toBe(ROTATED.value);
  });
});

describe("proxy — owner without an active plan is sent to /billing", () => {
  const requestTo = (path: string) => {
    const req = new NextRequest(`https://app.test${path}`);
    req.cookies.set("wacrm_active_account", "acct-1");
    return req;
  };

  it("redirects a suspended owner off a protected page, keeping rotated cookies", async () => {
    mockUser = { id: "user-1" };
    refreshedCookies = [ROTATED];
    mockMemberships = [
      { account_id: "acct-1", role: "owner", subscription_status: "suspended" },
    ];

    const res = await proxy(requestTo("/dashboard"));

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/billing");
    // Same #288 invariant as the other redirects: rotation must ride along.
    expect(res.cookies.get(ROTATED.name)?.value).toBe(ROTATED.value);
  });

  it("treats a missing plan status as no active plan", async () => {
    mockUser = { id: "user-1" };
    mockMemberships = [{ account_id: "acct-1", role: "owner" }];

    const res = await proxy(requestTo("/dashboard"));

    expect(res.headers.get("location")).toContain("/billing");
  });

  it("keeps /settings reachable for a suspended owner (gate public route)", async () => {
    mockUser = { id: "user-1" };
    mockMemberships = [
      { account_id: "acct-1", role: "owner", subscription_status: "suspended" },
    ];

    const res = await proxy(requestTo("/settings"));

    expect(res.headers.get("location")).toBeNull();
  });

  it("does not redirect non-owners (the billing page would bounce them back)", async () => {
    mockUser = { id: "user-1" };
    mockMemberships = [
      { account_id: "acct-1", role: "driver", subscription_status: "suspended" },
    ];

    const res = await proxy(requestTo("/dashboard"));

    expect(res.headers.get("location")).toBeNull();
  });
});
