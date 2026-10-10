'use client';

import { Suspense, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ArrowLeft } from 'lucide-react';

import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';
import { useTheme } from '@/hooks/use-theme';
import { SettingsRail } from '@/components/settings/settings-rail';
import { SettingsMobileIndex } from '@/components/settings/settings-mobile-index';
import { SettingsOverview } from '@/components/settings/settings-overview';
import { ProfileForm } from '@/components/settings/profile-form';
import { SecurityPanel } from '@/components/settings/security-panel';
import { AppearancePanel } from '@/components/settings/appearance-panel';
import { WhatsAppConfig } from '@/components/settings/whatsapp-config';
import { TemplateManager } from '@/components/settings/template-manager';
// import { QuickRepliesManager } from '@/components/settings/quick-replies-manager'; // hidden section (quick replies)
import { FieldsAndTagsPanel } from '@/components/settings/fields-and-tags-panel';
import { DealsSettings } from '@/components/settings/deals-settings';
// import { AiConfig } from '@/components/settings/ai-config'; // hidden section (AI assistant)
// import { AutoAssignSettings } from '@/components/settings/auto-assign-settings'; // hidden section (auto-assign)
import { DepartmentSettings } from '@/components/settings/department-settings';
// import { SkillSettings } from '@/components/settings/skill-settings'; // hidden section (agent skills)
import { ScheduleSettings } from '@/components/settings/schedule-settings';
import { ApiKeysSettings } from '@/components/settings/api-keys-settings';
import { WorkspaceSettings } from '@/components/settings/workspace-settings';
import { BusinessSettings } from '@/components/settings/business-settings';
import { HelpSettings } from '@/components/settings/help-settings';
import { LegalSettings } from '@/components/settings/legal-settings';
import { PaymentMethodsSettings } from '@/components/settings/payment-methods-settings';
import { PricingSettings } from '@/components/settings/pricing-settings';
import {
  resolveSection,
  hasMinRole,
  SECTION_META,
  type SettingsSection,
} from '@/components/settings/settings-sections';

// `useSearchParams` opts this page out of static prerendering unless it
// sits under a Suspense boundary. Without one, the production build hits
// the "missing Suspense with CSR bailout" error and the whole page bails
// to client-side rendering — shipping a settings screen whose rail never
// wires up its click handlers. You land on the section the URL carried
// (the account-menu Settings link points at `?tab=whatsapp`) and can't
// navigate away. Mirror the login/signup split: a thin wrapper supplies
// the boundary; the inner component reads the query string.
export default function SettingsPage() {
  return (
    <Suspense fallback={null}>
      <SettingsPageInner />
    </Suspense>
  );
}

function SettingsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { defaultCurrency, accountRole } = useAuth();
  const { mode } = useTheme();
  const t = useTranslations('Settings');

  // The URL (`?tab=`) is the single source of truth for the active
  // section — deep-linkable, and it keeps the existing links in the
  // app sidebar/header working. Legacy tab values (tags, custom-fields)
  // resolve onto their new home; unknown/empty → the Overview landing.
  const rawTab = searchParams.get('tab');

  // Mobile drill-down state: below `lg` the sections are a vertical
  // index and a section's panel opens on top of it with a back button.
  // Deep links (?tab=…) land straight in the panel; the bare /settings
  // URL shows the index — Overview is a row like any other, never an
  // implicit default. Desktop ignores this — rail + panel coexist.
  const [mobileIndexOpen, setMobileIndexOpen] = useState(() => !rawTab);

  // Team members moved out of settings to its own page — old
  // `?tab=members` deep links keep working via redirect.
  useEffect(() => {
    if (rawTab === 'members') router.replace('/team');
  }, [rawTab, router]);

  const requestedSection = resolveSection(rawTab);

  // If the user doesn't have permission for this section, redirect to overview
  const sectionMeta = SECTION_META[requestedSection];
  const section = (sectionMeta?.minRole && (!accountRole || !hasMinRole(accountRole, sectionMeta.minRole)))
    ? 'overview'
    : requestedSection;

  const go = (next: SettingsSection) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', next);
    router.replace(`/settings?${params.toString()}`, { scroll: false });
    setMobileIndexOpen(false);
  };

  // Back button (mobile): drop the tab param and return to the
  // vertical section index. Harmless on desktop where it's hidden.
  const backToIndex = () => {
    router.replace('/settings', { scroll: false });
    setMobileIndexOpen(true);
  };

  // Cheap, fetch-free rail hints. The Overview landing carries the
  // full live status/counts; the rail just surfaces the two that are
  // already in context.
  const hints: Partial<Record<SettingsSection, ReactNode>> = useMemo(
    () => ({
      appearance: mode.charAt(0).toUpperCase() + mode.slice(1),
      deals: defaultCurrency,
    }),
    [mode, defaultCurrency],
  );

  const panel: Record<SettingsSection, ReactNode> = {
    overview: <SettingsOverview onSelect={go} />,
    profile: <ProfileForm />,
    security: <SecurityPanel />,
    appearance: <AppearancePanel />,
    help: <HelpSettings />,
    whatsapp: <WhatsAppConfig />,
    templates: <TemplateManager />,
    // 'quick-replies': <QuickRepliesManager />, — hidden (see settings-sections.ts)
    fields: <FieldsAndTagsPanel />,
    deals: <DealsSettings />,
    // ai: <AiConfig />, — hidden (see settings-sections.ts)
    // 'auto-assign': <AutoAssignSettings />, — hidden (see settings-sections.ts)
    departments: <DepartmentSettings />,
    // skills: <SkillSettings />, — hidden (see settings-sections.ts)
    schedule: <ScheduleSettings />,
    workspace: <WorkspaceSettings />,
    business: <BusinessSettings />,
    'payment-methods': <PaymentMethodsSettings />,
    pricing: <PricingSettings />,
    api: <ApiKeysSettings />,
    legal: <LegalSettings />,
  };

  return (
    <div>
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          {t('pageTitle')}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('pageDesc')}
        </p>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[236px_minmax(0,1fr)] lg:items-start">
        {/* Desktop rail (sticky). Hidden below lg — the mobile index
            below replaces it with a vertical drill-down. */}
        <div className="hidden lg:sticky lg:top-0 lg:block">
          <SettingsRail active={section} onSelect={go} hints={hints} accountRole={accountRole} />
        </div>

        {/* Mobile: vertical section index (role-filtered like the rail).
            Visible only while no section is drilled into. */}
        <div className={cn('lg:hidden', !mobileIndexOpen && 'hidden')}>
          <SettingsMobileIndex onSelect={go} accountRole={accountRole} />
        </div>

        {/* Panel: always on desktop; on mobile only while drilled in */}
        <div className={cn('min-w-0', mobileIndexOpen && 'hidden lg:block')}>
          {!mobileIndexOpen && (
            <button
              type="button"
              onClick={backToIndex}
              className="mb-4 inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 -ml-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground lg:hidden"
            >
              <ArrowLeft className="size-4" />
              {t('backToList')}
            </button>
          )}
          {panel[section]}
        </div>
      </div>
    </div>
  );
}
