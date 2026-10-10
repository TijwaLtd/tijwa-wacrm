'use client';

import { useState, useRef, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import {
  Loader2, Upload, ArrowRight, ArrowLeft, Check, Building2, Store, Hotel, UtensilsCrossed,
  GraduationCap, Heart, Home, Calendar, Briefcase, Truck, Package, Navigation, Sparkles,
  Wrench, Scissors, Dumbbell, Car, Dog, Stethoscope, CheckCircle2, Sprout
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { BUSINESS_TYPES, getRecommendedCapabilityKeys, type BusinessType } from '@/lib/business/capabilities';

interface WorkspaceFormProps {
  mode: 'create' | 'join';
  onModeSwitch?: () => void;
}

const STEPS = ['details', 'business-type', 'operating-hours', 'review'] as const;
type Step = typeof STEPS[number];

const BUSINESS_TYPE_ICONS: Record<BusinessType, typeof Building2> = {
  retailer: Store,
  wholesaler: Store,
  agriculture: Sprout,
  restaurant: UtensilsCrossed,
  hotel: Hotel,
  hotel_restaurant: Hotel,
  service_business: Briefcase,
  professional_services: Briefcase,
  education: GraduationCap,
  ngo_nonprofit: Heart,
  property_real_estate: Home,
  healthcare: Stethoscope,
  events: Calendar,
  logistics_delivery: Truck,
  courier: Package,
  transportation: Navigation,
  cleaning_services: Sparkles,
  maintenance: Wrench,
  beauty_wellness: Scissors,
  fitness: Dumbbell,
  automotive: Car,
  pet_services: Dog,
  healthcare_clinic: Stethoscope,
  other: Building2,
};

// Flat list of 23 types is hard to scan — group them into sections with
// sticky headers. Search collapses to a flat list.
const TYPE_GROUPS: { key: string; values: BusinessType[] }[] = [
  { key: 'commerce', values: ['retailer', 'wholesaler', 'agriculture', 'courier'] },
  { key: 'food', values: ['restaurant', 'hotel', 'hotel_restaurant'] },
  {
    key: 'services',
    values: ['service_business', 'professional_services', 'logistics_delivery', 'transportation', 'cleaning_services', 'maintenance', 'beauty_wellness', 'fitness', 'automotive', 'pet_services'],
  },
  { key: 'health', values: ['healthcare', 'healthcare_clinic'] },
  { key: 'educationNgo', values: ['education', 'ngo_nonprofit'] },
  { key: 'propertyEvents', values: ['property_real_estate', 'events'] },
  { key: 'other', values: ['other'] },
];

const DAYS_OF_WEEK = [
  { id: 'mon', label: 'Mon' },
  { id: 'tue', label: 'Tue' },
  { id: 'wed', label: 'Wed' },
  { id: 'thu', label: 'Thu' },
  { id: 'fri', label: 'Fri' },
  { id: 'sat', label: 'Sat' },
  { id: 'sun', label: 'Sun' },
];

const BASE_TIMEZONES = [
  'Africa/Nairobi',
  'UTC',
  'Europe/London',
  'America/New_York',
  'Asia/Dubai',
];

export function WorkspaceForm({ mode, onModeSwitch }: WorkspaceFormProps) {
  const t = useTranslations('Onboarding.workspace');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<Step>('details');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Step 1: Workspace details
  const [name, setName] = useState('');
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);

  // Step 2: Business type
  const [businessType, setBusinessType] = useState<BusinessType | null>(null);
  const [typeSearch, setTypeSearch] = useState('');

  // Step 3: Operating Hours. The default timezone is filled in from the
  // browser after mount (see effect below) so SSR and the first client
  // render agree — no hydration mismatch.
  const [activeDays, setActiveDays] = useState<string[]>(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);
  const [startTime, setStartTime] = useState('08:00');
  const [endTime, setEndTime] = useState('20:00');
  const [timezone, setTimezone] = useState('UTC');

  // Join Mode Code
  const [inviteCode, setInviteCode] = useState('');

  // Detect the user's timezone once on the client. Deferred past the
  // synchronous effect body so react-hooks/set-state-in-effect stays
  // quiet and the server HTML isn't invalidated.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await Promise.resolve();
      if (cancelled) return;
      try {
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
        if (tz) setTimezone(tz);
      } catch {
        /* keep UTC */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Always include the browser's detected zone in the dropdown, even if
  // it isn't in the curated shortlist.
  const timezoneOptions =
    timezone && !BASE_TIMEZONES.includes(timezone) ? [timezone, ...BASE_TIMEZONES] : BASE_TIMEZONES;

  const stepIndex = STEPS.indexOf(step);

  const handleLogoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      toast.error(t('logoTooLarge'));
      return;
    }

    setLogoFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setLogoPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const removeLogo = () => {
    setLogoFile(null);
    setLogoPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const toggleDay = (dayId: string) => {
    setActiveDays((prev) =>
      prev.includes(dayId) ? prev.filter((d) => d !== dayId) : [...prev, dayId]
    );
  };

  const handleNext = () => {
    if (step === 'details' && name.trim().length < 2) {
      setError(t('nameMinLength'));
      return;
    }
    if (step === 'business-type' && !businessType) {
      setError(t('businessTypeRequired'));
      return;
    }
    if (step === 'operating-hours' && activeDays.length === 0) {
      setError(t('daysRequired'));
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
          business_type: businessType,
          operating_hours: {
            days: activeDays,
            start: startTime,
            end: endTime,
            timezone,
          },
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || t('createError'));
      }

      toast.success(t('created'));

      if (data.workspace?.id) {
        document.cookie = `wacrm_active_account=${data.workspace.id}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
      }

      // Full reload (not router.push): the proxy must re-run with the
      // fresh wacrm_active_account cookie before the dashboard renders,
      // same reason as the login page. /billing is correct here — new
      // workspaces are created with no plan (migration 080) and the
      // proxy sends owners there to pick one.
      window.location.href = '/billing';
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

      if (data.accountId) {
        document.cookie = `wacrm_active_account=${data.accountId}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
      }

      window.location.href = '/inbox';
    } catch (err) {
      setError(err instanceof Error ? err.message : t('joinError'));
    } finally {
      setLoading(false);
    }
  }

  if (mode === 'join') {
    return (
      <form onSubmit={handleJoin} className="space-y-6">
        {error && (
          <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive border border-destructive/20">
            {error}
          </div>
        )}

        <div className="space-y-2">
          <Label className="text-foreground">{t('inviteCodeLabel')}</Label>
          <Input
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value)}
            placeholder={t('inviteCodePlaceholder')}
            className="border-border bg-muted uppercase tracking-wider font-mono"
            autoFocus
          />
        </div>

        <Button type="submit" disabled={loading || !inviteCode.trim()} className="w-full h-10">
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {t('joinButton')}
        </Button>

        {onModeSwitch && (
          <div className="text-center pt-2">
            <button
              type="button"
              onClick={onModeSwitch}
              className="text-xs text-muted-foreground hover:text-foreground underline"
            >
              {t('switchToCreate')}
            </button>
          </div>
        )}
      </form>
    );
  }

  // Filter business types for step 2
  const query = typeSearch.trim().toLowerCase();
  const filteredBusinessTypes = BUSINESS_TYPES.filter((type) => {
    if (query) {
      return type.label.toLowerCase().includes(query) || type.description.toLowerCase().includes(query);
    }
    return true;
  });

  // When searching, show a flat list; otherwise show grouped sections.
  const groupedTypes = query
    ? [{ key: 'searchResults', values: filteredBusinessTypes.map((b) => b.value) }]
    : TYPE_GROUPS.map((g) => ({
        key: g.key,
        values: g.values.filter((v) => BUSINESS_TYPES.some((b) => b.value === v)),
      })).filter((g) => g.values.length > 0);

  const selectedTypeObj = BUSINESS_TYPES.find((b) => b.value === businessType);
  const recommendedCaps = businessType ? getRecommendedCapabilityKeys(businessType) : [];

  return (
    <div className="space-y-6">
      {/* Step Indicator Progress Bar */}
      <div className="space-y-2">
        <div className="flex justify-between text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          <span>{t('stepOf', { current: stepIndex + 1, total: STEPS.length })}</span>
          <span>
            {step === 'details' && t('stepDetailsTitle')}
            {step === 'business-type' && t('stepBusinessTypeTitle')}
            {step === 'operating-hours' && t('stepHoursTitle')}
            {step === 'review' && t('stepReviewTitle')}
          </span>
        </div>
        <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-primary transition-all duration-300 rounded-full"
            style={{ width: `${((stepIndex + 1) / STEPS.length) * 100}%` }}
          />
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive border border-destructive/20 animate-in fade-in">
          {error}
        </div>
      )}

      {/* STEP 1: WORKSPACE DETAILS */}
      {step === 'details' && (
        <div className="space-y-5 animate-in fade-in slide-in-from-right-2 duration-200">
          <div className="space-y-2">
            <Label className="text-foreground font-medium">{t('nameLabel')} *</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('namePlaceholder')}
              className="border-border bg-muted text-sm h-10"
              autoFocus
            />
            <p className="text-xs text-muted-foreground">{t('nameHint')}</p>
          </div>

          <div className="space-y-2">
            <Label className="text-foreground font-medium">{t('logoLabel')}</Label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={handleLogoSelect}
              className="hidden"
            />
            {logoPreview ? (
              <div className="flex items-center gap-4">
                <img
                  src={logoPreview}
                  alt={t('logoLabel')}
                  className="h-16 w-16 rounded-xl object-cover border border-border"
                />
                <Button variant="outline" size="sm" onClick={removeLogo} className="border-border text-xs">
                  {t('logoRemove')}
                </Button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex h-20 w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border/80 hover:border-primary hover:bg-muted/50 transition-colors"
              >
                <Upload className="h-5 w-5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">{t('logoHint')}</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* STEP 2: BUSINESS TYPE SELECTION */}
      {step === 'business-type' && (
        <div className="space-y-4 animate-in fade-in slide-in-from-right-2 duration-200">
          <p className="text-xs text-muted-foreground">{t('stepBusinessTypeDesc')}</p>
          <div className="relative">
            <Input
              placeholder={t('businessTypeSearch')}
              value={typeSearch}
              onChange={(e) => setTypeSearch(e.target.value)}
              className="border-border bg-muted text-sm h-9"
            />
          </div>

          {filteredBusinessTypes.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {t('businessTypeNoResults')}
            </p>
          )}

          <div className="max-h-[340px] overflow-y-auto pr-1 space-y-4">
            {groupedTypes.map((group) => (
              <div key={group.key}>
                {!query && (
                  <p className="text-muted-foreground mb-2 text-[11px] font-semibold uppercase tracking-wider">
                    {t(`group_${group.key}`)}
                  </p>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                  {group.values.map((value) => {
                    const type = BUSINESS_TYPES.find((b) => b.value === value);
                    if (!type) return null;
                    const Icon = BUSINESS_TYPE_ICONS[type.value] || Building2;
                    const isSelected = businessType === type.value;
                    return (
                      <button
                        key={type.value}
                        type="button"
                        onClick={() => {
                          setBusinessType(type.value);
                          setError(null);
                        }}
                        className={cn(
                          'flex items-start gap-3 rounded-xl border p-3 text-left transition-all',
                          isSelected
                            ? 'border-primary bg-primary/10 ring-1 ring-primary'
                            : 'border-border bg-card hover:border-border/80 hover:bg-muted/40'
                        )}
                      >
                        <div
                          className={cn(
                            'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                            isSelected ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                          )}
                        >
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold text-foreground">{type.label}</p>
                          <p className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5">{type.description}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* STEP 3: OPERATING HOURS SETUP */}
      {step === 'operating-hours' && (
        <div className="space-y-5 animate-in fade-in slide-in-from-right-2 duration-200">
          <p className="text-xs text-muted-foreground">{t('stepHoursDesc')}</p>

          <div className="space-y-2">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
              {t('daysLabel')}
            </Label>
            <div className="flex flex-wrap gap-2">
              {DAYS_OF_WEEK.map((day) => {
                const isActive = activeDays.includes(day.id);
                return (
                  <button
                    key={day.id}
                    type="button"
                    onClick={() => toggleDay(day.id)}
                    className={cn(
                      'flex h-10 w-12 items-center justify-center rounded-lg text-xs font-bold transition-all border',
                      isActive
                        ? 'border-primary bg-primary text-primary-foreground shadow-xs'
                        : 'border-border bg-muted text-muted-foreground hover:bg-muted/80'
                    )}
                  >
                    {day.label}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {t('daysHint', { count: activeDays.length })}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-muted-foreground text-xs">{t('openTime')}</Label>
              <Input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="border-border bg-muted text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-muted-foreground text-xs">{t('closeTime')}</Label>
              <Input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="border-border bg-muted text-sm"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-muted-foreground text-xs">{t('timezoneLabel')}</Label>
            <select
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="w-full border-border bg-muted text-foreground rounded-lg px-3 py-2 text-sm"
            >
              {timezoneOptions.map((tz) => (
                <option key={tz} value={tz}>
                  {tz === timezone && !BASE_TIMEZONES.includes(tz)
                    ? `${tz} (${t('timezoneDetected')})`
                    : tz}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* STEP 4: REVIEW & LAUNCH */}
      {step === 'review' && (
        <div className="space-y-4 animate-in fade-in slide-in-from-right-2 duration-200">
          <div className="rounded-xl border border-border/80 bg-muted/20 p-4 space-y-3">
            <div className="flex items-center gap-3">
              {logoPreview ? (
                <img src={logoPreview} alt={name} className="h-12 w-12 rounded-lg object-cover border border-border" />
              ) : (
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Building2 className="h-6 w-6" />
                </div>
              )}
              <div>
                <h3 className="font-bold text-base text-foreground">{name}</h3>
                <p className="text-xs text-muted-foreground font-medium">{selectedTypeObj?.label}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs border-t border-border/60 pt-3">
              <div>
                <span className="text-muted-foreground block text-[10px] uppercase font-semibold">{t('reviewSchedule')}</span>
                <span className="font-semibold text-foreground">
                  {activeDays.length === 7 ? t('reviewEveryday') : t('reviewDaysPerWeek', { count: activeDays.length })} ({startTime} - {endTime})
                </span>
              </div>
              <div>
                <span className="text-muted-foreground block text-[10px] uppercase font-semibold">{t('reviewTimezone')}</span>
                <span className="font-semibold text-foreground">{timezone}</span>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
              {t('reviewCapabilities', { count: recommendedCaps.length })}
            </Label>
            <div className="flex flex-wrap gap-1.5">
              {recommendedCaps.map((capKey) => (
                <span key={capKey} className="inline-flex items-center gap-1 bg-primary/10 text-primary text-[11px] font-semibold px-2.5 py-1 rounded-full border border-primary/20">
                  <CheckCircle2 className="h-3 w-3" />
                  {capKey.replace('_', ' ')}
                </span>
              ))}
            </div>
          </div>

          <p className="text-xs text-muted-foreground">{t('reviewNote')}</p>
        </div>
      )}

      {/* Navigation Buttons */}
      <div className="flex items-center justify-between pt-3 border-t border-border">
        {stepIndex > 0 ? (
          <Button type="button" variant="outline" onClick={handleBack} disabled={loading} className="border-border text-xs gap-1">
            <ArrowLeft className="h-3.5 w-3.5" />
            {t('back')}
          </Button>
        ) : (
          <div />
        )}

        {step === 'review' ? (
          <Button type="button" onClick={handleCreate} disabled={loading} className="h-10 text-xs sm:text-sm font-semibold gap-2">
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {t('createButton')}
            <Check className="h-4 w-4" />
          </Button>
        ) : (
          <Button type="button" onClick={handleNext} className="h-10 text-xs sm:text-sm font-semibold gap-1.5">
            {t('next')}
            <ArrowRight className="h-4 w-4" />
          </Button>
        )}
      </div>

      {onModeSwitch && step === 'details' && (
        <div className="text-center pt-1">
          <button
            type="button"
            onClick={onModeSwitch}
            className="text-xs text-muted-foreground hover:text-foreground underline"
          >
            {t('switchToJoin')}
          </button>
        </div>
      )}
    </div>
  );
}
