import { describe, it, expect } from "vitest";
import { isOutboundMessage } from "./message-side";

const ME = "user-me";

describe("isOutboundMessage — WhatsApp threads", () => {
  it("puts agent and bot messages on the right", () => {
    expect(isOutboundMessage({ sender_type: "agent" }, ME, false)).toBe(true);
    expect(isOutboundMessage({ sender_type: "bot" }, ME, false)).toBe(true);
  });

  it("puts customer messages on the left", () => {
    expect(isOutboundMessage({ sender_type: "customer" }, ME, false)).toBe(
      false
    );
  });

  it("ignores sender_id (a colleague's outbound message is still ours)", () => {
    expect(
      isOutboundMessage(
        { sender_type: "agent", sender_id: "someone-else" },
        ME,
        false
      ),
    ).toBe(true);
  });
});

describe("isOutboundMessage — team threads", () => {
  // Every team row is written with sender_type='agent', so the type
  // carries no signal at all. Identity must decide the side.
  it("puts my messages on the right regardless of sender_type", () => {
    expect(
      isOutboundMessage({ sender_type: "agent", sender_id: ME }, ME, true)
    ).toBe(true);
  });

  it("puts everyone else's messages on the left", () => {
    expect(
      isOutboundMessage(
        { sender_type: "agent", sender_id: "colleague" },
        ME,
        true
      )
    ).toBe(false);
  });

  it("never claims a message as mine when the user is unknown", () => {
    // Avoids every message flipping to the right while auth is loading
    // and then snapping back.
    expect(
      isOutboundMessage({ sender_type: "agent", sender_id: ME }, undefined, true)
    ).toBe(false);
  });

  it("treats a message with no sender_id as not mine", () => {
    expect(isOutboundMessage({ sender_type: "agent" }, ME, true)).toBe(false);
  });
});
