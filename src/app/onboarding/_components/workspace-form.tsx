'use client';

import { useState, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, Upload, ArrowRight, ArrowLeft, Check, Building2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import Image from 'next/image';
import { cn } from '@/lib/utils';

interface WorkspaceFormProps {
  mode: 'create' | 'join';
  onModeSwitch?: () => void;
}

const STEPS = ['details', 'review'] as const;
type Step = typeof STEPS[number];

export function WorkspaceForm({ mode, onModeSwitch }: WorkspaceFormProps) {
  const t = useTranslations('Onboarding.workspace');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<Step>('details');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState('');
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [inviteCode, setInviteCode] = useState('');

  const stepIndex = STEPS.indexOf(step);

  const handleLogoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      toast.error('Logo must be less than 2MB');
      return;
    }

    setLogoFile(file);
    const reader = new FileReader();
    reader.onload = (e) => setLogoPreview(e.target?.result as string);
    reader.readAsDataURL(file);
  };

  const removeLogo = () => {
    setLogoFile(null);
    setLogoPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const canProceed = () => {
    if (step === 'details') return name.trim().length >= 2;
    return true;
  };

  const handleNext = () => {
    if (step === 'details' && name.trim().length < 2) {
      setError(t('nameMinLength'));
      return;
    }
    setError(null);
    const idx = stepIndex + 1;
    if (idx < STEPS.length) {
      setStep(STEPS[idx]);
    }
  };

  const handleBack = () => {
    const idx = stepIndex - 1;
    if (idx >= 0) {
      setStep(STEPS[idx]);
    }
  };

  async function handleCreate() {
    setLoading(true);
    setError(null);

    try {
      let logoUrl: string | null = null;

      if (logoFile) {
        const formData = new FormData();
        formData.append('file', logoFile);

        const uploadRes = await fetch('/api/upload/logo', {
          method: 'POST',
          body: formData,
        });

        if (uploadRes.ok) {
          const { url } = await uploadRes.json();
          logoUrl = url;
        }
      }

      const res = await fetch('/api/workspaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          logo_url: logoUrl,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || t('createError'));
      }

      toast.success(t('created'));

      // Set cookie for the newly created workspace before redirect
      // This prevents middleware from redirecting to /select-workspace
      if (data.workspace?.id) {
        document.cookie = `wacrm_active_account=${data.workspace.id}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
      }

      window.location.href = '/dashboard';
    } catch (err) {
      setError(err instanceof Error ? err.message : t('createError'));
      setLoading(false);
    }
  }

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    const trimmedCode = inviteCode.trim();

    if (!trimmedCode) {
      setError(t('inviteCodeRequired'));
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/workspaces/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inviteCode: trimmedCode }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || t('joinError'));
      }

      toast.success(t('joined'));

      // Set cookie for the joined workspace before redirect
      // This prevents middleware from redirecting to /select-workspace
      if (data.accountId) {
        document.cookie = `wacrm_active_account=${data.accountId}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
      }

      window.location.href = '/dashboard';
    } catch (err) {
      setError(err instanceof Error ? err.message : t('joinError'));
    } finally {
      setLoading(false);
    }
  }

  const slugifiedName = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  if (mode === 'join') {
    return (
      <form onSubmit={handleJoin} className="flex flex-col gap-4">
        {error && (
          <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        <div className="flex flex-col gap-2">
          <Label htmlFor="invite-code">{t('inviteCodeLabel')}</Label>
          <Input
            id="invite-code"
            placeholder={t('inviteCodePlaceholder')}
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value)}
            disabled={loading}
            className="border-border bg-muted font-mono"
          />
        </div>

        <Button type="submit" disabled={loading} className="w-full">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : t('joinButton')}
        </Button>

        {onModeSwitch && (
          <button
            type="button"
            onClick={onModeSwitch}
            className="text-sm text-muted-foreground hover:text-primary"
          >
            {t('switchToCreate')}
          </button>
        )}
      </form>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h2 className="text-lg font-semibold text-foreground">
          {step === 'details' && t('stepDetailsTitle')}
          {step === 'review' && t('stepReviewTitle')}
        </h2>
        <p className="text-sm text-muted-foreground">
          {step === 'details' && t('stepDetailsDesc')}
          {step === 'review' && t('stepReviewDesc')}
        </p>
      </div>

      <div className="flex items-center gap-2">
        {STEPS.map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div
              className={cn(
                'flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium',
                i <= stepIndex ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
              )}
            >
              {i < stepIndex ? <Check className="h-3 w-3" /> : i + 1}
            </div>
            {i < STEPS.length - 1 && (
              <div className={cn('h-0.5 w-8', i < stepIndex ? 'bg-primary' : 'bg-muted')} />
            )}
          </div>
        ))}
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      <div className="min-h-[180px]">
        {step === 'details' && (
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-2">
              <Label htmlFor="workspace-name">{t('nameLabel')}</Label>
              <div className="relative">
                <Building2 className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="workspace-name"
                  placeholder={t('namePlaceholder')}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="border-border bg-muted pl-10"
                />
              </div>
              {name.trim() && (
                <p className="text-xs text-muted-foreground">
                  {t('subdomainInfo', { subdomain: `${slugifiedName}.wacrm.com` })}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <Label>{t('logoLabel')}</Label>
              <input
                type="file"
                ref={fileInputRef}
                accept="image/png,image/jpeg,image/webp"
                onChange={handleLogoSelect}
                className="hidden"
              />
              {logoPreview ? (
                <div className="relative inline-block">
                  <Image
                    src={logoPreview}
                    alt="Logo preview"
                    width={64}
                    height={64}
                    unoptimized
                    className="h-16 w-16 rounded-lg object-cover border border-border"
                  />
                  <button
                    type="button"
                    onClick={removeLogo}
                    className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90 text-xs"
                  >
                    ×
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex h-16 w-16 items-center justify-center rounded-lg border-2 border-dashed border-border hover:border-primary hover:bg-muted/50"
                >
                  <Upload className="h-5 w-5 text-muted-foreground" />
                </button>
              )}
              <p className="text-xs text-muted-foreground">{t('logoHint')}</p>
            </div>
          </div>
        )}

        {step === 'review' && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-4 rounded-lg border border-border p-4">
              {logoPreview ? (
                <Image
                  src={logoPreview}
                  alt="Logo"
                  width={48}
                  height={48}
                  unoptimized
                  className="h-12 w-12 rounded-lg object-cover"
                />
              ) : (
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                  <Building2 className="h-6 w-6 text-primary" />
                </div>
              )}
              <div>
                <p className="font-medium text-foreground">{name}</p>
                <p className="text-sm text-muted-foreground">{slugifiedName}.wacrm.com</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              {t('reviewNote')}
            </p>
          </div>
        )}
      </div>

      <div className="flex gap-2">
        {stepIndex > 0 && (
          <Button
            type="button"
            variant="outline"
            onClick={handleBack}
            disabled={loading}
            className="gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            {t('back')}
          </Button>
        )}
        {stepIndex < STEPS.length - 1 ? (
          <Button
            type="button"
            onClick={handleNext}
            disabled={!canProceed()}
            className="flex-1 gap-2"
          >
            {t('next')}
            <ArrowRight className="h-4 w-4" />
          </Button>
        ) : (
          <Button
            type="button"
            onClick={handleCreate}
            disabled={loading}
            className="flex-1 gap-2"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            {t('createButton')}
          </Button>
        )}
      </div>

      {step === 'details' && onModeSwitch && (
        <button
          type="button"
          onClick={onModeSwitch}
          className="text-sm text-muted-foreground hover:text-primary"
        >
          {t('switchToJoin')}
        </button>
      )}
    </div>
  );
}
