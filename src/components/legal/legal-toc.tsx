"use client";

// ============================================================
// LegalToc — "On this page" section list for the policy pages.
//
// Server-rendered LegalShell extracts every <h2> into a section and
// hands it over; this marks the section currently in view so the
// sidebar (desktop) and the disclosure panel (mobile) stay in sync
// while the customer scrolls.
// ============================================================

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export interface LegalSection {
  id: string;
  label: string;
}

export function LegalToc({
  sections,
  className,
}: {
  sections: LegalSection[];
  className?: string;
}) {
  const [active, setActive] = useState<string | null>(sections[0]?.id ?? null);

  useEffect(() => {
    const elements = sections
      .map((section) => document.getElementById(section.id))
      .filter((el): el is HTMLElement => el !== null);
    if (elements.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort(
            (a, b) => a.boundingClientRect.top - b.boundingClientRect.top,
          );
        if (visible[0]) setActive(visible[0].target.id);
      },
      // Ignore the sticky mobile header, and only track a section
      // while it occupies the upper part of the viewport.
      { rootMargin: "-120px 0px -65% 0px", threshold: 0 },
    );

    elements.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [sections]);

  if (sections.length === 0) return null;

  return (
    <nav aria-label="On this page" className={className}>
      <p className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        On this page
      </p>
      <ul className="space-y-0.5">
        {sections.map((section) => (
          <li key={section.id}>
            <a
              href={`#${section.id}`}
              className={cn(
                "block rounded-md px-2 py-1.5 text-sm leading-snug transition-colors",
                active === section.id
                  ? "bg-primary/10 font-medium text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {section.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
