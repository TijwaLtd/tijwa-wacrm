# Flows — Visual Automation Builder

> No-code, node-based conversational automation for WhatsApp. Build branching chatbots, lead-capture funnels, FAQ bots, and handoff workflows by connecting nodes in a visual editor — no code required.

---

## Table of Contents

1. [What Is a Flow?](#1-what-is-a-flow)
2. [What Is a Node?](#2-what-is-a-node)
3. [How to Create a Flow](#3-how-to-create-a-flow)
4. [Node Types Reference](#4-node-types-reference)
5. [Triggers](#5-triggers)
6. [Fallback Policy](#6-fallback-policy)
7. [Variables & Interpolation](#7-variables--interpolation)
8. [Flow Lifecycle & Run States](#8-flow-lifecycle--run-states)
9. [How the Engine Works](#9-how-the-engine-works)
10. [Starter Templates](#10-starter-templates)
11. [Validation Rules](#11-validation-rules)
12. [Database Schema](#12-database-schema)
13. [Key Files](#13-key-files)

---

## 1. What Is a Flow?

A **flow** is a saved conversational automation that runs when a customer messages your WhatsApp number. It's defined by:

| Property | Description |
|----------|-------------|
| **Name** | Display name in the flow list |
| **Status** | `draft` (building), `active` (live), `archived` (disabled) |
| **Trigger** | What starts the flow (keyword, first message, or manual) |
| **Entry node** | The first node the engine executes |
| **Fallback policy** | What happens when the customer sends an unexpected reply |
| **Nodes** | The graph of steps, messages, and decisions |

Flows are stored in the `flows` table (definition) and `flow_nodes` table (graph). One flow can have many **runs** — one per contact at a time.

---

## 2. What Is a Node?

A **node** is a single step in a flow. Each node has:

- **`node_key`** — a stable string identifier (e.g. `"welcome"`, `"ask_name"`). All edge references point to node_keys, not UUIDs.
- **`node_type`** — determines what the node does (see [Node Types](#4-node-types-reference)).
- **`config`** — a JSONB blob whose shape depends on `node_type`. This holds the message text, button options, condition logic, etc.

**Edges live inside config.** There is no separate `flow_edges` table. Each button's `next_node_key`, each condition's `true_next`/`false_next`, and each message's `next_node_key` are stored inside the node's config JSONB. This means:
- The engine only needs a single-row lookup to know where to go next.
- Cloning a flow never requires UUID rewriting — node_keys are stable strings.
- The validator checks all edge references at save time.

---

## 3. How to Create a Flow

### From scratch

1. Go to **Flows** → **New Flow**
2. Give it a name and pick a trigger type (keyword / first message / manual)
3. The editor opens with a single **Start** node
4. Add nodes from the node palette and connect them
5. Set the **entry node** (usually the Start node)
6. Save as draft, then **Activate** when ready

### From a template

1. Go to **Flows** → **New Flow** → **From Template**
2. Pick a starter template (Welcome Menu, FAQ Bot, Lead Capture)
3. The template clones into a new flow with all nodes pre-wired
4. Edit any node's config to customize text, buttons, etc.
5. Activate

### Editor views

- **Linear list view** (`flow-builder.tsx`) — nodes rendered as a vertical card list. Good for simple flows.
- **Canvas view** (`flow-canvas.tsx`) — React-Flow powered drag-and-drop graph. Good for complex branching flows.

Both views share the same `flow-editor-state.tsx` state provider, so toggling views never loses your edits.

---

## 4. Node Types Reference

### `start`

**Purpose:** Entry point of every flow. Contains no logic — just points to the first real node.

| Config field | Type | Description |
|-------------|------|-------------|
| `next_node_key` | string | The node to advance to after start |

**Engine behavior:** Immediately follows `next_node_key` to the next node. No message is sent, no customer input is needed.

---

### `send_message`

**Purpose:** Send a plain text message to the customer, then auto-advance.

| Config field | Type | Description |
|-------------|------|-------------|
| `text` | string | Message body. Supports `{{vars.X}}` interpolation. |
| `next_node_key` | string | Node to advance to after the message is sent |

**Engine behavior:** Sends the text via WhatsApp, logs the message ID, then follows `next_node_key`. If the send fails, the run ends with `status=failed`.

---

### `send_media`

**Purpose:** Send an image, video, or document to the customer, then auto-advance.

| Config field | Type | Description |
|-------------|------|-------------|
| `media_type` | `"image"` \| `"video"` \| `"document"` | WhatsApp media type |
| `media_url` | string | Public URL of the uploaded file (from `flow-media` bucket) |
| `caption` | string? | Optional caption (supports `{{vars.X}}` interpolation) |
| `filename` | string? | Filename shown in chat (documents only) |
| `next_node_key` | string | Node to advance to after the send |

**Engine behavior:** Sends the media via WhatsApp's media endpoint, logs the message ID, then follows `next_node_key`. If the send fails, the run ends with `status=failed`.

**Upload:** The builder uploads files to the `flow-media` Supabase Storage bucket. The file is publicly accessible so Meta can fetch it at send time. Path convention: `account-{accountId}/{timestamp}-{filename}.{ext}`.

---

### `send_buttons`

**Purpose:** Send an interactive button message and **suspend** the flow, waiting for the customer to tap a button.

| Config field | Type | Description |
|-------------|------|-------------|
| `text` | string | Message body above the buttons |
| `header_text` | string? | Optional header line |
| `footer_text` | string? | Optional footer line |
| `buttons` | Array | 1–3 buttons (Meta limit) |
| `buttons[].reply_id` | string | Stable ID sent back by Meta when tapped |
| `buttons[].title` | string | Button label (max 20 chars per Meta) |
| `buttons[].next_node_key` | string | Node to advance to when this button is tapped |

**Engine behavior:** Sends the button message, stores the internal message ID as `last_prompt_message_id` (for quoting in inbox), then returns `outcome: "advanced"` — the run suspends at this node. When the customer taps a button, the engine receives an `interactive_reply` and uses `matchReplyId()` to find the matching `next_node_key`.

---

### `send_list`

**Purpose:** Send an interactive list message (menu) and **suspend** the flow, waiting for the customer to pick a row.

| Config field | Type | Description |
|-------------|------|-------------|
| `text` | string | Message body |
| `button_label` | string | Text on the tap-to-expand button |
| `header_text` | string? | Optional header |
| `footer_text` | string? | Optional footer |
| `sections` | Array | 1+ sections, each with rows |
| `sections[].title` | string? | Section heading |
| `sections[].rows` | Array | 1–10 rows total across all sections (Meta limit) |
| `sections[].rows[].reply_id` | string | Stable ID sent back when tapped |
| `sections[].rows[].title` | string | Row title |
| `sections[].rows[].description` | string? | Row description |
| `sections[].rows[].next_node_key` | string | Node to advance to when this row is tapped |

**Engine behavior:** Same as `send_buttons` — sends the list, suspends, and resolves the customer's pick via `matchReplyId()`.

---

### `collect_input`

**Purpose:** Send a prompt to the customer, then capture their next free-text reply into a variable.

| Config field | Type | Description |
|-------------|------|-------------|
| `prompt_text` | string | What to ask the customer (supports `{{vars.X}}`) |
| `var_key` | string | Variable name to store the answer under |
| `validation` | `"any"` \| `"email"` \| `"phone"` \| `"regex"` | Reserved for v2 (ignored by engine in v1) |
| `regex` | string? | Used when `validation === "regex"` (v2) |
| `next_node_key` | string | Node to advance to after capture |

**Engine behavior:** Sends the prompt, then suspends. When the customer replies with text, the engine stores the trimmed text in `flow_runs.vars[var_key]`, resets `reprompt_count` to 0, and follows `next_node_key`. If the customer sends an empty message, the fallback policy fires.

**Variable interpolation:** Downstream `send_message` and `handoff` nodes can reference the captured value with `{{vars.var_key}}`.

---

### `condition`

**Purpose:** Branch the flow based on a comparison against a variable, tag, or contact field. Pure logic — no message is sent, no customer input needed.

| Config field | Type | Description |
|-------------|------|-------------|
| `subject` | `"var"` \| `"tag"` \| `"contact_field"` | What to evaluate |
| `subject_key` | string | For `var`: the var key. For `tag`: the tag UUID. For `contact_field`: `name`/`email`/`phone`/`company`. |
| `operator` | `"equals"` \| `"contains"` \| `"present"` \| `"absent"` | Comparison operator |
| `value` | string? | Comparison value (required for `equals`/`contains`) |
| `true_next` | string | Node to advance to when the condition is true |
| `false_next` | string | Node to advance to when the condition is false |

**Engine behavior:**
- `subject === "var"`: reads `flow_runs.vars[subject_key]`
- `subject === "tag"`: checks if `contact_tags` has this tag for the contact → subject is the tag UUID if present, `undefined` if absent
- `subject === "contact_field"`: reads the field from the `contacts` table

Operators:
- `equals` — exact string match
- `contains` — substring match
- `present` — true if the subject value exists (is not null/empty)
- `absent` — true if the subject value does not exist

Immediately follows `true_next` or `false_next`. No Meta call.

---

### `set_tag`

**Purpose:** Add or remove a tag on the contact, then auto-advance.

| Config field | Type | Description |
|-------------|------|-------------|
| `mode` | `"add"` \| `"remove"` | Whether to add or remove the tag |
| `tag_id` | string | UUID of the tag to apply |
| `next_node_key` | string | Node to advance to after the tag change |

**Engine behavior:** Calls `addContactTagAndDispatch()` or `removeContactTag()`. Tag operations are non-fatal — if the write fails, the engine logs an error event but still advances to the next node so the customer isn't stranded.

---

### `handoff`

**Purpose:** End the automated flow and transfer the conversation to a human agent.

| Config field | Type | Description |
|-------------|------|-------------|
| `note` | string? | Internal note written to `flow_run_events` (supports `{{vars.X}}`) |
| `assign_to` | string? | User ID of the agent to assign the conversation to |

**Engine behavior:** Sets the conversation status to `pending` (if there is a conversation), optionally assigns the specified agent, logs a handoff event with the note, then ends the run with `status=handed_off`. The conversation now appears in the human agent's inbox.

---

### `end`

**Purpose:** Explicitly terminate the flow. No message is sent.

| Config field | Type |
|-------------|------|
| *(none)* | Empty object |

**Engine behavior:** Logs a `completed` event and ends the run with `status=completed`. The conversation stays in its current status (typically `open`).

---

## 5. Triggers

A trigger determines how a flow starts. Defined on the `flows` table.

### `keyword`

The flow starts when the customer's inbound text message matches one or more keywords.

| Config field | Type | Description |
|-------------|------|-------------|
| `keywords` | string[] | One or more keywords to match |
| `match_type` | `"exact"` \| `"contains"` | Match strategy (default: `"contains"`) |
| `case_sensitive` | boolean | Case-sensitive matching (default: `false`) |

**Matching logic:** Case-insensitive by default. `"contains"` means the keyword can appear anywhere in the message. `"exact"` means the message must equal the keyword exactly (after lowercasing).

### `first_inbound_message`

The flow starts on the customer's very first message to the business. No keyword matching — any text message triggers it.

No config fields.

### `manual`

The flow does not auto-start from inbound messages. You start it manually (e.g. from a quick reply or API call).

No config fields.

### Quick Reply → Flow linking

A quick reply can be linked to a flow. When the customer taps a quick reply whose buttons are linked to a flow, the engine starts that flow directly — no trigger matching needed. The webhook passes `quickReplyFlowId` to the engine.

---

## 6. Fallback Policy

When the customer sends a reply that doesn't match any expected option (e.g. they type text instead of tapping a button), the **fallback policy** decides what happens.

Defined per flow in `flows.fallback_policy` (JSONB):

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `on_unknown_reply` | `"reprompt"` \| `"handoff"` \| `"ignore"` | `"reprompt"` | What to do on the first unmatched reply |
| `max_reprompts` | number | `2` | How many times to re-prompt before exhausting |
| `on_timeout_hours` | number | `24` | Hours before an inactive run is swept as timed out |
| `on_exhaust` | `"handoff"` \| `"end"` | `"handoff"` | What to do after `max_reprompts` is exceeded |

**Decision flow:**
1. `on_unknown_reply: "ignore"` → do nothing, let automations have a shot
2. `on_unknown_reply: "handoff"` → immediately escalate to a human
3. `on_unknown_reply: "reprompt"` → re-send the current prompt; if `reprompt_count > max_reprompts`, apply `on_exhaust`

---

## 7. Variables & Interpolation

Variables are captured by `collect_input` nodes and stored in `flow_runs.vars` (JSONB). They can be referenced anywhere in the flow using the `{{vars.key}}` syntax.

**Example:**
```
"Thanks {{vars.name}}! What's your email?"
```

If `vars.name` is `"Alice"`, the engine renders: `"Thanks Alice! What's your email?"`

Missing variables render as empty string. Variables persist for the lifetime of a run and are accessible to:
- `send_message` nodes (in `text`)
- `send_media` nodes (in `caption`)
- `handoff` nodes (in `note`)
- `condition` nodes (as a subject source)

---

## 8. Flow Lifecycle & Run States

### Flow statuses

```
draft → active → archived
```

- **draft**: Not live. Inbound messages won't trigger it. Builder can save freely.
- **active**: Live. Inbound messages are matched against its trigger.
- **archived**: Disabled. Removed from trigger matching.

### Run statuses

| Status | Meaning |
|--------|---------|
| `active` | Currently awaiting customer input |
| `completed` | Reached an `end` node naturally |
| `handed_off` | Ended via a `handoff` node or fallback exhaustion |
| `timed_out` | Swept by cron after `on_timeout_hours` of inactivity |
| `paused_by_agent` | A human agent sent a message; flow yielded |
| `failed` | Unrecoverable error (send failure, missing node, etc.) |

### Concurrency safety

- **One active run per contact**: The partial unique index `idx_one_active_run_per_contact` ensures at most one active run per `(user_id, contact_id)`. Two concurrent webhook deliveries trying to start a run collide at INSERT time; the second gets a 23505 error and exits gracefully.
- **Idempotency**: The engine checks `flow_run_events` for `reply_received` events with the same `meta_message_id`. Duplicate Meta retries are silently ignored.
- **Optimistic advance**: `advanceCurrentNodeKey()` uses an UPDATE with a WHERE clause matching the expected old key. If another webhook beat us, the UPDATE returns 0 rows and the run is a no-op.

---

## 9. How the Engine Works

The engine is in `src/lib/flows/engine.ts`. The single entry point is `dispatchInboundToFlows()`.

### Inbound flow

```
WhatsApp webhook
  → dispatchInboundToFlows()
      → Is there an active run for this contact?
          YES → handleReplyForActiveRun()
                  → Does the reply match a button/list option or collect_input?
                      YES → capture var, advance from that node
                      NO  → fallback policy (reprompt / handoff / ignore)
          NO  → Does a quick-reply-linked flow exist?
                  YES → startNewRun()
                  NO  → Does the message match any active flow's trigger?
                          YES → startNewRun()
                          NO  → return { consumed: false }
```

### Advance loop

`advanceFromNodeKey()` walks through auto-advance nodes in a loop:
- `start` → follow `next_node_key`
- `send_message` → send, follow `next_node_key`
- `send_media` → send, follow `next_node_key`
- `set_tag` → apply/remove tag, follow `next_node_key`
- `condition` → evaluate, follow `true_next` or `false_next`
- `send_buttons` / `send_list` → send, **suspend** (return)
- `handoff` → execute handoff, **end run**
- `end` → **end run**

A safety cap of 64 iterations prevents infinite loops from cycles in the graph.

---

## 10. Starter Templates

Three pre-built templates can be cloned with one click:

### Welcome Menu (`welcome_menu`)
- **Trigger:** keyword (`"support"`, `"help"`, `"hi"`)
- **What it does:** Greets the customer with buttons ("Existing customer" / "New customer") and hands off to an agent with a contextual note.

### FAQ Bot (`faq_bot`)
- **Trigger:** keyword (`"faq"`, `"question"`, `"info"`)
- **What it does:** Sends a list menu with topics (Opening hours, Pricing, Refund policy, Talk to a human). Each answer is a `send_message` that ends the flow. The "Talk to a human" option hands off.

### Lead Capture (`lead_capture`)
- **Trigger:** `first_inbound_message`
- **What it does:** Collects name, email, and company via three `collect_input` nodes with interpolated prompts, then hands off to sales with all answers in the note.

---

## 11. Validation Rules

Validation runs at **activation time** (not on every draft save). Issues are split into errors (block activation) and warnings.

### Errors (block activation)

- Flow name is empty
- No nodes exist
- Entry node is not set or points to a non-existent node
- Any `next_node_key`, `true_next`, `false_next`, button `next_node_key`, or list row `next_node_key` points to a non-existent node
- Duplicate `node_key` values
- `send_message` / `send_media` / `collect_input` / `set_tag` node missing required config fields
- `send_buttons` with 0 buttons, >3 buttons, missing `reply_id`/`title`/`next_node_key`, or duplicate `reply_id`
- `send_list` with 0 rows, >10 rows total, missing fields, or duplicate `reply_id`
- `condition` with missing `subject`, `subject_key`, `operator`, or missing `true_next`/`false_next`
- `condition` using `equals`/`contains` with an empty `value` — would only match empty subjects
- `set_tag` with missing `mode` or `tag_id`
- Cycle detected in the graph (DFS back-edge from entry)
- Node type not in the allowed set

### Warnings (do not block activation)

- Keyword trigger with blank keywords
- Node unreachable from the entry node

---

## 12. Database Schema

### `flows` (migration 010)

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | PK |
| `user_id` | UUID | FK → auth.users (owner) |
| `account_id` | UUID | FK → accounts (tenancy, NOT NULL post-017) |
| `name` | TEXT | Display name |
| `description` | TEXT? | Optional description |
| `status` | TEXT | `'draft'` / `'active'` / `'archived'` |
| `trigger_type` | TEXT | `'keyword'` / `'first_inbound_message'` / `'manual'` |
| `trigger_config` | JSONB | Trigger-specific config |
| `entry_node_id` | TEXT? | `node_key` of the entry node |
| `fallback_policy` | JSONB | Fallback config (defaults provided) |
| `execution_count` | INTEGER | Total runs |
| `last_executed_at` | TIMESTAMPTZ? | Last run start |

### `flow_nodes` (migration 010)

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | PK |
| `flow_id` | UUID | FK → flows (CASCADE delete) |
| `node_key` | TEXT | Stable string ID (unique per flow) |
| `node_type` | TEXT | One of the 11 allowed types |
| `config` | JSONB | Node-type-specific config |
| `position_x` | INTEGER | Canvas X coordinate (v2) |
| `position_y` | INTEGER | Canvas Y coordinate (v2) |

UNIQUE constraint: `(flow_id, node_key)`

### `flow_runs` (migration 010)

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | PK |
| `flow_id` | UUID | FK → flows (CASCADE) |
| `account_id` | UUID | FK → accounts (tenancy) |
| `user_id` | UUID | FK → auth.users (audit) |
| `contact_id` | UUID? | FK → contacts (SET NULL on delete) |
| `conversation_id` | UUID? | FK → conversations (SET NULL on delete) |
| `status` | TEXT | Run status (see [Run statuses](#run-statuses)) |
| `current_node_key` | TEXT? | Where the run is currently suspended |
| `last_prompt_message_id` | UUID? | FK → messages (for quoting) |
| `vars` | JSONB | Captured variables from `collect_input` |
| `reprompt_count` | INTEGER | Consecutive unmatched replies |
| `started_at` | TIMESTAMPTZ | Run start |
| `last_advanced_at` | TIMESTAMPTZ | Last advance timestamp |
| `ended_at` | TIMESTAMPTZ? | Run end |
| `end_reason` | TEXT? | Why the run ended |

Partial unique index: `idx_one_active_run_per_contact` on `(user_id, contact_id) WHERE status = 'active'`

### `flow_run_events` (migration 010)

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | PK |
| `flow_run_id` | UUID | FK → flow_runs (CASCADE) |
| `event_type` | TEXT | `started`, `node_entered`, `message_sent`, `reply_received`, `fallback_fired`, `handoff`, `timeout`, `error`, `completed` |
| `node_key` | TEXT? | Which node this event is about |
| `payload` | JSONB | Event-specific data |

---

## 13. Key Files

| File | Purpose |
|------|---------|
| `src/lib/flows/types.ts` | All TypeScript types — node configs, triggers, DB rows, engine input/output |
| `src/lib/flows/engine.ts` | Flow execution engine — `dispatchInboundToFlows`, advance loop, node executors |
| `src/lib/flows/validate.ts` | Save-time validation — trigger sanity, graph integrity, cycle detection, Meta limits |
| `src/lib/flows/fallback.ts` | Fallback policy resolver and decision logic |
| `src/lib/flows/meta-send.ts` | WhatsApp send wrappers used by the engine |
| `src/lib/flows/templates.ts` | Three starter flow templates |
| `src/lib/flows/edges.ts` | Canvas edge derivation and inverse operations |
| `src/lib/flows/admin-client.ts` | Supabase service-role client for server-side engine access |
| `src/components/flows/flow-editor-state.tsx` | Shared editor state provider (list + canvas views) |
| `src/components/flows/flow-builder.tsx` | Linear list editor |
| `src/components/flows/flow-canvas.tsx` | React-Flow canvas editor |
| `src/components/flows/node-config-form.tsx` | Per-node-type configuration forms |
| `src/app/(dashboard)/flows/page.tsx` | Flow list page |
| `src/app/(dashboard)/flows/[id]/page.tsx` | Flow editor page |
| `src/app/(dashboard)/flows/[id]/runs/page.tsx` | Run history viewer |
| `src/app/api/flows/route.ts` | Flow list + create API |
| `src/app/api/flows/[id]/route.ts` | Flow GET / PUT / DELETE API |
| `src/app/api/flows/[id]/activate/route.ts` | Flow activation endpoint |
| `supabase/migrations/010_flows.sql` | Core schema: flows, flow_nodes, flow_runs, flow_run_events |
| `supabase/migrations/016_flow_media.sql` | `send_media` support + `flow-media` storage bucket |
