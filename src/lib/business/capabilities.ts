// ============================================================
// Capability Registry — centralized capability definitions.
//
// This module provides:
// 1. TypeScript types for capabilities
//2. Business type definitions
// 3. Business type → capability recommendations
// 4. Helper functions for capability management
//
// The actual capability data lives in the database (business_capabilities table).
// This module provides the TypeScript layer for working with that data.
// ============================================================

// ============================================================
// Business Types
// ============================================================

export type BusinessType =
  | 'retailer'
  | 'wholesaler'
  | 'restaurant'
  | 'hotel'
  | 'hotel_restaurant'
  | 'service_business'
  | 'professional_services'
  | 'education'
  | 'ngo_nonprofit'
  | 'property_real_estate'
  | 'healthcare'
  | 'events'
  | 'logistics_delivery'
  | 'courier'
  | 'transportation'
  | 'cleaning_services'
  | 'maintenance'
  | 'beauty_wellness'
  | 'fitness'
  | 'automotive'
  | 'pet_services'
  | 'healthcare_clinic'
  | 'other';

export const BUSINESS_TYPES: { value: BusinessType; label: string; description: string }[] = [
  { value: 'retailer', label: 'Retailer', description: 'Sell products directly to consumers' },
  { value: 'wholesaler', label: 'Wholesaler', description: 'Sell products in bulk to businesses' },
  { value: 'restaurant', label: 'Restaurant', description: 'Food and beverage service' },
  { value: 'hotel', label: 'Hotel', description: 'Accommodation and lodging' },
  { value: 'hotel_restaurant', label: 'Hotel + Restaurant', description: 'Accommodation with food service' },
  { value: 'service_business', label: 'Service Business', description: 'Provide local services' },
  { value: 'professional_services', label: 'Professional Services', description: 'Consulting, legal, accounting' },
  { value: 'education', label: 'Education', description: 'Schools, training, courses' },
  { value: 'ngo_nonprofit', label: 'NGO / Nonprofit', description: 'Non-profit organizations' },
  { value: 'property_real_estate', label: 'Property / Real Estate', description: 'Real estate and property' },
  { value: 'healthcare', label: 'Healthcare', description: 'Medical and health services' },
  { value: 'events', label: 'Events', description: 'Event planning and management' },
  { value: 'logistics_delivery', label: 'Logistics / Delivery', description: 'Parcel delivery, courier, and logistics services' },
  { value: 'courier', label: 'Courier', description: 'Express delivery and courier services' },
  { value: 'transportation', label: 'Transportation', description: 'Transport and mobility services' },
  { value: 'cleaning_services', label: 'Cleaning Services', description: 'Commercial and residential cleaning' },
  { value: 'maintenance', label: 'Maintenance', description: 'Facility and equipment maintenance' },
  { value: 'beauty_wellness', label: 'Beauty & Wellness', description: 'Salons, spas, and wellness services' },
  { value: 'fitness', label: 'Fitness', description: 'Gyms and fitness centers' },
  { value: 'automotive', label: 'Automotive', description: 'Auto repair and services' },
  { value: 'pet_services', label: 'Pet Services', description: 'Veterinary and pet care services' },
  { value: 'healthcare_clinic', label: 'Healthcare Clinic', description: 'Outpatient medical clinics' },
  { value: 'other', label: 'Other', description: 'Other type of organization' },
];

// ============================================================
// Capability Categories
// ============================================================

export type CapabilityCategory =
  | 'commerce'
  | 'food_hospitality'
  | 'services'
  | 'education'
  | 'ngo'
  | 'property'
  | 'events'
  | 'general';

export const CAPABILITY_CATEGORIES: { value: CapabilityCategory; label: string }[] = [
  { value: 'commerce', label: 'Commerce' },
  { value: 'food_hospitality', label: 'Food & Hospitality' },
  { value: 'services', label: 'Services' },
  { value: 'education', label: 'Education' },
  { value: 'ngo', label: 'NGO / Nonprofit' },
  { value: 'property', label: 'Property' },
  { value: 'events', label: 'Events' },
  { value: 'general', label: 'General' },
];

// ============================================================
// Capability Types
// ============================================================

export interface CapabilityDefinition {
  key: string;
  name: string;
  description: string | null;
  category: CapabilityCategory;
  isDefaultEnabled: boolean;
  supportedActions: string[];
  recommendedBusinessTypes: BusinessType[];
  navigation: CapabilityNavigation | null;
  createdAt: string;
  updatedAt: string;
}

export interface CapabilityNavigation {
  label: string;
  icon: string;
  route: string;
  section: 'catalog' | 'operations' | 'settings';
  permission?: string;
}

export interface AccountCapability {
  id: string;
  accountId: string;
  capabilityKey: string;
  isEnabled: boolean;
  config: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface CapabilityWithState extends CapabilityDefinition {
  isEnabled: boolean;
  config: Record<string, unknown>;
}

// ============================================================
// Business Type → Capability Recommendations
// ============================================================

/**
 * Returns the recommended capability keys for a given business type.
 * These are the capabilities that should be enabled by default
 * when an organization selects this business type.
 */
export function getRecommendedCapabilityKeys(businessType: BusinessType): string[] {
  const recommendations: Record<BusinessType, string[]> = {
    retailer: ['products', 'product_catalog', 'inventory', 'orders', 'inquiries'],
    wholesaler: ['products', 'product_catalog', 'inventory', 'orders', 'wholesale', 'pricing', 'inquiries'],
    restaurant: ['menu', 'food_orders', 'reservations', 'events', 'inquiries'],
    hotel: ['accommodation', 'bookings', 'hospitality_services', 'events', 'inquiries'],
    hotel_restaurant: ['accommodation', 'bookings', 'menu', 'food_orders', 'hospitality_services', 'events', 'inquiries'],
    service_business: ['services', 'appointments', 'service_requests', 'inquiries'],
    professional_services: ['services', 'appointments', 'service_requests', 'inquiries'],
    education: ['courses', 'education_programs', 'applications', 'events', 'resources', 'inquiries'],
    ngo_nonprofit: ['programs', 'ngo_services', 'applications', 'events', 'resources', 'donations', 'inquiries'],
    property_real_estate: ['property_listings', 'property_inquiries', 'viewings', 'inquiries'],
    healthcare: ['services', 'appointments', 'inquiries'],
    events: ['events', 'registrations', 'bookings', 'inquiries'],
    logistics_delivery: ['product_catalog', 'delivery', 'orders', 'inquiries'],
    courier: ['product_catalog', 'delivery', 'orders', 'inquiries'],
    transportation: ['product_catalog', 'delivery', 'orders', 'inquiries'],
    cleaning_services: ['services', 'appointments', 'inquiries'],
    maintenance: ['services', 'appointments', 'inquiries'],
    beauty_wellness: ['services', 'appointments', 'inquiries'],
    fitness: ['services', 'appointments', 'inquiries'],
    automotive: ['services', 'appointments', 'inquiries'],
    pet_services: ['services', 'appointments', 'inquiries'],
    healthcare_clinic: ['services', 'appointments', 'inquiries'],
    other: ['inquiries'],
  };

  return recommendations[businessType] || recommendations.other;
}

/**
 * Returns all recommended capabilities with their details for a business type.
 */
export function getRecommendedCapabilities(
  businessType: BusinessType,
  allCapabilities: CapabilityDefinition[]
): (CapabilityDefinition & { isRecommended: boolean })[] {
  const recommendedKeys = getRecommendedCapabilityKeys(businessType);

  return allCapabilities.map(cap => ({
    ...cap,
    isRecommended: recommendedKeys.includes(cap.key),
  }));
}

// ============================================================
// Capability Helpers
// ============================================================

/**
 * Groups capabilities by category.
 */
export function groupCapabilitiesByCategory(
  capabilities: CapabilityWithState[]
): Record<CapabilityCategory, CapabilityWithState[]> {
  const grouped: Record<CapabilityCategory, CapabilityWithState[]> = {
    commerce: [],
    food_hospitality: [],
    services: [],
    education: [],
    ngo: [],
    property: [],
    events: [],
    general: [],
  };

  for (const cap of capabilities) {
    grouped[cap.category].push(cap);
  }

  return grouped;
}

/**
 * Gets enabled capability keys from a list of capabilities.
 */
export function getEnabledCapabilityKeys(capabilities: CapabilityWithState[]): string[] {
  return capabilities.filter(cap => cap.isEnabled).map(cap => cap.key);
}

/**
 * Checks if a capability is enabled.
 */
export function isCapabilityEnabled(
  capabilities: CapabilityWithState[],
  capabilityKey: string
): boolean {
  return capabilities.some(cap => cap.key === capabilityKey && cap.isEnabled);
}

/**
 * Gets navigation items from enabled capabilities.
 */
export function getCapabilityNavigationItems(
  capabilities: CapabilityWithState[]
): CapabilityNavigation[] {
  return capabilities
    .filter(cap => cap.isEnabled && cap.navigation)
    .map(cap => cap.navigation!);
}

/**
 * Validates that a business type is valid.
 */
export function isValidBusinessType(value: string): value is BusinessType {
  return (BUSINESS_TYPES as { value: string }[]).some(bt => bt.value === value);
}

/**
 * Gets business type display info.
 */
export function getBusinessTypeInfo(businessType: BusinessType | null) {
  if (!businessType) return null;
  return BUSINESS_TYPES.find(bt => bt.value === businessType) || null;
}
