'use client';

// ============================================================
// SeatPurchaseDialog
//
// Shown when a user tries to invite a team member beyond their
// plan limit. Two options:
//   1. Upgrade to a higher plan (more included seats)
//   2. Add an extra seat (KES 750/mo, prorated)
// ============================================================

import { useState } from 'react';
import { toast } from 'sonner';
import { ArrowUpRight, Loader2, Users, Zap } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

interface Plan {
  id: string;
  name: string;
  price_kes: number;
  features?: {
    max_team_members: number;
  };
}

interface SeatPurchaseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSeatPurchased: () => void;
  onUpgrade: (planId: string) => void;
  currentPlan: string;
  plans: Plan[];
  currentMembers: number;
  includedSeats: number;
  seatPrice: number;
  proratedCharge: number;
  daysRemaining: number;
}

export function SeatPurchaseDialog({
  open,
  onOpenChange,
  onSeatPurchased,
  onUpgrade,
  currentPlan,
  plans,
  currentMembers,
  includedSeats,
  seatPrice,
  proratedCharge,
  daysRemaining,
}: SeatPurchaseDialogProps) {
  const t = useTranslations('Settings.seats');
  const [loading, setLoading] = useState(false);
  const [selectedOption, setSelectedOption] = useState<'seat' | null>(null);

  const currentPlanDef = plans.find((p) => p.id === currentPlan);
  const upgradeOptions = plans.filter(
    (p) => p.id !== currentPlan && p.id !== 'enterprise' &&
    (p.features?.max_team_members ?? 0) > includedSeats
  );

  async function handleAddSeat() {
    setLoading(true);
    try {
      const res = await fetch('/api/subscription/seats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t('failedToAdd'));
      toast.success(t('seatAdded', { amount: data.charge_kes.toLocaleString() }));
      onSeatPurchased();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('failedToAdd'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            {t('title')}
          </DialogTitle>
          <DialogDescription>
            {t.rich('planIncludes', {
              plan: currentPlanDef?.name ?? currentPlan,
              included: includedSeats,
              current: currentMembers,
              bold: (chunks) => <strong>{chunks}</strong>,
            })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <button
            onClick={() => setSelectedOption('seat')}
            className={cn(
              'w-full rounded-lg border p-4 text-left transition-all',
              selectedOption === 'seat'
                ? 'border-primary bg-primary/5'
                : 'border-border hover:border-primary/50',
            )}
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="font-semibold text-foreground">{t('addExtraSeat')}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t('seatPrice', { price: seatPrice.toLocaleString() })}
                </p>
              </div>
              <div className="text-right">
                <p className="text-lg font-bold text-primary">
                  {t('proratedCharge', { amount: proratedCharge.toLocaleString() })}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t('proratedHint', { days: daysRemaining })}
                </p>
              </div>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {t('proratedDesc', { price: seatPrice.toLocaleString() })}
            </p>
          </button>

          {upgradeOptions.length > 0 && (
            <>
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-border" />
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="bg-background px-2 text-muted-foreground">{t('orUpgradePlan')}</span>
                </div>
              </div>

              {upgradeOptions.map((plan) => (
                <button
                  key={plan.id}
                  onClick={() => onUpgrade(plan.id)}
                  className="w-full rounded-lg border border-border p-4 text-left transition-all hover:border-primary/50"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-foreground">
                        {t('upgradeTo', { plan: plan.name })}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {t('seatsIncluded', { count: plan.features?.max_team_members ?? 0 })}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-foreground">
                        {t('monthlyPrice', { price: plan.price_kes.toLocaleString() })}
                      </p>
                      <ArrowUpRight className="ml-auto h-4 w-4 text-muted-foreground" />
                    </div>
                  </div>
                </button>
              ))}
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t('cancel')}
          </Button>
          <Button
            onClick={handleAddSeat}
            disabled={!selectedOption || loading}
          >
            {loading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Zap className="mr-2 h-4 w-4" />
            )}
            {selectedOption === 'seat'
              ? t('payNow', { amount: proratedCharge.toLocaleString() })
              : t('selectOption')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
