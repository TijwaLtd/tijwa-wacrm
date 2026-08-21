'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, Building2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

interface Workspace {
  id: string;
  name: string;
  subdomain: string | null;
}

interface WorkspaceEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspace: Workspace | null;
  onSaved?: () => void;
}

export function WorkspaceEditDialog({
  open,
  onOpenChange,
  workspace,
  onSaved,
}: WorkspaceEditDialogProps) {
  const t = useTranslations('Onboarding.workspace.editDialog');
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState(workspace?.name ?? '');
  const [error, setError] = useState<string | null>(null);

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setName(workspace?.name ?? '');
      setError(null);
    }
    onOpenChange(newOpen);
  };

  const handleSave = async () => {
    if (!workspace) return;

    const trimmedName = name.trim();
    if (!trimmedName || trimmedName.length < 2) {
      setError(t('nameLabel') + ' is required');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/workspaces', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          account_id: workspace.id,
          name: trimmedName,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || t('saveError'));
      }

      toast.success(t('saved'));
      handleOpenChange(false);
      onSaved?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('saveError'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="bg-popover border-border sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-popover-foreground">
            <Building2 className="h-4 w-4" />
            {t('title')}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            {workspace?.subdomain ? `${workspace.subdomain}.wacrm.com` : ''}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          {error && (
            <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
              {error}
            </div>
          )}

          <div className="flex flex-col gap-2">
            <Label htmlFor="edit-workspace-name">{t('nameLabel')}</Label>
            <Input
              id="edit-workspace-name"
              placeholder={t('namePlaceholder')}
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={loading}
              className="border-border bg-muted"
            />
          </div>
        </div>

        <DialogFooter className="bg-popover border-border">
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={loading}
            className="border-border text-popover-foreground hover:bg-muted"
          >
            {t('cancel')}
          </Button>
          <Button
            onClick={handleSave}
            disabled={loading}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t('saving')}
              </>
            ) : (
              t('save')
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
