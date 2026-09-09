// ============================================================
// Zone Mapper — maps locations to delivery zones
//
// Loads zones from the business's offering metadata, not from
// hardcoded areas. Each delivery offering defines its own zones
// in metadata.zones (e.g. ["Fedha", "Nyayo", "Tassia"]).
//
// This function is independent and can be improved later
// (e.g. fuzzy matching, address parsing, distance API).
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js'

export interface ZoneMapping {
  zone_type: string
  confidence: number
  matched_area?: string
  matched_offering_id?: string
  matched_offering_name?: string
}

/**
 * Load all delivery zones from the account's offerings.
 * Returns a flat list of { area, zone_type, offering_id, offering_name }
 * for matching against customer-provided locations.
 */
async function loadZonesFromOfferings(
  db: SupabaseClient,
  accountId: string,
): Promise<Array<{ area: string; zone_type: string; offering_id: string; offering_name: string }>> {
  const { data: offerings } = await db
    .from('offerings')
    .select('id, name, metadata')
    .eq('account_id', accountId)
    .eq('status', 'active')

  const zones: Array<{ area: string; zone_type: string; offering_id: string; offering_name: string }> = []

  for (const offering of offerings || []) {
    const meta = (offering.metadata || {}) as Record<string, unknown>
    const zoneType = (meta.zone_type as string) || 'local'
    const areaList = (meta.zones as string[]) || []

    for (const area of areaList) {
      zones.push({
        area: area.toLowerCase().trim(),
        zone_type: zoneType,
        offering_id: offering.id,
        offering_name: offering.name,
      })
    }
  }

  return zones
}

/**
 * Map a customer-provided location to a delivery zone.
 *
 * Loads zones from the business's offerings and matches against them.
 * Returns the best match with confidence score.
 *
 * @param db - Supabase client
 * @param accountId - Business account ID
 * @param location - Customer-provided location text (e.g. "Fedha", "Near Taj Mall")
 * @param locationType - Whether this is a pickup or dropoff location
 */
export async function mapLocationToZone(
  db: SupabaseClient,
  accountId: string,
  location: string,
  locationType: string = 'dropoff',
): Promise<ZoneMapping> {
  const lower = location.toLowerCase().trim()
  const zones = await loadZonesFromOfferings(db, accountId)

  if (zones.length === 0) {
    // No zones configured — default to extended
    return { zone_type: 'extended', confidence: 0.2 }
  }

  // 1. Exact match
  for (const z of zones) {
    if (lower === z.area) {
      return {
        zone_type: z.zone_type,
        confidence: 1.0,
        matched_area: z.area,
        matched_offering_id: z.offering_id,
        matched_offering_name: z.offering_name,
      }
    }
  }

  // 2. Partial match — customer text contains the area
  for (const z of zones) {
    if (lower.includes(z.area)) {
      return {
        zone_type: z.zone_type,
        confidence: 0.9,
        matched_area: z.area,
        matched_offering_id: z.offering_id,
        matched_offering_name: z.offering_name,
      }
    }
  }

  // 3. Reverse partial — area contains the customer text (e.g. "gate" matches "gate a")
  for (const z of zones) {
    if (z.area.includes(lower)) {
      return {
        zone_type: z.zone_type,
        confidence: 0.7,
        matched_area: z.area,
        matched_offering_id: z.offering_id,
        matched_offering_name: z.offering_name,
      }
    }
  }

  // 4. Word-level match — any word in the location matches
  const words = lower.split(/\s+/)
  for (const word of words) {
    if (word.length < 3) continue // skip short words
    for (const z of zones) {
      if (z.area.includes(word)) {
        return {
          zone_type: z.zone_type,
          confidence: 0.5,
          matched_area: z.area,
          matched_offering_id: z.offering_id,
          matched_offering_name: z.offering_name,
        }
      }
    }
  }

  // 5. No match — default to extended
  return { zone_type: 'extended', confidence: 0.2 }
}
