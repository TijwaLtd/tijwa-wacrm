// ============================================================
// Offering Types — Universal catalog/offering definitions.
//
// This module provides:
// 1. TypeScript types for offerings, categories, media, embeddings
// 2. Offering type metadata (labels, icons, descriptions)
// 3. Capability → Offering Type mapping
// 4. Helper functions for offering management
// ============================================================

// ============================================================
// Offering Types
// ============================================================

export type OfferingType =
  | 'product'
  | 'service'
  | 'room'
  | 'menu_item'
  | 'course'
  | 'program'
  | 'property'
  | 'package'
  | 'membership'
  | 'event'
  | 'resource'
  | 'other';

export type OfferingStatus = 'draft' | 'active' | 'inactive' | 'archived';

export type PriceType = 'fixed' | 'starting_from' | 'contact_for_price' | 'free';

// ============================================================
// Offering Type Metadata
// ============================================================

export const OFFERING_TYPES: Record<
  OfferingType,
  { label: string; icon: string; description: string }
> = {
  product: { label: 'Product', icon: 'Package', description: 'Physical goods for sale' },
  service: { label: 'Service', icon: 'Wrench', description: 'Services offered to customers' },
  room: { label: 'Room', icon: 'Bed', description: 'Accommodation rooms and lodging' },
  menu_item: { label: 'Menu Item', icon: 'UtensilsCrossed', description: 'Food and beverage items' },
  course: { label: 'Course', icon: 'GraduationCap', description: 'Educational courses and training' },
  program: { label: 'Program', icon: 'Heart', description: 'Community or organizational programs' },
  property: { label: 'Property', icon: 'Home', description: 'Real estate properties and listings' },
  package: { label: 'Package', icon: 'Box', description: 'Bundled offerings' },
  membership: { label: 'Membership', icon: 'CreditCard', description: 'Membership plans and subscriptions' },
  event: { label: 'Event', icon: 'CalendarDays', description: 'Events and venues' },
  resource: { label: 'Resource', icon: 'Library', description: 'Educational and community resources' },
  other: { label: 'Other', icon: 'MoreHorizontal', description: 'Other types of offerings' },
};

export const OFFERING_TYPE_LIST = Object.entries(OFFERING_TYPES).map(([value, meta]) => ({
  value: value as OfferingType,
  ...meta,
}));

// ============================================================
// Offering Status Metadata
// ============================================================

export const OFFERING_STATUSES: Record<
  OfferingStatus,
  { label: string; color: string }
> = {
  draft: { label: 'Draft', color: 'bg-muted text-muted-foreground' },
  active: { label: 'Active', color: 'bg-green-500/10 text-green-500' },
  inactive: { label: 'Inactive', color: 'bg-yellow-500/10 text-yellow-500' },
  archived: { label: 'Archived', color: 'bg-muted text-muted-foreground' },
};

// ============================================================
// Price Type Metadata
// ============================================================

export const PRICE_TYPES: Record<
  PriceType,
  { label: string; description: string }
> = {
  fixed: { label: 'Fixed Price', description: 'Set price for the offering' },
  starting_from: { label: 'Starting From', description: 'Minimum price, may vary' },
  contact_for_price: { label: 'Contact for Price', description: 'Price available on request' },
  free: { label: 'Free', description: 'No charge for this offering' },
};

// ============================================================
// Interface Definitions
// ============================================================

export interface Offering {
  id: string;
  account_id: string;
  type: OfferingType;
  name: string;
  slug: string;
  short_description: string | null;
  description: string | null;
  status: OfferingStatus;
  category_id: string | null;
  price: number | null;
  currency: string | null;
  price_type: PriceType;
  reference_code: string | null;
  external_provider: string | null;
  external_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface OfferingCategory {
  id: string;
  account_id: string | null;
  name: string;
  slug: string;
  description: string | null;
  parent_id: string | null;
  sort_order: number;
  created_at: string;
}

export interface OfferingMedia {
  id: string;
  offering_id: string;
  account_id: string;
  url: string;
  alt_text: string | null;
  sort_order: number;
  is_primary: boolean;
  created_at: string;
}

export interface OfferingEmbedding {
  id: string;
  offering_id: string;
  account_id: string;
  image_url: string;
  embedding: number[] | null;
  description_embedding: number[] | null;
  vision_description: string | null;
  created_at: string;
}

export interface OfferingWithMedia extends Offering {
  media: OfferingMedia[];
  category: OfferingCategory | null;
}

export interface OfferingWithType extends Offering {
  type_label: string;
  type_icon: string;
}

// ============================================================
// Capability → Offering Type Mapping
// ============================================================

export const CAPABILITY_OFFERING_TYPES: Record<string, OfferingType[]> = {
  // Commerce
  products: ['product'],
  product_catalog: ['product'],
  inventory: ['product'],

  // Food & Hospitality
  menu: ['menu_item'],
  food_orders: ['menu_item'],
  accommodation: ['room'],
  bookings: ['room'],
  hospitality_services: ['service'],

  // Services
  services: ['service'],
  appointments: ['service'],
  service_requests: ['service'],

  // Education
  courses: ['course'],
  education_programs: ['program'],
  applications: ['course'],

  // NGO
  programs: ['program'],
  ngo_services: ['service'],
  resources: ['resource'],
  donations: ['resource'],

  // Property
  property_listings: ['property'],
  property_inquiries: ['property'],
  viewings: ['property'],

  // Events
  events: ['event'],
  registrations: ['event'],
};

// ============================================================
// Helper Functions
// ============================================================

/**
 * Get offering types allowed by an account's enabled capabilities.
 */
export function getAllowedOfferingTypes(
  enabledCapabilities: string[]
): OfferingType[] {
  const allowedTypes = new Set<OfferingType>();
  for (const cap of enabledCapabilities) {
    const types = CAPABILITY_OFFERING_TYPES[cap];
    if (types) {
      for (const type of types) {
        allowedTypes.add(type);
      }
    }
  }
  return Array.from(allowedTypes);
}

/**
 * Get capability keys that support a specific offering type.
 */
export function getCapabilitiesForOfferingType(
  offeringType: OfferingType,
  enabledCapabilities: string[]
): string[] {
  return enabledCapabilities.filter((cap) => {
    const types = CAPABILITY_OFFERING_TYPES[cap];
    return types?.includes(offeringType);
  });
}

/**
 * Check if an offering type is allowed for an account.
 */
export function isOfferingTypeAllowed(
  offeringType: OfferingType,
  enabledCapabilities: string[]
): boolean {
  return getAllowedOfferingTypes(enabledCapabilities).includes(offeringType);
}

/**
 * Generate a URL-friendly slug from a name.
 */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Get offering type info by type value.
 */
export function getOfferingTypeInfo(type: OfferingType) {
  return OFFERING_TYPES[type] || OFFERING_TYPES.other;
}

/**
 * Get status info by status value.
 */
export function getOfferingStatusInfo(status: OfferingStatus) {
  return OFFERING_STATUSES[status] || OFFERING_STATUSES.draft;
}

/**
 * Format price for display.
 */
export function formatPrice(
  price: number | null,
  currency: string | null,
  priceType: PriceType
): string {
  if (priceType === 'free') return 'Free';
  if (priceType === 'contact_for_price') return 'Contact for Price';
  if (priceType === 'starting_from' && price !== null) {
    return `From ${currency || ''} ${price.toFixed(2)}`;
  }
  if (price !== null) {
    return `${currency || ''} ${price.toFixed(2)}`;
  }
  return 'Price not set';
}
