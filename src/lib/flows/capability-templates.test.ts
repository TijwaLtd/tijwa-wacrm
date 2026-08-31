import { describe, it, expect } from "vitest";
import {
  CAPABILITY_FLOW_TEMPLATES,
  getCapabilityTemplate,
  getTemplatesForCapability,
  getCapabilitiesWithTemplates,
} from "./capability-templates";

describe("capability-templates", () => {
  describe("getCapabilityTemplate", () => {
    it("returns template by slug", () => {
      const tmpl = getCapabilityTemplate("default_catalog_quick_reply");
      expect(tmpl).not.toBeNull();
      expect(tmpl?.name).toBe("Catalog Quick Reply");
    });

    it("returns null for unknown slug", () => {
      expect(getCapabilityTemplate("nonexistent")).toBeNull();
    });
  });

  describe("getTemplatesForCapability", () => {
    it("returns templates for products capability", () => {
      const tmpls = getTemplatesForCapability("products");
      expect(tmpls.length).toBeGreaterThanOrEqual(1);
    });

    it("returns empty array for capability with no templates", () => {
      const tmpls = getTemplatesForCapability("nonexistent");
      expect(tmpls).toEqual([]);
    });
  });

  describe("getCapabilitiesWithTemplates", () => {
    it("returns unique capability keys", () => {
      const caps = getCapabilitiesWithTemplates();
      expect(caps.length).toBeGreaterThan(0);
      expect(new Set(caps).size).toBe(caps.length);
    });
  });

  describe("template structure validity", () => {
    it("every template has required fields", () => {
      for (const tmpl of CAPABILITY_FLOW_TEMPLATES) {
        expect(tmpl.slug).toBeTruthy();
        expect(tmpl.name).toBeTruthy();
        expect(tmpl.description).toBeTruthy();
        expect(tmpl.capability_key).toBeTruthy();
        expect(tmpl.entry_node_id).toBeTruthy();
        expect(tmpl.nodes.length).toBeGreaterThan(0);
      }
    });

    it("every template has a start node", () => {
      for (const tmpl of CAPABILITY_FLOW_TEMPLATES) {
        const startNode = tmpl.nodes.find((n) => n.node_type === "start");
        expect(startNode).toBeDefined();
      }
    });

    it("every template has an end node", () => {
      for (const tmpl of CAPABILITY_FLOW_TEMPLATES) {
        const endNode = tmpl.nodes.find((n) => n.node_type === "end");
        expect(endNode).toBeDefined();
      }
    });

    it("every template has at least one capability_action node", () => {
      for (const tmpl of CAPABILITY_FLOW_TEMPLATES) {
        const actionNodes = tmpl.nodes.filter((n) => n.node_type === "capability_action");
        expect(actionNodes.length).toBeGreaterThan(0);
      }
    });

    it("node_keys are unique within each template", () => {
      for (const tmpl of CAPABILITY_FLOW_TEMPLATES) {
        const keys = tmpl.nodes.map((n) => n.node_key);
        expect(new Set(keys).size).toBe(keys.length);
      }
    });

    it("every edge target references an existing node_key", () => {
      for (const tmpl of CAPABILITY_FLOW_TEMPLATES) {
        const nodeKeys = new Set(tmpl.nodes.map((n) => n.node_key));
        for (const node of tmpl.nodes) {
          const config = node.config as Record<string, unknown>;
          if (typeof config.next_node_key === "string") {
            expect(nodeKeys.has(config.next_node_key)).toBe(true);
          }
          if (typeof config.true_next === "string") {
            expect(nodeKeys.has(config.true_next)).toBe(true);
          }
          if (typeof config.false_next === "string") {
            expect(nodeKeys.has(config.false_next)).toBe(true);
          }
          // Check button edges
          if (Array.isArray(config.buttons)) {
            for (const btn of config.buttons as Array<{ next_node_key: string }>) {
              if (btn.next_node_key) {
                expect(nodeKeys.has(btn.next_node_key)).toBe(true);
              }
            }
          }
          // Check list row edges
          if (Array.isArray(config.sections)) {
            for (const section of config.sections as Array<{ rows: Array<{ next_node_key: string }> }>) {
              for (const row of section.rows ?? []) {
                if (row.next_node_key) {
                  expect(nodeKeys.has(row.next_node_key)).toBe(true);
                }
              }
            }
          }
        }
      }
    });

    it("entry_node_id references an existing node", () => {
      for (const tmpl of CAPABILITY_FLOW_TEMPLATES) {
        const nodeKeys = new Set(tmpl.nodes.map((n) => n.node_key));
        expect(nodeKeys.has(tmpl.entry_node_id)).toBe(true);
      }
    });

    it("capability_action nodes reference valid operation_keys", () => {
      const validOps = new Set([
        "catalog.list", "catalog.get", "catalog.search", "catalog.categories",
        "menu.list", "menu.get", "menu.search",
        "orders.create", "orders.get", "orders.list",
        "bookings.create", "bookings.get", "bookings.list", "bookings.checkAvailability",
        "courses.list", "courses.get", "courses.search",
        "programs.list", "programs.get",
        "properties.list", "properties.get", "properties.search",
        "services.list", "services.get", "services.search",
      ]);
      for (const tmpl of CAPABILITY_FLOW_TEMPLATES) {
        for (const node of tmpl.nodes) {
          if (node.node_type === "capability_action") {
            const config = node.config as { operation_key: string };
            expect(validOps.has(config.operation_key)).toBe(true);
          }
        }
      }
    });

    it("templates use send_list, send_buttons, or capability_action nodes", () => {
      for (const tmpl of CAPABILITY_FLOW_TEMPLATES) {
        const hasInteractiveOrAction = tmpl.nodes.some(
          (n) => n.node_type === "send_list" || n.node_type === "send_buttons" || n.node_type === "capability_action",
        );
        expect(hasInteractiveOrAction).toBe(true);
      }
    });
  });
});
