import { randomBytes, randomUUID } from "node:crypto";
import type { BusinessApiContext, BusinessOrder, CityCode, RequestContext, WebhookProviderEnvelope } from "@xlb/types";
import {
  createBusinessClientSchema, createBusinessCredentialSchema, createBusinessOrderSchema,
  createBusinessWebhookSubscriptionSchema, createEnterpriseBillSchema, upsertBusinessAgreementPriceSchema,
  updateBusinessClientStatusSchema, updateBusinessWebhookSubscriptionStatusSchema,
} from "@xlb/validators";
import { withTransaction } from "../dal/transaction.js";
import { orderService } from "../order/orderService.js";
import { enterpriseRepository } from "./enterpriseRepository.js";
import { canonicalWebhookPayload, decryptEnterpriseSecret, encryptEnterpriseSecret, sha256, signWebhook } from "./enterpriseCrypto.js";
import { assertSafeHttpsWebhookUrl, createWebhookProvider } from "./webhookProvider.js";
import { recordWebhookRun } from "../observability/metrics.js";

const id=(prefix:string)=>`${prefix}_${randomUUID().replaceAll("-","").slice(0,24)}`;
const secret=()=>randomBytes(32).toString("base64url");
const canonical=canonicalWebhookPayload;

export class EnterpriseError extends Error{constructor(message:string,readonly statusCode=400){super(message);this.name="EnterpriseError";}}

function requireAdmin(context:RequestContext):CityCode{
  if(context.appType!=="admin"||!["admin","operator"].includes(context.role)||!context.cityCode)throw new EnterpriseError("enterprise admin operation requires city-scoped admin or operator",403);
  return context.cityCode;
}

function customerContext(context:BusinessApiContext):RequestContext{return {traceId:context.traceId,appType:"customer",role:"customer",cityCode:context.cityCode,userId:context.billingCustomerId,requestStartedAt:new Date().toISOString()};}

export class EnterpriseService {
  async createClient(context:RequestContext,body:unknown){
    const cityCode=requireAdmin(context);const parsed=createBusinessClientSchema.safeParse(body);if(!parsed.success)throw new EnterpriseError(parsed.error.message);
    const clientId=id("bcl"),contactId=id("bct"),customerId=id("bcust");
    const billingPhone=`199${randomBytes(4).readUInt32BE(0).toString().padStart(8,"0").slice(0,8)}`;
    await withTransaction(connection=>enterpriseRepository.insertClient(connection,{clientId,contactId,customerId,billingPhone,contactPhone:parsed.data.contactPhone,cityCode,clientCode:parsed.data.clientCode,name:parsed.data.name,billingMode:parsed.data.billingMode,contactName:parsed.data.contactName,contactEmail:parsed.data.contactEmail??null}));
    return enterpriseRepository.findClient(cityCode,clientId);
  }
  async listClients(context:RequestContext){return enterpriseRepository.listClients(requireAdmin(context));}
  async updateClientStatus(context:RequestContext,clientId:string,body:unknown){const cityCode=requireAdmin(context);const parsed=updateBusinessClientStatusSchema.safeParse(body);if(!parsed.success)throw new EnterpriseError(parsed.error.message);if(!await enterpriseRepository.updateClientStatus(cityCode,clientId,parsed.data.status))throw new EnterpriseError("business client not found",404);return enterpriseRepository.findClient(cityCode,clientId);}

  async createCredential(context:RequestContext,clientId:string,body:unknown){
    const cityCode=requireAdmin(context);const parsed=createBusinessCredentialSchema.safeParse(body);if(!parsed.success)throw new EnterpriseError(parsed.error.message);
    if(!await enterpriseRepository.findClient(cityCode,clientId))throw new EnterpriseError("business client not found",404);
    const credentialId=id("bkey"),rawSecret=secret(),apiKey=`xlb.${credentialId}.${rawSecret}`,keyPrefix=`${apiKey.slice(0,20)}...`;
    await withTransaction(connection=>enterpriseRepository.insertCredential(connection,{credentialId,clientId,cityCode,name:parsed.data.name,keyPrefix,secretHash:sha256(apiKey),scopes:parsed.data.scopes,expiresAt:parsed.data.expiresAt?new Date(parsed.data.expiresAt):null}));
    const credential=(await enterpriseRepository.listCredentials(cityCode,clientId)).find(item=>item.credentialId===credentialId);
    return {credential,apiKey};
  }
  async listCredentials(context:RequestContext,clientId:string){return enterpriseRepository.listCredentials(requireAdmin(context),clientId);}
  async revokeCredential(context:RequestContext,clientId:string,credentialId:string){if(!await enterpriseRepository.revokeCredential(requireAdmin(context),clientId,credentialId))throw new EnterpriseError("active credential not found",404);return {credentialId,status:"revoked" as const};}

  async upsertAgreement(context:RequestContext,clientId:string,body:unknown){
    const cityCode=requireAdmin(context);const parsed=upsertBusinessAgreementPriceSchema.safeParse(body);if(!parsed.success)throw new EnterpriseError(parsed.error.message);
    if(!await enterpriseRepository.findClient(cityCode,clientId))throw new EnterpriseError("business client not found",404);
    return enterpriseRepository.upsertAgreement({agreementId:id("bap"),clientId,cityCode,skuId:parsed.data.skuId,unitPrice:parsed.data.unitPrice,from:new Date(parsed.data.effectiveFrom),to:parsed.data.effectiveTo?new Date(parsed.data.effectiveTo):null});
  }
  async listAgreements(context:RequestContext,clientId:string){return enterpriseRepository.listAgreements(requireAdmin(context),clientId);}

  async createOrder(context:BusinessApiContext,body:unknown):Promise<{businessOrder:BusinessOrder;idempotent:boolean}>{
    const parsed=createBusinessOrderSchema.safeParse(body);if(!parsed.success)throw new EnterpriseError(parsed.error.message);
    const requestHash=sha256(canonical(parsed.data));
    return enterpriseRepository.withClientLock(context.cityCode,context.businessClientId,async()=>{
      const existingExternal=await enterpriseRepository.findOrderMapping(context.cityCode,context.businessClientId,parsed.data.externalOrderId);
      const existingIdempotency=await enterpriseRepository.findOrderMapping(context.cityCode,context.businessClientId,undefined,parsed.data.idempotencyKey);
      const existing=existingExternal??existingIdempotency;
      if(existing){if(existing.request_hash!==requestHash||existing.external_order_id!==parsed.data.externalOrderId)throw new EnterpriseError("external order id or idempotency key conflicts with a different request",409);return {businessOrder:await this.loadBusinessOrder(context,existing),idempotent:true};}
      const agreement=await enterpriseRepository.findCurrentAgreement(context.cityCode,context.businessClientId,parsed.data.skuId);
      const orderCommand={
        skuId:parsed.data.skuId,
        quantity:parsed.data.quantity,
        addressProvince:parsed.data.addressProvince,
        addressCity:parsed.data.addressCity,
        addressDistrict:parsed.data.addressDistrict,
        detailAddress:parsed.data.detailAddress,
        contactName:parsed.data.contactName,
        contactPhone:parsed.data.contactPhone,
        scheduledAt:parsed.data.scheduledAt,
        scheduledTimeSlot:parsed.data.scheduledTimeSlot,
      };
      const order=await orderService.createOrder(customerContext(context),orderCommand,agreement?{source:"enterprise",unitAmount:agreement.unitPrice,priceText:`Enterprise agreement CNY ${agreement.unitPrice.toFixed(2)}`,agreementPriceId:agreement.agreementPriceId} : undefined);
      const mapping={business_order_id:id("bord"),business_client_id:context.businessClientId,city_code:context.cityCode,external_order_id:parsed.data.externalOrderId,idempotency_key:parsed.data.idempotencyKey,request_hash:requestHash,order_id:order.orderId,agreement_price_id:agreement?.agreementPriceId??null,pricing_source:agreement?"agreement" as const:"public" as const,created_at:new Date()};
      await withTransaction(connection=>enterpriseRepository.insertBusinessOrder(connection,{businessOrderId:mapping.business_order_id,clientId:context.businessClientId,cityCode:context.cityCode,externalOrderId:mapping.external_order_id,idempotencyKey:mapping.idempotency_key,requestHash,orderId:order.orderId,agreementId:mapping.agreement_price_id,pricingSource:mapping.pricing_source,snapshot:parsed.data}));
      return {businessOrder:this.composeOrder(mapping,order),idempotent:false};
    });
  }
  async getOrder(context:BusinessApiContext,externalId:string){const row=await enterpriseRepository.findOrderMapping(context.cityCode,context.businessClientId,externalId);if(!row)throw new EnterpriseError("enterprise order not found",404);return this.loadBusinessOrder(context,row);}
  async listOrders(context:BusinessApiContext){const rows=await enterpriseRepository.listOrderMappings(context.cityCode,context.businessClientId);return Promise.all(rows.map(row=>this.loadBusinessOrder(context,row)));}
  private async loadBusinessOrder(context:BusinessApiContext,row:Awaited<ReturnType<typeof enterpriseRepository.findOrderMapping>> extends infer T?NonNullable<T>:never){const order=await orderService.getOrder(customerContext(context),row.order_id);return this.composeOrder(row,order);}
  private composeOrder(row:{business_order_id:string;business_client_id:string;city_code:string;external_order_id:string;idempotency_key:string;request_hash:string;order_id:string;agreement_price_id:string|null;pricing_source:"public"|"agreement";created_at:Date},order:BusinessOrder["order"]):BusinessOrder{return {businessOrderId:row.business_order_id,businessClientId:row.business_client_id,cityCode:row.city_code as CityCode,externalOrderId:row.external_order_id,idempotencyKey:row.idempotency_key,orderId:row.order_id,agreementPriceId:row.agreement_price_id,pricingSource:row.pricing_source,requestHash:row.request_hash,order,createdAt:row.created_at.toISOString()};}

  async createSubscriptionForAdmin(context:RequestContext,clientId:string,body:unknown){return this.createSubscription(requireAdmin(context),clientId,body);}
  async createSubscriptionForBusiness(context:BusinessApiContext,body:unknown){return this.createSubscription(context.cityCode,context.businessClientId,body);}
  private async createSubscription(cityCode:CityCode,clientId:string,body:unknown){
    const parsed=createBusinessWebhookSubscriptionSchema.safeParse(body);if(!parsed.success)throw new EnterpriseError(parsed.error.message);
    if(parsed.data.callbackUrl.startsWith("https://"))await assertSafeHttpsWebhookUrl(parsed.data.callbackUrl);
    const subscriptionId=id("bwh"),signingSecret=secret();
    await withTransaction(connection=>enterpriseRepository.insertSubscription(connection,{subscriptionId,clientId,cityCode,callbackUrl:parsed.data.callbackUrl,eventTypes:[...new Set(parsed.data.eventTypes)],ciphertext:encryptEnterpriseSecret(signingSecret),last4:signingSecret.slice(-4)}));
    return {subscription:(await enterpriseRepository.listSubscriptions(cityCode,clientId)).find(item=>item.subscriptionId===subscriptionId),signingSecret};
  }
  async listSubscriptionsForAdmin(context:RequestContext,clientId:string){return enterpriseRepository.listSubscriptions(requireAdmin(context),clientId);}
  async listSubscriptionsForBusiness(context:BusinessApiContext){return enterpriseRepository.listSubscriptions(context.cityCode,context.businessClientId);}
  async updateSubscriptionStatus(context:RequestContext,clientId:string,subscriptionId:string,body:unknown){const cityCode=requireAdmin(context);const parsed=updateBusinessWebhookSubscriptionStatusSchema.safeParse(body);if(!parsed.success)throw new EnterpriseError(parsed.error.message);if(!await enterpriseRepository.updateSubscriptionStatus(cityCode,clientId,subscriptionId,parsed.data.status))throw new EnterpriseError("subscription not found",404);return {subscriptionId,status:parsed.data.status};}

  async runWebhookDeliveries(context:RequestContext){
    const cityCode=requireAdmin(context);
    const result=await enterpriseRepository.withWebhookRunLock(cityCode,async()=>{
      const candidates=await enterpriseRepository.findWebhookCandidates(cityCode);
      for(const candidate of candidates){const payload={id:candidate.event_id,type:candidate.event_type,occurredAt:candidate.created_at.toISOString(),businessClientId:candidate.business_client_id,data:typeof candidate.payload_json==="string"?JSON.parse(candidate.payload_json):candidate.payload_json};const serialized=canonical(payload);const signature=signWebhook(decryptEnterpriseSecret(candidate.signing_secret_ciphertext),payload.occurredAt,serialized);await withTransaction(connection=>enterpriseRepository.insertDelivery(connection,{deliveryId:id("bdlv"),subscriptionId:candidate.subscription_id,clientId:candidate.business_client_id,cityCode,eventId:candidate.event_id,eventType:candidate.event_type,payload,payloadHash:sha256(serialized),signature}));}
      const due=await enterpriseRepository.listDueDeliveries(cityCode);let delivered=0,retry=0;
      for(const row of due){const payload=canonical(typeof row.payload_json==="string"?JSON.parse(row.payload_json):row.payload_json);const occurredAt=(JSON.parse(payload) as {occurredAt:string}).occurredAt;let envelope:WebhookProviderEnvelope;
        try{envelope=await createWebhookProvider(row.callback_url).deliver({callbackUrl:row.callback_url,deliveryId:row.delivery_id,eventType:row.event_type,payload,signature:row.signature,timestamp:occurredAt});}
        catch(error){envelope={provider:row.callback_url.startsWith("https://")?"https":"mock",providerStatus:row.callback_url.startsWith("https://")?"failed_https":"failed_mock",externalProviderExecuted:false,httpStatus:null,responseBody:error instanceof Error?error.message:"delivery failed",attemptedAt:new Date().toISOString()};}
        const success=envelope.providerStatus==="delivered_mock"||envelope.providerStatus==="delivered_https";await enterpriseRepository.finishDelivery({cityCode,deliveryId:row.delivery_id,success,envelope,error:success?null:envelope.responseBody});success?delivered++:retry++;
      }
      return {candidates:candidates.length,attempted:due.length,delivered,retry};
    });
    if(!result){recordWebhookRun({delivered:0,retry:0,busy:true});return {candidates:0,attempted:0,delivered:0,retry:0,busy:true};}
    recordWebhookRun(result);return result;
  }
  async listDeliveries(context:RequestContext,clientId:string){return enterpriseRepository.listDeliveries(requireAdmin(context),clientId);}
  async retryDelivery(context:RequestContext,clientId:string,deliveryId:string){const ok=await enterpriseRepository.forceRetry(requireAdmin(context),clientId,deliveryId);if(!ok)throw new EnterpriseError("retryable delivery not found",409);return {deliveryId,status:"retry_wait" as const};}

  async createBill(context:RequestContext,clientId:string,body:unknown){const cityCode=requireAdmin(context);const parsed=createEnterpriseBillSchema.safeParse(body);if(!parsed.success)throw new EnterpriseError(parsed.error.message);const client=await enterpriseRepository.findClient(cityCode,clientId);if(!client)throw new EnterpriseError("business client not found",404);if(client.billingMode!=="monthly")throw new EnterpriseError("bill snapshots require monthly billing mode",409);return enterpriseRepository.createBill({billId:id("bill"),clientId,cityCode,start:new Date(parsed.data.periodStart),end:new Date(parsed.data.periodEnd)});}
  async listBills(context:RequestContext,clientId:string){return enterpriseRepository.listBills(requireAdmin(context),clientId);}
  async issueBill(context:RequestContext,clientId:string,billId:string){if(!await enterpriseRepository.issueBill(requireAdmin(context),clientId,billId))throw new EnterpriseError("draft bill not found",409);return {billId,status:"issued" as const};}
}

export const enterpriseService=new EnterpriseService();
