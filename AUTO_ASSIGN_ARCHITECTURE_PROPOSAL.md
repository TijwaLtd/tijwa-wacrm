# Auto-Assign Architecture Proposal

## Current State Audit

### What Works
- ✅ Webhook already looks up business by slug (`accounts.subdomain`)
- ✅ Conversation auto-assign with departments, skills, presence, load balancing
- ✅ Modes: manual, round_robin, load_balanced, weighted scoring
- ✅ Working hours check
- ✅ Topic detection for department routing
- ✅ Role-based assignment (owner, admin, agent, viewer)

### What's Missing
- ❌ No business-type-specific team member metadata (vehicle info, freight capacity, certifications)
- ❌ No order-to-team-member assignment (only conversation-to-agent)
- ❌ No business-type-specific routing logic based on team member roles
- ❌ No proximity-based routing for logistics team members
- ❌ No freight/service capacity matching

## Revised Architecture

### 1. Extend Team Member Metadata (Flexible, Business-Type-Agnostic)

**Extend `account_memberships` or `profiles` with business-type metadata:**
```sql
ALTER TABLE account_memberships ADD COLUMN business_metadata JSONB DEFAULT '{}'::jsonb;
-- OR extend profiles if account-level
ALTER TABLE profiles ADD COLUMN business_metadata JSONB DEFAULT '{}'::jsonb;
```

**Metadata structure examples by business type:**

```json
// Logistics/Courier team member
{
  "logistics": {
    "vehicle_type": "motorcycle|van|truck|pickup",
    "freight_capacity": "small|medium|large|xl",
    "zone_coverage": ["Fedha", "Nyayo", "Tassia"],
    "current_location": { "lat": -1.2921, "lng": 36.8219 },
    "max_active_orders": 5,
    "license_plate": "KAA 123A"
  }
}

// Service business team member
{
  "service": {
    "certifications": ["plumbing", "electrical"],
    "service_areas": ["Nairobi West", "Nairobi East"],
    "availability_calendar": {
      "monday": ["09:00-17:00"],
      "tuesday": ["09:00-17:00"]
    },
    "max_concurrent_appointments": 3
  }
}

// Healthcare clinic team member
{
  "healthcare": {
    "specialization": "general_practitioner|pediatrician",
    "license_number": "MP-12345",
    "available_hours": ["09:00-17:00"],
    "max_patients_per_day": 20
  }
}

// Beauty/wellness team member
{
  "beauty": {
    "services_offered": ["haircut", "manicure", "facial"],
    "station_number": 3,
    "max_appointments_per_day": 8
  }
}
```

### 2. Extend Role System for Business-Type-Specific Roles

**Add business-type-specific roles to `account_role_enum`:**
```sql
ALTER TYPE account_role_enum ADD VALUE 'driver';
ALTER TYPE account_role_enum ADD VALUE 'technician';
ALTER TYPE account_role_enum ADD VALUE 'provider';
ALTER TYPE account_role_enum ADD VALUE 'specialist';
```

**Role hierarchy for assignment:**
- `owner` - Full access, can be assigned anything
- `admin` - Full access, can be assigned anything
- `agent` - Standard conversation assignment
- `driver` - Order assignment for logistics businesses
- `technician` - Service appointment assignment
- `provider` - Service provider assignment
- `specialist` - Healthcare specialist assignment
- `viewer` - No assignment

### 3. Business-Type-Specific Assignment Logic

**Routing based on business type + role:**
```typescript
async function handleAssignment(
  db: SupabaseClient,
  accountId: string,
  conversationId: string,
  orderId?: string
) {
  const account = await getAccount(db, accountId);
  const businessType = account.business_type;
  
  const LOGISTICS_TYPES = [
    'logistics_delivery',
    'courier',
    'transportation'
  ];
  
  const SERVICE_TYPES = [
    'service_business',
    'professional_services',
    'cleaning_services',
    'maintenance',
    'beauty_wellness',
    'fitness',
    'automotive',
    'pet_services',
    'healthcare_clinic'
  ];
  
  if (LOGISTICS_TYPES.includes(businessType) && orderId) {
    // Order-to-driver assignment (role: driver)
    return assignOrderToTeamMember(db, { 
      accountId, 
      orderId, 
      role: 'driver',
      businessType 
    });
  } else if (SERVICE_TYPES.includes(businessType)) {
    // Conversation-to-provider assignment (role: provider/technician/specialist)
    return assignConversationToTeamMember(db, { 
      accountId, 
      conversationId, 
      role: getRoleForBusinessType(businessType),
      businessType 
    });
  } else {
    // Standard conversation assignment (role: agent)
    return autoAssignConversation(db, accountId, conversationId);
  }
}

function getRoleForBusinessType(businessType: string): string {
  const roleMap: Record<string, string> = {
    'healthcare_clinic': 'specialist',
    'healthcare': 'specialist',
    'beauty_wellness': 'provider',
    'fitness': 'provider',
    'automotive': 'technician',
    'pet_services': 'provider',
    'cleaning_services': 'technician',
    'maintenance': 'technician',
    'professional_services': 'provider',
    'service_business': 'provider',
  };
  return roleMap[businessType] || 'agent';
}
```

### 4. Generic Team Member Eligibility & Scoring

**Generic function that works for all business types:**
```typescript
async function getEligibleTeamMembers(
  db: SupabaseClient,
  criteria: {
    accountId: string;
    role: string;
    businessType: string;
    metadataFilters?: Record<string, unknown>;
    isAvailable?: boolean;
  }
): Promise<TeamMember[]> {
  const query = db
    .from('account_memberships')
    .select(`
      user_id,
      role,
      business_metadata,
      profiles(full_name, email),
      is_online
    `)
    .eq('account_id', criteria.accountId)
    .eq('role', criteria.role);
  
  // Apply metadata filters based on business type
  if (criteria.metadataFilters) {
    const metadataPath = `${criteria.businessType}`;
    // JSONB query to filter by metadata
    Object.entries(criteria.metadataFilters).forEach(([key, value]) => {
      query = query.filter(`business_metadata->${metadataPath}->${key}`, 'eq', value);
    });
  }
  
  const { data } = await query;
  return data || [];
}

function scoreTeamMembers(
  members: TeamMember[],
  businessType: string,
  factors: {
    proximity?: { lat: number; lng: number };
    currentLoad?: boolean;
    zoneMatch?: string;
  }
): TeamMember[] {
  return members.map(member => {
    let score = 0;
    const metadata = member.business_metadata?.[businessType] || {};
    
    // Proximity score (for logistics)
    if (factors.proximity && metadata.current_location) {
      const distance = calculateDistance(
        factors.proximity,
        metadata.current_location
      );
      score += Math.max(0, 100 - distance);
    }
    
    // Load score (generic)
    if (factors.currentLoad) {
      const maxActive = metadata.max_active_orders || metadata.max_concurrent_appointments || 20;
      const activeOrders = member.active_orders || 0;
      const loadRatio = activeOrders / maxActive;
      score += (1 - loadRatio) * 50;
    }
    
    // Zone match score (for logistics)
    if (factors.zoneMatch && metadata.zone_coverage?.includes(factors.zoneMatch)) {
      score += 30;
    }
    
    return { ...member, score };
  }).sort((a, b) => b.score - a.score);
}
```

### 5. Order-to-Team-Member Assignment (Generic)

```typescript
async function assignOrderToTeamMember(
  db: SupabaseClient,
  params: {
    accountId: string;
    orderId: string;
    role: string;
    businessType: string;
  }
): Promise<string | null> {
  // 1. Get order details
  const order = await getOrder(db, params.orderId);
  
  // 2. Build metadata filters based on business type
  const metadataFilters = buildMetadataFilters(params.businessType, order);
  
  // 3. Get eligible team members
  const members = await getEligibleTeamMembers(db, {
    accountId: params.accountId,
    role: params.role,
    businessType: params.businessType,
    metadataFilters,
    isAvailable: true,
  });
  
  // 4. Score members
  const scored = scoreTeamMembers(members, params.businessType, {
    proximity: order.pickup_location,
    currentLoad: true,
    zoneMatch: order.zone,
  });
  
  // 5. Assign to best member
  if (scored.length === 0) return null;
  
  const bestMember = scored[0];
  await assignOrder(db, params.orderId, bestMember.user_id, params.role);
  
  return bestMember.user_id;
}

function buildMetadataFilters(businessType: string, order: Order): Record<string, unknown> {
  const filters: Record<string, unknown> = {};
  
  if (['logistics_delivery', 'courier', 'transportation'].includes(businessType)) {
    filters.freight_capacity = order.freight_size;
    filters.zone_coverage = order.zone;
  }
  
  if (['service_business', 'professional_services'].includes(businessType)) {
    filters.service_areas = order.location;
  }
  
  return filters;
}
```

### 6. Database Schema Changes

**Migration: `075_team_member_business_metadata.sql`**
```sql
-- Add business metadata to account_memberships
ALTER TABLE account_memberships ADD COLUMN business_metadata JSONB DEFAULT '{}'::jsonb;

-- Add business-type-specific roles
ALTER TYPE account_role_enum ADD VALUE IF NOT EXISTS 'driver';
ALTER TYPE account_role_enum ADD VALUE IF NOT EXISTS 'technician';
ALTER TYPE account_role_enum ADD VALUE IF NOT EXISTS 'provider';
ALTER TYPE account_role_enum ADD VALUE IF NOT EXISTS 'specialist';

-- Add assignment role to orders (to track who was assigned)
ALTER TABLE orders ADD COLUMN assigned_role TEXT DEFAULT 'agent';
ALTER TABLE orders ADD COLUMN assigned_team_member_id UUID REFERENCES profiles(id) ON DELETE SET NULL;

-- Create index for metadata queries
CREATE INDEX idx_account_memberships_metadata ON account_memberships USING GIN(business_metadata);
CREATE INDEX idx_orders_assigned_member ON orders(assigned_team_member_id);

-- Update RLS policies to include new roles
-- (existing policies should already handle new enum values)
```

### 7. UI Components Needed

**Team Member Settings:**
- Extend existing team settings to show business-type-specific metadata
- Dynamic forms based on business type
- For logistics: vehicle type, freight capacity, zone coverage
- For services: certifications, service areas, availability calendar
- For healthcare: specialization, license, available hours

**Assignment Dashboard:**
- Generic assignment dashboard that adapts to business type
- For logistics: map view with team member locations
- For services: calendar view with appointments
- For healthcare: patient queue view

### 8. API Routes Needed

**Team Member Metadata:**
- `PATCH /api/team-members/[id]/metadata` - Update business metadata
- `GET /api/team-members/[id]/metadata` - Get business metadata

**Assignment:**
- `POST /api/orders/[id]/assign` - Generic assignment (works for all business types)
- `POST /api/conversations/[id]/assign` - Generic conversation assignment
- `GET /api/team-members/eligible` - Get eligible team members for assignment

**Location Updates:**
- `POST /api/team-members/[id]/location` - Update current location (for logistics)

### 9. Implementation Priority

**Phase 1: Foundation**
1. Add `business_metadata` column to `account_memberships`
2. Add new roles to `account_role_enum`
3. Add assignment tracking to `orders`
4. Update team settings UI to show/edit metadata

**Phase 2: Generic Assignment Logic**
1. Implement generic `getEligibleTeamMembers()` function
2. Implement generic `scoreTeamMembers()` function
3. Implement business-type-specific metadata filter builder
4. Add business-type routing in webhook

**Phase 3: Business-Type-Specific UI**
1. Dynamic metadata forms based on business type
2. Assignment dashboard adapts to business type
3. Location update interface for logistics

**Phase 4: Advanced Features**
1. Real-time location tracking
2. Calendar integration for service businesses
3. Advanced scoring algorithms

## Summary

**Current Limitations:**
- Auto-assign only handles conversations, not orders
- No business-type-specific team member attributes
- No business-type-specific routing

**Revised Solution:**
- Extend `account_memberships` with flexible `business_metadata` JSONB
- Add business-type-specific roles (driver, technician, provider, specialist)
- Generic assignment logic that adapts based on business type + role
- Metadata filters and scoring work for any business type
- No new tables needed - extensible via metadata

**Benefits:**
- Flexible and extensible for any business type
- No schema changes needed for new business types
- Role-based assignment already in place
- Generic scoring works for all scenarios
- Future-proof architecture
