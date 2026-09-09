import type { SupabaseClient } from '@supabase/supabase-js';
import type { BusinessMetadata } from './team-metadata';
import { BUSINESS_TYPE_METADATA_KEY, BUSINESS_TYPE_ROLE } from './team-metadata';

/**
 * Generic team member assignment for orders and conversations
 * Works across all business types using role-based routing + metadata filtering
 */

// ============================================================================
// Types
// ============================================================================

export interface TeamMember {
  user_id: string;
  full_name: string | null;
  email: string | null;
  role: string;
  business_metadata: BusinessMetadata;
  is_online: boolean;
  active_conversations: number;
  active_orders: number;
}

export interface EligibilityCriteria {
  accountId: string;
  role: string;
  businessType: string;
  metadataFilters?: Record<string, unknown>;
  isAvailable?: boolean;
  maxLoad?: number;
}

export interface ScoringFactors {
  proximity?: { lat: number; lng: number };
  currentLoad?: boolean;
  zoneMatch?: string;
  skillMatch?: string[];
}

// ============================================================================
// Get Eligible Team Members
// ============================================================================

export async function getEligibleTeamMembers(
  db: SupabaseClient,
  criteria: EligibilityCriteria,
): Promise<TeamMember[]> {
  const { accountId, role, businessType, metadataFilters, isAvailable, maxLoad } = criteria;

  // Build base query
  let query = db
    .from('account_memberships')
    .select(`
      user_id,
      role,
      business_metadata,
      profiles!inner(full_name, email),
      is_online
    `)
    .eq('account_id', accountId)
    .eq('role', role);

  // Apply availability filter if specified
  if (isAvailable !== undefined) {
    query = query.eq('is_online', isAvailable);
  }

  const { data: members, error } = await query;

  if (error || !members || members.length === 0) {
    return [];
  }

  // Enrich with active conversation/order counts
  const userIds = members.map((m: { user_id: string }) => m.user_id);

  const [convCounts, orderCounts] = await Promise.all([
    db
      .from('conversations')
      .select('assigned_agent_id')
      .eq('account_id', accountId)
      .neq('status', 'closed')
      .in('assigned_agent_id', userIds),
    db
      .from('orders')
      .select('assigned_team_member_id')
      .eq('account_id', accountId)
      .in('assigned_team_member_id', userIds),
  ]);

  // Tally active counts
  const convTally = new Map<string, number>();
  const orderTally = new Map<string, number>();
  
  for (const uid of userIds) {
    convTally.set(uid, 0);
    orderTally.set(uid, 0);
  }
  
  for (const row of convCounts.data ?? []) {
    if (row.assigned_agent_id) {
      convTally.set(
        row.assigned_agent_id,
        (convTally.get(row.assigned_agent_id) ?? 0) + 1,
      );
    }
  }
  
  for (const row of orderCounts.data ?? []) {
    if (row.assigned_team_member_id) {
      orderTally.set(
        row.assigned_team_member_id,
        (orderTally.get(row.assigned_team_member_id) ?? 0) + 1,
      );
    }
  }

  // Map to TeamMember objects
  const teamMembers: TeamMember[] = members.map((member: any) => {
    const metadataKey = BUSINESS_TYPE_METADATA_KEY[businessType];
    const metadata = member.business_metadata?.[metadataKey] || {};
    
    // Get max capacity from metadata or use default
    const maxCapacity = metadata.max_active_orders || 
                       metadata.max_concurrent_appointments || 
                       metadata.max_patients_per_day || 
                       metadata.max_appointments_per_day || 
                       metadata.max_jobs_per_day || 
                       metadata.max_clients_per_session || 
                       20;

    return {
      user_id: member.user_id,
      full_name: member.profiles.full_name,
      email: member.profiles.email,
      role: member.role,
      business_metadata: member.business_metadata || {},
      is_online: member.is_online || false,
      active_conversations: convTally.get(member.user_id) ?? 0,
      active_orders: orderTally.get(member.user_id) ?? 0,
    };
  });

  // Apply metadata filters
  let filtered = teamMembers;
  if (metadataFilters && Object.keys(metadataFilters).length > 0) {
    filtered = teamMembers.filter(member => {
      const metadataKey = BUSINESS_TYPE_METADATA_KEY[businessType];
      const memberMetadata = (member.business_metadata[metadataKey] || {}) as Record<string, unknown>;
      
      return Object.entries(metadataFilters).every(([key, value]) => {
        const memberValue = memberMetadata[key];
        
        // Array containment check
        if (Array.isArray(memberValue)) {
          return Array.isArray(value) 
            ? value.every(v => memberValue.includes(v))
            : memberValue.includes(value);
        }
        
        // Exact match
        return memberValue === value;
      });
    });
  }

  // Apply max load filter
  if (maxLoad !== undefined) {
    filtered = filtered.filter(member => {
      const metadataKey = BUSINESS_TYPE_METADATA_KEY[businessType];
      const metadata = (member.business_metadata[metadataKey] || {}) as Record<string, unknown>;
      const maxCapacity = (metadata.max_active_orders || 
                         metadata.max_concurrent_appointments || 
                         metadata.max_patients_per_day || 
                         metadata.max_appointments_per_day || 
                         metadata.max_jobs_per_day || 
                         metadata.max_clients_per_session || 
                         20) as number;
      return member.active_orders < maxCapacity;
    });
  }

  return filtered;
}

// ============================================================================
// Score Team Members
// ============================================================================

export function scoreTeamMembers(
  members: TeamMember[],
  businessType: string,
  factors: ScoringFactors,
): TeamMember[] {
  const metadataKey = BUSINESS_TYPE_METADATA_KEY[businessType];
  
  return members.map(member => {
    let score = 0;
    const metadata = (member.business_metadata[metadataKey] || {}) as Record<string, unknown>;
    
    // Proximity score (for logistics)
    if (factors.proximity && metadata.current_location) {
      const distance = calculateDistance(
        factors.proximity,
        metadata.current_location as { lat: number; lng: number },
      );
      // Higher score for closer drivers (100 - distance in km)
      score += Math.max(0, 100 - distance);
    }
    
    // Load score (generic - fewer active = higher score)
    if (factors.currentLoad) {
      const maxCapacity = (metadata.max_active_orders || 
                         metadata.max_concurrent_appointments || 
                         metadata.max_patients_per_day || 
                         metadata.max_appointments_per_day || 
                         metadata.max_jobs_per_day || 
                         metadata.max_clients_per_session || 
                         20) as number;
      const activeLoad = member.active_orders;
      const loadRatio = activeLoad / maxCapacity;
      score += (1 - loadRatio) * 50;
    }
    
    // Zone match score (for logistics)
    if (factors.zoneMatch && metadata.zone_coverage) {
      if ((metadata.zone_coverage as string[]).includes(factors.zoneMatch)) {
        score += 30;
      }
    }
    
    // Skill match score (for service businesses)
    if (factors.skillMatch && metadata.certifications) {
      const matchingSkills = factors.skillMatch.filter(skill => 
        (metadata.certifications as string[])?.includes(skill)
      );
      score += matchingSkills.length * 10;
    }
    
    // Presence score (online = higher score)
    if (member.is_online) {
      score += 20;
    }
    
    return { ...member, score };
  }).sort((a, b) => b.score - a.score);
}

// ============================================================================
// Helper Functions
// ============================================================================

function calculateDistance(
  point1: { lat: number; lng: number },
  point2: { lat: number; lng: number },
): number {
  // Haversine formula for distance in km
  const R = 6371; // Earth's radius in km
  const dLat = toRad(point2.lat - point1.lat);
  const dLng = toRad(point2.lng - point1.lng);
  
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(point1.lat)) * Math.cos(toRad(point2.lat)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(degrees: number): number {
  return degrees * (Math.PI / 180);
}

// ============================================================================
// Assignment Routing
// ============================================================================

export function getRoleForBusinessType(businessType: string): string {
  return BUSINESS_TYPE_ROLE[businessType] || 'agent';
}

export function shouldUseOrderAssignment(businessType: string): boolean {
  const orderBasedTypes = [
    'logistics_delivery',
    'courier',
    'transportation',
  ];
  return orderBasedTypes.includes(businessType);
}

export function buildMetadataFilters(
  businessType: string,
  orderOrBooking: any,
): Record<string, unknown> {
  const filters: Record<string, unknown> = {};
  const metadataKey = BUSINESS_TYPE_METADATA_KEY[businessType];
  
  if (metadataKey === 'logistics') {
    // For logistics: filter by freight capacity and zone
    if (orderOrBooking.freight_size) {
      filters.freight_capacity = orderOrBooking.freight_size;
    }
    if (orderOrBooking.zone) {
      filters.zone_coverage = orderOrBooking.zone;
    }
  }
  
  if (metadataKey === 'service' || metadataKey === 'cleaning') {
    // For services: filter by service area
    if (orderOrBooking.location) {
      filters.service_areas = orderOrBooking.location;
    }
  }
  
  if (metadataKey === 'healthcare') {
    // For healthcare: filter by specialization
    if (orderOrBooking.specialization) {
      filters.specialization = orderOrBooking.specialization;
    }
  }
  
  return filters;
}
