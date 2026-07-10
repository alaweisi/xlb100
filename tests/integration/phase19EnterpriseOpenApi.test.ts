import type { RowDataPacket } from "mysql2/promise";
import { describe,expect,it } from "vitest";
import { buildApp } from "../../backend/src/app.js";
import { getMysqlPool } from "../../backend/src/dal/mysqlPool.js";
import { canonicalWebhookPayload, verifyWebhookSignature } from "../../backend/src/enterprise/enterpriseCrypto.js";
import { bearerHeaders } from "./helpers/authTestHelper.js";

const runDb=process.env.XLB_SKIP_DB_TESTS!=="1";
const admin=bearerHeaders({appType:"admin",role:"operator",userId:"admin-operator",cityCode:"hangzhou"});
const shanghaiAdmin=bearerHeaders({appType:"admin",role:"operator",userId:"admin-operator",cityCode:"shanghai"});
const keyHeaders=(apiKey:string)=>({"x-xlb-api-key":apiKey});
const orderBody=(suffix:string)=>({externalOrderId:`ERP-${suffix}`,idempotencyKey:`idem-enterprise-${suffix}`,skuId:"sku_home_daily_2h",quantity:2,addressProvince:"浙江省",addressCity:"杭州市",addressDistrict:"西湖区",detailAddress:"文三路 1 号",contactName:"Enterprise Contact",contactPhone:"13800000001",scheduledAt:"2026-07-20T02:00:00.000Z",scheduledTimeSlot:"morning"});

describe.skipIf(!runDb)("Phase 19 enterprise OpenAPI and webhooks",{timeout:60000},()=>{
  it("runs onboarding, scoped API key, agreement order, signed webhook, retry, and bill flows",async()=>{
    const app=await buildApp();const suffix=`${Date.now()}-${Math.random().toString(16).slice(2,8)}`;
    try{
      await getMysqlPool().query(`UPDATE business_webhook_subscriptions SET status='paused' WHERE callback_url IN ('mock://success/acme','mock://fail/acme')`);
      const created=await app.inject({method:"POST",url:"/api/internal/enterprise/clients",headers:admin,payload:{clientCode:`ACME_${suffix.replaceAll("-","").slice(-10).toUpperCase()}`,name:`Acme ${suffix}`,billingMode:"monthly",contactName:"Ops",contactPhone:"13800000001"}});
      expect(created.statusCode,created.body).toBe(200);const clientId=created.json().client.businessClientId as string;
      expect((await app.inject({method:"GET",url:"/api/internal/enterprise/clients",headers:shanghaiAdmin})).json().clients).not.toEqual(expect.arrayContaining([expect.objectContaining({businessClientId:clientId})]));

      const agreement=await app.inject({method:"POST",url:`/api/internal/enterprise/clients/${clientId}/agreement-prices`,headers:admin,payload:{skuId:"sku_home_daily_2h",unitPrice:80,effectiveFrom:new Date(Date.now()-60000).toISOString()}});
      expect(agreement.statusCode,agreement.body).toBe(200);
      const credential=await app.inject({method:"POST",url:`/api/internal/enterprise/clients/${clientId}/credentials`,headers:admin,payload:{name:"Full integration",scopes:["enterprise:orders:read","enterprise:orders:write","enterprise:webhooks:read","enterprise:webhooks:write"]}});
      expect(credential.statusCode,credential.body).toBe(200);const apiKey=credential.json().apiKey as string;expect(apiKey).toMatch(/^xlb\.bkey_/);

      const createOrder=await app.inject({method:"POST",url:"/openapi/v1/orders",headers:keyHeaders(apiKey),payload:orderBody(suffix)});
      expect(createOrder.statusCode,createOrder.body).toBe(200);expect(createOrder.json()).toMatchObject({idempotent:false,businessOrder:{businessClientId:clientId,pricingSource:"agreement",order:{totalAmount:160,status:"pending_dispatch"}}});
      const externalId=createOrder.json().businessOrder.externalOrderId as string;const orderId=createOrder.json().businessOrder.orderId as string;
      const replay=await app.inject({method:"POST",url:"/openapi/v1/orders",headers:keyHeaders(apiKey),payload:orderBody(suffix)});expect(replay.statusCode).toBe(200);expect(replay.json().idempotent).toBe(true);expect(replay.json().businessOrder.orderId).toBe(orderId);
      const [orderMappings]=await getMysqlPool().query<(RowDataPacket&{count:number})[]>(`SELECT COUNT(*) count FROM business_orders WHERE city_code='hangzhou' AND business_client_id=? AND external_order_id=? AND idempotency_key=?`,[clientId,externalId,orderBody(suffix).idempotencyKey]);expect(orderMappings[0]?.count).toBe(1);
      expect((await app.inject({method:"POST",url:"/openapi/v1/orders",headers:keyHeaders(apiKey),payload:{...orderBody(suffix),quantity:3}})).statusCode).toBe(409);
      expect((await app.inject({method:"GET",url:`/openapi/v1/orders/${externalId}`,headers:keyHeaders(apiKey)})).json().order.orderId).toBe(orderId);
      expect((await app.inject({method:"POST",url:"/openapi/v1/orders",headers:keyHeaders(apiKey),payload:{...orderBody(`${suffix}-override`),businessClientId:"forged",cityCode:"shanghai"}})).statusCode).toBe(400);

      const otherClient=await app.inject({method:"POST",url:"/api/internal/enterprise/clients",headers:admin,payload:{clientCode:`OTHER_${suffix.replaceAll("-","").slice(-9).toUpperCase()}`,name:`Other ${suffix}`,billingMode:"single",contactName:"Other Ops",contactPhone:"13900000002"}});const otherClientId=otherClient.json().client.businessClientId as string;
      const otherCredential=await app.inject({method:"POST",url:`/api/internal/enterprise/clients/${otherClientId}/credentials`,headers:admin,payload:{name:"Other reader",scopes:["enterprise:orders:read","enterprise:webhooks:read"]}});const otherKey=otherCredential.json().apiKey as string;
      expect((await app.inject({method:"GET",url:`/openapi/v1/orders/${externalId}`,headers:keyHeaders(otherKey)})).statusCode).toBe(404);

      const readonly=await app.inject({method:"POST",url:`/api/internal/enterprise/clients/${clientId}/credentials`,headers:admin,payload:{name:"Read only",scopes:["enterprise:orders:read"]}});const readKey=readonly.json().apiKey as string;
      expect((await app.inject({method:"POST",url:"/openapi/v1/orders",headers:keyHeaders(readKey),payload:orderBody(`${suffix}-blocked`)})).statusCode).toBe(403);
      expect((await app.inject({method:"GET",url:"/openapi/v1/webhook-subscriptions",headers:keyHeaders(readKey)})).statusCode).toBe(403);
      const readCredentialId=readonly.json().credential.credentialId as string;expect((await app.inject({method:"POST",url:`/api/internal/enterprise/clients/${clientId}/credentials/${readCredentialId}/revoke`,headers:admin,payload:{}})).statusCode).toBe(200);expect((await app.inject({method:"GET",url:"/openapi/v1/orders",headers:keyHeaders(readKey)})).statusCode).toBe(401);
      expect((await app.inject({method:"GET",url:"/openapi/v1/orders",headers:{"x-xlb-api-key":"invalid"}})).statusCode).toBe(401);

      const subscription=await app.inject({method:"POST",url:"/openapi/v1/webhook-subscriptions",headers:keyHeaders(apiKey),payload:{callbackUrl:"mock://success/acme",eventTypes:["order.created"]}});
      expect(subscription.statusCode,subscription.body).toBe(200);const subscriptionId=subscription.json().subscription.subscriptionId as string;const signingSecret=subscription.json().signingSecret as string;expect(signingSecret).toHaveLength(43);
      const otherSubscription=await app.inject({method:"POST",url:`/api/internal/enterprise/clients/${otherClientId}/webhook-subscriptions`,headers:admin,payload:{callbackUrl:"mock://success/other",eventTypes:["order.created"]}});expect(otherSubscription.statusCode,otherSubscription.body).toBe(200);const otherSubscriptionId=otherSubscription.json().subscription.subscriptionId as string;
      const ownSubscriptions=(await app.inject({method:"GET",url:"/openapi/v1/webhook-subscriptions",headers:keyHeaders(apiKey)})).json().subscriptions as Array<{subscriptionId:string}>;expect(ownSubscriptions.map(item=>item.subscriptionId)).toContain(subscriptionId);expect(ownSubscriptions.map(item=>item.subscriptionId)).not.toContain(otherSubscriptionId);
      const otherSubscriptions=(await app.inject({method:"GET",url:"/openapi/v1/webhook-subscriptions",headers:keyHeaders(otherKey)})).json().subscriptions as Array<{subscriptionId:string}>;expect(otherSubscriptions.map(item=>item.subscriptionId)).toEqual([otherSubscriptionId]);
      expect((await app.inject({method:"GET",url:`/api/internal/enterprise/clients/${otherClientId}/bills`,headers:keyHeaders(apiKey)})).statusCode).toBe(401);
      expect((await app.inject({method:"POST",url:`/api/internal/enterprise/clients/${otherClientId}/webhook-subscriptions/${otherSubscriptionId}/status`,headers:keyHeaders(apiKey),payload:{status:"paused"}})).statusCode).toBe(401);
      const failedSub=await app.inject({method:"POST",url:`/api/internal/enterprise/clients/${clientId}/webhook-subscriptions`,headers:admin,payload:{callbackUrl:"mock://fail/acme",eventTypes:["order.created"]}});expect(failedSub.statusCode,failedSub.body).toBe(200);const failedSubscriptionId=failedSub.json().subscription.subscriptionId as string;
      const [orderEvents]=await getMysqlPool().query<(RowDataPacket&{event_id:string;event_type:string})[]>(`SELECT event_id,event_type FROM event_outbox WHERE city_code='hangzhou' AND aggregate_id=? AND event_type='order.created' ORDER BY created_at DESC LIMIT 1`,[orderId]);expect(orderEvents).toHaveLength(1);
      await expect(getMysqlPool().query(`INSERT INTO business_webhook_deliveries(delivery_id,subscription_id,business_client_id,city_code,event_id,event_type,payload_json,payload_sha256,signature) VALUES(?,?,?,?,?,?,?,?,?)`,[`bdlv_cross_${suffix}`,subscriptionId,otherClientId,"hangzhou",orderEvents[0]!.event_id,orderEvents[0]!.event_type,"{}","0".repeat(64),`v1=${"0".repeat(64)}`])).rejects.toThrow();
      const run=await app.inject({method:"POST",url:"/api/internal/enterprise/webhooks/run-once",headers:admin,payload:{}});expect(run.statusCode,run.body).toBe(200);expect(run.json().candidates).toBeGreaterThanOrEqual(2);expect(run.json().attempted).toBeGreaterThanOrEqual(2);expect(run.json().delivered).toBeGreaterThanOrEqual(1);expect(run.json().retry).toBeGreaterThanOrEqual(1);
      const deliveries=(await app.inject({method:"GET",url:`/api/internal/enterprise/clients/${clientId}/webhook-deliveries`,headers:admin})).json().deliveries as Array<{deliveryId:string;subscriptionId:string;status:string;attemptCount:number;payload:{occurredAt:string};signature:string;providerEnvelope:{providerStatus:string;externalProviderExecuted:boolean}}>;expect(deliveries).toHaveLength(2);expect(deliveries).toEqual(expect.arrayContaining([expect.objectContaining({status:"delivered",providerEnvelope:expect.objectContaining({providerStatus:"delivered_mock",externalProviderExecuted:false})}),expect.objectContaining({status:"retry_wait",providerEnvelope:expect.objectContaining({providerStatus:"failed_mock",externalProviderExecuted:false})})]));
      const successful=deliveries.find(item=>item.subscriptionId===subscriptionId)!;expect(verifyWebhookSignature(signingSecret,successful.payload.occurredAt,canonicalWebhookPayload(successful.payload),successful.signature)).toBe(true);
      const [deliveryCount]=await getMysqlPool().query<(RowDataPacket&{count:number})[]>(`SELECT COUNT(*) count FROM business_webhook_deliveries WHERE city_code='hangzhou' AND business_client_id=?`,[clientId]);expect(deliveryCount[0]?.count).toBe(2);
      await app.inject({method:"POST",url:"/api/internal/enterprise/webhooks/run-once",headers:admin,payload:{}});const [deliveryCountAfterReplay]=await getMysqlPool().query<(RowDataPacket&{count:number})[]>(`SELECT COUNT(*) count FROM business_webhook_deliveries WHERE city_code='hangzhou' AND business_client_id=?`,[clientId]);expect(deliveryCountAfterReplay[0]?.count).toBe(2);
      const retryable=deliveries.find(item=>item.status==="retry_wait")!;expect((await app.inject({method:"POST",url:`/api/internal/enterprise/clients/${otherClientId}/webhook-deliveries/${retryable.deliveryId}/retry`,headers:admin,payload:{}})).statusCode).toBe(409);expect((await app.inject({method:"POST",url:`/api/internal/enterprise/clients/${clientId}/webhook-deliveries/${retryable.deliveryId}/retry`,headers:admin,payload:{}})).statusCode).toBe(200);expect((await app.inject({method:"POST",url:"/api/internal/enterprise/webhooks/run-once",headers:admin,payload:{}})).json().attempted).toBeGreaterThanOrEqual(1);
      const deliveriesAfterRetry=(await app.inject({method:"GET",url:`/api/internal/enterprise/clients/${clientId}/webhook-deliveries`,headers:admin})).json().deliveries as Array<{deliveryId:string;attemptCount:number}>;expect(deliveriesAfterRetry.find(item=>item.deliveryId===retryable.deliveryId)?.attemptCount).toBe(2);
      expect((await app.inject({method:"POST",url:`/api/internal/enterprise/clients/${clientId}/webhook-subscriptions/${failedSubscriptionId}/status`,headers:admin,payload:{status:"paused"}})).statusCode).toBe(200);

      const bill=await app.inject({method:"POST",url:`/api/internal/enterprise/clients/${clientId}/bills`,headers:admin,payload:{periodStart:new Date(Date.now()-86400000).toISOString(),periodEnd:new Date(Date.now()+86400000).toISOString()}});expect(bill.statusCode,bill.body).toBe(200);expect(bill.json().bill).toMatchObject({businessClientId:clientId,orderCount:1,totalAmount:160,status:"draft"});const billId=bill.json().bill.billId as string;expect((await app.inject({method:"POST",url:`/api/internal/enterprise/clients/${clientId}/bills/${billId}/issue`,headers:admin,payload:{}})).statusCode).toBe(200);

      const [secrets]=await getMysqlPool().query<(RowDataPacket&{secret_hash:string})[]>(`SELECT secret_hash FROM business_api_credentials WHERE city_code='hangzhou' AND business_client_id=?`,[clientId]);expect(secrets.every(row=>row.secret_hash!==apiKey&&/^[a-f0-9]{64}$/.test(row.secret_hash))).toBe(true);
      expect((await app.inject({method:"GET",url:`/api/internal/enterprise/clients/${clientId}/webhook-deliveries`,headers:shanghaiAdmin})).json().deliveries).toEqual([]);
      expect((await app.inject({method:"POST",url:`/api/internal/enterprise/clients/${clientId}/status`,headers:admin,payload:{status:"suspended"}})).statusCode).toBe(200);expect((await app.inject({method:"GET",url:"/openapi/v1/orders",headers:keyHeaders(apiKey)})).statusCode).toBe(401);
    }finally{await app.close();}
  });
});
