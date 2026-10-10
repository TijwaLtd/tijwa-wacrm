"use client";

// ============================================================
// B2bLegalChrome — the shared frame for /legal/* (root, B2B).
//
// Desktop (≥lg): three columns —
//   LEFT sidebar  (Tijwa brand, doc nav: Terms / Privacy)
//   CENTER        (article card)
//   RIGHT sidebar ("On this page" TOC)
//
// Mobile: sticky brand bar + doc tabs, collapsible TOC, content.
// ============================================================

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Scale } from "lucide-react";
import type { ReactNode } from "react";
import { LegalToc } from "@/components/legal/legal-toc";
import type { LegalSection } from "@/lib/legal/docs";
import { cn } from "@/lib/utils";

const DOC_LABELS: Record<string, string> = {
  terms: "Terms of Service",
  privacy: "Privacy Policy",
};

const DOC_ORDER = ["terms", "privacy"] as const;

function activeDoc(pathname: string): string {
  return pathname.includes("/legal/privacy") ? "privacy" : "terms";
}

export function B2bLegalChrome({
  sectionsByDoc,
  children,
}: {
  sectionsByDoc: Record<string, LegalSection[]>;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const active = activeDoc(pathname);
  const sections = sectionsByDoc[active] ?? [];

  const brand = (
    <Link href="/legal/terms" className="flex items-center gap-3">
      <div className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <Scale className="size-5" />
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-foreground">Tijwa</p>
        <p className="truncate text-xs text-muted-foreground">Legal</p>
      </div>
    </Link>
  );

  return (
    <div className="min-h-screen bg-muted/40">
      <div className="mx-auto flex w-full max-w-7xl gap-8 px-4 py-6 sm:px-6 lg:px-8 lg:py-12">
        {/* ── Left sidebar: doc nav ── */}
        <aside className="hidden w-52 shrink-0 lg:block">
          <div className="sticky top-10 space-y-6">
            {brand}
            <nav className="space-y-1">
              {DOC_ORDER.map((doc) => (
                <Link
                  key={doc}
                  href={`/legal/${doc}`}
                  className={cn(
                    "block rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    active === doc
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  {DOC_LABELS[doc]}
                </Link>
              ))}
            </nav>
          </div>
        </aside>

        {/* ── Center: content ── */}
        <div className="min-w-0 flex-1">
          {/* Mobile: sticky brand bar + doc tabs */}
          <header className="sticky top-0 z-10 -mx-4 mb-4 border-b border-border bg-background/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:hidden">
            <div className="mb-3">{brand}</div>
            <nav className="flex flex-wrap gap-2">
              {DOC_ORDER.map((doc) => (
                <Link
                  key={doc}
                  href={`/legal/${doc}`}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                    active === doc
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  {DOC_LABELS[doc]}
                </Link>
              ))}
            </nav>
          </header>

          {/* Mobile: collapsible TOC */}
          <details className="mb-4 rounded-xl border border-border bg-card lg:hidden">
            <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium text-foreground">
              On this page
            </summary>
            <div className="border-t border-border px-2 pb-3 pt-2">
              <LegalToc sections={sections} />
            </div>
          </details>

          <article className="rounded-xl border border-border bg-card p-5 sm:p-8">
            {children}
          </article>

          <p className="mt-6 text-center text-xs text-muted-foreground">
            Tijwa · Legal
          </p>
        </div>

        {/* ── Right sidebar: "On this page" TOC ── */}
        <aside className="hidden w-48 shrink-0 lg:block">
          <div className="sticky top-10">
            <LegalToc sections={sections} />
          </div>
        </aside>
      </div>
    </div>
  );
}
