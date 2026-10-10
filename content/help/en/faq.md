---
title: Frequently asked questions
description: The questions we hear most, answered in one place
order: 3
---

## Connecting WhatsApp

### Can I use my existing WhatsApp number?

Yes — the connection flow migrates a regular WhatsApp number to WhatsApp Business API semantics, or you can start fresh with a new number. Either way your existing customers keep chatting on the same number; the conversation simply moves onto the CRM.

### Do my customers need to install anything?

No. Customers message you on ordinary WhatsApp. Everything — inbox, AI agent, catalogs, orders — happens on your side.

### What happens to messages when the CRM is closed?

Nothing is lost. WhatsApp delivers to the API regardless of whether your browser is open; messages wait in the inbox and sync the next time you open the CRM. The AI agent keeps replying even when nobody is logged in.

## Team and roles

### Can my whole team use one workspace?

Yes — that's the point. Invite teammates under **Team** and assign roles. Everyone shares the inbox, contacts, and catalog. Role differences are about permissions (who can delete, who can change billing), not about data isolation.

### Can viewers raise support tickets?

Yes. Every member of a workspace — viewers included — can raise a ticket. Access problems shouldn't depend on role.

## The AI agent

### Can the AI make mistakes?

It can, like any assistant. It answers strictly from your knowledge base and catalog; when it can't find an answer it says so and offers a human handoff. You can review and restrict what it knows under **Knowledge**, and turn capabilities off under **Settings → Business** if you don't want the agent using them.

### Do customers know they're talking to an AI?

You control the disclosure. The welcome message and agent intro are configurable — honesty works best, but the wording is yours.

## Catalog, orders, and bookings

### Do I have to use the product catalog?

No. Your business type decides which capabilities switch on, and you can toggle any of them under **Settings → Business**. A consultancy can run inquiries and appointments with zero products; an NGO can run programs and donations.

### Where do orders and bookings appear?

Dedicated **Orders** and **Bookings** pages, depending on your capabilities. Orders track status from pending to delivered; bookings handle dates, guests, and check-in state. Both are created by the AI agent from WhatsApp conversations or by your team manually.

## Billing

### Is there a free plan?

Yes. New workspaces start on the free Starter plan — no card required. You'll see the plan picker during onboarding; everything works, just within Starter limits (contacts, team members, broadcasts).

### How do I upgrade or cancel?

**Billing** in the sidebar shows your current plan, usage, and the available upgrades. Cancellation takes effect at the end of the paid period — you keep your data.

### What happens if I exceed my plan's limits?

The workspace keeps working; growth pauses (new contact sync or broadcasts may wait) until you upgrade or trim. We notify owners by email well before limits are hit.

## Data and privacy

### Where is my data stored?

On Supabase infrastructure, isolated per workspace with row-level security. See your workspace's Privacy Policy (Settings → Help & support) for the full picture, including your data-rights options (export and deletion requests).

### Can customers see my internal notes, quick replies, or team chat?

No. Customers only ever see what you send them in WhatsApp — messages, catalog items, and your public profile page. Internal data never leaves the CRM.

## Getting help

### How do I contact a human?

**Help & support → New ticket** in the sidebar. Describe what you were trying to do and what happened — screenshots welcome in the description. Every ticket gets a tracking ID (like `TCK-7F3K2A`) you can quote in follow-ups, and you'll see replies both in the CRM and (for owners/admins) by email.

### Something is broken — is it just me?

Raise a ticket and say so — outages and regressions get prioritized. The status page of any incident will be linked from your ticket thread.
