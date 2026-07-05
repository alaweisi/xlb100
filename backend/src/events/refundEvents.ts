import type { RefundApprovedEventPayload } from "@xlb/types";

export function buildRefundApprovedPayload(
  input: RefundApprovedEventPayload,
): RefundApprovedEventPayload {
  return { ...input };
}
