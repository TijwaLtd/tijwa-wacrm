'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { useUnreadNotifications } from '@/hooks/use-unread-notifications';
import {
  BookOpen,
  CreditCard,
  GitBranch,
  LogOut,
  MoreHorizontal,
  Radio,
  Settings as SettingsIcon,
  User,
  Users,
  Workflow,
  Zap,
  Bell,
  MoreVertical,
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ModeToggle } from '@/components/layout/mode-toggle';
import { WorkspaceSwitcher } from '@/components/layout/workspace-switcher';
import { PresenceDot } from '@/components/presence/presence-dot';
import { usePresence } from '@/hooks/use-presence';

const pageTitles: Record<string, string> = {
  '/dashboard': 'dashboard',
  '/inbox': 'inbox',
  '/notifications': 'notifications',
  '/contacts': 'contacts',
  // '/pipelines': 'pipelines', // TODO: enable when pipelines are supported
  '/broadcasts': 'broadcasts',
  '/automations': 'automations',
  '/settings': 'settings',
};

function getPageTitleKey(pathname: string): string {
  if (pageTitles[pathname]) return pageTitles[pathname];
  const match = Object.entries(pageTitles).find(([path]) =>
    pathname.startsWith(path)
  );
  return match ? match[1] : 'dashboard';
}

// Secondary destinations surfaced behind the "more" (…) menu on mobile. The
// bottom tab bar already promotes Home + Inbox, so everything else lives here
// to keep the phone header uncluttered. Desktop ignores this (the sidebar
// carries full navigation) via the `lg:hidden` on the trigger.
const moreNavItems = [
  { href: '/contacts', labelKey: 'contacts', icon: Users },
  { href: '/knowledge', labelKey: 'knowledge', icon: BookOpen },
  // { href: '/pipelines', labelKey: 'pipelines', icon: GitBranch }, // TODO: enable when pipelines are supported
  { href: '/automations', labelKey: 'automations', icon: Zap },
  { href: '/flows', labelKey: 'flows', icon: Workflow },
  { href: '/billing', labelKey: 'billing', icon: CreditCard },
];

interface HeaderProps {
  // No props currently — kept for call-site stability.
}

import { useTranslations } from 'next-intl';

export function Header({}: HeaderProps) {
  const t = useTranslations('Header');
  const tSidebar = useTranslations('Sidebar');
  const pathname = usePathname();
  const { profile, signOut, user } = useAuth();
  const unreadNotifications = useUnreadNotifications();
  const titleKey = getPageTitleKey(pathname);
  const { getPresence, getRow, now } = usePresence();

  const initial =
    profile?.full_name?.charAt(0)?.toUpperCase() ??
    profile?.email?.charAt(0)?.toUpperCase() ??
    'U';

  const myPresence = user?.id ? getPresence(user.id) : 'offline';
  const myRow = user?.id ? getRow(user.id) : undefined;

  return (
    <header className="border-border bg-background flex h-14 shrink-0 items-center justify-between gap-3 border-b px-4 lg:px-6">
      <div className="flex min-w-0 items-center gap-2">
        {/* Brand mark — mobile only; desktop shows the workspace switcher. */}
        <Link href="/dashboard" className="flex items-center gap-2">
          <Image
            src="/logo.png"
            alt="Tijwa"
            width={32}
            height={32}
            className="h-14 w-20 rounded-lg object-cover"
          />
        </Link>

        {/* Workspace switcher - desktop */}
        <div className="hidden lg:block">
          <WorkspaceSwitcher />
        </div>

        <h1 className="text-foreground truncate text-base font-semibold sm:text-lg">
          {t(titleKey as string)}
        </h1>
      </div>

      <div className="flex items-center gap-1 sm:gap-2">
        <ModeToggle />

        {/* Notifications bell */}
        <Link
          href="/notifications"
          className="text-muted-foreground hover:bg-muted hover:text-foreground relative flex h-9 w-9 items-center justify-center rounded-md transition-colors"
          aria-label={t('notifications')}
        >
          <Bell className="h-5 w-5" />
          {unreadNotifications > 0 && (
            <span className="bg-primary text-primary-foreground absolute -top-0.5 -right-0.5 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-semibold">
              {unreadNotifications > 9 ? '9+' : unreadNotifications}
            </span>
          )}
        </Link>

        <DropdownMenu>
          <DropdownMenuTrigger
            className="hover:bg-muted/70 focus:bg-muted/70 data-popup-open:bg-muted/70 flex items-center gap-2 rounded-md px-1 py-1 transition-colors focus:outline-none sm:gap-3 sm:pr-3 sm:pl-1"
            aria-label={t('openAccountMenu')}
          >
            <div className="relative">
              <Avatar className="size-8">
                {profile?.avatar_url ? (
                  <AvatarImage
                    src={profile.avatar_url}
                    alt={profile.full_name ?? t('defaultAvatar')}
                  />
                ) : null}
                <AvatarFallback className="bg-primary/10 text-primary text-sm font-medium">
                  {initial}
                </AvatarFallback>
              </Avatar>
              <span className="absolute -right-0.5 -bottom-0.5">
                <PresenceDot
                  status={myPresence}
                  lastSeenAt={myRow?.last_seen_at}
                  now={now}
                  size="sm"
                />
              </span>
            </div>
            <span className="text-foreground hidden text-sm font-medium sm:inline">
              {profile?.full_name ?? t('defaultUser')}
            </span>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            sideOffset={6}
            className="bg-popover text-popover-foreground ring-border min-w-56"
          >
            <div className="px-2 py-1.5">
              <p className="text-foreground truncate text-sm font-medium">
                {profile?.full_name ?? t('defaultUser')}
              </p>
              <p className="text-muted-foreground truncate text-xs">
                {profile?.email ?? ''}
              </p>
            </div>
            <DropdownMenuSeparator className="bg-border" />
            <DropdownMenuItem
              render={
                <Link
                  href="/settings?tab=profile"
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
                  className="text-popover-foreground focus:bg-accent focus:text-accent-foreground"
                />
              }
            >
              <SettingsIcon className="size-4" />
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
        {/* "More" (…) — mobile only. Holds the secondary destinations that
            aren't promoted to the bottom tab bar. Desktop uses the sidebar. */}
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label={t('more')}
            className="text-muted-foreground hover:bg-muted hover:text-foreground flex h-9 w-9 items-center justify-center rounded-md transition-colors lg:hidden"
          >
            <MoreVertical className="h-5 w-5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            sideOffset={6}
            className="bg-popover text-popover-foreground ring-border border-full min-w-56 gap-2 rounded-lg border p-2 shadow-lg"
          >
            {moreNavItems.map((item) => (
              <DropdownMenuItem
                key={item.href}
                render={
                  <Link
                    href={item.href}
                    className="text-popover-foreground focus:bg-accent focus:text-accent-foreground rounded-2xl py-4"
                  />
                }
              >
                <item.icon className="size-4" />
                {tSidebar(item.labelKey as string)}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
