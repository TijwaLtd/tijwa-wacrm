'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  Loader2,
  Check,
  X,
  CreditCard,
  ArrowUpRight,
  Calendar,
  AlertTriangle,
  XCircle,
  RotateCcw,
  Zap,
  Plus,
  Coins,
  Star,
  Lock,
  MessageSquare,
  Bot,
  Workflow,
  BarChart3,
  Headphones,
  Plug,
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
import { useAuth } from '@/hooks/use-auth';
import { cn } from '@/lib/utils';

interface PlanFeatures {
  max_contacts: number;
  max_team_members: number;
  max_broadcasts_per_month: number;
  max_automations: number;
  max_flows: number;
  max_pipelines: number;
  max_deals_per_pipeline: number;
  ai_replies_per_month: number;
  ai_credits_per_month: number;
  ai_conversations_per_month: number;
  max_whatsapp_numbers: number;
  has_ai_assistant: boolean;
  has_knowledge_base: boolean;
  has_analytics: boolean;
  has_priority_support: boolean;
  has_custom_integrations: boolean;
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

function formatPrice(plan: Plan): string {
  if (plan.price_kes === 0) return 'Free';
  return `KES ${plan.price_kes.toLocaleString()}/mo`;
}

function formatLimit(val: number | undefined | null): string {
  if (val == null || val >= 999999) return 'Unlimited';
  return val.toLocaleString();
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

const KES_PER_CREDIT = 10;

/** Feature rows for the comparison table */
const FEATURE_ROWS = [
  { key: 'team', label: 'Team members', icon: null, getValue: (f: PlanFeatures) => formatLimit(f.max_team_members) },
  { key: 'contacts', label: 'Contacts', icon: null, getValue: (f: PlanFeatures) => formatLimit(f.max_contacts) },
  { key: 'whatsapp', label: 'WhatsApp numbers', icon: null, getValue: (f: PlanFeatures) => formatLimit(f.max_whatsapp_numbers) },
  { key: 'broadcasts', label: 'Broadcasts/mo', icon: null, getValue: (f: PlanFeatures) => formatLimit(f.max_broadcasts_per_month) },
  { key: 'automations', label: 'Automations', icon: Workflow, getValue: (f: PlanFeatures) => formatLimit(f.max_automations) },
  { key: 'flows', label: 'Conversational flows', icon: MessageSquare, getValue: (f: PlanFeatures) => formatLimit(f.max_flows) },
  { key: 'pipelines', label: 'Deal pipelines', icon: null, getValue: (f: PlanFeatures) => formatLimit(f.max_pipelines) },
  { key: 'deals', label: 'Deals/pipeline', icon: null, getValue: (f: PlanFeatures) => formatLimit(f.max_deals_per_pipeline) },
  { key: 'ai_credits', label: 'AI credits/mo', icon: Coins, getValue: (f: PlanFeatures) => formatLimit(f.ai_credits_per_month) },
  { key: 'ai_conversations', label: 'AI conversations/mo', icon: Bot, getValue: (f: PlanFeatures) => formatLimit(f.ai_conversations_per_month) },
  { key: 'ai_assistant', label: 'AI assistant', icon: Bot, getValue: (f: PlanFeatures) => f.has_ai_assistant },
  { key: 'knowledge', label: 'Knowledge base', icon: null, getValue: (f: PlanFeatures) => f.has_knowledge_base },
  { key: 'analytics', label: 'Analytics', icon: BarChart3, getValue: (f: PlanFeatures) => f.has_analytics },
  { key: 'priority_support', label: 'Priority support', icon: Headphones, getValue: (f: PlanFeatures) => f.has_priority_support },
  { key: 'integrations', label: 'Custom integrations', icon: Plug, getValue: (f: PlanFeatures) => f.has_custom_integrations },
];

export default function BillingPage() {
  const { activeWorkspace } = useAuth();
  const currentPlan = (activeWorkspace?.plan ?? 'starter') as string;

  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(false);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [fetching, setFetching] = useState(true);
  const [plansError, setPlansError] = useState(false);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const [credits, setCredits] = useState<CreditBalance | null>(null);
  const [topupLoading, setTopupLoading] = useState(false);
  const [topupDialogOpen, setTopupDialogOpen] = useState(false);
  const [customAmount, setCustomAmount] = useState('');
  const [selectedCredits, setSelectedCredits] = useState<number | null>(null);

  const fetchData = useCallback(async () => {
    if (!activeWorkspace?.account_id) return;
    setFetching(true);
    setPlansError(false);
    try {
      const [plansRes, subRes, creditRes, subscriptionRes] = await Promise.all([
        fetch('/api/plans'),
        fetch('/api/workspaces'),
        fetch('/api/ai/config'),
        fetch('/api/subscription/manage'),
      ]);

      const plansData = plansRes.ok ? await plansRes.json() : null;
      const subData = subRes.ok ? await subRes.json() : null;
      const creditData = creditRes.ok ? await creditRes.json() : null;
      const subscriptionDetails = subscriptionRes.ok ? await subscriptionRes.json() : null;

      const dbPlans: Plan[] = plansData?.plans ?? [];
      if (dbPlans.length) {
        setPlans(dbPlans);
      } else {
        setPlansError(true);
      }

      const subDetails = subscriptionDetails?.subscription;
      const ws = subData?.workspaces?.[0];
      const nestedSettings = ws?.accounts?.tenant_settings;

      setSubscription({
        plan: nestedSettings?.plan ?? subDetails?.plan ?? 'starter',
        status: nestedSettings?.subscription_status ?? subDetails?.status ?? 'active',
        current_period_start: subDetails?.current_period_start ?? null,
        current_period_end: subDetails?.current_period_end ?? null,
        cancel_at_period_end: subDetails?.cancel_at_period_end ?? false,
      });

      if (creditData?.credits) {
        const activePlanDef = dbPlans.find((p) => p.id === currentPlan);
        setCredits({
          creditsRemaining: creditData.credits.creditsRemaining ?? 0,
          creditsUsed: creditData.credits.creditsUsed ?? 0,
          creditsTotal: activePlanDef?.features?.ai_credits_per_month ?? 0,
        });
      }
    } catch {
      setPlansError(true);
    } finally {
      setFetching(false);
    }
  }, [activeWorkspace?.account_id, currentPlan]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const handleUpgrade = async (planId: string) => {
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
    const creditsToBuy = selectedCredits ?? Math.floor((parseInt(customAmount) || 0) / KES_PER_CREDIT);
    if (creditsToBuy <= 0) return;

    setTopupLoading(true);
    try {
      const res = await fetch('/api/subscription/topup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: creditsToBuy }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to add credits');
      toast.success(`Added ${creditsToBuy} credits`);
      setCredits((prev) => prev ? {
        ...prev,
        creditsRemaining: data.credits_remaining,
      } : prev);
      setTopupDialogOpen(false);
      setSelectedCredits(null);
      setCustomAmount('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add credits');
    } finally {
      setTopupLoading(false);
    }
  };

  const topupCredits = selectedCredits ?? Math.floor((parseInt(customAmount) || 0) / KES_PER_CREDIT);
  const topupKes = selectedCredits ? selectedCredits * KES_PER_CREDIT : (parseInt(customAmount) || 0);

  const isExpired = subscription?.status && !['active', 'trial'].includes(subscription.status);
  const activePlan = plans.find((p) => p.id === currentPlan) ?? plans[0];
  const isCancelling = subscription?.cancel_at_period_end ?? false;
  const daysLeft = daysUntil(subscription?.current_period_end);
  const creditPercent = credits && credits.creditsTotal > 0
    ? Math.min(100, Math.round((credits.creditsRemaining / credits.creditsTotal) * 100))
    : 0;
  const creditsExhausted = credits ? credits.creditsRemaining <= 0 : false;

  if (fetching) {
    return (
      <div className="mx-auto max-w-5xl py-8">
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (plansError) {
    return (
      <div className="mx-auto max-w-5xl py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-foreground">Billing & Plan</h1>
        </div>
        <Card>
          <CardContent className="py-10 text-center">
            <AlertTriangle className="mx-auto mb-4 h-8 w-8 text-amber-500" />
            <p className="text-sm text-muted-foreground">
              Unable to load plan information. Please try again later.
            </p>
            <Button variant="outline" size="sm" className="mt-4" onClick={() => void fetchData()}>
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-foreground">Billing & Plan</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage your subscription and view plan details. Meta WhatsApp charges are billed separately.
        </p>
      </div>

      {isExpired && (
        <div className="mb-6 flex items-center gap-3 rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3">
          <AlertTriangle className="h-5 w-5 shrink-0 text-destructive" />
          <div>
            <p className="text-sm font-medium text-destructive">Your subscription has expired</p>
            <p className="text-xs text-destructive/80">Sending and team features are disabled. Renew to restore access.</p>
          </div>
        </div>
      )}

      {isCancelling && !isExpired && (
        <div className="mb-6 flex items-center gap-3 rounded-lg border border-amber-500/20 bg-amber-500/10 px-4 py-3">
          <AlertTriangle className="h-5 w-5 shrink-0 text-amber-500" />
          <div>
            <p className="text-sm font-medium text-amber-600">Your subscription is set to cancel</p>
            <p className="text-xs text-amber-600/80">
              You'll retain access until {formatDateShort(subscription?.current_period_end)}.{' '}
              <button onClick={handleReactivate} className="underline font-medium hover:text-amber-700">Reactivate</button>
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
              <p className="text-2xl font-bold text-foreground">{activePlan?.name ?? currentPlan}</p>
              <p className="text-sm text-muted-foreground">{activePlan ? formatPrice(activePlan) : ''}</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-muted-foreground">Status</p>
              <p className={cn('text-sm font-medium', isExpired ? 'text-destructive' : 'text-green-600')}>
                {isExpired ? 'Expired' : subscription?.status === 'trial' ? 'Trial' : 'Active'}
              </p>
            </div>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="rounded-md border border-border p-3">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Calendar className="h-3 w-3" /> Current period started
              </div>
              <p className="mt-1 text-sm font-medium text-foreground">{formatDate(subscription?.current_period_start)}</p>
            </div>
            <div className="rounded-md border border-border p-3">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Calendar className="h-3 w-3" />
                {isCancelling ? 'Access expires' : 'Next billing date'}
              </div>
              <p className="mt-1 text-sm font-medium text-foreground">{formatDate(subscription?.current_period_end)}</p>
              {daysLeft !== null && !isExpired && (
                <p className="text-xs text-muted-foreground">{daysLeft} {daysLeft === 1 ? 'day' : 'days'} remaining</p>
              )}
            </div>
          </div>

          {activePlan?.features && (
            <div className="mt-6 grid gap-4 sm:grid-cols-4">
              <div className="rounded-md border border-border p-3">
                <p className="text-xs text-muted-foreground">Contacts</p>
                <p className="text-lg font-bold text-foreground">{formatLimit(activePlan.features.max_contacts)}</p>
              </div>
              <div className="rounded-md border border-border p-3">
                <p className="text-xs text-muted-foreground">Team members</p>
                <p className="text-lg font-bold text-foreground">{formatLimit(activePlan.features.max_team_members)}</p>
              </div>
              <div className="rounded-md border border-border p-3">
                <p className="text-xs text-muted-foreground">Automations</p>
                <p className="text-lg font-bold text-foreground">{formatLimit(activePlan.features.max_automations)}</p>
              </div>
              <div className="rounded-md border border-border p-3">
                <p className="text-xs text-muted-foreground">Pipelines</p>
                <p className="text-lg font-bold text-foreground">{formatLimit(activePlan.features.max_pipelines)}</p>
              </div>
            </div>
          )}

          <div className="mt-6 flex items-center gap-3">
            {isCancelling ? (
              <Button variant="outline" size="sm" onClick={handleReactivate} disabled={actionLoading}>
                {actionLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RotateCcw className="mr-2 h-4 w-4" />}
                Reactivate subscription
              </Button>
            ) : currentPlan !== 'starter' ? (
              <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={() => setCancelDialogOpen(true)} disabled={actionLoading}>
                <XCircle className="mr-2 h-4 w-4" /> Cancel subscription
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {/* AI Credits */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Coins className="h-4 w-4 text-primary" /> AI Credits
          </CardTitle>
          <CardDescription>
            Credits power AI replies. 1 credit = 5 simple replies. Purchase more anytime.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {credits ? (
            <>
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-3xl font-bold text-foreground">{credits.creditsRemaining.toLocaleString()}</p>
                  <p className="text-sm text-muted-foreground">of {credits.creditsTotal.toLocaleString()} credits remaining</p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-muted-foreground">{credits.creditsUsed.toLocaleString()} used this period</p>
                </div>
              </div>

              <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-secondary">
                <div
                  className={cn(
                    'h-full rounded-full transition-all',
                    creditsExhausted ? 'bg-destructive' : creditPercent < 20 ? 'bg-amber-500' : 'bg-primary',
                  )}
                  style={{ width: `${100 - creditPercent}%` }}
                />
              </div>

              {creditsExhausted && (
                <p className="mt-2 text-xs text-destructive">
                  No credits remaining. AI features are paused until you top up or your plan renews.
                </p>
              )}

              <div className="mt-6">
                <Button variant="outline" size="sm" onClick={() => setTopupDialogOpen(true)}>
                  <Plus className="mr-1.5 h-4 w-4" /> Top up credits
                </Button>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Credit data unavailable</p>
          )}
        </CardContent>
      </Card>

      {/* Top-up dialog */}
      <Dialog open={topupDialogOpen} onOpenChange={setTopupDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Top up AI credits</DialogTitle>
            <DialogDescription>
              Add credits to continue using AI features. Credits never expire until used. 1 credit = KES {KES_PER_CREDIT}.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            {[
              { credits: 50, kes: 500 },
              { credits: 100, kes: 1000 },
              { credits: 250, kes: 2500 },
              { credits: 500, kes: 5000 },
            ].map((opt) => (
              <button
                key={opt.credits}
                onClick={() => { setSelectedCredits(opt.credits); setCustomAmount(''); }}
                className={cn(
                  'flex flex-col items-center rounded-lg border p-3 transition-all hover:border-primary',
                  selectedCredits === opt.credits ? 'border-primary bg-primary/5' : 'border-border',
                )}
              >
                <span className="text-xl font-bold text-foreground">{opt.credits}</span>
                <span className="text-xs text-muted-foreground">credits</span>
                <span className="mt-0.5 text-sm font-semibold text-primary">KES {opt.kes.toLocaleString()}</span>
              </button>
            ))}
          </div>
          <div className="border-t pt-4">
            <p className="mb-2 text-sm font-medium text-foreground">Or enter custom amount</p>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">KES</span>
                <input
                  type="number"
                  min={KES_PER_CREDIT}
                  step={KES_PER_CREDIT}
                  placeholder="0"
                  value={customAmount}
                  onChange={(e) => { setCustomAmount(e.target.value); setSelectedCredits(null); }}
                  className="w-full rounded-md border border-border bg-background pl-10 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div className="flex items-center rounded-md border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
                {topupCredits} credits
              </div>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Minimum KES {KES_PER_CREDIT} (1 credit)</p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setTopupDialogOpen(false); setSelectedCredits(null); setCustomAmount(''); }}>Cancel</Button>
            <Button onClick={handleTopup} disabled={topupKes <= 0 || topupLoading}>
              {topupLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Zap className="mr-2 h-4 w-4" />}
              {topupKes > 0 ? `Pay KES ${topupKes.toLocaleString()} (${topupCredits} credits)` : 'Enter amount'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel dialog */}
      <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel subscription?</DialogTitle>
            <DialogDescription>
              Your subscription will remain active until {formatDateShort(subscription?.current_period_end)}.
              After that, your workspace will be downgraded to Starter and sending features will be disabled.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCancelDialogOpen(false)}>Keep subscription</Button>
            <Button variant="destructive" onClick={handleCancel} disabled={actionLoading}>
              {actionLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Cancel subscription
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Plan cards */}
      <h2 className="mb-4 text-lg font-semibold text-foreground">
        {currentPlan === 'starter' ? 'Upgrade Plan' : 'Change Plan'}
      </h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {plans.map((plan) => {
          const isCurrent = plan.id === currentPlan;
          return (
            <Card
              key={plan.id}
              className={cn(
                'relative flex flex-col',
                isCurrent && 'border-primary bg-primary/5',
                plan.recommended && !isCurrent && 'border-primary/50',
              )}
            >
              {plan.recommended && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground flex items-center gap-1">
                  <Star className="h-3 w-3" /> Recommended
                </div>
              )}
              <CardHeader className="items-center text-center">
                <CardTitle className="text-foreground">{plan.name}</CardTitle>
                <CardDescription className="text-2xl font-bold text-foreground">{formatPrice(plan)}</CardDescription>
              </CardHeader>
              <CardContent className="flex-1">
                <p className="mb-4 text-center text-sm text-muted-foreground">{plan.description}</p>
                <ul className="flex flex-col gap-2 text-sm">
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 shrink-0 text-primary" />
                    <span>{formatLimit(plan.features?.max_team_members)} seat{plan.features?.max_team_members !== 1 ? 's' : ''}</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 shrink-0 text-primary" />
                    <span>{formatLimit(plan.features?.max_contacts)} contacts</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 shrink-0 text-primary" />
                    <span>{formatLimit(plan.features?.max_automations)} automations</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 shrink-0 text-primary" />
                    <span>{formatLimit(plan.features?.max_flows)} flows</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 shrink-0 text-primary" />
                    <span>{formatLimit(plan.features?.max_pipelines)} pipeline{plan.features?.max_pipelines !== 1 ? 's' : ''}</span>
                  </li>
                  <li className="flex items-center gap-2">
                    {plan.features?.has_ai_assistant ? (
                      <Check className="h-4 w-4 shrink-0 text-primary" />
                    ) : (
                      <Lock className="h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                    <span className={plan.features?.has_ai_assistant ? '' : 'text-muted-foreground'}>AI assistant</span>
                  </li>
                  <li className="flex items-center gap-2">
                    {plan.features?.has_knowledge_base ? (
                      <Check className="h-4 w-4 shrink-0 text-primary" />
                    ) : (
                      <Lock className="h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                    <span className={plan.features?.has_knowledge_base ? '' : 'text-muted-foreground'}>Knowledge base</span>
                  </li>
                  <li className="flex items-center gap-2">
                    {plan.features?.has_analytics ? (
                      <Check className="h-4 w-4 shrink-0 text-primary" />
                    ) : (
                      <Lock className="h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                    <span className={plan.features?.has_analytics ? '' : 'text-muted-foreground'}>Analytics</span>
                  </li>
                  <li className="flex items-center gap-2">
                    {plan.features?.has_priority_support ? (
                      <Check className="h-4 w-4 shrink-0 text-primary" />
                    ) : (
                      <Lock className="h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                    <span className={plan.features?.has_priority_support ? '' : 'text-muted-foreground'}>Priority support</span>
                  </li>
                </ul>
              </CardContent>
              <CardFooter>
                {isCurrent ? (
                  <Button variant="outline" disabled className="w-full">Current Plan</Button>
                ) : plan.id === 'enterprise' ? (
                  <Button variant="outline" className="w-full" onClick={() => window.location.href = 'mailto:sales@wacrm.com'}>
                    {plan.cta} <ArrowUpRight className="ml-1.5 h-4 w-4" />
                  </Button>
                ) : (
                  <Button onClick={() => void handleUpgrade(plan.id)} disabled={loading} variant={plan.recommended ? 'default' : 'outline'} className="w-full">
                    {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} {plan.cta}
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
