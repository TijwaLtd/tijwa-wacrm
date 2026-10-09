// ============================================================
// Section anchors for the legal routes' sidebar TOC.
//
// Mirrors the <h2 id> values the terms/privacy pages render —
// keep the two in sync when a section is added or renumbered.
// ============================================================

export interface LegalSection {
  id: string
  label: string
}

export const LEGAL_EFFECTIVE_DATE = '7 October 2026'

export const TERMS_SECTIONS: LegalSection[] = [
  { id: 'terms-1-who-you-are-dealing-with', label: '1. Who you are dealing with' },
  { id: 'terms-2-the-service', label: '2. The service' },
  { id: 'terms-3-ai-assistance-important', label: '3. AI assistance — important' },
  { id: 'terms-4-consent-status', label: '4. Consent status' },
  { id: 'terms-5-orders-and-bookings', label: '5. Orders and bookings' },
  { id: 'terms-6-acceptable-use', label: '6. Acceptable use' },
  { id: 'terms-7-your-information-and-your-rights', label: '7. Your information and your rights' },
  { id: 'terms-8-liability', label: '8. Liability' },
  { id: 'terms-9-changes', label: '9. Changes' },
  { id: 'terms-10-law-and-complaints', label: '10. Law and complaints' },
  { id: 'terms-11-contact', label: '11. Contact' },
]

export const PRIVACY_SECTIONS: LegalSection[] = [
  { id: 'privacy-1-what-we-collect', label: '1. What we collect' },
  { id: 'privacy-2-why-we-use-it-and-our-legal-basis', label: '2. Why we use it (and our legal basis)' },
  { id: 'privacy-3-how-long-we-keep-it', label: '3. How long we keep it' },
  { id: 'privacy-4-who-we-share-it-with', label: '4. Who we share it with' },
  { id: 'privacy-5-international-transfers', label: '5. International transfers' },
  { id: 'privacy-6-your-rights', label: '6. Your rights' },
  { id: 'privacy-7-what-happens-when-you-delete', label: '7. What happens when you delete' },
  { id: 'privacy-8-security', label: '8. Security' },
  { id: 'privacy-9-automated-decisions', label: '9. Automated decisions' },
  { id: 'privacy-10-children', label: '10. Children' },
  { id: 'privacy-11-changes-and-contact', label: '11. Changes and contact' },
]

export const LEGAL_SECTIONS = { terms: TERMS_SECTIONS, privacy: PRIVACY_SECTIONS } as const

/** Shared prose styles for the document body inside the layout's card. */
export const LEGAL_PROSE_CLASS =
  'mt-6 space-y-5 text-[15px] leading-relaxed text-foreground/85 [&>h2]:mt-8 [&>h2]:scroll-mt-32 [&>h2]:text-lg [&>h2]:font-semibold [&>h2]:text-foreground [&>h3]:mt-6 [&>h3]:font-semibold [&>h3]:text-foreground [&>ul]:list-disc [&>ul]:space-y-1.5 [&>ul]:pl-5 [&_a]:text-primary [&_a]:underline'
