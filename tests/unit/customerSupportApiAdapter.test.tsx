// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useCustomerSupportApi } from "../../apps/customer/src/app/useCustomerSupportApi";

type CustomerApiClient = Parameters<typeof useCustomerSupportApi>[0];

function customerApiFixture(): CustomerApiClient {
  return {
    createSupportTicket: vi.fn(),
    listSupportTickets: vi.fn(),
    getSupportTicket: vi.fn(),
    addSupportTicketComment: vi.fn(),
    reopenSupportTicket: vi.fn(),
    submitSupportTicketCsat: vi.fn(),
    createSupportConversation: vi.fn(),
    listSupportConversations: vi.fn(),
    getSupportConversation: vi.fn(),
    sendSupportMessage: vi.fn(),
  } as unknown as CustomerApiClient;
}

describe("Customer support API adapter", () => {
  it("keeps one adapter identity until the underlying authenticated client changes", () => {
    const firstClient = customerApiFixture();
    const { result, rerender } = renderHook(
      ({ api }) => useCustomerSupportApi(api),
      { initialProps: { api: firstClient } },
    );
    const firstAdapter = result.current;

    rerender({ api: firstClient });
    expect(result.current).toBe(firstAdapter);

    const nextClient = customerApiFixture();
    rerender({ api: nextClient });
    expect(result.current).not.toBe(firstAdapter);
  });
});
