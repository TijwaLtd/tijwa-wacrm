# tijwa-crm — WhatsApp CRM

> WhatsApp CRM by Tijwa Limited — shared inbox, contacts, sales pipelines, broadcasts, and no-code automations.

## What you get out of the box

- **Shared inbox** on the official WhatsApp Business API — multiple
  agents working one number, per-conversation assignment, status, and
  notes.
- **Contacts + tags + custom fields**, CSV import, deduplication.
- **Sales pipelines** (Kanban) with deals linked to conversations.
- **Broadcasts** with Meta-approved templates, delivery + read
  tracking, per-recipient variable substitution.
- **No-code automations** — triggers on inbound messages, new
  contacts, keywords, or schedule; conditional branches, waits,
  tags, webhooks. Visual builder.
- **AI reply assistant** — bring your own OpenAI or Anthropic key
  (stored encrypted; no per-seat AI fee, your data stays yours).
  One-click AI-drafted replies in the inbox, plus an optional
  auto-reply bot with a per-conversation cap and clean human handoff.
  Add a **knowledge base** (FAQs, policies, product docs) and it
  answers from your own content — hybrid retrieval (Postgres full-text,
  or semantic pgvector when an embeddings key is set).
- **Real-time dashboard** — response times, daily volume, pipeline
  value, cross-module activity feed.
- **Team accounts** — invite teammates by link, role-based access
  (owner / admin / agent / viewer), ownership transfer. Every install
  is account-scoped, so one shared inbox can be staffed by a whole
  team. Solo use stays single-user with zero setup.
- **Account management** — email, password, avatar, global sign-out.
- **Public REST API** (`/api/v1`) with scoped, revocable API keys —
  build your own automations on top of your CRM. See
  [docs/public-api.md](./docs/public-api.md).
- **MCP server** — drive your CRM from Claude, Cursor, and other AI
  assistants over the [Model Context Protocol](https://modelcontextprotocol.io).
  Read-only by default, opt-in writes. See [docs/mcp.md](./docs/mcp.md)
  (server in [`mcp-server/`](./mcp-server)).

## Stack

- **App** — Next.js 16 (App Router), React 19, TypeScript, Tailwind v4.
- **Data** — Supabase (Postgres + Auth + Storage + RLS).
- **WhatsApp** — Meta Cloud API (official WhatsApp Business API).

## Documentation

Full documentation — Supabase migrations, WhatsApp Business
API config, and production deploy — lives at
**[tijwa-crm.tijwa.com/docs](https://tijwa-crm.tijwa.com/docs)**.

Key pages:
- [Getting started](https://tijwa-crm.tijwa.com/docs/getting-started)
- [Supabase setup](https://tijwa-crm.tijwa.com/docs/supabase-setup)
- [WhatsApp setup](https://tijwa-crm.tijwa.com/docs/whatsapp-setup)
- [Environment variables](https://tijwa-crm.tijwa.com/docs/environment-variables)
- [Architecture](https://tijwa-crm.tijwa.com/docs/architecture)
- [Troubleshooting](https://tijwa-crm.tijwa.com/docs/troubleshooting)

## License

Proprietary. © 2026 Tijwa Limited. All rights reserved.
# tijwa-crm
