'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  Download,
  FileText,
  Mail,
  RefreshCw,
  Send,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/use-auth';
import { hasMinRole } from '@/lib/auth/roles';
import { StatCard, STAT_GRID_CLASS } from '@/components/shared/stat-card';
import { BarChart } from '@/components/tremor/bar-chart';
import { ScheduleCard } from '@/components/reports/schedule-card';
import {
  formatKpiValue,
} from '@/lib/reports/metrics';
import type { ReportBundle, ReportPeriodKind } from '@/lib/reports/types';
import type { BusinessReportRow, ReportConfigRow } from '@/lib/reports/store';

type HistoryRow = Omit<BusinessReportRow, 'metrics'> & { metrics: ReportBundle };

const PERIOD_OPTIONS: { value: ReportPeriodKind; label: string }[] = [
  { value: 'daily', label: 'Today' },
  { value: 'weekly', label: 'Last 7 days' },
  { value: 'monthly', label: 'Last 30 days' },
];

export default function ReportsPage() {
  const { accountId, accountRole } = useAuth();
  const isAdmin = !!accountRole && hasMinRole(accountRole, 'admin');
  const [config, setConfig] = useState<ReportConfigRow | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [bundle, setBundle] = useState<ReportBundle | null>(null);
  const [kind, setKind] = useState<ReportPeriodKind>('monthly');
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [emailing, setEmailing] = useState(false);

  useEffect(() => {
    if (!accountId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/reports?account_id=${accountId}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to load reports');
        if (cancelled) return;
        setConfig(data.config as ReportConfigRow);
        const rows = (data.history ?? []) as HistoryRow[];
        setHistory(rows);
        setBundle(rows[0]?.metrics ?? null);
      } catch (err) {
        if (!cancelled) {
          toast.error(err instanceof Error ? err.message : 'Failed to load reports');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accountId]);

  const load = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/reports?account_id=${accountId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load reports');
      setConfig(data.config as ReportConfigRow);
      const rows = (data.history ?? []) as HistoryRow[];
      setHistory(rows);
      setBundle(rows[0]?.metrics ?? null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load reports');
    } finally {
      setLoading(false);
    }
  }, [accountId]);

  const generate = async (withEmail: boolean) => {
    if (!accountId) return;
    if (withEmail) setEmailing(true);
    else setGenerating(true);
    try {
      const res = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account_id: accountId, kind, email: withEmail }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to generate report');
      toast.success(
        withEmail
          ? data.emailed
            ? `Report emailed to ${data.recipients.join(', ')}`
            : `Saved, but email failed${data.error ? `: ${data.error}` : ''}`
          : 'Report generated',
      );
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to generate report');
    } finally {
      setGenerating(false);
      setEmailing(false);
    }
  };

  const chatDaily = useMemo(() => {
    if (!bundle) return [];
    return bundle.chat.daily.map((d) => ({
      day: d.day.slice(5),
      Received: d.incoming,
      Sent: d.outgoing,
    }));
  }, [bundle]);

  const deepDaily = useMemo(() => {
    const deepDive = bundle?.deepDive;
    if (!deepDive) return [];
    const label =
      deepDive.family === 'hospitality' || deepDive.family === 'services'
        ? 'Bookings'
        : deepDive.family === 'ngo'
          ? 'Applications'
          : deepDive.family === 'property'
            ? 'Inquiries'
            : 'Orders';
    return deepDive.daily.map((d) => ({
      day: d.day.slice(5),
      [label]: d.value,
    }));
  }, [bundle]);

  const deepCategory = useMemo(() => {
    const deepDive = bundle?.deepDive;
    if (!deepDive) return 'Value';
    return deepDive.family === 'hospitality' || deepDive.family === 'services'
      ? 'Bookings'
      : deepDive.family === 'ngo'
        ? 'Applications'
        : deepDive.family === 'property'
          ? 'Inquiries'
          : 'Orders';
  }, [bundle]);

  const downloadUrl = (id: string) =>
    `/api/reports/${id}/download?account_id=${accountId}`;

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold">
            <BarChart3 className="h-5 w-5" /> Reports
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {bundle
              ? `${bundle.businessName} · ${bundle.period.label}`
              : 'Chat, sales and operations — with comparisons against the previous period.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={kind} onValueChange={(v) => setKind(v as ReportPeriodKind)}>
            <SelectTrigger className="h-9 w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PERIOD_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void generate(false)}
            disabled={generating || emailing}
          >
            {generating ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <FileText className="h-4 w-4" />
            )}
            Generate
          </Button>
          {isAdmin && (
            <Button
              size="sm"
              onClick={() => void generate(true)}
              disabled={generating || emailing || kind === 'daily'}
              title={
                kind === 'daily'
                  ? 'Daily reports are view-only — pick Last 7 days or Last 30 days to email a PDF'
                  : undefined
              }
            >
              {emailing ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              Generate &amp; email PDF
            </Button>
          )}
        </div>
      </div>

      {loading && !bundle ? (
        <div className="rounded-xl border border-border/80 bg-card p-8 text-center text-sm text-muted-foreground">
          Loading reports…
        </div>
      ) : bundle ? (
        <>
          <div className={STAT_GRID_CLASS}>
            {bundle.headlineKpis.slice(0, 8).map((kpi) => (
              <StatCard
                key={kpi.label}
                title={kpi.label}
                value={formatKpiValue(kpi.value, kpi.format, bundle.currency)}
                icon={BarChart3}
                valueClassName={
                  kpi.value.deltaPct !== null && kpi.value.deltaPct < 0
                    ? 'text-red-600'
                    : undefined
                }
              />
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-border/80 bg-card p-4 shadow-xs">
              <h3 className="mb-3 text-sm font-semibold">Daily messages</h3>
              {chatDaily.length > 0 ? (
                <BarChart
                  data={chatDaily}
                  index="day"
                  categories={['Received', 'Sent']}
                  colors={['blue', 'emerald']}
                  showLegend
                  showGridLines
                  yAxisWidth={40}
                  className="h-64"
                />
              ) : (
                <p className="py-8 text-center text-xs text-muted-foreground">
                  No messages in this period.
                </p>
              )}
            </div>
            <div className="rounded-xl border border-border/80 bg-card p-4 shadow-xs">
              <h3 className="mb-3 text-sm font-semibold">Daily {deepCategory.toLowerCase()}</h3>
              {deepDaily.length > 0 ? (
                <BarChart
                  data={deepDaily}
                  index="day"
                  categories={[deepCategory]}
                  colors={['blue']}
                  showLegend={false}
                  showGridLines
                  yAxisWidth={40}
                  className="h-64"
                />
              ) : (
                <p className="py-8 text-center text-xs text-muted-foreground">
                  Nothing recorded in this period.
                </p>
              )}
            </div>
          </div>

          {bundle.deepDive && 'topItems' in bundle.deepDive &&
            bundle.deepDive.topItems.length > 0 && (
              <div className="rounded-xl border border-border/80 bg-card p-4 shadow-xs">
                <h3 className="mb-3 text-sm font-semibold">Top items</h3>
                <ul className="divide-y divide-border/60">
                  {bundle.deepDive.topItems.map((item) => (
                    <li
                      key={item.name}
                      className="flex items-center justify-between py-2 text-sm"
                    >
                      <span className="truncate">{item.name}</span>
                      <span className="ml-3 shrink-0 text-muted-foreground">
                        {item.quantity} ·{' '}
                        {formatKpiValue({ current: item.revenue }, 'currency', bundle.currency)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

          <ScheduleCard
            key={JSON.stringify(config)}
            config={config}
            onSaved={setConfig}
          />

          <div className="rounded-xl border border-border/80 bg-card shadow-xs">
            <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
              <h3 className="text-sm font-semibold">History</h3>
              <Button size="sm" variant="ghost" onClick={() => void load()}>
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
            {history.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-muted-foreground">
                No reports generated yet.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/60 text-left text-xs text-muted-foreground">
                      <th className="px-4 py-2 font-medium">Period</th>
                      <th className="px-4 py-2 font-medium">Range</th>
                      <th className="px-4 py-2 font-medium">Generated</th>
                      <th className="px-4 py-2 font-medium">Emailed</th>
                      <th className="px-4 py-2 font-medium">PDF</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((row) => (
                      <tr key={row.id} className="border-b border-border/40 last:border-0">
                        <td className="px-4 py-2.5 capitalize">{row.period}</td>
                        <td className="px-4 py-2.5 text-muted-foreground">
                          {row.period_start} → {row.period_end}
                        </td>
                        <td className="px-4 py-2.5 text-muted-foreground">
                          {new Date(row.created_at).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-2.5 text-muted-foreground">
                          {row.sent_at
                            ? new Date(row.sent_at).toLocaleDateString()
                            : '—'}
                        </td>
                        <td className="px-4 py-2.5">
                          <a
                            href={downloadUrl(row.id)}
                            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                          >
                            <Download className="h-3.5 w-3.5" /> Download
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="rounded-xl border border-dashed border-border/80 bg-card p-10 text-center">
          <Mail className="mx-auto h-8 w-8 text-muted-foreground" />
          <h2 className="mt-3 text-sm font-semibold">No reports yet</h2>
          <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
            Generate your first report to see conversation, sales and operations
            metrics with period-over-period comparisons.
          </p>
          <Button size="sm" className="mt-4" onClick={() => void generate(false)}>
            Generate report
          </Button>
        </div>
      )}
    </div>
  );
}
