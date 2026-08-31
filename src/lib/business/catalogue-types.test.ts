import { describe, it, expect } from "vitest";
import {
  CAPABILITY_INTENT_MAP,
  INTENT_KEYWORDS,
} from "./catalogue-types";
import type { CatalogueIntent, CatalogueIntentType } from "./catalogue-types";

describe("catalogue-types", () => {
  describe("CAPABILITY_INTENT_MAP", () => {
    it("maps commerce capabilities to product intent", () => {
      expect(CAPABILITY_INTENT_MAP.products).toBe("browse_products");
      expect(CAPABILITY_INTENT_MAP.product_catalog).toBe("browse_products");
    });

    it("maps food capabilities to menu intent", () => {
      expect(CAPABILITY_INTENT_MAP.menu).toBe("browse_menu");
      expect(CAPABILITY_INTENT_MAP.food_orders).toBe("browse_menu");
    });

    it("maps service capabilities to services intent", () => {
      expect(CAPABILITY_INTENT_MAP.services).toBe("browse_services");
      expect(CAPABILITY_INTENT_MAP.appointments).toBe("browse_services");
    });

    it("maps education capabilities to courses intent", () => {
      expect(CAPABILITY_INTENT_MAP.courses).toBe("browse_courses");
      expect(CAPABILITY_INTENT_MAP.education_programs).toBe("browse_courses");
    });

    it("maps accommodation capabilities to rooms intent", () => {
      expect(CAPABILITY_INTENT_MAP.accommodation).toBe("browse_rooms");
      expect(CAPABILITY_INTENT_MAP.bookings).toBe("browse_rooms");
    });

    it("maps property capabilities to properties intent", () => {
      expect(CAPABILITY_INTENT_MAP.property_listings).toBe("browse_properties");
      expect(CAPABILITY_INTENT_MAP.property_inquiries).toBe("browse_properties");
    });

    it("maps event capabilities to events intent", () => {
      expect(CAPABILITY_INTENT_MAP.events).toBe("browse_events");
      expect(CAPABILITY_INTENT_MAP.registrations).toBe("browse_events");
    });
  });

  describe("INTENT_KEYWORDS", () => {
    it("has keywords for all intent types", () => {
      const intentTypes: string[] = [
        "browse_products",
        "browse_menu",
        "browse_services",
        "browse_courses",
        "browse_rooms",
        "browse_programs",
        "browse_properties",
        "browse_events",
      ];

      for (const intentType of intentTypes) {
        expect(INTENT_KEYWORDS[intentType as keyof typeof INTENT_KEYWORDS]).toBeDefined();
        expect(INTENT_KEYWORDS[intentType as keyof typeof INTENT_KEYWORDS].length).toBeGreaterThan(0);
      }
    });

    it("has non-empty keyword arrays", () => {
      for (const [key, keywords] of Object.entries(INTENT_KEYWORDS)) {
        expect(Array.isArray(keywords)).toBe(true);
        expect(keywords.length).toBeGreaterThan(0);
        for (const kw of keywords) {
          expect(typeof kw).toBe("string");
          expect(kw.length).toBeGreaterThan(0);
        }
      }
    });
  });

  describe("type consistency", () => {
    it("all CAPABILITY_INTENT_MAP values are valid intent types", () => {
      const validTypes = new Set([
        "browse_products",
        "browse_menu",
        "browse_services",
        "browse_courses",
        "browse_rooms",
        "browse_programs",
        "browse_properties",
        "browse_events",
        "search_items",
        "get_item",
        null,
      ]);

      for (const intentType of Object.values(CAPABILITY_INTENT_MAP)) {
        expect(validTypes.has(intentType as CatalogueIntentType)).toBe(true);
      }
    });
  });
});
