// ============================================================
// Catalogue Types — Normalized types for the Catalogue Service.
//
// Provides a unified data model for internal offerings and
// future external catalogue sources. All catalogue operations
// return these types so downstream consumers (node handler,
// AI, independent handler) work with a single interface.
// ============================================================

import type { OfferingType, PriceType } from './offerings';

// ============================================================
// Catalogue Item
// ============================================================

export interface CatalogueItem {
  id: string;
  /** Source adapter id — null = internal (offerings table) */
  source_id: string | null;
  type: OfferingType;
  category_id: string | null;
  category_name: string | null;
  name: string;
  slug: string;
  short_description: string | null;
  description: string | null;
  image_url: string | null;
  image_urls: string[];
  price: number | null;
  currency: string;
  price_type: PriceType;
  sku: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

// ============================================================
// Catalogue Category
// ============================================================

export interface CatalogueCategory {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  parent_id: string | null;
  sort_order: number;
  /** Number of items in this category (filled by service when requested) */
  item_count?: number;
}

// ============================================================
// Availability
// ============================================================

export interface AvailabilityResult {
  available: boolean;
  /** Number of existing bookings overlapping the date range */
  conflicting_bookings: number;
  message: string;
}

export interface DateRange {
  start_date: string;
  end_date?: string;
}

// ============================================================
// Price
// ============================================================

export interface PriceResult {
  price: number | null;
  currency: string;
  price_type: PriceType;
  formatted: string;
}

// ============================================================
// Query Params
// ============================================================

export interface CatalogueItemParams {
  type?: OfferingType;
  category?: string;
  search?: string;
  limit?: number;
  page?: number;
  status?: string;
}

export interface CatalogueSearchParams {
  query: string;
  limit?: number;
}

// ============================================================
// Presentation Context
// ============================================================

export type PresentationStrategyType =
  | 'multi_product'
  | 'list'
  | 'buttons'
  | 'single_item'
  | 'text_fallback';

export interface PresentationContext {
  /** Whether the business has multi-product catalogue enabled */
  supports_multi_product: boolean;
  /** Number of results */
  result_count: number;
  /** Offering type (for type-specific formatting) */
  offering_type?: OfferingType;
  /** Whether images are available for the items */
  has_images: boolean;
}

export interface PresentationStrategy {
  type: PresentationStrategyType;
  payload: unknown;
}

// ============================================================
// Catalogue Intent
// ============================================================

export type CatalogueIntentType =
  | 'browse_products'
  | 'browse_menu'
  | 'browse_services'
  | 'browse_courses'
  | 'browse_rooms'
  | 'browse_programs'
  | 'browse_properties'
  | 'browse_events'
  | 'search_items'
  | 'get_item'
  | null;

export interface CatalogueIntent {
  type: CatalogueIntentType;
  /** Search query if type is 'search_items' */
  query?: string;
  /** Item name if type is 'get_item' */
  item_name?: string;
}

// ============================================================
// Capability → Intent Mapping
// ============================================================

export const CAPABILITY_INTENT_MAP: Record<string, CatalogueIntentType> = {
  products: 'browse_products',
  product_catalog: 'browse_products',
  menu: 'browse_menu',
  food_orders: 'browse_menu',
  services: 'browse_services',
  appointments: 'browse_services',
  service_requests: 'browse_services',
  courses: 'browse_courses',
  education_programs: 'browse_courses',
  accommodation: 'browse_rooms',
  bookings: 'browse_rooms',
  programs: 'browse_programs',
  ngo_services: 'browse_programs',
  property_listings: 'browse_properties',
  property_inquiries: 'browse_properties',
  events: 'browse_events',
  registrations: 'browse_events',
};

// ============================================================
// Presentation Keyword Patterns
// ============================================================

export const INTENT_KEYWORDS: Record<string, string[]> = {
  browse_products: [
    'product', 'products', 'item', 'items', 'catalog', 'catalogue',
    'what do you sell', 'what do you have', 'show me', 'browse',
  ],
  browse_menu: [
    'menu', 'food', 'food menu', 'drink', 'drinks', 'eat',
    'what do you serve', 'what food', 'order food',
  ],
  browse_services: [
    'service', 'services', 'what services', 'help with',
    'what do you offer', 'what can you do',
  ],
  browse_courses: [
    'course', 'courses', 'class', 'classes', 'training',
    'what courses', 'learn', 'study', 'program',
  ],
  browse_rooms: [
    'room', 'rooms', 'accommodation', 'stay', 'book',
    'hotel', 'lodge', 'booking', 'check in',
  ],
  browse_programs: [
    'program', 'programs', 'initiative', 'community',
    'what programs', 'join', 'participate',
  ],
  browse_properties: [
    'property', 'properties', 'house', 'apartment', 'rent',
    'real estate', 'listing', 'for sale', 'for rent',
  ],
  browse_events: [
    'event', 'events', 'happening', 'upcoming',
    'what events', 'register', 'attend',
  ],
};
