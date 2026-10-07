// ============================================================
// /<slug>/legal/terms — Terms of Service for customers/leads
// chatting with {business} on WhatsApp via the Tijwa assistant.
// Kenya DPA 2019 + GDPR (EU/EEA customers). Version ke-eu-v1.
// ============================================================

import type { Metadata } from 'next'
import { LegalShell } from '@/components/legal/legal-shell'

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  return { title: `Terms of Service · ${slug}` }
}

export default async function TermsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params

  return (
    <LegalShell slug={slug} title="Terms of Service" active="terms">
      <p>
        These Terms govern your use of {slug}&apos;s WhatsApp messaging service, including our AI
        assistant, and any orders or bookings you place through it. By tapping <strong>Accept</strong>{' '}
        you agree to them. If you do not accept, you can keep using the chat for general enquiries —
        but orders and bookings require acceptance.
      </p>

      <h2>1. Who you are dealing with</h2>
      <p>
        The business named at the top of this page (&quot;{slug}&quot;, &quot;we&quot;, &quot;us&quot;)
        is the <strong>data controller</strong> for your conversations and orders. Tijwa is the
        messaging platform the business uses to talk to you and acts as a <strong>processor</strong>{' '}
        on the business&apos;s instructions. These Terms are issued by the business.
      </p>

      <h2>2. The service</h2>
      <p>You can use the chat to:</p>
      <ul>
        <li>Ask about products, services, prices, availability and opening hours</li>
        <li>Place orders and bookings and receive confirmations</li>
        <li>Send photos, documents and other files related to your enquiry</li>
        <li>Exercise your data rights (download or delete your information)</li>
      </ul>
      <p>
        Message and data rates from your mobile operator may apply. The service follows WhatsApp&apos;s
        own terms and policies.
      </p>

      <h2>3. AI assistance — important</h2>
      <p>
        Part of your conversation may be handled by an <strong>artificial intelligence assistant</strong>.
        It processes your messages to answer you, find items in the catalogue and prepare orders.
        Responses may occasionally be wrong — always check prices, quantities and booking details
        before confirming. You can ask for a <strong>human agent</strong> at any time and a person
        will take over. Automated decisions about you are not made without human review.
      </p>

      <h2>4. Consent status</h2>
      <p>
        When you first chat, you can tap <strong>Accept</strong> or <strong>Decline</strong>. If you
        do nothing and keep chatting, you have <strong>not</strong> accepted these Terms — and that is
        fine: chatting, asking questions and browsing remain open to you. Acceptance is only required
        before placing an order or making a booking. You can accept later at any time.
      </p>

      <h2>5. Orders and bookings</h2>
      <ul>
        <li>An order or booking is only confirmed when you receive a confirmation message</li>
        <li>Prices shown in the chat are the business&apos;s current prices; a confirmed price is the price on your confirmation</li>
        <li>Cancellation, refund and rescheduling rules are the business&apos;s own policies and will be shared with your confirmation where they apply</li>
        <li>To complete an order or booking we need your name and email address for the confirmation</li>
      </ul>

      <h2>6. Acceptable use</h2>
      <p>You agree not to:</p>
      <ul>
        <li>Send unlawful, abusive, fraudulent or misleading content</li>
        <li>Impersonate another person or probe the service for vulnerabilities</li>
        <li>Use the chat for unsolicited marketing or spam</li>
        <li>Interfere with the operation of the service</li>
      </ul>
      <p>
        We may suspend a conversation that breaks these rules, and where required by law we may
        report unlawful content.
      </p>

      <h2>7. Your information and your rights</h2>
      <p>
        Our <a href={`/${slug}/legal/privacy`}>Privacy Policy</a> explains what we collect, why, and
        your rights under Kenya&apos;s Data Protection Act, 2019 and — if you are in the EU/EEA — the
        GDPR. In short you can ask for a copy of your data, ask us to correct or delete it, and we
        only keep anonymised statistics where the law allows. You can exercise these rights directly
        from your personal data page (link provided in the chat) or by messaging us with
        &quot;delete my data&quot; or &quot;download my data&quot;.
      </p>

      <h2>8. Liability</h2>
      <p>
        The service is provided &quot;as is&quot;. To the extent permitted by law, the business is not
        liable for indirect or consequential loss, for losses caused by circumstances outside its
        reasonable control (including WhatsApp or network outages), or for the accuracy of
        AI-generated answers that you did not confirm. Nothing in these Terms limits liability that
        cannot be limited by law, including for fraud or personal injury caused by negligence.
      </p>

      <h2>9. Changes</h2>
      <p>
        We may update these Terms. If we do, we will send the new version with Accept/Decline buttons
        before it takes effect. The version you accepted is always recorded against your contact.
      </p>

      <h2>10. Law and complaints</h2>
      <p>
        These Terms are governed by the laws of <strong>Kenya</strong>, and Kenyan courts have
        jurisdiction. If you are in the EU/EEA you also keep the right to bring proceedings in your
        country of residence and to complain to your local supervisory authority. Data protection
        complaints in Kenya may be lodged with the Office of the Data Protection Commissioner (ODPC).
      </p>

      <h2>11. Contact</h2>
      <p>
        Questions about these Terms? Reply in the chat and ask for a human, or contact the business
        using the details on its website.
      </p>
    </LegalShell>
  )
}
