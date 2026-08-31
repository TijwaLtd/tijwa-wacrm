import { describe, it, expect } from "vitest";
import { detectCatalogueIntent } from "./catalogue-handler";
import type { CatalogueIntent } from "./catalogue-types";

describe("catalogue-handler", () => {
  describe("detectCatalogueIntent", () => {
    describe("browse intents", () => {
      it("detects product browse intent", () => {
        const result = detectCatalogueIntent("show me your products", ["products"]);
        expect(result).not.toBeNull();
        expect(result?.type).toBe("browse_products");
      });

      it("detects menu browse intent", () => {
        const result = detectCatalogueIntent("what's on the menu", ["menu"]);
        expect(result).not.toBeNull();
        expect(result?.type).toBe("browse_menu");
      });

      it("detects service browse intent", () => {
        const result = detectCatalogueIntent("what services do you offer", ["services"]);
        expect(result).not.toBeNull();
        expect(result?.type).toBe("browse_services");
      });

      it("detects course browse intent", () => {
        const result = detectCatalogueIntent("what courses do you have", ["courses"]);
        expect(result).not.toBeNull();
        expect(result?.type).toBe("browse_courses");
      });

      it("detects room browse intent", () => {
        const result = detectCatalogueIntent("do you have rooms available", ["accommodation"]);
        expect(result).not.toBeNull();
        expect(result?.type).toBe("browse_rooms");
      });

      it("detects property browse intent", () => {
        const result = detectCatalogueIntent("show me properties", ["property_listings"]);
        expect(result).not.toBeNull();
        expect(result?.type).toBe("browse_properties");
      });

      it("detects event browse intent", () => {
        const result = detectCatalogueIntent("what events are coming up", ["events"]);
        expect(result).not.toBeNull();
        expect(result?.type).toBe("browse_events");
      });
    });

    describe("search intents", () => {
      it("detects search with 'search for' pattern", () => {
        const result = detectCatalogueIntent("search for wireless headphones", ["products"]);
        expect(result).not.toBeNull();
        expect(result?.type).toBe("search_items");
        expect(result?.query).toBe("wireless headphones");
      });

      it("detects search with 'find' pattern", () => {
        const result = detectCatalogueIntent("find me a laptop", ["products"]);
        expect(result).not.toBeNull();
        expect(result?.type).toBe("search_items");
        expect(result?.query).toBe("a laptop");
      });

      it("detects search with 'do you have' pattern", () => {
        const result = detectCatalogueIntent("do you have wireless headphones", ["products"]);
        expect(result).not.toBeNull();
        expect(result?.type).toBe("search_items");
        expect(result?.query).toBe("wireless headphones");
      });

      it("detects search with 'looking for' pattern", () => {
        const result = detectCatalogueIntent("looking for a wireless mouse", ["products"]);
        expect(result).not.toBeNull();
        expect(result?.type).toBe("search_items");
        expect(result?.query).toBe("a wireless mouse");
      });
    });

    describe("get item intents", () => {
      it("detects get item with 'tell me about' pattern", () => {
        const result = detectCatalogueIntent("tell me about the deluxe suite", ["accommodation"]);
        expect(result).not.toBeNull();
        expect(result?.type).toBe("get_item");
        expect(result?.item_name).toBe("the deluxe suite");
      });

      it("detects get item with 'what is' pattern", () => {
        const result = detectCatalogueIntent("what is the premium plan", ["services"]);
        expect(result).not.toBeNull();
        expect(result?.type).toBe("get_item");
        expect(result?.item_name).toBe("premium plan");
      });

      it("detects get item with 'show me' pattern", () => {
        const result = detectCatalogueIntent("show me details for the deluxe suite", ["accommodation"]);
        expect(result).not.toBeNull();
        expect(result?.type).toBe("get_item");
        expect(result?.item_name).toBe("the deluxe suite");
      });
    });

    describe("no match", () => {
      it("returns null for unrelated messages", () => {
        const result = detectCatalogueIntent("hello there", ["products"]);
        expect(result).toBeNull();
      });

      it("returns null when no capabilities match", () => {
        const result = detectCatalogueIntent("show me products", []);
        expect(result).toBeNull();
      });

      it("returns null for greeting messages", () => {
        const result = detectCatalogueIntent("hi", ["products", "menu"]);
        expect(result).toBeNull();
      });
    });

    describe("multiple capabilities", () => {
      it("matches first relevant capability", () => {
        const result = detectCatalogueIntent("show me products", [
          "menu",
          "products",
          "services",
        ]);
        expect(result).not.toBeNull();
        expect(result?.type).toBe("browse_products");
      });

      it("matches menu when products not available", () => {
        const result = detectCatalogueIntent("show me the menu", ["menu", "services"]);
        expect(result).not.toBeNull();
        expect(result?.type).toBe("browse_menu");
      });
    });

    describe("case insensitivity", () => {
      it("matches regardless of case", () => {
        const result = detectCatalogueIntent("SHOW ME YOUR PRODUCTS", ["products"]);
        expect(result).not.toBeNull();
        expect(result?.type).toBe("browse_products");
      });

      it("matches mixed case", () => {
        const result = detectCatalogueIntent("WhAt Is On ThE mEnU", ["menu"]);
        expect(result).not.toBeNull();
        expect(result?.type).toBe("browse_menu");
      });
    });
  });
});
