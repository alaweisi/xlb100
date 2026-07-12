import { randomBytes } from "node:crypto";

export function generateSupportTicketId(): string {
  return `spt_${Date.now().toString(36)}_${randomBytes(4).toString("hex")}`;
}

export function generateSupportTicketEventId(): string {
  return `spe_${Date.now().toString(36)}_${randomBytes(4).toString("hex")}`;
}
