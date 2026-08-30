'use client';

import { useState, useEffect, useRef } from 'react';
import { Loader2, Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/use-auth';
import {
  type Offering,
  type OfferingType,
  type OfferingStatus,
  type PriceType,
  type OfferingCategory,
  OFFERING_TYPES,
  OFFERING_STATUSES,
  PRICE_TYPES,
  getAllowedOfferingTypes,
} from '@/lib/business/offerings';

// ============================================================
// Type-specific metadata field definitions
// ============================================================

interface MetaField {
  key: string;
  label: string;
  type: 'text' | 'number' | 'textarea' | 'tags';
  placeholder?: string;
}

const TYPE_META_FIELDS: Record<OfferingType, MetaField[]> = {
  product: [
    { key: 'brand', label: 'Brand', type: 'text', placeholder: 'e.g., Samsung, Apple' },
    { key: 'sku', label: 'SKU', type: 'text', placeholder: 'e.g., SKU-001' },
    { key: 'unit', label: 'Unit', type: 'text', placeholder: 'e.g., piece, kg, litre' },
    { key: 'weight', label: 'Weight', type: 'text', placeholder: 'e.g., 500g, 1.2kg' },
    { key: 'dimensions', label: 'Dimensions', type: 'text', placeholder: 'e.g., 10x20x5 cm' },
  ],
  menu_item: [
    { key: 'ingredients', label: 'Ingredients', type: 'textarea', placeholder: 'List main ingredients' },
    { key: 'allergens', label: 'Allergens', type: 'text', placeholder: 'e.g., nuts, dairy, gluten' },
    { key: 'portion_size', label: 'Portion Size', type: 'text', placeholder: 'e.g., 300ml, 500g' },
    { key: 'spice_level', label: 'Spice Level', type: 'text', placeholder: 'e.g., mild, medium, hot' },
    { key: 'preparation_time', label: 'Preparation Time', type: 'text', placeholder: 'e.g., 15 min, 30 min' },
  ],
  room: [
    { key: 'room_type', label: 'Room Type', type: 'text', placeholder: 'e.g., Standard, Deluxe, Suite' },
    { key: 'capacity', label: 'Max Guests', type: 'number', placeholder: '2' },
    { key: 'bed_type', label: 'Bed Type', type: 'text', placeholder: 'e.g., King, Twin, Queen' },
    { key: 'floor', label: 'Floor', type: 'text', placeholder: 'e.g., 3rd floor, Ground' },
    { key: 'amenities', label: 'Amenities', type: 'tags', placeholder: 'wifi, minibar, safe, balcony' },
    { key: 'area_sqm', label: 'Area (m²)', type: 'number', placeholder: '35' },
  ],
  service: [
    { key: 'duration', label: 'Duration', type: 'text', placeholder: 'e.g., 2 hours, 1 day' },
    { key: 'delivery_mode', label: 'Delivery Mode', type: 'text', placeholder: 'e.g., On-site, Remote, Hybrid' },
    { key: 'includes', label: 'Includes', type: 'tags', placeholder: 'consultation, follow-up, report' },
  ],
  course: [
    { key: 'duration', label: 'Duration', type: 'text', placeholder: 'e.g., 8 weeks, 3 months' },
    { key: 'level', label: 'Level', type: 'text', placeholder: 'e.g., Beginner, Intermediate, Advanced' },
    { key: 'delivery_mode', label: 'Delivery Mode', type: 'text', placeholder: 'e.g., Online, In-person, Hybrid' },
    { key: 'prerequisites', label: 'Prerequisites', type: 'textarea', placeholder: 'Any required prior knowledge' },
    { key: 'certificate', label: 'Certificate', type: 'text', placeholder: 'e.g., Yes, No, On completion' },
    { key: 'max_students', label: 'Max Students', type: 'number', placeholder: '30' },
  ],
  program: [
    { key: 'target_group', label: 'Target Group', type: 'text', placeholder: 'e.g., Youth 18-35, Women' },
    { key: 'eligibility', label: 'Eligibility', type: 'textarea', placeholder: 'Who can participate' },
    { key: 'duration', label: 'Duration', type: 'text', placeholder: 'e.g., 6 months, 1 year' },
    { key: 'location', label: 'Location', type: 'text', placeholder: 'e.g., Nairobi, Online' },
    { key: 'capacity', label: 'Max Participants', type: 'number', placeholder: '50' },
  ],
  property: [
    { key: 'property_type', label: 'Property Type', type: 'text', placeholder: 'e.g., Apartment, Office, Villa' },
    { key: 'bedrooms', label: 'Bedrooms', type: 'number', placeholder: '3' },
    { key: 'bathrooms', label: 'Bathrooms', type: 'number', placeholder: '2' },
    { key: 'area_sqft', label: 'Area (sqft)', type: 'number', placeholder: '1200' },
    { key: 'location', label: 'Location', type: 'text', placeholder: 'e.g., Kilimani, Nairobi' },
    { key: 'parking', label: 'Parking', type: 'text', placeholder: 'e.g., 1 car, Street' },
    { key: 'furnished', label: 'Furnished', type: 'text', placeholder: 'e.g., Fully, Partially, No' },
  ],
  event: [
    { key: 'event_date', label: 'Event Date', type: 'text', placeholder: 'e.g., 2026-03-15' },
    { key: 'venue', label: 'Venue', type: 'text', placeholder: 'e.g., Kenyatta Conference Center' },
    { key: 'capacity', label: 'Max Attendees', type: 'number', placeholder: '200' },
    { key: 'ticket_type', label: 'Ticket Type', type: 'text', placeholder: 'e.g., General, VIP, Early Bird' },
  ],
  package: [
    { key: 'items', label: 'Package Items', type: 'tags', placeholder: 'item1, item2, item3' },
    { key: 'validity', label: 'Validity', type: 'text', placeholder: 'e.g., 30 days, 1 year' },
  ],
  membership: [
    { key: 'tier', label: 'Tier', type: 'text', placeholder: 'e.g., Basic, Premium, VIP' },
    { key: 'billing_cycle', label: 'Billing Cycle', type: 'text', placeholder: 'e.g., Monthly, Yearly' },
    { key: 'benefits', label: 'Benefits', type: 'tags', placeholder: 'benefit1, benefit2' },
  ],
  resource: [
    { key: 'format', label: 'Format', type: 'text', placeholder: 'e.g., PDF, Video, Link' },
    { key: 'language', label: 'Language', type: 'text', placeholder: 'e.g., English, Swahili' },
  ],
  other: [],
};

// ============================================================
// Component
// ============================================================

interface CatalogFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  offering?: Offering | null;
  onSuccess: () => void;
}

export function CatalogForm({ open, onOpenChange, offering, onSuccess }: CatalogFormProps) {
  const { activeAccountId, enabledCapabilities } = useAuth();
  const [saving, setSaving] = useState(false);

  // Core fields
  const [name, setName] = useState('');
  const [type, setType] = useState<OfferingType>('product');
  const [shortDescription, setShortDescription] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<OfferingStatus>('draft');
  const [price, setPrice] = useState('');
  const [priceType, setPriceType] = useState<PriceType>('fixed');
  const [referenceCode, setReferenceCode] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [metadata, setMetadata] = useState<Record<string, string>>({});

  // Images
  const [pendingImages, setPendingImages] = useState<{ file: File; preview: string; alt: string }[]>([]);
  const fileInputImageRef = useRef<HTMLInputElement>(null);

  const [categories, setCategories] = useState<OfferingCategory[]>([]);
  const allowedTypes = getAllowedOfferingTypes(enabledCapabilities);
  const isEditing = !!offering;

  // Load categories
  useEffect(() => {
    if (!open || !activeAccountId) return;
    fetch(`/api/offerings/categories?account_id=${activeAccountId}`)
      .then(res => res.json())
      .then(data => setCategories(data.categories || []))
      .catch(err => console.error('Failed to load categories:', err));
  }, [open, activeAccountId]);

  // Reset form when opening
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!open) return;

    if (offering) {
      setName(offering.name);
      setType(offering.type);
      setShortDescription(offering.short_description || '');
      setDescription(offering.description || '');
      setStatus(offering.status);
      setPrice(offering.price?.toString() || '');
      setPriceType(offering.price_type);
      setReferenceCode(offering.reference_code || '');
      setCategoryId(offering.category_id || '');
      // Parse metadata - convert all values to strings for form inputs
      const meta: Record<string, string> = {};
      if (offering.metadata && typeof offering.metadata === 'object') {
        for (const [k, v] of Object.entries(offering.metadata)) {
          if (Array.isArray(v)) meta[k] = v.join(', ');
          else if (v != null) meta[k] = String(v);
        }
      }
      setMetadata(meta);
      setPendingImages([]);
    } else {
      setName('');
      setType(allowedTypes[0] || 'product');
      setShortDescription('');
      setDescription('');
      setStatus('draft');
      setPrice('');
      setPriceType('fixed');
      setReferenceCode('');
      setCategoryId('');
      setMetadata({});
      setPendingImages([]);
    }
  }, [open, offering, allowedTypes]);

  // When type changes, reset metadata to defaults for that type
  useEffect(() => {
    if (!open) return;
    const fields = TYPE_META_FIELDS[type] || [];
    setMetadata(prev => {
      const next: Record<string, string> = {};
      for (const f of fields) {
        next[f.key] = prev[f.key] || '';
      }
      return next;
    });
  }, [type, open]);

  const handleMetaChange = (key: string, value: string) => {
    setMetadata(prev => ({ ...prev, [key]: value }));
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const newImages: { file: File; preview: string; alt: string }[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.size > 5 * 1024 * 1024) {
        toast.error(`${file.name} is too large (max 5MB)`);
        continue;
      }
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
        toast.error(`${file.name} is not a supported image type`);
        continue;
      }
      newImages.push({
        file,
        preview: URL.createObjectURL(file),
        alt: file.name.replace(/\.[^/.]+$/, ''),
      });
    }

    setPendingImages(prev => [...prev, ...newImages]);
    if (fileInputImageRef.current) fileInputImageRef.current.value = '';
  };

  const removePendingImage = (index: number) => {
    setPendingImages(prev => {
      const next = [...prev];
      URL.revokeObjectURL(next[index].preview);
      next.splice(index, 1);
      return next;
    });
  };

  // Convert string metadata to typed values for storage
  const buildMetadata = (): Record<string, unknown> => {
    const fields = TYPE_META_FIELDS[type] || [];
    const result: Record<string, unknown> = {};
    for (const f of fields) {
      const val = metadata[f.key] || '';
      if (val === '') continue;
      if (f.type === 'number') {
        result[f.key] = parseFloat(val) || 0;
      } else if (f.type === 'tags') {
        result[f.key] = val.split(',').map(s => s.trim()).filter(Boolean);
      } else {
        result[f.key] = val;
      }
    }
    return result;
  };

  const handleSubmit = async () => {
    if (!activeAccountId || !name.trim()) return;

    setSaving(true);
    try {
      const body = {
        account_id: activeAccountId,
        name: name.trim(),
        type,
        short_description: shortDescription.trim() || null,
        description: description.trim() || null,
        status,
        price: price ? parseFloat(price) : null,
        price_type: priceType,
        reference_code: referenceCode.trim() || null,
        category_id: categoryId || null,
        metadata: buildMetadata(),
      };

      let res;
      if (isEditing) {
        res = await fetch(`/api/offerings/${offering.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
      } else {
        res = await fetch('/api/offerings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
      }

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save');
      }

      const data = await res.json();
      const savedOffering = data.offering;

      // Upload all pending images
      if (pendingImages.length > 0 && savedOffering?.id) {
        for (const img of pendingImages) {
          const formData = new FormData();
          formData.append('file', img.file);
          formData.append('account_id', activeAccountId);
          formData.append('offering_id', savedOffering.id);
          formData.append('alt_text', img.alt);

          const uploadRes = await fetch('/api/offerings/upload', { method: 'POST', body: formData });
          if (!uploadRes.ok) {
            console.error('Image upload failed:', img.file.name);
          }
        }
      }

      toast.success(isEditing ? 'Offering updated' : 'Offering created');
      onSuccess();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const metaFields = TYPE_META_FIELDS[type] || [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-popover border-border text-popover-foreground sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Offering' : 'Add Offering'}</DialogTitle>
          <DialogDescription>
            {isEditing ? 'Update offering details' : 'Create a new offering in your catalog'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Images */}
          <div className="space-y-2">
            <Label className="text-muted-foreground">Images</Label>
            <input
              type="file"
              ref={fileInputImageRef}
              accept="image/png,image/jpeg,image/webp"
              multiple
              onChange={handleImageSelect}
              className="hidden"
            />

            {isEditing && offering && (() => {
              // @ts-expect-error media is joined from API
              const media = offering.media;
              if (!media || media.length === 0) return null;
              return (
                <div className="flex flex-wrap gap-2">
                  {media.map((m: { id: string; url: string; alt_text: string | null; is_primary: boolean }) => (
                    <div key={m.id} className="relative group">
                      <img src={m.url} alt={m.alt_text || ''} className="h-20 w-20 rounded-lg object-cover border border-border" />
                      {m.is_primary && (
                        <span className="absolute bottom-1 left-1 text-[9px] bg-primary text-primary-foreground rounded px-1 py-0.5">Primary</span>
                      )}
                    </div>
                  ))}
                </div>
              );
            })()}

            {pendingImages.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {pendingImages.map((img, idx) => (
                  <div key={idx} className="relative group">
                    <img src={img.preview} alt={img.alt} className="h-20 w-20 rounded-lg object-cover border border-border" />
                    <button
                      type="button"
                      onClick={() => removePendingImage(idx)}
                      className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <button
              type="button"
              onClick={() => fileInputImageRef.current?.click()}
              className="flex h-20 w-20 items-center justify-center rounded-lg border-2 border-dashed border-border hover:border-primary hover:bg-muted/50"
            >
              <Upload className="h-5 w-5 text-muted-foreground" />
            </button>
          </div>

          {/* Name */}
          <div className="space-y-2">
            <Label className="text-muted-foreground">Name *</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Deluxe Room, Web Development Course"
              className="border-border bg-muted"
            />
          </div>

          {/* Type */}
          <div className="space-y-2">
            <Label className="text-muted-foreground">Type *</Label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as OfferingType)}
              className="w-full border-border bg-muted text-foreground rounded-md px-3 py-2 text-sm"
            >
              {allowedTypes.map((t) => (
                <option key={t} value={t}>{OFFERING_TYPES[t].label}</option>
              ))}
            </select>
          </div>

          {/* Short Description */}
          <div className="space-y-2">
            <Label className="text-muted-foreground">Short Description</Label>
            <Input
              value={shortDescription}
              onChange={(e) => setShortDescription(e.target.value)}
              placeholder="Brief summary (shown in list)"
              className="border-border bg-muted"
            />
          </div>

          {/* Full Description */}
          <div className="space-y-2">
            <Label className="text-muted-foreground">Description</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Detailed description for customers"
              rows={3}
              className="border-border bg-muted"
            />
          </div>

          {/* Type-Specific Fields */}
          {metaFields.length > 0 && (
            <div className="space-y-3 rounded-lg border border-border p-3">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                {OFFERING_TYPES[type].label} Details
              </Label>
              <div className="grid grid-cols-2 gap-3">
                {metaFields.map((field) => (
                  <div key={field.key} className={field.type === 'textarea' ? 'col-span-2' : ''}>
                    <Label className="text-muted-foreground text-xs">{field.label}</Label>
                    {field.type === 'textarea' ? (
                      <Textarea
                        value={metadata[field.key] || ''}
                        onChange={(e) => handleMetaChange(field.key, e.target.value)}
                        placeholder={field.placeholder}
                        rows={2}
                        className="border-border bg-muted mt-1"
                      />
                    ) : (
                      <Input
                        type={field.type === 'number' ? 'number' : 'text'}
                        value={metadata[field.key] || ''}
                        onChange={(e) => handleMetaChange(field.key, e.target.value)}
                        placeholder={field.placeholder}
                        className="border-border bg-muted mt-1"
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Price Row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-muted-foreground">Price Type</Label>
              <select
                value={priceType}
                onChange={(e) => setPriceType(e.target.value as PriceType)}
                className="w-full border-border bg-muted text-foreground rounded-md px-3 py-2 text-sm"
              >
                {Object.entries(PRICE_TYPES).map(([value, meta]) => (
                  <option key={value} value={value}>{meta.label}</option>
                ))}
              </select>
            </div>
            {priceType !== 'free' && priceType !== 'contact_for_price' && (
              <div className="space-y-2">
                <Label className="text-muted-foreground">Price</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="0.00"
                  className="border-border bg-muted"
                />
              </div>
            )}
          </div>

          {/* Reference Code */}
          <div className="space-y-2">
            <Label className="text-muted-foreground">Reference Code (optional)</Label>
            <Input
              value={referenceCode}
              onChange={(e) => setReferenceCode(e.target.value)}
              placeholder="SKU, code, or reference"
              className="border-border bg-muted"
            />
          </div>

          {/* Category */}
          <div className="space-y-2">
            <Label className="text-muted-foreground">Category</Label>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="w-full border-border bg-muted text-foreground rounded-md px-3 py-2 text-sm"
            >
              <option value="">No Category</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>
          </div>

          {/* Status */}
          <div className="space-y-2">
            <Label className="text-muted-foreground">Status</Label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as OfferingStatus)}
              className="w-full border-border bg-muted text-foreground rounded-md px-3 py-2 text-sm"
            >
              {Object.entries(OFFERING_STATUSES).map(([value, meta]) => (
                <option key={value} value={value}>{meta.label}</option>
              ))}
            </select>
          </div>
        </div>

        <DialogFooter className="bg-popover border-border">
          <Button variant="outline" onClick={() => onOpenChange(false)}
            className="border-border text-muted-foreground hover:bg-muted">
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={saving || !name.trim()}>
            {saving && <Loader2 className="size-4 animate-spin" />}
            {isEditing ? 'Update' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
