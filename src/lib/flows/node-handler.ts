// ============================================================
// Capability Node Handler
//
// Maps operation_key → service call + WhatsApp formatter.
// The engine calls `executeCapabilityNode()` with the operation_key
// and params; this file resolves it to a CatalogueService or
// direct DB call, formats the result for WhatsApp display, and
// returns structured data that the engine stores in flow_runs.vars.
//
// Catalogue operations delegate to CatalogueService (single source
// of truth). Order/booking operations use direct DB calls (same
// pattern as API routes).
// ============================================================

import { supabaseAdmin } from "./admin-client";
import { CatalogueService } from "../business/catalogue-service";
import type { OfferingType } from "../business/offerings";

type AdminClient = ReturnType<typeof supabaseAdmin>;

// ============================================================
// Input/Output types
// ============================================================

export interface NodeHandlerParams {
  operation_key: string;
  input_params: Record<string, unknown>;
  accountId: string;
  contactId?: string;
  vars: Record<string, unknown>;
}

export interface NodeHandlerResult {
  [key: string]: unknown;
}

// ============================================================
// Formatting helpers (orders/bookings only)
// ============================================================

function formatPrice(amount: number, currency: string): string {
  return `${currency} ${amount.toFixed(2)}`;
}

// ============================================================
// Operation handlers — Catalogue operations (via CatalogueService)
// ============================================================

async function listCatalog(
  catalogue: CatalogueService,
  accountId: string,
  params: Record<string, unknown>,
): Promise<NodeHandlerResult> {
  const limit = typeof params.limit === "number" ? params.limit : 10;
  const page = typeof params.page === "number" ? params.page : 0;
  const type = typeof params.type === "string" ? (params.type as OfferingType) : undefined;
  const category = typeof params.category === "string" ? params.category : undefined;
  const search = typeof params.search === "string" ? params.search : undefined;

  const result = await catalogue.getItems(accountId, {
    type,
    category,
    search,
    limit,
    page,
  });

  return {
    items: result.items,
    total: result.total,
    page: result.page,
    count: result.items.length,
    has_more: result.has_more,
    list: catalogue.formatItemList(result.items),
  };
}

async function getCatalogItem(
  catalogue: CatalogueService,
  accountId: string,
  params: Record<string, unknown>,
): Promise<NodeHandlerResult> {
  const itemId = typeof params.item_id === "string" ? params.item_id : null;
  const productId = typeof params.product_id === "string" ? params.product_id : null;
  const id = itemId ?? productId;

  if (!id) return { item: null, detail: "Item not found." };

  const item = await catalogue.getItem(accountId, id);
  if (!item) return { item: null, detail: "Item not found." };

  return { item, detail: catalogue.formatItemDetail(item) };
}

async function searchCatalog(
  catalogue: CatalogueService,
  accountId: string,
  params: Record<string, unknown>,
): Promise<NodeHandlerResult> {
  const query = typeof params.query === "string" ? params.query : "";
  const limit = typeof params.limit === "number" ? params.limit : 10;

  if (!query.trim()) return { items: [], total: 0, list: "No results found." };

  const result = await catalogue.searchItems(accountId, { query, limit });

  return {
    items: result.items,
    total: result.total,
    list: catalogue.formatSearchResults(result.items, query),
  };
}

async function getCategories(
  catalogue: CatalogueService,
  accountId: string,
  params: Record<string, unknown>,
): Promise<NodeHandlerResult> {
  const parentId = typeof params.parent_id === "string" ? params.parent_id : null;

  const items = await catalogue.getCategories(accountId, {
    parent_id: parentId,
  });

  return {
    items,
    count: items.length,
    list: catalogue.formatCategoryList(items),
  };
}

// ============================================================
// Operation handlers — Order/Booking (direct DB)
// ============================================================

async function createOrder(
  db: AdminClient,
  accountId: string,
  params: Record<string, unknown>,
): Promise<NodeHandlerResult> {
  const contactId = typeof params.contact_id === "string" ? params.contact_id : null;
  const items = Array.isArray(params.items)
    ? (params.items as Array<{
        offering_id?: string;
        name: string;
        quantity: number;
        unit_price: number;
      }>)
    : [];
  const notes = typeof params.notes === "string" ? params.notes : null;
  const currency = typeof params.currency === "string" ? params.currency : "USD";

  if (items.length === 0) {
    return {
      order: null,
      success: false,
      message: "No items provided. Please specify what you'd like to order.",
    };
  }

  // Generate order number via RPC
  const { data: orderNumber, error: numErr } = await db.rpc("next_order_number", {
    p_account_id: accountId,
  });
  if (numErr) throw numErr;

  // Calculate totals
  const subtotal = items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);

  // Insert order
  const { data: order, error: orderErr } = await db
    .from("orders")
    .insert({
      account_id: accountId,
      order_number: orderNumber,
      contact_id: contactId,
      status: "pending",
      currency,
      subtotal,
      total: subtotal,
      notes,
    })
    .select()
    .maybeSingle();

  if (orderErr) throw orderErr;

  // Insert line items
  if (items.length > 0) {
    const lineItems = items.map((item) => ({
      order_id: order.id,
      offering_id: item.offering_id ?? null,
      name: item.name,
      quantity: item.quantity,
      unit_price: item.unit_price,
      total_price: item.quantity * item.unit_price,
    }));

    const { error: itemsErr } = await db.from("order_items").insert(lineItems);
    if (itemsErr) throw itemsErr;
  }

  // Format confirmation message
  const itemLines = items.map(
    (item) => `${item.quantity}x ${item.name} — ${formatPrice(item.quantity * item.unit_price, currency)}`,
  );

  const message = [
    `✅ Order *${orderNumber}* created!`,
    "",
    ...itemLines,
    "",
    `Total: *${formatPrice(subtotal, currency)}*`,
    "",
    "Our team will confirm your order shortly.",
  ].join("\n");

  return { order: { ...order, items }, success: true, message };
}

async function getOrder(
  db: AdminClient,
  accountId: string,
  params: Record<string, unknown>,
): Promise<NodeHandlerResult> {
  const orderId = typeof params.order_id === "string" ? params.order_id : null;
  const orderNumber = typeof params.order_number === "string" ? params.order_number : null;

  let query = db
    .from("orders")
    .select("*, items:order_items(*)")
    .eq("account_id", accountId);

  if (orderId) {
    query = query.eq("id", orderId);
  } else if (orderNumber) {
    query = query.eq("order_number", orderNumber);
  } else {
    return { order: null, detail: "Order not found." };
  }

  const { data, error } = await query.maybeSingle();
  if (error) throw error;

  if (!data) return { order: null, detail: "Order not found." };

  const currency = String(data.currency ?? "USD");
  const items = (data.items as Array<Record<string, unknown>> ?? []);
  const itemLines = items.map(
    (item) => `${item.quantity}x ${item.name} — ${formatPrice(Number(item.total_price ?? 0), currency)}`,
  );

  const detail = [
    `Order *${data.order_number}*`,
    `Status: ${String(data.status).toUpperCase()}`,
    "",
    ...itemLines,
    "",
    `Total: *${formatPrice(Number(data.total ?? 0), currency)}*`,
  ].join("\n");

  return { order: data, detail };
}

async function listOrders(
  db: AdminClient,
  accountId: string,
  params: Record<string, unknown>,
): Promise<NodeHandlerResult> {
  const status = typeof params.status === "string" ? params.status : null;
  const limit = typeof params.limit === "number" ? params.limit : 10;
  const page = typeof params.page === "number" ? params.page : 0;

  let query = db
    .from("orders")
    .select("*, items:order_items(*)", { count: "exact" })
    .eq("account_id", accountId);

  if (status) query = query.eq("status", status);

  const { data, error, count } = await query
    .order("created_at", { ascending: false })
    .range(page * limit, (page + 1) * limit - 1);

  if (error) throw error;

  const items = data ?? [];
  const lines = items.map((order: Record<string, unknown>) => {
    const num = String(order.order_number ?? "");
    const status = String(order.status ?? "").toUpperCase();
    const total = formatPrice(Number(order.total ?? 0), String(order.currency ?? "USD"));
    return `*${num}* — ${status} — ${total}`;
  });

  return {
    items,
    total: count ?? 0,
    page,
    count: items.length,
    list: lines.length > 0 ? lines.join("\n") : "No orders found.",
  };
}

async function createBooking(
  db: AdminClient,
  accountId: string,
  params: Record<string, unknown>,
): Promise<NodeHandlerResult> {
  const contactId = typeof params.contact_id === "string" ? params.contact_id : null;
  const offeringId = typeof params.offering_id === "string" ? params.offering_id : null;
  const startDate = typeof params.start_date === "string" ? params.start_date : null;
  const endDate = typeof params.end_date === "string" ? params.end_date : null;
  const guests = typeof params.guests === "number" ? params.guests : 1;
  const notes = typeof params.notes === "string" ? params.notes : null;
  const currency = typeof params.currency === "string" ? params.currency : "USD";

  if (!startDate) {
    return {
      booking: null,
      success: false,
      message: "Please provide a date for your booking.",
    };
  }

  // Generate booking number via RPC
  const { data: bookingNumber, error: numErr } = await db.rpc("next_booking_number", {
    p_account_id: accountId,
  });
  if (numErr) throw numErr;

  // Get price from offering if provided
  let total = 0;
  let offeringName = "";
  if (offeringId) {
    const { data: offering } = await db
      .from("offerings")
      .select("price, name")
      .eq("id", offeringId)
      .maybeSingle();
    if (offering?.price) total = Number(offering.price) * guests;
    if (offering?.name) offeringName = String(offering.name);
  }

  const { data: booking, error: bookingErr } = await db
    .from("bookings")
    .insert({
      account_id: accountId,
      booking_number: bookingNumber,
      contact_id: contactId,
      offering_id: offeringId,
      status: "pending",
      start_date: startDate,
      end_date: endDate,
      guests,
      currency,
      total,
      notes,
    })
    .select()
    .maybeSingle();

  if (bookingErr) throw bookingErr;

  const message = [
    `✅ Booking *${bookingNumber}* created!`,
    offeringName ? `For: ${offeringName}` : null,
    `Date: ${startDate}${endDate ? ` — ${endDate}` : ""}`,
    `Guests: ${guests}`,
    total > 0 ? `Total: *${formatPrice(total, currency)}*` : null,
    "",
    "We'll confirm your booking shortly.",
  ]
    .filter(Boolean)
    .join("\n");

  return { booking, success: true, message };
}

async function getBooking(
  db: AdminClient,
  accountId: string,
  params: Record<string, unknown>,
): Promise<NodeHandlerResult> {
  const bookingId = typeof params.booking_id === "string" ? params.booking_id : null;
  const bookingNumber = typeof params.booking_number === "string" ? params.booking_number : null;

  let query = db
    .from("bookings")
    .select("*, offering:offerings(name, type, price)")
    .eq("account_id", accountId);

  if (bookingId) {
    query = query.eq("id", bookingId);
  } else if (bookingNumber) {
    query = query.eq("booking_number", bookingNumber);
  } else {
    return { booking: null, detail: "Booking not found." };
  }

  const { data, error } = await query.maybeSingle();
  if (error) throw error;

  if (!data) return { booking: null, detail: "Booking not found." };

  const offering = data.offering as Record<string, unknown> | null;
  const detail = [
    `Booking *${data.booking_number}*`,
    `Status: ${String(data.status).toUpperCase()}`,
    offering?.name ? `For: ${offering.name}` : null,
    `Date: ${data.start_date}${data.end_date ? ` — ${data.end_date}` : ""}`,
    `Guests: ${data.guests}`,
    `Total: *${formatPrice(Number(data.total ?? 0), String(data.currency ?? "USD"))}*`,
  ]
    .filter(Boolean)
    .join("\n");

  return { booking: data, detail };
}

async function listBookings(
  db: AdminClient,
  accountId: string,
  params: Record<string, unknown>,
): Promise<NodeHandlerResult> {
  const status = typeof params.status === "string" ? params.status : null;
  const limit = typeof params.limit === "number" ? params.limit : 10;
  const page = typeof params.page === "number" ? params.page : 0;

  let query = db
    .from("bookings")
    .select("*, offering:offerings(name, type, price)", { count: "exact" })
    .eq("account_id", accountId);

  if (status) query = query.eq("status", status);

  const { data, error, count } = await query
    .order("created_at", { ascending: false })
    .range(page * limit, (page + 1) * limit - 1);

  if (error) throw error;

  const items = data ?? [];
  const lines = items.map((booking: Record<string, unknown>) => {
    const num = String(booking.booking_number ?? "");
    const status = String(booking.status ?? "").toUpperCase();
    const date = String(booking.start_date ?? "");
    return `*${num}* — ${status} — ${date}`;
  });

  return {
    items,
    total: count ?? 0,
    page,
    count: items.length,
    list: lines.length > 0 ? lines.join("\n") : "No bookings found.",
  };
}

// ============================================================
// Dispatcher — maps operation_key to handler
// ============================================================

const HANDLERS: Record<
  string,
  (
    catalogue: CatalogueService,
    db: AdminClient,
    accountId: string,
    params: Record<string, unknown>,
  ) => Promise<NodeHandlerResult>
> = {
  // Catalog / Products
  "catalog.list": (c, _db, accountId, params) => listCatalog(c, accountId, params),
  "catalog.get": (c, _db, accountId, params) => getCatalogItem(c, accountId, params),
  "catalog.search": (c, _db, accountId, params) => searchCatalog(c, accountId, params),
  "catalog.categories": (c, _db, accountId, params) => getCategories(c, accountId, params),

  // Menu (same catalog table, filtered by type=menu_item)
  "menu.list": (c, _db, accountId, params) =>
    listCatalog(c, accountId, { ...params, type: "menu_item" }),
  "menu.get": (c, _db, accountId, params) => getCatalogItem(c, accountId, params),
  "menu.search": (c, _db, accountId, params) => searchCatalog(c, accountId, params),

  // Orders
  "orders.create": (_c, db, accountId, params) => createOrder(db, accountId, params),
  "orders.get": (_c, db, accountId, params) => getOrder(db, accountId, params),
  "orders.list": (_c, db, accountId, params) => listOrders(db, accountId, params),

  // Bookings
  "bookings.create": (_c, db, accountId, params) => createBooking(db, accountId, params),
  "bookings.get": (_c, db, accountId, params) => getBooking(db, accountId, params),
  "bookings.list": (_c, db, accountId, params) => listBookings(db, accountId, params),
  "bookings.checkAvailability": (_c, db, accountId, params) =>
    checkAvailability(db, accountId, params),

  // Courses (same catalog table, filtered by type=course)
  "courses.list": (c, _db, accountId, params) =>
    listCatalog(c, accountId, { ...params, type: "course" }),
  "courses.get": (c, _db, accountId, params) => getCatalogItem(c, accountId, params),
  "courses.search": (c, _db, accountId, params) => searchCatalog(c, accountId, params),

  // Programs (same catalog table, filtered by type=program)
  "programs.list": (c, _db, accountId, params) =>
    listCatalog(c, accountId, { ...params, type: "program" }),
  "programs.get": (c, _db, accountId, params) => getCatalogItem(c, accountId, params),

  // Properties (same catalog table, filtered by type=property)
  "properties.list": (c, _db, accountId, params) =>
    listCatalog(c, accountId, { ...params, type: "property" }),
  "properties.get": (c, _db, accountId, params) => getCatalogItem(c, accountId, params),
  "properties.search": (c, _db, accountId, params) => searchCatalog(c, accountId, params),

  // Services (same catalog table, filtered by type=service)
  "services.list": (c, _db, accountId, params) =>
    listCatalog(c, accountId, { ...params, type: "service" }),
  "services.get": (c, _db, accountId, params) => getCatalogItem(c, accountId, params),
  "services.search": (c, _db, accountId, params) => searchCatalog(c, accountId, params),
};

// ============================================================
// Availability — still uses direct DB (booking check)
// ============================================================

async function checkAvailability(
  db: AdminClient,
  accountId: string,
  params: Record<string, unknown>,
): Promise<NodeHandlerResult> {
  const offeringId = typeof params.offering_id === "string" ? params.offering_id : null;
  const startDate = typeof params.start_date === "string" ? params.start_date : null;
  const endDate = typeof params.end_date === "string" ? params.end_date : null;
  const guests = typeof params.guests === "number" ? params.guests : 1;

  if (!offeringId || !startDate) {
    return { available: false, total: 0, message: "Please provide dates to check availability." };
  }

  // Check for overlapping bookings
  const endCheck = endDate ?? startDate;
  const { count, error } = await db
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .eq("account_id", accountId)
    .eq("offering_id", offeringId)
    .not("status", "eq", "cancelled")
    .lt("start_date", endCheck)
    .gt("end_date", startDate);

  if (error) throw error;

  const available = (count ?? 0) === 0;
  const message = available
    ? `✅ Available for ${startDate}${endDate ? ` — ${endDate}` : ""}!`
    : `❌ Sorry, not available for those dates. Try different dates or contact us for alternatives.`;

  return { available, total: count ?? 0, message };
}

// ============================================================
// Public entry point
// ============================================================

/**
 * Execute a capability node operation. Called by the flow engine
 * when it encounters a `capability_action` node.
 *
 * Returns a JSON-serializable object that the engine stores in
 * `flow_runs.vars[output_var]`. Each result includes:
 * - Raw data (items/order/booking) for downstream processing
 * - WhatsApp-formatted strings (list/detail/message) for send_message
 */
export async function executeCapabilityNode(
  params: NodeHandlerParams,
): Promise<NodeHandlerResult> {
  const handler = HANDLERS[params.operation_key];
  if (!handler) {
    throw new Error(`Unknown operation_key: ${params.operation_key}`);
  }

  const db = supabaseAdmin();
  const catalogue = new CatalogueService(db);
  return handler(catalogue, db, params.accountId, params.input_params);
}
