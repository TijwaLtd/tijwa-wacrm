---
title: Platform Policy
description: How the Tijwa platform processes your data and powers the AI assistant
order: 3
version: ke-eu-v1
effective: 7 October 2026
---

This Platform Policy explains how Tijwa — the messaging platform {{business}} uses to talk to you — processes your data and powers the AI assistant. It complements the business's own [Terms of Service]({{slug}}/legal/terms) and [Privacy Policy]({{slug}}/legal/privacy); where there is any conflict, those documents govern the business's relationship with you, and this policy governs Tijwa's role as the platform.

## 1. What Tijwa is

Tijwa is a customer messaging and CRM platform. It gives businesses tools to manage WhatsApp conversations, catalogues, orders, bookings and AI-assisted replies. When you message {{business}} on WhatsApp, Tijwa is the technical layer that routes your messages, stores conversation history on the business's behalf, and (where enabled) runs the AI assistant that helps draft replies.

Tijwa acts as a **data processor** — it handles your personal data only on {{business}}'s instructions and under its agreement with the business. The business remains the **data controller** and is responsible for decisions about your data.

## 2. How the AI assistant works

The AI assistant analyses your messages to understand your intent and draft helpful replies. It can:

- Answer questions about the business's products, services, prices and availability
- Search the business's catalogue and suggest items
- Help you place orders and bookings
- Escalate to a human agent when you ask, or when the AI is not confident

The AI assistant does **not** have the authority to make commitments on behalf of the business. Any order, booking, price or arrangement is only confirmed when you receive an explicit confirmation — either from the AI with the business's approval, or from a human agent.

AI responses may occasionally be wrong. Always check important details (prices, dates, quantities, availability) before acting on them. You can ask for a human agent at any time by saying so in the chat.

## 3. What data the AI assistant sees

To generate a reply, the AI assistant receives:

- Your current message text
- Relevant context from your conversation history with the business
- The business's catalogue and operating information (prices, hours, policies)

The AI assistant processes this data to serve your request. It does not use your messages to train public AI models. Message content sent to the AI provider is done so under data-processing terms that prohibit the provider from using it for its own purposes.

## 4. Data storage and isolation

Your data is stored on Supabase infrastructure with the following protections:

- **Multi-tenant isolation** — each business's data is isolated at the database level; one business cannot see another's customers or conversations
- **Encryption in transit** — all data moves over TLS
- **Encryption at rest** — stored data is encrypted
- **Access controls** — only authorised staff of the business (and Tijwa's infrastructure operators under strict controls) can access data
- **Audit logging** — staff access to customer data is logged

## 5. WhatsApp as a dependency

Your conversations travel over WhatsApp, which is operated by Meta. Meta processes your messages under its own terms and privacy policy — Tijwa does not control Meta's processing. WhatsApp identifiers (such as your wa_id/BSUID) are used to route messages and link them to your contact record.

If WhatsApp is unavailable (network outage, service disruption, policy change), the chat service may be temporarily interrupted. Tijwa is not liable for outages or changes on WhatsApp's side.

## 6. International data transfers

Data may be processed outside Kenya and outside the EU/EEA — including by Tijwa's hosting providers and AI provider. Where data leaves Kenya, the safeguards required by Kenya's Data Protection Act 2019 apply. Where data leaves the EU/EEA, adequacy decisions or standard contractual clauses are relied upon.

## 7. Platform acceptable use

You agree not to:

- Use the chat to send unlawful, harmful, abusive or deceptive content
- Attempt to gain unauthorised access to the platform, other users' data, or the AI systems
- Probe, scan or test the vulnerability of the platform
- Reverse-engineer, scrape or overload the service
- Impersonate another person or misrepresent your identity
- Upload malware, viruses or malicious files

Conversations that violate these rules may be suspended, and where required by law, unlawful content may be reported to the appropriate authorities.

## 8. Data rights on the platform

You can exercise your data rights at any time:

- **Download your data** — message "download my data" in the chat, or use your personal data page
- **Delete your data** — message "delete my data" in the chat, or use your personal data page
- **Correct your data** — ask a human agent in the chat

When you delete your data, Tijwa removes your personal information from the platform as instructed by the business. Where the business must retain records for tax or accounting law, those records are anonymised so they can no longer be linked to you.

## 9. Service availability

Tijwa is provided "as is" and "as available". We work to keep the service running reliably but do not guarantee uninterrupted availability. Scheduled maintenance, emergency fixes, and circumstances outside our reasonable control (including WhatsApp outages, internet failures, or force majeure events) may cause temporary interruptions.

## 10. Changes to this policy

We may update this Platform Policy from time to time. Material changes will be reflected on this page with an updated effective date. The business may also notify you in the chat of significant changes.

## 11. Contact

For questions about Tijwa's role as a platform or how your data is processed at the platform level, ask for a human agent in the chat, or contact {{business}} directly — they control your data and can act on your behalf regarding platform-level requests.
