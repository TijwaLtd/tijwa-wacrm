import { describe, it, expect } from "vitest";
import {
  CAPABILITY_NODES,
  getNodesForCapability,
  getNodeByKey,
  getNodesForCapabilities,
  getAllOperationKeys,
  isValidOperationKey,
} from "./capability-nodes";

describe("capability-nodes", () => {
  describe("getNodesForCapability", () => {
    it("returns nodes for an existing capability", () => {
      const nodes = getNodesForCapability("products");
      expect(nodes.length).toBeGreaterThan(0);
      expect(nodes.every((n) => n.capability_key === "products")).toBe(true);
    });

    it("returns empty array for unknown capability", () => {
      const nodes = getNodesForCapability("nonexistent");
      expect(nodes).toEqual([]);
    });

    it("returns all node categories for products", () => {
      const nodes = getNodesForCapability("products");
      const categories = new Set(nodes.map((n) => n.category));
      expect(categories.has("read")).toBe(true);
      expect(categories.has("search")).toBe(true);
    });
  });

  describe("getNodeByKey", () => {
    it("finds a node by its key", () => {
      const node = getNodeByKey("list_products");
      expect(node).not.toBeNull();
      expect(node?.node_key).toBe("list_products");
      expect(node?.capability_key).toBe("products");
    });

    it("returns null for unknown node key", () => {
      expect(getNodeByKey("nonexistent")).toBeNull();
    });
  });

  describe("getNodesForCapabilities", () => {
    it("combines nodes from multiple capabilities", () => {
      const nodes = getNodesForCapabilities(["products", "orders"]);
      expect(nodes.length).toBeGreaterThan(0);
      const caps = new Set(nodes.map((n) => n.capability_key));
      expect(caps.has("products")).toBe(true);
      expect(caps.has("orders")).toBe(true);
    });

    it("skips unknown capabilities gracefully", () => {
      const nodes = getNodesForCapabilities(["products", "nonexistent"]);
      expect(nodes.every((n) => n.capability_key === "products")).toBe(true);
    });
  });

  describe("getAllOperationKeys", () => {
    it("returns all operation keys from the registry", () => {
      const keys = getAllOperationKeys();
      expect(keys.length).toBeGreaterThan(0);
      expect(keys).toContain("catalog.list");
      expect(keys).toContain("orders.create");
      expect(keys).toContain("bookings.checkAvailability");
    });
  });

  describe("isValidOperationKey", () => {
    it("returns true for valid keys", () => {
      expect(isValidOperationKey("catalog.list")).toBe(true);
      expect(isValidOperationKey("orders.create")).toBe(true);
    });

    it("returns false for invalid keys", () => {
      expect(isValidOperationKey("nonexistent.action")).toBe(false);
    });
  });

  describe("node schema consistency", () => {
    it("every node has required fields", () => {
      for (const [capKey, nodes] of Object.entries(CAPABILITY_NODES)) {
        for (const node of nodes) {
          expect(node.node_key).toBeTruthy();
          expect(node.name).toBeTruthy();
          expect(node.description).toBeTruthy();
          expect(node.capability_key).toBe(capKey);
          expect(node.operation_key).toBeTruthy();
          expect(["read", "search", "check", "action", "communication"]).toContain(node.category);
          expect(typeof node.input_schema).toBe("object");
          expect(typeof node.output_schema).toBe("object");
        }
      }
    });

    it("node_keys are unique across all capabilities", () => {
      const seen = new Set<string>();
      for (const nodes of Object.values(CAPABILITY_NODES)) {
        for (const node of nodes) {
          expect(seen.has(node.node_key)).toBe(false);
          seen.add(node.node_key);
        }
      }
    });
  });
});
