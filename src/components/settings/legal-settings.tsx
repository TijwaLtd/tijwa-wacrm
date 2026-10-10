"use client";

// ============================================================
// Settings → Legal. Shows accepted B2B terms version/date and
// buttons to open the platform Terms of Service and Privacy
// Policy (root /legal/* docs) in a new tab. Owners only.
//
// Uses plain <a> tags (not next/link) because these are
// full-page navigations to a different chrome — next/link with
// target="_blank" can be intercepted by the router.
// ============================================================

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { FileText, ShieldCheck, ExternalLink } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";

interface TermsInfo {
  version: string | null;
  acceptedAt: string | null;
}

export function LegalSettings() {
  const t = useTranslations("Settings.legal");
  const { activeWorkspace } = useAuth();
  const accountId = activeWorkspace?.account_id ?? null;
  const [terms, setTerms] = useState<TermsInfo | null>(null);

  useEffect(() => {
    if (!accountId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/workspaces/${accountId}`);
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        const w = data?.workspace;
        setTerms({
          version: w?.terms_version ?? null,
          acceptedAt: w?.terms_accepted_at ?? null,
        });
      } catch {
        /* stay null */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accountId]);

  const links = [
    {
      href: "/legal/terms",
      icon: FileText,
      title: t("termsTitle"),
      desc: t("termsDesc"),
    },
    {
      href: "/legal/privacy",
      icon: ShieldCheck,
      title: t("privacyTitle"),
      desc: t("privacyDesc"),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3 rounded-xl border border-border bg-muted/30 p-4">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <FileText className="size-5" />
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">{t("introTitle")}</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{t("introDesc")}</p>
        </div>
      </div>

      {terms?.version && (
        <div className="rounded-xl border border-border bg-background p-4">
          <p className="text-sm font-semibold text-foreground">{t("acceptedTitle")}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("acceptedVersion")}:{" "}
            <span className="font-medium text-foreground">{terms.version}</span>
          </p>
          {terms.acceptedAt && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {t("acceptedDate")}:{" "}
              <span className="font-medium text-foreground">
                {new Date(terms.acceptedAt).toLocaleDateString()}
              </span>
            </p>
          )}
        </div>
      )}

      <div className="grid gap-2.5 sm:grid-cols-2">
        {links.map((link) => (
          <a
            key={link.href}
            href={link.href}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex items-start gap-3 rounded-xl border border-border bg-background p-3.5 transition-colors hover:border-primary/40 hover:bg-primary/5"
          >
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <link.icon className="size-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className={cn("text-sm font-semibold text-foreground group-hover:text-primary")}>
                {link.title}
              </p>
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{link.desc}</p>
            </div>
            <ExternalLink className="mt-1 size-3.5 shrink-0 text-muted-foreground" />
          </a>
        ))}
      </div>
    </div>
  );
}
