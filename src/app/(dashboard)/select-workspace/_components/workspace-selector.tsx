'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Building2, Loader2, Plus } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/hooks/use-auth';

interface WorkspaceWithCounts {
  account_id: string;
  account_name: string;
  role: string;
  subdomain: string | null;
  unread_notifications?: number;
}

interface WorkspaceSelectorProps {
  onSelect?: (accountId: string) => void;
}

export function WorkspaceSelector({ onSelect }: WorkspaceSelectorProps) {
  const t = useTranslations('SelectWorkspace');
  const router = useRouter();
  const { workspaces, activeWorkspace, switchWorkspace, loading: authLoading } = useAuth();
  const [workspacesWithCounts, setWorkspacesWithCounts] = useState<WorkspaceWithCounts[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchCounts() {
      try {
        const res = await fetch('/api/workspaces/with-counts');
        if (res.ok) {
          const data = await res.json();
          setWorkspacesWithCounts(data.workspaces || []);
        }
      } catch (err) {
        console.error('Failed to fetch counts:', err);
      } finally {
        setLoading(false);
      }
    }

    if (!authLoading) {
      fetchCounts();
    }
  }, [authLoading]);

  // Auto-select when there's only 1 workspace
  useEffect(() => {
    if (!authLoading && !loading && workspaces.length === 1) {
      const ws = workspaces[0];
      // Set cookie and navigate in same tick
      document.cookie = `wacrm_active_account=${ws.account_id}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
      // Use replace to avoid history stack issues
      window.location.replace('/dashboard');
    }
  }, [authLoading, loading, workspaces]);

  const handleSelect = async (accountId: string) => {
    await switchWorkspace(accountId);
    onSelect?.(accountId);
    window.location.replace('/dashboard');
  };

  const handleCreateNew = () => {
    router.push('/onboarding');
  };

  if (authLoading || loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Empty state: only show if user has no workspaces at all
  // (use workspaces.length, not workspacesWithCounts, since counts API can fail independently)
  if (workspaces.length === 0) {
    return (
      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle>{t('noWorkspaces')}</CardTitle>
          <CardDescription>{t('noWorkspacesDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={handleCreateNew} className="gap-2">
            <Plus className="h-4 w-4" />
            {t('createWorkspace')}
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Use workspacesWithCounts if available, otherwise fall back to workspaces from useAuth
  const displayWorkspaces: (WorkspaceWithCounts | { account_id: string; account_name: string; role: string; subdomain?: string | null; unread_notifications?: number })[] = workspacesWithCounts.length > 0 ? workspacesWithCounts : workspaces;

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {displayWorkspaces.map((ws) => {
        const isActive = ws.account_id === activeWorkspace?.account_id;
        const unreadCount = ws.unread_notifications ?? 0;

        return (
          <Card
            key={ws.account_id}
            className={`cursor-pointer border-border transition-colors hover:border-primary ${
              isActive ? 'border-primary bg-primary/5' : 'bg-card'
            }`}
            onClick={() => handleSelect(ws.account_id)}
          >
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-primary" />
                  <CardTitle className="text-base">{ws.account_name}</CardTitle>
                </div>
                {isActive && (
                  <Badge variant="secondary" className="text-xs">
                    {t('active')}
                  </Badge>
                )}
              </div>
              {'subdomain' in ws && ws.subdomain && (
                <CardDescription className="text-xs">
                  {ws.subdomain}.wacrm.com
                </CardDescription>
              )}
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <span className="text-sm capitalize text-muted-foreground">
                  {ws.role}
                </span>
                {(unreadCount ?? 0) > 0 && (
                  <Badge variant="secondary" className="text-xs">
                    {t('unread', { count: unreadCount ?? 0 })}
                  </Badge>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}

      <Card
        className="cursor-pointer border-dashed border-border bg-transparent transition-colors hover:border-primary hover:bg-muted/50"
        onClick={handleCreateNew}
      >
        <CardContent className="flex flex-col items-center justify-center py-8">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
            <Plus className="h-5 w-5 text-muted-foreground" />
          </div>
          <p className="mt-2 text-sm font-medium text-foreground">
            {t('createNewWorkspace')}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
