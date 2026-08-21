'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  Building2,
  ChevronDown,
  Loader2,
  Plus,
  Check,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/hooks/use-auth';

interface WorkspaceWithCounts {
  account_id: string;
  account_name: string;
  role: string;
  unread_notifications?: number;
}

export function WorkspaceSwitcher() {
  const t = useTranslations('WorkspaceSwitcher');
  const router = useRouter();
  const { workspaces, activeWorkspace, switchWorkspace } = useAuth();
  const [loading, setLoading] = useState(false);
  const [workspacesWithCounts, setWorkspacesWithCounts] = useState<WorkspaceWithCounts[]>([]);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    async function fetchNotificationCounts() {
      if (!workspaces.length) return;

      try {
        const res = await fetch('/api/workspaces/with-counts');
        if (res.ok) {
          const data = await res.json();
          setWorkspacesWithCounts(data.workspaces || []);
        }
      } catch (err) {
        console.error('Failed to fetch notification counts:', err);
      }
    }

    fetchNotificationCounts();
  }, [workspaces]);

  const handleSwitch = async (accountId: string | null) => {
    setLoading(true);
    try {
      if (accountId === null) {
        // "All workspaces" - don't set cookie, let the app use first workspace as fallback
        // This prevents the brief "no active workspace" state when cookie='all'
        setShowAll(true);
      } else {
        setShowAll(false);
        await switchWorkspace(accountId);
      }
      router.refresh();
      router.push('/dashboard');
    } finally {
      setLoading(false);
    }
  };

  const getWorkspaceCounts = (accountId: string) => {
    const ws = workspacesWithCounts.find((w) => w.account_id === accountId);
    return ws?.unread_notifications || 0;
  };

  const totalUnread = workspacesWithCounts.reduce((acc, w) => acc + (w.unread_notifications || 0), 0);

  const currentName = showAll ? t('allWorkspaces') : activeWorkspace?.account_name || 'Select workspace';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted focus:bg-muted focus:outline-none">
        <Building2 className="h-4 w-4" />
        <span className="max-w-[150px] truncate">{currentName}</span>
        {totalUnread > 0 && (
          <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
            {totalUnread > 99 ? '99+' : totalUnread}
          </Badge>
        )}
        <ChevronDown className="h-3 w-3 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={8} className="min-w-[240px] bg-popover">
        {loading && (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        )}

        {!loading && (
          <>
            <DropdownMenuItem
              onClick={() => handleSwitch(null)}
              className="flex items-center justify-between text-popover-foreground focus:bg-accent"
            >
              <div className="flex items-center gap-2">
                <span>{t('allWorkspaces')}</span>
              </div>
              {showAll && <Check className="h-4 w-4 text-primary" />}
              {totalUnread > 0 && (
                <Badge variant="secondary" className="ml-2 h-5 px-1.5 text-xs">
                  {totalUnread}
                </Badge>
              )}
            </DropdownMenuItem>

            <DropdownMenuSeparator className="bg-border" />

            {workspaces.map((ws) => {
              const unread = getWorkspaceCounts(ws.account_id);
              const isActive = ws.account_id === activeWorkspace?.account_id && !showAll;

              return (
                <DropdownMenuItem
                  key={ws.account_id}
                  onClick={() => handleSwitch(ws.account_id)}
                  className="flex items-center justify-between text-popover-foreground focus:bg-accent"
                >
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate">{ws.account_name}</span>
                    <span className="text-xs capitalize text-muted-foreground">{ws.role}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {isActive && <Check className="h-4 w-4 text-primary" />}
                    {unread > 0 && (
                      <Badge variant="secondary" className="h-5 px-1.5 text-xs">
                        {unread}
                      </Badge>
                    )}
                  </div>
                </DropdownMenuItem>
              );
            })}

            <DropdownMenuSeparator className="bg-border" />

            <DropdownMenuItem
              onClick={() => router.push('/onboarding')}
              className="text-popover-foreground focus:bg-accent"
            >
              <Plus className="mr-2 h-4 w-4" />
              {t('createNew')}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
