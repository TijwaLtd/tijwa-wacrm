'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  Loader2,
  Check,
  CreditCard,
  ArrowUpRight,
  Users,
  MessageSquare,
  Radio,
  Zap,
  Coins,
  AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/hooks/use-auth';
import { cn } from '@/lib/utils';

interface Plan {
  id: 'starter' | 'pro' | 'enterprise';
  name: string;
  price: string;
  description: string;
  maxContacts: number | 'unlimited';
  maxTeam: number | 'unlimited';
  maxBroadcasts: number | 'unlimited';
  maxAutomations: number | 'unlimited';
  maxFlows: number | 'unlimited';
  aiCredits: number | 'unlimited';
}

interface PlanLimits {
  max_contacts: number;
  max_team_members: number;
  max_broadcasts_per_month: number;
  max_automations: number;
  max_flows: number;
  ai_credits_per_month: number;
}

const PLANS: Plan[] = [
  {
    id: 'starter',
    name: 'Starter',
    price: 'Free',
    description: 'For small teams getting started with WhatsApp CRM.',
    maxContacts: 1000,
    maxTeam: 5,
    maxBroadcasts: 50,
    maxAutomations: 20,
    maxFlows: 10,
    aiCredits: 100,
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '$29/mo',
    description: 'For growing businesses that need more power.',
    maxContacts: 25000,
    maxTeam: 25,
    maxBroadcasts: 500,
    maxAutomations: 100,
    maxFlows: 50,
    aiCredits: 1000,
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: 'Custom',
    description: 'For large organizations with custom needs.',
    maxContacts: 'unlimited',
    maxTeam: 'unlimited',
    maxBroadcasts: 'unlimited',
    maxAutomations: 'unlimited',
    maxFlows: 'unlimited',
    aiCredits: 'unlimited',
  },
];

function formatLimit(val: number | 'unlimited'): string {
  return val === 'unlimited' ? 'Unlimited' : val.toLocaleString();
}

export default function BillingPage() {
  const { activeWorkspace } = useAuth();
  const currentPlan = (activeWorkspace?.plan ?? 'starter') as Plan['id'];
  const subscriptionStatus = activeWorkspace?.subscription_status ?? 'active';
  const t = useTranslations('Onboarding.plans');

  const [loading, setLoading] = useState(false);
  const [limits, setLimits] = useState<PlanLimits | null>(null);

  const fetchLimits = useCallback(async () => {
    try {
      const res = await fetch('/api/ai/config');
      const data = await res.json();
      // We just need the plan limits — use a dedicated endpoint if needed
    } catch {
      // non-critical
    }
  }, []);

  useEffect(() => {
    void fetchLimits();
  }, [fetchLimits]);

  const handleUpgrade = async (planId: Plan['id']) => {
    if (planId === currentPlan) return;
    setLoading(true);
    try {
      const res = await fetch('/api/workspaces/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: planId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update plan');
      toast.success(`Plan updated to ${planId}`);
      window.location.reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update plan');
    } finally {
      setLoading(false);
    }
  };

  const isExpired = subscriptionStatus && !['active', 'trial'].includes(subscriptionStatus);
  const activePlan = PLANS.find((p) => p.id === currentPlan) ?? PLANS[0];

  return (
    <div className="mx-auto max-w-3xl py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-foreground">Billing & Plan</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage your subscription and view plan details.
        </p>
      </div>

      {/* Subscription status banner */}
      {isExpired && (
        <div className="mb-6 flex items-center gap-3 rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3">
          <AlertTriangle className="h-5 w-5 shrink-0 text-destructive" />
          <div>
            <p className="text-sm font-medium text-destructive">
              Your subscription has expired
            </p>
            <p className="text-xs text-destructive/80">
              Sending and team features are disabled. Renew to restore access.
            </p>
          </div>
        </div>
      )}

      {/* Current plan card */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CreditCard className="h-4 w-4 text-primary" /> Current Plan
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-2xl font-bold text-foreground">{activePlan.name}</p>
              <p className="text-sm text-muted-foreground">{activePlan.price}</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-muted-foreground">Status</p>
              <p className={cn(
                'text-sm font-medium',
                isExpired ? 'text-destructive' : 'text-green-600',
              )}>
                {isExpired ? 'Expired' : subscriptionStatus === 'trial' ? 'Trial' : 'Active'}
              </p>
            </div>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <div className="rounded-md border border-border p-3">
              <p className="text-xs text-muted-foreground">Contacts</p>
              <p className="text-lg font-bold text-foreground">{formatLimit(activePlan.maxContacts)}</p>
            </div>
            <div className="rounded-md border border-border p-3">
              <p className="text-xs text-muted-foreground">Team members</p>
              <p className="text-lg font-bold text-foreground">{formatLimit(activePlan.maxTeam)}</p>
            </div>
            <div className="rounded-md border border-border p-3">
              <p className="text-xs text-muted-foreground">AI credits/mo</p>
              <p className="text-lg font-bold text-foreground">{formatLimit(activePlan.aiCredits)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Upgrade section */}
      <h2 className="mb-4 text-lg font-semibold text-foreground">Upgrade Plan</h2>
      <div className="grid gap-4 sm:grid-cols-3">
        {PLANS.map((plan) => {
          const isCurrent = plan.id === currentPlan;
          const isPro = plan.id === 'pro';

          return (
            <Card
              key={plan.id}
              className={cn(
                'relative flex flex-col',
                isCurrent && 'border-primary bg-primary/5',
              )}
            >
              {isPro && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground">
                  Popular
                </div>
              )}

              <CardHeader className="items-center text-center">
                <CardTitle className="text-foreground">{plan.name}</CardTitle>
                <CardDescription className="text-2xl font-bold text-foreground">
                  {plan.price}
                </CardDescription>
              </CardHeader>

              <CardContent className="flex-1">
                <p className="mb-4 text-center text-sm text-muted-foreground">
                  {plan.description}
                </p>

                <ul className="flex flex-col gap-2 text-sm">
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 shrink-0 text-primary" />
                    <span>{formatLimit(plan.maxContacts)} contacts</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 shrink-0 text-primary" />
                    <span>{formatLimit(plan.maxTeam)} team members</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 shrink-0 text-primary" />
                    <span>{formatLimit(plan.maxBroadcasts)} broadcasts/mo</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 shrink-0 text-primary" />
                    <span>{formatLimit(plan.maxAutomations)} automations</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 shrink-0 text-primary" />
                    <span>{formatLimit(plan.aiCredits)} AI credits/mo</span>
                  </li>
                </ul>
              </CardContent>

              <CardFooter>
                {isCurrent ? (
                  <Button variant="outline" disabled className="w-full">
                    Current Plan
                  </Button>
                ) : plan.id === 'enterprise' ? (
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => window.location.href = 'mailto:sales@wacrm.com'}
                  >
                    Contact Sales
                    <ArrowUpRight className="ml-1.5 h-4 w-4" />
                  </Button>
                ) : (
                  <Button
                    onClick={() => void handleUpgrade(plan.id)}
                    disabled={loading}
                    variant={isPro ? 'default' : 'outline'}
                    className="w-full"
                  >
                    {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Upgrade
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
