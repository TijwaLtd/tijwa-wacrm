// ============================================================
// sitemap.ts — XML sitemap for search engines.
// Static public routes only; no dynamic/auth'd pages.
// ============================================================

import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.NEXT_PUBLIC_SITE_URL || "https://tijwa.com";
  const now = new Date();

  const staticRoutes = [
    { path: "", priority: 1.0, changeFreq: "weekly" as const },
    { path: "/pricing", priority: 0.9, changeFreq: "weekly" as const },
    { path: "/help", priority: 0.7, changeFreq: "monthly" as const },
    { path: "/help/getting-started", priority: 0.6, changeFreq: "monthly" as const },
    { path: "/help/business-types", priority: 0.6, changeFreq: "monthly" as const },
    { path: "/help/faq", priority: 0.6, changeFreq: "monthly" as const },
    { path: "/help/billing-and-plans", priority: 0.6, changeFreq: "monthly" as const },
    { path: "/help/quick-replies", priority: 0.5, changeFreq: "monthly" as const },
    { path: "/legal/terms", priority: 0.4, changeFreq: "yearly" as const },
    { path: "/legal/privacy", priority: 0.4, changeFreq: "yearly" as const },
    { path: "/legal/platform", priority: 0.4, changeFreq: "yearly" as const },
  ];

  const businessTypes = [
    "retailer",
    "restaurant",
    "hotel",
    "service_business",
    "education",
    "ngo_nonprofit",
    "property_real_estate",
    "healthcare",
    "events",
    "logistics_delivery",
    "beauty_wellness",
    "professional_services",
  ];

  return [
    ...staticRoutes.map((route) => ({
      url: `${base}${route.path}`,
      lastModified: now,
      changeFrequency: route.changeFreq,
      priority: route.priority,
    })),
    ...businessTypes.map((type) => ({
      url: `${base}/help/business-types/${type}`,
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: 0.5,
    })),
  ];
}
