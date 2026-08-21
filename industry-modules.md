# wacrm Industry Modules - Planning Document

> How wacrm supports different business types: Restaurant, Property Manager, Agent, and more.

---

## Table of Contents

1. [Multi-Industry Architecture](#1-multi-industry-architecture)
2. [Core CRM Layer (Shared)](#2-core-crm-layer-shared)
3. [Restaurant Module](#3-restaurant-module)
4. [Property Manager Module](#4-property-manager-module)
5. [Real Estate Agent Module](#5-real-estate-agent-module)
6. [Future Industries](#6-future-industries)
7. [Module Enablement Strategy](#7-module-enablement-strategy)

---

## 1. Multi-Industry Architecture

### Design Philosophy

Each industry module extends the **Core CRM Layer** with industry-specific:

- **Data models** (menu items, properties, listings)
- **WhatsApp flows** (order capture, inquiry handling)
- **UI components** (order management, property cards)
- **Automations** (industry-specific triggers)
- **Custom fields/templates** (industry presets)

### Module Stack

```
┌─────────────────────────────────────────────────────┐
│                   WhatsApp                            │
│         (Customer-facing interface)                   │
└─────────────────────┬───────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────┐
│              Industry Modules                          │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────┐ │
│  │Restaurant│ │ Property │ │  Agent   │ │ Retail │ │
│  │ Ordering │ │ Listings │ │  Deals   │ │  POS   │ │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └───┬────┘ │
│       │            │            │            │       │
│       └────────────┼────────────┴────────────┘       │
│                    │                                  │
└────────────────────▼──────────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────┐
│                 Core CRM Layer                        │
│  Contacts │ Conversations │ Messages │ Broadcasts    │
│  Automations │ Flows │ API v1 │ Webhooks           │
└─────────────────────────────────────────────────────┘
```

---

## 2. Core CRM Layer (Shared)

All industry modules share these core capabilities:

### 2.1 Contact Management
```
Every customer = Contact in CRM
├── Phone (WhatsApp number)
├── Name
├── Tags (industry-specific)
├── Custom Fields (industry-specific)
└── Notes
```

### 2.2 Conversation Management
```
Every WhatsApp chat = Conversation
├── Status: open, pending, closed
├── Assigned Agent
├── Contact
├── Message History
└── Custom Fields
```

### 2.3 Broadcasting
```
Template Messages (Meta-approved)
├── Order Updates (restaurant)
├── New Listings (property)
├── Market Updates (agent)
└── Promotions (all)
```

### 2.4 Automations
```
Triggers:
├── Inbound message (keyword)
├── New contact
├── Scheduled time
├── Contact tag added
└── Flow completion

Actions:
├── Send template
├── Add/remove tag
├── Update custom field
├── Trigger flow
└── Webhook to external
```

### 2.5 Public API
```
All modules accessible via REST API:
├── Create/update contacts
├── Send messages
├── Query orders/listings/deals
└── Webhook integrations
```

---

## 3. Restaurant Module

### 3.1 Overview

Restaurants use wacrm to:
- **Take orders** via WhatsApp (no app needed)
- **Manage menu** and availability
- **Track orders** from placement to delivery
- **Send updates** to customers
- **Handle inquiries** about menu/location

### 3.2 Industry Data Model

```sql
-- Menu categories (optional grouping)
CREATE TABLE restaurant_categories (
  id UUID PRIMARY KEY,
  account_id UUID REFERENCES accounts(id),
  name TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  active BOOLEAN DEFAULT TRUE
);

-- Menu items
CREATE TABLE menu_items (
  id UUID PRIMARY KEY,
  account_id UUID REFERENCES accounts(id),
  category_id UUID REFERENCES restaurant_categories(id),
  name TEXT NOT NULL,
  description TEXT,
  price NUMERIC(10,2) NOT NULL,
  currency TEXT DEFAULT 'USD',
  image_url TEXT,
  available BOOLEAN DEFAULT TRUE,
  variants JSONB,  -- [{name: "Size", options: [{name: "Small", price: 0}, {name: "Large", price: 3}]}]
  add_ons JSONB,   -- [{name: "Extra cheese", price: 1.50}]
  dietary_tags TEXT[],  -- ['vegetarian', 'gluten-free', 'halal']
  active BOOLEAN DEFAULT TRUE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Customer orders
CREATE TABLE orders (
  id UUID PRIMARY KEY,
  account_id UUID REFERENCES accounts(id),
  contact_id UUID REFERENCES contacts(id),
  conversation_id UUID REFERENCES conversations(id),
  order_number TEXT NOT NULL,  -- Human readable: "ORD-001"
  status TEXT DEFAULT 'pending'
    CHECK (status IN (
      'pending',      -- Received, awaiting confirmation
      'confirmed',    -- Kitchen acknowledged
      'preparing',    -- Being prepared
      'ready',        -- Ready for pickup/delivery
      'delivered',    -- Completed
      'cancelled'     -- Cancelled
    )),
  order_type TEXT DEFAULT 'delivery'
    CHECK (order_type IN ('delivery', 'pickup', 'dine_in')),
  delivery_address TEXT,
  items JSONB NOT NULL,  -- [{item_id, name, quantity, price, variants, add_ons, subtotal}]
  subtotal NUMERIC(10,2) NOT NULL,
  delivery_fee NUMERIC(10,2) DEFAULT 0,
  tax NUMERIC(10,2) DEFAULT 0,
  total NUMERIC(10,2) NOT NULL,
  customer_notes TEXT,
  kitchen_notes TEXT,
  estimated_ready_time TIMESTAMPTZ,
  confirmed_at TIMESTAMPTZ,
  ready_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Order status history (audit trail)
CREATE TABLE order_status_history (
  id UUID PRIMARY KEY,
  order_id UUID REFERENCES orders(id),
  status TEXT NOT NULL,
  changed_by UUID REFERENCES auth.users(id),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Restaurant settings per tenant
CREATE TABLE restaurant_settings (
  account_id UUID PRIMARY KEY REFERENCES accounts(id),
  restaurant_name TEXT,
  logo_url TEXT,
  currency TEXT DEFAULT 'USD',
  default_order_type TEXT DEFAULT 'delivery',
  delivery_fee NUMERIC(10,2) DEFAULT 0,
  minimum_order NUMERIC(10,2) DEFAULT 0,
  estimated_prep_time_minutes INTEGER DEFAULT 30,
  auto_confirm_orders BOOLEAN DEFAULT FALSE,
  send_order_updates BOOLEAN DEFAULT TRUE,
  business_hours JSONB,  -- {monday: {open: "09:00", close: "22:00"}, ...}
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 3.3 WhatsApp Flow: Order Capture

```
CUSTOMER                         RESTAURANT CRM
    │                                    │
    │  "Hi, I'd like to order"          │
    │ ─────────────────────────────────►│
    │                                    │
    │  [Automation: keyword "order"]    │
    │                                    │
    │  "Sure! What would you like?"      │
    │ ◄─────────────────────────────────│
    │                                    │
    │  "Large pepperoni pizza and       │
    │   a small coke"                   │
    │ ─────────────────────────────────►│
    │                                    │
    │  [Flow: Parse order items]        │
    │  [Flow: Validate items exist]     │
    │                                    │
    │  "I have:                         │
    │   1x Large Pepperoni Pizza - $18  │
    │   1x Small Coke - $3              │
    │   Total: $21                      │
    │                                    │
    │   Delivery to: [address?]"         │
    │ ◄─────────────────────────────────│
    │                                    │
    │  "123 Main St"                    │
    │ ─────────────────────────────────►│
    │                                    │
    │  [Flow: Create order]              │
    │  [Status: pending]                │
    │                                    │
    │  "Order #ORD-001 received!         │
    │   Estimated ready: 30 mins         │
    │   We'll text you when ready."     │
    │ ◄─────────────────────────────────│
    │                                    │
    │  [Kitchen sees order in CRM]       │
    │                                    │
    │  [Staff updates: confirmed]        │
    │                                    │
    │  "Your order has been confirmed!"  │
    │ ◄─────────────────────────────────│
    │                                    │
    │  [Staff updates: preparing]        │
    │                                    │
    │  "Your order is being prepared"   │
    │ ◄─────────────────────────────────│
    │                                    │
    │  [Staff updates: ready]           │
    │                                    │
    │  "Your order is ready! 🍕"        │
    │ ◄─────────────────────────────────│
```

### 3.4 WhatsApp Flow: Menu Browsing (Interactive)

```
CUSTOMER                         RESTAURANT CRM
    │                                    │
    │  "Show me the menu"                │
    │ ─────────────────────────────────►│
    │                                    │
    │  [Flow: Generate interactive menu] │
    │                                    │
    │  [Interactive List]                │
    │  "🍕 Main Menu"                    │
    │                                    │
    │  Section 1: Pizza                  │
    │    • Pepperoni - $18              │
    │    • Margherita - $16             │
    │    • BBQ Chicken - $19            │
    │                                    │
    │  Section 2: Drinks                │
    │    • Coke - $3                    │
    │    • Sprite - $3                  │
    │                                    │
    │  Section 3: Sides                 │
    │    • Garlic Bread - $6            │
    │    • Wings - $10                  │
    │ ◄─────────────────────────────────│
    │                                    │
    │  [Customer selects "Pepperoni"]    │
    │  "1"                              │
    │ ─────────────────────────────────►│
    │                                    │
    │  [Flow: Ask for variants]          │
    │                                    │
    │  "What size?"                     │
    │  [Interactive Buttons]            │
    │  "Small (+$0)  Large (+$3)"       │
    │ ◄─────────────────────────────────│
    │                                    │
    │  "Large"                          │
    │ ─────────────────────────────────►│
    │                                    │
    │  "Any add-ons?"                    │
    │  [Interactive Buttons]            │
    │  "Extra cheese (+$2)               │
    │   None"                           │
    │ ◄─────────────────────────────────│
    │                                    │
    │  "Extra cheese please"            │
    │ ─────────────────────────────────►│
    │                                    │
    │  "Added to order. Anything else?" │
    │  [Interactive Buttons]             │
    │  "Add more items                  │
    │   Done - checkout"                │
    │ ◄─────────────────────────────────│
    │                                    │
    │  "Done - checkout"                │
    │ ─────────────────────────────────►│
    │                                    │
    │  [Flow: Show cart summary]        │
    │  [Flow: Ask for delivery address] │
    │  [Flow: Create order]              │
```

### 3.5 Core CRM Usage for Restaurants

| Feature | Usage |
|---------|-------|
| **Contacts** | Customers with tags: `first-time`, `vip`, `large-order` |
| **Custom Fields** | `favorite_item`, `dietary_restrictions`, `delivery_address` |
| **Tags** | `VIP`, `large-order`, `late-night`, `complaint` |
| **Conversations** | Per-customer order chat |
| **Messages** | Order confirmations, status updates |
| **Broadcasts** | Daily specials, promos, hours changes |
| **Automations** | Order confirmation, ready notification, feedback request |
| **Flows** | Menu interaction, order capture, status updates |
| **Templates** | `order_confirmed`, `order_ready`, `feedback_request` |

### 3.6 Restaurant Dashboard View

```
┌─────────────────────────────────────────────────────────┐
│  🍕 Restaurant Dashboard                                 │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────┐│
│  │ Pending  │  │Preparing │  │  Ready   │  │ Today's ││
│  │    5     │  │    3     │  │    2     │  │ Orders ││
│  │          │  │          │  │          │  │   47   ││
│  └──────────┘  └──────────┘  └──────────┘  └────────┘│
│                                                         │
│  Active Orders                                         │
│  ┌─────────────────────────────────────────────────┐  │
│  │ #001  John D.   Pepperoni Pizza (Large)         │  │
│  │       Status: Preparing    Time: 12 min         │  │
│  │       [Update ▼]                                │  │
│  ├─────────────────────────────────────────────────┤  │
│  │ #002  Sarah M.   2x Margherita, 1x Coke        │  │
│  │       Status: Ready         Time: 8 min        │  │
│  │       [Update ▼]                                │  │
│  ├─────────────────────────────────────────────────┤  │
│  │ #003  Mike R.   Chicken Wings, Garlic Bread    │  │
│  │       Status: Pending       Time: 1 min        │  │
│  │       [Update ▼]                                │  │
│  └─────────────────────────────────────────────────┘  │
│                                                         │
│  Menu Management                                        │
│  ┌─────────────────────────────────────────────────┐  │
│  │ [+ Add Item]  [Categories]  [Unavailable Items] │  │
│  └─────────────────────────────────────────────────┘  │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## 4. Property Manager Module

### 4.1 Overview

Property managers use wacrm to:
- **Broadcast listings** to leads/customers
- **Track inquiries** from WhatsApp
- **Schedule viewings** via chat
- **Manage tenant communication**
- **Send rent reminders** and notices

### 4.2 Industry Data Model

```sql
-- Property listings
CREATE TABLE properties (
  id UUID PRIMARY KEY,
  account_id UUID REFERENCES accounts(id),
  
  -- Basic info
  title TEXT NOT NULL,
  description TEXT,
  property_type TEXT
    CHECK (property_type IN (
      'apartment', 'house', 'condo', 
      'townhouse', 'commercial', 'land', 'room'
    )),
  status TEXT DEFAULT 'available'
    CHECK (status IN ('available', 'pending', 'rented', 'sold', 'unavailable')),
  
  -- Location
  address_line TEXT NOT NULL,
  city TEXT NOT NULL,
  state TEXT,
  zip_code TEXT,
  neighborhood TEXT,
  coordinates JSONB,  -- {lat: 40.7128, lng: -74.0060}
  
  -- Details
  bedrooms INTEGER,
  bathrooms NUMERIC(3,1),
  square_feet INTEGER,
  lot_size_sqft INTEGER,
  year_built INTEGER,
  parking_spaces INTEGER,
  
  -- Pricing
  price NUMERIC(12,2),  -- For sale
  rental_price NUMERIC(12,2),  -- For rent
  security_deposit NUMERIC(12,2),
  pet_policy TEXT,
  
  -- Media
  images JSONB,  -- [{url: "...", caption: "Living room"}]
  video_url TEXT,
  virtual_tour_url TEXT,
  
  -- Features
  amenities TEXT[],  -- ['pool', 'gym', 'parking', 'laundry']
  furnished BOOLEAN DEFAULT FALSE,
  utilities_included TEXT[],  -- ['water', 'trash', 'heat']
  
  -- Availability
  available_date DATE,
  showing_instructions TEXT,
  
  -- Metadata
  listed_by UUID REFERENCES contacts(id),  -- Owner/landlord if external
  source TEXT,  -- 'manual', 'api', 'zillow_import'
  external_id TEXT,  -- External system ID if synced
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Property inquiries (from WhatsApp or website)
CREATE TABLE property_inquiries (
  id UUID PRIMARY KEY,
  account_id UUID REFERENCES accounts(id),
  property_id UUID REFERENCES properties(id),
  contact_id UUID REFERENCES contacts(id),
  conversation_id UUID REFERENCES conversations(id),
  
  inquiry_type TEXT
    CHECK (inquiry_type IN (
      'viewing', 'info', 'application', 
      'pricing', 'availability', 'other'
    )),
  message TEXT,
  preferred_contact_method TEXT DEFAULT 'whatsapp',
  
  status TEXT DEFAULT 'new'
    CHECK (status IN (
      'new', 'contacted', 'qualified', 
      'viewing_scheduled', 'application_sent', 
      'approved', 'rejected', 'closed'
    )),
  
  source TEXT,  -- 'whatsapp', 'website', 'referral', 'api'
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  
  assigned_agent_id UUID REFERENCES auth.users(id),
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Scheduled property viewings
CREATE TABLE property_viewings (
  id UUID PRIMARY KEY,
  account_id UUID REFERENCES accounts(id),
  property_id UUID REFERENCES properties(id),
  contact_id UUID REFERENCES contacts(id),
  inquiry_id UUID REFERENCES property_inquiries(id),
  conversation_id UUID REFERENCES conversations(id),
  
  scheduled_at TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER DEFAULT 30,
  
  status TEXT DEFAULT 'scheduled'
    CHECK (status IN (
      'scheduled', 'confirmed', 'completed', 
      'cancelled', 'no_show', 'rescheduled'
    )),
  
  confirmed_by_tenant BOOLEAN DEFAULT FALSE,
  confirmed_by_agent BOOLEAN DEFAULT FALSE,
  
  notes TEXT,
  feedback TEXT,  -- Agent notes after viewing
  outcome TEXT,  -- 'interested', 'not_interested', 'pending'
  
  reminder_sent BOOLEAN DEFAULT FALSE,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Property manager settings
CREATE TABLE property_manager_settings (
  account_id UUID PRIMARY KEY REFERENCES accounts(id),
  company_name TEXT,
  logo_url TEXT,
  default_viewing_duration INTEGER DEFAULT 30,
  auto_confirm_viewings BOOLEAN DEFAULT FALSE,
  send_reminders_hours_before INTEGER DEFAULT 24,
  inquiry_response_template TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 4.3 WhatsApp Flow: Listing Broadcast

```
PROPERTY MANAGER                                    TENANTS/LEADS
    │                                                    │
    │  [Creates/updates property in CRM]                │
    │                                                    │
    │  [Selects: Broadcast to all contacts with tag      │
    │   "looking-for-property" or specific list]        │
    │                                                    │
    │  "New Listing! 2BR Apartment Downtown"            │
    │  [$2,500/mo | 2BR/2BA | 1200 sqft]"              │
    │  [Image attached]                                 │
    │ ─────────────────────────────────────────────────►│
    │                                                    │
    │  Interested: "I'm interested!"                     │
    │ ◄─────────────────────────────────────────────────│
    │                                                    │
    │  [Flow: Tag contact, create inquiry]               │
    │                                                    │
    │  "Great! This unit has:                            │
    │   - In-unit laundry                               │
    │   - Parking included                              │
    │   - Pet-friendly                                  │
    │                                                   │
    │   Would you like to schedule a viewing?"          │
    │ ◄─────────────────────────────────────────────────│
    │                                                    │
    │  "Yes, tomorrow at 2pm?"                          │
    │ ─────────────────────────────────────────────────►│
    │                                                    │
    │  [Flow: Check availability]                       │
    │  "Tomorrow 2pm works! I'll send a calendar invite."│
    │ ◄─────────────────────────────────────────────────│
    │                                                    │
    │  [Creates property_viewing record]                 │
    │  [Sends confirmation message]                     │
    │  "Viewing confirmed for tomorrow 2pm at           │
    │   123 Main St, Unit 4B"                           │
    │ ◄─────────────────────────────────────────────────│
    │                                                    │
    │  [Reminder 24hrs before]                          │
    │  "Reminder: Viewing tomorrow at 2pm. Address:      │
    │   123 Main St, Unit 4B. Reply CANCEL to cancel."  │
    │ ◄─────────────────────────────────────────────────│
```

### 4.4 WhatsApp Flow: Inquiry Handling

```
CUSTOMER                         PROPERTY MANAGER CRM
    │                                    │
    │  "Hi, is the apartment at 123      │
    │   Main St still available?"       │
    │ ─────────────────────────────────►│
    │                                    │
    │  [Flow: Search property by address] │
    │  [Contact exists or is created]    │
    │                                    │
    │  "Yes, it is! It's a 2BR/2BA      │
    │   at $2,500/month. Want more info?"│
    │ ◄─────────────────────────────────│
    │                                    │
    │  "Yes please, pets allowed?"       │
    │ ─────────────────────────────────►│
    │                                    │
    │  [Lookup property details]         │
    │                                    │
    │  "Yes! We allow cats and dogs.     │
    │   $50/month pet rent, $200 deposit│
    │                                    │
    │   Would you like to schedule a     │
    │   viewing or receive the full     │
    │   application?"                   │
    │ ◄─────────────────────────────────│
    │                                    │
    │  "Let's do a viewing"              │
    │ ─────────────────────────────────►│
    │                                    │
    │  [Flow: Check calendar, propose    │
    │   available slots]                │
    │                                    │
    │  "I have openings:                │
    │   Mon 2pm, Tue 10am, Wed 4pm      │
    │   Which works for you?"            │
    │ ◄─────────────────────────────────│
    │                                    │
    │  "Tuesday 10am"                   │
    │ ─────────────────────────────────►│
    │                                    │
    │  [Create viewing record]           │
    │                                    │
    │  "Confirmed! Tuesday 10am.        │
    │   Address: 123 Main St, Unit 4B   │
    │   Ask for John when you arrive."   │
    │ ◄─────────────────────────────────│
    │                                    │
    │  [Tag: viewing-scheduled]          │
    │  [Assigned to agent]              │
    │  [Calendar event created]          │
```

### 4.5 Core CRM Usage for Property Managers

| Feature | Usage |
|---------|-------|
| **Contacts** | Leads, tenants, owners, vendors with tags: `lead`, `applicant`, `tenant`, `owner` |
| **Custom Fields** | `budget`, `desired_move_in`, `property_type_preference`, `bedrooms_needed` |
| **Tags** | `looking-for-2br`, `viewing-scheduled`, `application-submitted`, `rent-overdue` |
| **Conversations** | Per-inquiry chat threads |
| **Messages** | Listing broadcasts, rent reminders, notices |
| **Broadcasts** | New listings, price drops, open house announcements |
| **Automations** | Rent reminders (3 days before due), follow-up after viewing |
| **Flows** | Inquiry qualification, viewing scheduling, application process |
| **Templates** | `listing_broadcast`, `viewing_confirmation`, `rent_reminder`, `notice` |

### 4.6 Property Dashboard View

```
┌─────────────────────────────────────────────────────────┐
│  🏠 Property Manager Dashboard                          │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────┐│
│  │ Active  │  │ Pending  │  │Viewings │  │ This   ││
│  │ Listings │  │Inquiries │  │  Today  │  │ Month  ││
│  │   12     │  │    8     │  │    5    │  │   23   ││
│  └──────────┘  └──────────┘  └──────────┘  └────────┘│
│                                                         │
│  Active Listings          [+ Add Property]              │
│  ┌─────────────────────────────────────────────────┐  │
│  │ 🏠 123 Main St, Unit 4B                        │  │
│  │     2BR/2BA | $2,500/mo | Available Now       │  │
│  │     [Edit] [Mark Unavailable] [Broadcast]     │  │
│  ├─────────────────────────────────────────────────┤  │
│  │ 🏠 456 Oak Ave                                 │  │
│  │     1BR/1BA | $1,800/mo | Available Dec 1     │  │
│  │     [Edit] [Mark Unavailable] [Broadcast]     │  │
│  └─────────────────────────────────────────────────┘  │
│                                                         │
│  Today's Viewings                                        │
│  ┌─────────────────────────────────────────────────┐  │
│  │ 10:00 AM  John D.     123 Main St, Unit 4B   │  │
│  │          Status: Confirmed    [Complete]      │  │
│  ├─────────────────────────────────────────────────┤  │
│  │ 2:00 PM   Sarah M.    456 Oak Ave            │  │
│  │          Status: Scheduled   [Complete]      │  │
│  └─────────────────────────────────────────────────┘  │
│                                                         │
│  Recent Inquiries                                        │
│  ┌─────────────────────────────────────────────────┐  │
│  │ Mike R.   "Is 123 Main St available?"  NEW    │  │
│  │ Lisa K.   "Pet policy?"                 NEW    │  │
│  │ Tom B.    "Schedule viewing"            NEW    │  │
│  └─────────────────────────────────────────────────┘  │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## 5. Real Estate Agent Module

### 5.1 Overview

Real estate agents use wacrm as:
- **Lead management** (inquiries from all sources)
- **Deal pipeline** (Kanban: Inquiry → Viewing → Offer → Closed)
- **Client communication** via WhatsApp
- **Property matching** (based on client preferences)
- **Automated follow-ups** (reminders, market updates)

### 5.2 Industry Data Model

```sql
-- Agent's own listings (can be synced from MLS or manual)
CREATE TABLE agent_listings (
  id UUID PRIMARY KEY,
  account_id UUID REFERENCES accounts(id),
  contact_id UUID REFERENCES contacts(id),  -- Seller/owner
  
  -- Listing details
  title TEXT NOT NULL,
  description TEXT,
  property_type TEXT
    CHECK (property_type IN (
      'single_family', 'condo', 'townhouse',
      'multi_family', 'land', 'commercial'
    )),
  status TEXT DEFAULT 'active'
    CHECK (status IN (
      'active', 'pending', 'sold', 
      'withdrawn', 'expired', 'archived'
    )),
  
  -- Location
  address_line TEXT NOT NULL,
  city TEXT NOT NULL,
  state TEXT,
  zip_code TEXT,
  
  -- Pricing
  list_price NUMERIC(12,2) NOT NULL,
  selling_price NUMERIC(12,2),
  commission_rate NUMERIC(5,2),  -- Percentage
  commission_amount NUMERIC(12,2),
  
  -- Property details
  bedrooms INTEGER,
  bathrooms NUMERIC(3,1),
  square_feet INTEGER,
  lot_size_sqft INTEGER,
  year_built INTEGER,
  parking_spaces INTEGER,
  
  -- Media
  images JSONB,
  video_url TEXT,
  virtual_tour TEXT,
  
  -- Dates
  list_date DATE,
  contract_date DATE,
  closing_date DATE,
  available_date DATE,
  
  -- External
  mls_number TEXT,
  source TEXT,  -- 'mls', 'fsbo', 'referral', 'manual'
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Agent's leads/potential buyers
CREATE TABLE agent_leads (
  id UUID PRIMARY KEY,
  account_id UUID REFERENCES accounts(id),
  contact_id UUID REFERENCES contacts(id),
  conversation_id UUID REFERENCES conversations(id),
  
  -- Lead info
  source TEXT,  -- 'website', 'referral', 'zillow', 'realtor.com', 'walk_in', 'whatsapp'
  lead_type TEXT DEFAULT 'buyer'
    CHECK (lead_type IN ('buyer', 'seller', 'investor', 'renter')),
  
  -- Preferences
  budget_min NUMERIC(12,2),
  budget_max NUMERIC(12,2),
  preferred_locations TEXT[],
  property_types TEXT[],
  bedrooms_min INTEGER,
  bedrooms_max INTEGER,
  move_in_timeline DATE,
  
  -- Pipeline
  pipeline_stage TEXT DEFAULT 'inquiry'
    CHECK (pipeline_stage IN (
      'inquiry', 'qualified', 'viewing_scheduled',
      'viewed', 'offer_made', 'negotiating',
      'under_contract', 'closed', 'lost'
    )),
  
  -- Lead score (for prioritization)
  lead_score INTEGER DEFAULT 50,  -- 0-100
  lead_score_reasons TEXT[],  -- ['budget_match', 'motivated', 'viewed_3x']
  
  -- Assigned agent
  assigned_agent_id UUID REFERENCES auth.users(id),
  
  -- Status
  status TEXT DEFAULT 'active'
    CHECK (status IN ('active', 'follow_up', 'nurturing', 'converted', 'lost')),
  
  last_contacted_at TIMESTAMPTZ,
  next_follow_up_at TIMESTAMPTZ,
  
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Viewing history for lead
CREATE TABLE lead_viewings (
  id UUID PRIMARY KEY,
  account_id UUID REFERENCES accounts(id),
  lead_id UUID REFERENCES agent_leads(id),
  listing_id UUID REFERENCES agent_listings(id),
  viewing_date TIMESTAMPTZ NOT NULL,
  feedback TEXT,  -- Lead's feedback
  outcome TEXT CHECK (outcome IN ('interested', 'not_interested', 'neutral')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Offers made
CREATE TABLE agent_offers (
  id UUID PRIMARY KEY,
  account_id UUID REFERENCES accounts(id),
  lead_id UUID REFERENCES agent_leads(id),
  listing_id UUID REFERENCES agent_listings(id),
  
  offer_price NUMERIC(12,2) NOT NULL,
  earnest_money NUMERIC(12,2),
  proposed_closing_date DATE,
  contingencies TEXT[],
  offer_letter_url TEXT,
  
  status TEXT DEFAULT 'pending'
    CHECK (status IN (
      'pending', 'accepted', 'rejected',
      'countered', 'withdrawn'
    )),
  
  response_date TIMESTAMPTZ,
  response_notes TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Agent settings
CREATE TABLE agent_settings (
  account_id UUID PRIMARY KEY REFERENCES accounts(id),
  agent_name TEXT,
  brokerage_name TEXT,
  license_number TEXT,
  logo_url TEXT,
  default_follow_up_days INTEGER DEFAULT 3,
  auto_lead_scoring BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 5.3 WhatsApp Flow: New Lead Inquiry

```
CUSTOMER                            AGENT CRM
    │                                  │
    │  "Hi, I saw your listing at      │
    │   789 Pine St. Is it still      │
    │   available?"                   │
    │ ───────────────────────────────►│
    │                                  │
    │  [Flow: Search listing]          │
    │  [Lead created or updated]       │
    │                                  │
    │  "Hi! Yes, 789 Pine St is still │
    │   available. It's a 3BR/2BA    │
    │   single family home at         │
    │   $450,000. Would you like      │
    │   more details or schedule     │
    │   a viewing?"                   │
    │ ◄───────────────────────────────│
    │                                  │
    │  "Yes, I can do Saturday        │
    │   afternoon"                    │
    │ ───────────────────────────────►│
    │                                  │
    │  [Check calendar, propose time] │
    │                                  │
    │  "I have 2pm or 4pm available   │
    │   Saturday. Which works?"       │
    │ ◄───────────────────────────────│
    │                                  │
    │  "2pm is good"                  │
    │ ───────────────────────────────►│
    │                                  │
    │  [Create lead_viewings record]   │
    │  [Update pipeline: viewing_sched]│
    │                                  │
    │  "Confirmed for Saturday 2pm    │
    │   at 789 Pine St. I'll send    │
    │   you the address and my        │
    │   contact. See you then!"       │
    │ ◄───────────────────────────────│
    │                                  │
    │  [Lead score updated]            │
    │  [Follow-up reminder set]        │
```

### 5.4 Core CRM Usage for Agents

| Feature | Usage |
|---------|-------|
| **Contacts** | Buyers, sellers, past clients with tags: `buyer`, `seller`, `investor`, `past-client` |
| **Custom Fields** | `budget`, `preferred_locations`, `property_type`, `timeline` |
| **Tags** | `hot-lead`, `first-time-buyer`, `investor`, `viewing-scheduled` |
| **Pipelines** | **Use existing Kanban** with stages: Inquiry → Qualified → Viewing → Offer → Closed |
| **Conversations** | Per-lead chat history |
| **Messages** | Property matches, viewing confirmations, market updates |
| **Broadcasts** | New listings matching client preferences, market reports |
| **Automations** | Follow-up reminders, new listing alerts to matching leads |
| **Flows** | Lead qualification, viewing scheduling, offer process |
| **Templates** | `listing_match`, `viewing_confirmed`, `offer_update`, `market_report` |

### 5.5 Agent Dashboard View

```
┌─────────────────────────────────────────────────────────┐
│  🏡 Real Estate Agent Dashboard                         │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────┐│
│  │ Active  │  │ Pipeline │  │Viewings │  │Closed  ││
│  │  Leads  │  │   Value  │  │  Today  │  │  This  ││
│  │   15     │  │ $2.1M   │  │    3    │  │ Month  ││
│  └──────────┘  └──────────┘  └──────────┘  │   2    ││
│                                             └────────┘│
│  Lead Pipeline (Kanban)                              │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌───────┐│
│  │Inquiry │ │Qualified│ │ Viewing│ │ Offer │ │Closed ││
│  │  (5)   │ │  (4)    │ │  (3)  │ │  (2)  │ │  (1)  ││
│  ├────────┤ ├────────┤ ├────────┤ ├────────┤ ├───────┤│
│  │ Mike R.│ │Sarah K.│ │John D.│ │Lisa M.│ │Tom B. ││
│  │ $400K   │ │$500K   │ │$350K  │ │$600K  │ │$450K  ││
│  │[Lead ▼]│ │[Lead ▼]│ │[Lead ▼]│ │[Lead ▼]│ │[Lead▼]││
│  └────────┘ └────────┘ └────────┘ └────────┘ └───────┘│
│                                                         │
│  Today's Schedule                                        │
│  ┌─────────────────────────────────────────────────┐  │
│  │ 2:00 PM  John D.     789 Pine St (Viewing)    │  │
│  │ 4:30 PM  Sarah K.    Follow-up call           │  │
│  └─────────────────────────────────────────────────┘  │
│                                                         │
│  My Listings                                    [+ Add] │
│  ┌─────────────────────────────────────────────────┐  │
│  │ 🏠 789 Pine St      3BR/2BA  $450,000  Active │  │
│  │ 🏠 321 Oak Ave      2BR/2BA  $325,000  Pending │  │
│  └─────────────────────────────────────────────────┘  │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## 6. Future Industries

### 6.1 Retail / Point of Sale

```sql
-- Products
-- Orders
-- Inventory tracking
-- Loyalty program

-- WhatsApp Flow:
-- Customer messages "I want to order [product]"
-- Flow captures order, applies loyalty points
-- Staff fulfills, sends pickup notification
```

### 6.2 Appointment-Based Businesses (Salon, Spa, etc.)

```sql
-- Services offered
-- Appointment bookings
-- Staff/calendar
-- Service packages

-- WhatsApp Flow:
-- Customer: "I'd like to book a haircut"
-- Flow: Show available times
-- Customer selects time
-- Appointment confirmed
-- Reminder sent before appointment
```

### 6.3 Service Businesses (Plumber, Electrician, etc.)

```sql
-- Service requests
-- Job tickets
-- Service areas
-- Technician scheduling

-- WhatsApp Flow:
-- Customer submits service request
-- Dispatch assigns technician
-- Customer receives ETA
-- Job completed notification
```

### 6.4 Healthcare / Telehealth

```sql
-- Patient records
-- Appointment scheduling
-- Prescription refills
-- Lab results delivery

-- WhatsApp Flow:
-- Appointment reminders
-- Lab result notifications
-- Prescription ready alerts
```

### 6.5 Automotive (Dealers, Service Centers)

```sql
-- Vehicle inventory
-- Service appointments
-- Test drive requests
-- Service status updates

-- WhatsApp Flow:
-- "I want to service my Honda"
-- Capture vehicle info, schedule appointment
-- Send loaner car ETA, service completion
```

---

## 7. Module Enablement Strategy

### 7.1 Tenant Settings for Module Control

```sql
-- Add to tenant_settings table
ALTER TABLE tenant_settings ADD COLUMN IF NOT EXISTS
  enabled_modules TEXT[] DEFAULT ARRAY['crm'];  -- ['crm', 'restaurant', 'property_manager', 'agent']
```

### 7.2 Module Hierarchy

```
Plan: Starter
└── CRM (contacts, conversations, messages, broadcasts, automations)

Plan: Professional
├── CRM
└── + Restaurant OR Property Manager OR Agent (pick one)

Plan: Enterprise
├── CRM
└── + All modules enabled
```

### 7.3 Industry Template Selection

On workspace creation, user selects industry:

```
┌─────────────────────────────────────────┐
│  What type of business do you run?       │
│                                          │
│  🍕 Restaurant / Food Service            │
│  🏠 Property Management                  │
│  🏡 Real Estate Agent                    │
│  🛒 Retail / Point of Sale               │
│  💼 Service Business                     │
│  🏥 Healthcare                           │
│  🚗 Automotive                           │
│  📋 General CRM (default)                │
│                                          │
│  [This sets up recommended fields,       │
│   pipelines, and sample automations]     │
└─────────────────────────────────────────┘
```

### 7.4 Migration Path for Existing Tenants

Existing tenants can enable industry modules later:

```
Settings → Modules → Enable "Restaurant Ordering"
```

This adds:
- New menu tables
- Restaurant-specific flows
- Order management UI
- Existing data preserved

---

## Summary

| Industry | Core Data | WhatsApp Flow | Dashboard Focus |
|----------|----------|---------------|-----------------|
| **Restaurant** | Menu items, Orders | Order capture, Status updates | Active orders queue |
| **Property Manager** | Properties, Viewings, Inquiries | Listing broadcast, Inquiry handling | Listings + Viewings |
| **Agent** | Listings, Leads, Offers | Lead qualification, Offer process | Pipeline Kanban + Leads |
| **Retail** | Products, Inventory | Order capture, Loyalty | Orders + Inventory |
| **Appointments** | Services, Bookings | Scheduling, Reminders | Calendar + Bookings |
| **Services** | Jobs, Technicians | Request handling, ETA | Job tickets + Schedule |

All industries share the **Core CRM Layer** - contacts, conversations, messages, broadcasts, and automations work the same way. The industry modules add specialized data models, WhatsApp flows, and dashboard views on top.

---

*Last updated: August 2026*
