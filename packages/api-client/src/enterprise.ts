import type {
  BusinessAgreementPrice, BusinessApiCredential, BusinessApiScope, BusinessClient, BusinessOrder,
  BusinessWebhookDelivery, BusinessWebhookEventType, BusinessWebhookSubscription, EnterpriseBillSnapshot,
} from "@xlb/types";
import type { ApiClient } from "./createApiClient.js";

export function createEnterpriseAdminApi(client:ApiClient){return {
  listClients:()=>client.get<{ok:true;clients:BusinessClient[]}>("/api/internal/enterprise/clients"),
  createClient:(body:{clientCode:string;name:string;billingMode:"single"|"monthly";contactName:string;contactPhone:string;contactEmail?:string})=>client.post<{ok:true;client:BusinessClient}>("/api/internal/enterprise/clients",body),
  updateClientStatus:(clientId:string,status:BusinessClient["status"])=>client.post<{ok:true;client:BusinessClient}>(`/api/internal/enterprise/clients/${encodeURIComponent(clientId)}/status`,{status}),
  listCredentials:(clientId:string)=>client.get<{ok:true;credentials:BusinessApiCredential[]}>(`/api/internal/enterprise/clients/${encodeURIComponent(clientId)}/credentials`),
  createCredential:(clientId:string,body:{name:string;scopes:BusinessApiScope[];expiresAt?:string})=>client.post<{ok:true;credential:BusinessApiCredential;apiKey:string}>(`/api/internal/enterprise/clients/${encodeURIComponent(clientId)}/credentials`,body),
  revokeCredential:(clientId:string,credentialId:string)=>client.post<{ok:true;credentialId:string;status:"revoked"}>(`/api/internal/enterprise/clients/${encodeURIComponent(clientId)}/credentials/${encodeURIComponent(credentialId)}/revoke`,{}),
  listAgreementPrices:(clientId:string)=>client.get<{ok:true;agreementPrices:BusinessAgreementPrice[]}>(`/api/internal/enterprise/clients/${encodeURIComponent(clientId)}/agreement-prices`),
  upsertAgreementPrice:(clientId:string,body:{skuId:string;unitPrice:number;effectiveFrom:string;effectiveTo?:string})=>client.post<{ok:true;agreementPrice:BusinessAgreementPrice}>(`/api/internal/enterprise/clients/${encodeURIComponent(clientId)}/agreement-prices`,body),
  listWebhookSubscriptions:(clientId:string)=>client.get<{ok:true;subscriptions:BusinessWebhookSubscription[]}>(`/api/internal/enterprise/clients/${encodeURIComponent(clientId)}/webhook-subscriptions`),
  createWebhookSubscription:(clientId:string,body:{callbackUrl:string;eventTypes:BusinessWebhookEventType[]})=>client.post<{ok:true;subscription:BusinessWebhookSubscription;signingSecret:string}>(`/api/internal/enterprise/clients/${encodeURIComponent(clientId)}/webhook-subscriptions`,body),
  updateWebhookSubscriptionStatus:(clientId:string,subscriptionId:string,status:"active"|"paused")=>client.post<{ok:true;subscriptionId:string;status:"active"|"paused"}>(`/api/internal/enterprise/clients/${encodeURIComponent(clientId)}/webhook-subscriptions/${encodeURIComponent(subscriptionId)}/status`,{status}),
  listWebhookDeliveries:(clientId:string)=>client.get<{ok:true;deliveries:BusinessWebhookDelivery[]}>(`/api/internal/enterprise/clients/${encodeURIComponent(clientId)}/webhook-deliveries`),
  retryWebhookDelivery:(clientId:string,deliveryId:string)=>client.post<{ok:true;deliveryId:string;status:"retry_wait"}>(`/api/internal/enterprise/clients/${encodeURIComponent(clientId)}/webhook-deliveries/${encodeURIComponent(deliveryId)}/retry`,{}),
  runWebhooks:()=>client.post<{ok:true;candidates:number;attempted:number;delivered:number;retry:number}>("/api/internal/enterprise/webhooks/run-once",{}),
  listBills:(clientId:string)=>client.get<{ok:true;bills:EnterpriseBillSnapshot[]}>(`/api/internal/enterprise/clients/${encodeURIComponent(clientId)}/bills`),
  createBill:(clientId:string,body:{periodStart:string;periodEnd:string})=>client.post<{ok:true;bill:EnterpriseBillSnapshot}>(`/api/internal/enterprise/clients/${encodeURIComponent(clientId)}/bills`,body),
  issueBill:(clientId:string,billId:string)=>client.post<{ok:true;billId:string;status:"issued"}>(`/api/internal/enterprise/clients/${encodeURIComponent(clientId)}/bills/${encodeURIComponent(billId)}/issue`,{}),
};}

export function createEnterpriseOpenApi(client:ApiClient){return {
  createOrder:(body:Record<string,unknown>)=>client.post<{ok:true;businessOrder:BusinessOrder;idempotent:boolean}>("/openapi/v1/orders",body),
  listOrders:()=>client.get<{ok:true;orders:BusinessOrder[]}>("/openapi/v1/orders"),
  getOrder:(externalOrderId:string)=>client.get<{ok:true;order:BusinessOrder}>(`/openapi/v1/orders/${encodeURIComponent(externalOrderId)}`),
  listWebhookSubscriptions:()=>client.get<{ok:true;subscriptions:BusinessWebhookSubscription[]}>("/openapi/v1/webhook-subscriptions"),
  createWebhookSubscription:(body:{callbackUrl:string;eventTypes:BusinessWebhookEventType[]})=>client.post<{ok:true;subscription:BusinessWebhookSubscription;signingSecret:string}>("/openapi/v1/webhook-subscriptions",body),
};}
