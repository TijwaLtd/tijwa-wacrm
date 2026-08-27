'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  Loader2,
  Check,
  CreditCard,
  ArrowUpRight,
  Calendar,
  AlertTriangle,
  XCircle,
  RotateCcw,
  Zap,
  Plus,
  Coins,
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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

interface Subscription {
  plan: string;
  status: string;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
}

interface CreditBalance {
  creditsRemaining: number;
  creditsUsed: number;
  creditsTotal: number;
}

interface TopupOption {
  credits: number;
  price: string;
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

const TOPUP_OPTIONS: TopupOption[] = [
  { credits: 50, price: '$5' },
  { credits: 100, price: '$10' },
  { credits: 250, price: '$25' },
  { credits: 500, price: '$50' },
];

function formatLimit(val: number | 'unlimited'): string {
  return val === 'unlimited' ? 'Unlimited' : val.toLocaleString();
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function formatDateShort(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function daysUntil(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const diff = new Date(dateStr).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

export default function BillingPage() {
  const { activeWorkspace } = useAuth();
  const currentPlan = (activeWorkspace?.plan ?? 'starter') as Plan['id'];

  const [loading, setLoading] = useState(false);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [fetching, setFetching] = useState(true);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // Credit state
  const [credits, setCredits] = useState<CreditBalance | null>(null);
  const [topupLoading, setTopupLoading] = useState(false);
  const [topupDialogOpen, setTopupDialogOpen] = useState(false);
  const [selectedTopup, setSelectedTopup] = useState<TopupOption | null>(null);

  const fetchData = useCallback(async () => {
    if (!activeWorkspace?.account_id) return;
    setFetching(true);
    try {
      // Fetch subscription
      let planFromWs = currentPlan;
      const subRes = await fetch('/api/workspaces');
      if (subRes.ok) {
        const data = await subRes.json();
        const ws = data.workspaces?.find(
          (w: { account_id: string }) => w.account_id === activeWorkspace.account_id,
        );
        if (ws) {
          planFromWs = (ws.plan ?? 'starter') as Plan['id'];
          setSubscription({
            plan: ws.plan ?? 'starter',
            status: ws.subscription_status ?? 'active',
            current_period_start: null,
            current_period_end: null,
            cancel_at_period_end: false,
          });
        }
      }

      // Fetch credit balance
      const creditRes = await fetch('/api/ai/config');
      if (creditRes.ok) {
        const data = await creditRes.json();
        if (data.credits) {
          const planLimit = PLANS.find((p) => p.id === planFromWs)?.aiCredits ?? 100;
          setCredits({
            creditsRemaining: data.credits.creditsRemaining ?? 0,
            creditsUsed: data.credits.creditsUsed ?? 0,
            creditsTotal: typeof planLimit === 'number' ? planLimit : 999999,
          });
        }
      }
    } catch {
      // non-critical
    } finally {
      setFetching(false);
    }
  }, [activeWorkspace?.account_id]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

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
      if (data.current_period_end) {
        setSubscription((prev) => prev ? {
          ...prev,
          plan: planId,
          status: 'active',
          current_period_end: data.current_period_end,
          cancel_at_period_end: false,
        } : prev);
      }
      // Reload to refresh activeWorkspace credits
      window.location.reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update plan');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async () => {
    setActionLoading(true);
    try {
      const res = await fetch('/api/subscription/manage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to cancel');
      toast.success('Subscription will cancel at the end of the billing period');
      setSubscription((prev) => prev ? { ...prev, cancel_at_period_end: true } : prev);
      setCancelDialogOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to cancel');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReactivate = async () => {
    setActionLoading(true);
    try {
      const res = await fetch('/api/subscription/manage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reactivate' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to reactivate');
      toast.success('Subscription reactivated');
      setSubscription((prev) => prev ? { ...prev, cancel_at_period_end: false } : prev);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to reactivate');
    } finally {
      setActionLoading(false);
    }
  };

  const handleTopup = async () => {
    if (!selectedTopup) return;
    setTopupLoading(true);
    try {
      const res = await fetch('/api/subscription/topup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: selectedTopup.credits }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to add credits');
      toast.success(`Added ${selectedTopup.credits} credits`);
      setCredits((prev) => prev ? {
        ...prev,
        creditsRemaining: data.credits_remaining,
      } : prev);
      setTopupDialogOpen(false);
      setSelectedTopup(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add credits');
    } finally {
      setTopupLoading(false);
    }
  };

  const isExpired = subscription?.status && !['active', 'trial'].includes(subscription.status);
  const activePlan = PLANS.find((p) => p.id === currentPlan) ?? PLANS[0];
  const isCancelling = subscription?.cancel_at_period_end ?? false;
  const daysLeft = daysUntil(subscription?.current_period_end);
  const creditPercent = credits
    ? Math.min(100, Math.round((credits.creditsRemaining / credits.creditsTotal) * 100))
    : 0;
  const creditsExhausted = credits ? credits.creditsRemaining <= 0 : false;

  return (
    <div className="mx-auto max-w-3xl py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-foreground">Billing & Plan</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage your subscription, view plan details, and upgrade.
        </p>
      </div>

      {/* Subscription status banners */}
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

      {isCancelling && !isExpired && (
        <div className="mb-6 flex items-center gap-3 rounded-lg border border-amber-500/20 bg-amber-500/10 px-4 py-3">
          <AlertTriangle className="h-5 w-5 shrink-0 text-amber-500" />
          <div>
            <p className="text-sm font-medium text-amber-600">
              Your subscription is set to cancel
            </p>
            <p className="text-xs text-amber-600/80">
              You'll retain access until {formatDateShort(subscription?.current_period_end)}.
              {' '}
              <button onClick={handleReactivate} className="underline font-medium hover:text-amber-700">
                Reactivate
              </button>
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
          <div className="flex items-start justify-between">
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
                {isExpired ? 'Expired' : subscription?.status === 'trial' ? 'Trial' : 'Active'}
              </p>
            </div>
          </div>

          {/* Billing period */}
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="rounded-md border border-border p-3">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Calendar className="h-3 w-3" />
                Current period started
              </div>
              <p className="mt-1 text-sm font-medium text-foreground">
                {formatDate(subscription?.current_period_start)}
              </p>
            </div>
            <div className="rounded-md border border-border p-3">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Calendar className="h-3 w-3" />
                {isCancelling ? 'Access expires' : 'Next billing date'}
              </div>
              <p className="mt-1 text-sm font-medium text-foreground">
                {formatDate(subscription?.current_period_end)}
              </p>
              {daysLeft !== null && !isExpired && (
                <p className="text-xs text-muted-foreground">
                  {daysLeft} {daysLeft === 1 ? 'day' : 'days'} remaining
                </p>
              )}
            </div>
          </div>

          {/* Plan limits */}
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

          {/* Manage subscription */}
          <div className="mt-6 flex items-center gap-3">
            {isCancelling ? (
              <Button
                variant="outline"
                size="sm"
                onClick={handleReactivate}
                disabled={actionLoading}
              >
                {actionLoading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <RotateCcw className="mr-2 h-4 w-4" />
                )}
                Reactivate subscription
              </Button>
            ) : currentPlan !== 'starter' ? (
              <Button
                variant="outline"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={() => setCancelDialogOpen(true)}
                disabled={actionLoading}
              >
                <XCircle className="mr-2 h-4 w-4" />
                Cancel subscription
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {/* AI Credits balance + top-up */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Coins className="h-4 w-4 text-primary" /> AI Credits
          </CardTitle>
          <CardDescription>
            Credits are used for AI-powered replies and message analysis. They reset monthly with your plan.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {credits ? (
            <>
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-3xl font-bold text-foreground">
                    {credits.creditsRemaining.toLocaleString()}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    of {credits.creditsTotal.toLocaleString()} credits remaining
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-muted-foreground">
                    {credits.creditsUsed.toLocaleString()} used this period
                  </p>
                </div>
              </div>

              {/* Usage bar */}
              <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-secondary">
                <div
                  className={cn(
                    'h-full rounded-full transition-all',
                    creditsExhausted
                      ? 'bg-destructive'
                      : creditPercent < 20
                        ? 'bg-amber-500'
                        : 'bg-primary',
                  )}
                  style={{ width: `${100 - creditPercent}%` }}
                />
              </div>

              {creditsExhausted && (
                <p className="mt-2 text-xs text-destructive">
                  No credits remaining. AI features are paused until you top up or your plan renews.
                </p>
              )}

              {/* Top-up button */}
              <div className="mt-6">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setTopupDialogOpen(true)}
                >
                  <Plus className="mr-1.5 h-4 w-4" />
                  Top up credits
                </Button>
              </div>
            </>
          ) : (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading credit balance...
            </div>
          )}
        </CardContent>
      </Card>

      {/* Top-up dialog */}
      <Dialog open={topupDialogOpen} onOpenChange={setTopupDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Top up AI credits</DialogTitle>
            <DialogDescription>
              Add credits to continue using AI features. Credits are one-time purchases that
              don't expire until used. No monthly reset.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-3 py-4">
            {TOPUP_OPTIONS.map((opt) => (
              <button
                key={opt.credits}
                onClick={() => setSelectedTopup(opt)}
                className={cn(
                  'flex flex-col items-center rounded-lg border p-4 transition-all hover:border-primary',
                  selectedTopup?.credits === opt.credits
                    ? 'border-primary bg-primary/5'
                    : 'border-border',
                )}
              >
                <span className="text-2xl font-bold text-foreground">{opt.credits}</span>
                <span className="text-sm text-muted-foreground">credits</span>
                <span className="mt-1 text-lg font-semibold text-primary">{opt.price}</span>
              </button>
            ))}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => { setTopupDialogOpen(false); setSelectedTopup(null); }}>
              Cancel
            </Button>
            <Button
              onClick={handleTopup}
              disabled={!selectedTopup || topupLoading}
            >
              {topupLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Zap className="mr-2 h-4 w-4" />
              )}
              {selectedTopup ? `Add ${selectedTopup.credits} credits` : 'Select an amount'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel confirmation dialog */}
      <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel subscription?</DialogTitle>
            <DialogDescription>
              Your subscription will remain active until {formatDateShort(subscription?.current_period_end)}.
              After that, your workspace will be downgraded to the Starter plan and
              sending features will be disabled.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCancelDialogOpen(false)}>
              Keep subscription
            </Button>
            <Button
              variant="destructive"
              onClick={handleCancel}
              disabled={actionLoading}
            >
              {actionLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Cancel subscription
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Upgrade section */}
      <h2 className="mb-4 text-lg font-semibold text-foreground">
        {currentPlan === 'starter' ? 'Upgrade Plan' : 'Change Plan'}
      </h2>
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
                    {currentPlan === 'starter' ? 'Upgrade' : plan.id === 'starter' ? 'Downgrade' : 'Switch'}
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
