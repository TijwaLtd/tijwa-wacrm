"use client";

// ============================================================
// LegalChrome — the shared frame for every /[slug]/legal/* route.
//
// Desktop: sticky sidebar (brand, Terms/Privacy switch, "On this
// page" section list) beside a single content column.
// Mobile: the sidebar collapses into a sticky top bar with the
// document tabs, plus a collapsible section list above the article.
//
// Lives in the route's layout.tsx, so every legal page gets this
// chrome without repeating it — the pages themselves only render
// their heading and body.
// ============================================================

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { LegalToc } from "@/components/legal/legal-toc";
import { LEGAL_SECTIONS } from "@/components/legal/sections";
import { cn } from "@/lib/utils";

export interface LegalAccount {
  name: string;
  display_name?: string | null;
  logo_url?: string | null;
}

export function LegalChrome({
  account,
  children,
}: {
  account: LegalAccount;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const slug = pathname.split("/")[1] ?? "";
  const active = pathname.includes("/legal/privacy") ? "privacy" : "terms";
  const businessName = account.display_name || account.name;
  const sections = LEGAL_SECTIONS[active];

  const brand = (
    <div className="flex items-center gap-3">
      {account.logo_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={account.logo_url} alt="" className="size-10 rounded-lg object-cover" />
      ) : (
        <div className="flex size-10 items-center justify-center rounded-lg bg-primary text-base font-bold text-primary-foreground">
          {businessName.charAt(0).toUpperCase()}
        </div>
      )}
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-foreground">{businessName}</p>
        <p className="truncate text-xs text-muted-foreground">via Tijwa WhatsApp Assistant</p>
      </div>
    </div>
  );

  const docNav = (
    <nav className="flex gap-2">
      {(["terms", "privacy"] as const).map((doc) => (
        <Link
          key={doc}
          href={`/${slug}/legal/${doc}`}
          className={cn(
            "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
            active === doc
              ? "bg-primary/10 text-primary"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          {doc === "terms" ? "Terms of Service" : "Privacy Policy"}
        </Link>
      ))}
    </nav>
  );

  return (
    <div className="min-h-screen bg-muted/40">
      <div className="mx-auto flex w-full max-w-6xl gap-10 px-4 py-6 sm:px-6 lg:px-8 lg:py-12">
        {/* ── Desktop sidebar ── */}
        <aside className="hidden w-60 shrink-0 lg:block">
          <div className="sticky top-10 space-y-6">
            {brand}
            {docNav}
            <LegalToc sections={sections} />
          </div>
        </aside>

        {/* ── Content column ── */}
        <div className="min-w-0 flex-1">
          {/* Mobile: sticky brand bar + document tabs */}
          <header className="sticky top-0 z-10 -mx-4 mb-4 border-b border-border bg-background/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:hidden">
            <div className="mb-3">{brand}</div>
            {docNav}
          </header>

          {/* Mobile: collapsible section list */}
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
            {businessName} · Powered by Tijwa
          </p>
        </div>
      </div>
    </div>
  );
}
