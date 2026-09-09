'use client';

import { useState, useRef } from 'react';
import { useTranslations } from 'next-intl';
import {
  Loader2, Upload, ArrowRight, ArrowLeft, Check, Building2, Store, Hotel, UtensilsCrossed,
  GraduationCap, Heart, Home, Calendar, Briefcase, Truck, Package, Navigation, Sparkles,
  Wrench, Scissors, Dumbbell, Car, Dog, Stethoscope, Clock, CheckCircle2, SlidersHorizontal, X
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { BUSINESS_TYPES, CAPABILITY_CATEGORIES, getRecommendedCapabilityKeys, type BusinessType } from '@/lib/business/capabilities';

interface WorkspaceFormProps {
  mode: 'create' | 'join';
  onModeSwitch?: () => void;
}

const STEPS = ['details', 'business-type', 'operating-hours', 'review'] as const;
type Step = typeof STEPS[number];

const BUSINESS_TYPE_ICONS: Record<BusinessType, typeof Building2> = {
  retailer: Store,
  wholesaler: Store,
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

const DAYS_OF_WEEK = [
  { id: 'mon', label: 'Mon' },
  { id: 'tue', label: 'Tue' },
  { id: 'wed', label: 'Wed' },
  { id: 'thu', label: 'Thu' },
  { id: 'fri', label: 'Fri' },
  { id: 'sat', label: 'Sat' },
  { id: 'sun', label: 'Sun' },
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
  const [searchCategory, setSearchCategory] = useState<string>('');
  const [typeSearch, setTypeSearch] = useState<string>('');

  // Step 3: Operating Hours
  const [activeDays, setActiveDays] = useState<string[]>(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);
  const [startTime, setStartTime] = useState('08:00');
  const [endTime, setEndTime] = useState('20:00');
  const [timezone, setTimezone] = useState('Africa/Nairobi');

  // Join Mode Code
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
      setError('Please select your business type to proceed');
      return;
    }
    if (step === 'operating-hours' && activeDays.length === 0) {
      setError('Please select at least one operating day');
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

      window.location.href = '/dashboard';
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
          <Label className="text-foreground">{t('inviteCode')}</Label>
          <Input
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value)}
            placeholder="e.g. INV-8X92K"
            className="border-border bg-muted uppercase tracking-wider font-mono"
            autoFocus
          />
        </div>

        <Button type="submit" disabled={loading || !inviteCode.trim()} className="w-full h-10">
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {t('joinWorkspace')}
        </Button>

        {onModeSwitch && (
          <div className="text-center pt-2">
            <button
              type="button"
              onClick={onModeSwitch}
              className="text-xs text-muted-foreground hover:text-foreground underline"
            >
              Want to create a new workspace instead?
            </button>
          </div>
        )}
      </form>
    );
  }

  // Filter business types for step 2
  const filteredBusinessTypes = BUSINESS_TYPES.filter((type) => {
    if (typeSearch.trim()) {
      const q = typeSearch.toLowerCase();
      return type.label.toLowerCase().includes(q) || type.description.toLowerCase().includes(q);
    }
    return true;
  });

  const selectedTypeObj = BUSINESS_TYPES.find((b) => b.value === businessType);
  const recommendedCaps = businessType ? getRecommendedCapabilityKeys(businessType) : [];

  return (
    <div className="space-y-6">
      {/* Step Indicator Progress Bar */}
      <div className="space-y-2">
        <div className="flex justify-between text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          <span>Step {stepIndex + 1} of 4</span>
          <span>
            {step === 'details' && 'Workspace Details'}
            {step === 'business-type' && 'Business Type'}
            {step === 'operating-hours' && 'Operating Hours'}
            {step === 'review' && 'Review & Launch'}
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
            <Label className="text-foreground font-medium">Workspace Name *</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Tuma Morgan Logistics, Apex Retail"
              className="border-border bg-muted text-sm h-10"
              autoFocus
            />
            <p className="text-xs text-muted-foreground">Your business or organization name.</p>
          </div>

          <div className="space-y-2">
            <Label className="text-foreground font-medium">Organization Logo (Optional)</Label>
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
                  alt="Logo preview"
                  className="h-16 w-16 rounded-xl object-cover border border-border"
                />
                <Button variant="outline" size="sm" onClick={removeLogo} className="border-border text-xs">
                  Remove
                </Button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex h-20 w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border/80 hover:border-primary hover:bg-muted/50 transition-colors"
              >
                <Upload className="h-5 w-5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Click to upload logo (PNG, JPG, max 2MB)</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* STEP 2: BUSINESS TYPE SELECTION */}
      {step === 'business-type' && (
        <div className="space-y-4 animate-in fade-in slide-in-from-right-2 duration-200">
          <div className="relative">
            <Input
              placeholder="Search business types (e.g. Courier, Delivery, Restaurant, Clinic)..."
              value={typeSearch}
              onChange={(e) => setTypeSearch(e.target.value)}
              className="border-border bg-muted text-sm h-9"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 max-h-[340px] overflow-y-auto pr-1">
            {filteredBusinessTypes.map((type) => {
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
      )}

      {/* STEP 3: OPERATING HOURS SETUP */}
      {step === 'operating-hours' && (
        <div className="space-y-5 animate-in fade-in slide-in-from-right-2 duration-200">
          <div className="space-y-2">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
              Active Operating Days
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
              Selected days when your AI agent and business operate ({activeDays.length} days active).
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-muted-foreground text-xs">Opening Time</Label>
              <Input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="border-border bg-muted text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-muted-foreground text-xs">Closing Time</Label>
              <Input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="border-border bg-muted text-sm"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-muted-foreground text-xs">Timezone</Label>
            <select
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="w-full border-border bg-muted text-foreground rounded-lg px-3 py-2 text-sm"
            >
              <option value="Africa/Nairobi">Africa/Nairobi (EAT, UTC+3)</option>
              <option value="UTC">UTC (Coordinated Universal Time)</option>
              <option value="Europe/London">Europe/London (GMT/BST)</option>
              <option value="America/New_York">America/New_York (EST/EDT)</option>
              <option value="Asia/Dubai">Asia/Dubai (GST, UTC+4)</option>
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
                <span className="text-muted-foreground block text-[10px] uppercase font-semibold">Operating Schedule</span>
                <span className="font-semibold text-foreground">
                  {activeDays.length === 7 ? 'Everyday' : `${activeDays.length} days/week`} ({startTime} - {endTime})
                </span>
              </div>
              <div>
                <span className="text-muted-foreground block text-[10px] uppercase font-semibold">Timezone</span>
                <span className="font-semibold text-foreground">{timezone}</span>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
              Auto-Enabled Capabilities ({recommendedCaps.length})
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
        </div>
      )}

      {/* Navigation Buttons */}
      <div className="flex items-center justify-between pt-3 border-t border-border">
        {stepIndex > 0 ? (
          <Button type="button" variant="outline" onClick={handleBack} disabled={loading} className="border-border text-xs gap-1">
            <ArrowLeft className="h-3.5 w-3.5" />
            Back
          </Button>
        ) : (
          <div />
        )}

        {step === 'review' ? (
          <Button type="button" onClick={handleCreate} disabled={loading} className="h-10 text-xs sm:text-sm font-semibold gap-2">
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Create Workspace
            <Check className="h-4 w-4" />
          </Button>
        ) : (
          <Button type="button" onClick={handleNext} className="h-10 text-xs sm:text-sm font-semibold gap-1.5">
            Continue
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
            Have an invite code? Join an existing workspace
          </button>
        </div>
      )}
    </div>
  );
}
