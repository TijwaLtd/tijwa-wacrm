import type { Message } from "@/types";

/**
 * Which side of the thread a message belongs on.
 *
 * WhatsApp threads decide by sender type: outbound (agent/bot) sits on
 * the right, inbound (customer) on the left.
 *
 * Team threads can't — every row is written with `sender_type='agent'`
 * (see POST /api/team/messages), so the sender type carries no signal.
 * Identity does instead: my messages go right, everyone else's left.
 *
 * Kept in one place because both the row wrapper (<MessageActions>,
 * which owns `justify-*`) and the bubble (<MessageActions> aside, which
 * owns the fill/styling) have to agree or messages visibly jump sides.
 */
export function isOutboundMessage(
  message: Pick<Message, "sender_type" | "sender_id">,
  currentUserId?: string,
  isTeam = false
): boolean {
  if (isTeam) {
    return !!currentUserId && message.sender_id === currentUserId;
  }
  return message.sender_type === "agent" || message.sender_type === "bot";
}
