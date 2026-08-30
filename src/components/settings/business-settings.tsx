'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Building2, Loader2, Store, Hotel, UtensilsCrossed, GraduationCap, Heart, Home, Calendar, Briefcase, Settings } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/use-auth';
import { cn } from '@/lib/utils';
import { BUSINESS_TYPES, type BusinessType, type CapabilityWithState, groupCapabilitiesByCategory, CAPABILITY_CATEGORIES } from '@/lib/business/capabilities';

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
  healthcare: Briefcase,
  events: Calendar,
  other: Building2,
};

export function BusinessSettings() {
  const t = useTranslations('BusinessSettings');
  const { activeWorkspace, refreshProfile, refreshCapabilities } = useAuth();

  const [businessType, setBusinessType] = useState<BusinessType | null>(null);
  const [capabilities, setCapabilities] = useState<CapabilityWithState[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function fetchData() {
      if (!activeWorkspace?.account_id) return;

      try {
        const res = await fetch(`/api/business/capabilities/account?account_id=${activeWorkspace.account_id}`);
        if (res.ok) {
          const data = await res.json();
          setBusinessType(data.business_type);
          setCapabilities(data.capabilities);
        }
      } catch (err) {
        console.error('Failed to fetch business settings:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [activeWorkspace?.account_id]);

  const handleBusinessTypeChange = async (newType: BusinessType) => {
    if (!activeWorkspace?.account_id) return;

    setSaving(true);
    try {
      const res = await fetch('/api/business/capabilities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          account_id: activeWorkspace.account_id,
          business_type: newType,
        }),
      });

      if (!res.ok) {
        throw new Error((await res.json()).error || 'Failed to save');
      }

      const data = await res.json();
      setBusinessType(data.business_type);
      setCapabilities(data.capabilities);
      toast.success('Business type updated');
      await refreshProfile();
      await refreshCapabilities();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleCapabilityToggle = async (capabilityKey: string, enabled: boolean) => {
    if (!activeWorkspace?.account_id) return;

    setSaving(true);
    try {
      const res = await fetch('/api/business/capabilities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          account_id: activeWorkspace.account_id,
          capabilities: [{ key: capabilityKey, enabled }],
        }),
      });

      if (!res.ok) {
        throw new Error((await res.json()).error || 'Failed to save');
      }

      const data = await res.json();
      setCapabilities(data.capabilities);
      toast.success('Capability updated');
      await refreshCapabilities();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const groupedCapabilities = groupCapabilitiesByCategory(capabilities);

  return (
    <div className="space-y-6">
      {/* Business Type Selection */}
      <Card className="border-border bg-card">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            <CardTitle>{t('businessTypeTitle')}</CardTitle>
          </div>
          <CardDescription>{t('businessTypeDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {BUSINESS_TYPES.map((type) => {
              const Icon = BUSINESS_TYPE_ICONS[type.value];
              const isSelected = businessType === type.value;
              return (
                <button
                  key={type.value}
                  type="button"
                  onClick={() => handleBusinessTypeChange(type.value)}
                  disabled={saving}
                  className={cn(
                    'flex flex-col items-center gap-2 rounded-lg border p-4 text-center transition-all',
                    isSelected
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border hover:border-primary/50 hover:bg-muted/50',
                    saving && 'opacity-50 cursor-not-allowed'
                  )}
                >
                  <Icon className={cn('h-6 w-6', isSelected ? 'text-primary' : 'text-muted-foreground')} />
                  <span className="text-sm font-medium">{type.label}</span>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Capabilities */}
      {businessType && (
        <Card className="border-border bg-card">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Settings className="h-5 w-5 text-primary" />
              <CardTitle>{t('capabilitiesTitle')}</CardTitle>
            </div>
            <CardDescription>{t('capabilitiesDesc')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {CAPABILITY_CATEGORIES.map((category) => {
              const categoryCapabilities = groupedCapabilities[category.value];
              if (!categoryCapabilities || categoryCapabilities.length === 0) return null;

              return (
                <div key={category.value} className="space-y-3">
                  <h3 className="text-sm font-medium text-foreground">{category.label}</h3>
                  <div className="space-y-2">
                    {categoryCapabilities.map((cap) => (
                      <div
                        key={cap.key}
                        className="flex items-center justify-between rounded-lg border border-border p-3"
                      >
                        <div className="flex-1">
                          <p className="text-sm font-medium text-foreground">{cap.name}</p>
                          {cap.description && (
                            <p className="text-xs text-muted-foreground">{cap.description}</p>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => handleCapabilityToggle(cap.key, !cap.isEnabled)}
                          disabled={saving}
                          className={cn(
                            'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
                            cap.isEnabled ? 'bg-primary' : 'bg-muted',
                            saving && 'opacity-50 cursor-not-allowed'
                          )}
                        >
                          <span
                            className={cn(
                              'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
                              cap.isEnabled ? 'translate-x-6' : 'translate-x-1'
                            )}
                          />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
