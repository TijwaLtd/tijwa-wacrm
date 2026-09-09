// ============================================================
// Seed data definitions per business type.
//
// Each business type gets: categories, offerings, and team member
// metadata defaults. Images use publicly available URLs from
// Unsplash/Pexels (free, no auth required).
//
// Usage: Import `SEED_DATA` and iterate based on account's
// business_type to insert categories → offerings.
// ============================================================

import type { BusinessType } from '@/lib/business/capabilities';

// ============================================================
// Types
// ============================================================

export interface SeedCategory {
  name: string;
  slug: string;
  description: string;
  sort_order: number;
}

export interface SeedOffering {
  type: string;
  name: string;
  short_description: string;
  description: string;
  price: number | null;
  price_type: 'fixed' | 'starting_from' | 'contact_for_price' | 'free';
  status: 'active' | 'draft';
  metadata: Record<string, unknown>;
  image_url?: string;
  image_alt?: string;
  category_slug: string;
}

export interface SeedTeamDefaults {
  role: string;
  metadata: Record<string, unknown>;
}

export interface SeedDataSet {
  categories: SeedCategory[];
  offerings: SeedOffering[];
  team_defaults: SeedTeamDefaults[];
  operating_hours?: Record<string, unknown>;
}

// ============================================================
// Logistics / Delivery (Tuma Morgan model)
// ============================================================

const LOGISTICS_DELIVERY: SeedDataSet = {
  categories: [
    {
      name: 'Local Zone Delivery',
      slug: 'local-zone-delivery',
      description: 'Delivery within Fedha, Nyayo, Tassia, Pipeline, Donholm, Taj Mall, Church Road, Gate A/B/D',
      sort_order: 1,
    },
    {
      name: 'Extended Zone Delivery',
      slug: 'extended-zone-delivery',
      description: 'Delivery to areas outside the local zone — prepayment required',
      sort_order: 2,
    },
    {
      name: 'Errands & Shopping',
      slug: 'errands-shopping',
      description: 'Queueing, pickups, drop-offs, supermarket and household shopping',
      sort_order: 3,
    },
    {
      name: 'Business Logistics',
      slug: 'business-logistics',
      description: 'Light logistics for restaurants, pharmacies, and local businesses',
      sort_order: 4,
    },
  ],
  offerings: [
    // ── Local Zone ──────────────────────────────────────────
    {
      type: 'service',
      name: 'Local Zone Parcel Delivery',
      short_description: 'Same-day parcel delivery within the local zone (Fedha, Nyayo, Tassia, Pipeline, Donholm, Taj Mall, Church Road, Gate A/B/D)',
      description: 'Reliable same-day delivery for parcels within our local coverage zone. Pricing varies by item count, vendor stops, weight, and distance. Pay-on-delivery available in the local zone. Wednesday promo: 10% off all deliveries.',
      price: 150,
      price_type: 'starting_from',
      status: 'active',
      category_slug: 'local-zone-delivery',
      image_url: 'https://images.unsplash.com/photo-1566576912321-d58ddd7a6088?w=800&q=80',
      image_alt: 'Motorcycle delivery rider on a city street',
      metadata: {
        zone_type: 'local',
        requires_prepayment: false,
        pay_on_delivery: true,
        zones: ['Fedha', 'Nyayo', 'Tassia', 'Pipeline', 'Donholm', 'Taj Mall', 'Church Road', 'Gate A', 'Gate B', 'Gate D'],
        pricing: {
          base_fee: 100,
          per_item: 50,
          per_stop: 100,
          per_kg: 20,
          per_km: 30,
          wednesday_discount_percent: 10,
          min_order: 100,
          max_weight_kg: 25,
        },
        delivery_hours: { start: '10:00', end: '22:00' },
        estimated_delivery_minutes: 45,
      },
    },
    {
      type: 'package',
      name: 'Local Zone Express Parcel',
      short_description: 'Priority delivery within the local zone — arrive faster',
      description: 'Express delivery service for time-sensitive parcels within the local zone. Priority handling with faster rider dispatch.',
      price: 250,
      price_type: 'starting_from',
      status: 'active',
      category_slug: 'local-zone-delivery',
      image_url: 'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?w=800&q=80',
      image_alt: 'Express delivery package being loaded',
      metadata: {
        zone_type: 'local',
        service_level: 'express',
        requires_prepayment: false,
        pay_on_delivery: true,
        zones: ['Fedha', 'Nyayo', 'Tassia', 'Pipeline', 'Donholm', 'Taj Mall', 'Church Road', 'Gate A', 'Gate B', 'Gate D'],
        pricing: {
          base_fee: 200,
          per_item: 50,
          per_stop: 100,
          per_kg: 25,
          per_km: 40,
          express_surcharge_percent: 40,
          wednesday_discount_percent: 10,
          min_order: 200,
        },
        estimated_delivery_minutes: 30,
      },
    },
    // ── Extended Zone ───────────────────────────────────────
    {
      type: 'service',
      name: 'Extended Zone Delivery',
      short_description: 'Delivery to areas outside the local zone — prepayment required',
      description: 'Delivery service for parcels going beyond our local coverage zone. Extended zone requires full prepayment before dispatch. Pricing includes distance-based surcharge.',
      price: 350,
      price_type: 'starting_from',
      status: 'active',
      category_slug: 'extended-zone-delivery',
      image_url: 'https://images.unsplash.com/photo-1601584115197-04ecc0da31d7?w=800&q=80',
      image_alt: 'Delivery van heading to extended zone',
      metadata: {
        zone_type: 'extended',
        requires_prepayment: true,
        pay_on_delivery: false,
        pricing: {
          base_fee: 300,
          per_item: 75,
          per_stop: 150,
          per_kg: 30,
          per_km: 50,
          min_order: 300,
        },
        delivery_hours: { start: '10:00', end: '20:00' },
        estimated_delivery_minutes: 90,
      },
    },
    // ── Errands ─────────────────────────────────────────────
    {
      type: 'service',
      name: 'Errand — Queueing & Pickups',
      short_description: 'We queue, pick up, and drop off for you',
      description: 'Don\'t have time to queue? Our riders will handle errands — government offices, supermarket runs, pharmacy pickups, and more. Pay a flat fee plus any vendor costs.',
      price: 200,
      price_type: 'starting_from',
      status: 'active',
      category_slug: 'errands-shopping',
      image_url: 'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=800&q=80',
      image_alt: 'Person shopping at a supermarket',
      metadata: {
        service_type: 'errand',
        includes: ['queueing', 'pickup', 'drop_off'],
        pricing: {
          base_fee: 200,
          per_stop: 100,
          wait_time_per_30min: 50,
        },
        max_wait_minutes: 120,
      },
    },
    {
      type: 'service',
      name: 'Supermarket & Household Shopping',
      short_description: 'We shop for your groceries and household items',
      description: 'Send us your shopping list and we\'ll handle it. Shop at your preferred supermarket, pay vendor costs on your behalf (reimbursed), and deliver to your door.',
      price: 250,
      price_type: 'starting_from',
      status: 'active',
      category_slug: 'errands-shopping',
      image_url: 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=800&q=80',
      image_alt: 'Fresh groceries and household items',
      metadata: {
        service_type: 'shopping',
        includes: ['shopping', 'delivery'],
        pricing: {
          base_fee: 250,
          shopping_fee_percent: 10,
          min_shopping_fee: 50,
        },
        max_items: 30,
      },
    },
    // ── Business Logistics ──────────────────────────────────
    {
      type: 'service',
      name: 'Restaurant Delivery Support',
      short_description: 'Outsource your restaurant deliveries to our rider fleet',
      description: 'Running a restaurant but no delivery riders? We handle your deliveries. Reliable, fast, and branded to your business. Ideal for restaurants, cloud kitchens, and food vendors.',
      price: 150,
      price_type: 'starting_from',
      status: 'active',
      category_slug: 'business-logistics',
      image_url: 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=800&q=80',
      image_alt: 'Food delivery in progress',
      metadata: {
        service_type: 'business_logistics',
        target_business: 'restaurant',
        pricing: {
          base_fee: 100,
          per_delivery: 50,
          bulk_discount_threshold: 10,
          bulk_discount_percent: 15,
        },
        features: ['branded_delivery', 'real_time_tracking', 'status_updates'],
      },
    },
    {
      type: 'service',
      name: 'Pharmacy & Medical Delivery',
      short_description: 'Discreet, fast delivery for pharmacies and medical supplies',
      description: 'Specialized delivery service for pharmacies, clinics, and medical supply shops. Temperature-aware handling and priority dispatch for time-sensitive medications.',
      price: 150,
      price_type: 'starting_from',
      status: 'active',
      category_slug: 'business-logistics',
      image_url: 'https://images.unsplash.com/photo-1587854692152-cbe660dbde88?w=800&q=80',
      image_alt: 'Medical supplies ready for delivery',
      metadata: {
        service_type: 'business_logistics',
        target_business: 'pharmacy',
        pricing: {
          base_fee: 100,
          per_delivery: 50,
        },
        features: ['priority_dispatch', 'discreet_packaging', 'proof_of_delivery'],
      },
    },
    // ── Rider On-Demand (standalone rider hire) ─────────────
    {
      type: 'service',
      name: 'Rider On-Demand (Hourly)',
      short_description: 'Hire a rider by the hour for multiple tasks',
      description: 'Need a rider for a few hours? Hire one for bulk pickups, multi-stop errands, or event logistics. Minimum 2-hour booking.',
      price: 500,
      price_type: 'starting_from',
      status: 'active',
      category_slug: 'errands-shopping',
      image_url: 'https://images.unsplash.com/photo-1558618666-fcd25c85f82e?w=800&q=80',
      image_alt: 'Rider ready for hourly hire',
      metadata: {
        service_type: 'hourly_hire',
        pricing: {
          per_hour: 500,
          minimum_hours: 2,
          max_hours: 8,
          overtime_per_hour: 600,
        },
        includes: ['rider', 'motorcycle', 'fuel'],
      },
    },
  ],
  team_defaults: [
    {
      role: 'rider',
      metadata: {
        logistics: {
          vehicle_type: 'motorcycle',
          freight_capacity: 'medium',
          zone_coverage: ['Fedha', 'Nyayo', 'Tassia', 'Pipeline', 'Donholm', 'Taj Mall', 'Church Road', 'Gate A', 'Gate B', 'Gate D'],
          max_active_orders: 5,
        },
      },
    },
  ],
  operating_hours: {
    days: ['tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
    start: '10:00',
    end: '22:00',
    timezone: 'Africa/Nairobi',
    closed_days: ['mon'],
    notes: 'Closed Mondays. Wednesday promo: 10% off all deliveries.',
  },
};

// ============================================================
// Restaurant
// ============================================================

const RESTAURANT: SeedDataSet = {
  categories: [
    { name: 'Starters', slug: 'starters', description: 'Appetizers and small plates', sort_order: 1 },
    { name: 'Main Course', slug: 'main-course', description: 'Hearty main dishes', sort_order: 2 },
    { name: 'Drinks', slug: 'drinks', description: 'Beverages and refreshments', sort_order: 3 },
    { name: 'Desserts', slug: 'desserts', description: 'Sweet endings', sort_order: 4 },
    { name: 'Specials', slug: 'specials', description: 'Chef\'s daily specials', sort_order: 5 },
  ],
  offerings: [
    {
      type: 'menu_item',
      name: 'Grilled Chicken Plate',
      short_description: 'Tender grilled chicken with sides',
      description: 'Marinated chicken grilled to perfection, served with rice, salad, and our signature sauce.',
      price: 450,
      price_type: 'fixed',
      status: 'active',
      category_slug: 'main-course',
      image_url: 'https://images.unsplash.com/photo-1598515214211-89d3c73ae83b?w=800&q=80',
      image_alt: 'Grilled chicken plate with rice',
      metadata: { prep_time_minutes: 20, spice_level: 'medium', allergens: [] },
    },
    {
      type: 'menu_item',
      name: 'Beef Burger',
      short_description: 'Classic beef burger with fries',
      description: 'Juicy beef patty with lettuce, tomato, cheese, and our special sauce. Served with crispy fries.',
      price: 350,
      price_type: 'fixed',
      status: 'active',
      category_slug: 'main-course',
      image_url: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=800&q=80',
      image_alt: 'Beef burger with fries',
      metadata: { prep_time_minutes: 15, spice_level: 'mild', allergens: ['gluten', 'dairy'] },
    },
    {
      type: 'menu_item',
      name: 'Pilau Rice',
      short_description: 'Spiced rice with beef',
      description: 'Fragrant spiced pilau rice cooked with tender beef chunks and aromatic spices.',
      price: 400,
      price_type: 'fixed',
      status: 'active',
      category_slug: 'main-course',
      image_url: 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=800&q=80',
      image_alt: 'Spiced pilau rice dish',
      metadata: { prep_time_minutes: 25, spice_level: 'medium', allergens: [] },
    },
    {
      type: 'menu_item',
      name: 'Chips Masala',
      short_description: 'Spiced crispy fries',
      description: 'Crispy fries tossed in our house spice blend with onions and peppers.',
      price: 200,
      price_type: 'fixed',
      status: 'active',
      category_slug: 'starters',
      image_url: 'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?w=800&q=80',
      image_alt: 'Spiced masala chips',
      metadata: { prep_time_minutes: 10, spice_level: 'hot', allergens: [] },
    },
    {
      type: 'menu_item',
      name: 'Fresh Juice',
      short_description: 'Freshly squeezed fruit juice',
      description: 'Choose from mango, passion fruit, orange, or mixed fruit. Freshly squeezed to order.',
      price: 150,
      price_type: 'fixed',
      status: 'active',
      category_slug: 'drinks',
      image_url: 'https://images.unsplash.com/photo-1621506289937-a8e4df240d0b?w=800&q=80',
      image_alt: 'Fresh fruit juice glasses',
      metadata: { prep_time_minutes: 5, options: ['mango', 'passion fruit', 'orange', 'mixed'] },
    },
    {
      type: 'menu_item',
      name: 'Samosa (3 pcs)',
      short_description: 'Crispy vegetable or meat samosas',
      description: 'Golden crispy samosas filled with spiced vegetables or minced meat. Served with tamarind sauce.',
      price: 100,
      price_type: 'fixed',
      status: 'active',
      category_slug: 'starters',
      image_url: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?w=800&q=80',
      image_alt: 'Crispy samosas',
      metadata: { prep_time_minutes: 8, options: ['vegetable', 'meat'], allergens: ['gluten'] },
    },
  ],
  team_defaults: [
    {
      role: 'waiter',
      metadata: { beauty: { services_counter: ['dine_in', 'takeaway', 'delivery'], max_tables: 8 } },
    },
  ],
  operating_hours: {
    days: ['tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
    start: '11:00',
    end: '23:00',
    timezone: 'Africa/Nairobi',
    closed_days: ['mon'],
  },
};

// ============================================================
// Hotel
// ============================================================

const HOTEL: SeedDataSet = {
  categories: [
    { name: 'Standard Rooms', slug: 'standard-rooms', description: 'Comfortable standard accommodation', sort_order: 1 },
    { name: 'Deluxe Rooms', slug: 'deluxe-rooms', description: 'Upgraded rooms with premium amenities', sort_order: 2 },
    { name: 'Suites', slug: 'suites', description: 'Spacious suites for extended stays', sort_order: 3 },
    { name: 'Hospitality Services', slug: 'hospitality-services', description: 'Additional hotel services', sort_order: 4 },
  ],
  offerings: [
    {
      type: 'room',
      name: 'Standard Single Room',
      short_description: 'Cozy single room with ensuite bathroom',
      description: 'Comfortable single room with air conditioning, free Wi-Fi, TV, and ensuite bathroom. Perfect for solo travelers.',
      price: 3500,
      price_type: 'fixed',
      status: 'active',
      category_slug: 'standard-rooms',
      image_url: 'https://images.unsplash.com/photo-1631049307264-da0ec9d70304?w=800&q=80',
      image_alt: 'Standard hotel single room',
      metadata: { capacity: 1, bed_type: 'single', amenities: ['wifi', 'ac', 'tv', 'bathroom'], breakfast_included: true },
    },
    {
      type: 'room',
      name: 'Standard Double Room',
      short_description: 'Comfortable double room for two',
      description: 'Spacious double room with queen bed, air conditioning, free Wi-Fi, TV, and ensuite bathroom.',
      price: 5000,
      price_type: 'fixed',
      status: 'active',
      category_slug: 'standard-rooms',
      image_url: 'https://images.unsplash.com/photo-1611892440504-42a792e24d32?w=800&q=80',
      image_alt: 'Standard hotel double room',
      metadata: { capacity: 2, bed_type: 'queen', amenities: ['wifi', 'ac', 'tv', 'bathroom'], breakfast_included: true },
    },
    {
      type: 'room',
      name: 'Deluxe King Room',
      short_description: 'Premium room with king bed and city view',
      description: 'Elegant king room with panoramic city views, minibar, premium linens, and luxury bathroom.',
      price: 8000,
      price_type: 'fixed',
      status: 'active',
      category_slug: 'deluxe-rooms',
      image_url: 'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?w=800&q=80',
      image_alt: 'Deluxe king room with view',
      metadata: { capacity: 2, bed_type: 'king', amenities: ['wifi', 'ac', 'tv', 'minibar', 'city_view', 'luxury_bathroom'], breakfast_included: true },
    },
    {
      type: 'service',
      name: 'Airport Transfer',
      short_description: 'Round-trip airport transfer service',
      description: 'Comfortable airport pickup and drop-off in an air-conditioned vehicle. Driver meets you at arrivals.',
      price: 2000,
      price_type: 'fixed',
      status: 'active',
      category_slug: 'hospitality-services',
      image_url: 'https://images.unsplash.com/photo-1449965408869-eaa3f722e40d?w=800&q=80',
      image_alt: 'Airport transfer vehicle',
      metadata: { includes: ['driver', 'vehicle', 'fuel'], max_passengers: 4 },
    },
  ],
  team_defaults: [
    {
      role: 'receptionist',
      metadata: { receptionist: { skills: ['check_in', 'check_out', 'reservations', 'guest_services'], max_concurrent_tasks: 10 } },
    },
  ],
  operating_hours: { days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'], start: '00:00', end: '23:59', timezone: 'UTC' },
};

// ============================================================
// Education
// ============================================================

const EDUCATION: SeedDataSet = {
  categories: [
    { name: 'Short Courses', slug: 'short-courses', description: 'Intensive short-term courses', sort_order: 1 },
    { name: 'Professional Programs', slug: 'professional-programs', description: 'Career-focused training programs', sort_order: 2 },
    { name: 'Workshops', slug: 'workshops', description: 'Hands-on learning workshops', sort_order: 3 },
  ],
  offerings: [
    {
      type: 'course',
      name: 'Digital Marketing Fundamentals',
      short_description: 'Master social media, SEO, and content marketing',
      description: 'A comprehensive 6-week course covering social media marketing, SEO, content strategy, and analytics. Includes hands-on projects and a certificate.',
      price: 15000,
      price_type: 'fixed',
      status: 'active',
      category_slug: 'short-courses',
      image_url: 'https://images.unsplash.com/photo-1432888498266-38ffec3eaf0a?w=800&q=80',
      image_alt: 'Digital marketing course materials',
      metadata: { duration_weeks: 6, sessions_per_week: 2, level: 'beginner', certificate: true, max_students: 30 },
    },
    {
      type: 'course',
      name: 'Python Programming Bootcamp',
      short_description: 'Learn Python from scratch in 8 weeks',
      description: 'Intensive Python bootcamp covering fundamentals, data structures, web development basics, and a capstone project.',
      price: 25000,
      price_type: 'fixed',
      status: 'active',
      category_slug: 'professional-programs',
      image_url: 'https://images.unsplash.com/photo-1526379095098-d400fd0bf935?w=800&q=80',
      image_alt: 'Python programming on laptop',
      metadata: { duration_weeks: 8, sessions_per_week: 3, level: 'beginner_to_intermediate', certificate: true, max_students: 20 },
    },
    {
      type: 'event',
      name: 'Public Speaking Workshop',
      short_description: 'Build confidence in public speaking',
      description: 'A one-day intensive workshop on public speaking, presentation skills, and overcoming stage fright. Limited seats.',
      price: 3000,
      price_type: 'fixed',
      status: 'active',
      category_slug: 'workshops',
      image_url: 'https://images.unsplash.com/photo-1475721027785-f74eccf877e2?w=800&q=80',
      image_alt: 'Public speaking workshop',
      metadata: { duration_hours: 6, level: 'all_levels', certificate: false, max_students: 25 },
    },
  ],
  team_defaults: [
    {
      role: 'instructor',
      metadata: { instructor: { specializations: ['digital_marketing', 'programming', 'soft_skills'], max_classes_per_week: 10 } },
    },
  ],
  operating_hours: { days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat'], start: '08:00', end: '18:00', timezone: 'Africa/Nairobi' },
};

// ============================================================
// Beauty & Wellness
// ============================================================

const BEAUTY_WELLNESS: SeedDataSet = {
  categories: [
    { name: 'Hair Services', slug: 'hair-services', description: 'Hair styling, braids, and treatments', sort_order: 1 },
    { name: 'Nail Services', slug: 'nail-services', description: 'Manicure, pedicure, and nail art', sort_order: 2 },
    { name: 'Skin & Face', slug: 'skin-face', description: 'Facials, skincare, and treatments', sort_order: 3 },
    { name: 'Packages', slug: 'beauty-packages', description: 'Bundled beauty services', sort_order: 4 },
  ],
  offerings: [
    {
      type: 'service',
      name: 'Hair Braiding — Box Braids',
      short_description: 'Professional box braid installation',
      description: 'Expert box braids in various sizes. Includes consultation, washing, braiding, and styling. Duration: 3-5 hours.',
      price: 2000,
      price_type: 'starting_from',
      status: 'active',
      category_slug: 'hair-services',
      image_url: 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=800&q=80',
      image_alt: 'Beautiful box braids hairstyle',
      metadata: { duration_hours: '3-5', skill_level: 'professional', includes: ['consultation', 'wash', 'braiding', 'styling'] },
    },
    {
      type: 'service',
      name: 'Classic Manicure & Pedicure',
      short_description: 'Nail grooming and polish',
      description: 'Complete nail care including filing, cuticle care, hand and foot massage, and polish application.',
      price: 800,
      price_type: 'fixed',
      status: 'active',
      category_slug: 'nail-services',
      image_url: 'https://images.unsplash.com/photo-1604654894610-df63bc536371?w=800&q=80',
      image_alt: 'Manicure and pedicure setup',
      metadata: { duration_minutes: 60, includes: ['filing', 'cuticle_care', 'massage', 'polish'] },
    },
    {
      type: 'service',
      name: 'Deep Cleansing Facial',
      short_description: 'Rejuvenating facial treatment',
      description: 'Deep cleansing facial with steam, extraction, mask, and moisturizing. Suitable for all skin types.',
      price: 1500,
      price_type: 'fixed',
      status: 'active',
      category_slug: 'skin-face',
      image_url: 'https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?w=800&q=80',
      image_alt: 'Facial treatment in progress',
      metadata: { duration_minutes: 75, includes: ['cleansing', 'steam', 'extraction', 'mask', 'moisturize'] },
    },
  ],
  team_defaults: [
    {
      role: 'receptionist',
      metadata: { receptionist: { skills: ['booking', 'client_consultation'], max_concurrent_appointments: 6 } },
    },
  ],
  operating_hours: { days: ['tue', 'wed', 'thu', 'fri', 'sat'], start: '09:00', end: '19:00', timezone: 'Africa/Nairobi', closed_days: ['mon', 'sun'] },
};

// ============================================================
// Service Business (generic)
// ============================================================

const SERVICE_BUSINESS: SeedDataSet = {
  categories: [
    { name: 'Core Services', slug: 'core-services', description: 'Main service offerings', sort_order: 1 },
    { name: 'Packages', slug: 'service-packages', description: 'Bundled service packages', sort_order: 2 },
    { name: 'Consultations', slug: 'consultations', description: 'Professional consultation services', sort_order: 3 },
  ],
  offerings: [
    {
      type: 'service',
      name: 'Standard Service Visit',
      short_description: 'Professional on-site service',
      description: 'A qualified technician visits your location to assess, repair, or install. Includes travel within the service area.',
      price: 2000,
      price_type: 'starting_from',
      status: 'active',
      category_slug: 'core-services',
      image_url: 'https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=800&q=80',
      image_alt: 'Professional service technician',
      metadata: { includes: ['travel', 'assessment', 'basic_repair'], travel_radius_km: 15 },
    },
    {
      type: 'service',
      name: 'Emergency Service Call',
      short_description: 'Priority same-day service',
      description: 'Urgent same-day service for emergencies. Priority dispatch with faster response time.',
      price: 3500,
      price_type: 'starting_from',
      status: 'active',
      category_slug: 'core-services',
      image_url: 'https://images.unsplash.com/photo-1621905252507-b35492cc74b4?w=800&q=80',
      image_alt: 'Emergency service response',
      metadata: { includes: ['priority_dispatch', 'same_day', 'travel'], response_time_hours: 2 },
    },
    {
      type: 'service',
      name: 'Free Consultation',
      short_description: 'No-obligation assessment and quote',
      description: 'Free initial consultation to assess your needs and provide a detailed quote. No commitment required.',
      price: 0,
      price_type: 'free',
      status: 'active',
      category_slug: 'consultations',
      image_url: 'https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?w=800&q=80',
      image_alt: 'Professional consultation meeting',
      metadata: { duration_minutes: 30, format: 'in_person_or_virtual' },
    },
  ],
  team_defaults: [
    {
      role: 'agent',
      metadata: { service: { certifications: ['general'], service_areas: ['city_wide'], max_concurrent_appointments: 3 } },
    },
  ],
  operating_hours: { days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat'], start: '08:00', end: '17:00', timezone: 'Africa/Nairobi' },
};

// ============================================================
// Retailer
// ============================================================

const RETAILER: SeedDataSet = {
  categories: [
    { name: 'Electronics', slug: 'electronics', description: 'Gadgets and electronic devices', sort_order: 1 },
    { name: 'Fashion', slug: 'fashion', description: 'Clothing and accessories', sort_order: 2 },
    { name: 'Home & Living', slug: 'home-living', description: 'Home decor and essentials', sort_order: 3 },
  ],
  offerings: [
    {
      type: 'product',
      name: 'Wireless Bluetooth Earbuds',
      short_description: 'Noise-cancelling wireless earbuds',
      description: 'High-quality wireless earbuds with active noise cancellation, 8-hour battery life, and IPX5 water resistance.',
      price: 2500,
      price_type: 'fixed',
      status: 'active',
      category_slug: 'electronics',
      image_url: 'https://images.unsplash.com/photo-1590658268037-6bf12f032f55?w=800&q=80',
      image_alt: 'Wireless bluetooth earbuds',
      metadata: { stock: 50, sku: 'ELEC-WB-001', weight_g: 50 },
    },
    {
      type: 'product',
      name: 'Classic Cotton T-Shirt',
      short_description: 'Comfortable everyday cotton tee',
      description: '100% cotton crew-neck t-shirt. Available in multiple colors and sizes.',
      price: 800,
      price_type: 'fixed',
      status: 'active',
      category_slug: 'fashion',
      image_url: 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=800&q=80',
      image_alt: 'Cotton t-shirt',
      metadata: { stock: 200, sku: 'FASH-CT-001', sizes: ['S', 'M', 'L', 'XL'], colors: ['white', 'black', 'navy'] },
    },
    {
      type: 'product',
      name: 'Scented Candle Set',
      short_description: 'Set of 3 artisan scented candles',
      description: 'Hand-poured soy wax candles in lavender, vanilla, and sandalwood. Burns for 40 hours each.',
      price: 1200,
      price_type: 'fixed',
      status: 'active',
      category_slug: 'home-living',
      image_url: 'https://images.unsplash.com/photo-1602028915047-37269d1a73f7?w=800&q=80',
      image_alt: 'Scented candle set',
      metadata: { stock: 30, sku: 'HOME-SC-001', weight_g: 450 },
    },
  ],
  team_defaults: [],
  operating_hours: { days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat'], start: '09:00', end: '18:00', timezone: 'Africa/Nairobi' },
};

// ============================================================
// Healthcare Clinic
// ============================================================

const HEALTHCARE_CLINIC: SeedDataSet = {
  categories: [
    { name: 'General Practice', slug: 'general-practice', description: 'General medical consultations', sort_order: 1 },
    { name: 'Specialist Services', slug: 'specialist-services', description: 'Specialist medical services', sort_order: 2 },
    { name: 'Wellness & Prevention', slug: 'wellness-prevention', description: 'Preventive care and wellness', sort_order: 3 },
  ],
  offerings: [
    {
      type: 'service',
      name: 'General Consultation',
      short_description: 'Doctor consultation for common ailments',
      description: 'Standard consultation with a general practitioner. Includes examination, diagnosis, and prescription if needed.',
      price: 1500,
      price_type: 'fixed',
      status: 'active',
      category_slug: 'general-practice',
      image_url: 'https://images.unsplash.com/photo-1582750433449-648ed127bb54?w=800&q=80',
      image_alt: 'Doctor consultation',
      metadata: { duration_minutes: 20, includes: ['examination', 'diagnosis', 'prescription'] },
    },
    {
      type: 'service',
      name: 'Vaccination',
      short_description: 'Routine and travel vaccinations',
      description: 'Administer routine childhood and adult vaccinations, as well as travel immunizations.',
      price: 2000,
      price_type: 'starting_from',
      status: 'active',
      category_slug: 'wellness-prevention',
      image_url: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=800&q=80',
      image_alt: 'Vaccination service',
      metadata: { duration_minutes: 10, vaccine_types: ['routine', 'travel', 'flu'] },
    },
  ],
  team_defaults: [
    {
      role: 'receptionist',
      metadata: { receptionist: { skills: ['appointment_scheduling', 'patient_check_in'], max_concurrent_tasks: 8 } },
    },
  ],
  operating_hours: { days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat'], start: '08:00', end: '17:00', timezone: 'Africa/Nairobi' },
};

// ============================================================
// Events
// ============================================================

const EVENTS: SeedDataSet = {
  categories: [
    { name: 'Corporate Events', slug: 'corporate-events', description: 'Business and corporate gatherings', sort_order: 1 },
    { name: 'Social Events', slug: 'social-events', description: 'Personal and social celebrations', sort_order: 2 },
    { name: 'Conferences', slug: 'conferences', description: 'Seminars, conferences, and workshops', sort_order: 3 },
  ],
  offerings: [
    {
      type: 'event',
      name: 'Corporate Dinner Setup',
      short_description: 'Full-service corporate dinner event',
      description: 'Complete event management for corporate dinners including venue coordination, catering, and AV setup.',
      price: 50000,
      price_type: 'starting_from',
      status: 'active',
      category_slug: 'corporate-events',
      image_url: 'https://images.unsplash.com/photo-1511578314322-379afb476865?w=800&q=80',
      image_alt: 'Corporate dinner event setup',
      metadata: { min_guests: 20, max_guests: 200, includes: ['venue_coordination', 'catering', 'av_setup'] },
    },
    {
      type: 'event',
      name: 'Birthday Party Package',
      short_description: 'Complete birthday party planning',
      description: 'End-to-end birthday party planning with decorations, cake coordination, entertainment, and cleanup.',
      price: 25000,
      price_type: 'starting_from',
      status: 'active',
      category_slug: 'social-events',
      image_url: 'https://images.unsplash.com/photo-1530103862676-de8c9debad1d?w=800&q=80',
      image_alt: 'Birthday party decorations',
      metadata: { min_guests: 10, max_guests: 100, includes: ['decorations', 'cake_coordination', 'entertainment', 'cleanup'] },
    },
  ],
  team_defaults: [],
  operating_hours: { days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat'], start: '09:00', end: '18:00', timezone: 'Africa/Nairobi' },
};

// ============================================================
// NGO / Nonprofit
// ============================================================

const NGO_NONPROFIT: SeedDataSet = {
  categories: [
    { name: 'Community Programs', slug: 'community-programs', description: 'Local community development programs', sort_order: 1 },
    { name: 'Education Initiatives', slug: 'education-initiatives', description: 'Educational support and scholarships', sort_order: 2 },
    { name: 'Health Programs', slug: 'health-programs', description: 'Health awareness and support programs', sort_order: 3 },
  ],
  offerings: [
    {
      type: 'program',
      name: 'Youth Mentorship Program',
      short_description: '12-week mentorship for at-risk youth',
      description: 'Structured mentorship program pairing experienced professionals with at-risk youth for career guidance and life skills.',
      price: 0,
      price_type: 'free',
      status: 'active',
      category_slug: 'community-programs',
      image_url: 'https://images.unsplash.com/photo-1488521787991-ed7bbaae773c?w=800&q=80',
      image_alt: 'Youth mentorship session',
      metadata: { duration_weeks: 12, participants_per_mentor: 3, includes: ['weekly_sessions', 'career_guiding', 'life_skills'] },
    },
    {
      type: 'resource',
      name: 'Emergency Food Relief',
      short_description: 'Food packages for families in need',
      description: 'Provide food relief packages to families affected by drought, displacement, or economic hardship.',
      price: 0,
      price_type: 'free',
      status: 'active',
      category_slug: 'community-programs',
      image_url: 'https://images.unsplash.com/photo-1488521787991-ed7bbaae773c?w=800&q=80',
      image_alt: 'Food relief distribution',
      metadata: { package_value_kes: 2500, families_served_per_batch: 50 },
    },
  ],
  team_defaults: [],
  operating_hours: { days: ['mon', 'tue', 'wed', 'thu', 'fri'], start: '08:00', end: '17:00', timezone: 'Africa/Nairobi' },
};

// ============================================================
// Property / Real Estate
// ============================================================

const PROPERTY_REAL_ESTATE: SeedDataSet = {
  categories: [
    { name: 'Residential Rentals', slug: 'residential-rentals', description: 'Houses and apartments for rent', sort_order: 1 },
    { name: 'Commercial Spaces', slug: 'commercial-spaces', description: 'Offices and retail spaces', sort_order: 2 },
    { name: 'Land', slug: 'land', description: 'Land for sale or lease', sort_order: 3 },
  ],
  offerings: [
    {
      type: 'property',
      name: '2-Bedroom Apartment — Kilimani',
      short_description: 'Modern 2BR apartment in Kilimani',
      description: 'Spacious 2-bedroom apartment with modern finishes, parking, and 24/7 security. Close to shopping and transport.',
      price: 45000,
      price_type: 'fixed',
      status: 'active',
      category_slug: 'residential-rentals',
      image_url: 'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=800&q=80',
      image_alt: 'Modern apartment interior',
      metadata: { bedrooms: 2, bathrooms: 2, sqft: 900, amenities: ['parking', 'security', 'water_tank'], available: true },
    },
    {
      type: 'property',
      name: 'Office Space — Westlands',
      short_description: 'Furnished office space in Westlands',
      description: 'Fully furnished open-plan office in a prime Westlands location. Suitable for teams of 10-20.',
      price: 120000,
      price_type: 'fixed',
      status: 'active',
      category_slug: 'commercial-spaces',
      image_url: 'https://images.unsplash.com/photo-1497366216548-37526070297c?w=800&q=80',
      image_alt: 'Modern office space',
      metadata: { capacity: '10-20', sqft: 1500, furnished: true, amenities: ['wifi', 'parking', 'security', 'kitchen'] },
    },
  ],
  team_defaults: [],
  operating_hours: { days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat'], start: '09:00', end: '17:00', timezone: 'Africa/Nairobi' },
};

// ============================================================
// Master mapping
// ============================================================

export const SEED_DATA: Partial<Record<BusinessType, SeedDataSet>> = {
  logistics_delivery: LOGISTICS_DELIVERY,
  courier: LOGISTICS_DELIVERY,
  transportation: LOGISTICS_DELIVERY,
  restaurant: RESTAURANT,
  hotel: HOTEL,
  hotel_restaurant: { ...HOTEL, categories: [...HOTEL.categories, ...RESTAURANT.categories], offerings: [...HOTEL.offerings, ...RESTAURANT.offerings] },
  education: EDUCATION,
  beauty_wellness: BEAUTY_WELLNESS,
  fitness: SERVICE_BUSINESS,
  service_business: SERVICE_BUSINESS,
  professional_services: SERVICE_BUSINESS,
  cleaning_services: SERVICE_BUSINESS,
  maintenance: SERVICE_BUSINESS,
  automotive: SERVICE_BUSINESS,
  pet_services: SERVICE_BUSINESS,
  healthcare: HEALTHCARE_CLINIC,
  healthcare_clinic: HEALTHCARE_CLINIC,
  events: EVENTS,
  ngo_nonprofit: NGO_NONPROFIT,
  property_real_estate: PROPERTY_REAL_ESTATE,
  retailer: RETAILER,
  wholesaler: RETAILER,
  other: SERVICE_BUSINESS,
};

/**
 * Get seed data for a business type. Falls back to generic
 * service business data if the specific type isn't mapped.
 */
export function getSeedDataForBusinessType(businessType: BusinessType): SeedDataSet {
  return SEED_DATA[businessType] ?? SERVICE_BUSINESS;
}
