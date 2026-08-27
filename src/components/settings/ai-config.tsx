'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Sparkles, Trash2, Coins, Lock, ArrowUpRight } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { canEditSettings } from '@/lib/auth/roles';
import { Button, buttonVariants } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SettingsPanelHead } from './settings-panel-head';
import { cn } from '@/lib/utils';
import type { AiProvider } from '@/lib/ai/types';
import type { AccountMember } from '@/types';
import { fetchAccountMembers, memberLabel } from '@/lib/account/members';
import { useTranslations } from 'next-intl';

const AI_ENABLED_PLANS = new Set(['business', 'growth', 'enterprise']);

// Radix Select can't use an empty-string item value, so the "leave
// unassigned" choice gets a sentinel that maps to null in the payload.
const HANDOFF_QUEUE = '__queue__';

const PROVIDER_LABEL: Record<AiProvider, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic (Claude)',
};

interface AvailableModel {
  provider: AiProvider;
  model: string;
  displayName: string;
  inputCreditsPerMtok: number;
  outputCreditsPerMtok: number;
}

interface CreditBalance {
  creditsRemaining: number;
  creditsUsed: number;
  lastResetAt: string | null;
}

export function AiConfig() {
  const { accountId, accountRole, profileLoading, activeWorkspace } = useAuth();
  const canEdit = accountRole ? canEditSettings(accountRole) : false;
  const t = useTranslations('Settings.aiConfig');
  const currentPlan = activeWorkspace?.plan ?? 'starter';
  const aiIncluded = AI_ENABLED_PLANS.has(currentPlan);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);

  const [configured, setConfigured] = useState(false);
  const [provider, setProvider] = useState<AiProvider>('openai');
  const [model, setModel] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [isActive, setIsActive] = useState(false);
  const [autoReplyEnabled, setAutoReplyEnabled] = useState(false);
  const [maxPerConversation, setMaxPerConversation] = useState(3);
  const [handoffAgentId, setHandoffAgentId] = useState('');
  const [members, setMembers] = useState<AccountMember[]>([]);

  // Platform key availability
  const [hasOpenaiKey, setHasOpenaiKey] = useState(false);
  const [hasAnthropicKey, setHasAnthropicKey] = useState(false);
  const [hasEmbeddingsKey, setHasEmbeddingsKey] = useState(false);

  // Credit balance
  const [credits, setCredits] = useState<CreditBalance | null>(null);

  // Available models from credit rates
  const [availableModels, setAvailableModels] = useState<AvailableModel[]>([]);

  const loadedAccountIdRef = useRef<string | null>(null);

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/ai/config');
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? t('loadFailed'));
        return;
      }
      if (data.configured) {
        setConfigured(true);
        setProvider(data.provider);
        setModel(data.model);
        setSystemPrompt(data.system_prompt ?? '');
        setIsActive(data.is_active);
        setAutoReplyEnabled(data.auto_reply_enabled);
        setMaxPerConversation(data.auto_reply_max_per_conversation ?? 3);
        setHandoffAgentId(data.handoff_agent_id ?? '');
      }
      setHasOpenaiKey(Boolean(data.has_openai_key));
      setHasAnthropicKey(Boolean(data.has_anthropic_key));
      setHasEmbeddingsKey(Boolean(data.has_embeddings_key));
      setCredits(data.credits ?? null);
      setAvailableModels(data.available_models ?? []);
    } catch {
      toast.error(t('loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (!accountId || loadedAccountIdRef.current === accountId) return;
    loadedAccountIdRef.current = accountId;
    void fetchConfig();
    void fetchAccountMembers().then(setMembers);
  }, [accountId, fetchConfig]);

  const handleProviderChange = (next: AiProvider) => {
    setProvider(next);
    // Reset model to first available for the new provider
    const providerModels = availableModels.filter((m) => m.provider === next);
    if (providerModels.length > 0) {
      const currentModelValid = providerModels.some((m) => m.model === model);
      if (!currentModelValid) {
        setModel(providerModels[0].model);
      }
    }
  };

  const buildBody = () => ({
    provider,
    model: model.trim(),
    system_prompt: systemPrompt.trim() || null,
    is_active: isActive,
    auto_reply_enabled: autoReplyEnabled,
    auto_reply_max_per_conversation: maxPerConversation,
    handoff_agent_id: handoffAgentId || null,
  });

  const handleSave = async () => {
    if (!model.trim()) {
      toast.error(t('missingModel'));
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/ai/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildBody()),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(t('saveSuccess'));
        await fetchConfig();
      } else {
        toast.error(data.error ?? t('saveFailed'));
      }
    } catch {
      toast.error(t('saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    setRemoving(true);
    try {
      const res = await fetch('/api/ai/config', { method: 'DELETE' });
      if (res.ok) {
        toast.success(t('removeSuccess'));
        setConfigured(false);
        setIsActive(false);
        setAutoReplyEnabled(false);
        setSystemPrompt('');
        setHandoffAgentId('');
      } else {
        const data = await res.json();
        toast.error(data.error ?? t('removeFailed'));
      }
    } catch {
      toast.error(t('removeFailed'));
    } finally {
      setRemoving(false);
    }
  };

  if (loading || profileLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading...
      </div>
    );
  }

  // Plan-gating: AI is only available on Pro and Enterprise plans.
  if (!aiIncluded) {
    return (
      <div>
        <SettingsPanelHead
          title={t('title')}
          description={t('description')}
        />
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-4 rounded-full bg-muted p-3">
              <Lock className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="mb-1 text-lg font-semibold text-foreground">
              AI Assistant
            </h3>
            <p className="mb-6 max-w-sm text-sm text-muted-foreground">
              AI-powered auto-replies, smart drafts, and knowledge base are available on Pro and Enterprise plans.
            </p>
            <a href="/billing" className={cn(buttonVariants({ variant: 'default' }))}>
              Upgrade plan
              <ArrowUpRight className="ml-1.5 h-4 w-4" />
            </a>
          </CardContent>
        </Card>
      </div>
    );
  }

  const disabled = !canEdit || saving;
  const providerModels = availableModels.filter((m) => m.provider === provider);
  const hasProviderKey = provider === 'openai' ? hasOpenaiKey : hasAnthropicKey;
  const selectedModel = providerModels.find((m) => m.model === model);

  return (
    <div>
      <SettingsPanelHead
        title={t('title')}
        description={t('description')}
      />

      {!canEdit && (
        <p className="mb-4 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          {t('adminOnlyConfig')}
        </p>
      )}

      <div className="space-y-6">
        {/* Credit Balance Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Coins className="h-4 w-4 text-primary" /> AI Credits
            </CardTitle>
            <CardDescription>
              Your AI usage is billed from your credit balance. Credits are included in your subscription plan.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-md border border-border p-3">
                <p className="text-xs text-muted-foreground">Remaining</p>
                <p className="text-2xl font-bold text-foreground">
                  {credits?.creditsRemaining?.toFixed(4) ?? '0.0000'}
                </p>
                <p className="text-xs text-muted-foreground">credits</p>
              </div>
              <div className="rounded-md border border-border p-3">
                <p className="text-xs text-muted-foreground">Used this period</p>
                <p className="text-2xl font-bold text-foreground">
                  {credits?.creditsUsed?.toFixed(4) ?? '0.0000'}
                </p>
                <p className="text-xs text-muted-foreground">credits</p>
              </div>
              <div className="rounded-md border border-border p-3">
                <p className="text-xs text-muted-foreground">Platform keys</p>
                <div className="mt-1 flex gap-2">
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${hasOpenaiKey ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-500'}`}>
                    OpenAI {hasOpenaiKey ? '✓' : '✗'}
                  </span>
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${hasAnthropicKey ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-500'}`}>
                    Anthropic {hasAnthropicKey ? '✓' : '✗'}
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Provider & Model Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-primary" /> {t('providerAndKey')}
            </CardTitle>
            <CardDescription>
              Select the AI provider and model. The platform provides the API key -- no key entry needed.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>{t('provider')}</Label>
                <Select
                  value={provider}
                  onValueChange={(v) => handleProviderChange(v as AiProvider)}
                  disabled={disabled}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="openai" disabled={!hasOpenaiKey}>
                      {PROVIDER_LABEL.openai} {!hasOpenaiKey && '(key not configured)'}
                    </SelectItem>
                    <SelectItem value="anthropic" disabled={!hasAnthropicKey}>
                      {PROVIDER_LABEL.anthropic} {!hasAnthropicKey && '(key not configured)'}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>{t('model')}</Label>
                <Select
                  value={model}
                  onValueChange={(v) => setModel(v ?? '')}
                  disabled={disabled || providerModels.length === 0}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a model" />
                  </SelectTrigger>
                  <SelectContent>
                    {providerModels.map((m) => (
                      <SelectItem key={m.model} value={m.model}>
                        {m.displayName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedModel && (
                  <p className="text-xs text-muted-foreground">
                    Cost: {selectedModel.inputCreditsPerMtok} credits/MTok input,{' '}
                    {selectedModel.outputCreditsPerMtok} credits/MTok output
                  </p>
                )}
                {!hasProviderKey && (
                  <p className="text-xs text-destructive">
                    {PROVIDER_LABEL[provider]} API key is not configured on the platform.
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Behaviour Card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('behaviour')}</CardTitle>
            <CardDescription>
              {t('behaviourDesc')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="ai-prompt">{t('businessContext')}</Label>
              <Textarea
                id="ai-prompt"
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                placeholder={t('promptPlaceholder')}
                rows={5}
                disabled={disabled}
              />
            </div>

            <div className="flex items-center justify-between gap-4 rounded-md border border-border p-3">
              <div>
                <p className="text-sm font-medium text-foreground">
                  {t('enableAssistant')}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t('enableAssistantDesc')}
                </p>
              </div>
              <Switch
                checked={isActive}
                onCheckedChange={setIsActive}
                disabled={disabled}
              />
            </div>

            <div className="flex items-center justify-between gap-4 rounded-md border border-border p-3">
              <div>
                <p className="text-sm font-medium text-foreground">
                  {t('autoReply')}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t('autoReplyDesc')}
                </p>
              </div>
              <Switch
                checked={autoReplyEnabled}
                onCheckedChange={setAutoReplyEnabled}
                disabled={disabled || !isActive}
              />
            </div>

            <div className="flex items-center justify-between gap-4">
              <div>
                <Label htmlFor="ai-max">{t('maxAutoReplies')}</Label>
                <p className="text-xs text-muted-foreground">
                  {t('maxAutoRepliesDesc')}
                </p>
              </div>
              <input
                id="ai-max"
                type="number"
                min={1}
                max={20}
                value={maxPerConversation}
                onChange={(e) =>
                  setMaxPerConversation(
                    Math.min(20, Math.max(1, Number(e.target.value) || 1)),
                  )
                }
                disabled={disabled || !autoReplyEnabled}
                className="w-20 rounded-md border border-border bg-background px-3 py-1.5 text-sm"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="ai-handoff">{t('handoffTo')}</Label>
              <p className="text-xs text-muted-foreground">
                {t('handoffToDesc')}
              </p>
              <Select
                value={handoffAgentId || HANDOFF_QUEUE}
                onValueChange={(v) =>
                  setHandoffAgentId(!v || v === HANDOFF_QUEUE ? '' : v)
                }
                disabled={disabled || !autoReplyEnabled}
              >
                <SelectTrigger id="ai-handoff">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={HANDOFF_QUEUE}>
                    {t('handoffQueue')}
                  </SelectItem>
                  {members.map((m) => (
                    <SelectItem key={m.user_id} value={m.user_id}>
                      {memberLabel(m)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Knowledge base is now a standalone page at /knowledge */}

        <div className="flex items-center justify-between">
          {configured ? (
            <Button
              variant="ghost"
              onClick={handleRemove}
              disabled={!canEdit || removing}
              className="text-destructive hover:text-destructive"
            >
              {removing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-2 h-4 w-4" />
              )}
              {t('remove')}
            </Button>
          ) : (
            <span />
          )}

          <Button onClick={handleSave} disabled={disabled}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('save')}
          </Button>
        </div>
      </div>
    </div>
  );
}
