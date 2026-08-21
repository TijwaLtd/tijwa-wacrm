'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  AlertTriangle,
  Building2,
  Check,
  Crown,
  Loader2,
  Shield,
  Trash2,
  User,
  UserCog,
  UserMinus,
} from 'lucide-react';
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/use-auth';

export function WorkspaceSettings() {
  const t = useTranslations('WorkspaceSettings');
  const router = useRouter();
  const { activeWorkspace, refreshProfile, workspaces, switchWorkspace } = useAuth();

  const [name, setName] = useState(activeWorkspace?.account_name ?? '');
  const [logoUrl, setLogoUrl] = useState('');
  const [accentColor, setAccentColor] = useState('#7c3aed');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);

  // Leave dialog
  const [showLeaveDialog, setShowLeaveDialog] = useState(false);
  const [leaving, setLeaving] = useState(false);

  // Delete dialog
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Fetch workspace details
  useState(() => {
    async function fetchSettings() {
      if (!activeWorkspace?.account_id) return;
      try {
        const res = await fetch(`/api/workspaces/${activeWorkspace.account_id}`);
        if (res.ok) {
          const data = await res.json();
          // Could populate logo, accent color if stored
        }
      } catch (err) {
        console.error('Failed to fetch workspace settings:', err);
      }
    }
    fetchSettings();
  });

  const handleSave = async () => {
    if (!activeWorkspace?.account_id) return;

    setSaving(true);
    try {
      const res = await fetch('/api/workspaces', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          account_id: activeWorkspace.account_id,
          name: name.trim(),
          logo_url: logoUrl.trim() || null,
          accent_color: accentColor || null,
        }),
      });

      if (!res.ok) {
        throw new Error((await res.json()).error || 'Failed to save');
      }

      toast.success(t('saved'));
      await refreshProfile();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('saveError'));
    } finally {
      setSaving(false);
    }
  };

  const handleLeave = async () => {
    if (!activeWorkspace?.account_id) return;

    setLeaving(true);
    try {
      const res = await fetch('/api/workspaces', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account_id: activeWorkspace.account_id }),
      });

      if (!res.ok) {
        throw new Error((await res.json()).error || 'Failed to leave');
      }

      toast.success(t('leftSuccess'));
      setShowLeaveDialog(false);

      // Switch to another workspace or redirect to onboarding
      const otherWorkspace = workspaces.find(w => w.account_id !== activeWorkspace.account_id);
      if (otherWorkspace) {
        await switchWorkspace(otherWorkspace.account_id);
        router.push('/dashboard');
      } else {
        router.push('/onboarding');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to leave workspace');
    } finally {
      setLeaving(false);
    }
  };

  const handleDelete = async () => {
    if (!activeWorkspace?.account_id) return;

    setDeleting(true);
    try {
      const res = await fetch('/api/workspaces', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account_id: activeWorkspace.account_id }),
      });

      if (!res.ok) {
        const data = await res.json();
        if (res.status === 400 && data.error?.includes('other members')) {
          throw new Error(t('cannotDeleteWithMembers'));
        }
        throw new Error(data.error || 'Failed to delete');
      }

      toast.success('Workspace deleted');
      setShowDeleteDialog(false);

      // Switch to another workspace or redirect
      const otherWorkspace = workspaces.find(w => w.account_id !== activeWorkspace.account_id);
      if (otherWorkspace) {
        await switchWorkspace(otherWorkspace.account_id);
        router.push('/dashboard');
      } else {
        router.push('/onboarding');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('deleteError'));
    } finally {
      setDeleting(false);
    }
  };

  if (!activeWorkspace) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const isOwner = activeWorkspace.role === 'owner';
  const memberCount = 1; // Would fetch from API

  return (
    <div className="space-y-6">
      {/* Workspace Info */}
      <Card className="border-border bg-card">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            <CardTitle>{t('title')}</CardTitle>
          </div>
          <CardDescription>{t('description')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Workspace name */}
          <div className="space-y-2">
            <Label htmlFor="workspace-name">{t('workspaceName')}</Label>
            <Input
              id="workspace-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('workspaceNamePlaceholder')}
              disabled={saving}
              className="border-border bg-muted"
            />
          </div>

          {/* Subdomain info */}
          {activeWorkspace.account_id && (
            <div className="space-y-1">
              <Label>{t('subdomain')}</Label>
              <p className="text-sm text-muted-foreground">
                {t('subdomainInfo', {
                  subdomain: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
                })}
              </p>
            </div>
          )}

          {/* Logo URL */}
          <div className="space-y-2">
            <Label htmlFor="logo-url">{t('logoUrl')}</Label>
            <Input
              id="logo-url"
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              placeholder={t('logoUrlPlaceholder')}
              disabled={saving}
              className="border-border bg-muted"
            />
            {logoUrl && (
              <div className="flex items-center gap-2">
                <Avatar className="size-8">
                  <AvatarImage src={logoUrl} />
                  <AvatarFallback className="bg-primary/10">
                    <Building2 className="h-4 w-4 text-primary" />
                  </AvatarFallback>
                </Avatar>
                <span className="text-xs text-muted-foreground">Preview</span>
              </div>
            )}
          </div>

          {/* Accent color */}
          <div className="space-y-2">
            <Label htmlFor="accent-color">{t('accentColor')}</Label>
            <div className="flex items-center gap-2">
              <Input
                id="accent-color"
                type="color"
                value={accentColor}
                onChange={(e) => setAccentColor(e.target.value)}
                disabled={saving}
                className="h-10 w-20 border-border bg-muted p-1"
              />
              <Input
                value={accentColor}
                onChange={(e) => setAccentColor(e.target.value)}
                disabled={saving}
                className="border-border bg-muted font-mono"
              />
            </div>
          </div>

          <Button onClick={handleSave} disabled={saving} className="gap-2">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {saving ? t('saving') : t('save')}
          </Button>
        </CardContent>
      </Card>

      {/* All Workspaces */}
      <Card className="border-border bg-card">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            <CardTitle>{t('yourWorkspaces')}</CardTitle>
          </div>
          <CardDescription>{t('yourWorkspacesDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {workspaces.map((ws) => {
              const isActive = ws.account_id === activeWorkspace?.account_id;
              const roleIcon = ws.role === 'owner' ? Crown : ws.role === 'admin' ? Shield : ws.role === 'agent' ? UserCog : User;
              const RoleIcon = roleIcon;
              const roleColor = ws.role === 'owner' ? 'text-amber-500' : ws.role === 'admin' ? 'text-primary' : 'text-muted-foreground';

              return (
                <div
                  key={ws.account_id}
                  className={`flex items-center justify-between rounded-lg border p-3 ${
                    isActive ? 'border-primary/50 bg-primary/5' : 'border-border'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                      <span className="text-sm font-medium text-foreground">
                        {ws.account_name?.charAt(0)?.toUpperCase() ?? '?'}
                      </span>
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-foreground">
                          {ws.account_name}
                        </span>
                        {isActive && (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                            {t('current')}
                          </Badge>
                        )}
                      </div>
                      {ws.subdomain && (
                        <span className="text-xs text-muted-foreground">
                          {ws.subdomain}.wacrm.com
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className={`flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs font-medium ${
                      ws.role === 'owner' ? 'border-amber-500/40 bg-amber-500/10 text-amber-500' :
                      ws.role === 'admin' ? 'border-primary/40 bg-primary/10 text-primary' :
                      'border-border bg-muted text-muted-foreground'
                    }`}>
                      <RoleIcon className={`h-3 w-3 ${roleColor}`} />
                      <span className="capitalize">{ws.role}</span>
                    </div>
                    {!isActive && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => switchWorkspace(ws.account_id)}
                        className="h-8 text-xs"
                      >
                        <Check className="mr-1 h-3 w-3" />
                        {t('switchTo')}
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Danger Zone */}
      <Card className="border-destructive/50 bg-destructive/5">
        <CardHeader>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <CardTitle className="text-destructive">{t('dangerZone')}</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Leave workspace */}
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-foreground">{t('leaveWorkspace')}</p>
              <p className="text-sm text-muted-foreground">{t('leaveWorkspaceDesc')}</p>
            </div>
            <Button
              variant="outline"
              onClick={() => setShowLeaveDialog(true)}
              className="border-border text-muted-foreground hover:bg-muted"
            >
              <UserMinus className="mr-2 h-4 w-4" />
              {t('leave')}
            </Button>
          </div>

          {/* Delete workspace (owner only) */}
          {isOwner && (
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-medium text-foreground">{t('deleteWorkspace')}</p>
                  <Badge variant="destructive" className="text-xs">{t('ownerOnly')}</Badge>
                </div>
                <p className="text-sm text-muted-foreground">{t('deleteWorkspaceDesc')}</p>
              </div>
              <Button
                variant="destructive"
                onClick={() => setShowDeleteDialog(true)}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                {t('delete')}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Leave Dialog */}
      <Dialog open={showLeaveDialog} onOpenChange={setShowLeaveDialog}>
        <DialogContent className="bg-popover border-border">
          <DialogHeader>
            <DialogTitle>{t('leaveWorkspace')}</DialogTitle>
            <DialogDescription>
              {t('leaveConfirm', { name: activeWorkspace.account_name })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="bg-popover border-border">
            <Button
              variant="outline"
              onClick={() => setShowLeaveDialog(false)}
              disabled={leaving}
              className="border-border"
            >
              {t('cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={handleLeave}
              disabled={leaving}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {leaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('leave')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="bg-popover border-border">
          <DialogHeader>
            <DialogTitle className="text-destructive">{t('deleteWorkspace')}</DialogTitle>
            <DialogDescription>
              {t('deleteConfirm', { name: activeWorkspace.account_name })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="bg-popover border-border">
            <Button
              variant="outline"
              onClick={() => setShowDeleteDialog(false)}
              disabled={deleting}
              className="border-border"
            >
              {t('cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
