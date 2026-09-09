/**
 * Predefined business metadata schemas for team members
 * These are typed structures for the JSONB business_metadata column
 */

// ============================================================================
// Logistics/Courier/Transportation
// ============================================================================

export interface LogisticsMetadata {
  vehicle_type: 'motorcycle' | 'van' | 'truck' | 'pickup';
  freight_capacity: 'small' | 'medium' | 'large' | 'xl';
  zone_coverage: string[];
  current_location?: {
    lat: number;
    lng: number;
  };
  max_active_orders: number;
  license_plate?: string;
  vehicle_registration?: string;
}

// ============================================================================
// Service Business / Professional Services
// ============================================================================

export interface ServiceMetadata {
  certifications?: string[];
  service_areas?: string[];
  availability_calendar?: Record<string, string[]>; // { monday: ['09:00-17:00'] }
  max_concurrent_appointments?: number;
}

// ============================================================================
// Healthcare / Healthcare Clinic
// ============================================================================

export interface HealthcareMetadata {
  specialization: 'general_practitioner' | 'pediatrician' | 'dentist' | 'specialist';
  license_number?: string;
  available_hours?: string[]; // ['09:00-17:00']
  max_patients_per_day?: number;
}

// ============================================================================
// Beauty / Wellness / Fitness
// ============================================================================

export interface BeautyMetadata {
  services_offered?: string[];
  station_number?: number;
  max_appointments_per_day?: number;
}

export interface FitnessMetadata {
  certifications?: string[];
  specializations?: string[];
  max_clients_per_session?: number;
}

// ============================================================================
// Automotive
// ============================================================================

export interface AutomotiveMetadata {
  specializations?: string[];
  certifications?: string[];
  service_areas?: string[];
}

// ============================================================================
// Pet Services
// ============================================================================

export interface PetServicesMetadata {
  specializations?: string[];
  certifications?: string[];
  service_areas?: string[];
}

// ============================================================================
// Cleaning Services / Maintenance
// ============================================================================

export interface CleaningMetadata {
  specializations?: string[];
  service_areas?: string[];
  max_jobs_per_day?: number;
}

// ============================================================================
// Union Type for All Business Metadata
// ============================================================================

export type BusinessMetadata = {
  logistics?: LogisticsMetadata;
  service?: ServiceMetadata;
  healthcare?: HealthcareMetadata;
  beauty?: BeautyMetadata;
  fitness?: FitnessMetadata;
  automotive?: AutomotiveMetadata;
  pet_services?: PetServicesMetadata;
  cleaning?: CleaningMetadata;
};

// ============================================================================
// Business Type to Metadata Key Mapping
// ============================================================================

export const BUSINESS_TYPE_METADATA_KEY: Record<string, keyof BusinessMetadata> = {
  logistics_delivery: 'logistics',
  courier: 'logistics',
  transportation: 'logistics',
  service_business: 'service',
  professional_services: 'service',
  healthcare: 'healthcare',
  healthcare_clinic: 'healthcare',
  beauty_wellness: 'beauty',
  fitness: 'fitness',
  automotive: 'automotive',
  pet_services: 'pet_services',
  cleaning_services: 'cleaning',
  maintenance: 'cleaning',
};

// ============================================================================
// Role to Business Type Mapping
// ============================================================================

export const ROLE_BUSINESS_TYPES: Record<string, string[]> = {
  driver: ['logistics_delivery', 'courier', 'transportation'],
  technician: ['automotive', 'cleaning_services', 'maintenance'],
  provider: ['service_business', 'professional_services', 'beauty_wellness', 'fitness', 'pet_services'],
  specialist: ['healthcare', 'healthcare_clinic'],
  agent: [], // Default for all other business types
};

// ============================================================================
// Business Type to Role Mapping
// ============================================================================

export const BUSINESS_TYPE_ROLE: Record<string, string> = {
  logistics_delivery: 'driver',
  courier: 'driver',
  transportation: 'driver',
  automotive: 'technician',
  cleaning_services: 'technician',
  maintenance: 'technician',
  service_business: 'provider',
  professional_services: 'provider',
  beauty_wellness: 'provider',
  fitness: 'provider',
  pet_services: 'provider',
  healthcare: 'specialist',
  healthcare_clinic: 'specialist',
};

// ============================================================================
// Metadata Schema Validators
// ============================================================================

export function validateLogisticsMetadata(data: unknown): data is LogisticsMetadata {
  if (!data || typeof data !== 'object') return false;
  const d = data as Partial<LogisticsMetadata>;
  return (
    typeof d.vehicle_type === 'string' &&
    ['motorcycle', 'van', 'truck', 'pickup'].includes(d.vehicle_type) &&
    typeof d.freight_capacity === 'string' &&
    ['small', 'medium', 'large', 'xl'].includes(d.freight_capacity) &&
    Array.isArray(d.zone_coverage) &&
    typeof d.max_active_orders === 'number'
  );
}

export function validateServiceMetadata(data: unknown): data is ServiceMetadata {
  if (!data || typeof data !== 'object') return false;
  const d = data as Partial<ServiceMetadata>;
  return true; // Service metadata is mostly optional
}

export function validateHealthcareMetadata(data: unknown): data is HealthcareMetadata {
  if (!data || typeof data !== 'object') return false;
  const d = data as Partial<HealthcareMetadata>;
  return (
    typeof d.specialization === 'string' &&
    ['general_practitioner', 'pediatrician', 'dentist', 'specialist'].includes(d.specialization)
  );
}

export function validateBeautyMetadata(data: unknown): data is BeautyMetadata {
  if (!data || typeof data !== 'object') return false;
  return true; // Beauty metadata is mostly optional
}

export function validateFitnessMetadata(data: unknown): data is FitnessMetadata {
  if (!data || typeof data !== 'object') return false;
  return true; // Fitness metadata is mostly optional
}

export function validateAutomotiveMetadata(data: unknown): data is AutomotiveMetadata {
  if (!data || typeof data !== 'object') return false;
  return true; // Automotive metadata is mostly optional
}

export function validatePetServicesMetadata(data: unknown): data is PetServicesMetadata {
  if (!data || typeof data !== 'object') return false;
  return true; // Pet services metadata is mostly optional
}

export function validateCleaningMetadata(data: unknown): data is CleaningMetadata {
  if (!data || typeof data !== 'object') return false;
  return true; // Cleaning metadata is mostly optional
}

// ============================================================================
// Default Metadata Values
// ============================================================================

export const DEFAULT_LOGISTICS_METADATA: LogisticsMetadata = {
  vehicle_type: 'motorcycle',
  freight_capacity: 'small',
  zone_coverage: [],
  max_active_orders: 5,
};

export const DEFAULT_SERVICE_METADATA: ServiceMetadata = {
  certifications: [],
  service_areas: [],
  max_concurrent_appointments: 3,
};

export const DEFAULT_HEALTHCARE_METADATA: HealthcareMetadata = {
  specialization: 'general_practitioner',
  max_patients_per_day: 20,
};

export const DEFAULT_BEAUTY_METADATA: BeautyMetadata = {
  services_offered: [],
  max_appointments_per_day: 8,
};

export const DEFAULT_FITNESS_METADATA: FitnessMetadata = {
  certifications: [],
  specializations: [],
  max_clients_per_session: 1,
};

export const DEFAULT_AUTOMOTIVE_METADATA: AutomotiveMetadata = {
  specializations: [],
  certifications: [],
  service_areas: [],
};

export const DEFAULT_PET_SERVICES_METADATA: PetServicesMetadata = {
  specializations: [],
  certifications: [],
  service_areas: [],
};

export const DEFAULT_CLEANING_METADATA: CleaningMetadata = {
  specializations: [],
  service_areas: [],
  max_jobs_per_day: 5,
};

export function getDefaultMetadataForBusinessType(businessType: string): BusinessMetadata {
  const key = BUSINESS_TYPE_METADATA_KEY[businessType];
  switch (key) {
    case 'logistics':
      return { logistics: DEFAULT_LOGISTICS_METADATA };
    case 'service':
      return { service: DEFAULT_SERVICE_METADATA };
    case 'healthcare':
      return { healthcare: DEFAULT_HEALTHCARE_METADATA };
    case 'beauty':
      return { beauty: DEFAULT_BEAUTY_METADATA };
    case 'fitness':
      return { fitness: DEFAULT_FITNESS_METADATA };
    case 'automotive':
      return { automotive: DEFAULT_AUTOMOTIVE_METADATA };
    case 'pet_services':
      return { pet_services: DEFAULT_PET_SERVICES_METADATA };
    case 'cleaning':
      return { cleaning: DEFAULT_CLEANING_METADATA };
    default:
      return {};
  }
}
