import { contactFormUrl } from '@/lib/public/customer'

/**
 * Outbound PHI filter (HIPAA carve-out).
 *
 * The system prompt already tells a HIPAA-mode assistant never to discuss
 * clinical detail. This is the enforcement layer that runs AFTER the model
 * has produced its text and BEFORE it is sent on WhatsApp — because prompts
 * are guidance, not a guarantee, and a single leaked symptom is a breach.
 *
 * Strategy: conservative keyword detection. If the outbound text looks like
 * it discusses health conditions, symptoms, medication, or diagnosis, we
 * replace it with a short redirect + the secure booking link. We deliberately
 * err toward over-blocking: a wrongly-blocked "we can book you a slot" is
 * annoying; a leaked diagnosis is a HIPAA breach.
 *
 * This only runs when tenant_settings.hipaa_mode is TRUE.
 */

// High-severity clinical terms — ANY of these in outbound text blocks the
// message outright, no exceptions. These are unambiguous PHI signals.
const HIGH_SEVERITY_PHI: RegExp[] = [
  /\bsymptom|symptoms\b/i,
  /\bdiagnos(?:e|es|is|ed)|diagnostic\b/i,
  /\bmedicat(?:e|es|ion|ions)|prescri(?:be|ption|bed)|dosage\b/i,
  /\b(hypertension|diabetes|diabetic|asthma|cancer|tumou?r|hiv|aids|hepatitis|pneumonia|covid)\b/i,
  /\bpregnant|pregnancy|trimester\b/i,
  /\b(overdose|withdrawal|addiction|substance abuse)\b/i,
  /\bsuicid(?:e|al)\b/i,
  /\btest results?|lab results?\b/i,
  /\b(x-?ray|mri|ultrasound)\b/i,
  /\byour condition|their condition|this disease|the disease|the illness\b/i,
]

// Medium-severity words that MAY be clinical but also appear in benign
// scheduling chatter ("you have pain? let me book you in"). These only
// block when the text does NOT read as pure scheduling/logistics.
const MEDIUM_SEVERITY_PHI: RegExp[] = [
  /\bpain|ache|aches|aching|swollen|swelling|bleeding|nausea|nauseous|fever|feverish|dizzy|dizziness\b/i,
  /\binfection|infected|injured|injury|fracture|sprain\b/i,
  /\ballerg(?:y|ies|ic)|allergic reaction\b/i,
  /\bdepress(?:ion|ive)|anxiety|anxious|mental health\b/i,
  /\btherapy|therapist|therapies|counselling|physio(?:therapy)?\b/i,
  /\bsurgery|surgical|anaesthe(?:sia|tic)|operation on\b/i,
  /\bsti|std|sexually transmitted\b/i,
]

// Scheduling/logistics context. If the message is clearly about booking a
// slot, hours, location, or fees, medium-severity words alone don't block.
const SCHEDULING_CONTEXT =
  /\b(appointment|booking|book|slot|schedule|reschedul|clinic|practice|hours|location|address|fee|price|cost|insurance|available|availability)\b/i

export type PhiFilterResult = {
  blocked: boolean
  /** Redirect + booking-link text to send instead, when blocked. */
  replacement?: string
}

/**
 * Screen a single outbound AI text for PHI. Pure — no scheduling of side
 * effects, easy to unit-test. `bookingUrl` is appended to the redirect when
 * available.
 */
export function screenOutboundForPhi(text: string, bookingUrl?: string): PhiFilterResult {
  if (!text?.trim()) return { blocked: false }

  const severe = HIGH_SEVERITY_PHI.some((re) => re.test(text))
  const medium = MEDIUM_SEVERITY_PHI.some((re) => re.test(text))
  const scheduling = SCHEDULING_CONTEXT.test(text)

  // Severe terms always block. Medium terms block unless the message is
  // clearly just scheduling logistics (over-blocking would break booking).
  const blocked = severe || (medium && !scheduling)
  if (!blocked) return { blocked: false }

  const linkLine = bookingUrl ? `\n\nYou can share a few details privately here: ${bookingUrl}` : ''
  return {
    blocked: true,
    replacement:
      "I can't discuss health matters over WhatsApp, but I can help you get seen. " +
      'A member of our clinical team will handle this privately.' +
      linkLine,
  }
}

/** Build the opaque secure-booking URL for a contact. */
export function secureBookingUrl(slug: string, contactId: string): string {
  return contactFormUrl(slug, contactId)
}
