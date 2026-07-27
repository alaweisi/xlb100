import { useMemo } from "react";
import type { CustomerSupportApi } from "../pages/CustomerSupportPage";
import type { createCustomerApiClient } from "../pages/customerPageShell";

type CustomerApiClient = ReturnType<typeof createCustomerApiClient>;

export function useCustomerSupportApi(
  api: CustomerApiClient,
): CustomerSupportApi {
  return useMemo(
    () => ({
      createTicket: (input) => api.createSupportTicket(input),
      listTickets: (filters) => api.listSupportTickets(filters),
      getTicket: (ticketId) => api.getSupportTicket(ticketId),
      addComment: (ticketId, input) =>
        api.addSupportTicketComment(ticketId, input),
      reopenTicket: (ticketId, input) =>
        api.reopenSupportTicket(ticketId, input),
      submitCsat: (ticketId, input) =>
        api.submitSupportTicketCsat(ticketId, input),
      createConversation: (input) => api.createSupportConversation(input),
      listConversations: () => api.listSupportConversations(),
      getConversation: (conversationId) =>
        api.getSupportConversation(conversationId),
      sendConversationMessage: (conversationId, input) =>
        api.sendSupportMessage(conversationId, input),
    }),
    [api],
  );
}
