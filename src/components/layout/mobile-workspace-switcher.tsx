'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  Building2,
  ChevronRight,
  Loader2,
  Plus,
} from 'lucide-react';
import {
  Avatar,
  AvatarFallback,
} from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useAuth } from '@/hooks/use-auth';

interface WorkspaceWithCounts {
  account_id: string;
  account_name: string;
  role: string;
  unread_notifications?: number;
}

interface MobileWorkspaceSwitcherProps {
  onClose?: () => void;
}

export function MobileWorkspaceSwitcher({ onClose }: MobileWorkspaceSwitcherProps) {
  const t = useTranslations('WorkspaceSwitcher');
  const router = useRouter();
  const { workspaces, activeWorkspace, switchWorkspace } = useAuth();
  const [workspacesWithCounts, setWorkspacesWithCounts] = useState<WorkspaceWithCounts[]>([]);
  const [loading, setLoading] = useState(false);
  const [showDialog, setShowDialog] = useState(false);

  useEffect(() => {
    async function fetchCounts() {
      if (!workspaces.length) return;

      try {
        const res = await fetch('/api/workspaces/with-counts');
        if (res.ok) {
          const data = await res.json();
          setWorkspacesWithCounts(data.workspaces || []);
        }
      } catch (err) {
        console.error('Failed to fetch counts:', err);
      }
    }

    fetchCounts();
  }, [workspaces]);

  const handleSwitch = async (accountId: string) => {
    setLoading(true);
    try {
      await switchWorkspace(accountId);
      setShowDialog(false);
      onClose?.();
      router.push('/dashboard');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateNew = () => {
    setShowDialog(false);
    onClose?.();
    router.push('/onboarding');
  };

  const totalUnread = workspacesWithCounts.reduce((acc, w) => acc + (w.unread_notifications || 0), 0);
  const currentWorkspace = activeWorkspace;

  return (
    <>
      {/* Workspace button in sidebar - visible only on mobile */}
      <button
        onClick={() => setShowDialog(true)}
        className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-muted lg:hidden"
      >
        <Avatar className="size-8 shrink-0">
          {currentWorkspace ? (
            <AvatarFallback className="bg-primary/10 text-primary">
              <Building2 className="h-4 w-4" />
            </AvatarFallback>
          ) : (
            <AvatarFallback className="bg-muted text-muted-foreground">
              <Building2 className="h-4 w-4" />
            </AvatarFallback>
          )}
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">
            {currentWorkspace?.account_name || 'Select workspace'}
          </p>
          {currentWorkspace && (
            <p className="text-xs capitalize text-muted-foreground">
              {currentWorkspace.role}
            </p>
          )}
        </div>
        {totalUnread > 0 && (
          <Badge variant="secondary" className="h-5 px-1.5 text-xs">
            {totalUnread > 99 ? '99+' : totalUnread}
          </Badge>
        )}
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
      </button>

      {/* Mobile workspace selector dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="bg-popover border-border sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-primary" />
              {t('allWorkspaces')}
            </DialogTitle>
            <DialogDescription className="sr-only">
              Select a workspace to continue
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[60vh] overflow-y-auto py-2">
            {loading && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            )}

            {!loading && (
              <>
                {/* Individual workspaces */}
                <div className="space-y-1 px-1">
                  {workspacesWithCounts.map((ws) => {
                    const isActive = ws.account_id === currentWorkspace?.account_id;
                    const unread = ws.unread_notifications || 0;

                    return (
                      <button
                        key={ws.account_id}
                        onClick={() => handleSwitch(ws.account_id)}
                        disabled={loading}
                        className="flex w-full items-center justify-between rounded-lg px-3 py-3 text-left transition-colors hover:bg-muted disabled:opacity-50"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-foreground">
                            {ws.account_name}
                          </p>
                          <p className="text-xs capitalize text-muted-foreground">
                            {ws.role}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {isActive && (
                            <Badge variant="secondary" className="text-xs">
                              {t('active')}
                            </Badge>
                          )}
                          {unread > 0 && (
                            <Badge variant="secondary" className="h-5 px-1.5 text-xs">
                              {unread}
                            </Badge>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Create new workspace */}
                <div className="border-t border-border px-1 pt-2 mt-2">
                  <button
                    onClick={handleCreateNew}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left transition-colors hover:bg-muted"
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted">
                      <Plus className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <span className="text-sm font-medium text-foreground">
                      {t('createNew')}
                    </span>
                  </button>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
