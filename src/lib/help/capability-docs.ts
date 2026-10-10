// ============================================================
// Server-side capability lookup for the business-type help pages.
//
// Reads the system business_capabilities table (public product
// data, no tenant rows) via the service role so the docs' capability
// lists always match what the product actually ships.
// ============================================================

import { createClient } from '@supabase/supabase-js'
import {
  BUSINESS_TYPES,
  getRecommendedCapabilityKeys,
  type BusinessType,
} from '@/lib/business/capabilities'

export interface CapabilityDoc {
  key: string
  name: string
  description: string | null
  category: string | null
  route: string | null
}

let client: ReturnType<typeof createClient> | null = null
function getServiceClient() {
  if (!client) {
    client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )
  }
  return client
}

// One fetch of the whole (small, static) business_capabilities table,
// cached for the process. Prerendering 24 type pages would otherwise
// issue 24 queries — and a hanging network at build time would blow
// the per-page timeout. The abort keeps a dead network from wedging
// the build: pages just render without the generated section.
let capabilitiesCache: Array<{
  key: string
  name: string | null
  description: string | null
  category: string | null
  navigation: { route?: string } | null
}> | null = null

async function getAllCapabilityRows() {
  if (capabilitiesCache) return capabilitiesCache
  try {
    const { data } = await getServiceClient()
      .from('business_capabilities')
      .select('key, name, description, category, navigation')
      .abortSignal(AbortSignal.timeout(5000))
    capabilitiesCache = (data ?? []) as NonNullable<typeof capabilitiesCache>
  } catch {
    capabilitiesCache = []
  }
  return capabilitiesCache
}

/**
 * Capability metadata (name, description, nav route) for the keys
 * recommended for a business type. Order follows the recommendation
 * list so the page reads in the same order the product enables them.
 */
export async function getCapabilityDocsForType(type: BusinessType): Promise<CapabilityDoc[]> {
  const keys = getRecommendedCapabilityKeys(type)
  const rows = await getAllCapabilityRows()

  const byKey = new Map<string, CapabilityDoc>()
  for (const row of rows) {
    byKey.set(row.key, {
      key: row.key,
      name: row.name ?? row.key,
      description: row.description ?? null,
      category: row.category ?? null,
      route: typeof row.navigation?.route === 'string' ? row.navigation.route : null,
    })
  }
  // Loose null check: Map.get returns undefined for missing keys, and
  // `!== null` alone would let those through into the page's map.
  return keys.map((key) => byKey.get(key)).filter((c): c is CapabilityDoc => Boolean(c))
}

/** Business type value → the BUSINESS_TYPES entry, for page headers. */
export function getBusinessTypeEntry(type: string) {
  return BUSINESS_TYPES.find((b) => b.value === type) ?? null
}

export function listBusinessTypeValues(): BusinessType[] {
  return BUSINESS_TYPES.map((b) => b.value)
}
