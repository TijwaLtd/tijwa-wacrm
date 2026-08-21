'use client';

import { useTranslations } from 'next-intl';
import { PlansSelector } from '@/app/plans/_components/plans-selector';
import { useAuth } from '@/hooks/use-auth';

export function PlansSettings() {
  const t = useTranslations('Onboarding.plans');
  const { activeWorkspace } = useAuth();
  const currentPlan = activeWorkspace?.plan ?? 'starter';

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-foreground">{t('title')}</h2>
        <p className="text-sm text-muted-foreground">{t('desc')}</p>
      </div>

      <PlansSelector currentPlan={currentPlan as 'starter' | 'pro' | 'enterprise'} />
    </div>
  );
}
