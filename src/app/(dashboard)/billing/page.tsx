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
  Users,
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
  ai_credit_check_exempt: boolean;
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

function formatPrice(
  plan: Plan,
  period: 'monthly' | 'annual' = 'monthly'
): string {
  if (plan.price_kes === 0) return 'Custom';
  if (period === 'annual') {
    const annual = Math.round(plan.price_kes * 12 * (1 - 0.18));
    return `KES ${annual.toLocaleString()}/yr`;
  }
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
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

const KES_PER_CREDIT = 10;

/** Feature rows for the comparison table */
const FEATURE_ROWS = [
  {
    key: 'team',
    label: 'Team members',
    icon: null,
    getValue: (f: PlanFeatures) => formatLimit(f.max_team_members),
  },
  {
    key: 'contacts',
    label: 'Contacts',
    icon: null,
    getValue: (f: PlanFeatures) => formatLimit(f.max_contacts),
  },
  {
    key: 'whatsapp',
    label: 'WhatsApp numbers',
    icon: null,
    getValue: (f: PlanFeatures) => formatLimit(f.max_whatsapp_numbers),
  },
  {
    key: 'broadcasts',
    label: 'Broadcasts/mo',
    icon: null,
    getValue: (f: PlanFeatures) => formatLimit(f.max_broadcasts_per_month),
  },
  {
    key: 'automations',
    label: 'Automations',
    icon: Workflow,
    getValue: (f: PlanFeatures) => formatLimit(f.max_automations),
  },
  {
    key: 'flows',
    label: 'Conversational flows',
    icon: MessageSquare,
    getValue: (f: PlanFeatures) => formatLimit(f.max_flows),
  },
  {
    key: 'pipelines',
    label: 'Deal pipelines',
    icon: null,
    getValue: (f: PlanFeatures) => formatLimit(f.max_pipelines),
  },
  {
    key: 'deals',
    label: 'Deals/pipeline',
    icon: null,
    getValue: (f: PlanFeatures) => formatLimit(f.max_deals_per_pipeline),
  },
  {
    key: 'ai_credits',
    label: 'AI credits/mo',
    icon: Coins,
    getValue: (f: PlanFeatures) => formatLimit(f.ai_credits_per_month),
  },
  {
    key: 'ai_conversations',
    label: 'AI conversations/mo',
    icon: Bot,
    getValue: (f: PlanFeatures) => formatLimit(f.ai_conversations_per_month),
  },
  {
    key: 'ai_assistant',
    label: 'AI assistant',
    icon: Bot,
    getValue: (f: PlanFeatures) => f.has_ai_assistant,
  },
  {
    key: 'knowledge',
    label: 'Knowledge base',
    icon: null,
    getValue: (f: PlanFeatures) => f.has_knowledge_base,
  },
  {
    key: 'analytics',
    label: 'Analytics',
    icon: BarChart3,
    getValue: (f: PlanFeatures) => f.has_analytics,
  },
  {
    key: 'priority_support',
    label: 'Priority support',
    icon: Headphones,
    getValue: (f: PlanFeatures) => f.has_priority_support,
  },
  {
    key: 'integrations',
    label: 'Custom integrations',
    icon: Plug,
    getValue: (f: PlanFeatures) => f.has_custom_integrations,
  },
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
  const [downgradeDialogOpen, setDowngradeDialogOpen] = useState(false);
  const [downgradeTarget, setDowngradeTarget] = useState<string | null>(null);
  const [billingHistory, setBillingHistory] = useState<
    Array<{
      id: string;
      event_type: string;
      description: string;
      amount_kes: number;
      credits_delta: number;
      created_at: string;
    }>
  >([]);
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'annual'>(
    'monthly'
  );
  const ANNUAL_DISCOUNT = 0.18;
  const [seatData, setSeatData] = useState<{
    included_seats: number;
    extra_seats: number;
    total_seats: number;
    seat_price_kes: number;
    current_members: number;
  } | null>(null);

  const fetchData = useCallback(async () => {
    if (!activeWorkspace?.account_id) return;
    setFetching(true);
    setPlansError(false);
    try {
      const [
        plansRes,
        subRes,
        creditRes,
        subscriptionRes,
        historyRes,
        seatsRes,
      ] = await Promise.all([
        fetch('/api/plans'),
        fetch('/api/workspaces'),
        fetch('/api/ai/config'),
        fetch('/api/subscription/manage'),
        fetch('/api/subscription/history'),
        fetch('/api/subscription/seats'),
      ]);

      const plansData = plansRes.ok ? await plansRes.json() : null;
      const subData = subRes.ok ? await subRes.json() : null;
      const creditData = creditRes.ok ? await creditRes.json() : null;
      const subscriptionDetails = subscriptionRes.ok
        ? await subscriptionRes.json()
        : null;
      const historyData = historyRes.ok ? await historyRes.json() : null;
      const seatsData = seatsRes.ok ? await seatsRes.json() : null;

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
        status:
          nestedSettings?.subscription_status ?? subDetails?.status ?? 'active',
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

      if (historyData?.history) {
        setBillingHistory(historyData.history);
      }

      if (seatsData) {
        setSeatData({
          included_seats: seatsData.included_seats ?? 1,
          extra_seats: seatsData.extra_seats ?? 0,
          total_seats: seatsData.total_seats ?? 1,
          seat_price_kes: seatsData.seat_price_kes ?? 750,
          current_members: seatsData.current_members ?? 0,
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
      // Optimistic state update — no page reload
      setSubscription((prev) =>
        prev
          ? {
              ...prev,
              plan: planId,
              status: 'active',
              current_period_end:
                data.current_period_end ?? prev.current_period_end,
              cancel_at_period_end: false,
            }
          : prev
      );
      // Refetch to get fresh plan features + credit allocation
      void fetchData();
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
      toast.success(
        'Subscription will cancel at the end of the billing period'
      );
      setSubscription((prev) =>
        prev ? { ...prev, cancel_at_period_end: true } : prev
      );
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
      setSubscription((prev) =>
        prev ? { ...prev, cancel_at_period_end: false } : prev
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to reactivate');
    } finally {
      setActionLoading(false);
    }
  };

  const handleTopup = async () => {
    const creditsToBuy =
      selectedCredits ??
      Math.floor((parseInt(customAmount) || 0) / KES_PER_CREDIT);
    if (creditsToBuy <= 0) return;

    setTopupLoading(true);
    try {
      const res = await fetch('/api/subscription/topup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credits: creditsToBuy }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to add credits');
      toast.success(`Added ${creditsToBuy} credits`);
      setCredits((prev) =>
        prev
          ? {
              ...prev,
              creditsRemaining: data.credits_remaining,
            }
          : prev
      );
      setTopupDialogOpen(false);
      setSelectedCredits(null);
      setCustomAmount('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add credits');
    } finally {
      setTopupLoading(false);
    }
  };

  const topupCredits =
    selectedCredits ??
    Math.floor((parseInt(customAmount) || 0) / KES_PER_CREDIT);
  const topupKes = selectedCredits
    ? selectedCredits * KES_PER_CREDIT
    : parseInt(customAmount) || 0;

  const isExpired =
    subscription?.status && !['active', 'trial'].includes(subscription.status);
  const activePlan = plans.find((p) => p.id === currentPlan) ?? plans[0];
  const isCancelling = subscription?.cancel_at_period_end ?? false;
  const daysLeft = daysUntil(subscription?.current_period_end);
  const creditPercent =
    credits && credits.creditsTotal > 0 && credits.creditsRemaining <= credits.creditsTotal
      ? Math.min(
          100,
          Math.round((credits.creditsRemaining / credits.creditsTotal) * 100)
        )
      : credits && credits.creditsRemaining > 0 && credits.creditsTotal > 0
        ? 100
        : 0;
  const creditsExhausted = credits ? credits.creditsRemaining <= 0 : false;

  // Plan tier order for downgrade detection
  const PLAN_ORDER = ['starter', 'business', 'growth', 'enterprise'];
  const currentTier = PLAN_ORDER.indexOf(currentPlan);
  function getFeaturesLost(targetPlan: string): string[] {
    const target = plans.find((p) => p.id === targetPlan);
    if (!target?.features || !activePlan?.features) return [];
    const lost: string[] = [];
    const tf = target.features;
    const af = activePlan.features;
    if (af.has_ai_assistant && !tf.has_ai_assistant) lost.push('AI assistant');
    if (af.has_knowledge_base && !tf.has_knowledge_base)
      lost.push('Knowledge base');
    if (af.has_analytics && !tf.has_analytics) lost.push('Analytics');
    if (af.has_priority_support && !tf.has_priority_support)
      lost.push('Priority support');
    if (af.max_team_members > tf.max_team_members)
      lost.push(
        `Team members (${af.max_team_members} → ${tf.max_team_members})`
      );
    if (af.max_contacts > tf.max_contacts)
      lost.push(
        `Contacts (${af.max_contacts.toLocaleString()} → ${tf.max_contacts.toLocaleString()})`
      );
    if (af.ai_credits_per_month > tf.ai_credits_per_month)
      lost.push(
        `AI credits (${af.ai_credits_per_month.toLocaleString()} → ${tf.ai_credits_per_month.toLocaleString()}/mo)`
      );
    if (af.max_broadcasts_per_month > tf.max_broadcasts_per_month)
      lost.push(
        `Broadcasts (${af.max_broadcasts_per_month.toLocaleString()} → ${tf.max_broadcasts_per_month.toLocaleString()}/mo)`
      );
    return lost;
  }

  if (fetching) {
    return (
      <div className="mx-auto max-w-5xl py-8">
        <div className="flex items-center justify-center py-20">
          <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
        </div>
      </div>
    );
  }

  if (plansError) {
    return (
      <div className="mx-auto max-w-5xl py-8">
        <div className="mb-8">
          <h1 className="text-foreground text-2xl font-semibold">
            Billing & Plan
          </h1>
        </div>
        <Card>
          <CardContent className="py-10 text-center">
            <AlertTriangle className="mx-auto mb-4 h-8 w-8 text-amber-500" />
            <p className="text-muted-foreground text-sm">
              Unable to load plan information. Please try again later.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={() => void fetchData()}
            >
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
        <h1 className="text-foreground text-2xl font-semibold">
          Billing & Plan
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Manage your subscription and view plan details. Meta WhatsApp charges
          are billed separately.
        </p>
      </div>

      {isExpired && (
        <div className="border-destructive/20 bg-destructive/10 mb-6 flex items-center gap-3 rounded-lg border px-4 py-3">
          <AlertTriangle className="text-destructive h-5 w-5 shrink-0" />
          <div>
            <p className="text-destructive text-sm font-medium">
              Your subscription has expired
            </p>
            <p className="text-destructive/80 text-xs">
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
              You'll retain access until{' '}
              {formatDateShort(subscription?.current_period_end)}.{' '}
              <button
                onClick={handleReactivate}
                className="font-medium underline hover:text-amber-700"
              >
                Reactivate
              </button>
            </p>
          </div>
        </div>
      )}

      {/* Current plan card */}
      <Card className="mb-8">
        <CardHeader className="px-4 py-3 sm:px-6 sm:py-6">
          <CardTitle className="flex items-center gap-2 text-sm sm:text-base">
            <CreditCard className="text-primary h-4 w-4" /> Current Plan
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 py-3 sm:px-6 sm:py-6">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-foreground text-xl font-bold sm:text-2xl">
                {activePlan?.name ?? currentPlan}
              </p>
              <p className="text-muted-foreground text-xs sm:text-sm">
                {activePlan ? formatPrice(activePlan) : ''}
              </p>
            </div>
            <div className="text-right">
              <p className="text-muted-foreground text-xs sm:text-sm">Status</p>
              <p
                className={cn(
                  'text-xs font-medium sm:text-sm',
                  isExpired ? 'text-destructive' : 'text-green-600'
                )}
              >
                {isExpired
                  ? 'Expired'
                  : subscription?.status === 'trial'
                    ? 'Trial'
                    : 'Active'}
              </p>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-4">
            <div className="border-border rounded-md border p-2 sm:p-3">
              <div className="text-muted-foreground flex items-center gap-1.5 text-[10px] sm:text-xs">
                <Calendar className="h-3 w-3" /> Current period started
              </div>
              <p className="text-foreground mt-1 text-xs font-medium sm:text-sm">
                {formatDate(subscription?.current_period_start)}
              </p>
            </div>
            <div className="border-border rounded-md border p-2 sm:p-3">
              <div className="text-muted-foreground flex items-center gap-1.5 text-[10px] sm:text-xs">
                <Calendar className="h-3 w-3" />
                {isCancelling ? 'Access expires' : 'Next billing date'}
              </div>
              <p className="text-foreground mt-1 text-xs font-medium sm:text-sm">
                {formatDate(subscription?.current_period_end)}
              </p>
              {daysLeft !== null && !isExpired && (
                <p className="text-muted-foreground text-[10px] sm:text-xs">
                  {daysLeft <= 0
                    ? 'Expired today'
                    : `${daysLeft} ${daysLeft === 1 ? 'day' : 'days'} remaining`}
                </p>
              )}
            </div>
          </div>

          {activePlan?.features && (
            <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 sm:grid-cols-4">
              <div className="border-border rounded-md border p-2 sm:p-3">
                <p className="text-muted-foreground text-[10px] sm:text-xs">Contacts</p>
                <p className="text-foreground text-base font-bold sm:text-lg">
                  {formatLimit(activePlan.features.max_contacts)}
                </p>
              </div>
              <div className="border-border rounded-md border p-2 sm:p-3">
                <p className="text-muted-foreground text-[10px] sm:text-xs">Team members</p>
                <p className="text-foreground text-base font-bold sm:text-lg">
                  {formatLimit(activePlan.features.max_team_members)}
                </p>
              </div>
              <div className="border-border rounded-md border p-2 sm:p-3">
                <p className="text-muted-foreground text-[10px] sm:text-xs">Automations</p>
                <p className="text-foreground text-base font-bold sm:text-lg">
                  {formatLimit(activePlan.features.max_automations)}
                </p>
              </div>
              <div className="border-border rounded-md border p-2 sm:p-3">
                <p className="text-muted-foreground text-[10px] sm:text-xs">Pipelines</p>
                <p className="text-foreground text-base font-bold sm:text-lg">
                  {formatLimit(activePlan.features.max_pipelines)}
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Extra seat pricing */}
      {activePlan?.features && activePlan.features.max_team_members < 999 && (
        <div className="border-border bg-muted/50 mb-6 rounded-lg border px-4 py-3">
          <p className="text-muted-foreground text-sm">
            Need more seats? Additional team members are KES 750/mo each.
            Current plan includes {activePlan.features.max_team_members} seat
            {activePlan.features.max_team_members !== 1 ? 's' : ''}.
          </p>
        </div>
      )}

      {/* AI Credits */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Coins className="text-primary h-4 w-4" /> AI Credits
          </CardTitle>
          <CardDescription>
            Credits power AI replies. 1 credit = 5 simple replies. Purchase more
            anytime.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {credits ? (
            <>
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-foreground text-3xl font-bold">
                    {credits.creditsRemaining.toLocaleString()}
                  </p>
                  <p className="text-muted-foreground text-sm">
                    {credits.creditsTotal > 0
                      ? `${credits.creditsTotal.toLocaleString()} from plan + purchased`
                      : 'No plan allocation — purchase credits to continue'}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-muted-foreground text-sm">
                    {credits.creditsUsed.toLocaleString()} used this period
                  </p>
                </div>
              </div>

              <div className="bg-secondary mt-4 h-2 w-full overflow-hidden rounded-full">
                <div
                  className={cn(
                    'h-full rounded-full transition-all',
                    creditsExhausted
                      ? 'bg-destructive'
                      : creditPercent < 20
                        ? 'bg-amber-500'
                        : 'bg-primary'
                  )}
                  style={{ width: `${creditPercent}%` }}
                />
              </div>

              {creditsExhausted && (
                <p className="text-destructive mt-2 text-xs">
                  No credits remaining. AI features are paused until you top up
                  or your plan renews.
                </p>
              )}

              {!creditsExhausted &&
                creditPercent < 20 &&
                credits.creditsTotal > 0 && (
                  <p className="mt-2 text-xs text-amber-600">
                    Low on credits — {credits.creditsRemaining.toLocaleString()}{' '}
                    remaining. Top up to avoid AI interruptions.
                  </p>
                )}

              <div className="mt-6">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setTopupDialogOpen(true)}
                >
                  <Plus className="mr-1.5 h-4 w-4" /> Top up credits
                </Button>
              </div>
            </>
          ) : (
            <p className="text-muted-foreground text-sm">
              Credit data unavailable
            </p>
          )}
        </CardContent>
      </Card>

      {/* Extra seats */}
      {seatData && seatData.extra_seats > 0 && (
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="text-primary h-4 w-4" /> Extra Team Seats
            </CardTitle>
            <CardDescription>
              Additional team member seats beyond your plan limit.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-end justify-between">
              <div>
                <p className="text-foreground text-3xl font-bold">
                  {seatData.extra_seats}
                </p>
                <p className="text-muted-foreground text-sm">
                  extra seat{seatData.extra_seats !== 1 ? 's' : ''} at KES{' '}
                  {seatData.seat_price_kes.toLocaleString()}/mo each
                </p>
              </div>
              <div className="text-right">
                <p className="text-foreground text-sm font-medium">
                  KES{' '}
                  {(
                    seatData.extra_seats * seatData.seat_price_kes
                  ).toLocaleString()}
                  /mo
                </p>
                <p className="text-muted-foreground text-xs">
                  {seatData.current_members} of {seatData.total_seats} total
                  seats used
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Top-up dialog */}
      <Dialog open={topupDialogOpen} onOpenChange={setTopupDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Top up AI credits</DialogTitle>
            <DialogDescription>
              Add credits to continue using AI features. Credits never expire
              until used. 1 credit = KES {KES_PER_CREDIT}.
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
                onClick={() => {
                  setSelectedCredits(opt.credits);
                  setCustomAmount('');
                }}
                className={cn(
                  'hover:border-primary flex flex-col items-center rounded-lg border p-3 transition-all',
                  selectedCredits === opt.credits
                    ? 'border-primary bg-primary/5'
                    : 'border-border'
                )}
              >
                <span className="text-foreground text-xl font-bold">
                  {opt.credits}
                </span>
                <span className="text-muted-foreground text-xs">credits</span>
                <span className="text-primary mt-0.5 text-sm font-semibold">
                  KES {opt.kes.toLocaleString()}
                </span>
              </button>
            ))}
          </div>
          <div className="border-t pt-4">
            <p className="text-foreground mb-2 text-sm font-medium">
              Or enter custom amount
            </p>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <span className="text-muted-foreground absolute top-1/2 left-3 -translate-y-1/2 text-sm">
                  KES
                </span>
                <input
                  type="number"
                  min={KES_PER_CREDIT}
                  step={KES_PER_CREDIT}
                  placeholder="0"
                  value={customAmount}
                  onChange={(e) => {
                    setCustomAmount(e.target.value);
                    setSelectedCredits(null);
                  }}
                  className="border-border bg-background focus:ring-primary w-full rounded-md border py-2 pr-3 pl-10 text-sm focus:ring-2 focus:outline-none"
                />
              </div>
              <div className="border-border bg-muted text-muted-foreground flex items-center rounded-md border px-3 py-2 text-sm">
                {topupCredits} credits
              </div>
            </div>
            <p className="text-muted-foreground mt-1 text-xs">
              Minimum KES {KES_PER_CREDIT} (1 credit)
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                setTopupDialogOpen(false);
                setSelectedCredits(null);
                setCustomAmount('');
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleTopup}
              disabled={topupKes <= 0 || topupLoading}
            >
              {topupLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Zap className="mr-2 h-4 w-4" />
              )}
              {topupKes > 0
                ? `Pay KES ${topupKes.toLocaleString()} (${topupCredits} credits)`
                : 'Enter amount'}
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
              Your subscription will remain active until{' '}
              {formatDateShort(subscription?.current_period_end)}. After that,
              your workspace will be downgraded to Starter and sending features
              will be disabled.
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
              {actionLoading && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}{' '}
              Cancel subscription
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Downgrade confirmation dialog */}
      <Dialog open={downgradeDialogOpen} onOpenChange={setDowngradeDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Downgrade to {plans.find((p) => p.id === downgradeTarget)?.name}?
            </DialogTitle>
            <DialogDescription>
              You will lose access to the following features immediately:
            </DialogDescription>
          </DialogHeader>
          {downgradeTarget && (
            <ul className="text-muted-foreground list-inside list-disc space-y-1 text-sm">
              {getFeaturesLost(downgradeTarget).map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          )}
          <p className="text-muted-foreground text-sm">
            Your purchased AI credits will be preserved but your monthly
            allocation will change.
          </p>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                setDowngradeDialogOpen(false);
                setDowngradeTarget(null);
              }}
            >
              Keep current plan
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setDowngradeDialogOpen(false);
                if (downgradeTarget) void handleUpgrade(downgradeTarget);
                setDowngradeTarget(null);
              }}
              disabled={loading}
            >
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{' '}
              Confirm downgrade
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Plan cards */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-foreground text-lg font-semibold">
          {currentPlan === 'starter' ? 'Upgrade Plan' : 'Change Plan'}
        </h2>
        <div className="flex items-center gap-2 text-sm">
          <span
            className={
              billingPeriod === 'monthly'
                ? 'text-foreground font-medium'
                : 'text-muted-foreground'
            }
          >
            Monthly
          </span>
          <button
            onClick={() =>
              setBillingPeriod((p) => (p === 'monthly' ? 'annual' : 'monthly'))
            }
            className={cn(
              'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border border-transparent transition-colors',
              billingPeriod === 'annual' ? 'bg-primary' : 'bg-muted'
            )}
          >
            <span
              className={cn(
                'bg-background pointer-events-none inline-block h-4 w-4 rounded-full shadow-sm transition-transform',
                billingPeriod === 'annual' ? 'translate-x-4' : 'translate-x-0'
              )}
            />
          </button>
          <span
            className={
              billingPeriod === 'annual'
                ? 'text-foreground font-medium'
                : 'text-muted-foreground'
            }
          >
            Annual{' '}
            <span className="text-primary text-xs font-medium">-18%</span>
          </span>
        </div>
      </div>
      <div className="relative isolate grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {plans.map((plan) => {
          const isCurrent = plan.id === currentPlan;
          return (
            <Card
              key={plan.id}
              className={cn(
                'relative flex flex-col',
                isCurrent && 'border-primary bg-primary/5',
                plan.recommended && !isCurrent && 'border-primary/50'
              )}
            >
              {plan.recommended && (
                <div className="bg-primary text-primary-foreground absolute -top-2.5 left-1/2 z-50 flex -translate-x-1/2 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium shadow-md sm:-top-3 sm:px-3 sm:py-1 sm:text-xs">
                  <Star className="h-2.5 w-2.5 sm:h-3 sm:w-3" /> Recommended
                </div>
              )}
              <CardHeader className="items-center px-3 py-3 text-center sm:px-6 sm:py-6">
                <CardTitle className="text-foreground text-sm sm:text-base">{plan.name}</CardTitle>
                <CardDescription className="text-foreground text-lg font-bold sm:text-2xl">
                  {formatPrice(plan, billingPeriod)}
                </CardDescription>
                {billingPeriod === 'annual' && plan.price_kes > 0 && (
                  <p className="text-primary hidden text-xs sm:block">
                    Save{' '}
                    {Math.round(plan.price_kes * 12 * 0.18).toLocaleString()}/yr
                  </p>
                )}
                {plan.features.ai_credits_per_month > 0 && (
                  <div className="mt-1 flex flex-col items-center gap-0.5 sm:mt-2">
                    <span className="text-primary text-xs font-semibold sm:text-sm">
                      {plan.features.ai_credits_per_month.toLocaleString()}{' '}
                      credits/mo
                    </span>
                    <span className="text-muted-foreground hidden text-[10px] sm:inline sm:text-xs">
                      ~
                      {plan.features.ai_conversations_per_month.toLocaleString()}{' '}
                      AI replies
                    </span>
                  </div>
                )}
                {plan.features.ai_credit_check_exempt &&
                  plan.id === 'starter' && (
                    <div className="mt-1 flex flex-col items-center gap-0.5 sm:mt-2">
                      <span className="text-primary text-xs font-semibold sm:text-sm">
                        No AI credit check
                      </span>
                      <span className="text-muted-foreground hidden text-[10px] sm:inline sm:text-xs">
                        First package
                      </span>
                    </div>
                  )}
              </CardHeader>
              <CardContent className="flex-1 px-3 py-3 sm:px-6 sm:py-6">
                <p className="text-muted-foreground mb-3 text-center text-xs sm:mb-4 sm:text-sm">
                  {plan.description}
                </p>
                <ul className="flex flex-col gap-1.5 text-xs sm:gap-2 sm:text-sm">
                  <li className="flex items-center gap-1.5 sm:gap-2">
                    <Check className="text-primary h-3 w-3 shrink-0 sm:h-4 sm:w-4" />
                    <span>
                      {formatLimit(plan.features?.max_team_members)} seat
                      {plan.features?.max_team_members !== 1 ? 's' : ''}
                    </span>
                  </li>
                  <li className="flex items-center gap-1.5 sm:gap-2">
                    <Check className="text-primary h-3 w-3 shrink-0 sm:h-4 sm:w-4" />
                    <span>
                      {formatLimit(plan.features?.max_contacts)} contacts
                    </span>
                  </li>
                  <li className="flex items-center gap-1.5 sm:gap-2">
                    <Check className="text-primary h-3 w-3 shrink-0 sm:h-4 sm:w-4" />
                    <span>
                      {formatLimit(plan.features?.max_automations)} automations
                    </span>
                  </li>
                  <li className="flex items-center gap-1.5 sm:gap-2">
                    <Check className="text-primary h-3 w-3 shrink-0 sm:h-4 sm:w-4" />
                    <span>{formatLimit(plan.features?.max_flows)} flows</span>
                  </li>
                  <li className="flex items-center gap-1.5 sm:gap-2">
                    <Check className="text-primary h-3 w-3 shrink-0 sm:h-4 sm:w-4" />
                    <span>
                      {formatLimit(plan.features?.max_pipelines)} pipeline
                      {plan.features?.max_pipelines !== 1 ? 's' : ''}
                    </span>
                  </li>
                  <li className="flex items-center gap-1.5 sm:gap-2">
                    {plan.features?.has_ai_assistant ? (
                      <Check className="text-primary h-3 w-3 shrink-0 sm:h-4 sm:w-4" />
                    ) : (
                      <Lock className="text-muted-foreground h-3 w-3 shrink-0 sm:h-4 sm:w-4" />
                    )}
                    <span
                      className={
                        plan.features?.has_ai_assistant
                          ? ''
                          : 'text-muted-foreground'
                      }
                    >
                      AI assistant
                    </span>
                  </li>
                  <li className="flex items-center gap-1.5 sm:gap-2">
                    {plan.features?.has_knowledge_base ? (
                      <Check className="text-primary h-3 w-3 shrink-0 sm:h-4 sm:w-4" />
                    ) : (
                      <Lock className="text-muted-foreground h-3 w-3 shrink-0 sm:h-4 sm:w-4" />
                    )}
                    <span
                      className={
                        plan.features?.has_knowledge_base
                          ? ''
                          : 'text-muted-foreground'
                      }
                    >
                      Knowledge base
                    </span>
                  </li>
                  <li className="flex items-center gap-1.5 sm:gap-2">
                    {plan.features?.has_analytics ? (
                      <Check className="text-primary h-3 w-3 shrink-0 sm:h-4 sm:w-4" />
                    ) : (
                      <Lock className="text-muted-foreground h-3 w-3 shrink-0 sm:h-4 sm:w-4" />
                    )}
                    <span
                      className={
                        plan.features?.has_analytics
                          ? ''
                          : 'text-muted-foreground'
                      }
                    >
                      Analytics
                    </span>
                  </li>
                  <li className="flex items-center gap-1.5 sm:gap-2">
                    {plan.features?.has_priority_support ? (
                      <Check className="text-primary h-3 w-3 shrink-0 sm:h-4 sm:w-4" />
                    ) : (
                      <Lock className="text-muted-foreground h-3 w-3 shrink-0 sm:h-4 sm:w-4" />
                    )}
                    <span
                      className={
                        plan.features?.has_priority_support
                          ? ''
                          : 'text-muted-foreground'
                      }
                    >
                      Priority support
                    </span>
                  </li>
                </ul>
              </CardContent>
              <CardFooter className="px-3 py-3 sm:px-6 sm:py-6">
                {isCurrent ? (
                  <Button variant="outline" disabled className="w-full">
                    Current Plan
                  </Button>
                ) : plan.id === 'enterprise' ? (
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() =>
                      (window.location.href = 'mailto:sales@wacrm.com')
                    }
                  >
                    {plan.cta} <ArrowUpRight className="ml-1.5 h-4 w-4" />
                  </Button>
                ) : PLAN_ORDER.indexOf(plan.id) < currentTier ? (
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => {
                      setDowngradeTarget(plan.id);
                      setDowngradeDialogOpen(true);
                    }}
                    disabled={loading}
                  >
                    Downgrade to {plan.name}
                  </Button>
                ) : (
                  <Button
                    onClick={() => void handleUpgrade(plan.id)}
                    disabled={loading}
                    variant={plan.recommended ? 'default' : 'outline'}
                    className="w-full"
                  >
                    {loading && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}{' '}
                    {plan.cta}
                  </Button>
                )}
              </CardFooter>
            </Card>
          );
        })}
      </div>

      {/* Billing History */}
      {billingHistory.length > 0 && (
        <>
          <h2 className="text-foreground mt-8 mb-4 text-lg font-semibold">
            Billing History
          </h2>
          <Card>
            <CardContent className="p-0">
              <div className="divide-border divide-y">
                {billingHistory.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-center justify-between px-4 py-3"
                  >
                    <div>
                      <p className="text-foreground text-sm font-medium">
                        {entry.description}
                      </p>
                      <p className="text-muted-foreground text-xs">
                        {new Date(entry.created_at).toLocaleDateString(
                          'en-US',
                          {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                          }
                        )}
                      </p>
                    </div>
                    <div className="text-right">
                      {entry.amount_kes > 0 && (
                        <p className="text-foreground text-sm font-medium">
                          KES {Number(entry.amount_kes).toLocaleString()}
                        </p>
                      )}
                      {entry.credits_delta > 0 && (
                        <p className="text-primary text-xs">
                          +{Number(entry.credits_delta).toLocaleString()}{' '}
                          credits
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* Subscription management - subtle footer action */}
      {(isCancelling || currentPlan !== 'starter') && (
        <div className="mt-8 border-t pt-6">
          {isCancelling ? (
            <button
              onClick={handleReactivate}
              disabled={actionLoading}
              className="text-muted-foreground hover:text-foreground flex items-center gap-2 text-sm transition-colors"
            >
              {actionLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RotateCcw className="h-4 w-4" />
              )}
              Reactivate subscription
            </button>
          ) : (
            <button
              onClick={() => setCancelDialogOpen(true)}
              disabled={actionLoading}
              className="text-muted-foreground hover:text-destructive flex items-center gap-2 text-sm transition-colors"
            >
              <XCircle className="h-4 w-4" /> Cancel subscription
            </button>
          )}
        </div>
      )}
    </div>
  );
}
