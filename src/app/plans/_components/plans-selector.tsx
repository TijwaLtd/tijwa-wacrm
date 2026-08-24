'use client';

import { useTranslations } from 'next-intl';
import { Check } from 'lucide-react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface Plan {
  id: 'starter' | 'pro' | 'enterprise';
  maxContacts: number | 'unlimited';
  maxTeam: number | 'unlimited';
  maxBroadcasts: number | 'unlimited';
  maxAutomations: number | 'unlimited';
}

interface PlansSelectorProps {
  currentPlan?: 'starter' | 'pro' | 'enterprise';
  onSelectPlan?: (plan: 'starter' | 'pro' | 'enterprise') => void;
  loading?: boolean;
}

const PLANS: Plan[] = [
  {
    id: 'starter',
    maxContacts: 1000,
    maxTeam: 5,
    maxBroadcasts: 50,
    maxAutomations: 20,
  },
  {
    id: 'pro',
    maxContacts: 25000,
    maxTeam: 25,
    maxBroadcasts: 500,
    maxAutomations: 100,
  },
  {
    id: 'enterprise',
    maxContacts: 'unlimited',
    maxTeam: 'unlimited',
    maxBroadcasts: 'unlimited',
    maxAutomations: 'unlimited',
  },
];

export function PlansSelector({ currentPlan = 'starter', onSelectPlan, loading }: PlansSelectorProps) {
  const t = useTranslations('Onboarding.plans');

  const handleSelectPlan = async (planId: 'starter' | 'pro' | 'enterprise') => {
    if (planId === currentPlan) return;

    try {
      const res = await fetch('/api/workspaces/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: planId }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to update plan');
      }

      toast.success(t('emailReminder'));
      onSelectPlan?.(planId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update plan');
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h3 className="text-lg font-semibold text-foreground">{t('title')}</h3>
        <p className="text-sm text-muted-foreground">{t('desc')}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {PLANS.map((plan) => {
          const isCurrent = plan.id === currentPlan;
          const isPro = plan.id === 'pro';

          return (
            <Card
              key={plan.id}
              className={`relative flex flex-col border-border ${
                isCurrent ? 'border-primary bg-primary/5' : 'bg-card'
              }`}
            >
              {isPro && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground">
                  Popular
                </div>
              )}

              <CardHeader className="items-center text-center">
                <CardTitle className="text-foreground">{t(`${plan.id}.name`)}</CardTitle>
                <CardDescription className="text-2xl font-bold text-foreground">
                  {plan.id === 'starter' && t('starter.price')}
                  {plan.id === 'pro' && t('pro.price', { price: '$29' })}
                  {plan.id === 'enterprise' && t('enterprise.price')}
                </CardDescription>
              </CardHeader>

              <CardContent className="flex-1">
                <p className="mb-4 text-center text-sm text-muted-foreground">
                  {t(`${plan.id}.description`)}
                </p>

                <ul className="flex flex-col gap-2 text-sm">
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-primary" />
                    <span>
                      {plan.maxContacts === 'unlimited'
                        ? t('features.unlimited')
                        : t('features.maxContacts', { count: plan.maxContacts.toLocaleString() })}
                    </span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-primary" />
                    <span>
                      {plan.maxTeam === 'unlimited'
                        ? t('features.unlimited')
                        : t('features.maxTeam', { count: plan.maxTeam })}
                    </span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-primary" />
                    <span>
                      {plan.maxBroadcasts === 'unlimited'
                        ? t('features.unlimited')
                        : t('features.maxBroadcasts', { count: plan.maxBroadcasts })}
                    </span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-primary" />
                    <span>
                      {plan.maxAutomations === 'unlimited'
                        ? t('features.unlimited')
                        : t('features.maxAutomations', { count: plan.maxAutomations })}
                    </span>
                  </li>
                </ul>
              </CardContent>

              <CardFooter className="flex flex-col gap-2">
                {isCurrent ? (
                  <Button variant="outline" disabled className="w-full border-border">
                    {t('currentPlan')}
                  </Button>
                ) : plan.id === 'enterprise' ? (
                  <Button
                    variant="outline"
                    className="w-full border-border"
                    onClick={() => window.location.href = 'mailto:sales@wacrm.com'}
                  >
                    {t('contactSales')}
                  </Button>
                ) : (
                  <Button
                    onClick={() => handleSelectPlan(plan.id)}
                    disabled={loading}
                    variant={isPro ? 'default' : 'outline'}
                    className={`w-full ${
                      isPro
                        ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                        : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground'
                    }`}
                  >
                    {plan.id === 'starter'
                      ? 'Downgrade'
                      : 'Upgrade'}
                  </Button>
                )}
              </CardFooter>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
