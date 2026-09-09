import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// GET /api/pricing - Get pricing formulas for account's offerings
export async function GET(req: NextRequest) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const { searchParams } = new URL(req.url);
    const offeringId = searchParams.get("offering_id");

    // Get user and account
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user's account
    const { data: memberships, error: membershipError } = await supabase
      .from("account_memberships")
      .select("account_id, role")
      .eq("user_id", user.id)
      .single();

    if (membershipError || !memberships) {
      return NextResponse.json({ error: "No account found" }, { status: 404 });
    }

    const accountId = memberships.account_id;

    let query = supabase
      .from("offerings")
      .select("id, name, type, metadata")
      .eq("account_id", accountId);

    if (offeringId) {
      query = query.eq("id", offeringId);
    }

    const { data: offerings, error } = await query;

    if (error) throw error;

    // Extract pricing formulas from metadata
    const pricingFormulas = offerings
      ?.map((offering) => {
        const metadata = offering.metadata as Record<string, unknown> | null;
        const pricing = metadata?.pricing as Record<string, unknown> | null;
        return {
          offering_id: offering.id,
          offering_name: offering.name,
          offering_type: offering.type,
          pricing: pricing || null,
        };
      })
      .filter((item) => item.pricing !== null);

    return NextResponse.json({ pricing_formulas: pricingFormulas });
  } catch (error) {
    console.error("Error fetching pricing formulas:", error);
    return NextResponse.json({ error: "Failed to fetch pricing formulas" }, { status: 500 });
  }
}

// POST /api/pricing - Update pricing formula for an offering
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { offering_id, pricing } = body;

    if (!offering_id || !pricing) {
      return NextResponse.json({ error: "offering_id and pricing are required" }, { status: 400 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    // Get user and account
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user's account and role
    const { data: memberships, error: membershipError } = await supabase
      .from("account_memberships")
      .select("account_id, role")
      .eq("user_id", user.id)
      .single();

    if (membershipError || !memberships) {
      return NextResponse.json({ error: "No account found" }, { status: 404 });
    }

    const accountId = memberships.account_id;
    const role = memberships.role;

    // Check if user has admin or owner role
    if (role !== "admin" && role !== "owner") {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
    }

    // Verify offering belongs to account
    const { data: offering, error: offeringError } = await supabase
      .from("offerings")
      .select("id, metadata")
      .eq("id", offering_id)
      .eq("account_id", accountId)
      .maybeSingle();

    if (offeringError || !offering) {
      return NextResponse.json({ error: "Offering not found" }, { status: 404 });
    }

    // Update metadata with new pricing formula
    const existingMetadata = (offering.metadata as Record<string, unknown>) || {};
    const updatedMetadata = {
      ...existingMetadata,
      pricing,
    };

    const { error: updateError } = await supabase
      .from("offerings")
      .update({ metadata: updatedMetadata })
      .eq("id", offering_id);

    if (updateError) throw updateError;

    return NextResponse.json({ success: true, pricing });
  } catch (error) {
    console.error("Error updating pricing formula:", error);
    return NextResponse.json({ error: "Failed to update pricing formula" }, { status: 500 });
  }
}

// DELETE /api/pricing - Remove pricing formula from an offering
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const offeringId = searchParams.get("offering_id");

    if (!offeringId) {
      return NextResponse.json({ error: "offering_id is required" }, { status: 400 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    // Get user and account
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user's account and role
    const { data: memberships, error: membershipError } = await supabase
      .from("account_memberships")
      .select("account_id, role")
      .eq("user_id", user.id)
      .single();

    if (membershipError || !memberships) {
      return NextResponse.json({ error: "No account found" }, { status: 404 });
    }

    const accountId = memberships.account_id;
    const role = memberships.role;

    // Check if user has admin or owner role
    if (role !== "admin" && role !== "owner") {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
    }

    // Verify offering belongs to account
    const { data: offering, error: offeringError } = await supabase
      .from("offerings")
      .select("id, metadata")
      .eq("id", offeringId)
      .eq("account_id", accountId)
      .maybeSingle();

    if (offeringError || !offering) {
      return NextResponse.json({ error: "Offering not found" }, { status: 404 });
    }

    // Remove pricing from metadata
    const existingMetadata = (offering.metadata as Record<string, unknown>) || {};
    const { pricing, ...restMetadata } = existingMetadata;

    const { error: updateError } = await supabase
      .from("offerings")
      .update({ metadata: restMetadata })
      .eq("id", offeringId);

    if (updateError) throw updateError;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting pricing formula:", error);
    return NextResponse.json({ error: "Failed to delete pricing formula" }, { status: 500 });
  }
}
