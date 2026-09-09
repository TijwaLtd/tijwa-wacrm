'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import {
  Database,
  Loader2,
  CheckCircle,
  AlertTriangle,
  Package,
  Folder,
  Clock,
  Trash2,
  RotateCcw,
  AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useAuth } from '@/hooks/use-auth';
import { RequireRole } from '@/components/auth/require-role';

interface SeedResult {
  ok: boolean;
  business_type: string;
  categories_created: number;
  offerings_created: number;
  operating_hours_updated: boolean;
  errors: string[];
}

interface ResetResult {
  ok: boolean;
  deleted: Record<string, number>;
  total_tables_wiped: number;
  errors?: string[];
}

export default function SeedDataPage() {
  const { businessType, activeAccountId } = useAuth();
  const [seeding, setSeeding] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [seedResult, setSeedResult] = useState<SeedResult | null>(null);
  const [resetResult, setResetResult] = useState<ResetResult | null>(null);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);

  async function handleSeed() {
    if (!activeAccountId) return;
    setSeeding(true);
    setSeedResult(null);

    try {
      const res = await fetch('/api/seed-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account_id: activeAccountId }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || 'Failed to seed data');
        return;
      }

      setSeedResult(data);
      toast.success(
        `Seeded ${data.offerings_created} offerings and ${data.categories_created} categories`,
      );
    } catch (err) {
      console.error('[SeedData] error:', err);
      toast.error('Could not reach the server');
    } finally {
      setSeeding(false);
    }
  }

  async function handleReset() {
    if (!activeAccountId) return;
    setResetting(true);
    setResetResult(null);
    setResetConfirmOpen(false);

    try {
      const res = await fetch('/api/reset-data', {
        method: 'POST',
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || 'Failed to reset data');
        return;
      }

      setResetResult(data);
      setSeedResult(null);
      toast.success(`Reset complete — ${data.total_tables_wiped} tables wiped`);
    } catch (err) {
      console.error('[SeedData] reset error:', err);
      toast.error('Could not reach the server');
    } finally {
      setResetting(false);
    }
  }

  return (
    <div className="animate-in fade-in-50 space-y-6 duration-200">
      <div>
        <h1 className="text-lg font-semibold text-foreground">
          Data Management
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Reset your account data or populate it with realistic samples based on
          your business type.
        </p>
      </div>

      {/* Current business type */}
      <Card>
        <CardContent className="flex items-center gap-4 p-4">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <Database className="size-5 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground">
              Business Type
            </p>
            <p className="text-sm text-muted-foreground">
              {businessType
                ? businessType
                    .replace(/_/g, ' ')
                    .replace(/\b\w/g, (c) => c.toUpperCase())
                : 'Not set'}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Action buttons */}
      <RequireRole min="admin">
        <div className="flex flex-wrap gap-3">
          <Button
            onClick={handleSeed}
            disabled={seeding || resetting || !businessType}
            className="bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            {seeding ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Seeding...
              </>
            ) : (
              <>
                <Database className="size-4" />
                Seed Sample Data
              </>
            )}
          </Button>

          <Button
            variant="outline"
            onClick={() => setResetConfirmOpen(true)}
            disabled={seeding || resetting}
            className="border-red-500/40 bg-red-500/10 text-red-300 hover:bg-red-500/20 hover:border-red-500/60 hover:text-red-200"
          >
            {resetting ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Resetting...
              </>
            ) : (
              <>
                <Trash2 className="size-4" />
                Reset All Data
              </>
            )}
          </Button>
        </div>
      </RequireRole>

      {/* Reset confirmation dialog */}
      <Dialog open={resetConfirmOpen} onOpenChange={setResetConfirmOpen}>
        <DialogContent className="bg-popover border-border sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-popover-foreground">
              <AlertCircle className="size-4 text-red-400" />
              Reset All Data?
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              This will permanently delete <strong>everything</strong> in your
              account — offerings, orders, bookings, conversations, contacts,
              flows, and all other data. Your account and login stay intact.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="bg-popover border-border">
            <Button
              variant="outline"
              onClick={() => setResetConfirmOpen(false)}
              className="border-border text-muted-foreground hover:bg-muted"
            >
              Cancel
            </Button>
            <Button
              onClick={handleReset}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {resetting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Resetting...
                </>
              ) : (
                'Yes, delete everything'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Seed results */}
      {seedResult && (
        <Card>
          <CardContent className="space-y-4 p-4">
            <div className="flex items-center gap-2">
              {seedResult.errors.length === 0 ? (
                <CheckCircle className="size-5 text-emerald-500" />
              ) : (
                <AlertTriangle className="size-5 text-amber-500" />
              )}
              <h3 className="text-sm font-semibold text-foreground">
                {seedResult.errors.length === 0
                  ? 'Seed complete'
                  : 'Seed completed with errors'}
              </h3>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="flex items-center gap-3 rounded-lg border border-border p-3">
                <Folder className="size-4 text-muted-foreground" />
                <div>
                  <p className="text-lg font-semibold text-foreground">
                    {seedResult.categories_created}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Categories created
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-lg border border-border p-3">
                <Package className="size-4 text-muted-foreground" />
                <div>
                  <p className="text-lg font-semibold text-foreground">
                    {seedResult.offerings_created}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Offerings created
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-lg border border-border p-3">
                <Clock className="size-4 text-muted-foreground" />
                <div>
                  <p className="text-lg font-semibold text-foreground">
                    {seedResult.operating_hours_updated ? 'Yes' : 'No'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Operating hours updated
                  </p>
                </div>
              </div>
            </div>

            {seedResult.errors.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-amber-500">Errors:</p>
                {seedResult.errors.map((err, i) => (
                  <p key={i} className="text-xs text-muted-foreground">
                    {err}
                  </p>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Reset results */}
      {resetResult && (
        <Card>
          <CardContent className="space-y-4 p-4">
            <div className="flex items-center gap-2">
              <CheckCircle className="size-5 text-emerald-500" />
              <h3 className="text-sm font-semibold text-foreground">
                Reset complete — {resetResult.total_tables_wiped} tables wiped
              </h3>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
              {Object.entries(resetResult.deleted).map(([table, count]) => (
                <div
                  key={table}
                  className="rounded-lg border border-border p-2 text-center"
                >
                  <p className="text-xs text-muted-foreground">{table}</p>
                  <p className="text-sm font-medium text-foreground">
                    {count} rows
                  </p>
                </div>
              ))}
            </div>

            {resetResult.errors && resetResult.errors.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-amber-500">Errors:</p>
                {resetResult.errors.map((err, i) => (
                  <p key={i} className="text-xs text-muted-foreground">
                    {err}
                  </p>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Workflow info */}
      <div className="rounded-lg border border-border bg-muted/50 p-4 text-xs text-muted-foreground space-y-2">
        <p>
          <strong className="text-foreground">Typical workflow:</strong>{' '}
          <span className="text-foreground">Reset All Data</span> → change
          business type in settings if needed →{' '}
          <span className="text-foreground">Seed Sample Data</span>
        </p>
        <p>
          <strong className="text-foreground">Full nuclear reset:</strong> Run{' '}
          <code className="rounded bg-muted px-1 py-0.5 text-foreground">
            supabase/nuke_account_data.sql
          </code>{' '}
          in the SQL Editor to delete everything including your auth user and
          account.
        </p>
        <p>
          <strong className="text-foreground">Single account reset:</strong> Run{' '}
          <code className="rounded bg-muted px-1 py-0.5 text-foreground">
            supabase/nuke_single_account.sql
          </code>{' '}
          in the SQL Editor with your account UUID.
        </p>
      </div>
    </div>
  );
}
