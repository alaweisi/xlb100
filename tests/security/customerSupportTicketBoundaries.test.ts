import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  describe,
  expect,
  it,
} from "vitest";

const root = process.cwd();
const supportRoot = join(
  root,
  "apps/customer/src/features/support",
);

function source(file: string): string {
  return readFileSync(join(supportRoot, file), "utf8");
}

describe("Customer CSL-15 support security boundaries", () => {
  it("never calls internal or conversation APIs from the ticket slice", () => {
    const combined = [
      "SupportTicketCoordinator.ts",
      "SupportTicketActionController.ts",
      "CustomerSupportTicketRoute.tsx",
    ].map(source).join("\n");

    expect(combined).not.toContain("/api/internal/");
    expect(combined).not.toContain("createSupportConversation");
    expect(combined).not.toContain("sendSupportMessage");
    expect(combined).not.toContain("createSupportRealtimeTicket");
    expect(combined).not.toContain("submitSupportConversationCsat");
  });

  it("keeps operational truth outside the limited Manifest parser", () => {
    const registry = source("SupportTicketComponentRegistry.tsx");
    const controller = source("SupportTicketActionController.ts");

    expect(registry).toContain('new Set(["slots"])');
    expect(registry).toContain('"faq"');
    expect(registry).toContain('"help-note"');
    expect(registry).not.toContain("idempotencyKey:");
    expect(registry).not.toContain("expectedVersion:");
    expect(controller).toContain("createSupportTicketRequestSchema");
    expect(controller).toContain("submitSupportCsatRequestSchema");
  });

  it("enforces requester visibility and safe not-found convergence", () => {
    const coordinator = source("SupportTicketCoordinator.ts");
    expect(coordinator).toContain('event.visibility === "internal"');
    expect(coordinator).toContain('status === 403 || error.status === 404');
    expect(coordinator).toContain('status: "not_found"');
    expect(coordinator).toContain('ticket.source === "customer"');
    expect(coordinator).toContain("ticket.requesterId === scope.actorId");
    expect(coordinator).toContain("ticket.cityCode === scope.cityCode");
  });
});
