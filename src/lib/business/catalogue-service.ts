// ============================================================
// Catalogue Service — Single source of truth for catalogue data.
//
// All catalogue queries go through this service. Consumers:
// 1. Node handler (node-handler.ts) — flow execution
// 2. AI auto-reply — knowledge retrieval
// 3. Independent handler — catalogue intent routing
// 4. API routes — internal use (future)
//
// Pattern: Same as API routes — uses supabaseAdmin() directly.
// ============================================================

import { supabaseAdmin } from '../flows/admin-client';
import type { OfferingType } from './offerings';
import type {
  CatalogueItem,
  CatalogueCategory,
  CatalogueItemParams,
  CatalogueSearchParams,
  AvailabilityResult,
  DateRange,
  PriceResult,
} from './catalogue-types';
import { formatPrice } from './offerings';

type AdminClient = ReturnType<typeof supabaseAdmin>;

// ============================================================
// Internal helpers
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
    price_type: String(row.price_type ?? 'fixed') as PriceResult['price_type'],
    sku: row.reference_code ? String(row.reference_code) : null,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    created_at: String(row.created_at ?? ''),
    updated_at: String(row.updated_at ?? ''),
  };
}

function formatPriceDisplay(
  price: number | null,
  currency: string,
  priceType: PriceResult['price_type'],
): string {
  if (priceType === 'free') return 'Free';
  if (priceType === 'contact_for_price') return 'Contact for Price';
  if (priceType === 'starting_from' && price !== null) {
    return `From ${currency} ${price.toFixed(2)}`;
  }
  if (price !== null) return `${currency} ${price.toFixed(2)}`;
  return 'Price on request';
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 3) + '...';
}

// ============================================================
// Catalogue Service
// ============================================================

export class CatalogueService {
  private db: AdminClient;

  constructor(db?: AdminClient) {
    this.db = db ?? supabaseAdmin();
  }

  // --------------------------------------------------------
  // Categories
  // --------------------------------------------------------

  async getCategories(
    accountId: string,
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

  // --------------------------------------------------------
  // Items — list
  // --------------------------------------------------------

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

  // --------------------------------------------------------
  // Items — search
  // --------------------------------------------------------

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

  // --------------------------------------------------------
  // Items — single
  // --------------------------------------------------------

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

  // --------------------------------------------------------
  // Availability check
  // --------------------------------------------------------

  async checkAvailability(
    accountId: string,
    offeringId: string,
    dateRange: DateRange,
  ): Promise<AvailabilityResult> {
    const endCheck = dateRange.end_date ?? dateRange.start_date;

    const { count, error } = await this.db
      .from('bookings')
      .select('id', { count: 'exact', head: true })
      .eq('account_id', accountId)
      .eq('offering_id', offeringId)
      .not('status', 'eq', 'cancelled')
      .lt('start_date', endCheck)
      .gt('end_date', dateRange.start_date);

    if (error) throw error;

    const conflictingBookings = count ?? 0;
    const available = conflictingBookings === 0;

    return {
      available,
      conflicting_bookings: conflictingBookings,
      message: available
        ? `✅ Available for ${dateRange.start_date}${dateRange.end_date ? ` — ${dateRange.end_date}` : ''}!`
        : `❌ Sorry, not available for those dates. Try different dates or contact us for alternatives.`,
    };
  }

  // --------------------------------------------------------
  // Price lookup
  // --------------------------------------------------------

  async getPrice(
    accountId: string,
    itemId: string,
    context?: { guests?: number },
  ): Promise<PriceResult | null> {
    const item = await this.getItem(accountId, itemId);
    if (!item) return null;

    const guests = context?.guests ?? 1;
    const effectivePrice = item.price != null ? item.price * guests : null;

    return {
      price: effectivePrice,
      currency: item.currency,
      price_type: item.price_type,
      formatted: formatPriceDisplay(effectivePrice, item.currency, item.price_type),
    };
  }

  // --------------------------------------------------------
  // WhatsApp formatting helpers
  // --------------------------------------------------------

  /** Format items as a numbered list for WhatsApp text message */
  formatItemList(items: CatalogueItem[]): string {
    if (items.length === 0) return 'No items available.';

    return items
      .map((item, i) => {
        const price = formatPriceDisplay(item.price, item.currency, item.price_type);
        const desc = item.short_description
          ? '\n   ' + truncate(item.short_description, 60)
          : '';
        return `${i + 1}. *${item.name}* — ${price}${desc}`;
      })
      .join('\n\n');
  }

  /** Format a single item detail for WhatsApp */
  formatItemDetail(item: CatalogueItem): string {
    const price = formatPriceDisplay(item.price, item.currency, item.price_type);
    const category = item.category_name ? `Category: ${item.category_name}` : null;
    const desc = item.description ?? item.short_description;

    return [
      `*${item.name}*`,
      category,
      `Price: ${price}`,
      desc ? `\n${truncate(String(desc), 300)}` : null,
    ]
      .filter(Boolean)
      .join('\n');
  }

  /** Format search results for WhatsApp */
  formatSearchResults(items: CatalogueItem[], query: string): string {
    if (items.length === 0) return `No results found for "${query}".`;

    const lines = items.map((item, i) => {
      const price = formatPriceDisplay(item.price, item.currency, item.price_type);
      return `${i + 1}. *${item.name}* — ${price}`;
    });

    return `Results for "${query}":\n\n${lines.join('\n')}`;
  }

  /** Format categories as a numbered list for WhatsApp */
  formatCategoryList(categories: CatalogueCategory[]): string {
    if (categories.length === 0) return 'No categories available.';

    return categories
      .map((cat, i) => `${i + 1}. ${cat.name}`)
      .join('\n');
  }

  /** Build buttons from categories for interactive message */
  categoriesToButtons(
    categories: CatalogueCategory[],
    prefix: string = 'cat',
  ): Array<{ id: string; title: string }> {
    return categories.slice(0, 3).map((cat) => ({
      id: `${prefix}:${cat.id}`,
      title: truncate(cat.name, 20),
    }));
  }

  /** Build list rows from items for interactive list message */
  itemsToListRows(
    items: CatalogueItem[],
    prefix: string = 'item',
  ): Array<{ id: string; title: string; description?: string }> {
    return items.map((item) => ({
      id: `${prefix}:${item.id}`,
      title: truncate(item.name, 24),
      description: item.short_description
        ? truncate(item.short_description, 72)
        : undefined,
    }));
  }

  /** Build list rows from categories */
  categoriesToListRows(
    categories: CatalogueCategory[],
    prefix: string = 'cat',
  ): Array<{ id: string; title: string; description?: string }> {
    return categories.map((cat) => ({
      id: `${prefix}:${cat.id}`,
      title: truncate(cat.name, 24),
      description: cat.description ? truncate(cat.description, 72) : undefined,
    }));
  }
}

// ============================================================
// Singleton — default instance for convenience
// ============================================================

let _instance: CatalogueService | null = null;

export function getCatalogueService(): CatalogueService {
  if (!_instance) {
    _instance = new CatalogueService();
  }
  return _instance;
}
