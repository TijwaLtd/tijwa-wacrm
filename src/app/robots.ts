// ============================================================
// robots.ts — crawler directives.
// Public pages are indexable; everything else is blocked.
// ============================================================

import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const base = process.env.NEXT_PUBLIC_SITE_URL || "https://tijwa.com";

  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/pricing", "/help", "/help/", "/legal", "/legal/"],
        disallow: [
          "/api/",
          "/dashboard",
          "/inbox",
          "/contacts",
          "/settings",
          "/billing",
          "/onboarding",
          "/select-workspace",
          "/join/",
          "/support/admin",
          "/ai-test",
          "/audit",
        ],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
