// ============================================================
// Business type → report family. Families map 1:1 onto the
// aggregation RPCs; types without a dedicated domain share the
// closest one (education → ngo-style programs, events/healthcare
// → services).
// ============================================================

import type { ReportFamily } from './types'

export const BUSINESS_TYPE_TO_FAMILY: Record<string, ReportFamily> = {
  retailer: 'commerce',
  wholesaler: 'commerce',
  agriculture: 'commerce',
  restaurant: 'food',
  hotel_restaurant: 'food',
  hotel: 'hospitality',
  property_real_estate: 'property',
  ngo_nonprofit: 'ngo',
  education: 'ngo', // programs/courses/applications/enrollments
  service_business: 'services',
  professional_services: 'services',
  healthcare: 'services',
  events: 'services',
  other: 'commerce',
}

export function familyForBusinessType(businessType: string | null | undefined): ReportFamily {
  return BUSINESS_TYPE_TO_FAMILY[businessType ?? ''] ?? 'commerce'
}

export const FAMILY_LABELS: Record<ReportFamily, string> = {
  commerce: 'Sales & Orders',
  food: 'Kitchen & Reservations',
  hospitality: 'Bookings & Occupancy',
  property: 'Inquiries & Viewings',
  ngo: 'Programs & Giving',
  services: 'Bookings & Services',
}
