# tijwa-crm — Project Documentation

> **CRM template for WhatsApp** — shared inbox, contacts,
> sales pipelines, broadcasts, and no-code automations. Built on Next.js 16
> and Supabase.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Tech Stack](#2-tech-stack)
3. [Project Structure](#3-project-structure)
4. [Database Schema](#4-database-schema)
5. [Authentication & Authorization](#5-authentication--authorization)
6. [Core Modules](#6-core-modules)
   - [6.1 Inbox](#61-inbox)
   - [6.2 Contacts](#62-contacts)
   - [6.3 Sales Pipelines](#63-sales-pipelines)
   - [6.4 Broadcasts](#64-broadcasts)
   - [6.5 Automations](#65-automations)
   - [6.6 Flows (Visual Automation Builder)](#66-flows-visual-automation-builder)
7. [WhatsApp Integration](#7-whatsapp-integration)
8. [AI Reply Assistant](#8-ai-reply-assistant)
9. [API Layer](#9-api-layer)
10. [MCP Server](#10-mcp-server)
11. [Dashboard & UI Components](#11-dashboard--ui-components)
12. [Webhooks System](#12-webhooks-system)
13. [Security](#13-security)
14. [Configuration & Environment](#14-configuration--environment)
15. [Development Workflow](#15-development-workflow)
16. [Deployment](#16-deployment)

---

## 1. Project Overview

**tijwa-crm** is a template/starting point for building a WhatsApp CRM. It provides:

- **Shared inbox** on the official WhatsApp Business API — multiple agents working one number
- **Contacts + tags + custom fields**, CSV import, deduplication
- **Sales pipelines** (Kanban) with deals linked to conversations
- **Broadcasts** with Meta-approved templates, delivery + read tracking
- **No-code automations** — triggers on inbound messages, keywords, or schedule
- **AI reply assistant** — OpenAI/Anthropic integration with knowledge base
- **Real-time dashboard** — response times, daily volume, pipeline value
- **Team accounts** — invite teammates by link, role-based access
- **Public REST API** (`/api/v1`) with scoped, revocable API keys
- **MCP server** — drive the CRM from Claude, Cursor, and other AI assistants

This is a **template**, not a product. You fork it and customize it for your needs.

---

## 2. Tech Stack

| Layer | Technology |
|-------|------------|
| **App Framework** | Next.js 16 (App Router, React 19, TypeScript) |
| **Styling** | Tailwind CSS v4, CSS variables for theming |
| **Data** | Supabase (Postgres + Auth + Storage + RLS) |
| **WhatsApp** | Meta Cloud API (official WhatsApp Business API) |
| **AI** | OpenAI / Anthropic (bring your own key) |
| **Charts** | Recharts |
| **UI Components** | shadcn/ui derivatives + custom components |
| **Flow Builder** | @xyflow/react (React Flow) + dagre for layout |
| **i18n** | next-intl |
| **Testing** | Vitest |
| **Linting** | ESLint + Prettier |

---

## 3. Project Structure

```
tijwa-crm/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── (auth)/            # Auth pages (login, signup, forgot-password)
│   │   │   ├── login/
│   │   │   ├── signup/
│   │   │   └── forgot-password/
│   │   ├── (dashboard)/       # Authenticated app pages
│   │   │   ├── inbox/         # Message inbox
│   │   │   ├── contacts/      # Contact management
│   │   │   ├── pipelines/     # Sales pipelines (Kanban)
│   │   │   ├── broadcasts/     # Broadcast campaigns
│   │   │   ├── automations/    # Simple automations
│   │   │   ├── flows/          # Visual flow builder
│   │   │   ├── dashboard/      # Analytics dashboard
│   │   │   ├── settings/       # Account settings
│   │   │   ├── agents/         # Team management
│   │   │   ├── notifications/   # Notification center
│   │   │   └── layout.tsx       # Dashboard layout wrapper
│   │   ├── api/               # API routes
│   │   │   ├── whatsapp/       # WhatsApp integration
│   │   │   ├── ai/             # AI endpoints
│   │   │   ├── v1/              # Public REST API
│   │   │   └── ...              # Other API routes
│   │   ├── join/               # Invitation acceptance
│   │   ├── layout.tsx          # Root layout
│   │   └── page.tsx            # Root redirect
│   ├── components/            # React components
│   │   ├── ui/                # Base UI components
│   │   ├── layout/            # Sidebar, Header, etc.
│   │   ├── inbox/             # Inbox-specific components
│   │   ├── contacts/          # Contact components
│   │   ├── pipelines/         # Pipeline/Kanban components
│   │   ├── broadcasts/        # Broadcast components
│   │   ├── flows/             # Flow builder components
│   │   ├── automations/       # Automation components
│   │   ├── agents/            # AI/agent components
│   │   ├── dashboard/         # Dashboard widgets
│   │   ├── presence/          # Real-time presence
│   │   ├── tremor/            # Chart components
│   │   └── interactive/       # Interactive message components
│   ├── lib/                   # Business logic
│   │   ├── auth/              # Auth utilities & roles
│   │   ├── whatsapp/          # Meta API integration
│   │   ├── ai/                # AI reply assistant
│   │   ├── flows/             # Flow engine & types
│   │   ├── conversations/     # Conversation logic
│   │   ├── contacts/          # Contact management
│   │   ├── broadcasts/        # Broadcast logic
│   │   ├── webhooks/          # Webhook handling
│   │   ├── supabase/          # Supabase client setup
│   │   ├── api-keys/          # API key management
│   │   └── ...                # Other utilities
│   ├── hooks/                 # React hooks
│   │   ├── use-auth.tsx       # Authentication hook
│   │   ├── use-theme.tsx      # Theme management
│   │   ├── use-realtime.ts    # Supabase realtime
│   │   ├── use-presence.ts    # Presence tracking
│   │   └── ...                # Other hooks
│   ├── i18n/                  # Internationalization
│   │   └── messages/          # Translation files (en.json, ko.json)
│   ├── types/                 # TypeScript types
│   └── middleware.ts          # Next.js middleware
├── supabase/
│   └── migrations/           # Database migrations (001-037)
├── mcp-server/               # Model Context Protocol server
│   └── src/
│       ├── index.ts           # Entry point
│       ├── client.ts          # Wacrm API client
│       ├── config.ts          # Configuration
│       └── tools/             # MCP tools (read, write, broadcast)
├── public/                    # Static assets
├── docs/                      # Documentation
│   ├── public-api.md         # REST API docs
│   ├── mcp.md                # MCP server docs
│   └── docker.md             # Docker deployment
└── package.json
```

---

## 4. Database Schema

The database consists of **37 migrations** building a comprehensive schema. Key tables:

### Core Tables

| Table | Purpose |
|-------|---------|
| `profiles` | User profiles linked to auth.users |
| `contacts` | Customer contacts with phone, name, email, company |
| `tags` | Contact tagging system |
| `contact_tags` | Many-to-many contact-tag relationships |
| `custom_fields` | Custom field definitions |
| `contact_custom_values` | Custom field values per contact |
| `contact_notes` | Notes on contacts |
| `conversations` | WhatsApp conversations (open/pending/closed) |
| `messages` | Individual messages within conversations |
| `whatsapp_config` | WhatsApp Business API credentials |
| `message_templates` | Meta-approved message templates |
| `pipelines` | Sales pipeline definitions |
| `pipeline_stages` | Stages within pipelines |
| `deals` | Deals linked to contacts and pipeline stages |
| `broadcasts` | Broadcast campaign definitions |
| `broadcast_recipients` | Per-recipient broadcast status |

### Flow/Automation Tables

| Table | Purpose |
|-------|---------|
| `flows` | Visual automation flow definitions |
| `flow_runs` | Active/running flow instances |
| `flow_run_events` | Event log for flow debugging |

### Team/Account Tables

| Table | Purpose |
|-------|---------|
| `accounts` | Account/workspace (multi-tenant) |
| `account_members` | Account membership with roles |
| `invitations` | Pending team invitations |

### API & Webhooks

| Table | Purpose |
|-------|---------|
| `api_keys` | API keys for public API |
| `webhook_endpoints` | Outbound webhook registrations |
| `webhook_events` | Webhook delivery log |

### AI Tables

| Table | Purpose |
|-------|---------|
| `ai_configs` | AI provider configuration |
| `ai_knowledge_base` | Knowledge base articles |
| `ai_conversation_slots` | Per-conversation AI response tracking |

### Key Patterns

- **Row Level Security (RLS)**: Every table has RLS policies based on `auth.uid()` and account membership
- **Updated_at triggers**: Automatic timestamp on modifications
- **Realtime**: `messages` and `conversations` tables are realtime-enabled
- **UUID primary keys**: All tables use `uuid_generate_v4()`

---

## 5. Authentication & Authorization

### Authentication Flow

1. **Supabase Auth** handles user authentication (email/password)
2. **Auto-profile creation**: A trigger (`handle_new_user`) automatically creates a profile row on signup
3. **Middleware** (`src/middleware.ts`) handles:
   - Redirecting authenticated users away from auth pages
   - Protecting dashboard routes
   - Refreshing session tokens (with cookie propagation fix)
   - Blocking unauthorized API access (except webhooks)

### Role-Based Access Control

Four roles with hierarchical permissions (defined in `src/lib/auth/roles.ts`):

| Role | Rank | Permissions |
|------|------|-------------|
| `owner` | 4 | Full access, delete account, transfer ownership |
| `admin` | 3 | Manage members, edit settings, send messages, run broadcasts |
| `agent` | 2 | Send messages, create contacts, move deals, run broadcasts |
| `viewer` | 1 | Read-only access to everything |

### Capability Predicates

```typescript
canManageMembers(role)    // admin+ — invite, remove, change roles
canEditSettings(role)     // admin+ — WhatsApp config, templates, pipelines
canSendMessages(role)     // agent+ — send messages, create contacts
canViewOnly(role)         // viewer only
canDeleteAccount(role)    // owner only
canTransferOwnership(role) // owner only
```

### Account Sharing

- Accounts can have multiple members with different roles
- `account_id` and `account_role` are stored on profiles
- RLS policies check `is_account_member(account_id, min_role)` function

---

## 6. Core Modules

### 6.1 Inbox

**Purpose**: Shared inbox for WhatsApp conversations.

**Key Files**:
- `src/app/(dashboard)/inbox/page.tsx` — Main inbox page
- `src/components/inbox/conversation-list.tsx` — Conversation list
- `src/components/inbox/message-thread.tsx` — Message thread view
- `src/components/inbox/message-composer.tsx` — Message composer
- `src/components/inbox/message-bubble.tsx` — Individual message bubbles

**Features**:
- Real-time message updates via Supabase Realtime
- Conversation status: open, pending, closed
- Per-conversation assignment to agents
- Unread count tracking
- Contact sidebar with info
- Quick replies
- Template picker
- AI reply assistant integration

**Message Types**:
- Text
- Image, document, audio, video (media handling)
- Location
- Template messages
- Interactive buttons/lists

### 6.2 Contacts

**Purpose**: Contact management with tagging and custom fields.

**Key Files**:
- `src/app/(dashboard)/contacts/page.tsx` — Contact list
- `src/components/contacts/contact-detail-view.tsx` — Contact detail
- `src/components/contacts/contact-form.tsx` — Add/edit contact
- `src/components/contacts/custom-fields-manager.tsx` — Custom fields
- `src/components/contacts/import-modal.tsx` — CSV import

**Features**:
- Contact CRUD with phone, name, email, company
- Tags with colors (many-to-many)
- Custom fields (text, select, etc.)
- Contact notes
- CSV import with deduplication
- Filter by tags
- Linked conversations and deals

### 6.3 Sales Pipelines

**Purpose**: Kanban-style deal management.

**Key Files**:
- `src/app/(dashboard)/pipelines/page.tsx` — Pipeline view
- `src/components/pipelines/` — Pipeline components

**Features**:
- Multiple pipelines
- Customizable stages with colors
- Drag-and-drop deals between stages
- Deal value and currency
- Linked contacts and conversations
- Expected close dates

### 6.4 Broadcasts

**Purpose**: Mass messaging with Meta-approved templates.

**Key Files**:
- `src/app/(dashboard)/broadcasts/page.tsx` — Broadcast list
- `src/app/(dashboard)/broadcasts/new/page.tsx` — New broadcast
- `src/app/(dashboard)/broadcasts/[id]/page.tsx` — Broadcast detail
- `src/lib/whatsapp/broadcast-core.ts` — Core broadcast logic
- `src/hooks/use-broadcast-sending.ts` — Sending state management

**Features**:
- Create broadcasts with Meta template selection
- Variable substitution per recipient
- Audience filtering (tags, custom fields)
- Scheduled sending
- Per-recipient status tracking (pending, sent, delivered, read, replied, failed)
- Delivery and read analytics
- Retry logic for failed messages

**Broadcast Status Flow**:
```
draft → scheduled → sending → sent
                           → failed
```

### 6.5 Automations

**Purpose**: Simple rule-based automations (legacy, superseded by Flows).

**Key Files**:
- `src/app/(dashboard)/automations/page.tsx` — Automation list
- `src/app/(dashboard)/automations/[id]/page.tsx` — Edit automation
- `src/app/api/automations/` — Automation API routes
- `src/lib/automations/` — Automation logic

**Triggers**:
- Inbound message
- New contact
- Keyword match
- Schedule/time-based

**Actions**:
- Send template message
- Add/remove tag
- Assign agent
- Update conversation status

### 6.6 Flows (Visual Automation Builder)

**Purpose**: No-code visual automation builder with a node-based UI.

**Key Files**:
- `src/app/(dashboard)/flows/page.tsx` — Flow list
- `src/app/(dashboard)/flows/[id]/page.tsx` — Flow editor
- `src/components/flows/flow-builder.tsx` — Main builder component
- `src/components/flows/flow-canvas.tsx` — React Flow canvas
- `src/components/flows/flow-editor-state.tsx` — Editor state management
- `src/components/flows/node-config-form.tsx` — Node configuration
- `src/lib/flows/engine.ts` — Flow execution engine
- `src/lib/flows/types.ts` — Flow node types
- `src/lib/flows/validate.ts` — Flow validation

**Node Types**:

| Node Type | Description |
|-----------|-------------|
| `start` | Entry point with trigger configuration |
| `send_message` | Send text message |
| `send_buttons` | Send interactive buttons |
| `send_list` | Send interactive list |
| `send_media` | Send image/video/document |
| `collect_input` | Collect customer response |
| `condition` | Branch based on keywords or contact data |
| `set_tag` | Add/remove tag from contact |
| `wait` | Delay execution |
| `ai_reply` | AI-generated response |
| `close_conversation` | Mark conversation as closed |

**Trigger Types**:
- `keyword` — Match specific keywords
- `new_contact` — Trigger on new contact creation
- `schedule` — Time-based triggers

**Flow Execution Engine** (`engine.ts`):
- `dispatchInboundToFlows()` — Entry point for inbound messages
- Handles button/list replies via `matchReplyId()`
- Keyword matching with case-insensitive support
- Fallback policies for unrecognized input
- Per-conversation run isolation
- Meta message ID idempotency

---

## 7. WhatsApp Integration

**Purpose**: Integration with Meta WhatsApp Business API.

**Key Files**:
- `src/lib/whatsapp/meta-api.ts` — Core Meta API client
- `src/lib/whatsapp/send-message.ts` — Message sending logic
- `src/lib/whatsapp/encryption.ts` — Access token encryption
- `src/lib/whatsapp/resolve-conversation.ts` — Conversation resolution
- `src/lib/whatsapp/interactive.ts` — Interactive message building
- `src/lib/whatsapp/template-components.ts` — Template parsing
- `src/lib/whatsapp/template-validators.ts` — Template validation
- `src/app/api/whatsapp/webhook/route.ts` — Webhook receiver

**Webhook Handling** (`webhook/route.ts`):
- Verifies webhook signature (HMAC-SHA256)
- Handles multiple webhook events:
  - `messages.received` — Inbound messages
  - `message_deliveries` — Delivery receipts
  - `message_reads` — Read receipts
  - `message_reactions` — Message reactions
- Interactive message responses (buttons, lists)
- Media downloads
- Delivery status updates

**Security**:
- Access tokens encrypted at rest (AES-256-GCM)
- Webhook signature verification
- Phone number validation
- WABA ID verification

**Configuration** (`whatsapp_config` table):
- `phone_number_id` — WhatsApp phone number ID
- `waba_id` — WhatsApp Business Account ID
- `access_token` — Meta API access token (encrypted)
- `verify_token` — Webhook verification token
- `status` — connected/disconnected

---

## 8. AI Reply Assistant

**Purpose**: AI-powered reply suggestions and auto-replies.

**Key Files**:
- `src/lib/ai/auto-reply.ts` — Auto-reply logic
- `src/lib/ai/knowledge.ts` — Knowledge base retrieval
- `src/lib/ai/generate.ts` — Response generation
- `src/lib/ai/embeddings.ts` — Embedding generation
- `src/lib/ai/providers/` — OpenAI/Anthropic providers
- `src/components/agents/ai-playground.tsx` — AI testing UI
- `src/components/inbox/ai-thread-banner.tsx` — AI status banner

**Features**:
- One-click AI-drafted replies in inbox
- Auto-reply bot with per-conversation cap
- Knowledge base (FAQs, policies, product docs)
- Hybrid retrieval: Postgres full-text or pgvector semantic search
- Human handoff when needed

**Configuration**:
- Bring your own OpenAI/Anthropic key
- Per-account AI configuration
- Per-conversation response slot tracking
- Usage tracking and limits

---

## 9. API Layer

### Internal API Routes

Located in `src/app/api/`:

| Route | Purpose |
|-------|---------|
| `/api/whatsapp/*` | WhatsApp integration endpoints |
| `/api/ai/*` | AI configuration and testing |
| `/api/automations/*` | Automation CRUD |
| `/api/flows/*` | Flow CRUD and execution |
| `/api/contacts/*` | Contact management |
| `/api/quick-replies/*` | Quick reply management |
| `/api/account/*` | Account settings |
| `/api/invitations/*` | Team invitations |
| `/api/v1/*` | Public REST API |

### Public REST API (`/api/v1`)

**Documentation**: `docs/public-api.md`

**Authentication**: Bearer token (API key)

**Scopes**:
| Scope | Allows |
|-------|--------|
| `messages:send` | Send WhatsApp messages |
| `messages:read` | Read messages and delivery status |
| `contacts:read` | List and read contacts |
| `contacts:write` | Create and update contacts |
| `conversations:read` | List and read conversations |
| `broadcasts:send` | Launch broadcast campaigns |
| `webhooks:manage` | Register and manage outbound webhooks |

**Rate Limits**: 120 requests per minute per key

**Endpoints**:
- `GET /api/v1/me` — Account info
- `GET/POST /api/v1/contacts` — Contact management
- `GET /api/v1/conversations` — List conversations
- `GET/POST /api/v1/messages` — Message management
- `POST /api/v1/broadcasts` — Launch broadcasts
- `GET/POST /api/v1/webhooks` — Webhook management

---

## 10. MCP Server

**Purpose**: Drive the CRM from AI assistants via Model Context Protocol.

**Location**: `mcp-server/`

**Key Files**:
- `src/index.ts` — Entry point
- `src/client.ts` — Wacrm API client
- `src/config.ts` — Configuration
- `src/tools/` — MCP tool definitions

**Tools**:
| Tool | Access | Description |
|------|--------|-------------|
| `read_contacts` | Read | List/search contacts |
| `read_conversations` | Read | List conversations |
| `read_messages` | Read | Get message history |
| `read_broadcasts` | Read | List broadcasts |
| `read_flows` | Read | List flows |
| `send_message` | Write | Send WhatsApp message |
| `create_contact` | Write | Create new contact |
| `update_contact` | Write | Update contact |
| `broadcast_send` | Write | Launch broadcast |

**Configuration**:
- `WACRM_BASE_URL` — tijwa-crm instance URL
- `WACRM_API_KEY` — API key for authentication
- `WACRM_ENABLE_WRITES` — Enable write operations (default: false for read-only)

---

## 11. Dashboard & UI Components

### Dashboard Shell

**Files**:
- `src/app/(dashboard)/dashboard-shell.tsx` — Main shell
- `src/components/layout/sidebar.tsx` — Navigation sidebar
- `src/components/layout/header.tsx` — Top header

**Features**:
- Protected routes (redirect to login if not authenticated)
- Responsive sidebar (drawer on mobile)
- Online/away presence heartbeat
- Account access alerts
- Loading states

### Theme System

**Files**:
- `src/lib/themes.ts` — Theme definitions
- `src/hooks/use-theme.tsx` — Theme hook
- `src/app/globals.css` — CSS variables

**Themes** (accent colors):
- Violet (default)
- Emerald
- Cobalt
- Amber
- Rose

**Modes**:
- Dark (default)
- Light

**Implementation**:
- CSS variables per theme/mode combination
- Boot script prevents flash of wrong theme
- localStorage persistence

### Charts/Analytics

**Components** (`src/components/tremor/`):
- `bar-chart.tsx` — Bar chart component
- Chart color utilities
- Y-axis domain calculation

### Presence System

**Files**:
- `src/lib/presence.ts` — Presence logic
- `src/components/presence/presence-heartbeat.tsx` — Heartbeat component
- `src/hooks/use-presence.ts` — Presence hook

**Features**:
- Real-time online/away status
- Heartbeat pings every 30 seconds
- Status expires after 60 seconds of no heartbeat

---

## 12. Webhooks System

### Inbound Webhooks (from Meta)

Handled by `src/app/api/whatsapp/webhook/route.ts`:
- Receives and validates Meta webhook events
- Processes inbound messages, receipts, reactions
- Triggers automations and flows

### Outbound Webhooks (to user systems)

**Tables**:
- `webhook_endpoints` — Registered endpoints
- `webhook_events` — Delivery log

**Features**:
- Account-scoped webhook registration
- Per-event-type filtering
- Retry with exponential backoff
- HMAC signature for verification

**Events**:
- `message.received` — Inbound message
- `message.sent` — Outbound sent
- `message.delivered` — Delivery confirmed
- `message.read` — Read confirmed
- `message.failed` — Send failed
- `contact.created` — New contact
- `automation.triggered` — Automation fired

---

## 13. Security

### Database Security

- **Row Level Security (RLS)**: Every table has RLS enabled
- **Service role**: Only used server-side for admin operations
- **User isolation**: Users can only access their own data
- **Account scoping**: Multi-tenant isolation via `account_id`

### API Security

- **API key authentication**: Bearer tokens with SHA-256 hashing
- **Scoped permissions**: Keys can only do what scopes allow
- **Rate limiting**: In-memory per-key rate limits
- **Webhook signature**: HMAC-SHA256 verification

### Token Encryption

- WhatsApp access tokens encrypted with AES-256-GCM
- Encryption key via `ENCRYPTION_KEY` environment variable

### Web Security

- **CSRF**: Handled by Supabase
- **XSS**: React's built-in escaping + CSP considerations
- **SSRF protection**: For webhook endpoints

---

## 14. Configuration & Environment

### Environment Variables

See `.env.local.example`:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# WhatsApp
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_WABA_ID=
WHATSAPP_VERIFY_TOKEN=

# AI
OPENAI_API_KEY=
ANTHROPIC_API_KEY=

# Security
ENCRYPTION_KEY=  # 32 bytes hex-encoded for AES-256

# Optional
NEXT_PUBLIC_APP_URL=  # For redirects, defaults to localhost:3000
```

### Supabase Setup

1. Create a Supabase project
2. Run migrations in order (`supabase/migrations/001_initial_schema.sql` through `037_*.sql`)
3. Configure auth settings
4. Set environment variables

### WhatsApp Setup

1. Create a Meta developer app
2. Configure WhatsApp Business API
3. Set up webhook URL
4. Add phone number
5. Create message templates

---

## 15. Development Workflow

### Quick Start

```bash
# Fork on GitHub first
git clone https://github.com/<your-username>/wacrm.git
cd wacrm
pnpm install
cp .env.local.example .env.local   # fill in credentials
pnpm dev
```

### Available Scripts

```json
{
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "eslint",
  "typecheck": "tsc --noEmit",
  "format": "prettier --write .",
  "format:check": "prettier --check .",
  "test": "vitest run",
  "test:watch": "vitest"
}
```

### Testing

```bash
pnpm test           # Run all tests
pnpm typecheck  # TypeScript check
pnpm lint       # ESLint
```

### Project Conventions

- **Styling**: Tailwind CSS v4 with CSS variables
- **Components**: Feature-based organization
- **Types**: Shared types in `src/lib/flows/types.ts`, etc.
- **i18n**: next-intl with JSON message files in `messages/`
- **Testing**: Vitest with `*.test.ts` files co-located

---

## 16. Deployment

### Recommended: Hostinger

tijwa-crm is optimized for Hostinger's Managed Node.js hosting:
- One-click Git deploy
- Free SSL + domain
- Managed Node.js
- Built-in DDoS protection

**Steps**:
1. Fork the repo on GitHub
2. Connect to Hostinger, pick Node.js
3. Paste environment variables
4. Push to main — Hostinger builds automatically

### Docker

See `docs/docker.md`:

```bash
docker-compose up -d
```

### Other Platforms

tijwa-crm runs anywhere Node.js does:
- Vercel
- Railway
- Self-hosted VPS
- Any VPS

---

## Additional Documentation

- [docs/public-api.md](./docs/public-api.md) — Public REST API reference
- [docs/mcp.md](./docs/mcp.md) — MCP server setup
- [docs/docker.md](./docs/docker.md) — Docker deployment
- [tijwa-crm.tijwa.com/docs](https://tijwa-crm.tijwa.com/docs) — Full documentation site

---

*Last updated: Version 0.8.0*

---

## 17. Multi-Tenant SaaS Conversion Guide

> **Status**: This section documents how to convert tijwa-crm from a **single-tenant template** (one deployment = one business) into a **multi-tenant SaaS application** (one deployment = many businesses sharing the infrastructure).

tijwa-crm is currently architected as a **template for one business per deployment**. The database uses `account_id` for team member isolation within a business, but each deployment serves a single business. This section covers converting it to a true SaaS where multiple businesses (tenants) share one deployment with complete data isolation.

---

### 17.1 Current Architecture (Single-Tenant Per Deployment)

```
┌─────────────────────────────────────────────────┐
│  tijwa-crm Deployment (single business)              │
│                                                 │
│  auth.users ──► profiles ──► accounts            │
│                               │                 │
│                               └──► contacts     │
│                               └──► conversations│
│                               └──► pipelines   │
│                               └──► ... (all)   │
│                                                 │
│  One WhatsApp number per deployment              │
│  One team per deployment                         │
└─────────────────────────────────────────────────┘
```

**Current constraints:**
- Each user belongs to exactly ONE account (migration 017: "one-account-per-user")
- `accounts` table has `owner_user_id` — denormalized for fast lookups
- Signup creates an account automatically for that user
- No way to invite users to multiple accounts from one login

---

### 17.2 Target Architecture (Multi-Tenant SaaS)

```
┌─────────────────────────────────────────────────────────────┐
│  tijwa-crm SaaS Deployment (many businesses)                    │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Tenant: acme-corp                                    │   │
│  │  contacts, conversations, pipelines, broadcasts...    │   │
│  │  Members: alice@acme.com, bob@acme.com               │   │
│  │  WhatsApp: +1-555-ACME                               │   │
│  │  Plan: pro | Expires: 2025-12-31                     │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Tenant: startup-xyz                                  │   │
│  │  contacts, conversations, pipelines, broadcasts...    │   │
│  │  Members: carol@startup.io                          │   │
│  │  WhatsApp: +1-555-XYZW                               │   │
│  │  Plan: starter | Expires: 2025-06-30                │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Tenant: agency-123                                  │   │
│  │  contacts, conversations, pipelines, broadcasts...    │   │
│  │  Members: dave@agency.com, eve@agency.com           │   │
│  │  WhatsApp: +1-555-AGCY                               │   │
│  │  Plan: enterprise | Expires: 2026-01-15             │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

### 17.3 Database Changes Required

#### 17.3.1 User-Account Membership (Many-to-Many)

**Current state (migration 017):**
```sql
-- One-to-one: profile has ONE account_id
ALTER TABLE profiles ADD COLUMN account_id UUID REFERENCES accounts(id);
ALTER TABLE profiles ADD COLUMN account_role account_role_enum;
```

**Change to:**
```sql
-- 1. Drop the one-to-one constraint
ALTER TABLE profiles DROP COLUMN IF EXISTS account_id;
ALTER TABLE profiles DROP COLUMN IF EXISTS account_role;

-- 2. Create a memberships junction table
CREATE TABLE IF NOT EXISTS account_memberships (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  role account_role_enum NOT NULL DEFAULT 'viewer',
  invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, account_id)  -- same user can't join same account twice
);

CREATE INDEX idx_memberships_user ON account_memberships(user_id);
CREATE INDEX idx_memberships_account ON account_memberships(account_id);

ALTER TABLE account_memberships ENABLE ROW LEVEL SECURITY;

-- 3. RLS: users can see their own memberships
CREATE POLICY memberships_select ON account_memberships FOR SELECT
  USING (auth.uid() = user_id);

-- 4. Membership helper function (replaces is_account_member)
CREATE OR REPLACE FUNCTION get_user_account_role(
  p_user_id UUID,
  p_account_id UUID
) RETURNS account_role_enum
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM account_memberships
  WHERE user_id = p_user_id AND account_id = p_account_id;
$$;

-- 5. Update all RLS policies to use the new membership check
-- Example for contacts:
DROP POLICY IF EXISTS contacts_select ON contacts;
CREATE POLICY contacts_select ON contacts FOR SELECT USING (
  get_user_account_role(auth.uid(), account_id) IS NOT NULL
);
```

#### 17.3.2 Tenant Settings Table

```sql
-- 1. Tenant-specific settings
CREATE TABLE IF NOT EXISTS tenant_settings (
  account_id UUID PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  
  -- Branding
  display_name TEXT,                    -- "ACME Corp" (for UI headers)
  logo_url TEXT,                        -- Custom logo
  accent_color TEXT DEFAULT '#7c3aed',  -- Tenant-specific accent
  
  -- Subscription
  plan TEXT NOT NULL DEFAULT 'starter' CHECK (plan IN ('starter', 'pro', 'enterprise')),
  subscription_status TEXT DEFAULT 'active' CHECK (subscription_status IN ('active', 'suspended', 'cancelled', 'trial')),
  subscription_expires_at TIMESTAMPTZ,
  
  -- Usage limits
  max_contacts INTEGER DEFAULT 1000,
  max_team_members INTEGER DEFAULT 5,
  max_broadcasts_per_month INTEGER DEFAULT 50,
  ai_reply_limit_per_month INTEGER DEFAULT 100,
  
  -- WhatsApp (moved from whatsapp_config, now per-tenant)
  whatsapp_phone_number TEXT,
  whatsapp_waba_id TEXT,
  
  -- SSO (future)
  sso_provider TEXT,                    -- 'google', 'azure', 'saml'
  sso_config JSONB,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE tenant_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_settings_select ON tenant_settings FOR SELECT
  USING (get_user_account_role(auth.uid(), account_id) IS NOT NULL);
CREATE POLICY tenant_settings_update ON tenant_settings FOR UPDATE
  USING (get_user_account_role(auth.uid(), account_id) IN ('owner', 'admin'));

-- 2. Backfill tenant_settings from existing accounts
INSERT INTO tenant_settings (account_id, display_name)
SELECT id, name FROM accounts
ON CONFLICT (account_id) DO NOTHING;
```

#### 17.3.3 API Keys Scoped to Tenants

**Current:** API keys are account-scoped (`api_keys.account_id`)

**Already correct** — no changes needed. API keys already have `account_id` and scope to a single tenant.

#### 17.3.4 Update handle_new_user Trigger

```sql
-- Signup now creates an account + tenant_settings, but NO automatic membership
-- (user must be invited or create their own)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account_id UUID;
BEGIN
  -- Create the personal account
  INSERT INTO public.accounts (name, owner_user_id)
  VALUES (
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email, 'My account'),
    NEW.id
  )
  RETURNING id INTO v_account_id;
  
  -- Create tenant settings
  INSERT INTO tenant_settings (account_id, display_name)
  VALUES (v_account_id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email, 'My account'));
  
  -- NO automatic membership created here
  -- User must create their own or be invited
  
  -- Create the profile (without account_id now)
  INSERT INTO public.profiles (user_id, full_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''), NEW.email);
  
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Failed to bootstrap account for user %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;
```

---

### 17.4 Tenant Resolution

You need to determine **which tenant** a request belongs to. Three common strategies:

#### Option A: Subdomain-Based (Recommended)

```
acme.tijwa-crm.com    → tenant: acme
startup.tijwa-crm.com → tenant: startup
tijwa-crm.com         → tenant: default (for marketing, pricing, etc.)
```

**Middleware implementation:**

```typescript
// src/middleware.ts
export async function middleware(request: NextRequest) {
  const hostname = request.headers.get('host') || '';
  
  // Extract subdomain
  const parts = hostname.split('.');
  const subdomain = parts.length > 2 ? parts[0] : null;
  
  // Skip for main domain (marketing, etc.)
  if (!subdomain || subdomain === 'www') {
    return NextResponse.next();
  }
  
  // Resolve tenant from subdomain
  const { data: tenant } = await supabase
    .from('accounts')
    .select('id, name, plan, subscription_status')
    .ilike('subdomain', subdomain)  // Add subdomain column to accounts
    .single();
    
  if (!tenant) {
    return NextResponse.redirect(new URL('/not-found', request.url));
  }
  
  // Check subscription status
  if (tenant.subscription_status === 'suspended') {
    return NextResponse.redirect(new URL('/subscription-suspended', request.url));
  }
  
  // Inject tenant context into headers for downstream use
  const response = NextResponse.next();
  response.headers.set('x-tenant-id', tenant.id);
  response.headers.set('x-tenant-name', tenant.name);
  response.headers.set('x-tenant-plan', tenant.plan);
  
  return response;
}
```

#### Option B: Path-Based

```
tijwa-crm.com/acme/contacts     → tenant: acme
tijwa-crm.com/startup/contacts  → tenant: startup
```

```typescript
// In middleware or layout
const pathname = request.nextUrl.pathname;
const segments = pathname.split('/').filter(Boolean);
// segments[0] is the tenant slug
```

#### Option C: JWT Claims (Best for SSO)

Include `account_id` in the JWT after login:

```typescript
// In your custom Supabase auth callback or server action
const { data: { user } } = await supabase.auth.getUser();

// Add account_id to the session
await supabase.auth.updateUser({
  data: { 
    account_id: selectedAccountId,  // User picks which tenant to access
    account_role: getUserAccountRole(user.id, selectedAccountId)
  }
});
```

Then access via `const { data: { user } } = await supabase.auth.getUser()`.

---

### 17.5 Required Code Changes

#### 17.5.1 AuthProvider Updates

**File:** `src/hooks/use-auth.tsx`

The AuthProvider needs to handle **multiple accounts per user**:

```typescript
// Replace the single accountId with an array of memberships
interface AuthContextValue {
  // ... existing fields
  
  // New: user's accounts (for tenant switcher)
  accounts: AccountSummary[];         // All accounts user belongs to
  
  // Current active tenant
  activeAccountId: string | null;
  setActiveAccountId: (id: string) => void;
  
  // Tenant-scoped role (recomputes when activeAccountId changes)
  accountRoleForActive: AccountRole | null;
}

// Usage in layout:
const { accounts, activeAccountId, setActiveAccountId } = useAuth();

// Show tenant switcher if user has multiple accounts
if (accounts.length > 1) {
  return <TenantSwitcher accounts={accounts} onSelect={setActiveAccountId} />;
}
```

#### 17.5.2 API Route Changes

Every API route needs to resolve the tenant from the request:

```typescript
// src/app/api/contacts/route.ts

// Helper: extract tenant from request
async function resolveTenant(request: NextRequest): Promise<string | null> {
  // Option A: from header (set by middleware)
  const tenantId = request.headers.get('x-tenant-id');
  if (tenantId) return tenantId;
  
  // Option B: from session/JWT
  const { data: { user } } = await supabase.auth.getUser();
  if (user?.app_metadata?.account_id) {
    return user.app_metadata.account_id;
  }
  
  return null;
}

export async function GET(request: NextRequest) {
  const accountId = await resolveTenant(request);
  if (!accountId) {
    return NextResponse.json({ error: 'No tenant context' }, { status: 400 });
  }
  
  // Add accountId to all queries
  const { data, error } = await supabase
    .from('contacts')
    .select('*')
    .eq('account_id', accountId);  // Already standard in tijwa-crm
  
  // ...
}
```

**Shortcut:** If using subdomain middleware, the `x-tenant-id` header approach avoids changing every route — just add it to a shared helper that all routes call.

#### 17.5.3 Tenant Switcher Component

**New component:** `src/components/layout/tenant-switcher.tsx`

```tsx
'use client';

import { useAuth } from '@/hooks/use-auth';
import { useRouter } from 'next/navigation';

export function TenantSwitcher({ 
  accounts, 
  onSelect 
}: { 
  accounts: AccountSummary[];
  onSelect: (id: string) => void;
}) {
  const { activeAccountId } = useAuth();
  const router = useRouter();
  
  const handleSwitch = (accountId: string) => {
    onSelect(accountId);
    // Persist to cookie/localStorage for SSR
    document.cookie = `tijwa-crm_active_account=${accountId}; path=/; max-age=31536000`;
    // Refresh to reload data with new tenant context
    router.refresh();
  };
  
  return (
    <select 
      value={activeAccountId || ''}
      onChange={(e) => handleSwitch(e.target.value)}
      className="border rounded px-2 py-1"
    >
      {accounts.map((account) => (
        <option key={account.id} value={account.id}>
          {account.name}
        </option>
      ))}
      <option value="__create_new__">+ Create new workspace</option>
    </select>
  );
}
```

#### 17.5.4 Tenant Middleware (Complete Example)

**File:** `src/middleware.ts`

```typescript
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  const response = NextResponse.next({ request });
  
  // Skip for static assets and auth pages
  const pathname = request.nextUrl.pathname;
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api/webhook') ||  // Webhooks don't need tenant
    pathname === '/login' ||
    pathname === '/signup'
  ) {
    return response;
  }
  
  // Extract subdomain
  const hostname = request.headers.get('host') || '';
  const subdomain = hostname.split('.')[0];
  
  // Create Supabase client for tenant lookup
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => 
            request.cookies.set(name, value)
          );
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );
  
  // Get authenticated user
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    // Redirect to login for protected routes
    if (pathname.startsWith('/dashboard')) {
      return NextResponse.redirect(new URL('/login', request.url));
    }
    return response;
  }
  
  // Determine tenant:
  // 1. From subdomain (e.g., acme.tijwa-crm.com)
  // 2. From cookie (tenant switcher)
  // 3. From user's default/first account
  
  let tenantId: string | null = null;
  
  if (subdomain && subdomain !== 'www') {
    // Resolve by subdomain
    const { data: account } = await supabase
      .from('accounts')
      .select('id')
      .eq('subdomain', subdomain)
      .single();
    tenantId = account?.id ?? null;
  }
  
  if (!tenantId) {
    // Check cookie for explicitly selected tenant
    const cookies = request.cookies.getAll();
    const tenantCookie = cookies.find(c => c.name === 'tijwa-crm_active_account');
    if (tenantCookie?.value) {
      tenantId = tenantCookie.value;
    }
  }
  
  if (!tenantId) {
    // Fall back to user's first account
    const { data: membership } = await supabase
      .from('account_memberships')
      .select('account_id')
      .eq('user_id', user.id)
      .limit(1)
      .single();
    tenantId = membership?.account_id ?? null;
  }
  
  if (!tenantId) {
    // User has no accounts — redirect to create one
    return NextResponse.redirect(new URL('/onboarding/create-workspace', request.url));
  }
  
  // Verify user is a member of this tenant
  const { data: membership } = await supabase
    .from('account_memberships')
    .select('role')
    .eq('user_id', user.id)
    .eq('account_id', tenantId)
    .single();
    
  if (!membership) {
    return NextResponse.redirect(new URL('/access-denied', request.url));
  }
  
  // Inject tenant context into response
  response.headers.set('x-tenant-id', tenantId);
  response.headers.set('x-tenant-role', membership.role);
  
  // Copy refreshed cookies
  response.cookies.getAll().forEach(cookie => {
    response.cookies.set(cookie);
  });
  
  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
```

---

### 17.5.5 Webhook Tenant Resolution

WhatsApp webhooks need special handling — Meta sends them without tenant context.

```typescript
// src/app/api/whatsapp/webhook/route.ts

export async function POST(request: NextRequest) {
  const body = await request.json();
  
  // WhatsApp sends: { entry: [{ changes: [{ value: { metadata: { phone_number_id } } }] }] }
  const phoneNumberId = body.entry?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id;
  
  if (!phoneNumberId) {
    return NextResponse.json({ error: 'Invalid webhook' }, { status: 400 });
  }
  
  // Look up tenant by WhatsApp phone number
  const { data: config } = await supabaseAdmin
    .from('whatsapp_config')
    .select('account_id')  // After adding phone_number_id to whatsapp_config
    .eq('phone_number_id', phoneNumberId)
    .single();
    
  if (!config) {
    return NextResponse.json({ error: 'Unknown phone number' }, { status: 404 });
  }
  
  // Process webhook with tenant context...
  // Pass accountId to downstream functions
}
```

**Note:** Add `phone_number_id` as a queryable column in `whatsapp_config` if not already present.

---

### 17.6 Billing & Subscription Management

#### 17.6.1 Subscription Table

```sql
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  plan TEXT NOT NULL CHECK (plan IN ('starter', 'pro', 'enterprise')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'past_due', 'cancelled', 'trialing')),
  stripe_customer_id TEXT UNIQUE,
  stripe_subscription_id TEXT UNIQUE,
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY subscriptions_select ON subscriptions FOR SELECT
  USING (get_user_account_role(auth.uid(), account_id) IN ('owner', 'admin'));
CREATE POLICY subscriptions_insert ON subscriptions FOR INSERT
  WITH CHECK (get_user_account_role(auth.uid(), account_id) = 'owner');
```

#### 17.6.2 Usage Tracking

```sql
CREATE TABLE IF NOT EXISTS usage_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  metric TEXT NOT NULL,              -- 'contacts', 'messages', 'broadcasts', 'ai_replies'
  count INTEGER NOT NULL DEFAULT 0,
  period_start TIMESTAMPTZ NOT NULL, -- Monthly period start
  period_end TIMESTAMPTZ NOT NULL,   -- Monthly period end
  UNIQUE(account_id, metric, period_start)
);

ALTER TABLE usage_records ENABLE ROW LEVEL SECURITY;

-- Function to check limits
CREATE OR REPLACE FUNCTION check_usage_limit(
  p_account_id UUID,
  p_metric TEXT,
  p_increment INTEGER DEFAULT 1
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_limit INTEGER;
  v_current INTEGER;
  v_period_start TIMESTAMPTZ;
  v_period_end TIMESTAMPTZ;
BEGIN
  -- Get limit from tenant_settings
  SELECT 
    CASE p_metric
      WHEN 'contacts' THEN max_contacts
      WHEN 'team_members' THEN max_team_members
      WHEN 'broadcasts' THEN max_broadcasts_per_month
      WHEN 'ai_replies' THEN ai_reply_limit_per_month
      ELSE NULL
    END,
    DATE_TRUNC('month', NOW())::TIMESTAMPTZ,
    (DATE_TRUNC('month', NOW()) + INTERVAL '1 month')::TIMESTAMPTZ
  INTO v_limit, v_period_start, v_period_end
  FROM tenant_settings
  WHERE account_id = p_account_id;
  
  IF v_limit IS NULL THEN
    RETURN TRUE; -- No limit for this metric
  END IF;
  
  -- Get current usage
  SELECT COALESCE(count, 0) INTO v_current
  FROM usage_records
  WHERE account_id = p_account_id
    AND metric = p_metric
    AND period_start = v_period_start;
  
  RETURN v_current + p_increment <= v_limit;
END;
$$;
```

---

### 17.7 Tenant Branding

Allow tenants to customize their workspace appearance:

```sql
-- Add to tenant_settings (if not already added in 17.3.2)
ALTER TABLE tenant_settings ADD COLUMN IF NOT EXISTS 
  logo_url TEXT,
  accent_color TEXT DEFAULT '#7c3aed',
  custom_css TEXT;  -- Optional custom CSS for advanced tenants
```

**Theme provider update:**

```tsx
// src/hooks/use-theme.tsx (update to read tenant branding)
export function ThemeProvider({ children }: { children: ReactNode }) {
  const { account } = useAuth(); // from useAuth()
  const [theme, setTheme] = useTheme();
  
  // Apply tenant accent color if set
  useEffect(() => {
    if (account?.accent_color) {
      document.documentElement.style.setProperty(
        '--accent', 
        account.accent_color
      );
    }
  }, [account?.accent_color]);
  
  // ... rest of provider
}
```

---

### 17.8 SSO Integration (Future Enhancement)

For enterprise multi-tenant SaaS, implement SSO:

```sql
-- Add to tenant_settings
ALTER TABLE tenant_settings ADD COLUMN IF NOT EXISTS
  sso_provider TEXT CHECK (sso_provider IN ('google', 'azure_ad', 'saml')),
  sso_client_id TEXT,
  sso_client_secret_encrypted TEXT,  -- Encrypted like WhatsApp tokens
  sso_domain TEXT,  -- e.g., 'acme.com' for Google Workspace SSO
  sso_config JSONB; -- SAML certificate, etc.
```

**Auth flow:**
1. User visits `acme.tijwa-crm.com/login`
2. If tenant has SSO configured, redirect to SSO provider
3. SSO provider authenticates user
4. Callback includes SAML assertion or OAuth token
5. Server looks up user by email, creates session with tenant context
6. First-time users are auto-provisioned into the tenant's account

---

### 17.9 Deployment Considerations

#### 17.9.1 Environment Variables for SaaS

```env
# Multi-tenant configuration
NEXT_PUBLIC_APP_URL=https://tijwa-crm.com
DEFAULT_TENANT_SUBDOMAIN=tijwa-crm

# Stripe (for billing)
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_STARTER_PRICE_ID=price_...
STRIPE_PRO_PRICE_ID=price_...
STRIPE_ENTERPRISE_PRICE_ID=price_...

# SSO (optional)
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
AZURE_AD_CLIENT_ID=...
AZURE_AD_CLIENT_SECRET=...
```

#### 17.9.2 Row Level Security Remains Effective

All existing RLS policies using `is_account_member()` or `get_user_account_role()` provide tenant isolation. As long as:

1. All queries include `account_id` filter
2. RLS policies check membership before returning data
3. No raw `SELECT *` without account scoping

Data isolation between tenants is guaranteed at the database layer.

#### 17.9.3 Rate Limiting Per Tenant

```typescript
// src/lib/rate-limit.ts

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

// Per-tenant rate limits
const TENANT_RATE_LIMITS: Record<string, RateLimitConfig> = {
  starter: { windowMs: 60000, maxRequests: 60 },    // 1 req/sec
  pro: { windowMs: 60000, maxRequests: 300 },        // 5 req/sec
  enterprise: { windowMs: 60000, maxRequests: 1200 }, // 20 req/sec
};

// In API route:
const tenantId = request.headers.get('x-tenant-id');
const { data: settings } = await supabase
  .from('tenant_settings')
  .select('plan')
  .eq('account_id', tenantId)
  .single();
  
const limit = TENANT_RATE_LIMITS[settings?.plan] ?? TENANT_RATE_LIMITS.starter;
// Apply rate limiting...
```

#### 17.9.4 Separate Database vs Shared Database

| Approach | Pros | Cons |
|----------|------|------|
| **Shared database (recommended)** | Lower ops cost, easier backups | RLS complexity, noisy neighbor problem |
| **Separate schemas** | Stronger isolation | Migration management harder |
| **Separate databases** | Complete isolation, per-tenant scaling | Very high ops cost |

tijwa-crm's RLS-based approach supports **shared database** efficiently.

---

### 17.10 Migration Path (From Current State)

To convert an existing tijwa-crm installation to multi-tenant SaaS:

1. **Phase 1: Database**
   - Run migration to create `account_memberships` table
   - Backfill: create one membership per existing profile (owner role)
   - Add `tenant_settings` table
   - Add `subdomain` column to `accounts`
   - Add `phone_number_id` to `whatsapp_config` for webhook routing

2. **Phase 2: Application**
   - Update AuthProvider for multiple accounts
   - Add tenant switcher UI
   - Update middleware for subdomain/cookie resolution
   - Update all API routes to use tenant context helper

3. **Phase 3: Billing**
   - Integrate Stripe
   - Add subscription management UI
   - Implement usage tracking

4. **Phase 4: SSO** (optional)
   - Add SSO configuration to tenant_settings
   - Implement SAML/OIDC flow
   - Add domain verification

5. **Phase 5: Launch**
   - Configure DNS wildcards (*.tijwa-crm.com)
   - Set up onboarding flow for new tenants
   - Add tenant creation UI

---

### 17.11 Summary of Changes

| Area | Current State | Changes Needed |
|------|--------------|---------------|
| **User-Account relationship** | One-to-one (profile has one account_id) | Many-to-many via account_memberships |
| **Signup flow** | Auto-creates account + membership | Create account only; user creates or joins manually |
| **AuthProvider** | Single `accountId` | Multiple accounts array + `activeAccountId` |
| **Middleware** | Session-based auth | Tenant resolution from subdomain/cookie |
| **API routes** | `accountId` from profile | `accountId` from header/helper |
| **Webhook routing** | Not tenant-aware | Lookup by phone_number_id |
| **Tenant settings** | Only `accounts.name` | Full `tenant_settings` with branding, limits, billing |
| **Rate limiting** | Global | Per-tenant based on plan |
| **SSO** | None | Optional via tenant_settings |

The **core architecture is well-prepared** — `account_id` on every table and RLS policies provide the isolation foundation. The main changes are:

1. Changing user-account from 1:1 to M:N
2. Adding tenant resolution (subdomain/path/cookie)
3. Updating AuthProvider for multiple accounts
4. Adding billing/subscription management
5. Adding tenant-specific branding

This is a significant but well-structured conversion that maintains all existing functionality while enabling SaaS multi-tenancy.

---

## 18. Business Operations Architecture (Phase 1)

### 18.1 Architecture Principles

1. **Capability-driven, not business-type-driven** — Business type recommends capabilities; capabilities determine features
2. **Never replace existing systems** — Flows, Automations, Templates, Connections, Audit exist and must be extended, never duplicated
3. **Multi-tenant isolation** — All data uses `account_id` with RLS via `has_role_in_account()` or `is_account_member()`
4. **Capabilities are persisted in auth context** — All UI reads from `useAuth()` hook, no individual API fetches per component

### 18.2 Database Schema

#### business_capabilities (system-level, immutable by orgs)
```sql
business_capabilities (
  id UUID PRIMARY KEY,
  key TEXT UNIQUE,           -- e.g. 'bookings', 'menu', 'products'
  name TEXT,
  description TEXT,
  category TEXT,             -- commerce, food_hospitality, services, education, ngo, property, events, general
  is_default_enabled BOOLEAN,
  supported_actions JSONB,
  recommended_business_types JSONB,  -- ['hotel', 'hotel_restaurant']
  navigation JSONB           -- {label, icon, route, section}
)
```

#### account_capabilities (organization-level configuration)
```sql
account_capabilities (
  id UUID PRIMARY KEY,
  account_id UUID REFERENCES accounts(id),
  capability_key TEXT REFERENCES business_capabilities(key),
  is_enabled BOOLEAN,
  config JSONB,
  UNIQUE(account_id, capability_key)
)
```

### 18.3 Business Types

```typescript
type BusinessType = 
  | 'retailer' | 'wholesaler' | 'restaurant' | 'hotel' | 'hotel_restaurant'
  | 'service_business' | 'professional_services' | 'education' | 'ngo_nonprofit'
  | 'property_real_estate' | 'healthcare' | 'events' | 'other';
```

### 18.4 Capability Categories

```typescript
type CapabilityCategory = 
  | 'commerce' | 'food_hospitality' | 'services' | 'education'
  | 'ngo' | 'property' | 'events' | 'general';
```

### 18.5 Business Type → Capability Mappings

| Business Type | Recommended Capabilities |
|--------------|-------------------------|
| retailer | products, product_catalog, inventory, orders, inquiries |
| wholesaler | products, product_catalog, inventory, orders, wholesale, pricing, inquiries |
| restaurant | menu, food_orders, reservations, events, inquiries |
| hotel | accommodation, bookings, hospitality_services, events, inquiries |
| hotel_restaurant | accommodation, bookings, menu, food_orders, hospitality_services, events, inquiries |
| service_business | services, appointments, service_requests, inquiries |
| education | courses, education_programs, applications, events, resources, inquiries |
| ngo_nonprofit | programs, ngo_services, applications, events, resources, donations, inquiries |
| property_real_estate | property_listings, property_inquiries, viewings, inquiries |
| events | events, registrations, bookings, inquiries |

### 18.6 File Locations

| Component | Path |
|-----------|------|
| Capability registry | `src/lib/business/capabilities.ts` |
| Capability API | `src/app/api/business/capabilities/route.ts` |
| Account capabilities API | `src/app/api/business/capabilities/account/route.ts` |
| Workspace creation API | `src/app/api/workspaces/route.ts` |
| Business settings UI | `src/components/settings/business-settings.tsx` |
| Settings sections | `src/components/settings/settings-sections.ts` |
| Onboarding flow | `src/app/onboarding/_components/workspace-form.tsx` |
| Auth context | `src/hooks/use-auth.tsx` |
| Sidebar navigation | `src/components/layout/sidebar.tsx` |
| Audit events | `src/lib/audit/events.ts` |
| Database migration | `supabase/migrations/067_business_classification_and_capabilities.sql` |

### 18.7 Auth Context API

```typescript
// From useAuth()
{
  // Existing
  accountId: string | null;
  accountRole: AccountRole | null;
  workspaces: Workspace[];
  
  // New - Business Classification
  businessType: BusinessType | null;
  capabilities: CapabilityItem[];           // Full capability data
  enabledCapabilities: string[];            // Just the keys
  refreshCapabilities: () => Promise<void>;
}

// CapabilityItem shape
interface CapabilityItem {
  key: string;
  name: string;
  description: string | null;
  category: string;
  is_enabled: boolean;
  navigation: CapabilityNavigation | null;
}

// CapabilityNavigation shape
interface CapabilityNavigation {
  label: string;
  icon: string;         // Lucide icon name
  route: string;        // e.g. '/bookings'
  section: 'catalog' | 'operations' | 'settings';
}
```

### 18.8 Capability Flow

```
1. User creates workspace → selects business_type
2. API creates account → calls getRecommendedCapabilityKeys()
3. Upserts account_capabilities with recommended ones enabled
4. Auth context fetches capabilities via /api/business/capabilities/account
5. Sidebar reads capabilities from auth context → renders nav items
6. Settings page can toggle capabilities → refreshes auth context
```

### 18.9 Adding New Capabilities

1. Add to `business_capabilities` table in migration
2. Add navigation metadata if it needs sidebar items:
   ```sql
   INSERT INTO business_capabilities (key, name, description, category, is_default_enabled, recommended_business_types, navigation)
   VALUES ('my_feature', 'My Feature', 'Description', 'category', FALSE, '["hotel"]'::jsonb, '{"label": "My Feature", "icon": "IconName", "route": "/my-feature", "section": "operations"}'::jsonb);
   ```
3. Add icon to `CAPABILITY_ICONS` map in `sidebar.tsx`
4. Add to `BUSINESS_TYPES` recommendations in `capabilities.ts` if needed

### 18.10 Future Phases

| Phase | Focus | Key Features |
|-------|-------|-------------|
| Phase 1 | Business Classification | ✅ Complete |
| Phase 2 | Offerings/Catalog | Generic offerings table, capability-aware catalog types, Flow/Automation triggers |
| Phase 3 | Operational Actions | Actions plug into existing Flow engine, events become automation triggers |
| Phase 4 | External Integrations | Use existing api_keys/webhook architecture, Connection → Provider → Supported capabilities |
