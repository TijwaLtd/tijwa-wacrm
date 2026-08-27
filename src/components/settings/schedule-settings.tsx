'use client';

import { useEffect, useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/use-auth';
import { canEditSettings } from '@/lib/auth/roles';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { SettingsPanelHead } from '@/components/settings/settings-panel-head';
import { Clock } from 'lucide-react';

interface ScheduleEntry {
  day_of_week: number;
  start_time: string;
  end_time: string;
  timezone: string;
  is_active: boolean;
}

const DAYS = [
  { value: 0, label: 'Sunday' },
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
];

const TIMEZONES = [
  'Africa/Nairobi',
  'Africa/Lagos',
  'Africa/Cairo',
  'Africa/Johannesburg',
  'Europe/London',
  'Europe/Paris',
  'America/New_York',
  'America/Chicago',
  'America/Los_Angeles',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Shanghai',
  'Asia/Tokyo',
  'Australia/Sydney',
];

function getDefaultSchedule(): ScheduleEntry[] {
  return DAYS.map((d) => ({
    day_of_week: d.value,
    start_time: d.value >= 1 && d.value <= 5 ? '09:00' : '00:00',
    end_time: d.value >= 1 && d.value <= 5 ? '17:00' : '00:00',
    timezone: 'Africa/Nairobi',
    is_active: d.value >= 1 && d.value <= 5,
  }));
}

export function ScheduleSettings() {
  const t = useTranslations('Settings.schedule');
  const { account, accountRole } = useAuth();
  const [schedules, setSchedules] = useState<ScheduleEntry[]>(getDefaultSchedule());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const canEdit = canEditSettings(accountRole ?? 'viewer');

  const loadSchedule = useCallback(async () => {
    try {
      const res = await fetch('/api/schedules');
      const data = await res.json();
      if (res.ok && data.schedules?.length > 0) {
        // Merge loaded schedules with defaults
        const loaded = getDefaultSchedule();
        for (const s of data.schedules) {
          const idx = loaded.findIndex((l) => l.day_of_week === s.day_of_week);
          if (idx >= 0) {
            loaded[idx] = {
              day_of_week: s.day_of_week,
              start_time: s.start_time,
              end_time: s.end_time,
              timezone: s.timezone,
              is_active: s.is_active,
            };
          }
        }
        setSchedules(loaded);
      }
    } catch {
      console.error('Failed to load schedule');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSchedule();
  }, [loadSchedule]);

  const updateDay = (dayOfWeek: number, updates: Partial<ScheduleEntry>) => {
    setSchedules((prev) =>
      prev.map((s) =>
        s.day_of_week === dayOfWeek ? { ...s, ...updates } : s,
      ),
    );
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/schedules', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schedules }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save');
      }

      toast.success(t('saved'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const setWeekdaysOnly = () => {
    setSchedules((prev) =>
      prev.map((s) => ({
        ...s,
        is_active: s.day_of_week >= 1 && s.day_of_week <= 5,
        start_time: s.day_of_week >= 1 && s.day_of_week <= 5 ? '09:00' : '00:00',
        end_time: s.day_of_week >= 1 && s.day_of_week <= 5 ? '17:00' : '00:00',
      })),
    );
  };

  const setEveryDay = () => {
    setSchedules((prev) =>
      prev.map((s) => ({
        ...s,
        is_active: true,
        start_time: '09:00',
        end_time: '17:00',
      })),
    );
  };

  if (loading) {
    return <div className="text-muted-foreground py-8">{t('loading')}</div>;
  }

  return (
    <>
      <SettingsPanelHead
        title={t('title')}
        description={t('description')}
      />

      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">{t('timezone')}</CardTitle>
              <CardDescription>{t('timezoneHint')}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <select
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            value={schedules[0]?.timezone || 'Africa/Nairobi'}
            onChange={(e) => {
              const tz = e.target.value;
              setSchedules((prev) => prev.map((s) => ({ ...s, timezone: tz })));
            }}
            disabled={!canEdit}
          >
            {TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>{tz}</option>
            ))}
          </select>
        </CardContent>
      </Card>

      <div className="flex items-center gap-2 mb-4">
        <Button variant="outline" size="sm" onClick={setWeekdaysOnly}>
          {t('weekdaysOnly')}
        </Button>
        <Button variant="outline" size="sm" onClick={setEveryDay}>
          {t('everyDay')}
        </Button>
      </div>

      <div className="grid gap-4">
        {schedules.map((schedule) => {
          const day = DAYS.find((d) => d.value === schedule.day_of_week);
          return (
            <Card key={schedule.day_of_week}>
              <CardContent className="py-4">
                <div className="flex items-center gap-4">
                  <div className="w-28">
                    <Switch
                      checked={schedule.is_active}
                      onCheckedChange={(checked) => updateDay(schedule.day_of_week, { is_active: checked })}
                      disabled={!canEdit}
                    />
                  </div>

                  <div className="w-24">
                    <span className={`text-sm font-medium ${!schedule.is_active ? 'text-muted-foreground' : ''}`}>
                      {day?.label}
                    </span>
                  </div>

                  {schedule.is_active ? (
                    <div className="flex items-center gap-2 flex-1">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <Input
                        type="time"
                        value={schedule.start_time}
                        onChange={(e) => updateDay(schedule.day_of_week, { start_time: e.target.value })}
                        className="w-32"
                        disabled={!canEdit}
                      />
                      <span className="text-muted-foreground">to</span>
                      <Input
                        type="time"
                        value={schedule.end_time}
                        onChange={(e) => updateDay(schedule.day_of_week, { end_time: e.target.value })}
                        className="w-32"
                        disabled={!canEdit}
                      />
                    </div>
                  ) : (
                    <div className="flex-1">
                      <span className="text-sm text-muted-foreground">{t('closed')}</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {canEdit && (
        <div className="mt-6">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? t('saving') : t('save')}
          </Button>
        </div>
      )}
    </>
  );
}
