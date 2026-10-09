// ============================================================
// /[slug]/legal/* layout — one sidebar frame for the whole legal
// section (terms + privacy), so the chat link lands on a page with
// a defined layout: sidebar on desktop, sticky header + collapsible
// section list on mobile. Pages render only their heading and body.
// ============================================================

import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { LegalChrome } from "@/components/legal/legal-chrome";
import { resolveAccountBySlug } from "@/lib/public/customer";

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

  return <LegalChrome account={account}>{children}</LegalChrome>;
}
