// ============================================================
// MarketingFooter — footer for public marketing pages.
// ============================================================

import Link from "next/link";
import { MessageSquareText } from "lucide-react";

const FOOTER_LINKS = {
  Product: [
    { href: "/#features", label: "Features" },
    { href: "/pricing", label: "Pricing" },
    { href: "/help", label: "Help centre" },
    { href: "/help/business-types", label: "Business types" },
  ],
  Legal: [
    { href: "/legal/terms", label: "Terms of Service" },
    { href: "/legal/privacy", label: "Privacy Policy" },
    { href: "/legal/platform", label: "Platform Policy" },
    { href: "/support", label: "Support" },
  ],
  Company: [
    { href: "mailto:sales@tijwa.com", label: "Contact sales" },
    { href: "mailto:support@tijwa.com", label: "Email support" },
  ],
} as const;

export function MarketingFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-border/60">
      <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Link href="/" className="flex items-center gap-2.5">
              <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <MessageSquareText className="size-4" />
              </div>
              <span className="text-lg font-bold tracking-tight text-foreground">Tijwa</span>
            </Link>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              The WhatsApp CRM for Kenyan businesses.
            </p>
          </div>

          {Object.entries(FOOTER_LINKS).map(([heading, links]) => (
            <div key={heading}>
              <p className="text-sm font-semibold text-foreground">{heading}</p>
              <ul className="mt-3 space-y-2">
                {links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-10 border-t border-border/60 pt-6">
          <p className="text-xs text-muted-foreground">
            © {year} Tijwa. All rights reserved. Prices in Kenyan Shillings. Governed by the laws of Kenya.
          </p>
        </div>
      </div>
    </footer>
  );
}
