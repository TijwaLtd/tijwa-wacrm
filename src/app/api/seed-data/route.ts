// ============================================================
// POST /api/seed-data
//
// Seeds the current account with realistic sample data based on
// the account's business_type. Optionally accepts business_type
// in the body — updates accounts.business_type + recommended
// capabilities BEFORE seeding. Creates:
//   - Org-specific offering categories
//   - Sample offerings with images and metadata
//   - Updates tenant_settings.operating_hours
//
// Admin+ only. Idempotent — re-running UPDATES existing
// categories/offerings in place (by slug) and syncs images.
// ============================================================

import { NextResponse } from "next/server";
import { requireRole, toErrorResponse } from "@/lib/auth/account";
import { getSeedDataForBusinessType } from "@/lib/seed/seed-data";
import type { BusinessType } from "@/lib/business/capabilities";
import { setAccountBusinessType } from "@/lib/business/set-business-type";
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from "@/lib/rate-limit";

export async function POST(request: Request) {
  try {
    const ctx = await requireRole("admin");

    const limit = checkRateLimit(
      `admin:seedData:${ctx.userId}`,
      RATE_LIMITS.adminAction,
    );
    if (!limit.success) return rateLimitResponse(limit);

    const body = await request.json().catch(() => null);

    // Update business type (and recommended capabilities) BEFORE seeding
    if (typeof body?.business_type === "string" && body.business_type) {
      const result = await setAccountBusinessType(
        ctx.serviceClient,
        ctx.accountId,
        body.business_type,
      );
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
    }

    // Get account's business_type
    const { data: account, error: acctErr } = await ctx.serviceClient
      .from("accounts")
      .select("business_type, default_currency")
      .eq("id", ctx.accountId)
      .single();

    if (acctErr || !account) {
      return NextResponse.json(
        { error: "Failed to load account" },
        { status: 500 },
      );
    }

    const businessType = account.business_type as BusinessType;
    const currency = account.default_currency;
    if (!currency) {
      return NextResponse.json(
        { error: "Set a default currency in Settings > Deals & currency before seeding data." },
        { status: 400 },
      );
    }

    const seedData = getSeedDataForBusinessType(businessType);

    const results = {
      categories_created: 0,
      categories_updated: 0,
      offerings_created: 0,
      offerings_updated: 0,
      media_created: 0,
      media_updated: 0,
      operating_hours_updated: false,
      errors: [] as string[],
    };

    // ── 1. Upsert categories ────────────────────────────────
    const categoryMap = new Map<string, string>(); // slug → id

    for (const cat of seedData.categories) {
      // Check if exists
      const { data: existing } = await ctx.serviceClient
        .from("offering_categories")
        .select("id")
        .eq("account_id", ctx.accountId)
        .eq("slug", cat.slug)
        .maybeSingle();

      if (existing) {
        categoryMap.set(cat.slug, existing.id);
        // Re-seeding edits existing categories in place
        const { error: updErr } = await ctx.serviceClient
          .from("offering_categories")
          .update({
            name: cat.name,
            description: cat.description,
            sort_order: cat.sort_order,
          })
          .eq("id", existing.id);
        if (updErr) {
          results.errors.push(`Category "${cat.name}": ${updErr.message}`);
        } else {
          results.categories_updated++;
        }
        continue;
      }

      const { data: created, error } = await ctx.serviceClient
        .from("offering_categories")
        .insert({
          account_id: ctx.accountId,
          name: cat.name,
          slug: cat.slug,
          description: cat.description,
          sort_order: cat.sort_order,
        })
        .select("id")
        .single();

      if (error) {
        results.errors.push(`Category "${cat.name}": ${error.message}`);
      } else if (created) {
        categoryMap.set(cat.slug, created.id);
        results.categories_created++;
      }
    }

    // ── 2. Upsert offerings ──────────────────────────────────
    for (const offering of seedData.offerings) {
      // Check if exists by slug
      const slug = offering.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");

      const { data: existing } = await ctx.serviceClient
        .from("offerings")
        .select("id")
        .eq("account_id", ctx.accountId)
        .eq("slug", slug)
        .maybeSingle();

      if (existing) {
        const categoryId = categoryMap.get(offering.category_slug) || null;

        // Re-seeding edits the existing offering in place — price,
        // descriptions, status, category and metadata all sync to the seed.
        const { error: updErr } = await ctx.serviceClient
          .from("offerings")
          .update({
            short_description: offering.short_description,
            description: offering.description,
            status: offering.status,
            category_id: categoryId,
            price: offering.price,
            currency,
            price_type: offering.price_type,
            metadata: offering.metadata,
          })
          .eq("id", existing.id)
          .eq("account_id", ctx.accountId);

        if (updErr) {
          results.errors.push(`Update "${offering.name}": ${updErr.message}`);
          continue;
        }
        results.offerings_updated++;

        // Sync the primary image with the seed image
        if (offering.image_url) {
          const { data: mediaRows } = await ctx.serviceClient
            .from("offering_media")
            .select("id, url, is_primary")
            .eq("offering_id", existing.id)
            .order("sort_order");

          const rows = mediaRows || [];
          const match = rows.find((m) => m.url === offering.image_url);

          if (match) {
            // Seed image already present — make sure it's the primary
            if (!match.is_primary) {
              const { error: mediaError } = await ctx.serviceClient
                .from("offering_media")
                .update({ is_primary: true, sort_order: 0 })
                .eq("id", match.id);
              if (mediaError) {
                results.errors.push(`Image for "${offering.name}": ${mediaError.message}`);
              } else {
                results.media_updated++;
              }
            }
          } else if (rows.length === 0) {
            // No image yet — insert the seed image
            const { error: mediaError } = await ctx.serviceClient.from("offering_media").insert({
              offering_id: existing.id,
              account_id: ctx.accountId,
              url: offering.image_url,
              alt_text: offering.image_alt || offering.name,
              sort_order: 0,
              is_primary: true,
            });
            if (mediaError) {
              results.errors.push(`Image for "${offering.name}": ${mediaError.message}`);
            } else {
              results.media_created++;
            }
          } else {
            // Seed image changed — replace the primary row's URL in place
            // (extra gallery photos are left alone)
            const primaryRow = rows.find((m) => m.is_primary) || rows[0];
            const { error: mediaError } = await ctx.serviceClient
              .from("offering_media")
              .update({
                url: offering.image_url,
                alt_text: offering.image_alt || offering.name,
              })
              .eq("id", primaryRow.id);
            if (mediaError) {
              results.errors.push(`Image for "${offering.name}": ${mediaError.message}`);
            } else {
              results.media_updated++;
            }
          }
        }
        continue;
      }

      const categoryId = categoryMap.get(offering.category_slug) || null;

      const { data: created, error } = await ctx.serviceClient.from("offerings").insert({
        account_id: ctx.accountId,
        type: offering.type,
        name: offering.name,
        slug,
        short_description: offering.short_description,
        description: offering.description,
        status: offering.status,
        category_id: categoryId,
        price: offering.price,
        currency,
        price_type: offering.price_type,
        metadata: offering.metadata,
      }).select("id").single();

      if (error) {
        results.errors.push(`Offering "${offering.name}": ${error.message}`);
        continue;
      }

      results.offerings_created++;

      // Attach the primary image (offering_media row with the public URL)
      if (offering.image_url && created?.id) {
        const { error: mediaError } = await ctx.serviceClient.from("offering_media").insert({
          offering_id: created.id,
          account_id: ctx.accountId,
          url: offering.image_url,
          alt_text: offering.image_alt || offering.name,
          sort_order: 0,
          is_primary: true,
        });
        if (mediaError) {
          results.errors.push(`Image for "${offering.name}": ${mediaError.message}`);
        } else {
          results.media_created++;
        }
      }
    }

    // ── 3. Update operating_hours ────────────────────────────
    if (seedData.operating_hours) {
      const { error } = await ctx.serviceClient
        .from("tenant_settings")
        .update({ operating_hours: seedData.operating_hours })
        .eq("account_id", ctx.accountId);

      if (error) {
        results.errors.push(`Operating hours: ${error.message}`);
      } else {
        results.operating_hours_updated = true;
      }
    }

    return NextResponse.json({
      ok: true,
      business_type: businessType,
      ...results,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
