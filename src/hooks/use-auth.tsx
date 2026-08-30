"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";
import { DEFAULT_CURRENCY } from "@/lib/currency";
import {
  canEditSettings as canEditSettingsFor,
  canManageMembers as canManageMembersFor,
  canSendMessages as canSendMessagesFor,
  isAccountRole,
  type AccountRole,
} from "@/lib/auth/roles";
import type { BusinessType, CapabilityNavigation } from "@/lib/business/capabilities";

// Full capability item stored in auth context
interface CapabilityItem {
  key: string;
  name: string;
  description: string | null;
  category: string;
  is_enabled: boolean;
  navigation: CapabilityNavigation | null;
}

interface Workspace {
  account_id: string;
  account_name: string;
  role: AccountRole;
  joined_at: string;
  plan?: string;
  subscription_status?: string;
  subdomain?: string | null;
  business_type?: BusinessType | null;
}

interface Profile {
  id: string;
  full_name: string | null;
  email: string;
  avatar_url: string | null;
  beta_features: string[];
}

interface AccountSummary {
  id: string;
  name: string;
  default_currency: string;
}

export type AccountStatus = "loading" | "ready" | "unlinked" | "error";

interface AuthContextValue {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  profileLoading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;

  // Multi-workspace
  workspaces: Workspace[];
  activeAccountId: string | null;
  activeWorkspace: Workspace | null;
  switchWorkspace: (accountId: string) => Promise<void>;

  // Account-scoped (derived from active workspace)
  accountStatus: AccountStatus;
  accountStatusDetail: string | null;
  accountId: string | null;
  accountRole: AccountRole | null;
  account: AccountSummary | null;
  defaultCurrency: string;
  isOwner: boolean;
  isAdmin: boolean;
  isAgent: boolean;
  isViewer: boolean;
  canManageMembers: boolean;
  canEditSettings: boolean;
  canSendMessages: boolean;

  // Business type and capabilities
  businessType: BusinessType | null;
  capabilities: CapabilityItem[];
  enabledCapabilities: string[];
  refreshCapabilities: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const PROFILE_FETCH_ATTEMPTS = 2;
const PROFILE_FETCH_RETRY_MS = 1500;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeAccountId, setActiveAccountId] = useState<string | null>(null);
  const [account, setAccount] = useState<AccountSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusDetail, setStatusDetail] = useState<string | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [businessType, setBusinessType] = useState<BusinessType | null>(null);
  const [capabilities, setCapabilities] = useState<CapabilityItem[]>([]);
  const [enabledCapabilities, setEnabledCapabilities] = useState<string[]>([]);

  const lastFetchedUserIdRef = useRef<string | null>(null);

  const switchWorkspace = useCallback(async (accountId: string) => {
    // Set cookie and update state
    document.cookie = `wacrm_active_account=${accountId}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    setActiveAccountId(accountId);
  }, []);

  const fetchCapabilities = useCallback(async (accountId: string | null) => {
    if (!accountId) {
      setBusinessType(null);
      setCapabilities([]);
      setEnabledCapabilities([]);
      return;
    }

    try {
      const res = await fetch(`/api/business/capabilities/account?account_id=${accountId}`);
      if (res.ok) {
        const data = await res.json();
        setBusinessType(data.business_type);
        setCapabilities(data.capabilities);
        setEnabledCapabilities(data.enabled_keys);
      }
    } catch (err) {
      console.error("[AuthProvider] fetchCapabilities error:", err);
    }
  }, []);

  const fetchWorkspaces = useCallback(async (userId: string, currentActiveId: string | null): Promise<{ workspaces: Workspace[]; activeId: string | null }> => {
    const supabase = createClient();

    // Use RPC to bypass RLS infinite recursion issue on account_memberships
    const { data: accounts, error } = await supabase.rpc("get_user_accounts", {
      p_user_id: userId,
    });

    if (error) {
      console.error("[AuthProvider] fetchWorkspaces error:", error);
      return { workspaces: [], activeId: null };
    }

    const workspaces: Workspace[] = (accounts ?? []).map((a: { account_id: string; account_name: string; role: string; joined_at: string; plan?: string; subscription_status?: string; subdomain?: string }) => ({
      account_id: a.account_id,
      account_name: a.account_name ?? "Unknown",
      role: isAccountRole(a.role) ? a.role : "viewer",
      joined_at: a.joined_at,
      plan: a.plan,
      subscription_status: a.subscription_status,
      subdomain: a.subdomain,
    }));

    // Determine active account
    let activeId = currentActiveId;
    if (!activeId || !workspaces.find(w => w.account_id === activeId)) {
      activeId = workspaces[0]?.account_id ?? null;
    }

    return { workspaces, activeId };
  }, []);

  const fetchProfile = useCallback(async (userId: string, activeId: string | null) => {
    const supabase = createClient();
    setProfileLoading(true);
    setStatusDetail(null);
    lastFetchedUserIdRef.current = userId;

    try {
      // Fetch profile
      let profileData: Profile | null = null;
      for (let attempt = 1; ; attempt++) {
        const result = await supabase
          .from("profiles")
          .select("id, full_name, email, avatar_url, beta_features")
          .eq("user_id", userId)
          .maybeSingle();

        if (!result.error) {
          profileData = result.data ? {
            id: result.data.id,
            full_name: result.data.full_name,
            email: result.data.email,
            avatar_url: result.data.avatar_url,
            beta_features: result.data.beta_features ?? [],
          } : null;
          break;
        }

        if (attempt < PROFILE_FETCH_ATTEMPTS) {
          await sleep(PROFILE_FETCH_RETRY_MS);
          continue;
        }
        lastFetchedUserIdRef.current = null;
        setStatusDetail(result.error.message);
        return;
      }

      if (!profileData) {
        lastFetchedUserIdRef.current = null;
        setStatusDetail("no profiles row for the signed-in user");
        setProfile(null);
        return;
      }

      setProfile(profileData);

      // Fetch workspaces and determine active account
      const fetchedActiveId = activeId ?? null;
      const { workspaces: ws, activeId: resolvedActiveId } = await fetchWorkspaces(userId, fetchedActiveId);
      setWorkspaces(ws);

      if (resolvedActiveId) {
        setActiveAccountId(resolvedActiveId);
        document.cookie = `wacrm_active_account=${resolvedActiveId}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;

        // Fetch active account details
        const activeWs = ws.find(w => w.account_id === resolvedActiveId);
        if (activeWs) {
          const { data: accountData } = await supabase
            .from("accounts")
            .select("id, name, default_currency, business_type")
            .eq("id", resolvedActiveId)
            .maybeSingle();

          if (accountData) {
            setAccount({
              id: accountData.id,
              name: accountData.name,
              default_currency: accountData.default_currency ?? DEFAULT_CURRENCY,
            });
            setBusinessType(accountData.business_type);
          }

          // Fetch capabilities
          await fetchCapabilities(resolvedActiveId);
        }
      } else {
        setActiveAccountId(null);
        setAccount(null);
        setBusinessType(null);
        setCapabilities([]);
        setEnabledCapabilities([]);
      }

    } catch (err) {
      console.error("[AuthProvider] fetchProfile threw:", err);
      lastFetchedUserIdRef.current = null;
      setStatusDetail(err instanceof Error ? err.message : "profile fetch failed");
    } finally {
      setProfileLoading(false);
    }
  }, [fetchWorkspaces, fetchCapabilities]);

  useEffect(() => {
    const supabase = createClient();
    let mounted = true;

    const safetyTimer = setTimeout(() => {
      if (mounted) {
        console.warn("[AuthProvider] getSession() timed out after 3s");
        setLoading(false);
        setProfileLoading(false);
      }
    }, 3000);

    const init = async () => {
      try {
        const {
          data: { session },
          error,
        } = await supabase.auth.getSession();

        if (error) console.error("[AuthProvider] getSession error:", error.message);

        if (!mounted) return;
        const currentUser = session?.user ?? null;
        setUser(currentUser);

        if (currentUser) {
          // Get active account from cookie
          const cookieMatch = document.cookie.match(/wacrm_active_account=([^;]+)/);
          const activeId = cookieMatch ? cookieMatch[1] : null;
          fetchProfile(currentUser.id, activeId);
        } else {
          setProfileLoading(false);
        }
      } catch (err) {
        console.error("[AuthProvider] init threw:", err);
      } finally {
        if (mounted) setLoading(false);
        clearTimeout(safetyTimer);
      }
    };

    init();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      const currentUser = session?.user ?? null;
      setUser(currentUser);

      if (currentUser) {
        if (currentUser.id !== lastFetchedUserIdRef.current) {
          const cookieMatch = document.cookie.match(/wacrm_active_account=([^;]+)/);
          const activeId = cookieMatch ? cookieMatch[1] : null;
          fetchProfile(currentUser.id, activeId);
        }
      } else {
        lastFetchedUserIdRef.current = null;
        setProfile(null);
        setWorkspaces([]);
        setActiveAccountId(null);
        setAccount(null);
        setProfileLoading(false);
      }

      setLoading(false);
    });

    return () => {
      mounted = false;
      clearTimeout(safetyTimer);
      subscription.unsubscribe();
    };
  }, [fetchProfile]);

  const signOut = useCallback(async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    // Clear workspace cookie
    document.cookie = 'wacrm_active_account=; path=/; max-age=0; samesite=lax';
    setUser(null);
    setProfile(null);
    setWorkspaces([]);
    setActiveAccountId(null);
    setAccount(null);
    window.location.href = "/login";
  }, []);

  // eslint-disable-next-line react-hooks/preserve-manual-memoization
  const refreshProfile = useCallback(async () => {
    if (!user?.id) return;
    const cookieMatch = document.cookie.match(/wacrm_active_account=([^;]+)/);
    const activeId = cookieMatch ? cookieMatch[1] : null;
    await fetchProfile(user.id, activeId);
  }, [user?.id, fetchProfile]);

  const refreshCapabilities = useCallback(async () => {
    const cookieMatch = document.cookie.match(/wacrm_active_account=([^;]+)/);
    const activeId = cookieMatch ? cookieMatch[1] : null;
    await fetchCapabilities(activeId);
  }, [fetchCapabilities]);

  const activeWorkspace = useMemo(() => {
    return workspaces.find(w => w.account_id === activeAccountId) ?? null;
  }, [workspaces, activeAccountId]);

  const derived = useMemo(() => {
    const role = activeWorkspace?.role ?? null;
    return {
      accountRole: role,
      accountId: activeAccountId,
      isOwner: role === "owner",
      isAdmin: role === "admin",
      isAgent: role === "agent",
      isViewer: role === "viewer",
      canManageMembers: role ? canManageMembersFor(role) : false,
      canEditSettings: role ? canEditSettingsFor(role) : false,
      canSendMessages: role ? canSendMessagesFor(role) : false,
    };
  }, [activeWorkspace?.role, activeAccountId]);

  const accountStatus: AccountStatus = !user
    ? "loading"
    : profileLoading
      ? "loading"
      : !profile
        ? "error"
        : workspaces.length === 0
          ? "unlinked"
          : derived.accountId && derived.accountRole
            ? "ready"
            : "unlinked";

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        loading,
        profileLoading,
        signOut,
        refreshProfile,
        workspaces,
        activeAccountId,
        activeWorkspace,
        switchWorkspace,
        account,
        defaultCurrency: account?.default_currency ?? DEFAULT_CURRENCY,
        accountStatus,
        accountStatusDetail: statusDetail,
        ...derived,
        businessType,
        capabilities,
        enabledCapabilities,
        refreshCapabilities,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    return {
      user: null,
      profile: null,
      loading: false,
      profileLoading: false,
      signOut: async () => { window.location.href = "/login"; },
      refreshProfile: async () => {},
      workspaces: [],
      activeAccountId: null,
      activeWorkspace: null,
      switchWorkspace: async () => {},
      account: null,
      defaultCurrency: DEFAULT_CURRENCY,
      accountStatus: "loading",
      accountStatusDetail: null,
      accountId: null,
      accountRole: null,
      isOwner: false,
      isAdmin: false,
      isAgent: false,
      isViewer: false,
      canManageMembers: false,
      canEditSettings: false,
      canSendMessages: false,
      businessType: null,
      capabilities: [],
      enabledCapabilities: [],
      refreshCapabilities: async () => {},
    };
  }
  return ctx;
}
