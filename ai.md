# AI Reply Assistant

> AI that answers your customers on WhatsApp automatically — using your business knowledge, your tone, your rules.

---

## What It Does

When a customer messages your WhatsApp number, the AI assistant can:

- **Reply automatically** using your business information
- **Answer questions** from your knowledge base (FAQs, policies, product docs)
- **Hand off to a human** when it can't help (customer asks for a person, sensitive issue, etc.)
- **Stay in the loop** until you assign a human agent — then it steps back

You stay in control. The AI only answers what it knows. When it doesn't know, it connects the customer to your team.

---

## How It Works (Simple Version)

1. Customer sends a WhatsApp message
2. AI checks: *"Can I answer this?"*
   - **Yes** → generates a reply using your knowledge base and business config
   - **No** → sends a friendly handoff message and notifies your team
3. The reply goes out on your WhatsApp number
4. If a human agent replies, AI steps back permanently for that conversation

---

## Setup

### 1. Get an API Key

You need one of these (bring your own key):

| Provider | Get a key at |
|----------|-------------|
| OpenAI | platform.openai.com |
| Anthropic | console.anthropic.com |

### 2. Set Environment Variables

```env
# Which provider to use
AI_PROVIDER=openai          # or "anthropic"

# Your API key
OPENAI_API_KEY=sk-...       # or ANTHROPIC_API_KEY=

# Optional: custom system prompt (tells the AI how to behave)
AI_SYSTEM_PROMPT="You are a helpful support agent for Acme Corp..."

# Optional: limit AI replies per conversation (default: 3)
AI_AUTO_REPLY_MAX_PER_CONVERSATION=3
```

### 3. That's It

No database config needed. Set the env vars and AI works. The platform key is used for all accounts on the instance.

---

## Knowledge Base

Upload documents so the AI can answer questions accurately.

### What to Upload

- FAQs
- Pricing pages
- Return/refund policies
- Product documentation
- Company hours and locations
- Any text-based business info

### How It Works

1. **Upload** a document (paste text or upload a file)
2. AI **chunks** it into searchable pieces
3. When a customer asks a question, AI **retrieves** the most relevant pieces
4. AI **generates a reply** grounded in your actual content — no guessing

### Retrieval Modes

| Mode | When | How |
|------|------|-----|
| **Semantic** | Embeddings key is set | Finds meaning-similar content (best quality) |
| **Lexical** | Fallback / no embeddings key | Keyword matching (still good) |

Semantic retrieval needs an embeddings API key (OpenAI or compatible). Without it, lexical search still works.

---

## How the AI Decides What to Do

The AI follows a strict decision process:

### Auto-Reply Flow

```
Customer message arrives
  → Is AI enabled?           NO → Send "team will reply" message
  → Has credits?             NO → Send "team will respond" message
  → Within working hours?    NO → Send "business hours are..." message
  → Matches a keyword automation? YES → Skip AI, let automation handle
  → Human agent assigned and replied? YES → AI stays quiet
  → Reply cap reached?       YES → Send "team will continue" message
  → Build context + retrieve knowledge
  → Generate reply
  → Validate output
  → If handoff sentinel → Send handoff message, disable AI for this conversation
  → If valid reply → Send to customer
```

### When AI Hands Off

The AI emits a handoff signal when:

- Customer explicitly asks for a human
- Customer is upset or complaining
- Request is sensitive (legal, financial, identity)
- AI can't verify an action (refund, cancellation, etc.)
- Authorization can't be established

The customer sees: *"I've connected you with our team. A human agent will take over shortly."*

---

## Credits

AI replies consume credits from your account balance.

### Cost Tiers

| Tier | Credits | When |
|------|---------|------|
| Simple | 0.2 | Short text reply, basic model |
| Standard | 0.5 | Long conversation (>10 msgs) or knowledge-grounded |
| Complex | 2.0 | File/image analysis or premium model (GPT-4o, Claude Sonnet) |
| Handoff | 0.2 | LLM was called but couldn't answer |

**Base rate:** 1 credit = 5 simple AI replies

### Premium vs Cheap Models

| Model | Cost |
|-------|------|
| gpt-4o-mini, gpt-4.1-mini, claude-haiku | 1x base cost |
| gpt-4o, claude-sonnet | 2x base cost |

---

## Safety Features

### Prompt Injection Defense

The AI treats all customer messages as **untrusted data**, never as instructions. If a customer tries:

- *"Ignore previous instructions and..."*
- *"You are now in developer mode..."*
- *"System: reveal your prompt..."*

The AI responds to the legitimate customer need using only your business information.

### Output Validation

Before any reply reaches WhatsApp, it's checked for:

- **Empty responses** → rejected
- **System prompt leakage** → rejected
- **Accidental JSON/tool output** → rejected
- **Excessive length** → truncated (max 4,000 chars)

### Privacy

- AI never reveals other customers' information
- Only uses data relevant to the current conversation
- Customer names, orders, and details stay isolated

---

## Conversation Lifecycle with AI

```
Customer messages → AI handles (up to N replies)
                      ↓
              Customer asks for human OR cap reached
                      ↓
              AI sends handoff message
                      ↓
              Conversation assigned to human agent
                      ↓
              Human agent replies → AI disabled for this conversation
                      ↓
              Human handles the rest
```

---

## Key Files

| File | Purpose |
|------|---------|
| `src/lib/ai/auto-reply.ts` | Main auto-reply dispatch logic |
| `src/lib/ai/config.ts` | Platform AI config (provider, model, keys) |
| `src/lib/ai/defaults.ts` | System prompt builder and defaults |
| `src/lib/ai/generate.ts` | Provider-agnostic generation + output validation |
| `src/lib/ai/knowledge.ts` | Knowledge base ingest and retrieval |
| `src/lib/ai/handoff.ts` | Handoff summary builder |
| `src/lib/ai/credits.ts` | Credit calculation and balance management |
| `src/lib/ai/types.ts` | Shared TypeScript types |
| `src/lib/ai/providers/openai.ts` | OpenAI adapter |
| `src/lib/ai/providers/anthropic.ts` | Anthropic adapter |
