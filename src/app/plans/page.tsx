'use client';

import { PlansSelector } from './_components/plans-selector';
import { useAuth } from '@/hooks/use-auth';

export default function PlansPage() {
  const { activeWorkspace } = useAuth();
  const currentPlan = activeWorkspace?.plan ?? 'starter';
  const accountName = activeWorkspace?.account_name ?? '';

  return (
    <div className="container mx-auto max-w-4xl px-4 py-12">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          {accountName ? `${accountName} — Plans` : 'Choose your plan'}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Start free, upgrade when you're ready. No credit card required.
        </p>
      </div>

      <PlansSelector currentPlan={currentPlan as 'starter' | 'pro' | 'enterprise'} />
    </div>
  );
}
