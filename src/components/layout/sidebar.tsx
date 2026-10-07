'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';
import { useTotalUnread } from '@/hooks/use-total-unread';
import { hasMinRole, type AccountRole } from '@/lib/auth/roles';
import {
  BookOpen,
  CreditCard,
  Crown,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  Settings,
  Shield,
  User,
  UserCog,
  Users,
  UsersRound,
  X,
  Package,
  Warehouse,
  ShoppingCart,
  UtensilsCrossed,
  Bed,
  Calendar,
  CalendarCheck,
  ConciergeBell,
  Wrench,
  Clock,
  GraduationCap,
  Heart,
  HandHelping,
  Library,
  HandCoins,
  Home,
  CalendarDays,
  ChevronsUpDown,
  HelpCircle,
  Eye,
} from 'lucide-react';

// Per-role chip metadata used in the sidebar's account strip + the
// Members tab roster. Keeping this near both consumers in a single
// place avoids drift between the two surfaces — when a designer
// wants to recolour "agent" rows, this is the one diff.
const ROLE_CHIP: Record<
  AccountRole,
  { icon: typeof Crown; labelKey: string; className: string }
> = {
  owner: {
    icon: Crown,
    labelKey: 'roleOwner',
    className: 'border-amber-500/40 bg-amber-500/10 text-amber-300',
  },
  admin: {
    icon: Shield,
    labelKey: 'roleAdmin',
    className: 'border-primary/40 bg-primary/10 text-primary',
  },
  manager: {
    icon: Shield,
    labelKey: 'roleManager',
    className: 'border-blue-500/40 bg-blue-500/10 text-blue-300',
  },
  agent: {
    icon: UserCog,
    labelKey: 'roleAgent',
    className: 'border-border bg-muted text-foreground',
  },
  driver: {
    icon: UserCog,
    labelKey: 'roleDriver',
    className: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
  },
  rider: {
    icon: UserCog,
    labelKey: 'roleRider',
    className: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
  },
  receptionist: {
    icon: UserCog,
    labelKey: 'roleReceptionist',
    className: 'border-purple-500/40 bg-purple-500/10 text-purple-300',
  },
  doctor: {
    icon: UserCog,
    labelKey: 'roleDoctor',
    className: 'border-cyan-500/40 bg-cyan-500/10 text-cyan-300',
  },
  instructor: {
    icon: UserCog,
    labelKey: 'roleInstructor',
    className: 'border-indigo-500/40 bg-indigo-500/10 text-indigo-300',
  },
  waiter: {
    icon: UserCog,
    labelKey: 'roleWaiter',
    className: 'border-orange-500/40 bg-orange-500/10 text-orange-300',
  },
  cleaner: {
    icon: UserCog,
    labelKey: 'roleCleaner',
    className: 'border-slate-500/40 bg-slate-500/10 text-slate-300',
  },
  viewer: {
    icon: User,
    labelKey: 'roleViewer',
    className: 'border-border bg-card text-muted-foreground',
  },
};
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MobileWorkspaceSwitcher } from '@/components/layout/mobile-workspace-switcher';

interface NavItem {
  href: string;
  labelKey: string;
  icon: typeof LayoutDashboard;
  beta?: boolean;
  minRole?: AccountRole;
}

const navItems: NavItem[] = [
  { href: '/inbox', labelKey: 'inbox', icon: MessageSquare },
  { href: '/contacts', labelKey: 'contacts', icon: Users },
  { href: '/team', labelKey: 'team', icon: UsersRound, minRole: 'admin' },
  { href: '/knowledge', labelKey: 'knowledge', icon: BookOpen },
  // { href: '/pipelines', labelKey: 'pipelines', icon: GitBranch }, // TODO: enable when pipelines are supported
  // Broadcasts + Automations are reachable from the Chats list header's
  // "more" dropdown (admin-only) — kept out of the sidebar.
];

// Dashboard lives with the secondary items — Chats is the default home.
const bottomNavItems = [
  { href: '/dashboard', labelKey: 'dashboard', icon: LayoutDashboard },
  { href: '/billing', labelKey: 'billing', icon: CreditCard, minRole: 'owner' as AccountRole },
  { href: '/settings', labelKey: 'settings', icon: Settings },
];

// Icon mapping for capability navigation
const CAPABILITY_ICONS: Record<string, typeof LayoutDashboard> = {
  Package,
  Warehouse,
  ShoppingCart,
  UtensilsCrossed,
  Bed,
  Calendar,
  CalendarCheck,
  ConciergeBell,
  Wrench,
  Clock,
  GraduationCap,
  Heart,
  HandHelping,
  Library,
  HandCoins,
  Home,
  CalendarDays,
  HelpCircle,
  Eye,
};

interface SidebarProps {
  /** Controlled on mobile by the Header's hamburger button. Ignored on lg+. */
  open?: boolean;
  onClose?: () => void;
}

import { useTranslations } from 'next-intl';

export function Sidebar({ open = false, onClose }: SidebarProps) {
  const t = useTranslations('Sidebar');
  const pathname = usePathname();
  const { profile, profileLoading, account, accountRole, capabilities, signOut } = useAuth();
  const totalUnread = useTotalUnread();

  // Derive navigation items from persisted capabilities in auth context
  const capabilityNavItems = capabilities
    .filter((cap) => cap.is_enabled && cap.navigation)
    .map((cap) => ({ ...cap.navigation!, _key: cap.key }));
  // Catalog/operations capability entries render in one flat list, so
  // pre-order them catalog-first to keep the previous reading order.
  const flatCapabilityItems = [
    ...capabilityNavItems.filter((i) => i.section === 'catalog'),
    ...capabilityNavItems.filter((i) => i.section === 'operations'),
  ];
  // Only surface the account-name strip when it actually carries
  // information. A solo user's personal account is named after them
  // (the 017 signup trigger seeds it from `full_name`), so showing it
  // here would just duplicate the user name in the footer below. Once
  // the account is renamed or the user joins a shared account, the
  // name diverges and the strip becomes meaningful — that's the signal
  // we gate on. Wait for the profile fetch to settle first, otherwise
  // the strip flashes in once the row resolves (a layout jump).
  const showAccountStrip =
    !profileLoading && !!account?.name && account.name !== profile?.full_name;

  // Close the drawer when route changes — users opened it to navigate,
  // so once they pick a destination the drawer should get out of the way.
  useEffect(() => {
    onClose?.();
    // Only pathname drives this — onClose identity doesn't need to re-run it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Lock body scroll and allow Escape to close while the drawer is open on
  // mobile. No-ops on desktop because the sidebar isn't positioned there.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  return (
    <>
      {/* Backdrop — only exists on mobile and only when open. Clicking
          it closes the drawer. Hidden from lg+ since the sidebar is
          part of the main flex row there. */}
      <button
        type="button"
        aria-label={t('closeMenu')}
        onClick={onClose}
        className={cn(
          'bg-background/70 fixed inset-0 z-30 backdrop-blur-sm transition-opacity lg:hidden',
          open
            ? 'pointer-events-auto opacity-100'
            : 'pointer-events-none opacity-0'
        )}
      />

      <aside
        className={cn(
          // Mobile: fixed drawer that slides in from the left.
          'border-border/70 bg-card fixed inset-y-0 left-0 z-40 flex h-full w-64 flex-col overflow-hidden border-r',
          'transition-transform duration-200 ease-out will-change-transform',
          open ? 'translate-x-0' : '-translate-x-full',
          // Desktop: static floating island next to the content panel —
          // reset the mobile drawer framing, add the radius/border.
          'lg:static lg:z-0 lg:w-60 lg:translate-x-0 lg:transition-none lg:rounded-2xl lg:border lg:shadow-sm'
        )}
        aria-label="Primary"
      >
        {/* Logo row. On mobile we put a close button here; on desktop the
            close button is hidden since the sidebar is always-visible. */}
        <div className="border-border flex h-14 shrink-0 items-center justify-between gap-2 border-b px-4">
          <Link href="/inbox" className="flex items-center gap-2">
            <Image
              src="/logo.png"
              alt="Tijwa CRM"
              width={515}
              height={143}
              className="h-6 w-auto select-none"
              priority
            />
          </Link>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('closeMenu')}
            className="text-muted-foreground hover:bg-muted hover:text-foreground flex h-9 w-9 items-center justify-center rounded-md lg:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Workspace switcher - mobile only */}
        <div className="border-border/70 border-b px-3 py-2.5 lg:hidden">
          <MobileWorkspaceSwitcher onClose={onClose} />
        </div>

        {/* Main navigation — one flat list: no section headers, no
            dividers between groups. Role-filtered, capability entries
            inlined in reading order. */}
        <nav className="flex-1 overflow-y-auto px-3 py-3 [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border/70">
          <ul className="flex flex-col gap-1">
            {[
              ...navItems.map((item) => ({
                key: item.href,
                href: item.href,
                icon: item.icon,
                label: t(item.labelKey as string),
                beta: item.beta,
                minRole: item.minRole,
              })),
              ...flatCapabilityItems.map((item) => ({
                key: `_cap_${item._key}`,
                href: item.route,
                icon: CAPABILITY_ICONS[item.icon] || Package,
                label: item.label,
                beta: undefined,
                minRole: undefined,
              })),
              ...bottomNavItems.map((item) => ({
                key: item.href,
                href: item.href,
                icon: item.icon,
                label: t(item.labelKey as string),
                beta: undefined,
                minRole: item.minRole,
              })),
            ]
              .filter((item) => !item.minRole || (accountRole && hasMinRole(accountRole, item.minRole)))
              .map((item) => {
                const isActive =
                  pathname === item.href ||
                  (item.href !== '/dashboard' && pathname.startsWith(item.href));
                const showUnread =
                  item.href === '/inbox' && totalUnread > 0 && !isActive;
                const Icon = item.icon;

                return (
                  <li key={item.key}>
                    <Link
                      href={item.href}
                      aria-current={isActive ? 'page' : undefined}
                      className={cn(
                        'group flex items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-[13px] font-medium transition-all duration-150 lg:py-1.5',
                        isActive
                          ? 'bg-primary/10 text-primary'
                          : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                      )}
                    >
                      <span
                        className={cn(
                          'flex size-7 shrink-0 items-center justify-center rounded-lg transition-all duration-150',
                          isActive
                            ? 'bg-gradient-to-br from-primary to-primary/70 text-primary-foreground shadow-sm shadow-primary/30'
                            : 'group-hover:scale-105'
                        )}
                      >
                        <Icon className="size-4" />
                      </span>
                      <span
                        className={cn(
                          'flex-1 truncate',
                          isActive && 'font-semibold'
                        )}
                      >
                        {item.label}
                      </span>
                      {showUnread && (
                        <span
                          aria-label={t('unreadConversations', {
                            count: totalUnread,
                          })}
                          className="bg-primary text-primary-foreground min-w-5 rounded-full px-1.5 py-0.5 text-center text-[10px] leading-none font-semibold tabular-nums"
                        >
                          {totalUnread > 99 ? '99+' : totalUnread}
                        </span>
                      )}
                      {item.beta && (
                        <span
                          aria-label={t('beta')}
                          className="rounded-full border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-semibold tracking-wider text-amber-300 uppercase"
                        >
                          {t('beta')}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
          </ul>
        </nav>

        {/* User section */}
        <div className="border-border/70 shrink-0 border-t p-3">
          {/* Account name display — surfaced only when the account
              name differs from the user's own name (see
              `showAccountStrip`). For a default solo account the two
              match, so we hide it to avoid duplicating the user name
              below; for renamed or shared accounts it tells the user
              which account they're acting in. */}
          {showAccountStrip && account?.name ? (
            <div className="text-muted-foreground mb-2 flex items-center gap-2 px-3 text-xs">
              <UsersRound className="size-3.5 shrink-0" />
              {/* `title=` exposes the full name on hover when it
                  gets truncated (long account names + narrow
                  sidebars). Cheap a11y win. */}
              <span className="truncate" title={account.name}>
                {account.name}
              </span>
              {accountRole
                ? // Always render the chip — owners used to be
                  // invisible here, which made them indistinguishable
                  // from admins at a glance. Now everyone sees their
                  // role (with a colour cue) regardless of tier.
                  (() => {
                    const meta = ROLE_CHIP[accountRole];
                    const Icon = meta.icon;
                    return (
                      <span
                        className={`ml-auto inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium tracking-wider uppercase ${meta.className}`}
                      >
                        <Icon className="size-3" />
                        {t(meta.labelKey as string)}
                      </span>
                    );
                  })()
                : null}
            </div>
          ) : null}
          <DropdownMenu>
            <DropdownMenuTrigger className="hover:bg-muted/60 focus:bg-muted/60 data-popup-open:bg-muted/60 flex w-full items-center gap-3 rounded-xl border border-border/60 bg-muted/30 px-2.5 py-2 text-left transition-colors focus:outline-none">
              <Avatar className="size-9 shrink-0 ring-2 ring-primary/20">
                {profile?.avatar_url ? (
                  <AvatarImage
                    src={profile.avatar_url}
                    alt={profile.full_name ?? t('defaultAvatar')}
                  />
                ) : null}
                <AvatarFallback className="bg-primary/10 text-primary text-sm font-medium">
                  {profile?.full_name?.charAt(0)?.toUpperCase() ??
                    profile?.email?.charAt(0)?.toUpperCase() ??
                    'U'}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="text-foreground truncate text-[13px] font-medium">
                  {profile?.full_name ?? t('defaultUser')}
                </p>
                <p className="text-muted-foreground truncate text-xs">
                  {profile?.email ?? ''}
                </p>
              </div>
              <ChevronsUpDown className="text-muted-foreground size-4 shrink-0" />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              side="top"
              sideOffset={6}
              className="bg-popover text-popover-foreground ring-border min-w-56"
            >
              <DropdownMenuItem
                render={
                  <Link
                    href="/settings?tab=profile"
                    onClick={onClose}
                    className="text-popover-foreground focus:bg-accent focus:text-accent-foreground"
                  />
                }
              >
                <User className="size-4" />
                {t('menuProfile')}
              </DropdownMenuItem>
              <DropdownMenuItem
                render={
                  <Link
                    href="/settings?tab=whatsapp"
                    onClick={onClose}
                    className="text-popover-foreground focus:bg-accent focus:text-accent-foreground"
                  />
                }
              >
                <Settings className="size-4" />
                {t('menuSettings')}
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-border" />
              <DropdownMenuItem
                onClick={signOut}
                className="text-popover-foreground focus:bg-accent focus:text-accent-foreground"
              >
                <LogOut className="size-4" />
                {t('menuSignOut')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>
    </>
  );
}
