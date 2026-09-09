'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { CreditCard, Plus, Trash2, GripVertical, Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/use-auth';

interface PaymentMethod {
  type: string;
  name: string;
  till_number?: string;
  paybill_number?: string;
  account_number?: string;
  bank_name?: string;
  instructions?: string;
  is_default?: boolean;
}

const PAYMENT_TYPES = [
  { value: 'mpesa_till', label: 'M-Pesa Till' },
  { value: 'mpesa_paybill', label: 'M-Pesa Paybill' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'cash', label: 'Cash on Pickup' },
  { value: 'card', label: 'Card Payment' },
  { value: 'other', label: 'Other' },
];

export function PaymentMethodsSettings() {
  const t = useTranslations('PaymentMethodsSettings');
  const { activeWorkspace } = useAuth();
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function fetchData() {
      if (!activeWorkspace?.account_id) return;

      try {
        const res = await fetch(`/api/settings/payment-methods?account_id=${activeWorkspace.account_id}`);
        if (res.ok) {
          const data = await res.json();
          setMethods(data.payment_methods || []);
        }
      } catch (err) {
        console.error('Failed to fetch payment methods:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [activeWorkspace?.account_id]);

  const handleAdd = () => {
    setMethods([
      ...methods,
      {
        type: 'mpesa_till',
        name: '',
        till_number: '',
        is_default: methods.length === 0,
      },
    ]);
  };

  const handleRemove = (index: number) => {
    const updated = methods.filter((_, i) => i !== index);
    if (methods[index]?.is_default && updated.length > 0) {
      updated[0].is_default = true;
    }
    setMethods(updated);
  };

  const handleUpdate = (index: number, field: keyof PaymentMethod, value: string | boolean) => {
    const updated = [...methods];
    updated[index] = { ...updated[index], [field]: value };
    setMethods(updated);
  };

  const handleSetDefault = (index: number) => {
    const updated = methods.map((m, i) => ({
      ...m,
      is_default: i === index,
    }));
    setMethods(updated);
  };

  const handleSave = async () => {
    if (!activeWorkspace?.account_id) return;

    setSaving(true);
    try {
      const res = await fetch('/api/settings/payment-methods', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          account_id: activeWorkspace.account_id,
          payment_methods: methods,
        }),
      });

      if (!res.ok) {
        throw new Error((await res.json()).error || 'Failed to save');
      }

      toast.success('Payment methods saved');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CreditCard className="h-5 w-5" />
          Payment Methods
        </CardTitle>
        <CardDescription>
          Configure how customers can pay for orders and deliveries.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {methods.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            No payment methods configured. Add one below.
          </p>
        )}

        {methods.map((method, index) => (
          <div
            key={index}
            className="border rounded-lg p-4 space-y-3"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <GripVertical className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">Method {index + 1}</span>
                {method.is_default && (
                  <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded">
                    Default
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {!method.is_default && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleSetDefault(index)}
                  >
                    Set as default
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRemove(index)}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Type</Label>
                <Select
                  value={method.type}
                  onValueChange={(value) => value && handleUpdate(index, 'type', value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAYMENT_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label>Display Name</Label>
                <Input
                  value={method.name}
                  onChange={(e) => handleUpdate(index, 'name', e.target.value)}
                  placeholder="e.g., M-Pesa Till"
                />
              </div>
            </div>

            {method.type === 'mpesa_till' && (
              <div className="space-y-1">
                <Label>Till Number</Label>
                <Input
                  value={method.till_number || ''}
                  onChange={(e) => handleUpdate(index, 'till_number', e.target.value)}
                  placeholder="e.g., 123456"
                />
              </div>
            )}

            {method.type === 'mpesa_paybill' && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Paybill Number</Label>
                  <Input
                    value={method.paybill_number || ''}
                    onChange={(e) => handleUpdate(index, 'paybill_number', e.target.value)}
                    placeholder="e.g., 7891011"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Account Number</Label>
                  <Input
                    value={method.account_number || ''}
                    onChange={(e) => handleUpdate(index, 'account_number', e.target.value)}
                    placeholder="e.g., 12345"
                  />
                </div>
              </div>
            )}

            {method.type === 'bank_transfer' && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Bank Name</Label>
                  <Input
                    value={method.bank_name || ''}
                    onChange={(e) => handleUpdate(index, 'bank_name', e.target.value)}
                    placeholder="e.g., KCB"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Account Number</Label>
                  <Input
                    value={method.account_number || ''}
                    onChange={(e) => handleUpdate(index, 'account_number', e.target.value)}
                    placeholder="e.g., 1234567890"
                  />
                </div>
              </div>
            )}

            <div className="space-y-1">
              <Label>Instructions (optional)</Label>
              <Input
                value={method.instructions || ''}
                onChange={(e) => handleUpdate(index, 'instructions', e.target.value)}
                placeholder="e.g., Pay before dispatch. Send screenshot after."
              />
            </div>
          </div>
        ))}

        <div className="flex justify-between pt-2">
          <Button variant="outline" onClick={handleAdd}>
            <Plus className="h-4 w-4 mr-2" />
            Add Payment Method
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save Changes
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
