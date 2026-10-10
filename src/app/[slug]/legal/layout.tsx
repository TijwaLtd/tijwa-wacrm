// ============================================================
// /[slug]/legal/* layout — resolves the account, loads every legal
// doc's TOC sections from markdown, and wraps children in the
// two-sidebar LegalChrome frame. Pages render only their heading
// and body.
// ============================================================

import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { getLocale } from "next-intl/server";
import { LegalChrome } from "@/components/legal/legal-chrome";
import { resolveAccountBySlug } from "@/lib/public/customer";
import { listLegalDocs } from "@/lib/legal/docs";

export default async function LegalLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const account = await resolveAccountBySlug(slug);
  if (!account) notFound();

  const locale = await getLocale();
  const businessName = account.display_name || account.name;
  const docs = listLegalDocs(locale, businessName, slug);
  const sectionsByDoc = Object.fromEntries(docs.map((doc) => [doc.slug, doc.sections]));

  return (
    <LegalChrome account={account} sectionsByDoc={sectionsByDoc}>
      {children}
    </LegalChrome>
  );
}
