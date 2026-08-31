// ============================================================
// Catalogue Adapter — Interface for catalogue data sources.
//
// Defines a common interface for internal (Tijwa DB) and future
// external catalogue sources. The CatalogueService delegates to
// adapters for data access. Currently only InternalAdapter is
// implemented — ExternalAdapter is a contract for future use.
// ============================================================

import { supabaseAdmin } from '../flows/admin-client';
import type { OfferingType } from './offerings';
import type {
  CatalogueItem,
  CatalogueCategory,
  CatalogueItemParams,
  CatalogueSearchParams,
} from './catalogue-types';

type AdminClient = ReturnType<typeof supabaseAdmin>;

// ============================================================
// Adapter Interface
// ============================================================

export interface CatalogueAdapter {
  /** Unique identifier for this adapter type */
  readonly sourceType: 'internal' | 'external';

  /** Whether this adapter supports the given capability */
  supports(capabilityKey: string): boolean;

  /** List categories */
  getCategories(
    accountId: string,
    params?: { parent_id?: string | null },
  ): Promise<CatalogueCategory[]>;

  /** List items with optional filters */
  getItems(
    accountId: string,
    params?: CatalogueItemParams,
  ): Promise<{ items: CatalogueItem[]; total: number; page: number; has_more: boolean }>;

  /** Search items by query */
  searchItems(
    accountId: string,
    params: CatalogueSearchParams,
  ): Promise<{ items: CatalogueItem[]; total: number }>;

  /** Get a single item by ID */
  getItem(
    accountId: string,
    itemId: string,
  ): Promise<CatalogueItem | null>;
}

// ============================================================
// Internal Adapter — queries offerings table
// ============================================================

function toCatalogueItem(row: Record<string, unknown>): CatalogueItem {
  const category = row.category as Record<string, unknown> | null;
  const media = (row.media ?? []) as Array<Record<string, unknown>>;
  const primaryMedia = media.find((m) => m.is_primary) ?? media[0];
  const imageUrls = media
    .filter((m) => m.url)
    .map((m) => String(m.url));

  return {
    id: String(row.id),
    source_id: row.source_id ? String(row.source_id) : null,
    type: String(row.type) as OfferingType,
    category_id: row.category_id ? String(row.category_id) : null,
    category_name: category?.name ? String(category.name) : null,
    name: String(row.name ?? 'Untitled'),
    slug: String(row.slug ?? ''),
    short_description: row.short_description ? String(row.short_description) : null,
    description: row.description ? String(row.description) : null,
    image_url: primaryMedia?.url ? String(primaryMedia.url) : null,
    image_urls: imageUrls,
    price: row.price != null ? Number(row.price) : null,
    currency: String(row.currency ?? 'USD'),
    price_type: String(row.price_type ?? 'fixed') as CatalogueItem['price_type'],
    sku: row.reference_code ? String(row.reference_code) : null,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    created_at: String(row.created_at ?? ''),
    updated_at: String(row.updated_at ?? ''),
  };
}

export class InternalCatalogueAdapter implements CatalogueAdapter {
  readonly sourceType = 'internal';
  private db: AdminClient;

  constructor(db?: AdminClient) {
    this.db = db ?? supabaseAdmin();
  }

  supports(_capabilityKey: string): boolean {
    // Internal adapter supports all capabilities — it reads from offerings table
    return true;
  }

  async getCategories(
    _accountId: string,
    params?: { parent_id?: string | null },
  ): Promise<CatalogueCategory[]> {
    let query = this.db
      .from('offering_categories')
      .select('*')
      .order('sort_order', { ascending: true });

    if (params?.parent_id) {
      query = query.eq('parent_id', params.parent_id);
    } else {
      query = query.is('parent_id', null);
    }

    const { data, error } = await query;
    if (error) throw error;

    return (data ?? []).map((row) => ({
      id: String(row.id),
      name: String(row.name ?? 'Unnamed'),
      slug: String(row.slug ?? ''),
      description: row.description ? String(row.description) : null,
      parent_id: row.parent_id ? String(row.parent_id) : null,
      sort_order: Number(row.sort_order ?? 0),
    }));
  }

  async getItems(
    accountId: string,
    params?: CatalogueItemParams,
  ): Promise<{ items: CatalogueItem[]; total: number; page: number; has_more: boolean }> {
    const limit = params?.limit ?? 10;
    const page = params?.page ?? 0;
    const type = params?.type ?? null;
    const category = params?.category ?? null;
    const search = params?.search ?? null;
    const status = params?.status ?? 'active';

    let query = this.db
      .from('offerings')
      .select('*, category:offering_categories(name, slug), media:offering_media(*)', {
        count: 'exact',
      })
      .eq('account_id', accountId)
      .eq('status', status);

    if (type) query = query.eq('type', type);
    if (category) query = query.eq('category.slug', category);
    if (search) {
      query = query.or(
        `name.ilike.%${search}%,short_description.ilike.%${search}%,description.ilike.%${search}%`,
      );
    }

    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(page * limit, (page + 1) * limit - 1);

    if (error) throw error;

    const items = (data ?? []).map(toCatalogueItem);

    return {
      items,
      total: count ?? 0,
      page,
      has_more: (count ?? 0) > (page + 1) * limit,
    };
  }

  async searchItems(
    accountId: string,
    params: CatalogueSearchParams,
  ): Promise<{ items: CatalogueItem[]; total: number }> {
    const { query: searchQuery, limit = 10 } = params;

    if (!searchQuery.trim()) {
      return { items: [], total: 0 };
    }

    const { data, error, count } = await this.db
      .from('offerings')
      .select('*, category:offering_categories(name, slug), media:offering_media(*)', {
        count: 'exact',
      })
      .eq('account_id', accountId)
      .eq('status', 'active')
      .or(
        `name.ilike.%${searchQuery}%,short_description.ilike.%${searchQuery}%,description.ilike.%${searchQuery}%`,
      )
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;

    return {
      items: (data ?? []).map(toCatalogueItem),
      total: count ?? 0,
    };
  }

  async getItem(
    accountId: string,
    itemId: string,
  ): Promise<CatalogueItem | null> {
    const { data, error } = await this.db
      .from('offerings')
      .select('*, category:offering_categories(name, slug), media:offering_media(*)')
      .eq('account_id', accountId)
      .eq('id', itemId)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;

    return toCatalogueItem(data);
  }
}

// ============================================================
// External Adapter — placeholder for future implementation
// ============================================================

/**
 * External catalogue adapter interface. Implementations will
 * connect to external APIs (POS, ERP, etc.) via the Connections
 * system. No concrete implementation needed yet — this is a
 * contract for future development.
 */
export interface ExternalCatalogueConfig {
  /** Provider identifier (e.g. 'shopify', 'woocommerce') */
  provider: string;
  /** Base API URL */
  base_url: string;
  /** Reference to stored API key (from api_keys table) */
  api_key_ref: string;
  /** Capabilities this provider supports */
  capabilities: string[];
  /** Sync interval in minutes */
  sync_interval_minutes?: number;
}

// ============================================================
// Adapter Registry
// ============================================================

const adapters = new Map<string, CatalogueAdapter>();

export function registerAdapter(sourceType: string, adapter: CatalogueAdapter): void {
  adapters.set(sourceType, adapter);
}

export function getAdapter(sourceType: string): CatalogueAdapter | null {
  return adapters.get(sourceType) ?? null;
}

// Register internal adapter by default
registerAdapter('internal', new InternalCatalogueAdapter());

/**
 * Get the best adapter for a given capability.
 * Currently always returns internal — future: checks external adapters first.
 */
export function getAdapterForCapability(_capabilityKey: string): CatalogueAdapter {
  return getAdapter('internal') ?? new InternalCatalogueAdapter();
}
