// ============================================================
// /legal/privacy — B2B Privacy Policy (Tijwa → business users).
// Content lives in content/b2b/legal/{locale}/privacy.md.
// ============================================================

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadB2bLegalDocForPage } from "@/lib/legal/docs";
import { LegalMarkdown } from "@/components/legal/legal-markdown";

export async function generateMetadata(): Promise<Metadata> {
  return { title: "Privacy Policy" };
}

export default async function B2bPrivacyPage() {
  const doc = await loadB2bLegalDocForPage("privacy");
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
