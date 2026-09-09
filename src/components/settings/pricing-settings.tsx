'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Calculator, Loader2, Plus, Trash2, Save } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/use-auth';
import { cn } from '@/lib/utils';

interface PricingFormula {
  base: number;
  item_price: number;
  stop_price: number;
  weight_price: number;
  km_price: number;
  wednesday_discount: number;
  zones: string[];
  requires_prepayment: boolean;
  zone_type: string;
}

interface Offering {
  id: string;
  name: string;
  type: string;
  pricing: PricingFormula | null;
}

export function PricingSettings() {
  const t = useTranslations('PricingSettings');
  const { activeWorkspace } = useAuth();

  const [offerings, setOfferings] = useState<Offering[]>([]);
  const [selectedOffering, setSelectedOffering] = useState<Offering | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form state
  const [formula, setFormula] = useState<PricingFormula >({
    base: 0,
    item_price: 0,
    stop_price: 0,
    weight_price: 0,
    km_price: 0,
    wednesday_discount: 0,
    zones: [],
    requires_prepayment: false,
    zone_type: 'local',
  });

  const [newZone, setNewZone] = useState('');

  useEffect(() => {
    async function fetchOfferings() {
      if (!activeWorkspace?.account_id) return;

      try {
        const res = await fetch(`/api/offerings?account_id=${activeWorkspace.account_id}&limit=100`);
        if (res.ok) {
          const data = await res.json();
          const offeringsWithPricing = data.offerings.map((offering: any) => ({
            id: offering.id,
            name: offering.name,
            type: offering.type,
            pricing: offering.metadata?.pricing || null,
          }));
          setOfferings(offeringsWithPricing);
        }
      } catch (err) {
        console.error('Failed to fetch offerings:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchOfferings();
  }, [activeWorkspace?.account_id]);

  const handleSelectOffering = (offering: Offering) => {
    setSelectedOffering(offering);
    if (offering.pricing) {
      setFormula(offering.pricing);
    } else {
      setFormula({
        base: 0,
        item_price: 0,
        stop_price: 0,
        weight_price: 0,
        km_price: 0,
        wednesday_discount: 0,
        zones: [],
        requires_prepayment: false,
        zone_type: 'local',
      });
    }
  };

  const handleSaveFormula = async () => {
    if (!selectedOffering || !activeWorkspace?.account_id) return;

    setSaving(true);
    try {
      const res = await fetch('/api/pricing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          offering_id: selectedOffering.id,
          pricing: formula,
        }),
      });

      if (!res.ok) {
        throw new Error((await res.json()).error || 'Failed to save pricing formula');
      }

      toast.success('Pricing formula saved');
      
      // Refresh offerings
      const offeringsRes = await fetch(`/api/offerings?account_id=${activeWorkspace.account_id}&limit=100`);
      if (offeringsRes.ok) {
        const data = await offeringsRes.json();
        const offeringsWithPricing = data.offerings.map((offering: any) => ({
          id: offering.id,
          name: offering.name,
          type: offering.type,
          pricing: offering.metadata?.pricing || null,
        }));
        setOfferings(offeringsWithPricing);
        setSelectedOffering(offeringsWithPricing.find((o: Offering) => o.id === selectedOffering.id) || null);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save pricing formula');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteFormula = async () => {
    if (!selectedOffering) return;

    setSaving(true);
    try {
      const res = await fetch(`/api/pricing?offering_id=${selectedOffering.id}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        throw new Error((await res.json()).error || 'Failed to delete pricing formula');
      }

      toast.success('Pricing formula deleted');
      setSelectedOffering(null);
      setFormula({
        base: 0,
        item_price: 0,
        stop_price: 0,
        weight_price: 0,
        km_price: 0,
        wednesday_discount: 0,
        zones: [],
        requires_prepayment: false,
        zone_type: 'local',
      });

      // Refresh offerings
      if (activeWorkspace?.account_id) {
        const offeringsRes = await fetch(`/api/offerings?account_id=${activeWorkspace.account_id}&limit=100`);
        if (offeringsRes.ok) {
          const data = await offeringsRes.json();
          const offeringsWithPricing = data.offerings.map((offering: any) => ({
            id: offering.id,
            name: offering.name,
            type: offering.type,
            pricing: offering.metadata?.pricing || null,
          }));
          setOfferings(offeringsWithPricing);
        }
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete pricing formula');
    } finally {
      setSaving(false);
    }
  };

  const handleAddZone = () => {
    if (newZone.trim() && !formula.zones.includes(newZone.trim())) {
      setFormula({ ...formula, zones: [...formula.zones, newZone.trim()] });
      setNewZone('');
    }
  };

  const handleRemoveZone = (zone: string) => {
    setFormula({ ...formula, zones: formula.zones.filter((z) => z !== zone) });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="border-border bg-card">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Calculator className="h-5 w-5 text-primary" />
            <CardTitle>Pricing Formulas</CardTitle>
          </div>
          <CardDescription>
            Configure dynamic pricing formulas for your services. These formulas are used by AI agents to calculate prices automatically.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Offering Selection */}
          <div className="space-y-3">
            <Label>Select Offering</Label>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {offerings.map((offering) => (
                <button
                  key={offering.id}
                  type="button"
                  onClick={() => handleSelectOffering(offering)}
                  className={cn(
                    'flex items-center justify-between rounded-lg border p-3 text-left transition-all',
                    selectedOffering?.id === offering.id
                      ? 'border-primary bg-primary/10'
                      : 'border-border hover:border-primary/50 hover:bg-muted/50'
                  )}
                >
                  <div>
                    <p className="text-sm font-medium">{offering.name}</p>
                    <p className="text-xs text-muted-foreground">{offering.type}</p>
                  </div>
                  {offering.pricing && (
                    <div className="h-2 w-2 rounded-full bg-green-500" />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Formula Editor */}
          {selectedOffering && (
            <div className="space-y-4 border-t pt-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium">
                  {selectedOffering.name} - Pricing Formula
                </h3>
                {selectedOffering.pricing && (
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={handleDeleteFormula}
                    disabled={saving}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete
                  </Button>
                )}
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="base">Base Price</Label>
                  <Input
                    id="base"
                    type="number"
                    value={formula.base}
                    onChange={(e) => setFormula({ ...formula, base: Number(e.target.value) })}
                    placeholder="0"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="item_price">Price per Item</Label>
                  <Input
                    id="item_price"
                    type="number"
                    value={formula.item_price}
                    onChange={(e) => setFormula({ ...formula, item_price: Number(e.target.value) })}
                    placeholder="0"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="stop_price">Price per Stop</Label>
                  <Input
                    id="stop_price"
                    type="number"
                    value={formula.stop_price}
                    onChange={(e) => setFormula({ ...formula, stop_price: Number(e.target.value) })}
                    placeholder="0"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="weight_price">Price per kg</Label>
                  <Input
                    id="weight_price"
                    type="number"
                    value={formula.weight_price}
                    onChange={(e) => setFormula({ ...formula, weight_price: Number(e.target.value) })}
                    placeholder="0"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="km_price">Price per km</Label>
                  <Input
                    id="km_price"
                    type="number"
                    value={formula.km_price}
                    onChange={(e) => setFormula({ ...formula, km_price: Number(e.target.value) })}
                    placeholder="0"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="wednesday_discount">Wednesday Discount (0-1)</Label>
                  <Input
                    id="wednesday_discount"
                    type="number"
                    step="0.01"
                    min="0"
                    max="1"
                    value={formula.wednesday_discount}
                    onChange={(e) => setFormula({ ...formula, wednesday_discount: Number(e.target.value) })}
                    placeholder="0.1"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="zone_type">Zone Type</Label>
                <select
                  id="zone_type"
                  value={formula.zone_type}
                  onChange={(e) => setFormula({ ...formula, zone_type: e.target.value })}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="local">Local</option>
                  <option value="extended">Extended</option>
                  <option value="premium">Premium</option>
                  <option value="custom">Custom</option>
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="requires_prepayment">Requires Prepayment</Label>
                <div className="flex items-center gap-2">
                  <input
                    id="requires_prepayment"
                    type="checkbox"
                    checked={formula.requires_prepayment}
                    onChange={(e) => setFormula({ ...formula, requires_prepayment: e.target.checked })}
                    className="h-4 w-4"
                  />
                  <span className="text-sm text-muted-foreground">
                    Customers must prepay for this zone
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Zones</Label>
                <div className="flex gap-2">
                  <Input
                    value={newZone}
                    onChange={(e) => setNewZone(e.target.value)}
                    placeholder="Add zone (e.g., Fedha, Nyayo)"
                    onKeyDown={(e) => e.key === 'Enter' && handleAddZone()}
                  />
                  <Button type="button" onClick={handleAddZone}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {formula.zones.map((zone) => (
                    <div
                      key={zone}
                      className="flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-sm"
                    >
                      {zone}
                      <button
                        type="button"
                        onClick={() => handleRemoveZone(zone)}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <Button
                type="button"
                onClick={handleSaveFormula}
                disabled={saving}
                className="w-full"
              >
                <Save className="h-4 w-4 mr-2" />
                {saving ? 'Saving...' : 'Save Formula'}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
