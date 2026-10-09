// ============================================================
// /<slug]/legal/privacy — Privacy Policy for customers/leads
// chatting with {business} on WhatsApp via the Tijwa assistant.
// Kenya DPA 2019 + GDPR (EU/EEA customers). Version ke-eu-v1.
// ============================================================

import type { Metadata } from 'next'
import { CONSENT_VERSION } from '@/lib/public/customer'
import { LEGAL_EFFECTIVE_DATE, LEGAL_PROSE_CLASS } from '@/components/legal/sections'

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  return { title: `Privacy Policy · ${slug}` }
}

export default async function PrivacyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params

  return (
    <>
      <h1 className="text-2xl font-bold text-foreground sm:text-3xl">Privacy Policy</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Effective {LEGAL_EFFECTIVE_DATE} · Version{' '}
        <code className="rounded bg-muted px-1">{CONSENT_VERSION}</code>
      </p>

      <div className={LEGAL_PROSE_CLASS}>
      <p>
        This Privacy Policy explains how {slug} (&quot;we&quot;, &quot;us&quot;) collects, uses and
        protects your personal data when you chat with us on WhatsApp. It applies under Kenya&apos;s
        Data Protection Act, 2019 (DPA) and, for customers in the EU/EEA, the General Data
        Protection Regulation (GDPR). Tijwa is our processor and processes data only on our
        instructions.
      </p>

      <h2 id="privacy-1-what-we-collect">1. What we collect</h2>
      <ul>
        <li>
          <strong>Identity and contact details</strong> — your name, WhatsApp phone number and, if
          you provide them, your email address
        </li>
        <li>
          <strong>Conversation content</strong> — the messages, photos and documents you send, and
          our replies
        </li>
        <li>
          <strong>Order and booking details</strong> — items ordered, dates, times, guests, totals
          and notes you give us
        </li>
        <li>
          <strong>Technical metadata</strong> — WhatsApp identifiers (such as your wa_id/BSUID),
          message timestamps and delivery status
        </li>
      </ul>
      <p>
        We do not ask for payment card numbers, national IDs or other special-category data. Please
        do not send them — if we receive such data we will delete it where we can.
      </p>

      <h2 id="privacy-2-why-we-use-it-and-our-legal-basis">2. Why we use it (and our legal basis)</h2>
      <ul>
        <li>
          <strong>To answer your enquiries and run orders/bookings</strong> — necessary to take steps
          at your request before a contract, and to perform the contract (DPA/GDPR Art. 6(1)(b))
        </li>
        <li>
          <strong>AI assistance in the chat</strong> — we use an AI assistant to understand your
          messages and draft replies; it processes message content only to serve you
          (legitimate interests / your request)
        </li>
        <li>
          <strong>To keep records of orders and accounting data</strong> — legal obligation (DPA/GDPR
          Art. 6(1)(c))
        </li>
        <li>
          <strong>To improve the service and prevent abuse</strong> — legitimate interests, balanced
          against your rights (Art. 6(1)(f))
        </li>
        <li>
          <strong>Marketing messages</strong> — only with your consent, which you can withdraw any time
          by replying STOP (Art. 6(1)(a))
        </li>
      </ul>

      <h2 id="privacy-3-how-long-we-keep-it">3. How long we keep it</h2>
      <ul>
        <li><strong>Conversations and message history</strong> — kept while your contact exists, then deleted when you delete your data</li>
        <li><strong>Orders and bookings</strong> — kept as required by Kenyan tax and accounting law (typically up to 5 years), stripped of your personal details afterwards</li>
        <li><strong>Consent records</strong> — kept as evidence of your Accept/Decline, including the version accepted and when</li>
        <li><strong>Marketing consent</strong> — until you withdraw it</li>
      </ul>

      <h2 id="privacy-4-who-we-share-it-with">4. Who we share it with</h2>
      <ul>
        <li><strong>WhatsApp / Meta</strong> — to deliver your messages (Meta is an independent controller for WhatsApp&apos;s own processing under its terms)</li>
        <li><strong>Tijwa</strong> — our platform provider, acting as processor</li>
        <li>
          <strong>Our AI provider</strong> — message text is sent to our AI model to generate
          replies, under processor terms; it is not used to train public models
        </li>
        <li>
          <strong>Authorities</strong> — where the law requires it or to protect rights and safety
        </li>
      </ul>
      <p>We do not sell your personal data to anyone.</p>

      <h2 id="privacy-5-international-transfers">5. International transfers</h2>
      <p>
        WhatsApp, our hosting and our AI provider may process data outside Kenya (and outside the
        EU/EEA). Where data leaves Kenya we rely on the safeguards required by the DPA 2019;
        where it leaves the EU/EEA we rely on adequacy decisions or standard contractual clauses.
      </p>

      <h2 id="privacy-6-your-rights">6. Your rights</h2>
      <p>Under the DPA and, for EU/EEA residents, the GDPR you can:</p>
      <ul>
        <li>Ask for a <strong>copy</strong> of the data we hold about you (export)</li>
        <li>Ask us to <strong>correct</strong> data that is wrong</li>
        <li>Ask us to <strong>delete</strong> your data (&quot;right to erasure&quot;)</li>
        <li>Ask us to <strong>restrict</strong> or object to certain processing</li>
        <li>Ask for your data in a portable, machine-readable format</li>
        <li>Withdraw consent at any time (without affecting earlier lawful processing)</li>
        <li>Complain to a supervisory authority — in Kenya, the Office of the Data Protection
          Commissioner (ODPC)</li>
      </ul>
      <p>
        The fastest way to exercise these is your <strong>personal data page</strong> (the link in
        this chat), where you can download your data or request deletion in one tap, or simply
        message us &quot;download my data&quot; / &quot;delete my data&quot;.
      </p>

      <h2 id="privacy-7-what-happens-when-you-delete">7. What happens when you delete</h2>
      <p>
        When you request deletion we check whether we must keep anything for accounting or tax law.
        If nothing must be kept, your profile, conversations and message history are{' '}
        <strong>fully erased</strong>. If you have orders or bookings we must retain, we{' '}
        <strong>anonymise</strong> you instead: your name, number, email, messages and all personal
        details are removed, and only anonymous financial records remain. Either way your personal
        data stops being linked to you, and the applied outcome is confirmed back to you.
      </p>

      <h2 id="privacy-8-security">8. Security</h2>
      <p>
        Data is stored with access controls, encryption in transit (TLS) and at rest, multi-tenant
        isolation between businesses, and audit logging of staff access. If a breach occurs that
        affects your rights we will notify you and the ODPC as required by the DPA 2019.
      </p>

      <h2 id="privacy-9-automated-decisions">9. Automated decisions</h2>
      <p>
        No legal or similarly significant decision about you is made by automation alone. AI
        responses in the chat are suggestions for you to confirm; staff can take over at any point.
      </p>

      <h2 id="privacy-10-children">10. Children</h2>
      <p>
        The service is not directed at children under 18, and we do not knowingly collect their
        data. If you believe a child has provided data to us, contact us to have it removed.
      </p>

      <h2 id="privacy-11-changes-and-contact">11. Changes and contact</h2>
      <p>
        We may update this policy; material changes are sent to you with Accept/Decline buttons
        before they take effect. To reach us about privacy, ask for a human in the chat or contact
        the business directly.
      </p>
      </div>
    </>
  )
}
