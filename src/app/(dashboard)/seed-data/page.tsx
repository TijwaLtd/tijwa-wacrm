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
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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

export default function SeedDataPage() {
  const { businessType, activeAccountId } = useAuth();
  const [seeding, setSeeding] = useState(false);
  const [result, setResult] = useState<SeedResult | null>(null);

  async function handleSeed() {
    if (!activeAccountId) return;
    setSeeding(true);
    setResult(null);

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

      setResult(data);
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

  return (
    <div className="animate-in fade-in-50 space-y-6 duration-200">
      <div>
        <h1 className="text-lg font-semibold text-foreground">
          Seed Sample Data
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Populate your catalog with realistic sample data based on your
          business type. Existing items with the same slug will be skipped.
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

      {/* Seed button */}
      <RequireRole min="admin">
        <Button
          onClick={handleSeed}
          disabled={seeding || !businessType}
          className="bg-primary hover:bg-primary/90 text-primary-foreground"
        >
          {seeding ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Seeding data...
            </>
          ) : (
            <>
              <Database className="size-4" />
              Seed Sample Data
            </>
          )}
        </Button>
      </RequireRole>

      {/* Results */}
      {result && (
        <Card>
          <CardContent className="space-y-4 p-4">
            <div className="flex items-center gap-2">
              {result.errors.length === 0 ? (
                <CheckCircle className="size-5 text-emerald-500" />
              ) : (
                <AlertTriangle className="size-5 text-amber-500" />
              )}
              <h3 className="text-sm font-semibold text-foreground">
                {result.errors.length === 0
                  ? 'Seed complete'
                  : 'Seed completed with errors'}
              </h3>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="flex items-center gap-3 rounded-lg border border-border p-3">
                <Folder className="size-4 text-muted-foreground" />
                <div>
                  <p className="text-lg font-semibold text-foreground">
                    {result.categories_created}
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
                    {result.offerings_created}
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
                    {result.operating_hours_updated ? 'Yes' : 'No'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Operating hours updated
                  </p>
                </div>
              </div>
            </div>

            {result.errors.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-amber-500">Errors:</p>
                {result.errors.map((err, i) => (
                  <p key={i} className="text-xs text-muted-foreground">
                    {err}
                  </p>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Info */}
      <div className="rounded-lg border border-border bg-muted/50 p-4 text-xs text-muted-foreground space-y-2">
        <p>
          <strong className="text-foreground">What gets seeded:</strong> Sample
          categories and offerings with realistic names, descriptions, prices,
          and images — tailored to your business type.
        </p>
        <p>
          <strong className="text-foreground">Idempotent:</strong> Running this
          again won't create duplicates. Items are matched by slug.
        </p>
        <p>
          <strong className="text-foreground">Images:</strong> Uses publicly
          available images from Unsplash (free, no attribution required).
        </p>
      </div>
    </div>
  );
}
