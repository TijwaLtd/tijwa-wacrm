// ============================================================
// Independent Catalogue Handler
//
// Handles catalogue intent when no flow or automation consumed
// the message. Integrates into the webhook pipeline:
//
// 1. Quick Reply Flow Lookup (existing)
// 2. Flow Dispatch (existing)
// 3. Automation Triggers (existing)
// 4. **Catalogue Intent Detection** ← HERE
// 5. AI Auto-Reply (existing)
// 6. Webhook Event (existing)
//
// Detects intent from message text, queries catalogue service,
// and sends WhatsApp response.
// ============================================================

import { CatalogueService } from './catalogue-service';
import type {
  CatalogueIntent,
  CatalogueIntentType,
} from './catalogue-types';
import {
  INTENT_KEYWORDS,
  CAPABILITY_INTENT_MAP,
} from './catalogue-types';
import {
  selectItemPresentation,
  selectCategoryPresentation,
  getBodyText,
  getHeaderText,
} from './catalogue-presentation';
import {
  sendTextMessage,
  sendInteractiveButtons,
  sendInteractiveList,
} from '../whatsapp/meta-api';

interface HandlerContext {
  accountId: string;
  contactId: string;
  conversationId: string;
  phoneNumberId: string;
  accessToken: string;
  enabledCapabilities: string[];
}

interface HandlerResult {
  handled: boolean;
  intent: CatalogueIntent | null;
}

// ============================================================
// Intent Detection
// ============================================================

/**
 * Detect catalogue intent from a message text.
 * Returns null if no catalogue intent is detected.
 */
export function detectCatalogueIntent(
  messageText: string,
  enabledCapabilities: string[],
): CatalogueIntent | null {
  const lowerText = messageText.toLowerCase().trim();

  // Check browse keywords FIRST (capability-specific takes priority)
  for (const capKey of enabledCapabilities) {
    const intentType = CAPABILITY_INTENT_MAP[capKey];
    if (!intentType) continue;

    const keywords = INTENT_KEYWORDS[intentType] ?? [];
    for (const keyword of keywords) {
      if (lowerText.includes(keyword.toLowerCase())) {
        return { type: intentType };
      }
    }
  }

  // Check for search intent (generic patterns)
  const searchPatterns = [
    /search\s+(?:for\s+)?(.+)/i,
    /find\s+(?:me\s+)?(.+)/i,
    /do you have\s+(?:any\s+|some\s+)?(.+)/i,
    /looking for\s+(.+)/i,
    /got any\s+(.+)/i,
  ];

  for (const pattern of searchPatterns) {
    const match = lowerText.match(pattern);
    if (match) {
      return { type: 'search_items', query: match[1].trim() };
    }
  }

  // Check for specific item intent (most specific patterns)
  const getItemPatterns = [
    /tell me about\s+(.+)/i,
    /what is\s+(the|a|an)\s+(.+)/i,
    /details? for\s+(.+)/i,
    /info(?:rmation)? about\s+(.+)/i,
  ];

  for (const pattern of getItemPatterns) {
    const match = lowerText.match(pattern);
    if (match) {
      // For "what is" pattern, capture group 2 is the item name
      const itemName = match[2] ?? match[1];
      return { type: 'get_item', item_name: itemName.trim() };
    }
  }

  return null;
}

// ============================================================
// Handler
// ============================================================

/**
 * Handle a catalogue intent. Sends WhatsApp response directly.
 *
 * Returns { handled: true } if the intent was processed,
 * { handled: false } if it should fall through to AI.
 */
export async function handleCatalogueIntent(
  ctx: HandlerContext,
  intent: CatalogueIntent,
): Promise<HandlerResult> {
  const catalogue = new CatalogueService();

  try {
    switch (intent.type) {
      case 'browse_products':
      case 'browse_menu':
      case 'browse_services':
      case 'browse_courses':
      case 'browse_rooms':
      case 'browse_programs':
      case 'browse_properties':
      case 'browse_events':
        await handleBrowse(ctx, catalogue, intent.type);
        return { handled: true, intent };

      case 'search_items':
        await handleSearch(ctx, catalogue, intent.query ?? '');
        return { handled: true, intent };

      case 'get_item':
        await handleGetItem(ctx, catalogue, intent.item_name ?? '');
        return { handled: true, intent };

      default:
        return { handled: false, intent: null };
    }
  } catch (error) {
    // Log error but don't crash — let AI handle it
    console.error('Catalogue handler error:', error);
    return { handled: false, intent };
  }
}

// ============================================================
// Browse handler
// ============================================================

async function handleBrowse(
  ctx: HandlerContext,
  catalogue: CatalogueService,
  intentType: CatalogueIntentType,
): Promise<void> {
  // Map intent type to offering type
  const TYPE_MAP: Record<string, string> = {
    browse_products: 'product',
    browse_menu: 'menu_item',
    browse_services: 'service',
    browse_courses: 'course',
    browse_rooms: 'room',
    browse_programs: 'program',
    browse_properties: 'property',
    browse_events: 'event',
  };

  const offeringType = TYPE_MAP[intentType ?? ''] as import('./offerings').OfferingType | undefined;

  // First, try to get categories
  const categories = await catalogue.getCategories(ctx.accountId);

  if (categories.length > 0) {
    // Show categories as interactive message
    const strategy = selectCategoryPresentation(categories);
    const bodyText = getBodyText(strategy);

    if (strategy.type === 'buttons') {
      const payload = strategy.payload as {
        buttons: Array<{ id: string; title: string }>;
      };
      await sendInteractiveButtons({
        phoneNumberId: ctx.phoneNumberId,
        accessToken: ctx.accessToken,
        to: ctx.contactId,
        bodyText,
        headerText: getHeaderText(strategy),
        buttons: payload.buttons.slice(0, 3),
      });
    } else if (strategy.type === 'list') {
      const payload = strategy.payload as {
        sections: Array<{
          title?: string;
          rows: Array<{ id: string; title: string; description?: string }>;
        }>;
      };
      await sendInteractiveList({
        phoneNumberId: ctx.phoneNumberId,
        accessToken: ctx.accessToken,
        to: ctx.contactId,
        bodyText,
        buttonLabel: 'View Categories',
        sections: payload.sections,
      });
    } else {
      await sendTextMessage({
        phoneNumberId: ctx.phoneNumberId,
        accessToken: ctx.accessToken,
        to: ctx.contactId,
        text: bodyText,
      });
    }
    return;
  }

  // No categories — show items directly
  const result = await catalogue.getItems(ctx.accountId, {
    type: offeringType,
    limit: 10,
  });

  const strategy = selectItemPresentation(result.items, {
    supports_multi_product: true,
    result_count: result.items.length,
    offering_type: offeringType,
    has_images: result.items.some((i) => i.image_url),
  });

  const bodyText = getBodyText(strategy);

  if (strategy.type === 'buttons') {
    const payload = strategy.payload as {
      buttons: Array<{ id: string; title: string }>;
    };
    await sendInteractiveButtons({
      phoneNumberId: ctx.phoneNumberId,
      accessToken: ctx.accessToken,
      to: ctx.contactId,
      bodyText,
      buttons: payload.buttons.slice(0, 3),
    });
  } else if (strategy.type === 'list') {
    const payload = strategy.payload as {
      sections: Array<{
        title?: string;
        rows: Array<{ id: string; title: string; description?: string }>;
      }>;
    };
    await sendInteractiveList({
      phoneNumberId: ctx.phoneNumberId,
      accessToken: ctx.accessToken,
      to: ctx.contactId,
      bodyText,
      buttonLabel: 'View Items',
      sections: payload.sections,
    });
  } else {
    await sendTextMessage({
      phoneNumberId: ctx.phoneNumberId,
      accessToken: ctx.accessToken,
      to: ctx.contactId,
      text: bodyText,
    });
  }
}

// ============================================================
// Search handler
// ============================================================

async function handleSearch(
  ctx: HandlerContext,
  catalogue: CatalogueService,
  query: string,
): Promise<void> {
  if (!query.trim()) {
    await sendTextMessage({
      phoneNumberId: ctx.phoneNumberId,
      accessToken: ctx.accessToken,
      to: ctx.contactId,
      text: 'What are you looking for? Please tell me the product, service, or item name.',
    });
    return;
  }

  const result = await catalogue.searchItems(ctx.accountId, { query, limit: 10 });

  const text = catalogue.formatSearchResults(result.items, query);
  await sendTextMessage({
    phoneNumberId: ctx.phoneNumberId,
    accessToken: ctx.accessToken,
    to: ctx.contactId,
    text,
  });
}

// ============================================================
// Get item handler
// ============================================================

async function handleGetItem(
  ctx: HandlerContext,
  catalogue: CatalogueService,
  itemName: string,
): Promise<void> {
  if (!itemName.trim()) {
    await sendTextMessage({
      phoneNumberId: ctx.phoneNumberId,
      accessToken: ctx.accessToken,
      to: ctx.contactId,
      text: 'Which item would you like to know about? Please provide the name.',
    });
    return;
  }

  // Search by name
  const result = await catalogue.searchItems(ctx.accountId, {
    query: itemName,
    limit: 5,
  });

  if (result.items.length === 0) {
    await sendTextMessage({
      phoneNumberId: ctx.phoneNumberId,
      accessToken: ctx.accessToken,
      to: ctx.contactId,
      text: `Sorry, we couldn't find "${itemName}" in our catalogue.`,
    });
    return;
  }

  if (result.items.length === 1) {
    // Show detail for single match
    const detail = catalogue.formatItemDetail(result.items[0]);
    await sendTextMessage({
      phoneNumberId: ctx.phoneNumberId,
      accessToken: ctx.accessToken,
      to: ctx.contactId,
      text: detail,
    });
    return;
  }

  // Multiple matches — show as list
  const strategy = selectItemPresentation(result.items, {
    supports_multi_product: true,
    result_count: result.items.length,
    has_images: result.items.some((i) => i.image_url),
  });

  const bodyText = getBodyText(strategy);

  if (strategy.type === 'buttons') {
    const payload = strategy.payload as {
      buttons: Array<{ id: string; title: string }>;
    };
    await sendInteractiveButtons({
      phoneNumberId: ctx.phoneNumberId,
      accessToken: ctx.accessToken,
      to: ctx.contactId,
      bodyText,
      buttons: payload.buttons.slice(0, 3),
    });
  } else if (strategy.type === 'list') {
    const payload = strategy.payload as {
      sections: Array<{
        title?: string;
        rows: Array<{ id: string; title: string; description?: string }>;
      }>;
    };
    await sendInteractiveList({
      phoneNumberId: ctx.phoneNumberId,
      accessToken: ctx.accessToken,
      to: ctx.contactId,
      bodyText,
      buttonLabel: 'View Items',
      sections: payload.sections,
    });
  } else {
    await sendTextMessage({
      phoneNumberId: ctx.phoneNumberId,
      accessToken: ctx.accessToken,
      to: ctx.contactId,
      text: bodyText,
    });
  }
}
