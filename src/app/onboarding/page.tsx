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
    <div className="bg-background flex min-h-screen items-center justify-center px-4">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="text-primary h-8 w-8 animate-spin" />
        <p className="text-muted-foreground text-sm">{t('loading')}</p>
      </div>
    </div>
  );
}

function OnboardingContent() {
  const t = useTranslations('Onboarding.page');
  const [mode, setMode] = useState<'create' | 'join'>('create');

  return (
    <div className="bg-background flex min-h-screen w-full items-center justify-center px-4 py-12">
      <Card className="border-border bg-card w-full max-w-2xl">
        <CardHeader className="items-center gap-2 pt-10 pb-6 text-center">
          <div className="bg-primary/10 mb-2 flex h-14 w-14 items-center justify-center rounded-xl">
            {mode === 'create' ? (
              <Building2 className="text-primary h-7 w-7" />
            ) : (
              <UsersRound className="text-primary h-7 w-7" />
            )}
          </div>
          <CardTitle className="text-foreground text-2xl">
            {mode === 'create' ? t('titleCreate') : t('titleJoin')}
          </CardTitle>
          <CardDescription className="text-muted-foreground text-base">
            {mode === 'create' ? t('descCreate') : t('descJoin')}
          </CardDescription>
        </CardHeader>
        <CardContent className="px-6 pb-10 sm:px-10">
          <WorkspaceForm
            mode={mode}
            onModeSwitch={() => setMode(mode === 'create' ? 'join' : 'create')}
          />
        </CardContent>
      </Card>
    </div>
  );
}
