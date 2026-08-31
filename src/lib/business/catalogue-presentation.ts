// ============================================================
// Catalogue Presentation — Centralized WhatsApp presentation strategy.
//
// Decides HOW to present catalogue data based on:
// - Number of results
// - Available images
// - Business config (multi-product support)
// - Item type
//
// Single decision point — no duplicate presentation logic in
// node handler, AI, or independent handler.
// ============================================================

import type { CatalogueItem, CatalogueCategory, PresentationContext, PresentationStrategy, PresentationStrategyType } from './catalogue-types';
import { INTERACTIVE_LIMITS } from '../whatsapp/meta-api';

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 3) + '...';
}

// ============================================================
// Strategy Selection
// ============================================================

/**
 * Select the best presentation strategy for a list of items.
 *
 * Priority:
 * 1. Single item → text detail
 * 2. ≤3 items with images + multi-product enabled → multi_product
 * 3. ≤3 items without images → buttons
 * 4. ≤10 items → list
 * 5. >10 items → paginated text fallback
 */
export function selectItemPresentation(
  items: CatalogueItem[],
  context: PresentationContext,
): PresentationStrategy {
  if (items.length === 0) {
    return {
      type: 'text_fallback',
      payload: { text: 'No items available.' },
    };
  }

  if (items.length === 1) {
    return {
      type: 'single_item',
      payload: { item: items[0] },
    };
  }

  if (
    items.length <= 3 &&
    context.has_images &&
    context.supports_multi_product
  ) {
    return {
      type: 'multi_product',
      payload: {
        items: items.slice(0, 3),
        sections: buildProductSections(items.slice(0, 3)),
      },
    };
  }

  if (items.length <= 3) {
    return {
      type: 'buttons',
      payload: {
        items,
        buttons: items.slice(0, 3).map((item) => ({
          id: `item:${item.id}`,
          title: truncate(item.name, INTERACTIVE_LIMITS.buttonTitleMaxLength),
        })),
      },
    };
  }

  if (items.length <= INTERACTIVE_LIMITS.maxListRowsTotal) {
    return {
      type: 'list',
      payload: {
        items,
        sections: buildListSections(items),
      },
    };
  }

  // Pagination fallback
  return {
    type: 'text_fallback',
    payload: {
      items,
      text: formatTextFallback(items),
      has_more: true,
    },
  };
}

/**
 * Select the best presentation for a list of categories.
 */
export function selectCategoryPresentation(
  categories: CatalogueCategory[],
): PresentationStrategy {
  if (categories.length === 0) {
    return {
      type: 'text_fallback',
      payload: { text: 'No categories available.' },
    };
  }

  if (categories.length <= 3) {
    return {
      type: 'buttons',
      payload: {
        categories,
        buttons: categories.map((cat) => ({
          id: `cat:${cat.id}`,
          title: truncate(cat.name, INTERACTIVE_LIMITS.buttonTitleMaxLength),
        })),
      },
    };
  }

  if (categories.length <= INTERACTIVE_LIMITS.maxListRowsTotal) {
    return {
      type: 'list',
      payload: {
        categories,
        sections: buildCategoryListSections(categories),
      },
    };
  }

  return {
    type: 'text_fallback',
    payload: {
      categories,
      text: categories.map((cat, i) => `${i + 1}. ${cat.name}`).join('\n'),
    },
  };
}

// ============================================================
// Payload Builders
// ============================================================

function buildProductSections(
  items: CatalogueItem[],
): Array<{
  title?: string;
  rows: Array<{ id: string; title: string; description?: string }>;
}> {
  return [
    {
      title: 'Select an item',
      rows: items.map((item) => ({
        id: `item:${item.id}`,
        title: truncate(item.name, INTERACTIVE_LIMITS.listRowTitleMaxLength),
        description: item.short_description
          ? truncate(item.short_description, INTERACTIVE_LIMITS.listRowDescriptionMaxLength)
          : undefined,
      })),
    },
  ];
}

function buildListSections(
  items: CatalogueItem[],
): Array<{
  title?: string;
  rows: Array<{ id: string; title: string; description?: string }>;
}> {
  return [
    {
      title: 'Available items',
      rows: items.map((item) => ({
        id: `item:${item.id}`,
        title: truncate(item.name, INTERACTIVE_LIMITS.listRowTitleMaxLength),
        description: item.short_description
          ? truncate(item.short_description, INTERACTIVE_LIMITS.listRowDescriptionMaxLength)
          : undefined,
      })),
    },
  ];
}

function buildCategoryListSections(
  categories: CatalogueCategory[],
): Array<{
  title?: string;
  rows: Array<{ id: string; title: string; description?: string }>;
}> {
  return [
    {
      title: 'Categories',
      rows: categories.map((cat) => ({
        id: `cat:${cat.id}`,
        title: truncate(cat.name, INTERACTIVE_LIMITS.listRowTitleMaxLength),
        description: cat.description
          ? truncate(cat.description, INTERACTIVE_LIMITS.listRowDescriptionMaxLength)
          : undefined,
      })),
    },
  ];
}

function formatTextFallback(items: CatalogueItem[]): string {
  return items
    .map((item, i) => {
      const price = item.price != null
        ? `${item.currency} ${item.price.toFixed(2)}`
        : 'Price on request';
      const desc = item.short_description
        ? '\n   ' + truncate(item.short_description, 60)
        : '';
      return `${i + 1}. *${item.name}* — ${price}${desc}`;
    })
    .join('\n\n');
}

// ============================================================
// Format helpers for presentation strategies
// ============================================================

/**
 * Get the body text for a presentation strategy.
 */
export function getBodyText(strategy: PresentationStrategy): string {
  switch (strategy.type) {
    case 'single_item': {
      const item = (strategy.payload as { item: CatalogueItem }).item;
      const price = item.price != null
        ? `${item.currency} ${item.price.toFixed(2)}`
        : 'Price on request';
      return `*${item.name}*\n\nPrice: ${price}${
        item.description
          ? '\n\n' + truncate(String(item.description), 300)
          : ''
      }`;
    }
    case 'multi_product':
      return 'Here are our items. Tap to view details:';
    case 'buttons':
      return 'Select an item to view details:';
    case 'list':
      return 'Browse our catalogue:';
    case 'text_fallback':
      return (strategy.payload as { text: string }).text;
    default:
      return '';
  }
}

/**
 * Get the header text for a presentation strategy.
 */
export function getHeaderText(
  strategy: PresentationStrategy,
  customHeader?: string,
): string | undefined {
  if (customHeader) return truncate(customHeader, 60);
  return undefined;
}

/**
 * Get the footer text for a presentation strategy.
 */
export function getFooterText(
  strategy: PresentationStrategy,
  customFooter?: string,
): string | undefined {
  if (customFooter) return truncate(customFooter, 60);
  return undefined;
}
