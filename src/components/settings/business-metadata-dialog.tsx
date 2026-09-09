'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Loader2, Save, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/hooks/use-auth';
import type { 
  LogisticsMetadata, 
  ServiceMetadata, 
  HealthcareMetadata,
  BeautyMetadata,
  FitnessMetadata,
  AutomotiveMetadata,
  PetServicesMetadata,
  CleaningMetadata,
} from '@/lib/assignments/team-metadata';
import { getDefaultMetadataForBusinessType } from '@/lib/assignments/team-metadata';

interface BusinessMetadataDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  memberUserId: string;
  memberName: string;
}

export function BusinessMetadataDialog({
  open,
  onOpenChange,
  memberUserId,
  memberName,
}: BusinessMetadataDialogProps) {
  const { accountId, businessType } = useAuth();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [metadata, setMetadata] = useState<any>(null);

  useEffect(() => {
    if (open && accountId && memberUserId) {
      loadMetadata();
    }
  }, [open, accountId, memberUserId]);

  async function loadMetadata() {
    setLoading(true);
    try {
      const res = await fetch(`/api/account/members/${memberUserId}/metadata`);
      if (!res.ok) throw new Error('Failed to load metadata');
      const data = await res.json();
      setMetadata(data.business_metadata || {});
    } catch (err) {
      console.error('[BusinessMetadataDialog] load error:', err);
      toast.error('Failed to load business metadata');
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    if (!accountId || !memberUserId) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/account/members/${memberUserId}/metadata`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_metadata: metadata }),
      });
      if (!res.ok) throw new Error('Failed to save metadata');
      toast.success('Business metadata updated');
      onOpenChange(false);
    } catch (err) {
      console.error('[BusinessMetadataDialog] save error:', err);
      toast.error('Failed to save business metadata');
    } finally {
      setSaving(false);
    }
  }

  function updateMetadata(path: string, value: unknown) {
    setMetadata((prev: any) => {
      const updated = { ...prev };
      const keys = path.split('.');
      let current = updated;
      for (let i = 0; i < keys.length - 1; i++) {
        if (!current[keys[i]]) current[keys[i]] = {};
        current = current[keys[i]];
      }
      current[keys[keys.length - 1]] = value;
      return updated;
    });
  }

  if (loading) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="size-6 animate-spin" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Business Metadata</DialogTitle>
          <DialogDescription>
            Configure business-specific attributes for {memberName}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {businessType === 'logistics_delivery' || businessType === 'courier' || businessType === 'transportation' ? (
            <LogisticsMetadataForm 
              metadata={metadata?.logistics || getDefaultMetadataForBusinessType(businessType).logistics}
              onChange={(value) => updateMetadata('logistics', value)}
            />
          ) : businessType === 'service_business' || businessType === 'professional_services' ? (
            <ServiceMetadataForm 
              metadata={metadata?.service || getDefaultMetadataForBusinessType(businessType).service}
              onChange={(value) => updateMetadata('service', value)}
            />
          ) : businessType === 'healthcare' || businessType === 'healthcare_clinic' ? (
            <HealthcareMetadataForm 
              metadata={metadata?.healthcare || getDefaultMetadataForBusinessType(businessType).healthcare}
              onChange={(value) => updateMetadata('healthcare', value)}
            />
          ) : businessType === 'beauty_wellness' ? (
            <BeautyMetadataForm 
              metadata={metadata?.beauty || getDefaultMetadataForBusinessType(businessType).beauty}
              onChange={(value) => updateMetadata('beauty', value)}
            />
          ) : businessType === 'fitness' ? (
            <FitnessMetadataForm 
              metadata={metadata?.fitness || getDefaultMetadataForBusinessType(businessType).fitness}
              onChange={(value) => updateMetadata('fitness', value)}
            />
          ) : businessType === 'automotive' ? (
            <AutomotiveMetadataForm 
              metadata={metadata?.automotive || getDefaultMetadataForBusinessType(businessType).automotive}
              onChange={(value) => updateMetadata('automotive', value)}
            />
          ) : businessType === 'pet_services' ? (
            <PetServicesMetadataForm 
              metadata={metadata?.pet_services || getDefaultMetadataForBusinessType(businessType).pet_services}
              onChange={(value) => updateMetadata('pet_services', value)}
            />
          ) : businessType === 'cleaning_services' || businessType === 'maintenance' ? (
            <CleaningMetadataForm 
              metadata={metadata?.cleaning || getDefaultMetadataForBusinessType(businessType).cleaning}
              onChange={(value) => updateMetadata('cleaning', value)}
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              No business-specific metadata configured for this business type.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Logistics Metadata Form
// ============================================================================

function LogisticsMetadataForm({ metadata, onChange }: { metadata: LogisticsMetadata, onChange: (value: LogisticsMetadata) => void }) {
  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold">Logistics Attributes</h3>
      
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Vehicle Type</Label>
          <Select 
            value={metadata.vehicle_type} 
            onValueChange={(v) => onChange({ ...metadata, vehicle_type: v as any })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="motorcycle">Motorcycle</SelectItem>
              <SelectItem value="van">Van</SelectItem>
              <SelectItem value="truck">Truck</SelectItem>
              <SelectItem value="pickup">Pickup</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Freight Capacity</Label>
          <Select 
            value={metadata.freight_capacity} 
            onValueChange={(v) => onChange({ ...metadata, freight_capacity: v as any })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="small">Small</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="large">Large</SelectItem>
              <SelectItem value="xl">Extra Large</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label>Zone Coverage (comma-separated)</Label>
        <Input 
          value={metadata.zone_coverage?.join(', ') || ''}
          onChange={(e) => onChange({ 
            ...metadata, 
            zone_coverage: e.target.value.split(',').map(s => s.trim()).filter(Boolean)
          })}
          placeholder="Fedha, Nyayo, Tassia"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Max Active Orders</Label>
          <Input 
            type="number"
            value={metadata.max_active_orders}
            onChange={(e) => onChange({ ...metadata, max_active_orders: parseInt(e.target.value) || 5 })}
          />
        </div>

        <div className="space-y-2">
          <Label>License Plate</Label>
          <Input 
            value={metadata.license_plate || ''}
            onChange={(e) => onChange({ ...metadata, license_plate: e.target.value })}
            placeholder="KAA 123A"
          />
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Service Metadata Form
// ============================================================================

function ServiceMetadataForm({ metadata, onChange }: { metadata: ServiceMetadata, onChange: (value: ServiceMetadata) => void }) {
  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold">Service Attributes</h3>
      
      <div className="space-y-2">
        <Label>Certifications (comma-separated)</Label>
        <Input 
          value={metadata.certifications?.join(', ') || ''}
          onChange={(e) => onChange({ 
            ...metadata, 
            certifications: e.target.value.split(',').map(s => s.trim()).filter(Boolean)
          })}
          placeholder="plumbing, electrical"
        />
      </div>

      <div className="space-y-2">
        <Label>Service Areas (comma-separated)</Label>
        <Input 
          value={metadata.service_areas?.join(', ') || ''}
          onChange={(e) => onChange({ 
            ...metadata, 
            service_areas: e.target.value.split(',').map(s => s.trim()).filter(Boolean)
          })}
          placeholder="Nairobi West, Nairobi East"
        />
      </div>

      <div className="space-y-2">
        <Label>Max Concurrent Appointments</Label>
        <Input 
          type="number"
          value={metadata.max_concurrent_appointments || 3}
          onChange={(e) => onChange({ ...metadata, max_concurrent_appointments: parseInt(e.target.value) || 3 })}
        />
      </div>
    </div>
  );
}

// ============================================================================
// Healthcare Metadata Form
// ============================================================================

function HealthcareMetadataForm({ metadata, onChange }: { metadata: HealthcareMetadata, onChange: (value: HealthcareMetadata) => void }) {
  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold">Healthcare Attributes</h3>
      
      <div className="space-y-2">
        <Label>Specialization</Label>
        <Select 
          value={metadata.specialization} 
          onValueChange={(v) => onChange({ ...metadata, specialization: v as any })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="general_practitioner">General Practitioner</SelectItem>
            <SelectItem value="pediatrician">Pediatrician</SelectItem>
            <SelectItem value="dentist">Dentist</SelectItem>
            <SelectItem value="specialist">Specialist</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>License Number</Label>
        <Input 
          value={metadata.license_number || ''}
          onChange={(e) => onChange({ ...metadata, license_number: e.target.value })}
          placeholder="MP-12345"
        />
      </div>

      <div className="space-y-2">
        <Label>Max Patients Per Day</Label>
        <Input 
          type="number"
          value={metadata.max_patients_per_day || 20}
          onChange={(e) => onChange({ ...metadata, max_patients_per_day: parseInt(e.target.value) || 20 })}
        />
      </div>
    </div>
  );
}

// ============================================================================
// Beauty Metadata Form
// ============================================================================

function BeautyMetadataForm({ metadata, onChange }: { metadata: BeautyMetadata, onChange: (value: BeautyMetadata) => void }) {
  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold">Beauty & Wellness Attributes</h3>
      
      <div className="space-y-2">
        <Label>Services Offered (comma-separated)</Label>
        <Input 
          value={metadata.services_offered?.join(', ') || ''}
          onChange={(e) => onChange({ 
            ...metadata, 
            services_offered: e.target.value.split(',').map(s => s.trim()).filter(Boolean)
          })}
          placeholder="haircut, manicure, facial"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Station Number</Label>
          <Input 
            type="number"
            value={metadata.station_number || ''}
            onChange={(e) => onChange({ ...metadata, station_number: parseInt(e.target.value) || undefined })}
          />
        </div>

        <div className="space-y-2">
          <Label>Max Appointments Per Day</Label>
          <Input 
            type="number"
            value={metadata.max_appointments_per_day || 8}
            onChange={(e) => onChange({ ...metadata, max_appointments_per_day: parseInt(e.target.value) || 8 })}
          />
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Fitness Metadata Form
// ============================================================================

function FitnessMetadataForm({ metadata, onChange }: { metadata: FitnessMetadata, onChange: (value: FitnessMetadata) => void }) {
  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold">Fitness Attributes</h3>
      
      <div className="space-y-2">
        <Label>Certifications (comma-separated)</Label>
        <Input 
          value={metadata.certifications?.join(', ') || ''}
          onChange={(e) => onChange({ 
            ...metadata, 
            certifications: e.target.value.split(',').map(s => s.trim()).filter(Boolean)
          })}
          placeholder="personal_trainer, yoga_instructor"
        />
      </div>

      <div className="space-y-2">
        <Label>Specializations (comma-separated)</Label>
        <Input 
          value={metadata.specializations?.join(', ') || ''}
          onChange={(e) => onChange({ 
            ...metadata, 
            specializations: e.target.value.split(',').map(s => s.trim()).filter(Boolean)
          })}
          placeholder="strength, cardio, yoga"
        />
      </div>

      <div className="space-y-2">
        <Label>Max Clients Per Session</Label>
        <Input 
          type="number"
          value={metadata.max_clients_per_session || 1}
          onChange={(e) => onChange({ ...metadata, max_clients_per_session: parseInt(e.target.value) || 1 })}
        />
      </div>
    </div>
  );
}

// ============================================================================
// Automotive Metadata Form
// ============================================================================

function AutomotiveMetadataForm({ metadata, onChange }: { metadata: AutomotiveMetadata, onChange: (value: AutomotiveMetadata) => void }) {
  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold">Automotive Attributes</h3>
      
      <div className="space-y-2">
        <Label>Specializations (comma-separated)</Label>
        <Input 
          value={metadata.specializations?.join(', ') || ''}
          onChange={(e) => onChange({ 
            ...metadata, 
            specializations: e.target.value.split(',').map(s => s.trim()).filter(Boolean)
          })}
          placeholder="engine, brakes, electrical"
        />
      </div>

      <div className="space-y-2">
        <Label>Certifications (comma-separated)</Label>
        <Input 
          value={metadata.certifications?.join(', ') || ''}
          onChange={(e) => onChange({ 
            ...metadata, 
            certifications: e.target.value.split(',').map(s => s.trim()).filter(Boolean)
          })}
          placeholder="ASE, manufacturer_certified"
        />
      </div>

      <div className="space-y-2">
        <Label>Service Areas (comma-separated)</Label>
        <Input 
          value={metadata.service_areas?.join(', ') || ''}
          onChange={(e) => onChange({ 
            ...metadata, 
            service_areas: e.target.value.split(',').map(s => s.trim()).filter(Boolean)
          })}
          placeholder="Nairobi West, Nairobi East"
        />
      </div>
    </div>
  );
}

// ============================================================================
// Pet Services Metadata Form
// ============================================================================

function PetServicesMetadataForm({ metadata, onChange }: { metadata: PetServicesMetadata, onChange: (value: PetServicesMetadata) => void }) {
  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold">Pet Services Attributes</h3>
      
      <div className="space-y-2">
        <Label>Specializations (comma-separated)</Label>
        <Input 
          value={metadata.specializations?.join(', ') || ''}
          onChange={(e) => onChange({ 
            ...metadata, 
            specializations: e.target.value.split(',').map(s => s.trim()).filter(Boolean)
          })}
          placeholder="grooming, training, veterinary"
        />
      </div>

      <div className="space-y-2">
        <Label>Certifications (comma-separated)</Label>
        <Input 
          value={metadata.certifications?.join(', ') || ''}
          onChange={(e) => onChange({ 
            ...metadata, 
            certifications: e.target.value.split(',').map(s => s.trim()).filter(Boolean)
          })}
          placeholder="certified_groomer, pet_first_aid"
        />
      </div>

      <div className="space-y-2">
        <Label>Service Areas (comma-separated)</Label>
        <Input 
          value={metadata.service_areas?.join(', ') || ''}
          onChange={(e) => onChange({ 
            ...metadata, 
            service_areas: e.target.value.split(',').map(s => s.trim()).filter(Boolean)
          })}
          placeholder="Nairobi West, Nairobi East"
        />
      </div>
    </div>
  );
}

// ============================================================================
// Cleaning Metadata Form
// ============================================================================

function CleaningMetadataForm({ metadata, onChange }: { metadata: CleaningMetadata, onChange: (value: CleaningMetadata) => void }) {
  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold">Cleaning Services Attributes</h3>
      
      <div className="space-y-2">
        <Label>Specializations (comma-separated)</Label>
        <Input 
          value={metadata.specializations?.join(', ') || ''}
          onChange={(e) => onChange({ 
            ...metadata, 
            specializations: e.target.value.split(',').map(s => s.trim()).filter(Boolean)
          })}
          placeholder="residential, commercial, deep_clean"
        />
      </div>

      <div className="space-y-2">
        <Label>Service Areas (comma-separated)</Label>
        <Input 
          value={metadata.service_areas?.join(', ') || ''}
          onChange={(e) => onChange({ 
            ...metadata, 
            service_areas: e.target.value.split(',').map(s => s.trim()).filter(Boolean)
          })}
          placeholder="Nairobi West, Nairobi East"
        />
      </div>

      <div className="space-y-2">
        <Label>Max Jobs Per Day</Label>
        <Input 
          type="number"
          value={metadata.max_jobs_per_day || 5}
          onChange={(e) => onChange({ ...metadata, max_jobs_per_day: parseInt(e.target.value) || 5 })}
        />
      </div>
    </div>
  );
}
