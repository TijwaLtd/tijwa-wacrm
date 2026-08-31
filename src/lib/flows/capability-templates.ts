// ============================================================
// Default Flow Templates — Capability-backed flows
//
// System-provided templates that are installed when a capability
// is enabled. Each template defines a flow graph that uses
// capability_action nodes to interact with business data and
// send_list/send_buttons for interactive WhatsApp messages.
//
// These are non-editable, non-deletable flows that serve as
// starting points. Users can clone and customize them.
// ============================================================

import type {
  CapabilityActionNodeConfig,
  CollectInputNodeConfig,
  ConditionNodeConfig,
  HandoffNodeConfig,
  SendButtonsNodeConfig,
  SendListNodeConfig,
  SendMessageNodeConfig,
  StartNodeConfig,
} from "./types";

export interface CapabilityFlowTemplate {
  slug: string;
  name: string;
  description: string;
  capability_key: string;
  trigger_type: "keyword" | "first_inbound_message";
  trigger_config: Record<string, unknown>;
  entry_node_id: string;
  nodes: Array<{
    node_key: string;
    node_type: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    config: any;
  }>;
}

// ============================================================
// 1. Catalog Quick Reply — Main menu for catalog browsing
// ============================================================

const CATALOG_QUICK_REPLY: CapabilityFlowTemplate = {
  slug: "default_catalog_quick_reply",
  name: "Catalog Quick Reply",
  description: "Interactive menu to browse products, menu, services, and more",
  capability_key: "products",
  trigger_type: "keyword",
  trigger_config: { keywords: ["catalog", "menu", "products", "services", "what do you offer", "what do you sell"], match_type: "contains" },
  entry_node_id: "start",
  nodes: [
    {
      node_key: "start",
      node_type: "start",
      config: { next_node_key: "main_menu" } satisfies StartNodeConfig,
    },
    {
      node_key: "main_menu",
      node_type: "send_list",
      config: {
        text: "Welcome! 👋 How can we help you today?",
        button_label: "Browse options",
        sections: [
          {
            title: "Catalog",
            rows: [
              { reply_id: "products", title: "📦 Products", description: "Browse our product catalog", next_node_key: "fetch_products" },
              { reply_id: "menu", title: "🍽️ Menu", description: "View food & drink menu", next_node_key: "fetch_menu" },
              { reply_id: "services", title: "🔧 Services", description: "See our services", next_node_key: "fetch_services" },
            ],
          },
          {
            title: "Support",
            rows: [
              { reply_id: "orders", title: "🛒 My Orders", description: "Check order status", next_node_key: "check_orders" },
              { reply_id: "bookings", title: "📅 My Bookings", description: "View reservations", next_node_key: "check_bookings" },
              { reply_id: "support", title: "💬 Talk to Agent", description: "Get human help", next_node_key: "handoff_support" },
            ],
          },
        ],
      } as SendListNodeConfig,
    },
    // Products branch
    {
      node_key: "fetch_products",
      node_type: "capability_action",
      config: {
        operation_key: "catalog.list",
        input_params: { limit: "10" },
        output_var: "products_result",
        next_node_key: "show_products",
      } satisfies CapabilityActionNodeConfig,
    },
    {
      node_key: "show_products",
      node_type: "send_message",
      config: {
        text: "📦 *Our Products*\n\n{{vars.products_result.list}}\n\nReply with a product name for details.",
        next_node_key: "end",
      } satisfies SendMessageNodeConfig,
    },
    // Menu branch
    {
      node_key: "fetch_menu",
      node_type: "capability_action",
      config: {
        operation_key: "menu.list",
        input_params: { limit: "10" },
        output_var: "menu_result",
        next_node_key: "show_menu",
      } satisfies CapabilityActionNodeConfig,
    },
    {
      node_key: "show_menu",
      node_type: "send_message",
      config: {
        text: "🍽️ *Our Menu*\n\n{{vars.menu_result.list}}\n\nReply with an item name to order.",
        next_node_key: "end",
      } satisfies SendMessageNodeConfig,
    },
    // Services branch
    {
      node_key: "fetch_services",
      node_type: "capability_action",
      config: {
        operation_key: "services.list",
        input_params: { limit: "10" },
        output_var: "services_result",
        next_node_key: "show_services",
      } satisfies CapabilityActionNodeConfig,
    },
    {
      node_key: "show_services",
      node_type: "send_message",
      config: {
        text: "🔧 *Our Services*\n\n{{vars.services_result.list}}\n\nReply with a service name for details.",
        next_node_key: "end",
      } satisfies SendMessageNodeConfig,
    },
    // Orders branch
    {
      node_key: "check_orders",
      node_type: "send_buttons",
      config: {
        text: "How can we help with your order?",
        buttons: [
          { reply_id: "track", title: "Track Order", next_node_key: "ask_order_number" },
          { reply_id: "new", title: "New Order", next_node_key: "start_order" },
        ],
      } as SendButtonsNodeConfig,
    },
    {
      node_key: "ask_order_number",
      node_type: "collect_input",
      config: {
        prompt_text: "Please enter your order number (e.g. ORD-00001):",
        var_key: "order_number",
        next_node_key: "fetch_order",
      } satisfies CollectInputNodeConfig,
    },
    {
      node_key: "fetch_order",
      node_type: "capability_action",
      config: {
        operation_key: "orders.get",
        input_params: { order_number: "{{vars.order_number}}" },
        output_var: "order_result",
        next_node_key: "show_order",
      } satisfies CapabilityActionNodeConfig,
    },
    {
      node_key: "show_order",
      node_type: "send_message",
      config: {
        text: "{{vars.order_result.detail}}",
        next_node_key: "end",
      } satisfies SendMessageNodeConfig,
    },
    // Bookings branch
    {
      node_key: "check_bookings",
      node_type: "send_buttons",
      config: {
        text: "How can we help with your booking?",
        buttons: [
          { reply_id: "check", title: "Check Booking", next_node_key: "ask_booking_number" },
          { reply_id: "new", title: "New Booking", next_node_key: "start_booking" },
        ],
      } as SendButtonsNodeConfig,
    },
    {
      node_key: "ask_booking_number",
      node_type: "collect_input",
      config: {
        prompt_text: "Please enter your booking number (e.g. BK-00001):",
        var_key: "booking_number",
        next_node_key: "fetch_booking",
      } satisfies CollectInputNodeConfig,
    },
    {
      node_key: "fetch_booking",
      node_type: "capability_action",
      config: {
        operation_key: "bookings.get",
        input_params: { booking_number: "{{vars.booking_number}}" },
        output_var: "booking_result",
        next_node_key: "show_booking",
      } satisfies CapabilityActionNodeConfig,
    },
    {
      node_key: "show_booking",
      node_type: "send_message",
      config: {
        text: "{{vars.booking_result.detail}}",
        next_node_key: "end",
      } satisfies SendMessageNodeConfig,
    },
    // Placeholders for new order/booking (will be linked to their flows)
    {
      node_key: "start_order",
      node_type: "send_message",
      config: {
        text: "To place an order, please tell us what you'd like and how many.",
        next_node_key: "end",
      } satisfies SendMessageNodeConfig,
    },
    {
      node_key: "start_booking",
      node_type: "send_message",
      config: {
        text: "To make a booking, please tell us your preferred dates and number of guests.",
        next_node_key: "end",
      } satisfies SendMessageNodeConfig,
    },
    // Handoff
    {
      node_key: "handoff_support",
      node_type: "handoff",
      config: {
        note: "Customer requested human support from catalog quick reply.",
      } as HandoffNodeConfig,
    },
    {
      node_key: "end",
      node_type: "end",
      config: {},
    },
  ],
};

// ============================================================
// 2. Order Creation Flow — Full order lifecycle
// ============================================================

const ORDER_CREATION: CapabilityFlowTemplate = {
  slug: "default_order_creation",
  name: "Order Creation",
  description: "Collect items and create an order via WhatsApp",
  capability_key: "orders",
  trigger_type: "keyword",
  trigger_config: { keywords: ["order", "buy", "purchase", "place order", "i want to buy"], match_type: "contains" },
  entry_node_id: "start",
  nodes: [
    {
      node_key: "start",
      node_type: "start",
      config: { next_node_key: "ask_items" } satisfies StartNodeConfig,
    },
    {
      node_key: "ask_items",
      node_type: "collect_input",
      config: {
        prompt_text: "Great! 🛒 What would you like to order? Please tell us the item name(s) and quantity.",
        var_key: "customer_items",
        next_node_key: "confirm_items",
      } satisfies CollectInputNodeConfig,
    },
    {
      node_key: "confirm_items",
      node_type: "send_buttons",
      config: {
        text: "You want: {{vars.customer_items}}\n\nIs this correct?",
        buttons: [
          { reply_id: "yes", title: "✅ Yes, place order", next_node_key: "create_order" },
          { reply_id: "edit", title: "✏️ Let me change", next_node_key: "ask_items" },
          { reply_id: "cancel", title: "❌ Cancel", next_node_key: "cancel_order" },
        ],
      } as SendButtonsNodeConfig,
    },
    {
      node_key: "create_order",
      node_type: "capability_action",
      config: {
        operation_key: "orders.create",
        input_params: {
          items: "{{vars.customer_items}}",
          currency: "USD",
        },
        output_var: "order_result",
        next_node_key: "show_confirmation",
      } satisfies CapabilityActionNodeConfig,
    },
    {
      node_key: "show_confirmation",
      node_type: "send_message",
      config: {
        text: "{{vars.order_result.message}}",
        next_node_key: "offer_help",
      } satisfies SendMessageNodeConfig,
    },
    {
      node_key: "offer_help",
      node_type: "send_buttons",
      config: {
        text: "Anything else we can help with?",
        buttons: [
          { reply_id: "track", title: "Track Order", next_node_key: "track_order" },
          { reply_id: "more", title: "Place Another", next_node_key: "ask_items" },
          { reply_id: "done", title: "All done", next_node_key: "end" },
        ],
      } as SendButtonsNodeConfig,
    },
    {
      node_key: "track_order",
      node_type: "collect_input",
      config: {
        prompt_text: "Enter your order number to track:",
        var_key: "track_order_number",
        next_node_key: "fetch_tracking",
      } satisfies CollectInputNodeConfig,
    },
    {
      node_key: "fetch_tracking",
      node_type: "capability_action",
      config: {
        operation_key: "orders.get",
        input_params: { order_number: "{{vars.track_order_number}}" },
        output_var: "tracking_result",
        next_node_key: "show_tracking",
      } satisfies CapabilityActionNodeConfig,
    },
    {
      node_key: "show_tracking",
      node_type: "send_message",
      config: {
        text: "{{vars.tracking_result.detail}}",
        next_node_key: "end",
      } satisfies SendMessageNodeConfig,
    },
    {
      node_key: "cancel_order",
      node_type: "send_message",
      config: {
        text: "Order cancelled. No worries — just message us when you're ready! 👋",
        next_node_key: "end",
      } satisfies SendMessageNodeConfig,
    },
    {
      node_key: "end",
      node_type: "end",
      config: {},
    },
  ],
};

// ============================================================
// 3. Menu Browse Flow — Restaurant/hotel menu browsing
// ============================================================

const MENU_BROWSE: CapabilityFlowTemplate = {
  slug: "default_menu_browse",
  name: "Menu Browse",
  description: "Interactive menu browsing with categories",
  capability_key: "menu",
  trigger_type: "keyword",
  trigger_config: { keywords: ["food", "drink", "eat", "hungry", "menu", "restaurant"], match_type: "contains" },
  entry_node_id: "start",
  nodes: [
    {
      node_key: "start",
      node_type: "start",
      config: { next_node_key: "show_menu" } satisfies StartNodeConfig,
    },
    {
      node_key: "show_menu",
      node_type: "send_list",
      config: {
        text: "🍽️ Here's what we have today!",
        button_label: "View Menu",
        sections: [
          {
            title: "Categories",
            rows: [
              { reply_id: "all", title: "📋 Full Menu", description: "See everything", next_node_key: "fetch_all" },
              { reply_id: "popular", title: "⭐ Popular", description: "Customer favorites", next_node_key: "fetch_popular" },
              { reply_id: "new", title: "🆕 New Items", description: "Just added", next_node_key: "fetch_new" },
            ],
          },
          {
            title: "Quick Actions",
            rows: [
              { reply_id: "order", title: "🛒 Place Order", description: "Order now", next_node_key: "start_order" },
              { reply_id: "search", title: "🔍 Search", description: "Find specific item", next_node_key: "ask_search" },
            ],
          },
        ],
      } as SendListNodeConfig,
    },
    {
      node_key: "fetch_all",
      node_type: "capability_action",
      config: {
        operation_key: "menu.list",
        input_params: { limit: "10" },
        output_var: "menu_result",
        next_node_key: "show_list",
      } satisfies CapabilityActionNodeConfig,
    },
    {
      node_key: "fetch_popular",
      node_type: "capability_action",
      config: {
        operation_key: "menu.list",
        input_params: { limit: "5" },
        output_var: "menu_result",
        next_node_key: "show_list",
      } satisfies CapabilityActionNodeConfig,
    },
    {
      node_key: "fetch_new",
      node_type: "capability_action",
      config: {
        operation_key: "menu.list",
        input_params: { limit: "5" },
        output_var: "menu_result",
        next_node_key: "show_list",
      } satisfies CapabilityActionNodeConfig,
    },
    {
      node_key: "show_list",
      node_type: "send_message",
      config: {
        text: "{{vars.menu_result.list}}\n\nReply with an item name for details or to order.",
        next_node_key: "wait_for_selection",
      } satisfies SendMessageNodeConfig,
    },
    {
      node_key: "ask_search",
      node_type: "collect_input",
      config: {
        prompt_text: "What are you looking for? Type the item name:",
        var_key: "search_query",
        next_node_key: "search_menu",
      } satisfies CollectInputNodeConfig,
    },
    {
      node_key: "search_menu",
      node_type: "capability_action",
      config: {
        operation_key: "menu.search",
        input_params: { query: "{{vars.search_query}}" },
        output_var: "search_result",
        next_node_key: "show_search",
      } satisfies CapabilityActionNodeConfig,
    },
    {
      node_key: "show_search",
      node_type: "send_message",
      config: {
        text: "{{vars.search_result.list}}\n\nReply with an item name for details.",
        next_node_key: "end",
      } satisfies SendMessageNodeConfig,
    },
    {
      node_key: "wait_for_selection",
      node_type: "collect_input",
      config: {
        prompt_text: "Tell us the item name, or type 'menu' to go back:",
        var_key: "selected_item",
        next_node_key: "get_item_detail",
      } satisfies CollectInputNodeConfig,
    },
    {
      node_key: "get_item_detail",
      node_type: "capability_action",
      config: {
        operation_key: "menu.get",
        input_params: { item_id: "{{vars.selected_item}}" },
        output_var: "item_detail",
        next_node_key: "show_detail",
      } satisfies CapabilityActionNodeConfig,
    },
    {
      node_key: "show_detail",
      node_type: "send_buttons",
      config: {
        text: "{{vars.item_detail.detail}}",
        buttons: [
          { reply_id: "order", title: "🛒 Order This", next_node_key: "start_order" },
          { reply_id: "back", title: "📋 Back to Menu", next_node_key: "show_menu" },
        ],
      } as SendButtonsNodeConfig,
    },
    {
      node_key: "start_order",
      node_type: "send_message",
      config: {
        text: "To order, please tell us: item name, quantity, and any special instructions.",
        next_node_key: "end",
      } satisfies SendMessageNodeConfig,
    },
    {
      node_key: "end",
      node_type: "end",
      config: {},
    },
  ],
};

// ============================================================
// 4. Booking Flow — Check availability & create booking
// ============================================================

const BOOKING_FLOW: CapabilityFlowTemplate = {
  slug: "default_booking_flow",
  name: "Booking Flow",
  description: "Check availability and create a booking",
  capability_key: "bookings",
  trigger_type: "keyword",
  trigger_config: { keywords: ["book", "reserve", "reservation", "availability", "room", "stay"], match_type: "contains" },
  entry_node_id: "start",
  nodes: [
    {
      node_key: "start",
      node_type: "start",
      config: { next_node_key: "ask_dates" } satisfies StartNodeConfig,
    },
    {
      node_key: "ask_dates",
      node_type: "collect_input",
      config: {
        prompt_text: "📅 When would you like to book? Please provide your dates (e.g. Dec 20-25).",
        var_key: "desired_dates",
        next_node_key: "ask_guests",
      } satisfies CollectInputNodeConfig,
    },
    {
      node_key: "ask_guests",
      node_type: "collect_input",
      config: {
        prompt_text: "How many guests?",
        var_key: "guest_count",
        next_node_key: "check_available",
      } satisfies CollectInputNodeConfig,
    },
    {
      node_key: "check_available",
      node_type: "capability_action",
      config: {
        operation_key: "bookings.checkAvailability",
        input_params: {
          start_date: "{{vars.desired_dates}}",
          guests: "{{vars.guest_count}}",
        },
        output_var: "availability",
        next_node_key: "show_availability",
      } satisfies CapabilityActionNodeConfig,
    },
    {
      node_key: "show_availability",
      node_type: "send_buttons",
      config: {
        text: "{{vars.availability.message}}",
        buttons: [
          { reply_id: "book", title: "✅ Book Now", next_node_key: "confirm_booking" },
          { reply_id: "change", title: "📅 Change Dates", next_node_key: "ask_dates" },
          { reply_id: "cancel", title: "❌ Cancel", next_node_key: "end" },
        ],
      } as SendButtonsNodeConfig,
    },
    {
      node_key: "confirm_booking",
      node_type: "capability_action",
      config: {
        operation_key: "bookings.create",
        input_params: {
          start_date: "{{vars.desired_dates}}",
          guests: "{{vars.guest_count}}",
        },
        output_var: "booking_result",
        next_node_key: "show_booking_confirmed",
      } satisfies CapabilityActionNodeConfig,
    },
    {
      node_key: "show_booking_confirmed",
      node_type: "send_message",
      config: {
        text: "{{vars.booking_result.message}}",
        next_node_key: "end",
      } satisfies SendMessageNodeConfig,
    },
    {
      node_key: "end",
      node_type: "end",
      config: {},
    },
  ],
};

// ============================================================
// 5. Course Browse — Education courses
// ============================================================

const COURSE_BROWSE: CapabilityFlowTemplate = {
  slug: "default_course_browse",
  name: "Course Browse",
  description: "Browse and search available courses",
  capability_key: "courses",
  trigger_type: "keyword",
  trigger_config: { keywords: ["course", "class", "training", "learn", "study", "program"], match_type: "contains" },
  entry_node_id: "start",
  nodes: [
    {
      node_key: "start",
      node_type: "start",
      config: { next_node_key: "show_options" } satisfies StartNodeConfig,
    },
    {
      node_key: "show_options",
      node_type: "send_buttons",
      config: {
        text: "📚 What would you like to do?",
        buttons: [
          { reply_id: "browse", title: "📋 Browse Courses", next_node_key: "fetch_courses" },
          { reply_id: "search", title: "🔍 Search", next_node_key: "ask_search" },
        ],
      } as SendButtonsNodeConfig,
    },
    {
      node_key: "fetch_courses",
      node_type: "capability_action",
      config: {
        operation_key: "courses.list",
        input_params: { limit: "10" },
        output_var: "courses_result",
        next_node_key: "show_courses",
      } satisfies CapabilityActionNodeConfig,
    },
    {
      node_key: "show_courses",
      node_type: "send_message",
      config: {
        text: "{{vars.courses_result.list}}\n\nReply with a course name for details.",
        next_node_key: "end",
      } satisfies SendMessageNodeConfig,
    },
    {
      node_key: "ask_search",
      node_type: "collect_input",
      config: {
        prompt_text: "What topic are you interested in?",
        var_key: "search_query",
        next_node_key: "search_courses",
      } satisfies CollectInputNodeConfig,
    },
    {
      node_key: "search_courses",
      node_type: "capability_action",
      config: {
        operation_key: "courses.search",
        input_params: { query: "{{vars.search_query}}" },
        output_var: "search_result",
        next_node_key: "show_search",
      } satisfies CapabilityActionNodeConfig,
    },
    {
      node_key: "show_search",
      node_type: "send_message",
      config: {
        text: "{{vars.search_result.list}}\n\nReply with a course name for details.",
        next_node_key: "end",
      } satisfies SendMessageNodeConfig,
    },
    {
      node_key: "end",
      node_type: "end",
      config: {},
    },
  ],
};

// ============================================================
// 6. Property Browse — Real estate listings
// ============================================================

const PROPERTY_BROWSE: CapabilityFlowTemplate = {
  slug: "default_property_browse",
  name: "Property Browse",
  description: "Browse property listings",
  capability_key: "property_listings",
  trigger_type: "keyword",
  trigger_config: { keywords: ["property", "properties", "house", "apartment", "rent", "real estate"], match_type: "contains" },
  entry_node_id: "start",
  nodes: [
    {
      node_key: "start",
      node_type: "start",
      config: { next_node_key: "show_options" } satisfies StartNodeConfig,
    },
    {
      node_key: "show_options",
      node_type: "send_buttons",
      config: {
        text: "🏠 What are you looking for?",
        buttons: [
          { reply_id: "all", title: "📋 All Properties", next_node_key: "fetch_all" },
          { reply_id: "search", title: "🔍 Search Location", next_node_key: "ask_search" },
        ],
      } as SendButtonsNodeConfig,
    },
    {
      node_key: "fetch_all",
      node_type: "capability_action",
      config: {
        operation_key: "properties.list",
        input_params: { limit: "10" },
        output_var: "properties_result",
        next_node_key: "show_properties",
      } satisfies CapabilityActionNodeConfig,
    },
    {
      node_key: "show_properties",
      node_type: "send_message",
      config: {
        text: "{{vars.properties_result.list}}\n\nReply with a property name for details.",
        next_node_key: "end",
      } satisfies SendMessageNodeConfig,
    },
    {
      node_key: "ask_search",
      node_type: "collect_input",
      config: {
        prompt_text: "Enter a location or keyword to search:",
        var_key: "search_query",
        next_node_key: "search_properties",
      } satisfies CollectInputNodeConfig,
    },
    {
      node_key: "search_properties",
      node_type: "capability_action",
      config: {
        operation_key: "properties.search",
        input_params: { query: "{{vars.search_query}}" },
        output_var: "search_result",
        next_node_key: "show_search",
      } satisfies CapabilityActionNodeConfig,
    },
    {
      node_key: "show_search",
      node_type: "send_message",
      config: {
        text: "{{vars.search_result.list}}\n\nReply with a property name for details.",
        next_node_key: "end",
      } satisfies SendMessageNodeConfig,
    },
    {
      node_key: "end",
      node_type: "end",
      config: {},
    },
  ],
};

// ============================================================
// 7. Service Browse — Service listings
// ============================================================

const SERVICE_BROWSE: CapabilityFlowTemplate = {
  slug: "default_service_browse",
  name: "Service Browse",
  description: "Browse available services",
  capability_key: "services",
  trigger_type: "keyword",
  trigger_config: { keywords: ["service", "services", "help", "assist", "support"], match_type: "contains" },
  entry_node_id: "start",
  nodes: [
    {
      node_key: "start",
      node_type: "start",
      config: { next_node_key: "show_options" } satisfies StartNodeConfig,
    },
    {
      node_key: "show_options",
      node_type: "send_buttons",
      config: {
        text: "🔧 How can we help?",
        buttons: [
          { reply_id: "browse", title: "📋 Our Services", next_node_key: "fetch_services" },
          { reply_id: "search", title: "🔍 Search", next_node_key: "ask_search" },
          { reply_id: "agent", title: "💬 Talk to Agent", next_node_key: "handoff" },
        ],
      } as SendButtonsNodeConfig,
    },
    {
      node_key: "fetch_services",
      node_type: "capability_action",
      config: {
        operation_key: "services.list",
        input_params: { limit: "10" },
        output_var: "services_result",
        next_node_key: "show_services",
      } satisfies CapabilityActionNodeConfig,
    },
    {
      node_key: "show_services",
      node_type: "send_message",
      config: {
        text: "{{vars.services_result.list}}\n\nReply with a service name for details.",
        next_node_key: "end",
      } satisfies SendMessageNodeConfig,
    },
    {
      node_key: "ask_search",
      node_type: "collect_input",
      config: {
        prompt_text: "What service are you looking for?",
        var_key: "search_query",
        next_node_key: "search_services",
      } satisfies CollectInputNodeConfig,
    },
    {
      node_key: "search_services",
      node_type: "capability_action",
      config: {
        operation_key: "services.search",
        input_params: { query: "{{vars.search_query}}" },
        output_var: "search_result",
        next_node_key: "show_search",
      } satisfies CapabilityActionNodeConfig,
    },
    {
      node_key: "show_search",
      node_type: "send_message",
      config: {
        text: "{{vars.search_result.list}}\n\nReply with a service name for details.",
        next_node_key: "end",
      } satisfies SendMessageNodeConfig,
    },
    {
      node_key: "handoff",
      node_type: "handoff",
      config: {
        note: "Customer requested human support from service browse.",
      } as HandoffNodeConfig,
    },
    {
      node_key: "end",
      node_type: "end",
      config: {},
    },
  ],
};

// ============================================================
// 8. Program Browse — NGO/Education programs
// ============================================================

const PROGRAM_BROWSE: CapabilityFlowTemplate = {
  slug: "default_program_browse",
  name: "Program Browse",
  description: "Browse available programs",
  capability_key: "programs",
  trigger_type: "keyword",
  trigger_config: { keywords: ["program", "programs", "initiative", "community"], match_type: "contains" },
  entry_node_id: "start",
  nodes: [
    {
      node_key: "start",
      node_type: "start",
      config: { next_node_key: "fetch_programs" } satisfies StartNodeConfig,
    },
    {
      node_key: "fetch_programs",
      node_type: "capability_action",
      config: {
        operation_key: "programs.list",
        input_params: { limit: "10" },
        output_var: "programs_result",
        next_node_key: "show_programs",
      } satisfies CapabilityActionNodeConfig,
    },
    {
      node_key: "show_programs",
      node_type: "send_message",
      config: {
        text: "{{vars.programs_result.list}}\n\nReply with a program name for details.",
        next_node_key: "end",
      } satisfies SendMessageNodeConfig,
    },
    {
      node_key: "end",
      node_type: "end",
      config: {},
    },
  ],
};

// ============================================================
// Registry
// ============================================================

export const CAPABILITY_FLOW_TEMPLATES: CapabilityFlowTemplate[] = [
  CATALOG_QUICK_REPLY,
  ORDER_CREATION,
  MENU_BROWSE,
  BOOKING_FLOW,
  COURSE_BROWSE,
  PROPERTY_BROWSE,
  SERVICE_BROWSE,
  PROGRAM_BROWSE,
];

/** Get template by slug */
export function getCapabilityTemplate(slug: string): CapabilityFlowTemplate | null {
  return CAPABILITY_FLOW_TEMPLATES.find((t) => t.slug === slug) ?? null;
}

/** Get all templates for a capability */
export function getTemplatesForCapability(capabilityKey: string): CapabilityFlowTemplate[] {
  return CAPABILITY_FLOW_TEMPLATES.filter((t) => t.capability_key === capabilityKey);
}

/** Get all unique capability keys that have templates */
export function getCapabilitiesWithTemplates(): string[] {
  return [...new Set(CAPABILITY_FLOW_TEMPLATES.map((t) => t.capability_key))];
}
