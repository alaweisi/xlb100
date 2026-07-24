// @vitest-environment jsdom
import React from "react";
import {
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import {
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  CustomerFeatureRouteRegistry,
  CustomerTemplateRegistry,
} from "../../apps/customer/src/platform/slices/index.js";
import {
  CUSTOMER_CONVERSATION_BLOCKED_CAPABILITIES,
  CUSTOMER_CONVERSATION_COMPONENTS,
  CustomerConversationPage,
  createCustomerConversationComponentRegistry,
  customerConversationSlice,
  customerConversationTemplateRegistration,
  customerSupportFeatureRouteModule,
  parseCustomerConversationRoute,
  type CustomerConversationNavigation,
} from "../../apps/customer/src/features/support/index.js";

function route(
  pattern:
    | "/support/conversations"
    | "/support/conversations/:conversationId",
  params: Readonly<Record<string, string>> = {},
  query: Readonly<Record<string, string>> = {},
) {
  return {
    pathname: pattern === "/support/conversations/:conversationId"
      ? `/support/conversations/${params.conversationId ?? ""}`
      : pattern,
    pattern,
    params,
    query,
  };
}

function navigation(): CustomerConversationNavigation {
  return {
    backToSupport: vi.fn(),
    openTickets: vi.fn(),
  };
}

describe("Customer CSL-16 Support Conversation GAP-07 boundary", () => {
  it("registers the fixed L1 template, components and both guarded routes", async () => {
    const components = createCustomerConversationComponentRegistry();
    const templates = new CustomerTemplateRegistry()
      .register(customerConversationTemplateRegistration)
      .seal();
    const routes = new CustomerFeatureRouteRegistry()
      .register(customerSupportFeatureRouteModule)
      .seal();

    expect(components.list()).toEqual(CUSTOMER_CONVERSATION_COMPONENTS);
    expect(templates.resolveForSlice(customerConversationSlice)).toMatchObject({
      orchestrationLevel: "L1",
      operationalManifest: "forbidden",
    });
    expect(customerConversationSlice.guards).toEqual([
      "session",
      "city",
      "protected-route",
    ]);
    expect(routes.resolve("/support")?.slice.id).toBe("CSL-15");
    expect(routes.resolve("/support/tickets")?.slice.id).toBe("CSL-15");
    expect(routes.resolve("/support/conversations")?.slice.id).toBe("CSL-16");
    expect(
      routes.resolve("/support/conversations/:conversationId")?.slice.id,
    ).toBe("CSL-16");
    await expect(routes.resolve("/support/conversations")?.load()).resolves
      .toHaveProperty("RouteComponent", CustomerConversationPage);
  });

  it("strictly validates conversation and linked ticket identifiers", () => {
    expect(parseCustomerConversationRoute(route(
      "/support/conversations",
      {},
      { linkedTicketId: "ticket-safe_1" },
    ))).toEqual({
      view: "list",
      conversationId: null,
      linkedTicketId: "ticket-safe_1",
    });
    expect(parseCustomerConversationRoute(route(
      "/support/conversations/:conversationId",
      { conversationId: "conversation-safe_1" },
      { linkedTicketId: "ticket-safe_1" },
    ))).toEqual({
      view: "detail",
      conversationId: "conversation-safe_1",
      linkedTicketId: "ticket-safe_1",
    });

    for (const candidate of [
      route(
        "/support/conversations/:conversationId",
        { conversationId: "../another-customer" },
      ),
      route(
        "/support/conversations/:conversationId",
        { conversationId: "conversation%2Fother" },
      ),
      route(
        "/support/conversations",
        {},
        { linkedTicketId: " ticket-safe_1" },
      ),
      route(
        "/support/conversations",
        {},
        { linkedTicketId: "ticket-safe_1", cursor: "unexpected" },
      ),
    ]) {
      expect(parseCustomerConversationRoute(candidate)).toBeNull();
    }
  });

  it("renders every conversation capability as unavailable without fake history or CSAT", () => {
    render(
      <CustomerConversationPage
        slice={customerConversationSlice}
        route={route(
          "/support/conversations/:conversationId",
          { conversationId: "conversation-safe_1" },
          { linkedTicketId: "ticket-safe_1" },
        )}
        navigation={navigation()}
      />,
    );

    expect(screen.getByRole("heading", {
      name: "实时会话暂不可用",
    })).toBeTruthy();
    expect(screen.getAllByText(/GAP-07/)).toHaveLength(2);
    expect(screen.getByText("详情入口已安全阻断")).toBeTruthy();
    expect(screen.getByText("会话标识：格式有效，未查询")).toBeTruthy();
    expect(screen.getByText("关联工单：格式有效，未查询")).toBeTruthy();
    for (const capability of CUSTOMER_CONVERSATION_BLOCKED_CAPABILITIES) {
      expect(screen.getAllByText(capability.label).length)
        .toBeGreaterThanOrEqual(1);
    }
    const csatButton = screen.getByRole("button", {
      name: "GAP-07 关闭后开放",
    }) as HTMLButtonElement;
    expect(csatButton.disabled).toBe(true);
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByText("暂无消息")).toBeNull();
  });

  it("uses only the two fixed safe navigation actions", () => {
    const target = navigation();
    render(
      <CustomerConversationPage
        slice={customerConversationSlice}
        route={route("/support/conversations")}
        navigation={target}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "返回客服中心" }));
    fireEvent.click(screen.getByRole("button", { name: "前往客服工单" }));
    expect(target.backToSupport).toHaveBeenCalledTimes(1);
    expect(target.openTickets).toHaveBeenCalledTimes(1);
  });

  it("converges malicious route input to the same non-disclosing blocked shell", () => {
    render(
      <CustomerConversationPage
        slice={customerConversationSlice}
        route={route(
          "/support/conversations/:conversationId",
          { conversationId: "../private" },
        )}
        navigation={navigation()}
      />,
    );

    expect(screen.getByRole("heading", {
      name: "会话标识无法安全使用",
    })).toBeTruthy();
    expect(screen.getByText(/不会据此查询、确认或猜测/)).toBeTruthy();
    expect(screen.queryByText("../private")).toBeNull();
    expect(screen.queryByText("会话不存在")).toBeNull();
  });
});
