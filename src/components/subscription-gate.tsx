"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Check, Loader2, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface PlanFeatures {
  max_contacts: number;
  max_team_members: number;
  max_automations: number;
  max_flows: number;
  max_pipelines: number;
  ai_credits_per_month: number;
  price_kes: number;
}

interface Plan {
  id: string;
  name: string;
  description: string;
  cta: string;
  recommended?: boolean;
  price_kes: number;
  features: PlanFeatures;
}

interface SubscriptionGateProps {
  children: React.ReactNode;
}

/**
 * Gates the dashboard based on subscription status.
 *
 * - WhatsApp configured + no active subscription → forced modal (blocks UI)
 * - No WhatsApp + no subscription → banner (not blocking)
 * - Active subscription → renders children normally
 */
export function SubscriptionGate({ children }: SubscriptionGateProps) {
  const { activeWorkspace } = useAuth();
  const [whatsappChecked, setWhatsappChecked] = useState(false);
  const [whatsappConfigured, setWhatsappConfigured] = useState(false);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [upgrading, setUpgrading] = useState(false);

  const subscriptionStatus = activeWorkspace?.subscription_status ?? "active";
  const isActive = ["active", "trial"].includes(subscriptionStatus);
  const plan = activeWorkspace?.plan ?? "starter";

  // Check WhatsApp config
  useEffect(() => {
    fetch("/api/whatsapp/config")
      .then((r) => r.json())
      .then((data) => {
        setWhatsappConfigured(data.connected === true);
        setWhatsappChecked(true);
      })
      .catch(() => {
        setWhatsappConfigured(false);
        setWhatsappChecked(true);
      });
  }, []);

  // Fetch plans when modal needs to show
  const shouldShowModal = whatsappChecked && whatsappConfigured && !isActive;

  useEffect(() => {
    if (shouldShowModal && plans.length === 0) {
      fetch("/api/plans")
        .then((r) => r.json())
        .then((data) => setPlans(data.plans ?? []))
        .catch(() => {});
    }
  }, [shouldShowModal, plans.length]);

  const handleUpgrade = useCallback(async () => {
    if (!selectedPlan) return;
    setUpgrading(true);
    try {
      const res = await fetch("/api/workspaces/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: selectedPlan }),
      });
      if (res.ok) {
        window.location.reload();
      }
    } finally {
      setUpgrading(false);
    }
  }, [selectedPlan]);

  // Still checking — don't render anything yet
  if (!whatsappChecked) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  // WhatsApp configured but subscription not active — forced modal
  if (whatsappConfigured && !isActive) {
    return (
      <>
        {children}
        <Dialog open={true} onOpenChange={() => {}}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="text-xl">Subscribe to continue</DialogTitle>
              <DialogDescription>
                Your WhatsApp is connected. Choose a plan to start sending and receiving messages.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-3 sm:grid-cols-2 py-2">
              {plans
                .filter((p) => p.id !== "enterprise")
                .map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setSelectedPlan(p.id)}
                    className={cn(
                      "relative flex flex-col items-start rounded-lg border p-4 text-left transition-all hover:border-primary",
                      selectedPlan === p.id
                        ? "border-primary bg-primary/5"
                        : "border-border",
                      p.recommended && "border-primary/50",
                    )}
                  >
                    {p.recommended && (
                      <span className="absolute -top-2.5 right-3 rounded-full bg-primary px-2 py-0.5 text-[10px] font-medium text-primary-foreground flex items-center gap-0.5">
                        <Star className="h-2.5 w-2.5" /> Best value
                      </span>
                    )}
                    <p className="font-semibold text-foreground">{p.name}</p>
                    <p className="text-lg font-bold text-primary">
                      KES {p.price_kes.toLocaleString()}/mo
                    </p>
                    <ul className="mt-2 flex flex-col gap-1 text-xs text-muted-foreground">
                      <li className="flex items-center gap-1.5">
                        <Check className="h-3 w-3 text-primary" />
                        {p.features?.max_team_members} seat{p.features?.max_team_members !== 1 ? "s" : ""}
                      </li>
                      <li className="flex items-center gap-1.5">
                        <Check className="h-3 w-3 text-primary" />
                        {p.features?.max_contacts?.toLocaleString()} contacts
                      </li>
                      <li className="flex items-center gap-1.5">
                        <Check className="h-3 w-3 text-primary" />
                        {p.features?.max_automations} automations
                      </li>
                      <li className="flex items-center gap-1.5">
                        <Check className="h-3 w-3 text-primary" />
                        {p.features?.ai_credits_per_month} AI credits/mo
                      </li>
                    </ul>
                  </button>
                ))}
            </div>

            <DialogFooter>
              <Button
                onClick={handleUpgrade}
                disabled={!selectedPlan || upgrading}
                className="w-full"
              >
                {upgrading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                {selectedPlan
                  ? `Subscribe to ${plans.find((p) => p.id === selectedPlan)?.name}`
                  : "Select a plan"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  // No WhatsApp or active subscription — render normally
  return <>{children}</>;
}
