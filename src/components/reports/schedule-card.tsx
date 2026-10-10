'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/use-auth';
import { hasMinRole } from '@/lib/auth/roles';
import type { ReportConfigRow } from '@/lib/reports/store';

const WEEKDAYS = [
  { value: 0, label: 'Sunday' },
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
];

export function ScheduleCard({
  config,
  onSaved,
}: {
  config: ReportConfigRow | null;
  onSaved: (config: ReportConfigRow) => void;
}) {
  const { accountId, accountRole } = useAuth();
  const isAdmin = !!accountRole && hasMinRole(accountRole, 'admin');
  const [enabled, setEnabled] = useState(config?.enabled ?? false);
  const [frequency, setFrequency] = useState<'weekly' | 'monthly'>(
    config?.frequency ?? 'monthly',
  );
  const [weekday, setWeekday] = useState(config?.weekday ?? 1);
  const [recipientsText, setRecipientsText] = useState(
    (config?.recipients ?? []).join(', '),
  );
  const [saving, setSaving] = useState(false);

  if (!isAdmin) return null;

  const save = async () => {
    if (!accountId) return;
    setSaving(true);
    try {
      const res = await fetch('/api/reports/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          account_id: accountId,
          enabled,
          frequency,
          weekday,
          recipients: recipientsText
            .split(',')
            .map((r) => r.trim())
            .filter(Boolean),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save');
      toast.success('Report schedule saved');
      onSaved(data.config as ReportConfigRow);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border border-border/80 bg-card p-4 shadow-xs">
      <h3 className="text-sm font-semibold">Email schedule</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        Reports are generated and emailed automatically. Weekly runs on the chosen
        weekday; monthly runs on the 1st (UTC).
      </p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="flex items-center justify-between gap-3 rounded-lg border border-border/60 p-3">
          <div>
            <Label className="text-xs font-medium">Automatic emails</Label>
            <p className="text-[11px] text-muted-foreground">Send the PDF on schedule</p>
          </div>
          <Switch checked={enabled} onCheckedChange={setEnabled} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Frequency</Label>
          <Select
            value={frequency}
            onValueChange={(v) => setFrequency(v as 'weekly' | 'monthly')}
          >
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="weekly">Weekly</SelectItem>
              <SelectItem value="monthly">Monthly</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {frequency === 'weekly' && (
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Weekday</Label>
            <Select
              value={String(weekday)}
              onValueChange={(v) => setWeekday(Number(v))}
            >
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WEEKDAYS.map((d) => (
                  <SelectItem key={d.value} value={String(d.value)}>
                    {d.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="space-y-1.5 sm:col-span-2">
          <Label className="text-xs font-medium">Recipients</Label>
          <Input
            value={recipientsText}
            onChange={(e) => setRecipientsText(e.target.value)}
            placeholder="ops@example.com, founder@example.com (comma-separated)"
            className="h-9"
          />
          <p className="text-[11px] text-muted-foreground">
            Leave empty to always send to the workspace owner.
          </p>
        </div>
      </div>
      <div className="mt-4 flex justify-end">
        <Button size="sm" onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save schedule'}
        </Button>
      </div>
    </div>
  );
}
