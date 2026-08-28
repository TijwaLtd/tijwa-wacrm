"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, Sparkles, Coins, Lock, ArrowUpRight, CheckCircle2, XCircle } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { canEditSettings } from "@/lib/auth/roles";
import { Button, buttonVariants } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { SettingsPanelHead } from "./settings-panel-head";
import { cn } from "@/lib/utils";
import type { AiProvider } from "@/lib/ai/types";
import { useTranslations } from "next-intl";

const AI_ENABLED_PLANS = new Set(["business", "growth", "enterprise"]);

const PROVIDER_LABEL: Record<AiProvider, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic (Claude)",
};

interface CreditBalance {
  creditsRemaining: number;
  creditsUsed: number;
  lastResetAt: string | null;
}

export function AiConfig() {
  const { accountId, accountRole, profileLoading, activeWorkspace } = useAuth();
  const canEdit = accountRole ? canEditSettings(accountRole) : false;
  const t = useTranslations("Settings.aiConfig");
  const currentPlan = activeWorkspace?.plan ?? "starter";
  const aiIncluded = AI_ENABLED_PLANS.has(currentPlan);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Follow-up settings (per-account)
  const [followUpEnabled, setFollowUpEnabled] = useState(true);
  const [followUpTimeout, setFollowUpTimeout] = useState(10);

  // Platform info (read-only)
  const [hasOpenaiKey, setHasOpenaiKey] = useState(false);
  const [hasAnthropicKey, setHasAnthropicKey] = useState(false);
  const [platformProvider, setPlatformProvider] = useState<AiProvider>("openai");
  const [platformModel, setPlatformModel] = useState("");
  const [platformAiEnabled, setPlatformAiEnabled] = useState(false);

  // Credit balance
  const [credits, setCredits] = useState<CreditBalance | null>(null);

  const loadedAccountIdRef = useRef<string | null>(null);

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/ai/config");
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? t("loadFailed"));
        return;
      }
      setHasOpenaiKey(Boolean(data.has_openai_key));
      setHasAnthropicKey(Boolean(data.has_anthropic_key));
      setPlatformProvider(data.platform_provider ?? "openai");
      setPlatformModel(data.platform_model ?? "");
      setPlatformAiEnabled(Boolean(data.platform_ai_enabled));
      setFollowUpEnabled(data.follow_up_enabled ?? true);
      setFollowUpTimeout(data.follow_up_timeout_minutes ?? 10);
      setCredits(data.credits ?? null);
    } catch {
      toast.error(t("loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (!accountId || loadedAccountIdRef.current === accountId) return;
    loadedAccountIdRef.current = accountId;
    void fetchConfig();
  }, [accountId, fetchConfig]);

  const handleSaveFollowUp = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/ai/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          follow_up_enabled: followUpEnabled,
          follow_up_timeout_minutes: followUpTimeout,
        }),
      });
      if (res.ok) {
        toast.success(t("saveSuccess"));
      } else {
        const data = await res.json();
        toast.error(data.error ?? t("saveFailed"));
      }
    } catch {
      toast.error(t("saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  if (loading || profileLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading...
      </div>
    );
  }

  // Plan-gating: AI is only available on business+ plans.
  if (!aiIncluded) {
    return (
      <div>
        <SettingsPanelHead title={t("title")} description={t("description")} />
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-4 rounded-full bg-muted p-3">
              <Lock className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="mb-1 text-lg font-semibold text-foreground">
              AI Assistant
            </h3>
            <p className="mb-6 max-w-sm text-sm text-muted-foreground">
              AI-powered auto-replies, smart drafts, and knowledge base are
              available on Business, Growth, and Enterprise plans.
            </p>
            <a
              href="/billing"
              className={cn(buttonVariants({ variant: "default" }))}
            >
              Upgrade plan
              <ArrowUpRight className="ml-1.5 h-4 w-4" />
            </a>
          </CardContent>
        </Card>
      </div>
    );
  }

  const hasAnyPlatformKey = hasOpenaiKey || hasAnthropicKey;
  const hasCredits = credits && credits.creditsRemaining > 0;

  return (
    <div>
      <SettingsPanelHead title={t("title")} description={t("description")} />

      <div className="space-y-6">
        {/* Platform Status Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-primary" /> Platform AI
            </CardTitle>
            <CardDescription>
              AI is configured globally by the platform administrator. Your team
              can use it as long as you have credits.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Status badges */}
            <div className="flex flex-wrap gap-3">
              <div className="flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium bg-muted">
                {platformAiEnabled ? (
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                ) : (
                  <XCircle className="h-4 w-4 text-red-500" />
                )}
                AI {platformAiEnabled ? "Enabled" : "Disabled"}
              </div>
              <div className="flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium bg-muted">
                <span className="text-muted-foreground">Provider:</span>{" "}
                {PROVIDER_LABEL[platformProvider]}
              </div>
              <div className="flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium bg-muted">
                <span className="text-muted-foreground">Model:</span>{" "}
                {platformModel || "Default"}
              </div>
            </div>

            {/* Platform keys */}
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Platform keys</p>
              <div className="flex gap-2">
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                    hasOpenaiKey
                      ? "bg-green-100 text-green-800"
                      : "bg-gray-100 text-gray-500"
                  }`}
                >
                  OpenAI {hasOpenaiKey ? "✓" : "✗"}
                </span>
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                    hasAnthropicKey
                      ? "bg-green-100 text-green-800"
                      : "bg-gray-100 text-gray-500"
                  }`}
                >
                  Anthropic {hasAnthropicKey ? "✓" : "✗"}
                </span>
              </div>
              {!hasAnyPlatformKey && (
                <p className="text-xs text-destructive">
                  No AI provider keys are configured. Contact your platform
                  administrator.
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Credit Balance Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Coins className="h-4 w-4 text-primary" /> AI Credits
            </CardTitle>
            <CardDescription>
              Your AI usage is billed from your credit balance. Credits are
              included in your subscription plan.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-md border border-border p-3">
                <p className="text-xs text-muted-foreground">Remaining</p>
                <p
                  className={cn(
                    "text-2xl font-bold",
                    hasCredits ? "text-foreground" : "text-red-500"
                  )}
                >
                  {credits?.creditsRemaining?.toFixed(4) ?? "0.0000"}
                </p>
                <p className="text-xs text-muted-foreground">credits</p>
              </div>
              <div className="rounded-md border border-border p-3">
                <p className="text-xs text-muted-foreground">Used this period</p>
                <p className="text-2xl font-bold text-foreground">
                  {credits?.creditsUsed?.toFixed(4) ?? "0.0000"}
                </p>
                <p className="text-xs text-muted-foreground">credits</p>
              </div>
              <div className="rounded-md border border-border p-3">
                <p className="text-xs text-muted-foreground">Status</p>
                <p
                  className={cn(
                    "text-2xl font-bold",
                    hasAnyPlatformKey && hasCredits
                      ? "text-green-600"
                      : hasAnyPlatformKey
                        ? "text-yellow-500"
                        : "text-red-500"
                  )}
                >
                  {hasAnyPlatformKey && hasCredits
                    ? "Ready"
                    : hasAnyPlatformKey
                      ? "No Credits"
                      : "Not Configured"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {!hasAnyPlatformKey
                    ? "contact admin"
                    : hasCredits
                      ? "use AI freely"
                      : "purchase credits"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Follow-up settings */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("followUpTitle")}</CardTitle>
            <CardDescription>{t("followUpDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label>{t("followUpEnabled")}</Label>
                <p className="text-xs text-muted-foreground">
                  {t("followUpEnabledDesc")}
                </p>
              </div>
              <Switch
                checked={followUpEnabled}
                onCheckedChange={setFollowUpEnabled}
                disabled={!canEdit}
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="follow-up-timeout">{t("followUpTimeout")}</Label>
                <p className="text-xs text-muted-foreground">
                  {t("followUpTimeoutDesc")}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <input
                  id="follow-up-timeout"
                  type="number"
                  min={1}
                  max={60}
                  value={followUpTimeout}
                  onChange={(e) =>
                    setFollowUpTimeout(
                      Math.min(
                        60,
                        Math.max(1, Number(e.target.value) || 1)
                      )
                    )
                  }
                  disabled={!canEdit || !followUpEnabled}
                  className="w-20 rounded-md border border-border bg-background px-3 py-1.5 text-sm"
                />
                <span className="text-sm text-muted-foreground">min</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Save button */}
        {canEdit && (
          <div className="flex justify-end">
            <Button onClick={handleSaveFollowUp} disabled={saving || !canEdit}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Follow-up Settings
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
