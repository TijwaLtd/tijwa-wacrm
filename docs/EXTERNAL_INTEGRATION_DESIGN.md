# External Integration Layer — Design Document

## Overview

This document designs the external integration layer for WACRM, enabling businesses to connect their existing inventory/POS/ERP systems. Data flows bidirectionally: inventory syncs from external → our system, orders sync from our system → external.

**Status:** Design Phase
**Author:** Tijwa Engineering
**Last Updated:** 2026-09-12

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        WACRM System                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │ Offerings│  │  Orders  │  │ Bookings │  │ Contacts │   │
│  └────┬─────┘  └────┬─────┘  └──────────┘  └──────────┘   │
│       │              │                                      │
│  ┌────▼──────────────▼──────────────────────────────────┐  │
│  │              Sync Engine                              │  │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐              │  │
│  │  │  Pull   │  │  Push   │  │ Resolve │              │  │
│  │  │ (inventory)│ │(orders)│  │(conflicts)│             │  │
│  │  └────┬────┘  └────┬────┘  └─────────┘              │  │
│  │       │             │                                 │  │
│  └───────┼─────────────┼─────────────────────────────────┘  │
│          │             │                                    │
│  ┌───────▼─────────────▼─────────────────────────────────┐  │
│  │           Provider Adapters                            │  │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐ │  │
│  │  │ Shopify │  │WooCommerc│ │  Odoo   │  │ Generic │ │  │
│  │  └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘ │  │
│  └───────┼─────────────┼───────────┼─────────────┼───────┘  │
└──────────┼─────────────┼───────────┼─────────────┼──────────┘
           │             │           │             │
     ┌─────▼─────┐ ┌─────▼─────┐ ┌──▼────┐ ┌─────▼─────┐
     │  Shopify  │ │ WooCommerce│ │  Odoo │ │Custom API │
     │    API    │ │    API    │ │  API  │ │  Webhooks │
     └───────────┘ └───────────┘ └───────┘ └───────────┘
```

### Data Flow Directions

| Flow | Direction | Trigger | Description |
|------|-----------|---------|-------------|
| **Inventory Pull** | External → Ours | Scheduled / Webhook | Products, stock levels, prices |
| **Order Push** | Ours → External | On order creation | Create order in external system |
| **Customer Sync** | Bidirectional | On contact creation | Sync customer records |
| **Status Sync** | External → Ours | Webhook | Order status updates from external |

---

## 2. Data Model

### New Tables

```sql
-- Provider definitions (system-level, immutable)
CREATE TABLE integration_providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,           -- 'shopify', 'woocommerce', 'odoo', 'generic_webhook'
  name TEXT NOT NULL,
  description TEXT,
  auth_type TEXT NOT NULL,            -- 'api_key', 'oauth2', 'basic_auth'
  capabilities JSONB NOT NULL,        -- ['inventory_read', 'inventory_write', 'order_read', 'order_write']
  config_schema JSONB,                -- JSON Schema for provider-specific config
  is_enabled BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Business connection to external system
CREATE TABLE integration_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID REFERENCES accounts(id) ON DELETE CASCADE,
  provider_key TEXT NOT NULL REFERENCES integration_providers(key),
  name TEXT NOT NULL,                  -- "My Shopify Store"
  status TEXT NOT NULL DEFAULT 'inactive', -- inactive, active, error, paused
  config JSONB NOT NULL DEFAULT '{}',  -- Provider-specific config (store URL, etc.)
  credentials JSONB NOT NULL DEFAULT '{}', -- Encrypted credentials (API keys, tokens)
  sync_config JSONB NOT NULL DEFAULT '{}', -- Sync rules, field mappings
  last_sync_at TIMESTAMPTZ,
  last_error TEXT,
  created_by UUID REFERENCES profiles(user_id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(account_id, provider_key, name)
);

-- Sync job tracking
CREATE TABLE integration_sync_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID REFERENCES integration_connections(id) ON DELETE CASCADE,
  account_id UUID REFERENCES accounts(id) ON DELETE CASCADE,
  direction TEXT NOT NULL,            -- 'inbound' (external→ours) or 'outbound' (ours→external)
  entity_type TEXT NOT NULL,          -- 'products', 'orders', 'customers', 'inventory'
  status TEXT NOT NULL DEFAULT 'pending', -- pending, running, completed, failed, partial
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  items_synced INTEGER DEFAULT 0,
  items_failed INTEGER DEFAULT 0,
  items_skipped INTEGER DEFAULT 0,
  error_summary TEXT,
  metadata JSONB DEFAULT '{}',        -- Provider-specific sync details
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Individual item sync log
CREATE TABLE integration_sync_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES integration_sync_jobs(id) ON DELETE CASCADE,
  connection_id UUID REFERENCES integration_connections(id) ON DELETE CASCADE,
  account_id UUID REFERENCES accounts(id) ON DELETE CASCADE,
  direction TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  external_id TEXT,                    -- ID in external system
  internal_id UUID,                    -- ID in our system
  action TEXT NOT NULL,               -- 'create', 'update', 'skip', 'error'
  status TEXT NOT NULL DEFAULT 'success', -- success, error, conflict
  external_data JSONB,                -- Snapshot from external
  internal_data JSONB,                -- Snapshot from our system
  conflict_resolution TEXT,           -- 'external_wins', 'internal_wins', 'manual', 'merged'
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Field mapping configuration
CREATE TABLE integration_field_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID REFERENCES integration_connections(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,          -- 'product', 'order', 'customer'
  external_field TEXT NOT NULL,       -- 'title', 'variants[0].price', 'sku'
  internal_field TEXT NOT NULL,       -- 'name', 'price', 'reference_code'
  transform TEXT,                     -- Optional transform function name
  is_required BOOLEAN DEFAULT FALSE,
  default_value TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(connection_id, entity_type, external_field)
);

-- Webhook registrations (for receiving external updates)
CREATE TABLE integration_webhooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID REFERENCES integration_connections(id) ON DELETE CASCADE,
  account_id UUID REFERENCES accounts(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,           -- 'order_updated', 'inventory_updated', 'product_created'
  secret TEXT NOT NULL,               -- Webhook signature verification
  is_active BOOLEAN DEFAULT TRUE,
  last_received_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Conflict queue (items needing manual resolution)
CREATE TABLE integration_conflicts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID REFERENCES integration_connections(id) ON DELETE CASCADE,
  account_id UUID REFERENCES accounts(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  external_id TEXT,
  internal_id UUID,
  external_data JSONB NOT NULL,
  internal_data JSONB NOT NULL,
  resolution TEXT DEFAULT 'pending',  -- pending, external_wins, internal_wins, merged, ignored
  resolved_by UUID REFERENCES profiles(user_id),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Indexes

```sql
CREATE INDEX idx_sync_jobs_connection ON integration_sync_jobs(connection_id);
CREATE INDEX idx_sync_jobs_status ON integration_sync_jobs(status);
CREATE INDEX idx_sync_logs_job ON integration_sync_logs(job_id);
CREATE INDEX idx_sync_logs_connection ON integration_sync_logs(connection_id);
CREATE INDEX idx_conflicts_connection ON integration_conflicts(connection_id);
CREATE INDEX idx_conflicts_resolution ON integration_conflicts(resolution);
CREATE INDEX idx_webhooks_connection ON integration_webhooks(connection_id);
```

### RLS Policies

```sql
ALTER TABLE integration_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_sync_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_sync_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_conflicts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their account integrations"
  ON integration_connections FOR SELECT
  USING (is_account_member(account_id));

CREATE POLICY "Admins can manage integrations"
  ON integration_connections FOR ALL
  USING (has_role_in_account(account_id, 'admin'));

CREATE POLICY "Users can view their account sync jobs"
  ON integration_sync_jobs FOR SELECT
  USING (is_account_member(account_id));

-- Similar policies for other tables
```

---

## 3. Provider Adapter Interface

```typescript
// src/lib/integrations/types.ts

export type AuthType = 'api_key' | 'oauth2' | 'basic_auth'
export type SyncDirection = 'inbound' | 'outbound'
export type EntityType = 'products' | 'orders' | 'customers' | 'inventory'
export type SyncAction = 'create' | 'update' | 'skip' | 'error'
export type ConflictResolution = 'external_wins' | 'internal_wins' | 'manual' | 'merged'

export interface ProviderCapability {
  entity: EntityType
  direction: SyncDirection
  supported: boolean
}

export interface ProviderConfig {
  key: string
  name: string
  authType: AuthType
  capabilities: ProviderCapability[]
  configSchema?: Record<string, unknown>
}

export interface ExternalProduct {
  externalId: string
  name: string
  description?: string
  sku?: string
  price: number
  currency: string
  stock?: number
  images?: string[]
  category?: string
  status: 'active' | 'draft' | 'archived'
  metadata?: Record<string, unknown>
  updatedAt: string
}

export interface ExternalOrder {
  externalId?: string
  orderNumber?: string
  customerExternalId?: string
  items: ExternalOrderItem[]
  subtotal: number
  tax: number
  total: number
  currency: string
  status: 'pending' | 'confirmed' | 'shipped' | 'delivered' | 'cancelled'
  shippingAddress?: ExternalAddress
  metadata?: Record<string, unknown>
}

export interface ExternalOrderItem {
  productExternalId: string
  name: string
  quantity: number
  unitPrice: number
  total: number
}

export interface ExternalAddress {
  name?: string
  line1?: string
  line2?: string
  city?: string
  state?: string
  postalCode?: string
  country?: string
  phone?: string
}

export interface SyncResult {
  success: boolean
  itemsSynced: number
  itemsFailed: number
  itemsSkipped: number
  errors: SyncError[]
  externalIds: Map<string, string> // internalId → externalId mapping
}

export interface SyncError {
  externalId?: string
  internalId?: string
  message: string
  code?: string
}

export interface ConflictItem {
  entityType: EntityType
  externalId: string
  internalId: string
  externalData: Record<string, unknown>
  internalData: Record<string, unknown>
  fieldsInConflict: string[]
}

// Provider adapter interface — each provider implements this
export interface ProviderAdapter {
  // Provider info
  getConfig(): ProviderConfig

  // Authentication
  testConnection(credentials: Record<string, string>, config: Record<string, unknown>): Promise<boolean>

  // Inbound sync (external → ours)
  fetchProducts(config: Record<string, unknown>, credentials: Record<string, string>, since?: string): Promise<ExternalProduct[]>
  fetchOrders(config: Record<string, unknown>, credentials: Record<string, string>, since?: string): Promise<ExternalOrder[]>
  fetchCustomers(config: Record<string, unknown>, credentials: Record<string, string>, since?: string): Promise<ExternalContact[]>

  // Outbound sync (ours → external)
  createOrder(order: InternalOrder, config: Record<string, unknown>, credentials: Record<string, string>): Promise<{ externalId: string; status: string }>
  updateOrder(externalId: string, updates: Partial<ExternalOrder>, config: Record<string, unknown>, credentials: Record<string, string>): Promise<boolean>

  // Webhook handling
  verifyWebhookSignature(payload: string, signature: string, secret: string): boolean
  parseWebhookPayload(eventType: string, payload: Record<string, unknown>): WebhookEvent | null
}

export interface WebhookEvent {
  type: 'order_updated' | 'inventory_updated' | 'product_created' | 'product_updated'
  externalId: string
  data: Record<string, unknown>
  timestamp: string
}

export interface InternalOrder {
  id: string
  orderNumber: string
  contactId?: string
  items: Array<{
    offeringId?: string
    name: string
    quantity: number
    unitPrice: number
    totalPrice: number
  }>
  subtotal: number
  taxAmount: number
  total: number
  currency: string
  notes?: string
}
```

---

## 4. Provider Adapters

### 4.1 Shopify Adapter

```typescript
// src/lib/integrations/adapters/shopify.ts

import type { ProviderAdapter, ProviderConfig, ExternalProduct, ExternalOrder, SyncResult } from '../types'

export class ShopifyAdapter implements ProviderAdapter {
  private baseUrl: string

  getConfig(): ProviderConfig {
    return {
      key: 'shopify',
      name: 'Shopify',
      authType: 'api_key',
      capabilities: [
        { entity: 'products', direction: 'inbound', supported: true },
        { entity: 'orders', direction: 'inbound', supported: true },
        { entity: 'orders', direction: 'outbound', supported: true },
        { entity: 'customers', direction: 'inbound', supported: true },
        { entity: 'inventory', direction: 'inbound', supported: true },
      ],
    }
  }

  async testConnection(credentials: Record<string, string>, config: Record<string, unknown>): Promise<boolean> {
    const { storeUrl, accessToken } = credentials
    const response = await fetch(`https://${storeUrl}/admin/api/2024-01/shop.json`, {
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json',
      },
    })
    return response.ok
  }

  async fetchProducts(config: Record<string, unknown>, credentials: Record<string, string>, since?: string): Promise<ExternalProduct[]> {
    const { storeUrl, accessToken } = credentials
    const limit = 250
    let page = 1
    const products: ExternalProduct[] = []

    while (true) {
      const url = new URL(`https://${storeUrl}/admin/api/2024-01/products.json`)
      url.searchParams.set('limit', String(limit))
      url.searchParams.set('page', String(page))
      if (since) url.searchParams.set('updated_at_min', since)

      const response = await fetch(url.toString(), {
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) break

      const data = await response.json()
      const items = data.products || []

      for (const p of items) {
        products.push({
          externalId: String(p.id),
          name: p.title,
          description: p.body_html,
          sku: p.variants?.[0]?.sku,
          price: parseFloat(p.variants?.[0]?.price || '0'),
          currency: 'USD',
          stock: p.variants?.[0]?.inventory_quantity,
          images: p.images?.map((img: { src: string }) => img.src) || [],
          category: p.product_type,
          status: p.status === 'active' ? 'active' : 'draft',
          metadata: { vendor: p.vendor, tags: p.tags },
          updatedAt: p.updated_at,
        })
      }

      if (items.length < limit) break
      page++
    }

    return products
  }

  async fetchOrders(config: Record<string, unknown>, credentials: Record<string, string>, since?: string): Promise<ExternalOrder[]> {
    const { storeUrl, accessToken } = credentials
    const url = new URL(`https://${storeUrl}/admin/api/2024-01/orders.json`)
    url.searchParams.set('status', 'any')
    if (since) url.searchParams.set('updated_at_min', since)

    const response = await fetch(url.toString(), {
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) return []

    const data = await response.json()
    return (data.orders || []).map((o: Record<string, unknown>) => ({
      externalId: String(o.id),
      orderNumber: `#${o.order_number}`,
      customerExternalId: o.customer ? String((o.customer as Record<string, unknown>).id) : undefined,
      items: (o.line_items as Array<Record<string, unknown>>).map((li) => ({
        productExternalId: String(li.product_id),
        name: String(li.title),
        quantity: Number(li.quantity),
        unitPrice: parseFloat(String(li.price)),
        total: parseFloat(String(li.price)) * Number(li.quantity),
      })),
      subtotal: parseFloat(String(o.subtotal_price)),
      tax: parseFloat(String(o.total_tax)),
      total: parseFloat(String(o.total_price)),
      currency: String(o.currency),
      status: o.financial_status === 'paid' ? 'confirmed' : 'pending',
    }))
  }

  async createOrder(order: InternalOrder, config: Record<string, unknown>, credentials: Record<string, string>): Promise<{ externalId: string; status: string }> {
    const { storeUrl, accessToken } = credentials

    const response = await fetch(`https://${storeUrl}/admin/api/2024-01/orders.json`, {
      method: 'POST',
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        order: {
          line_items: order.items.map((item) => ({
            variant_id: item.offeringId, // Must map to Shopify variant ID
            quantity: item.quantity,
          })),
          financial_status: 'paid',
          note: `[WACRM] Order ${order.orderNumber}`,
        },
      }),
    })

    if (!response.ok) {
      throw new Error(`Shopify order creation failed: ${response.statusText}`)
    }

    const data = await response.json()
    return {
      externalId: String(data.order.id),
      status: data.order.financial_status,
    }
  }

  async updateOrder(externalId: string, updates: Partial<ExternalOrder>, config: Record<string, unknown>, credentials: Record<string, string>): Promise<boolean> {
    const { storeUrl, accessToken } = credentials

    const response = await fetch(`https://${storeUrl}/admin/api/2024-01/orders/${externalId}.json`, {
      method: 'PUT',
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        order: {
          fulfillment_status: updates.status === 'shipped' ? 'fulfilled' : undefined,
        },
      }),
    })

    return response.ok
  }

  verifyWebhookSignature(payload: string, signature: string, secret: string): boolean {
    // Shopify uses HMAC-SHA256
    const crypto = require('crypto')
    const hmac = crypto.createHmac('sha256', secret)
    hmac.update(payload)
    const digest = hmac.digest('base64')
    return digest === signature
  }

  parseWebhookPayload(eventType: string, payload: Record<string, unknown>): WebhookEvent | null {
    switch (eventType) {
      case 'orders/create':
      case 'orders/updated':
        return {
          type: 'order_updated',
          externalId: String(payload.id),
          data: payload,
          timestamp: new Date().toISOString(),
        }
      case 'products/create':
      case 'products/updated':
        return {
          type: 'product_updated',
          externalId: String(payload.id),
          data: payload,
          timestamp: new Date().toISOString(),
        }
      case 'inventory_levels/update':
        return {
          type: 'inventory_updated',
          externalId: String(payload.inventory_item_id),
          data: payload,
          timestamp: new Date().toISOString(),
        }
      default:
        return null
    }
  }
}
```

### 4.2 WooCommerce Adapter

```typescript
// src/lib/integrations/adapters/woocommerce.ts

import type { ProviderAdapter, ProviderConfig, ExternalProduct, ExternalOrder } from '../types'

export class WooCommmerceAdapter implements ProviderAdapter {
  getConfig(): ProviderConfig {
    return {
      key: 'woocommerce',
      name: 'WooCommerce',
      authType: 'basic_auth',
      capabilities: [
        { entity: 'products', direction: 'inbound', supported: true },
        { entity: 'orders', direction: 'inbound', supported: true },
        { entity: 'orders', direction: 'outbound', supported: true },
        { entity: 'customers', direction: 'inbound', supported: true },
      ],
    }
  }

  async testConnection(credentials: Record<string, string>, config: Record<string, unknown>): Promise<boolean> {
    const { storeUrl, consumerKey, consumerSecret } = credentials
    const url = new URL(`${storeUrl}/wp-json/wc/v3/system_status`)
    url.username = consumerKey
    url.password = consumerSecret

    const response = await fetch(url.toString())
    return response.ok
  }

  async fetchProducts(config: Record<string, unknown>, credentials: Record<string, string>, since?: string): Promise<ExternalProduct[]> {
    const { storeUrl, consumerKey, consumerSecret } = credentials
    const url = new URL(`${storeUrl}/wp-json/wc/v3/products`)
    url.username = consumerKey
    url.password = consumerSecret
    url.searchParams.set('per_page', '100')
    if (since) url.searchParams.set('modified_after', since)

    const response = await fetch(url.toString())
    if (!response.ok) return []

    const items = await response.json()
    return items.map((p: Record<string, unknown>) => ({
      externalId: String(p.id),
      name: String(p.name),
      description: String(p.description || ''),
      sku: String(p.sku || ''),
      price: parseFloat(String(p.price || '0')),
      currency: 'USD',
      stock: p.stock_quantity ? Number(p.stock_quantity) : undefined,
      images: (p.images as Array<Record<string, string>>).map((img) => img.src),
      category: (p.categories as Array<Record<string, string>>)?.[0]?.name,
      status: p.status === 'publish' ? 'active' : 'draft',
      updatedAt: String(p.modified_date || ''),
    }))
  }

  async fetchOrders(config: Record<string, unknown>, credentials: Record<string, string>, since?: string): Promise<ExternalOrder[]> {
    const { storeUrl, consumerKey, consumerSecret } = credentials
    const url = new URL(`${storeUrl}/wp-json/wc/v3/orders`)
    url.username = consumerKey
    url.password = consumerSecret
    url.searchParams.set('per_page', '100')
    if (since) url.searchParams.set('modified_after', since)

    const response = await fetch(url.toString())
    if (!response.ok) return []

    const items = await response.json()
    return items.map((o: Record<string, unknown>) => ({
      externalId: String(o.id),
      orderNumber: String(o.number),
      items: (o.line_items as Array<Record<string, unknown>>).map((li) => ({
        productExternalId: String(li.product_id),
        name: String(li.name),
        quantity: Number(li.quantity),
        unitPrice: parseFloat(String(li.price)),
        total: parseFloat(String(li.total)),
      })),
      subtotal: parseFloat(String(o.total || '0')),
      tax: parseFloat(String(o.total_tax || '0')),
      total: parseFloat(String(o.total || '0')),
      currency: String(o.currency || 'USD'),
      status: o.status === 'processing' ? 'confirmed' : 'pending',
    }))
  }

  async createOrder(order: InternalOrder, config: Record<string, unknown>, credentials: Record<string, string>): Promise<{ externalId: string; status: string }> {
    const { storeUrl, consumerKey, consumerSecret } = credentials
    const url = new URL(`${storeUrl}/wp-json/wc/v3/orders`)
    url.username = consumerKey
    url.password = consumerSecret

    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        payment_method: 'bacs',
        line_items: order.items.map((item) => ({
          product_id: item.offeringId,
          quantity: item.quantity,
        })),
        status: 'processing',
      }),
    })

    if (!response.ok) throw new Error(`WooCommerce order creation failed: ${response.statusText}`)

    const data = await response.json()
    return { externalId: String(data.id), status: String(data.status) }
  }

  async updateOrder(externalId: string, updates: Partial<ExternalOrder>, config: Record<string, unknown>, credentials: Record<string, string>): Promise<boolean> {
    const { storeUrl, consumerKey, consumerSecret } = credentials
    const url = new URL(`${storeUrl}/wp-json/wc/v3/orders/${externalId}`)
    url.username = consumerKey
    url.password = consumerSecret

    const response = await fetch(url.toString(), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: updates.status === 'shipped' ? 'completed' : 'processing',
      }),
    })

    return response.ok
  }

  verifyWebhookSignature(payload: string, signature: string, secret: string): boolean {
    const crypto = require('crypto')
    const hash = crypto.createHmac('sha256', secret).update(payload).digest('base64')
    return hash === signature
  }

  parseWebhookPayload(eventType: string, payload: Record<string, unknown>): WebhookEvent | null {
    switch (eventType) {
      case 'order.created':
      case 'order.updated':
        return {
          type: 'order_updated',
          externalId: String(payload.id),
          data: payload,
          timestamp: new Date().toISOString(),
        }
      case 'product.created':
      case 'product.updated':
        return {
          type: 'product_updated',
          externalId: String(payload.id),
          data: payload,
          timestamp: new Date().toISOString(),
        }
      default:
        return null
    }
  }
}
```

### 4.3 Generic Webhook Adapter

```typescript
// src/lib/integrations/adapters/generic-webhook.ts

import type { ProviderAdapter, ProviderConfig, ExternalProduct, ExternalOrder, WebhookEvent } from '../types'

export class GenericWebhookAdapter implements ProviderAdapter {
  getConfig(): ProviderConfig {
    return {
      key: 'generic_webhook',
      name: 'Generic Webhook',
      authType: 'api_key',
      capabilities: [
        { entity: 'products', direction: 'inbound', supported: true },
        { entity: 'orders', direction: 'inbound', supported: true },
        { entity: 'orders', direction: 'outbound', supported: true },
        { entity: 'customers', direction: 'inbound', supported: true },
        { entity: 'inventory', direction: 'inbound', supported: true },
      ],
    }
  }

  async testConnection(credentials: Record<string, string>, config: Record<string, unknown>): Promise<boolean> {
    // Generic adapter just validates webhook URL is reachable
    const { webhookUrl } = credentials
    try {
      const response = await fetch(webhookUrl, { method: 'HEAD' })
      return response.ok || response.status === 405 // 405 = Method Not Allowed = endpoint exists
    } catch {
      return false
    }
  }

  async fetchProducts(config: Record<string, unknown>, credentials: Record<string, string>, since?: string): Promise<ExternalProduct[]> {
    // Generic adapter relies on webhooks, not polling
    // But can support a "pull" endpoint if the external system provides one
    const { apiUrl, apiKey } = credentials
    const url = new URL(`${apiUrl}/products`)
    if (since) url.searchParams.set('since', since)

    const response = await fetch(url.toString(), {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    })

    if (!response.ok) return []
    const data = await response.json()

    // Assume standard structure: { products: [...] }
    return (data.products || []).map((p: Record<string, unknown>) => ({
      externalId: String(p.id || p.external_id),
      name: String(p.name || p.title),
      description: String(p.description || ''),
      sku: String(p.sku || ''),
      price: parseFloat(String(p.price || '0')),
      currency: String(p.currency || 'USD'),
      stock: p.stock !== undefined ? Number(p.stock) : undefined,
      images: Array.isArray(p.images) ? p.images.map(String) : [],
      category: String(p.category || ''),
      status: 'active' as const,
      updatedAt: String(p.updated_at || new Date().toISOString()),
    }))
  }

  async fetchOrders(config: Record<string, unknown>, credentials: Record<string, string>, since?: string): Promise<ExternalOrder[]> {
    const { apiUrl, apiKey } = credentials
    const url = new URL(`${apiUrl}/orders`)
    if (since) url.searchParams.set('since', since)

    const response = await fetch(url.toString(), {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    })

    if (!response.ok) return []
    const data = await response.json()

    return (data.orders || []).map((o: Record<string, unknown>) => ({
      externalId: String(o.id || o.external_id),
      orderNumber: String(o.order_number || o.number || ''),
      items: (o.items || o.line_items || []).map((li: Record<string, unknown>) => ({
        productExternalId: String(li.product_id || li.product_external_id),
        name: String(li.name || li.title),
        quantity: Number(li.quantity),
        unitPrice: parseFloat(String(li.price || li.unit_price || '0')),
        total: parseFloat(String(li.total || li.total_price || '0')),
      })),
      subtotal: parseFloat(String(o.subtotal || o.total || '0')),
      tax: parseFloat(String(o.tax || o.total_tax || '0')),
      total: parseFloat(String(o.total || o.total_price || '0')),
      currency: String(o.currency || 'USD'),
      status: String(o.status || 'pending') as ExternalOrder['status'],
    }))
  }

  async createOrder(order: InternalOrder, config: Record<string, unknown>, credentials: Record<string, string>): Promise<{ externalId: string; status: string }> {
    const { apiUrl, apiKey } = credentials

    const response = await fetch(`${apiUrl}/orders`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        order_number: order.orderNumber,
        items: order.items.map((item) => ({
          product_external_id: item.offeringId,
          name: item.name,
          quantity: item.quantity,
          unit_price: item.unitPrice,
          total: item.totalPrice,
        })),
        subtotal: order.subtotal,
        tax: order.taxAmount,
        total: order.total,
        currency: order.currency,
        notes: order.notes,
      }),
    })

    if (!response.ok) throw new Error(`Order creation failed: ${response.statusText}`)

    const data = await response.json()
    return {
      externalId: String(data.id || data.external_id),
      status: String(data.status || 'pending'),
    }
  }

  async updateOrder(externalId: string, updates: Partial<ExternalOrder>, config: Record<string, unknown>, credentials: Record<string, string>): Promise<boolean> {
    const { apiUrl, apiKey } = credentials

    const response = await fetch(`${apiUrl}/orders/${externalId}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        status: updates.status,
      }),
    })

    return response.ok
  }

  verifyWebhookSignature(payload: string, signature: string, secret: string): boolean {
    // Generic: HMAC-SHA256
    const crypto = require('crypto')
    const hmac = crypto.createHmac('sha256', secret)
    hmac.update(payload)
    return hmac.digest('hex') === signature
  }

  parseWebhookPayload(eventType: string, payload: Record<string, unknown>): WebhookEvent | null {
    // Generic: assume payload has type field
    const type = payload.type || eventType
    switch (type) {
      case 'order.created':
      case 'order.updated':
        return {
          type: 'order_updated',
          externalId: String(payload.id || payload.external_id),
          data: payload,
          timestamp: new Date().toISOString(),
        }
      case 'product.created':
      case 'product.updated':
        return {
          type: 'product_updated',
          externalId: String(payload.id || payload.external_id),
          data: payload,
          timestamp: new Date().toISOString(),
        }
      case 'inventory.updated':
        return {
          type: 'inventory_updated',
          externalId: String(payload.id || payload.external_id),
          data: payload,
          timestamp: new Date().toISOString(),
        }
      default:
        return null
    }
  }
}
```

---

## 5. Sync Engine

```typescript
// src/lib/integrations/sync-engine.ts

import { supabaseAdmin } from '@/lib/supabase/admin'
import type { ProviderAdapter, SyncResult, EntityType, SyncDirection } from './types'
import { getAdapter } from './adapter-registry'

interface SyncJobParams {
  connectionId: string
  accountId: string
  direction: SyncDirection
  entityType: EntityType
  triggeredBy?: string // user_id or 'system' or 'webhook'
}

export async function createSyncJob(params: SyncJobParams): Promise<string> {
  const db = supabaseAdmin

  const { data, error } = await db
    .from('integration_sync_jobs')
    .insert({
      connection_id: params.connectionId,
      account_id: params.accountId,
      direction: params.direction,
      entity_type: params.entityType,
      status: 'pending',
      metadata: { triggeredBy: params.triggeredBy || 'system' },
    })
    .select('id')
    .single()

  if (error) throw new Error(`Failed to create sync job: ${error.message}`)
  return data.id
}

export async function executeSyncJob(jobId: string): Promise<SyncResult> {
  const db = supabaseAdmin

  // Get job details
  const { data: job, error: jobError } = await db
    .from('integration_sync_jobs')
    .select('*, integration_connections(*)')
    .eq('id', jobId)
    .single()

  if (jobError || !job) throw new Error('Sync job not found')

  const connection = job.integration_connections
  const adapter = getAdapter(connection.provider_key)
  if (!adapter) throw new Error(`No adapter for provider: ${connection.provider_key}`)

  // Mark as running
  await db
    .from('integration_sync_jobs')
    .update({ status: 'running', started_at: new Date().toISOString() })
    .eq('id', jobId)

  try {
    let result: SyncResult

    if (job.direction === 'inbound') {
      result = await executeInboundSync(adapter, connection, job.entity_type, jobId)
    } else {
      result = await executeOutboundSync(adapter, connection, job.entity_type, jobId)
    }

    // Update job status
    await db
      .from('integration_sync_jobs')
      .update({
        status: result.success ? 'completed' : 'partial',
        completed_at: new Date().toISOString(),
        items_synced: result.itemsSynced,
        items_failed: result.itemsFailed,
        items_skipped: result.itemsSkipped,
        error_summary: result.errors.length > 0 ? result.errors.map((e) => e.message).join('; ') : null,
      })
      .eq('id', jobId)

    // Update connection last_sync_at
    await db
      .from('integration_connections')
      .update({ last_sync_at: new Date().toISOString(), last_error: null })
      .eq('id', connection.id)

    return result
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'

    await db
      .from('integration_sync_jobs')
      .update({
        status: 'failed',
        completed_at: new Date().toISOString(),
        error_summary: errorMessage,
      })
      .eq('id', jobId)

    await db
      .from('integration_connections')
      .update({ status: 'error', last_error: errorMessage })
      .eq('id', connection.id)

    throw error
  }
}

async function executeInboundSync(
  adapter: ProviderAdapter,
  connection: any,
  entityType: EntityType,
  jobId: string,
): Promise<SyncResult> {
  const db = supabaseAdmin
  const credentials = decryptCredentials(connection.credentials)
  const config = connection.config || {}
  const syncConfig = connection.sync_config || {}

  let itemsSynced = 0
  let itemsFailed = 0
  let itemsSkipped = 0
  const errors: SyncResult['errors'] = []

  // Get last sync time for incremental sync
  const lastSync = connection.last_sync_at

  switch (entityType) {
    case 'products': {
      const externalProducts = await adapter.fetchProducts(config, credentials, lastSync || undefined)

      for (const ext of externalProducts) {
        try {
          // Check if product already exists by external_id
          const { data: existing } = await db
            .from('offerings')
            .select('id, metadata')
            .eq('account_id', connection.account_id)
            .eq('metadata->>external_id', ext.externalId)
            .eq('metadata->>external_provider', connection.provider_key)
            .maybeSingle()

          if (existing) {
            // Update existing product
            const fieldMappings = syncConfig.fieldMappings || {}
            const updateData = mapExternalToInternal(ext, fieldMappings)

            await db
              .from('offerings')
              .update({
                ...updateData,
                metadata: {
                  ...((existing.metadata as Record<string, unknown>) || {}),
                  external_id: ext.externalId,
                  external_provider: connection.provider_key,
                  last_synced_at: new Date().toISOString(),
                },
              })
              .eq('id', existing.id)

            await logSyncItem(db, jobId, connection.id, connection.account_id, 'inbound', 'products', ext.externalId, existing.id, 'update', 'success')
            itemsSynced++
          } else {
            // Create new product
            const fieldMappings = syncConfig.fieldMappings || {}
            const insertData = mapExternalToInternal(ext, fieldMappings)

            const { data: newProduct, error: insertError } = await db
              .from('offerings')
              .insert({
                account_id: connection.account_id,
                type: entityTypeToOfferingType(entityType),
                name: insertData.name || ext.name,
                slug: generateSlug(insertData.name || ext.name),
                short_description: insertData.short_description || ext.description?.substring(0, 200),
                description: insertData.description || ext.description,
                price: insertData.price || ext.price,
                currency: insertData.currency || ext.currency,
                reference_code: insertData.reference_code || ext.sku,
                status: ext.status === 'active' ? 'active' : 'draft',
                metadata: {
                  external_id: ext.externalId,
                  external_provider: connection.provider_key,
                  last_synced_at: new Date().toISOString(),
                  external_data: ext.metadata,
                },
              })
              .select('id')
              .single()

            if (insertError) {
              await logSyncItem(db, jobId, connection.id, connection.account_id, 'inbound', 'products', ext.externalId, null, 'error', 'error', insertError.message)
              itemsFailed++
              errors.push({ externalId: ext.externalId, message: insertError.message })
            } else {
              await logSyncItem(db, jobId, connection.id, connection.account_id, 'inbound', 'products', ext.externalId, newProduct.id, 'create', 'success')
              itemsSynced++
            }
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Unknown error'
          await logSyncItem(db, jobId, connection.id, connection.account_id, 'inbound', 'products', ext.externalId, null, 'error', 'error', msg)
          itemsFailed++
          errors.push({ externalId: ext.externalId, message: msg })
        }
      }
      break
    }

    case 'orders': {
      const externalOrders = await adapter.fetchOrders(config, credentials, lastSync || undefined)

      for (const ext of externalOrders) {
        try {
          // Check if order already exists
          const { data: existing } = await db
            .from('orders')
            .select('id')
            .eq('account_id', connection.account_id)
            .eq('metadata->>external_id', ext.externalId)
            .maybeSingle()

          if (existing) {
            // Update order status
            await db
              .from('orders')
              .update({
                status: mapExternalOrderStatus(ext.status),
                metadata: {
                  external_id: ext.externalId,
                  external_provider: connection.provider_key,
                  last_synced_at: new Date().toISOString(),
                },
              })
              .eq('id', existing.id)

            itemsSynced++
          } else {
            // Create new order
            const { data: newOrder, error: insertError } = await db
              .from('orders')
              .insert({
                account_id: connection.account_id,
                order_number: ext.orderNumber || `EXT-${ext.externalId}`,
                status: mapExternalOrderStatus(ext.status),
                currency: ext.currency,
                subtotal: ext.subtotal,
                tax_amount: ext.tax,
                total: ext.total,
                metadata: {
                  external_id: ext.externalId,
                  external_provider: connection.provider_key,
                  last_synced_at: new Date().toISOString(),
                },
              })
              .select('id')
              .single()

            if (insertError) {
              itemsFailed++
              errors.push({ externalId: ext.externalId, message: insertError.message })
            } else {
              // Create order items
              for (const item of ext.items) {
                await db.from('order_items').insert({
                  order_id: newOrder.id,
                  name: item.name,
                  quantity: item.quantity,
                  unit_price: item.unitPrice,
                  total_price: item.total,
                  metadata: { external_product_id: item.productExternalId },
                })
              }
              itemsSynced++
            }
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Unknown error'
          itemsFailed++
          errors.push({ externalId: ext.externalId, message: msg })
        }
      }
      break
    }
  }

  return {
    success: itemsFailed === 0,
    itemsSynced,
    itemsFailed,
    itemsSkipped,
    errors,
    externalIds: new Map(),
  }
}

async function executeOutboundSync(
  adapter: ProviderAdapter,
  connection: any,
  entityType: EntityType,
  jobId: string,
): Promise<SyncResult> {
  const db = supabaseAdmin
  const credentials = decryptCredentials(connection.credentials)
  const config = connection.config || {}

  let itemsSynced = 0
  let itemsFailed = 0
  const errors: SyncResult['errors'] = []

  if (entityType === 'orders') {
    // Get orders that need to be pushed to external
    const { data: orders } = await db
      .from('orders')
      .select('*, order_items(*)')
      .eq('account_id', connection.account_id)
      .is('metadata->>external_id', null) // Not yet synced
      .eq('status', 'confirmed')

    for (const order of orders || []) {
      try {
        const result = await adapter.createOrder(
          {
            id: order.id,
            orderNumber: order.order_number,
            items: order.order_items.map((li: any) => ({
              offeringId: li.offering_id,
              name: li.name,
              quantity: li.quantity,
              unitPrice: li.unit_price,
              totalPrice: li.total_price,
            })),
            subtotal: order.subtotal,
            taxAmount: order.tax_amount,
            total: order.total,
            currency: order.currency,
            notes: order.notes,
          },
          config,
          credentials,
        )

        // Update order with external ID
        await db
          .from('orders')
          .update({
            metadata: {
              ...((order.metadata as Record<string, unknown>) || {}),
              external_id: result.externalId,
              external_provider: connection.provider_key,
              external_status: result.status,
              synced_at: new Date().toISOString(),
            },
          })
          .eq('id', order.id)

        await logSyncItem(db, jobId, connection.id, connection.account_id, 'outbound', 'orders', result.externalId, order.id, 'create', 'success')
        itemsSynced++
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error'
        await logSyncItem(db, jobId, connection.id, connection.account_id, 'outbound', 'orders', null, order.id, 'error', 'error', msg)
        itemsFailed++
        errors.push({ internalId: order.id, message: msg })
      }
    }
  }

  return {
    success: itemsFailed === 0,
    itemsSynced,
    itemsFailed,
    itemsSkipped: 0,
    errors,
    externalIds: new Map(),
  }
}

// Helper functions
async function logSyncItem(
  db: any,
  jobId: string,
  connectionId: string,
  accountId: string,
  direction: string,
  entityType: string,
  externalId: string | null,
  internalId: string | null,
  action: string,
  status: string,
  errorMessage?: string,
) {
  await db.from('integration_sync_logs').insert({
    job_id: jobId,
    connection_id: connectionId,
    account_id: accountId,
    direction,
    entity_type: entityType,
    external_id: externalId,
    internal_id: internalId,
    action,
    status,
    error_message: errorMessage,
  })
}

function mapExternalToInternal(ext: any, fieldMappings: Record<string, string>) {
  const result: Record<string, unknown> = {}
  // Apply field mappings or use defaults
  result.name = ext.name
  result.description = ext.description
  result.price = ext.price
  result.currency = ext.currency
  result.reference_code = ext.sku
  return result
}

function entityTypeToOfferingType(entityType: EntityType): string {
  switch (entityType) {
    case 'products': return 'product'
    case 'orders': return 'service' // Orders don't have a direct offering type
    default: return 'product'
  }
}

function generateSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function mapExternalOrderStatus(status: string): string {
  switch (status) {
    case 'confirmed': return 'confirmed'
    case 'shipped': return 'processing'
    case 'delivered': return 'delivered'
    case 'cancelled': return 'cancelled'
    default: return 'pending'
  }
}

function decryptCredentials(encrypted: Record<string, string>): Record<string, string> {
  // TODO: Implement proper credential decryption
  // For now, return as-is (should be encrypted in production)
  return encrypted
}
```

---

## 6. Webhook Receiver

```typescript
// src/app/api/integrations/webhook/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { getAdapter } from '@/lib/integrations/adapter-registry'

export async function POST(request: NextRequest) {
  try {
    const body = await request.text()
    const signature = request.headers.get('x-webhook-signature') || request.headers.get('x-hub-signature-256') || ''
    const providerKey = request.nextUrl.searchParams.get('provider') || ''
    const connectionId = request.nextUrl.searchParams.get('connection_id') || ''

    if (!connectionId) {
      return NextResponse.json({ error: 'Missing connection_id' }, { status: 400 })
    }

    const db = supabaseAdmin

    // Get connection
    const { data: connection } = await db
      .from('integration_connections')
      .select('*')
      .eq('id', connectionId)
      .eq('status', 'active')
      .single()

    if (!connection) {
      return NextResponse.json({ error: 'Connection not found or inactive' }, { status: 404 })
    }

    // Get webhook registration
    const { data: webhook } = await db
      .from('integration_webhooks')
      .select('*')
      .eq('connection_id', connectionId)
      .eq('is_active', true)
      .single()

    if (!webhook) {
      return NextResponse.json({ error: 'No active webhook for this connection' }, { status: 404 })
    }

    // Verify signature
    const adapter = getAdapter(connection.provider_key)
    if (adapter) {
      const isValid = adapter.verifyWebhookSignature(body, signature, webhook.secret)
      if (!isValid) {
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
      }
    }

    // Parse webhook payload
    const payload = JSON.parse(body)
    const eventType = request.headers.get('x-webhook-event') || payload.type || ''

    if (!adapter) {
      return NextResponse.json({ error: 'No adapter for provider' }, { status: 400 })
    }

    const event = adapter.parseWebhookPayload(eventType, payload)
    if (!event) {
      return NextResponse.json({ received: true, processed: false, reason: 'Unknown event type' })
    }

    // Process the event based on type
    switch (event.type) {
      case 'product_updated':
      case 'product_created':
        await handleProductWebhook(db, connection, event)
        break
      case 'order_updated':
        await handleOrderWebhook(db, connection, event)
        break
      case 'inventory_updated':
        await handleInventoryWebhook(db, connection, event)
        break
    }

    // Update last_received_at
    await db
      .from('integration_webhooks')
      .update({ last_received_at: new Date().toISOString() })
      .eq('id', webhook.id)

    return NextResponse.json({ received: true, processed: true })
  } catch (error) {
    console.error('[Webhook] Error processing webhook:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

async function handleProductWebhook(db: any, connection: any, event: any) {
  // Upsert product by external_id
  const { data: existing } = await db
    .from('offerings')
    .select('id')
    .eq('account_id', connection.account_id)
    .eq('metadata->>external_id', event.externalId)
    .maybeSingle()

  if (existing) {
    await db
      .from('offerings')
      .update({
        metadata: {
          external_id: event.externalId,
          external_provider: connection.provider_key,
          last_synced_at: new Date().toISOString(),
          webhook_data: event.data,
        },
      })
      .eq('id', existing.id)
  }
}

async function handleOrderWebhook(db: any, connection: any, event: any) {
  // Update order status from external
  const { data: existing } = await db
    .from('orders')
    .select('id')
    .eq('account_id', connection.account_id)
    .eq('metadata->>external_id', event.externalId)
    .maybeSingle()

  if (existing) {
    const status = event.data.status || 'pending'
    await db
      .from('orders')
      .update({
        status: mapExternalOrderStatus(status),
        metadata: {
          external_id: event.externalId,
          external_provider: connection.provider_key,
          last_synced_at: new Date().toISOString(),
        },
      })
      .eq('id', existing.id)
  }
}

async function handleInventoryWebhook(db: any, connection: any, event: any) {
  // Update product stock level
  const { data: existing } = await db
    .from('offerings')
    .select('id, metadata')
    .eq('account_id', connection.account_id)
    .eq('metadata->>external_id', event.externalId)
    .maybeSingle()

  if (existing) {
    await db
      .from('offerings')
      .update({
        metadata: {
          ...((existing.metadata as Record<string, unknown>) || {}),
          external_stock: event.data.quantity,
          last_synced_at: new Date().toISOString(),
        },
      })
      .eq('id', existing.id)
  }
}
```

---

## 7. Connection Management API

```typescript
// src/app/api/integrations/connections/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { getAdapter } from '@/lib/integrations/adapter-registry'

// GET /api/integrations/connections — List connections for account
export async function GET(request: NextRequest) {
  const accountId = request.nextUrl.searchParams.get('account_id')
  if (!accountId) return NextResponse.json({ error: 'Missing account_id' }, { status: 400 })

  const db = supabaseAdmin
  const { data, error } = await db
    .from('integration_connections')
    .select('*, integration_providers(key, name, auth_type)')
    .eq('account_id', accountId)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// POST /api/integrations/connections — Create new connection
export async function POST(request: NextRequest) {
  const body = await request.json()
  const { account_id, provider_key, name, config, credentials, sync_config } = body

  if (!account_id || !provider_key || !name || !credentials) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const db = supabaseAdmin

  // Test connection
  const adapter = getAdapter(provider_key)
  if (!adapter) {
    return NextResponse.json({ error: `Unknown provider: ${provider_key}` }, { status: 400 })
  }

  const isValid = await adapter.testConnection(credentials, config || {})
  if (!isValid) {
    return NextResponse.json({ error: 'Connection test failed. Check credentials.' }, { status: 400 })
  }

  // Create connection
  const { data, error } = await db
    .from('integration_connections')
    .insert({
      account_id,
      provider_key,
      name,
      status: 'active',
      config: config || {},
      credentials, // TODO: Encrypt before storing
      sync_config: sync_config || {},
      created_by: null, // TODO: Get from auth
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
```

---

## 8. Conflict Resolution

### Strategy

| Scenario | Resolution | Action |
|----------|-----------|--------|
| Same product exists in both systems | **External wins** (source of truth) | Overwrite internal with external data |
| Order created in ours, not in external | **Push to external** | Create order in external system |
| Order exists in both, status differs | **Latest wins** | Compare timestamps, use most recent |
| Field mapping conflict | **Manual review** | Add to conflict queue |
| Stock level mismatch | **External wins** | Inventory is external's responsibility |

### Conflict Queue

When automatic resolution isn't possible, items go to the conflict queue:

```sql
-- View pending conflicts
SELECT * FROM integration_conflicts
WHERE account_id = '...' AND resolution = 'pending'
ORDER BY created_at DESC;

-- Resolve conflict
UPDATE integration_conflicts
SET resolution = 'external_wins',  -- or 'internal_wins', 'merged'
    resolved_by = 'user_id',
    resolved_at = NOW()
WHERE id = 'conflict_id';
```

---

## 9. File Locations

```
src/lib/integrations/
├── types.ts                    # All interfaces and types
├── adapter-registry.ts         # Provider adapter registry
├── sync-engine.ts              # Core sync logic
├── conflict-resolver.ts        # Conflict resolution logic
├── credential-encryption.ts    # Credential encryption/decryption
├── adapters/
│   ├── shopify.ts              # Shopify adapter
│   ├── woocommerce.ts          # WooCommerce adapter
│   └── generic-webhook.ts      # Generic webhook adapter

src/app/api/integrations/
├── connections/route.ts        # CRUD for connections
├── connections/[id]/route.ts   # Single connection operations
├── webhook/route.ts            # Webhook receiver
├── sync/route.ts               # Trigger sync jobs
├── conflicts/route.ts          # Conflict management
└── providers/route.ts          # List available providers

supabase/migrations/
└── 090_external_integrations.sql  # All integration tables
```

---

## 10. Implementation Phases

### Phase 1: Foundation (Current)
- [x] Design document
- [ ] Migration SQL
- [ ] Types and interfaces
- [ ] Adapter registry

### Phase 2: Core Adapters
- [ ] Shopify adapter
- [ ] WooCommerce adapter
- [ ] Generic webhook adapter

### Phase 3: Sync Engine
- [ ] Inbound sync (products, orders)
- [ ] Outbound sync (orders)
- [ ] Sync job management

### Phase 4: Webhook Receiver
- [ ] Webhook endpoint
- [ ] Signature verification
- [ ] Event processing

### Phase 5: UI & Management
- [ ] Connection management page
- [ ] Sync dashboard
- [ ] Conflict resolution UI
- [ ] Field mapping configuration

### Phase 6: Production Hardening
- [ ] Credential encryption
- [ ] Rate limiting
- [ ] Retry logic
- [ ] Monitoring & alerts

---

## 11. Security Considerations

1. **Credential Storage**: All API keys and tokens must be encrypted at rest using AES-256. Never store plaintext credentials.
2. **Webhook Verification**: Always verify webhook signatures before processing. Use HMAC-SHA256.
3. **Rate Limiting**: Respect provider rate limits. Implement exponential backoff for retries.
4. **RLS**: All integration tables have Row Level Security. Users can only access their own account's connections.
5. **Audit Trail**: All sync operations are logged. Admins can review sync history.
6. **API Keys**: Integration API keys are separate from the system's own API keys. Never expose external credentials to the client.

---

## 12. Environment Variables

```env
# Integration Encryption
INTEGRATION_ENCRYPTION_KEY=your-256-bit-key

# Shopify
SHOPIFY_WEBHOOK_SECRET=your-webhook-secret

# WooCommerce
WOOCOMMERCE_WEBHOOK_SECRET=your-webhook-secret

# Rate Limiting
INTEGRATION_RATE_LIMIT_PER_SECOND=10
```

---

*End of Design Document*
