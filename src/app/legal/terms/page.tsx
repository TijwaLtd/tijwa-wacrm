// ============================================================
// /legal/terms — B2B Terms of Service (Tijwa ↔ business).
// Content lives in content/b2b/legal/{locale}/terms.md.
// ============================================================

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadB2bLegalDocForPage } from "@/lib/legal/docs";
import { LegalMarkdown } from "@/components/legal/legal-markdown";

export async function generateMetadata(): Promise<Metadata> {
  return { title: "Terms of Service" };
}

export default async function B2bTermsPage() {
  const doc = await loadB2bLegalDocForPage("terms");
  if (!doc) notFound();

  return (
    <>
      <h1 className="text-2xl font-bold text-foreground sm:text-3xl">{doc.frontmatter.title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Effective {doc.frontmatter.effective} · Version{" "}
        <code className="rounded bg-muted px-1">{doc.frontmatter.version}</code>
      </p>
      <LegalMarkdown content={doc.content} />
    </>
  );
}
