// ============================================================
// /legal/* layout — B2B legal section (Tijwa ↔ business).
// Loads every B2B doc's TOC sections and wraps children in the
// B2bLegalChrome frame. Public, no auth required.
// ============================================================

import type { ReactNode } from "react";
import { getLocale } from "next-intl/server";
import { B2bLegalChrome } from "@/components/legal/b2b-legal-chrome";
import { listB2bLegalDocs } from "@/lib/legal/docs";

export const metadata = {
  title: {
    default: "Legal · Tijwa",
    template: "%s · Tijwa Legal",
  },
  robots: { index: true, follow: true },
};

export default async function B2bLegalLayout({
  children,
}: {
  children: ReactNode;
}) {
  const locale = await getLocale();
  const docs = listB2bLegalDocs(locale);
  const sectionsByDoc = Object.fromEntries(docs.map((doc) => [doc.slug, doc.sections]));

  return <B2bLegalChrome sectionsByDoc={sectionsByDoc}>{children}</B2bLegalChrome>;
}
