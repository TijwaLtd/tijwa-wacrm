import type { SupabaseClient } from '@supabase/supabase-js'
import type { AiConfig } from './types'
import { chunkText } from './chunk'
import { embedTexts, toVectorLiteral } from './embeddings'
import { findMatchingOfferings } from '@/lib/business/offering-ai'
import { getCatalogueService } from '@/lib/business/catalogue-service'

// ============================================================
// Knowledge base: ingest (chunk + optionally embed) and hybrid
// retrieve (semantic when an embeddings key is present, topped up with
// lexical full-text search). Securely includes dynamic DB context
// (catalog offerings, image photo matching, orders/bookings).
// ============================================================

interface MatchRow {
  id: string
  content: string
}

/**
 * (Re)build the chunks for one document. Deletes the document's
 * existing chunks, re-chunks the content, and — when the account has an
 * embeddings key — embeds each chunk. Runs under whatever client the
 * caller passes (service-role for ingest routes).
 *
 * Throws on embedding failure so the ingest route can report it; the
 * chunks are only written once embedding (if attempted) succeeds, so a
 * failed embed never leaves half-indexed rows.
 */
export async function ingestDocument(
  db: SupabaseClient,
  accountId: string,
  config: Pick<AiConfig, 'embeddingsApiKey'>,
  documentId: string,
  content: string,
): Promise<void> {
  const chunks = chunkText(content)

  // Replace, don't append — re-ingest must be idempotent.
  const { error: delErr } = await db
    .from('ai_knowledge_chunks')
    .delete()
    .eq('document_id', documentId)
  if (delErr) throw delErr

  if (chunks.length === 0) return

  // Embed if a key is set, but DON'T let an embedding failure stop the
  // chunks from being stored: a failed embed must still leave the
  // document searchable lexically. We record the error and rethrow it
  // AFTER inserting (embedding-less) rows, so the route can warn
  // "semantic indexing failed" — which is now truthful, because lexical
  // search really does still work.
  let embeddings: number[][] | null = null
  let embedError: unknown = null
  if (config.embeddingsApiKey) {
    try {
      embeddings = await embedTexts(config.embeddingsApiKey, chunks)
    } catch (err) {
      embedError = err
    }
  }

  const rows = chunks.map((content, i) => ({
    document_id: documentId,
    account_id: accountId,
    chunk_index: i,
    content,
    embedding: embeddings ? toVectorLiteral(embeddings[i]) : null,
  }))

  const { error: insErr } = await db.from('ai_knowledge_chunks').insert(rows)
  if (insErr) throw insErr

  if (embedError) throw embedError
}

/**
 * Retrieve up to `k` knowledge excerpts relevant to `queryText` and `options`.
 * Securely accesses DB tables (offerings, image matches, orders, bookings, KB chunks)
 * strictly isolated by `account_id`.
 */
export async function retrieveKnowledge(
  db: SupabaseClient,
  accountId: string,
  config: Pick<AiConfig, 'embeddingsApiKey'>,
  queryText: string,
  k = 5,
  options?: { imageUrl?: string | null },
): Promise<string[]> {
  const query = queryText.trim()
  const excerpts: string[] = []

  // 1. Dynamic Photo/Image Matching (tenant-isolated with account_id)
  if (options?.imageUrl) {
    try {
      const matches = await findMatchingOfferings(accountId, options.imageUrl, 3)
      if (matches && matches.length > 0) {
        const matchLines = matches.map((m) => {
          const priceStr = m.price !== null ? `$${Number(m.price).toFixed(2)}` : 'Price on request'
          const desc = m.short_description || m.description || 'No description available'
          return `[MATCHED PRODUCT FROM CUSTOMER PHOTO]\nName: ${m.name}\nPrice: ${priceStr}\nType: ${m.type}\nDetails: ${desc}${m.image_url ? `\nImage URL: ${m.image_url}` : ''}\nMatch Confidence: ${Math.round((m.similarity || 0) * 100)}%`
        })
        excerpts.push(...matchLines)
      }
    } catch (err) {
      console.error('[ai knowledge] image matching failed:', err)
    }
  }

  // 2. Orders & Bookings Context (tenant-isolated with account_id)
  if (query) {
    const orderMatches = query.match(/ORD-[\w-]+/gi)
    if (orderMatches && orderMatches.length > 0) {
      for (const orderNum of orderMatches) {
        try {
          const { data: order } = await db
            .from('orders')
            .select('*, order_items(*)')
            .eq('account_id', accountId)
            .ilike('order_number', orderNum)
            .maybeSingle()
          if (order) {
            const itemsStr = (order.order_items || [])
              .map((item: { quantity: number; name: string; unit_price: number }) => `${item.quantity}x ${item.name} ($${item.unit_price})`)
              .join(', ')
            excerpts.push(
              `[ORDER DETAILS FOR ${order.order_number}]\nStatus: ${order.status}\nTotal: ${order.currency || 'USD'} ${order.total}\nItems: ${itemsStr || 'None'}\nDate: ${order.created_at}`
            )
          }
        } catch (err) {
          console.error('[ai knowledge] order lookup failed:', err)
        }
      }
    }

    const bookingMatches = query.match(/BK-[\w-]+/gi)
    if (bookingMatches && bookingMatches.length > 0) {
      for (const bookingNum of bookingMatches) {
        try {
          const { data: booking } = await db
            .from('bookings')
            .select('*, offering:offerings(name)')
            .eq('account_id', accountId)
            .ilike('booking_number', bookingNum)
            .maybeSingle()
          if (booking) {
            excerpts.push(
              `[BOOKING DETAILS FOR ${booking.booking_number}]\nStatus: ${booking.status}\nItem/Service: ${(booking.offering as { name?: string } | null)?.name || 'N/A'}\nDates: ${booking.start_date} to ${booking.end_date}\nGuests: ${booking.guests}\nTotal: ${booking.currency || 'USD'} ${booking.total}`
            )
          }
        } catch (err) {
          console.error('[ai knowledge] booking lookup failed:', err)
        }
      }
    }
  }

  // 3. Dynamic Catalogue Search (tenant-isolated with account_id)
  if (query) {
    try {
      const catService = getCatalogueService()
      const searchResult = await catService.searchItems(accountId, { query, limit: 3 })
      if (searchResult.items && searchResult.items.length > 0) {
        const catExcerpts = searchResult.items.map((item) =>
          `[CATALOGUE ITEM]\n${catService.formatItemDetail(item)}`
        )
        excerpts.push(...catExcerpts)
      }
    } catch (err) {
      console.error('[ai knowledge] catalogue search failed:', err)
    }
  }

  // 4. Static Knowledge Base Chunks (tenant-isolated with account_id)
  const picked = new Map<string, string>() // id → content
  try {
    const { count, error } = await db
      .from('ai_knowledge_chunks')
      .select('id', { count: 'exact', head: true })
      .eq('account_id', accountId)

    if (!error && count && count > 0) {
      // Semantic path
      if (config.embeddingsApiKey && query) {
        try {
          const [queryEmbedding] = await embedTexts(config.embeddingsApiKey, [query])
          if (queryEmbedding) {
            const { data, error } = await db.rpc('match_ai_knowledge_semantic', {
              p_account_id: accountId,
              p_query_embedding: toVectorLiteral(queryEmbedding),
              p_match_count: k,
            })
            if (!error && Array.isArray(data)) {
              for (const row of data as MatchRow[]) picked.set(row.id, row.content)
            }
          }
        } catch (err) {
          console.error('[ai knowledge] semantic retrieval failed, falling back to FTS:', err)
        }
      }

      // Lexical top-up
      if (picked.size < k && query) {
        try {
          const { data, error } = await db.rpc('match_ai_knowledge_fts', {
            p_account_id: accountId,
            p_query: query,
            p_match_count: k,
          })
          if (!error && Array.isArray(data)) {
            for (const row of data as MatchRow[]) {
              if (picked.size >= k) break
              if (!picked.has(row.id)) picked.set(row.id, row.content)
            }
          }
        } catch (err) {
          console.error('[ai knowledge] lexical retrieval failed:', err)
        }
      }
    }
  } catch (err) {
    console.error('[ai knowledge] static chunk retrieval check failed:', err)
  }

  const staticChunks = Array.from(picked.values()).slice(0, k)
  return [...excerpts, ...staticChunks]
}
