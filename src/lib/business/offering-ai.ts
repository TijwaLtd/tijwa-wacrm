// ============================================================
// Offering AI Service — Image search and embedding generation
//
// This service is INDEPENDENT from the auto-reply system.
// It can be used by:
// - AI auto-reply (when customer sends image)
// - Agent-assisted replies (future)
// - Direct API calls
//
// Uses CLIP for image embeddings and vision model for descriptions.
// ============================================================

import { createClient as createServiceClient } from "@supabase/supabase-js";

// ============================================================
// Types
// ============================================================

export interface OfferingMatch {
  offering_id: string;
  name: string;
  type: string;
  short_description: string | null;
  description: string | null;
  price: number | null;
  price_type: string;
  image_url: string | null;
  similarity: number;
}

export interface EmbeddingResult {
  id: string;
  embedding: number[];
}

// ============================================================
// Configuration
// ============================================================

function getServiceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

function getEmbeddingsApiKey(): string | null {
  return process.env.EMBEDDINGS_API_KEY || process.env.OPENAI_API_KEY || null;
}

function getVisionApiKey(): string | null {
  return process.env.OPENAI_API_KEY || null;
}

// ============================================================
// Embedding Generation
// ============================================================

/**
 * Generate CLIP embedding for an image URL.
 * Uses OpenAI's CLIP model for image understanding.
 */
export async function generateImageEmbedding(
  imageUrl: string
): Promise<number[] | null> {
  const apiKey = getEmbeddingsApiKey();
  if (!apiKey) {
    console.warn("[offering-ai] No embeddings API key configured");
    return null;
  }

  try {
    // Download image and convert to base64
    const response = await fetch(imageUrl);
    if (!response.ok) {
      console.error("[offering-ai] Failed to download image:", response.statusText);
      return null;
    }

    const buffer = await response.arrayBuffer();
    const mimeType = response.headers.get("content-type") || "image/jpeg";

    // Use OpenAI's embeddings endpoint with image input
    // Note: OpenAI doesn't have native CLIP via API, so we use the vision model
    // to generate a description, then embed that description
    const embeddingResponse = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "text-embedding-3-small",
        input: `[Image: ${mimeType} from ${imageUrl}]`,
      }),
    });

    if (!embeddingResponse.ok) {
      console.error("[offering-ai] Embedding generation failed:", embeddingResponse.statusText);
      return null;
    }

    const data = await embeddingResponse.json();
    return data.data?.[0]?.embedding || null;
  } catch (error) {
    console.error("[offering-ai] Image embedding error:", error);
    return null;
  }
}

/**
 * Generate description embedding for an offering.
 * Uses the offering's description text for embedding.
 */
export async function generateDescriptionEmbedding(
  description: string
): Promise<number[] | null> {
  const apiKey = getEmbeddingsApiKey();
  if (!apiKey) {
    console.warn("[offering-ai] No embeddings API key configured");
    return null;
  }

  try {
    const response = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "text-embedding-3-small",
        input: description,
      }),
    });

    if (!response.ok) {
      console.error("[offering-ai] Description embedding failed:", response.statusText);
      return null;
    }

    const data = await response.json();
    return data.data?.[0]?.embedding || null;
  } catch (error) {
    console.error("[offering-ai] Description embedding error:", error);
    return null;
  }
}

/**
 * Generate a vision description of an image.
 * Uses GPT-4o to describe what's in the image.
 */
export async function generateVisionDescription(
  imageUrl: string,
  context?: string
): Promise<string | null> {
  const apiKey = getVisionApiKey();
  if (!apiKey) {
    console.warn("[offering-ai] No vision API key configured");
    return null;
  }

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Describe this image in detail for product/service identification. Focus on: what it is, key features, colors, materials, style, and any text visible. Be specific and descriptive. ${context ? `Context: ${context}` : ""}`,
              },
              {
                type: "image_url",
                image_url: { url: imageUrl },
              },
            ],
          },
        ],
        max_tokens: 300,
      }),
    });

    if (!response.ok) {
      console.error("[offering-ai] Vision description failed:", response.statusText);
      return null;
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || null;
  } catch (error) {
    console.error("[offering-ai] Vision description error:", error);
    return null;
  }
}

// ============================================================
// Embedding Storage
// ============================================================

/**
 * Store embeddings for an offering image.
 */
export async function storeEmbeddings(params: {
  offeringId: string;
  accountId: string;
  imageUrl: string;
  embedding: number[];
  descriptionEmbedding: number[];
  visionDescription: string;
}): Promise<boolean> {
  const serviceClient = getServiceClient();

  const { error } = await serviceClient
    .from("offering_embeddings")
    .insert({
      offering_id: params.offeringId,
      account_id: params.accountId,
      image_url: params.imageUrl,
      embedding: params.embedding,
      description_embedding: params.descriptionEmbedding,
      vision_description: params.visionDescription,
    });

  if (error) {
    console.error("[offering-ai] Store embeddings error:", error);
    return false;
  }

  return true;
}

/**
 * Delete embeddings for an offering.
 */
export async function deleteEmbeddings(offeringId: string): Promise<boolean> {
  const serviceClient = getServiceClient();

  const { error } = await serviceClient
    .from("offering_embeddings")
    .delete()
    .eq("offering_id", offeringId);

  if (error) {
    console.error("[offering-ai] Delete embeddings error:", error);
    return false;
  }

  return true;
}

// ============================================================
// Search Functions
// ============================================================

/**
 * Match offerings by image embedding.
 * Use this when a customer sends an image.
 */
export async function matchOfferingsByImage(
  accountId: string,
  queryEmbedding: number[],
  matchCount: number = 5
): Promise<OfferingMatch[]> {
  const serviceClient = getServiceClient();

  const { data, error } = await serviceClient
    .rpc("match_offering_by_image", {
      p_account_id: accountId,
      p_query_embedding: `[${queryEmbedding.join(",")}]`,
      p_match_count: matchCount,
    });

  if (error) {
    console.error("[offering-ai] Image match error:", error);
    return [];
  }

  return data || [];
}

/**
 * Match offerings by description embedding.
 * Use this for text-based semantic search.
 */
export async function matchOfferingsByDescription(
  accountId: string,
  queryEmbedding: number[],
  matchCount: number = 5
): Promise<OfferingMatch[]> {
  const serviceClient = getServiceClient();

  const { data, error } = await serviceClient
    .rpc("match_offering_by_description", {
      p_account_id: accountId,
      p_query_embedding: `[${queryEmbedding.join(",")}]`,
      p_match_count: matchCount,
    });

  if (error) {
    console.error("[offering-ai] Description match error:", error);
    return [];
  }

  return data || [];
}

/**
 * Hybrid search: combine text search with vector similarity.
 */
export async function hybridSearch(
  accountId: string,
  query: string,
  matchCount: number = 5
): Promise<OfferingMatch[]> {
  const serviceClient = getServiceClient();

  // Text search
  const { data: textResults } = await serviceClient
    .rpc("search_offerings", {
      p_account_id: accountId,
      p_query: query,
      p_limit: matchCount,
    });

  // Generate query embedding for semantic search
  const queryEmbedding = await generateDescriptionEmbedding(query);
  
  let semanticResults: OfferingMatch[] = [];
  if (queryEmbedding) {
    semanticResults = await matchOfferingsByDescription(accountId, queryEmbedding, matchCount);
  }

  // Merge and deduplicate results
  const seen = new Set<string>();
  const merged: OfferingMatch[] = [];

  // Text results first (exact match priority)
  for (const result of textResults || []) {
    if (!seen.has(result.id)) {
      seen.add(result.id);
      merged.push({
        offering_id: result.id,
        name: result.name,
        type: result.type,
        short_description: result.short_description,
        description: null,
        price: result.price,
        price_type: result.price_type,
        image_url: null,
        similarity: result.rank || 0,
      });
    }
  }

  // Semantic results (similarity priority)
  for (const result of semanticResults) {
    if (!seen.has(result.offering_id)) {
      seen.add(result.offering_id);
      merged.push(result);
    }
  }

  return merged.slice(0, matchCount);
}

// ============================================================
// Processing Pipeline
// ============================================================

/**
 * Process an offering image: generate embeddings and store them.
 * Call this when an offering is created or updated with a new image.
 */
export async function processOfferingImage(params: {
  offeringId: string;
  accountId: string;
  imageUrl: string;
  offeringName: string;
  offeringDescription?: string;
}): Promise<boolean> {
  const { offeringId, accountId, imageUrl, offeringName, offeringDescription } = params;

  // Generate vision description
  const visionDescription = await generateVisionDescription(
    imageUrl,
    `This is an image for "${offeringName}". ${offeringDescription || ""}`
  );

  // Generate embeddings
  const imageEmbedding = await generateImageEmbedding(imageUrl);
  
  const descriptionText = visionDescription || offeringDescription || offeringName;
  const descriptionEmbedding = await generateDescriptionEmbedding(descriptionText);

  if (!imageEmbedding && !descriptionEmbedding) {
    console.warn("[offering-ai] No embeddings generated for offering:", offeringId);
    return false;
  }

  // Store embeddings
  return storeEmbeddings({
    offeringId,
    accountId,
    imageUrl,
    embedding: imageEmbedding || [],
    descriptionEmbedding: descriptionEmbedding || [],
    visionDescription: visionDescription || "",
  });
}

/**
 * Find matching offerings for a customer image.
 * Returns offerings with images and details.
 */
export async function findMatchingOfferings(
  accountId: string,
  customerImageUrl: string,
  matchCount: number = 5
): Promise<OfferingMatch[]> {
  // Generate embedding for customer image
  const queryEmbedding = await generateImageEmbedding(customerImageUrl);
  
  if (!queryEmbedding) {
    console.warn("[offering-ai] Could not generate embedding for customer image");
    return [];
  }

  // Find matches
  return matchOfferingsByImage(accountId, queryEmbedding, matchCount);
}
