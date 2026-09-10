'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Check, Loader2, Star } from 'lucide-react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface PlanFeatures {
  max_contacts: number;
  max_team_members: number;
  max_broadcasts_per_month: number;
  max_automations: number;
  max_flows: number;
  max_pipelines: number;
  ai_credits_per_month: number;
  price_kes: number;
  price_usd: number;
}

interface Plan {
  id: string;
  name: string;
  description: string;
  cta: string;
  recommended?: boolean;
  price_kes: number;
  price_usd: number;
  features: PlanFeatures;
}

interface PlansSelectorProps {
  currentPlan?: string;
  onSelectPlan?: (plan: string) => void;
  loading?: boolean;
}

function formatLimit(val: number | undefined | null): string {
  if (val == null || val >= 999999) return 'Unlimited';
  return val.toLocaleString();
}

export function PlansSelector({ currentPlan = 'starter', onSelectPlan, loading: externalLoading }: PlansSelectorProps) {
  const t = useTranslations('Onboarding.plans');
  const [plans, setPlans] = useState<Plan[]>([]);
  const [fetching, setFetching] = useState(true);
  const [upgrading, setUpgrading] = useState(false);

  useEffect(() => {
    fetch('/api/plans')
      .then((r) => r.json())
      .then((data) => setPlans(data.plans ?? []))
      .catch(() => toast.error('Failed to load plans'))
      .finally(() => setFetching(false));
  }, []);

  const handleSelectPlan = async (planId: string) => {
    if (planId === currentPlan) return;
    setUpgrading(true);
    try {
      const res = await fetch('/api/workspaces/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: planId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update plan');
      toast.success(`Plan updated to ${plans.find((p) => p.id === planId)?.name ?? planId}`);
      onSelectPlan?.(planId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update plan');
    } finally {
      setUpgrading(false);
    }
  };

  if (fetching) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {plans.filter((p) => p.id !== 'enterprise').map((plan) => {
          const isCurrent = plan.id === currentPlan;
          const isRecommended = plan.recommended;

          return (
            <Card
              key={plan.id}
              className={cn(
                'relative flex flex-col border-border',
                isCurrent && 'border-primary bg-primary/5',
                !isCurrent && 'bg-card',
              )}
            >
              {isRecommended && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground flex items-center gap-0.5">
                  <Star className="h-2.5 w-2.5" /> Best value
                </div>
              )}

              <CardHeader className="items-center text-center">
                <CardTitle className="text-foreground">{plan.name}</CardTitle>
                <CardDescription className="text-2xl font-bold text-foreground">
                  {plan.price_kes === 0
                    ? 'Free'
                    : `KES ${plan.price_kes.toLocaleString()}/mo`}
                </CardDescription>
              </CardHeader>

              <CardContent className="flex-1">
                <p className="mb-4 text-center text-sm text-muted-foreground">
                  {plan.description}
                </p>

                <ul className="flex flex-col gap-2 text-sm">
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-primary" />
                    <span>{formatLimit(plan.features?.max_team_members)} team members</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-primary" />
                    <span>{formatLimit(plan.features?.max_contacts)} contacts</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-primary" />
                    <span>{formatLimit(plan.features?.max_broadcasts_per_month)} broadcasts/mo</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-primary" />
                    <span>{formatLimit(plan.features?.max_automations)} automations</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-primary" />
                    <span>{formatLimit(plan.features?.ai_credits_per_month)} AI credits/mo</span>
                  </li>
                </ul>
              </CardContent>

              <CardFooter className="flex flex-col gap-2">
                {isCurrent ? (
                  <Button variant="outline" disabled className="w-full border-border">
                    Current plan
                  </Button>
                ) : plan.id === 'enterprise' ? (
                  <Button
                    variant="outline"
                    className="w-full border-border"
                    onClick={() => (window.location.href = 'mailto:sales@tijwa.com')}
                  >
                    Contact Sales
                  </Button>
                ) : (
                  <Button
                    onClick={() => handleSelectPlan(plan.id)}
                    disabled={externalLoading || upgrading}
                    variant={isRecommended ? 'default' : 'outline'}
                    className={cn(
                      'w-full',
                      isRecommended
                        ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                        : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground',
                    )}
                  >
                    {upgrading ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : null}
                    {currentPlan === 'starter' ? 'Upgrade' : plan.price_kes < (plans.find((p) => p.id === currentPlan)?.price_kes ?? 0) ? 'Downgrade' : 'Upgrade'}
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
