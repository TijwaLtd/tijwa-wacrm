import { describe, it, expect } from "vitest";
import {
  selectItemPresentation,
  selectCategoryPresentation,
  getBodyText,
} from "./catalogue-presentation";
import type { CatalogueItem, CatalogueCategory, PresentationContext } from "./catalogue-types";

describe("catalogue-presentation", () => {
  const makeItem = (overrides: Partial<CatalogueItem> = {}): CatalogueItem => ({
    id: "item-1",
    source_id: null,
    type: "product",
    category_id: null,
    category_name: null,
    name: "Test Item",
    slug: "test-item",
    short_description: "A test item",
    description: "Long description",
    image_url: null,
    image_urls: [],
    price: 29.99,
    currency: "USD",
    price_type: "fixed",
    sku: null,
    metadata: {},
    created_at: "2025-01-01T00:00:00Z",
    updated_at: "2025-01-01T00:00:00Z",
    ...overrides,
  });

  const makeCategory = (overrides: Partial<CatalogueCategory> = {}): CatalogueCategory => ({
    id: "cat-1",
    name: "Test Category",
    slug: "test-category",
    description: null,
    parent_id: null,
    sort_order: 0,
    ...overrides,
  });

  const defaultContext: PresentationContext = {
    supports_multi_product: true,
    result_count: 3,
    has_images: true,
  };

  describe("selectItemPresentation", () => {
    it("returns text_fallback for empty items", () => {
      const strategy = selectItemPresentation([], defaultContext);
      expect(strategy.type).toBe("text_fallback");
    });

    it("returns single_item for one item", () => {
      const strategy = selectItemPresentation([makeItem()], defaultContext);
      expect(strategy.type).toBe("single_item");
      expect((strategy.payload as { item: CatalogueItem }).item.name).toBe("Test Item");
    });

    it("returns multi_product for ≤3 items with images and multi-product support", () => {
      const items = [
        makeItem({ id: "1", image_url: "http://example.com/1.jpg" }),
        makeItem({ id: "2", image_url: "http://example.com/2.jpg" }),
        makeItem({ id: "3", image_url: "http://example.com/3.jpg" }),
      ];
      const strategy = selectItemPresentation(items, {
        ...defaultContext,
        has_images: true,
        supports_multi_product: true,
      });
      expect(strategy.type).toBe("multi_product");
    });

    it("returns buttons for ≤3 items without images", () => {
      const items = [makeItem({ id: "1" }), makeItem({ id: "2" })];
      const strategy = selectItemPresentation(items, {
        ...defaultContext,
        has_images: false,
        supports_multi_product: true,
      });
      expect(strategy.type).toBe("buttons");
    });

    it("returns buttons for ≤3 items with images but no multi-product support", () => {
      const items = [
        makeItem({ id: "1", image_url: "http://example.com/1.jpg" }),
        makeItem({ id: "2", image_url: "http://example.com/2.jpg" }),
      ];
      const strategy = selectItemPresentation(items, {
        ...defaultContext,
        has_images: true,
        supports_multi_product: false,
      });
      expect(strategy.type).toBe("buttons");
    });

    it("returns list for 4-10 items", () => {
      const items = Array.from({ length: 5 }, (_, i) =>
        makeItem({ id: `item-${i}`, name: `Item ${i}` }),
      );
      const strategy = selectItemPresentation(items, defaultContext);
      expect(strategy.type).toBe("list");
    });

    it("returns text_fallback for >10 items", () => {
      const items = Array.from({ length: 11 }, (_, i) =>
        makeItem({ id: `item-${i}`, name: `Item ${i}` }),
      );
      const strategy = selectItemPresentation(items, defaultContext);
      expect(strategy.type).toBe("text_fallback");
    });
  });

  describe("selectCategoryPresentation", () => {
    it("returns text_fallback for empty categories", () => {
      const strategy = selectCategoryPresentation([]);
      expect(strategy.type).toBe("text_fallback");
    });

    it("returns buttons for ≤3 categories", () => {
      const categories = [
        makeCategory({ id: "1", name: "Category 1" }),
        makeCategory({ id: "2", name: "Category 2" }),
        makeCategory({ id: "3", name: "Category 3" }),
      ];
      const strategy = selectCategoryPresentation(categories);
      expect(strategy.type).toBe("buttons");
    });

    it("returns list for 4-10 categories", () => {
      const categories = Array.from({ length: 5 }, (_, i) =>
        makeCategory({ id: `cat-${i}`, name: `Category ${i}` }),
      );
      const strategy = selectCategoryPresentation(categories);
      expect(strategy.type).toBe("list");
    });

    it("returns text_fallback for >10 categories", () => {
      const categories = Array.from({ length: 11 }, (_, i) =>
        makeCategory({ id: `cat-${i}`, name: `Category ${i}` }),
      );
      const strategy = selectCategoryPresentation(categories);
      expect(strategy.type).toBe("text_fallback");
    });
  });

  describe("getBodyText", () => {
    it("returns formatted text for single_item", () => {
      const strategy = selectItemPresentation([makeItem()], defaultContext);
      const text = getBodyText(strategy);
      expect(text).toContain("Test Item");
      expect(text).toContain("29.99");
    });

    it("returns descriptive text for multi_product", () => {
      const items = [
        makeItem({ id: "1", image_url: "http://example.com/1.jpg" }),
        makeItem({ id: "2", image_url: "http://example.com/2.jpg" }),
      ];
      const strategy = selectItemPresentation(items, {
        ...defaultContext,
        has_images: true,
        supports_multi_product: true,
      });
      const text = getBodyText(strategy);
      expect(text).toBeTruthy();
    });

    it("returns browse text for list", () => {
      const items = Array.from({ length: 5 }, (_, i) =>
        makeItem({ id: `item-${i}`, name: `Item ${i}` }),
      );
      const strategy = selectItemPresentation(items, defaultContext);
      const text = getBodyText(strategy);
      expect(text).toBeTruthy();
    });
  });
});
