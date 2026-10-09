// ============================================================
// /<slug>/legal/terms — Terms of Service for customers/leads
// chatting with {business} on WhatsApp via the Tijwa assistant.
// Kenya DPA 2019 + GDPR (EU/EEA customers). Version ke-eu-v1.
// ============================================================

import type { Metadata } from 'next'
import { CONSENT_VERSION } from '@/lib/public/customer'
import { LEGAL_EFFECTIVE_DATE, LEGAL_PROSE_CLASS } from '@/components/legal/sections'

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  return { title: `Terms of Service · ${slug}` }
}

export default async function TermsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params

  return (
    <>
      <h1 className="text-2xl font-bold text-foreground sm:text-3xl">Terms of Service</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Effective {LEGAL_EFFECTIVE_DATE} · Version{' '}
        <code className="rounded bg-muted px-1">{CONSENT_VERSION}</code>
      </p>

      <div className={LEGAL_PROSE_CLASS}>
      <p>
        These Terms govern your use of {slug}&apos;s WhatsApp messaging service, including our AI
        assistant, and any orders or bookings you place through it. We send them to you once in the
        chat with a single link to this page. Tap <strong>Accept</strong> to agree; if you{" "}
        <strong>Decline</strong>, we stop replying to you until you accept.
      </p>

      <h2 id="terms-1-who-you-are-dealing-with">1. Who you are dealing with</h2>
      <p>
        The business named at the top of this page (&quot;{slug}&quot;, &quot;we&quot;, &quot;us&quot;)
        is the <strong>data controller</strong> for your conversations and orders. Tijwa is the
        messaging platform the business uses to talk to you and acts as a <strong>processor</strong>{' '}
        on the business&apos;s instructions. These Terms are issued by the business.
      </p>

      <h2 id="terms-2-the-service">2. The service</h2>
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

      <h2 id="terms-3-ai-assistance-important">3. AI assistance — important</h2>
      <p>
        Part of your conversation may be handled by an <strong>artificial intelligence assistant</strong>.
        It processes your messages to answer you, find items in the catalogue and prepare orders.
        Responses may occasionally be wrong — always check prices, quantities and booking details
        before confirming. You can ask for a <strong>human agent</strong> at any time and a person
        will take over. Automated decisions about you are not made without human review.
      </p>

      <h2 id="terms-4-consent-status">4. Consent status</h2>
      <p>We ask for your agreement once, with three possible outcomes:</p>
      <ul>
        <li>
          <strong>You tap Accept</strong> — you agree from that moment, and the date and version are
          recorded against your contact.
        </li>
        <li>
          <strong>You ignore the request and keep chatting</strong> — we treat you as having agreed.
          Silence after we send the request counts as acceptance and is recorded the same way (the
          record shows it was assumed rather than tapped). Nothing further is asked.
        </li>
        <li>
          <strong>You tap Decline</strong> — the conversation pauses. Every message you send
          afterwards is answered only with a request to agree to these Terms, until you tap{" "}
          <strong>Accept</strong>. Tapping Accept resumes the conversation immediately.
        </li>
      </ul>

      <h2 id="terms-5-orders-and-bookings">5. Orders and bookings</h2>
      <ul>
        <li>An order or booking is only confirmed when you receive a confirmation message</li>
        <li>Prices shown in the chat are the business&apos;s current prices; a confirmed price is the price on your confirmation</li>
        <li>Cancellation, refund and rescheduling rules are the business&apos;s own policies and will be shared with your confirmation where they apply</li>
        <li>To complete an order or booking we need your name and email address for the confirmation</li>
      </ul>

      <h2 id="terms-6-acceptable-use">6. Acceptable use</h2>
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

      <h2 id="terms-7-your-information-and-your-rights">7. Your information and your rights</h2>
      <p>
        Our <a href={`/${slug}/legal/privacy`}>Privacy Policy</a> explains what we collect, why, and
        your rights under Kenya&apos;s Data Protection Act, 2019 and — if you are in the EU/EEA — the
        GDPR. In short you can ask for a copy of your data, ask us to correct or delete it, and we
        only keep anonymised statistics where the law allows. You can exercise these rights directly
        from your personal data page (link provided in the chat) or by messaging us with
        &quot;delete my data&quot; or &quot;download my data&quot;.
      </p>

      <h2 id="terms-8-liability">8. Liability</h2>
      <p>
        The service is provided &quot;as is&quot;. To the extent permitted by law, the business is not
        liable for indirect or consequential loss, for losses caused by circumstances outside its
        reasonable control (including WhatsApp or network outages), or for the accuracy of
        AI-generated answers that you did not confirm. Nothing in these Terms limits liability that
        cannot be limited by law, including for fraud or personal injury caused by negligence.
      </p>

      <h2 id="terms-9-changes">9. Changes</h2>
      <p>
        We may update these Terms. If we do, we will send the new version with Accept/Decline buttons
        before it takes effect. The version you accepted is always recorded against your contact.
      </p>

      <h2 id="terms-10-law-and-complaints">10. Law and complaints</h2>
      <p>
        These Terms are governed by the laws of <strong>Kenya</strong>, and Kenyan courts have
        jurisdiction. If you are in the EU/EEA you also keep the right to bring proceedings in your
        country of residence and to complain to your local supervisory authority. Data protection
        complaints in Kenya may be lodged with the Office of the Data Protection Commissioner (ODPC).
      </p>

      <h2 id="terms-11-contact">11. Contact</h2>
      <p>
        Questions about these Terms? Reply in the chat and ask for a human, or contact the business
        using the details on its website.
      </p>
      </div>
    </>
  )
}
