import { afterEach, describe, expect, it, vi } from "vitest";

interface BuilderCall {
  table: string;
  columns?: string;
  eqArgs: [string, unknown][];
}

interface MembershipRow {
  account_id: string;
  role: string;
}

function makeClient(opts: {
  user: { id: string } | null;
  userErr?: unknown;
  byTable: Record<string, { data: unknown; error: unknown }>;
  memberships?: MembershipRow[];
  membershipErr?: unknown;
}) {
  const calls: BuilderCall[] = [];

  const from = (table: string) => {
    const call: BuilderCall = { table, eqArgs: [] };
    calls.push(call);
    const builder = {
      select(columns: string) {
        call.columns = columns;
        return builder;
      },
      eq(col: string, val: unknown) {
        call.eqArgs.push([col, val]);
        return builder;
      },
      maybeSingle() {
        return Promise.resolve(
          opts.byTable[table] ?? { data: null, error: null },
        );
      },
    };
    return builder;
  };

  const serviceFrom = (table: string) => {
    const result =
      table === "account_memberships"
        ? { data: opts.memberships ?? [], error: opts.membershipErr ?? null }
        : { data: null, error: null };
    const builder = {
      select() {
        return builder;
      },
      eq() {
        return builder;
      },
      order() {
        return Promise.resolve(result);
      },
    };
    return builder;
  };

  return {
    calls,
    client: {
      auth: {
        getUser: () =>
          Promise.resolve({
            data: { user: opts.user },
            error: opts.userErr ?? null,
          }),
      },
      from,
    },
    serviceClient: { from: serviceFrom },
  };
}

const createClient = vi.fn();
const createServiceClientMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => createClient(),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn().mockResolvedValue({
    get: () => undefined,
  }),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: (...args: unknown[]) => createServiceClientMock(...args),
}));

const { getCurrentAccount, UnauthorizedError, ForbiddenError } = await import(
  "./account"
);

afterEach(() => {
  vi.clearAllMocks();
});

describe("getCurrentAccount", () => {
  it("resolves context via membership + accounts lookup", async () => {
    const { client, calls, serviceClient } = makeClient({
      user: { id: "user-1" },
      memberships: [{ account_id: "acct-1", role: "owner" }],
      byTable: {
        accounts: { data: { id: "acct-1", name: "Acme" }, error: null },
      },
    });
    createClient.mockReturnValue(client);
    createServiceClientMock.mockReturnValue(serviceClient);

    const ctx = await getCurrentAccount();

    expect(ctx).toMatchObject({
      userId: "user-1",
      accountId: "acct-1",
      role: "owner",
      account: { id: "acct-1", name: "Acme" },
    });

    expect(calls.map((c) => c.table)).toEqual(["accounts"]);
    expect(calls[0].columns).not.toMatch(/accounts!/);
    expect(calls[0].eqArgs).toEqual([["id", "acct-1"]]);
  });

  it("throws UnauthorizedError when there is no session", async () => {
    const { client } = makeClient({ user: null, byTable: {} });
    createClient.mockReturnValue(client);
    await expect(getCurrentAccount()).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("maps a membership query error to 'Could not load account context'", async () => {
    const { client, serviceClient } = makeClient({
      user: { id: "user-1" },
      membershipErr: { code: "XX000" },
      byTable: {},
    });
    createClient.mockReturnValue(client);
    createServiceClientMock.mockReturnValue(serviceClient);
    await expect(getCurrentAccount()).rejects.toThrow(
      "Could not load account context",
    );
  });

  it("maps an accounts query error to 'Could not load account context'", async () => {
    const { client, serviceClient } = makeClient({
      user: { id: "user-1" },
      memberships: [{ account_id: "acct-1", role: "admin" }],
      byTable: {
        accounts: { data: null, error: { code: "PGRST200" } },
      },
    });
    createClient.mockReturnValue(client);
    createServiceClientMock.mockReturnValue(serviceClient);
    const err = await getCurrentAccount().catch((e) => e);
    expect(err).toBeInstanceOf(ForbiddenError);
    expect(err.message).toBe("Could not load account context");
  });

  it("rejects a user with no workspace memberships", async () => {
    const { client, serviceClient } = makeClient({
      user: { id: "user-1" },
      memberships: [],
      byTable: {},
    });
    createClient.mockReturnValue(client);
    createServiceClientMock.mockReturnValue(serviceClient);
    await expect(getCurrentAccount()).rejects.toThrow(
      "User has no workspace membership",
    );
  });

  it("rejects an account_id that resolves to no readable account", async () => {
    const { client, serviceClient } = makeClient({
      user: { id: "user-1" },
      memberships: [{ account_id: "acct-1", role: "viewer" }],
      byTable: {
        accounts: { data: null, error: null },
      },
    });
    createClient.mockReturnValue(client);
    createServiceClientMock.mockReturnValue(serviceClient);
    await expect(getCurrentAccount()).rejects.toThrow("Account not found");
  });
});
