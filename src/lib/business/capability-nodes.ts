// ============================================================
// Capability Node Registry
//
// Maps capability keys to their available nodes. Each node
// definition describes a business operation that can be used
// in flows. The registry is used by:
// 1. The flow builder to show available capability nodes
// 2. The engine to validate node configurations
// 3. Default flow templates to reference operations
// ============================================================

export interface CapabilityNodeDefinition {
  /** Stable node key — used in flow node configs */
  node_key: string;
  /** Human-readable name */
  name: string;
  /** Description of what this node does */
  description: string;
  /** Category for grouping in the builder UI */
  category: 'read' | 'search' | 'check' | 'action' | 'communication';
  /** Parent capability key */
  capability_key: string;
  /** Operation key — maps to a service handler */
  operation_key: string;
  /** Input parameters this node accepts */
  input_schema: Record<string, string>;
  /** Output shape this node produces */
  output_schema: Record<string, string>;
}

// ============================================================
// Registry — all capability nodes
// ============================================================

export const CAPABILITY_NODES: Record<string, CapabilityNodeDefinition[]> = {
  products: [
    {
      node_key: 'list_products',
      name: 'List Products',
      description: 'Fetch products from the catalog with optional filters',
      category: 'read',
      capability_key: 'products',
      operation_key: 'catalog.list',
      input_schema: { limit: 'number', category: 'string', search: 'string', page: 'number' },
      output_schema: { items: 'array', total: 'number', page: 'number' },
    },
    {
      node_key: 'get_product',
      name: 'Get Product',
      description: 'Fetch a single product by ID',
      category: 'read',
      capability_key: 'products',
      operation_key: 'catalog.get',
      input_schema: { product_id: 'string' },
      output_schema: { item: 'object|null' },
    },
    {
      node_key: 'search_products',
      name: 'Search Products',
      description: 'Search products by name or description',
      category: 'search',
      capability_key: 'products',
      operation_key: 'catalog.search',
      input_schema: { query: 'string', limit: 'number' },
      output_schema: { items: 'array', total: 'number' },
    },
    {
      node_key: 'get_categories',
      name: 'Get Categories',
      description: 'Fetch product categories',
      category: 'read',
      capability_key: 'products',
      operation_key: 'catalog.categories',
      input_schema: { parent_id: 'string' },
      output_schema: { items: 'array' },
    },
  ],
  menu: [
    {
      node_key: 'list_menu_items',
      name: 'List Menu Items',
      description: 'Fetch menu items with optional category filter',
      category: 'read',
      capability_key: 'menu',
      operation_key: 'menu.list',
      input_schema: { limit: 'number', category: 'string', page: 'number' },
      output_schema: { items: 'array', total: 'number', page: 'number' },
    },
    {
      node_key: 'get_menu_item',
      name: 'Get Menu Item',
      description: 'Fetch a single menu item by ID',
      category: 'read',
      capability_key: 'menu',
      operation_key: 'menu.get',
      input_schema: { item_id: 'string' },
      output_schema: { item: 'object|null' },
    },
    {
      node_key: 'search_menu_items',
      name: 'Search Menu Items',
      description: 'Search menu items by name or description',
      category: 'search',
      capability_key: 'menu',
      operation_key: 'menu.search',
      input_schema: { query: 'string', limit: 'number' },
      output_schema: { items: 'array', total: 'number' },
    },
  ],
  orders: [
    {
      node_key: 'create_order',
      name: 'Create Order',
      description: 'Create a new customer order',
      category: 'action',
      capability_key: 'orders',
      operation_key: 'orders.create',
      input_schema: { contact_id: 'string', items: 'array', notes: 'string', currency: 'string' },
      output_schema: { order: 'object' },
    },
    {
      node_key: 'get_order',
      name: 'Get Order',
      description: 'Fetch an order by ID or order number',
      category: 'read',
      capability_key: 'orders',
      operation_key: 'orders.get',
      input_schema: { order_id: 'string', order_number: 'string' },
      output_schema: { order: 'object|null' },
    },
    {
      node_key: 'list_orders',
      name: 'List Orders',
      description: 'List orders with optional status filter',
      category: 'read',
      capability_key: 'orders',
      operation_key: 'orders.list',
      input_schema: { status: 'string', limit: 'number', page: 'number' },
      output_schema: { items: 'array', total: 'number' },
    },
  ],
  bookings: [
    {
      node_key: 'check_availability',
      name: 'Check Availability',
      description: 'Check booking availability for a date range',
      category: 'check',
      capability_key: 'bookings',
      operation_key: 'bookings.checkAvailability',
      input_schema: { offering_id: 'string', start_date: 'string', end_date: 'string', guests: 'number' },
      output_schema: { available: 'boolean', total: 'number' },
    },
    {
      node_key: 'create_booking',
      name: 'Create Booking',
      description: 'Create a new booking reservation',
      category: 'action',
      capability_key: 'bookings',
      operation_key: 'bookings.create',
      input_schema: { contact_id: 'string', offering_id: 'string', start_date: 'string', end_date: 'string', guests: 'number', notes: 'string' },
      output_schema: { booking: 'object' },
    },
    {
      node_key: 'get_booking',
      name: 'Get Booking',
      description: 'Fetch a booking by ID or booking number',
      category: 'read',
      capability_key: 'bookings',
      operation_key: 'bookings.get',
      input_schema: { booking_id: 'string', booking_number: 'string' },
      output_schema: { booking: 'object|null' },
    },
    {
      node_key: 'list_bookings',
      name: 'List Bookings',
      description: 'List bookings with optional status filter',
      category: 'read',
      capability_key: 'bookings',
      operation_key: 'bookings.list',
      input_schema: { status: 'string', limit: 'number', page: 'number' },
      output_schema: { items: 'array', total: 'number' },
    },
  ],
  courses: [
    {
      node_key: 'list_courses',
      name: 'List Courses',
      description: 'Fetch courses with optional filters',
      category: 'read',
      capability_key: 'courses',
      operation_key: 'courses.list',
      input_schema: { limit: 'number', page: 'number' },
      output_schema: { items: 'array', total: 'number' },
    },
    {
      node_key: 'get_course',
      name: 'Get Course',
      description: 'Fetch a single course by ID',
      category: 'read',
      capability_key: 'courses',
      operation_key: 'courses.get',
      input_schema: { course_id: 'string' },
      output_schema: { item: 'object|null' },
    },
    {
      node_key: 'search_courses',
      name: 'Search Courses',
      description: 'Search courses by name or description',
      category: 'search',
      capability_key: 'courses',
      operation_key: 'courses.search',
      input_schema: { query: 'string', limit: 'number' },
      output_schema: { items: 'array', total: 'number' },
    },
  ],
  programs: [
    {
      node_key: 'list_programs',
      name: 'List Programs',
      description: 'Fetch programs with optional filters',
      category: 'read',
      capability_key: 'programs',
      operation_key: 'programs.list',
      input_schema: { limit: 'number', page: 'number' },
      output_schema: { items: 'array', total: 'number' },
    },
    {
      node_key: 'get_program',
      name: 'Get Program',
      description: 'Fetch a single program by ID',
      category: 'read',
      capability_key: 'programs',
      operation_key: 'programs.get',
      input_schema: { program_id: 'string' },
      output_schema: { item: 'object|null' },
    },
  ],
  property_listings: [
    {
      node_key: 'list_properties',
      name: 'List Properties',
      description: 'Fetch property listings with optional filters',
      category: 'read',
      capability_key: 'property_listings',
      operation_key: 'properties.list',
      input_schema: { limit: 'number', page: 'number', min_price: 'number', max_price: 'number' },
      output_schema: { items: 'array', total: 'number' },
    },
    {
      node_key: 'get_property',
      name: 'Get Property',
      description: 'Fetch a single property by ID',
      category: 'read',
      capability_key: 'property_listings',
      operation_key: 'properties.get',
      input_schema: { property_id: 'string' },
      output_schema: { item: 'object|null' },
    },
    {
      node_key: 'search_properties',
      name: 'Search Properties',
      description: 'Search properties by location or features',
      category: 'search',
      capability_key: 'property_listings',
      operation_key: 'properties.search',
      input_schema: { query: 'string', limit: 'number' },
      output_schema: { items: 'array', total: 'number' },
    },
  ],
  services: [
    {
      node_key: 'list_services',
      name: 'List Services',
      description: 'Fetch available services',
      category: 'read',
      capability_key: 'services',
      operation_key: 'services.list',
      input_schema: { limit: 'number', page: 'number' },
      output_schema: { items: 'array', total: 'number' },
    },
    {
      node_key: 'get_service',
      name: 'Get Service',
      description: 'Fetch a single service by ID',
      category: 'read',
      capability_key: 'services',
      operation_key: 'services.get',
      input_schema: { service_id: 'string' },
      output_schema: { item: 'object|null' },
    },
    {
      node_key: 'search_services',
      name: 'Search Services',
      description: 'Search services by name or description',
      category: 'search',
      capability_key: 'services',
      operation_key: 'services.search',
      input_schema: { query: 'string', limit: 'number' },
      output_schema: { items: 'array', total: 'number' },
    },
  ],
};

// ============================================================
// Helpers
// ============================================================

/** Get all nodes for a specific capability */
export function getNodesForCapability(capabilityKey: string): CapabilityNodeDefinition[] {
  return CAPABILITY_NODES[capabilityKey] ?? [];
}

/** Get a specific node by its key (across all capabilities) */
export function getNodeByKey(nodeKey: string): CapabilityNodeDefinition | null {
  for (const nodes of Object.values(CAPABILITY_NODES)) {
    const found = nodes.find((n) => n.node_key === nodeKey);
    if (found) return found;
  }
  return null;
}

/** Get all nodes for a set of capabilities */
export function getNodesForCapabilities(capabilityKeys: string[]): CapabilityNodeDefinition[] {
  return capabilityKeys.flatMap((key) => CAPABILITY_NODES[key] ?? []);
}

/** Get all available operation keys */
export function getAllOperationKeys(): string[] {
  return Object.values(CAPABILITY_NODES)
    .flat()
    .map((n) => n.operation_key);
}

/** Validate that an operation_key exists in the registry */
export function isValidOperationKey(operationKey: string): boolean {
  return getAllOperationKeys().includes(operationKey);
}
