# WhatsApp Messaging

> Send and receive WhatsApp messages from your CRM — shared inbox, templates, media, interactive messages, and AI-powered auto-replies.

---

## What You Can Do

### Receive Messages

- **Inbound messages** arrive in real-time via Meta's webhook
- Supports: text, images, documents, audio, video, locations, interactive replies (button/list taps)
- Messages land in the shared inbox, assigned to the right conversation
- Unread counts, status tracking (open/pending/closed)

### Send Messages

| Message Type | What It Is | When to Use |
|-------------|-----------|-------------|
| **Text** | Plain text message | Quick replies, follow-ups |
| **Template** | Meta-approved message with variables | First contact, notifications, marketing |
| **Image** | Photo or graphic | Product photos, screenshots |
| **Video** | Video file | Demos, tutorials |
| **Document** | PDF, Word, Excel, etc. | Invoices, contracts, receipts |
| **Audio** | Voice message or audio file | Voice notes, recorded messages |
| **Interactive buttons** | Up to 3 tappable buttons | Menu options, quick choices |
| **Interactive list** | Up to 10 selectable rows | Menus, catalogs, FAQ topics |

### Interactive Messages

**Buttons** — up to 3 per message:
```
Need help with?
[Existing Customer]  [New Customer]  [Talk to Human]
```

**List menus** — up to 10 rows across sections:
```
What can I help you with?          [View Topics]

  Common Questions
  ├── Opening hours
  ├── Pricing
  └── Refund policy
  
  Other
  └── Talk to a human
```

---

## How It Works

### Receiving a Message

```
Customer sends WhatsApp message
  → Meta webhook fires
  → wacrm verifies signature (HMAC-SHA256)
  → Message parsed and stored in `messages` table
  → Conversation resolved (existing or new)
  → Flows checked (does a flow match this trigger?)
  → AI checked (can AI handle this?)
  → Inbox updated in real-time (Supabase Realtime)
```

### Sending a Message

```
Agent types message (or AI generates one)
  → Message validated (type, content, media)
  → Phone number sanitized for Meta API
  → Sent to Meta WhatsApp Cloud API
  → Response stored in `messages` table
  → Conversation last_message updated
  → Active flow run paused (if agent stepped in)
  → Delivery/read receipts tracked via webhook
```

---

## Message Types in Detail

### Text Messages

Simple text up to 4,096 characters. Supports WhatsApp formatting:
- `*bold*` — **bold text**
- `_italic_` — _italic text_
- `~strikethrough~` — ~~strikethrough~~
- `` `monospace` `` — `monospace text`

### Template Messages

Pre-approved by Meta before use. Required for:
- First message to a new customer (within 24h window)
- Marketing and notification messages
- Any message sent outside the 24h customer-service window

Templates support:
- **Variables** — `{{1}}`, `{{2}}` placeholders filled per recipient
- **Header** — text, image, video, or document
- **Body** — the main message with variables
- **Buttons** — call-to-action or quick-reply buttons

### Media Messages

| Type | Max Size | Formats |
|------|----------|---------|
| Image | 5 MB | PNG, JPEG, WebP |
| Video | 16 MB | MP4, 3GPP |
| Document | 16 MB | PDF, Word, Excel, PowerPoint, text |
| Audio | 16 MB | MP3, OGG, AMR |

Media is uploaded to Supabase Storage and served via public URL for Meta to fetch.

---

## Conversations

### Status Flow

```
open → pending → closed
 ↑       ↑
 └───────┘ (reopened on new message)
```

| Status | Meaning |
|--------|---------|
| `open` | Active, waiting for agent response |
| `pending` | Agent assigned, awaiting their reply |
| `closed` | Conversation ended |

### Assignment

- **Auto-assign** — round-robin or skill-based routing
- **Manual assign** — pick an agent from the team
- **AI handoff** — AI assigns when it can't help
- **Flow handoff** — flow's handoff node assigns

### Real-Time Updates

The inbox updates live via Supabase Realtime:
- New messages appear instantly
- Conversation status changes
- Agent presence (online/away)
- Unread counts update

---

## Flows + Messaging

Flows can send messages as part of an automated conversation:

| Flow Node | Message Type | Suspends? |
|-----------|-------------|-----------|
| `send_message` | Text | No (auto-advances) |
| `send_media` | Image/video/document | No (auto-advances) |
| `send_buttons` | Interactive buttons | Yes (waits for tap) |
| `send_list` | Interactive list | Yes (waits for pick) |
| `collect_input` | Text prompt | Yes (waits for reply) |
| `handoff` | None (internal) | Ends run |

### How Flows and Messages Interact

1. **Flow sends a message** → stored in `messages` table like any outbound
2. **Customer replies** → webhook fires → engine checks if reply matches the flow
3. **Button/list tap** → matched by `reply_id` → flow advances to that branch
4. **Free text reply** → captured by `collect_input` into `flow_runs.vars`
5. **Agent sends a message** → flow is paused (`paused_by_agent`)

---

## Webhook Events

The system tracks these delivery events from Meta:

| Event | Meaning |
|-------|---------|
| `message.received` | Customer sent a message |
| `message.sent` | Message sent to Meta |
| `message.delivered` | Message delivered to customer's device |
| `message.read` | Customer read the message |
| `message.failed` | Send failed (number invalid, blocked, etc.) |

---

## Security

- **Webhook verification** — HMAC-SHA256 signature check on every inbound
- **Access tokens** — encrypted at rest with AES-256-GCM
- **Phone validation** — E.164 format enforcement
- **Rate limiting** — per-account and per-key limits
- **RLS** — every table is row-level secured to the account

---

## Quick Replies

Quick replies are pre-defined responses agents can send with one click:
- Stored in the `quick_replies` table
- Can be linked to a flow (tapping starts the flow)
- Organized by category
- Support variable placeholders

---

## Key Files

| File | Purpose |
|------|---------|
| `src/lib/whatsapp/meta-api.ts` | Core Meta API client (send text, template, media, interactive) |
| `src/lib/whatsapp/send-message.ts` | Message sending orchestration |
| `src/lib/whatsapp/interactive.ts` | Interactive message payload builder |
| `src/lib/whatsapp/encryption.ts` | Access token encryption/decryption |
| `src/lib/whatsapp/phone-utils.ts` | Phone number validation and normalization |
| `src/lib/whatsapp/template-components.ts` | Template parsing |
| `src/lib/whatsapp/template-validators.ts` | Template validation |
| `src/lib/whatsapp/resolve-conversation.ts` | Conversation resolution from inbound |
| `src/app/api/whatsapp/webhook/route.ts` | Webhook receiver (inbound + delivery receipts) |
| `src/app/api/whatsapp/send/route.ts` | Dashboard send endpoint |
| `src/components/inbox/message-composer.tsx` | Message composer UI |
| `src/components/inbox/message-thread.tsx` | Message thread view |
| `src/components/inbox/message-bubble.tsx` | Individual message rendering |
