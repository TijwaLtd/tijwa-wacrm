// ============================================================
// /<slug>/legal/terms — Terms of Service for customers/leads
// chatting with {business} on WhatsApp via the Tijwa assistant.
// Kenya DPA 2019 + GDPR (EU/EEA customers). Version ke-eu-v1.
// Content lives in content/legal/{locale}/terms.md.
// ============================================================

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CONSENT_VERSION } from "@/lib/public/customer";
import { loadLegalDocForPage } from "@/lib/legal/docs";
import { LegalMarkdown } from "@/components/legal/legal-markdown";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  return { title: `Terms of Service · ${slug}` };
}

export default async function TermsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const loaded = await loadLegalDocForPage(slug, "terms");
  if (!loaded) notFound();
  const { doc } = loaded;

  return (
    <>
      <h1 className="text-2xl font-bold text-foreground sm:text-3xl">{doc.frontmatter.title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Effective {doc.frontmatter.effective} · Version{" "}
        <code className="rounded bg-muted px-1">{doc.frontmatter.version || CONSENT_VERSION}</code>
      </p>
      <LegalMarkdown content={doc.content} />
    </>
  );
}
