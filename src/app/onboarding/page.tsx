'use client';

import { useState, Suspense } from 'react';
import { useTranslations } from 'next-intl';
import { Building2, UsersRound, Loader2 } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { WorkspaceForm } from './_components/workspace-form';

export default function OnboardingPage() {
  return (
    <Suspense fallback={<OnboardingLoading />}>
      <OnboardingContent />
    </Suspense>
  );
}

function OnboardingLoading() {
  const t = useTranslations('Onboarding.page');
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">{t('loading')}</p>
      </div>
    </div>
  );
}

function OnboardingContent() {
  const t = useTranslations('Onboarding.page');
  const [mode, setMode] = useState<'create' | 'join'>('create');

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <Card className="w-full max-w-md border-border bg-card">
        <CardHeader className="items-center text-center">
          <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
            {mode === 'create' ? (
              <Building2 className="h-6 w-6 text-primary" />
            ) : (
              <UsersRound className="h-6 w-6 text-primary" />
            )}
          </div>
          <CardTitle className="text-xl text-foreground">
            {mode === 'create' ? t('titleCreate') : t('titleJoin')}
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            {mode === 'create' ? t('descCreate') : t('descJoin')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <WorkspaceForm
            mode={mode}
            onModeSwitch={() => setMode(mode === 'create' ? 'join' : 'create')}
          />
        </CardContent>
      </Card>
    </div>
  );
}
