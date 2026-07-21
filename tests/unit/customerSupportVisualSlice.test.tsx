// @vitest-environment jsdom
import React from "react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupportConversation, SupportMessage } from "@xlb/types";
import {
  CustomerSupportPage,
  type CustomerSupportApi,
} from "../../apps/customer/src/pages/CustomerSupportPage";

const at = "2026-07-22T08:00:00.000Z";
const conversation: SupportConversation = {
  conversationId: "conversation-c4",
  cityCode: "hangzhou",
  source: "customer",
  requesterId: "customer-demo-hangzhou",
  businessClientId: null,
  status: "active",
  assignedAgentId: "agent-c4",
  linkedTicketId: null,
  lastServerSeq: 1,
  version: 1,
  startedAt: at,
  acceptedAt: at,
  transferredAt: null,
  closedAt: null,
  createdAt: at,
  updatedAt: at,
};

const firstMessage: SupportMessage = {
  messageId: "message-c4-1",
  cityCode: "hangzhou",
  conversationId: conversation.conversationId,
  senderType: "agent",
  senderId: "agent-c4",
  clientMessageId: "server-message-c4-1",
  serverSeq: 1,
  messageType: "text",
  textContent: "您好，请告诉我需要协助的问题。",
  mediaAssetId: null,
  createdAt: at,
};

function supportApi(): CustomerSupportApi {
  return {
    createTicket: vi.fn(),
    listTickets: vi.fn().mockResolvedValue({ ok: true, tickets: [], nextCursor: null }),
    getTicket: vi.fn(),
    addComment: vi.fn(),
    reopenTicket: vi.fn(),
    submitCsat: vi.fn(),
    createConversation: vi.fn().mockResolvedValue({ ok: true, conversation }),
    listConversations: vi.fn().mockResolvedValue({
      ok: true,
      conversations: [conversation],
      nextCursor: null,
    }),
    getConversation: vi.fn().mockResolvedValue({
      ok: true,
      conversation,
      messages: [firstMessage],
    }),
    sendConversationMessage: vi.fn().mockResolvedValue({
      ok: true,
      message: { ...firstMessage, messageId: "message-c4-2", senderType: "customer" },
      idempotent: false,
    }),
  };
}

afterEach(cleanup);

beforeEach(() => {
  window.history.replaceState({}, "", "/customer/support");
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockReturnValue({
      matches: false,
      media: "",
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  });
});

describe("Customer support C4 visual slice", () => {
  it("inherits the frozen Customer material hierarchy without desktop tables", () => {
    const page = readFileSync(
      resolve(process.cwd(), "apps/customer/src/pages/CustomerSupportPage.tsx"),
      "utf8",
    );
    const styles = readFileSync(
      resolve(process.cwd(), "apps/customer/src/pages/customer-support.css"),
      "utf8",
    );

    expect(page).toContain('import "./customer-support.css"');
    expect(page).not.toContain("<Table");
    expect(styles).toContain("--xlb-role-customer-ink");
    expect(styles).toContain("--xlb-role-customer-accent");
    expect(styles).toContain("--xlb-role-customer-component-card-background");
    expect(styles).toContain("backdrop-filter");
    expect(styles).toContain("prefers-reduced-motion");
    expect(styles).toContain("forced-colors");
  });

  it("uses the Phase24 conversation APIs and confirms a sent message from the server", async () => {
    const api = supportApi();
    render(<CustomerSupportPage api={api} />);

    fireEvent.click(screen.getByRole("tab", { name: "在线会话" }));
    await waitFor(() => expect(api.listConversations).toHaveBeenCalledTimes(1));
    fireEvent.click(await screen.findByRole("button", { name: "打开会话 conversation-c4" }));
    expect(await screen.findByText("您好，请告诉我需要协助的问题。")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("输入消息"), {
      target: { value: "订单状态一直没有更新。" },
    });
    fireEvent.click(screen.getByRole("button", { name: "发送消息" }));

    await waitFor(() => expect(api.sendConversationMessage).toHaveBeenCalledWith(
      conversation.conversationId,
      expect.objectContaining({
        messageType: "text",
        textContent: "订单状态一直没有更新。",
        idempotencyKey: expect.stringMatching(/^customer-chat-/),
      }),
    ));
    expect(await screen.findByText("消息已由服务端确认送达。")).toBeTruthy();
    expect(api.getConversation).toHaveBeenCalledTimes(2);
  });
});
