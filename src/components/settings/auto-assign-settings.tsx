'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, ArrowRightLeft, Users, BarChart3 } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { canEditSettings } from '@/lib/auth/roles';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { SettingsPanelHead } from './settings-panel-head';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

type AutoAssignMode = 'manual' | 'round_robin' | 'load_balanced';

const MODES: { value: AutoAssignMode; icon: typeof ArrowRightLeft; labelKey: string; descKey: string }[] = [
  { value: 'manual', icon: Users, labelKey: 'manual', descKey: 'manualDesc' },
  { value: 'round_robin', icon: ArrowRightLeft, labelKey: 'roundRobin', descKey: 'roundRobinDesc' },
  { value: 'load_balanced', icon: BarChart3, labelKey: 'loadBalanced', descKey: 'loadBalancedDesc' },
];

export function AutoAssignSettings() {
  const { accountId, accountRole, profileLoading, activeWorkspace } = useAuth();
  const canEdit = accountRole ? canEditSettings(accountRole) : false;
  const t = useTranslations('Settings.autoAssign');

  const [mode, setMode] = useState<AutoAssignMode>('manual');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (profileLoading || !accountId) return;

    (async () => {
      try {
        const res = await fetch(`/api/workspaces/${accountId}`);
        if (!res.ok) throw new Error('Failed to load');
        const data = await res.json();
        const ts = data.workspace?.tenant_settings;
        if (ts?.auto_assign_mode) {
          setMode(ts.auto_assign_mode as AutoAssignMode);
        }
      } catch {
        // Use default
      } finally {
        setLoading(false);
      }
    })();
  }, [accountId, profileLoading]);

  const handleSave = useCallback(async () => {
    if (!accountId) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/workspaces/${accountId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ auto_assign_mode: mode }),
      });
      if (!res.ok) throw new Error('Failed to save');
      toast.success(t('saveSuccess'));
    } catch {
      toast.error(t('saveFailed'));
    } finally {
      setSaving(false);
    }
  }, [accountId, mode, t]);

  if (loading || profileLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading...
      </div>
    );
  }

  return (
    <div>
      <SettingsPanelHead
        title={t('title')}
        description={t('description')}
      />

      {!canEdit && (
        <p className="mb-4 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          {t('adminOnly')}
        </p>
      )}

      <div className="space-y-3">
        {MODES.map(({ value, icon: Icon, labelKey, descKey }) => (
          <button
            key={value}
            disabled={!canEdit}
            onClick={() => setMode(value)}
            className={cn(
              'flex w-full items-start gap-3 rounded-lg border p-4 text-left transition-colors',
              mode === value
                ? 'border-primary bg-primary/5'
                : 'border-border hover:bg-muted/50',
              !canEdit && 'opacity-50 cursor-not-allowed'
            )}
          >
            <div className={cn(
              'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md',
              mode === value ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
            )}>
              <Icon className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground">{t(labelKey)}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{t(descKey)}</p>
            </div>
            <div className={cn(
              'mt-1 h-4 w-4 shrink-0 rounded-full border-2',
              mode === value
                ? 'border-primary bg-primary'
                : 'border-muted-foreground/30'
            )} />
          </button>
        ))}
      </div>

      {canEdit && (
        <div className="mt-6 flex justify-end">
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('save')}
          </Button>
        </div>
      )}
    </div>
  );
}
