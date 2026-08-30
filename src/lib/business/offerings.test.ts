import { describe, it, expect } from 'vitest';
import {
  getAllowedOfferingTypes,
  getCapabilitiesForOfferingType,
  isOfferingTypeAllowed,
  slugify,
  getOfferingTypeInfo,
  getOfferingStatusInfo,
  formatPrice,
  CAPABILITY_OFFERING_TYPES,
  OFFERING_TYPES,
} from './offerings';
import type { OfferingType } from './offerings';

describe('getAllowedOfferingTypes', () => {
  it('returns empty array for empty capabilities', () => {
    expect(getAllowedOfferingTypes([])).toEqual([]);
  });

  it('returns unique offering types from multiple capabilities', () => {
    const result = getAllowedOfferingTypes(['products', 'menu', 'accommodation']);
    expect(result).toContain('product');
    expect(result).toContain('menu_item');
    expect(result).toContain('room');
  });

  it('deduplicates offering types from overlapping capabilities', () => {
    const result = getAllowedOfferingTypes(['products', 'product_catalog', 'inventory']);
    expect(result.filter(t => t === 'product')).toHaveLength(1);
  });

  it('ignores unknown capability keys', () => {
    expect(getAllowedOfferingTypes(['nonexistent_cap'])).toEqual([]);
  });

  it('handles capabilities with empty arrays', () => {
    expect(getAllowedOfferingTypes(['unknown'])).toEqual([]);
  });
});

describe('getCapabilitiesForOfferingType', () => {
  it('returns capabilities that support a given offering type', () => {
    const result = getCapabilitiesForOfferingType('product', [
      'products', 'product_catalog', 'menu', 'accommodation'
    ]);
    expect(result).toEqual(['products', 'product_catalog']);
  });

  it('returns empty array if no capabilities match', () => {
    const result = getCapabilitiesForOfferingType('room', ['products', 'menu']);
    expect(result).toEqual([]);
  });

  it('filters correctly for service type', () => {
    const result = getCapabilitiesForOfferingType('service', [
      'services', 'appointments', 'service_requests', 'ngo_services'
    ]);
    expect(result).toEqual(['services', 'appointments', 'service_requests', 'ngo_services']);
  });
});

describe('isOfferingTypeAllowed', () => {
  it('returns true when capability supports the type', () => {
    expect(isOfferingTypeAllowed('product', ['products'])).toBe(true);
    expect(isOfferingTypeAllowed('room', ['accommodation'])).toBe(true);
    expect(isOfferingTypeAllowed('menu_item', ['menu'])).toBe(true);
  });

  it('returns false when capability does not support the type', () => {
    expect(isOfferingTypeAllowed('product', ['menu'])).toBe(false);
    expect(isOfferingTypeAllowed('room', ['products'])).toBe(false);
  });

  it('returns false for empty capabilities', () => {
    expect(isOfferingTypeAllowed('product', [])).toBe(false);
  });
});

describe('slugify', () => {
  it('converts name to URL-friendly slug', () => {
    expect(slugify('Deluxe King Room')).toBe('deluxe-king-room');
    expect(slugify('Chicken Tikka Masala')).toBe('chicken-tikka-masala');
  });

  it('removes special characters', () => {
    expect(slugify('Hello! @World#')).toBe('hello-world');
  });

  it('handles multiple spaces', () => {
    expect(slugify('Too   Many   Spaces')).toBe('too-many-spaces');
  });

  it('trims leading and trailing hyphens', () => {
    expect(slugify('--leading--trailing--')).toBe('leading-trailing');
  });
});

describe('getOfferingTypeInfo', () => {
  it('returns correct metadata for known types', () => {
    const info = getOfferingTypeInfo('product');
    expect(info.label).toBe('Product');
    expect(info.icon).toBe('Package');
  });

  it('falls back to "other" for unknown types', () => {
    const info = getOfferingTypeInfo('nonexistent' as OfferingType);
    expect(info.label).toBe('Other');
    expect(info.icon).toBe('MoreHorizontal');
  });
});

describe('getOfferingStatusInfo', () => {
  it('returns correct metadata for known statuses', () => {
    const info = getOfferingStatusInfo('active');
    expect(info.label).toBe('Active');
    expect(info.color).toContain('green');
  });

  it('falls back to "draft" for unknown statuses', () => {
    const info = getOfferingStatusInfo('unknown' as any);
    expect(info.label).toBe('Draft');
  });
});

describe('formatPrice', () => {
  it('returns "Free" for free pricing', () => {
    expect(formatPrice(null, null, 'free')).toBe('Free');
    expect(formatPrice(0, 'KES', 'free')).toBe('Free');
  });

  it('returns "Contact for Price" when contact_for_price', () => {
    expect(formatPrice(null, null, 'contact_for_price')).toBe('Contact for Price');
  });

  it('formats starting_from with prefix', () => {
    expect(formatPrice(1500, 'KES', 'starting_from')).toBe('From KES 1500.00');
  });

  it('formats fixed price with currency', () => {
    expect(formatPrice(29.99, 'USD', 'fixed')).toBe('USD 29.99');
  });

  it('formats fixed price without currency', () => {
    expect(formatPrice(100, null, 'fixed')).toBe(' 100.00');
  });

  it('returns fallback for null price with fixed type', () => {
    expect(formatPrice(null, null, 'fixed')).toBe('Price not set');
  });
});

describe('CAPABILITY_OFFERING_TYPES mapping', () => {
  it('maps all commerce capabilities to product', () => {
    expect(CAPABILITY_OFFERING_TYPES.products).toContain('product');
    expect(CAPABILITY_OFFERING_TYPES.product_catalog).toContain('product');
    expect(CAPABILITY_OFFERING_TYPES.inventory).toContain('product');
  });

  it('maps food capabilities to menu_item', () => {
    expect(CAPABILITY_OFFERING_TYPES.menu).toContain('menu_item');
    expect(CAPABILITY_OFFERING_TYPES.food_orders).toContain('menu_item');
  });

  it('maps accommodation capabilities to room', () => {
    expect(CAPABILITY_OFFERING_TYPES.accommodation).toContain('room');
    expect(CAPABILITY_OFFERING_TYPES.bookings).toContain('room');
  });

  it('maps service capabilities to service', () => {
    expect(CAPABILITY_OFFERING_TYPES.services).toContain('service');
    expect(CAPABILITY_OFFERING_TYPES.appointments).toContain('service');
  });

  it('maps education capabilities correctly', () => {
    expect(CAPABILITY_OFFERING_TYPES.courses).toContain('course');
    expect(CAPABILITY_OFFERING_TYPES.education_programs).toContain('program');
  });

  it('maps NGO capabilities correctly', () => {
    expect(CAPABILITY_OFFERING_TYPES.programs).toContain('program');
    expect(CAPABILITY_OFFERING_TYPES.ngo_services).toContain('service');
    expect(CAPABILITY_OFFERING_TYPES.resources).toContain('resource');
  });

  it('maps property capabilities correctly', () => {
    expect(CAPABILITY_OFFERING_TYPES.property_listings).toContain('property');
  });

  it('maps event capabilities correctly', () => {
    expect(CAPABILITY_OFFERING_TYPES.events).toContain('event');
    expect(CAPABILITY_OFFERING_TYPES.registrations).toContain('event');
  });
});

describe('OFFERING_TYPES', () => {
  it('has all expected offering types', () => {
    const expected: OfferingType[] = [
      'product', 'service', 'room', 'menu_item', 'course',
      'program', 'property', 'package', 'membership', 'event', 'resource', 'other'
    ];
    for (const t of expected) {
      expect(OFFERING_TYPES[t]).toBeDefined();
      expect(OFFERING_TYPES[t].label).toBeTruthy();
      expect(OFFERING_TYPES[t].icon).toBeTruthy();
    }
  });
});
