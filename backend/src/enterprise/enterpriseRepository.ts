import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";
import type {
  BusinessAgreementPrice, BusinessApiCredential, BusinessApiScope, BusinessClient,
  BusinessWebhookDelivery, BusinessWebhookEventType, BusinessWebhookSubscription,
  CityCode, EnterpriseBillSnapshot, WebhookProviderEnvelope,
} from "@xlb/types";
import { RepositoryBase } from "../dal/repositoryBase.js";

type ClientRow=RowDataPacket&{business_client_id:string;city_code:string;client_code:string;name:string;status:BusinessClient["status"];billing_mode:BusinessClient["billingMode"];billing_customer_id:string;created_at:Date;updated_at:Date};
type CredentialRow=RowDataPacket&{credential_id:string;business_client_id:string;city_code:string;name:string;key_prefix:string;secret_hash:string;scopes_json:string|BusinessApiScope[];status:"active"|"revoked";expires_at:Date|null;last_used_at:Date|null;created_at:Date;billing_customer_id:string;client_status:string};
type AgreementRow=RowDataPacket&{agreement_price_id:string;business_client_id:string;city_code:string;sku_id:string;unit_price:string;currency:"CNY";effective_from:Date;effective_to:Date|null;status:"active"|"disabled";created_at:Date};
type BusinessOrderRow=RowDataPacket&{business_order_id:string;business_client_id:string;city_code:string;external_order_id:string;idempotency_key:string;request_hash:string;order_id:string;agreement_price_id:string|null;pricing_source:"public"|"agreement";created_at:Date};
type SubscriptionRow=RowDataPacket&{subscription_id:string;business_client_id:string;city_code:string;callback_url:string;event_types_json:string|BusinessWebhookEventType[];signing_secret_ciphertext:string;signing_secret_last4:string;status:"active"|"paused";created_at:Date;updated_at:Date};
type DeliveryRow=RowDataPacket&{delivery_id:string;subscription_id:string;business_client_id:string;city_code:string;event_id:string;event_type:BusinessWebhookEventType;payload_json:string|Record<string,unknown>;payload_sha256:string;signature:string;status:BusinessWebhookDelivery["status"];attempt_count:number;max_attempts:number;next_retry_at:Date|null;provider_envelope_json:string|WebhookProviderEnvelope|null;created_at:Date;updated_at:Date;callback_url:string;signing_secret_ciphertext:string};
type BillRow=RowDataPacket&{bill_id:string;business_client_id:string;city_code:string;period_start:Date;period_end:Date;currency:"CNY";order_count:number;total_amount:string;status:"draft"|"issued";snapshot_json:string|EnterpriseBillSnapshot["snapshot"];created_at:Date;issued_at:Date|null};

const json=<T>(value:string|T):T=>typeof value==="string"?JSON.parse(value) as T:value;
const iso=(value:Date|null)=>value?.toISOString()??null;
const mapClient=(r:ClientRow):BusinessClient=>({businessClientId:r.business_client_id,cityCode:r.city_code as CityCode,clientCode:r.client_code,name:r.name,status:r.status,billingMode:r.billing_mode,billingCustomerId:r.billing_customer_id,createdAt:r.created_at.toISOString(),updatedAt:r.updated_at.toISOString()});
const mapCredential=(r:CredentialRow):BusinessApiCredential=>({credentialId:r.credential_id,businessClientId:r.business_client_id,cityCode:r.city_code as CityCode,name:r.name,keyPrefix:r.key_prefix,scopes:json(r.scopes_json),status:r.status,expiresAt:iso(r.expires_at),lastUsedAt:iso(r.last_used_at),createdAt:r.created_at.toISOString()});
const mapAgreement=(r:AgreementRow):BusinessAgreementPrice=>({agreementPriceId:r.agreement_price_id,businessClientId:r.business_client_id,cityCode:r.city_code as CityCode,skuId:r.sku_id,unitPrice:Number(r.unit_price),currency:r.currency,effectiveFrom:r.effective_from.toISOString(),effectiveTo:iso(r.effective_to),status:r.status,createdAt:r.created_at.toISOString()});
const mapSubscription=(r:SubscriptionRow):BusinessWebhookSubscription=>({subscriptionId:r.subscription_id,businessClientId:r.business_client_id,cityCode:r.city_code as CityCode,callbackUrl:r.callback_url,eventTypes:json(r.event_types_json),status:r.status,signingSecretLast4:r.signing_secret_last4,createdAt:r.created_at.toISOString(),updatedAt:r.updated_at.toISOString()});
const mapDelivery=(r:DeliveryRow):BusinessWebhookDelivery=>({deliveryId:r.delivery_id,subscriptionId:r.subscription_id,businessClientId:r.business_client_id,cityCode:r.city_code as CityCode,eventId:r.event_id,eventType:r.event_type,status:r.status,attemptCount:r.attempt_count,maxAttempts:r.max_attempts,nextRetryAt:iso(r.next_retry_at),payload:json(r.payload_json),payloadSha256:r.payload_sha256,signature:r.signature,providerEnvelope:r.provider_envelope_json?json(r.provider_envelope_json):null,createdAt:r.created_at.toISOString(),updatedAt:r.updated_at.toISOString()});
const mapBill=(r:BillRow):EnterpriseBillSnapshot=>({billId:r.bill_id,businessClientId:r.business_client_id,cityCode:r.city_code as CityCode,periodStart:r.period_start.toISOString(),periodEnd:r.period_end.toISOString(),currency:r.currency,orderCount:r.order_count,totalAmount:Number(r.total_amount),status:r.status,snapshot:json(r.snapshot_json),createdAt:r.created_at.toISOString(),issuedAt:iso(r.issued_at)});

export class EnterpriseRepository extends RepositoryBase {
  constructor(pool?:Pool){super(pool);}

  async insertClient(connection:PoolConnection,input:{clientId:string;contactId:string;customerId:string;billingPhone:string;contactPhone:string;cityCode:CityCode;clientCode:string;name:string;billingMode:BusinessClient["billingMode"];contactName:string;contactEmail:string|null}){
    await connection.query(`INSERT INTO customers(id,phone,name,default_city_code) VALUES(?,?,?,?)`,[input.customerId,input.billingPhone,input.name,input.cityCode]);
    await connection.query(`INSERT INTO business_clients(business_client_id,city_code,client_code,name,billing_mode,billing_customer_id) VALUES(?,?,?,?,?,?)`,[input.clientId,input.cityCode,input.clientCode,input.name,input.billingMode,input.customerId]);
    await connection.query(`INSERT INTO business_client_contacts(contact_id,business_client_id,city_code,name,phone,email,is_primary) VALUES(?,?,?,?,?,?,1)`,[input.contactId,input.clientId,input.cityCode,input.contactName,input.contactPhone,input.contactEmail]);
  }
  async listClients(cityCode:CityCode){const [rows]=await this.pool.query<ClientRow[]>(`SELECT * FROM business_clients WHERE city_code=? ORDER BY created_at DESC`,[cityCode]);return rows.map(mapClient);}
  async findClient(cityCode:CityCode,clientId:string){const [rows]=await this.pool.query<ClientRow[]>(`SELECT * FROM business_clients WHERE city_code=? AND business_client_id=? LIMIT 1`,[cityCode,clientId]);return rows[0]?mapClient(rows[0]):null;}
  async updateClientStatus(cityCode:CityCode,clientId:string,status:BusinessClient["status"]){const [result]=await this.pool.query(`UPDATE business_clients SET status=? WHERE city_code=? AND business_client_id=?`,[status,cityCode,clientId]);return (result as {affectedRows:number}).affectedRows===1;}

  async insertCredential(connection:PoolConnection,input:{credentialId:string;clientId:string;cityCode:CityCode;name:string;keyPrefix:string;secretHash:string;scopes:BusinessApiScope[];expiresAt:Date|null}){
    await connection.query(`INSERT INTO business_api_credentials(credential_id,business_client_id,city_code,name,key_prefix,secret_hash,scopes_json,expires_at) VALUES(?,?,?,?,?,?,?,?)`,[input.credentialId,input.clientId,input.cityCode,input.name,input.keyPrefix,input.secretHash,JSON.stringify(input.scopes),input.expiresAt]);
  }
  async listCredentials(cityCode:CityCode,clientId:string){const [rows]=await this.pool.query<CredentialRow[]>(`SELECT c.*,bc.billing_customer_id,bc.status client_status FROM business_api_credentials c JOIN business_clients bc ON bc.city_code=c.city_code AND bc.business_client_id=c.business_client_id WHERE c.city_code=? AND c.business_client_id=? ORDER BY c.created_at DESC`,[cityCode,clientId]);return rows.map(mapCredential);}
  async findCredential(credentialId:string){const [rows]=await this.pool.query<CredentialRow[]>(`SELECT c.*,bc.billing_customer_id,bc.status client_status FROM business_api_credentials c JOIN business_clients bc ON bc.city_code=c.city_code AND bc.business_client_id=c.business_client_id WHERE c.credential_id=? LIMIT 1`,[credentialId]);return rows[0]??null;}
  async touchCredential(credentialId:string){await this.pool.query(`UPDATE business_api_credentials SET last_used_at=CURRENT_TIMESTAMP WHERE credential_id=?`,[credentialId]);}
  async revokeCredential(cityCode:CityCode,clientId:string,credentialId:string){const [result]=await this.pool.query(`UPDATE business_api_credentials SET status='revoked',revoked_at=CURRENT_TIMESTAMP WHERE city_code=? AND business_client_id=? AND credential_id=? AND status='active'`,[cityCode,clientId,credentialId]);return (result as {affectedRows:number}).affectedRows===1;}

  async upsertAgreement(input:{agreementId:string;clientId:string;cityCode:CityCode;skuId:string;unitPrice:number;from:Date;to:Date|null}){
    await this.pool.query(`INSERT INTO business_agreement_prices(agreement_price_id,business_client_id,city_code,sku_id,unit_price,effective_from,effective_to) VALUES(?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE unit_price=VALUES(unit_price),effective_from=VALUES(effective_from),effective_to=VALUES(effective_to),status='active'`,[input.agreementId,input.clientId,input.cityCode,input.skuId,input.unitPrice,input.from,input.to]);
    return this.findCurrentAgreement(input.cityCode,input.clientId,input.skuId);
  }
  async findCurrentAgreement(cityCode:CityCode,clientId:string,skuId:string){const now=new Date();const [rows]=await this.pool.query<AgreementRow[]>(`SELECT * FROM business_agreement_prices WHERE city_code=? AND business_client_id=? AND sku_id=? AND status='active' AND effective_from<=? AND (effective_to IS NULL OR effective_to>?) LIMIT 1`,[cityCode,clientId,skuId,now,now]);return rows[0]?mapAgreement(rows[0]):null;}
  async listAgreements(cityCode:CityCode,clientId:string){const [rows]=await this.pool.query<AgreementRow[]>(`SELECT * FROM business_agreement_prices WHERE city_code=? AND business_client_id=? ORDER BY sku_id`,[cityCode,clientId]);return rows.map(mapAgreement);}

  async withClientLock<T>(cityCode:CityCode,clientId:string,callback:()=>Promise<T>):Promise<T>{
    const connection=await this.pool.getConnection();const key=`xlb:p19:${cityCode}:${clientId}`;
    try{const [rows]=await connection.query<(RowDataPacket&{locked:number})[]>(`SELECT GET_LOCK(?,10) locked`,[key]);if(rows[0]?.locked!==1)throw new Error("enterprise client lock timeout");return await callback();}
    finally{try{await connection.query(`SELECT RELEASE_LOCK(?)`,[key]);}finally{connection.release();}}
  }
  async findOrderMapping(cityCode:CityCode,clientId:string,externalId?:string,idempotencyKey?:string){
    const clauses=["city_code=?","business_client_id=?"];const params:unknown[]=[cityCode,clientId];
    if(externalId){clauses.push("external_order_id=?");params.push(externalId);}if(idempotencyKey){clauses.push("idempotency_key=?");params.push(idempotencyKey);}
    const [rows]=await this.pool.query<BusinessOrderRow[]>(`SELECT * FROM business_orders WHERE ${clauses.join(" AND ")} LIMIT 1`,params);return rows[0]??null;
  }
  async insertBusinessOrder(input:{businessOrderId:string;clientId:string;cityCode:CityCode;externalOrderId:string;idempotencyKey:string;requestHash:string;orderId:string;agreementId:string|null;pricingSource:"public"|"agreement";snapshot:unknown}){
    await this.pool.query(`INSERT INTO business_orders(business_order_id,business_client_id,city_code,external_order_id,idempotency_key,request_hash,order_id,agreement_price_id,pricing_source,request_snapshot_json) VALUES(?,?,?,?,?,?,?,?,?,?)`,[input.businessOrderId,input.clientId,input.cityCode,input.externalOrderId,input.idempotencyKey,input.requestHash,input.orderId,input.agreementId,input.pricingSource,JSON.stringify(input.snapshot)]);
  }
  async listOrderMappings(cityCode:CityCode,clientId:string){const [rows]=await this.pool.query<BusinessOrderRow[]>(`SELECT * FROM business_orders WHERE city_code=? AND business_client_id=? ORDER BY created_at DESC LIMIT 100`,[cityCode,clientId]);return rows;}

  async insertSubscription(connection:PoolConnection,input:{subscriptionId:string;clientId:string;cityCode:CityCode;callbackUrl:string;eventTypes:BusinessWebhookEventType[];ciphertext:string;last4:string}){
    await connection.query(`INSERT INTO business_webhook_subscriptions(subscription_id,business_client_id,city_code,callback_url,event_types_json,signing_secret_ciphertext,signing_secret_last4) VALUES(?,?,?,?,?,?,?)`,[input.subscriptionId,input.clientId,input.cityCode,input.callbackUrl,JSON.stringify(input.eventTypes),input.ciphertext,input.last4]);
  }
  async listSubscriptions(cityCode:CityCode,clientId:string){const [rows]=await this.pool.query<SubscriptionRow[]>(`SELECT * FROM business_webhook_subscriptions WHERE city_code=? AND business_client_id=? ORDER BY created_at DESC`,[cityCode,clientId]);return rows.map(mapSubscription);}
  async findSubscriptionRaw(cityCode:CityCode,clientId:string,subscriptionId:string){const [rows]=await this.pool.query<SubscriptionRow[]>(`SELECT * FROM business_webhook_subscriptions WHERE city_code=? AND business_client_id=? AND subscription_id=? LIMIT 1`,[cityCode,clientId,subscriptionId]);return rows[0]??null;}
  async updateSubscriptionStatus(cityCode:CityCode,clientId:string,subscriptionId:string,status:"active"|"paused"){const [result]=await this.pool.query(`UPDATE business_webhook_subscriptions SET status=? WHERE city_code=? AND business_client_id=? AND subscription_id=?`,[status,cityCode,clientId,subscriptionId]);return (result as {affectedRows:number}).affectedRows===1;}

  async findWebhookCandidates(cityCode:CityCode,limit=100){const [rows]=await this.pool.query<(RowDataPacket&{subscription_id:string;business_client_id:string;city_code:string;callback_url:string;signing_secret_ciphertext:string;event_id:string;event_type:BusinessWebhookEventType;aggregate_id:string;payload_json:string|Record<string,unknown>;created_at:Date})[]>(
    `SELECT s.subscription_id,s.business_client_id,s.city_code,s.callback_url,s.signing_secret_ciphertext,e.event_id,e.event_type,e.aggregate_id,e.payload_json,e.created_at
     FROM business_webhook_subscriptions s JOIN business_orders bo ON bo.city_code=s.city_code AND bo.business_client_id=s.business_client_id
     JOIN event_outbox e ON e.city_code=bo.city_code AND (e.aggregate_id=bo.order_id OR JSON_UNQUOTE(JSON_EXTRACT(e.payload_json,'$.orderId'))=bo.order_id)
     LEFT JOIN business_webhook_deliveries d ON d.city_code=s.city_code AND d.subscription_id=s.subscription_id AND d.event_id=e.event_id
     WHERE s.city_code=? AND s.status='active' AND JSON_CONTAINS(s.event_types_json,JSON_QUOTE(e.event_type)) AND d.delivery_id IS NULL
     ORDER BY e.created_at LIMIT ?`,[cityCode,limit]);return rows;}
  async insertDelivery(connection:PoolConnection,input:{deliveryId:string;subscriptionId:string;clientId:string;cityCode:CityCode;eventId:string;eventType:string;payload:unknown;payloadHash:string;signature:string}){
    await connection.query(`INSERT IGNORE INTO business_webhook_deliveries(delivery_id,subscription_id,business_client_id,city_code,event_id,event_type,payload_json,payload_sha256,signature) VALUES(?,?,?,?,?,?,?,?,?)`,[input.deliveryId,input.subscriptionId,input.clientId,input.cityCode,input.eventId,input.eventType,JSON.stringify(input.payload),input.payloadHash,input.signature]);
  }
  async listDueDeliveries(cityCode:CityCode,limit=100){const [rows]=await this.pool.query<DeliveryRow[]>(`SELECT d.*,s.callback_url,s.signing_secret_ciphertext FROM business_webhook_deliveries d JOIN business_webhook_subscriptions s ON s.city_code=d.city_code AND s.subscription_id=d.subscription_id WHERE d.city_code=? AND s.status='active' AND d.status IN ('pending','retry_wait') AND (d.next_retry_at IS NULL OR d.next_retry_at<=CURRENT_TIMESTAMP) ORDER BY d.created_at LIMIT ?`,[cityCode,limit]);return rows;}
  async finishDelivery(input:{cityCode:CityCode;deliveryId:string;success:boolean;envelope:WebhookProviderEnvelope;error:string|null}){
    await this.pool.query(`UPDATE business_webhook_deliveries SET attempt_count=attempt_count+1,status=CASE WHEN ? THEN 'delivered' WHEN attempt_count+1>=max_attempts THEN 'dead_letter' ELSE 'retry_wait' END,next_retry_at=CASE WHEN ? OR attempt_count+1>=max_attempts THEN NULL ELSE DATE_ADD(CURRENT_TIMESTAMP,INTERVAL POW(2,attempt_count)*60 SECOND) END,provider_envelope_json=?,last_error=?,delivered_at=CASE WHEN ? THEN CURRENT_TIMESTAMP ELSE NULL END WHERE city_code=? AND delivery_id=?`,[input.success,input.success,JSON.stringify(input.envelope),input.error,input.success,input.cityCode,input.deliveryId]);
  }
  async listDeliveries(cityCode:CityCode,clientId:string){const [rows]=await this.pool.query<DeliveryRow[]>(`SELECT d.*,s.callback_url,s.signing_secret_ciphertext FROM business_webhook_deliveries d JOIN business_webhook_subscriptions s ON s.city_code=d.city_code AND s.subscription_id=d.subscription_id WHERE d.city_code=? AND d.business_client_id=? ORDER BY d.created_at DESC LIMIT 200`,[cityCode,clientId]);return rows.map(mapDelivery);}
  async forceRetry(cityCode:CityCode,clientId:string,deliveryId:string){const [result]=await this.pool.query(`UPDATE business_webhook_deliveries SET status='retry_wait',next_retry_at=CURRENT_TIMESTAMP WHERE city_code=? AND business_client_id=? AND delivery_id=? AND status IN ('retry_wait','dead_letter')`,[cityCode,clientId,deliveryId]);return (result as {affectedRows:number}).affectedRows===1;}

  async createBill(input:{billId:string;clientId:string;cityCode:CityCode;start:Date;end:Date}){
    const [orders]=await this.pool.query<(RowDataPacket&{business_order_id:string;external_order_id:string;order_id:string;total_amount:string;status:string})[]>(`SELECT bo.business_order_id,bo.external_order_id,o.order_id,o.total_amount,o.status FROM business_orders bo JOIN orders o ON o.city_code=bo.city_code AND o.order_id=bo.order_id WHERE bo.city_code=? AND bo.business_client_id=? AND bo.created_at>=? AND bo.created_at<? ORDER BY bo.created_at`,[input.cityCode,input.clientId,input.start,input.end]);
    const snapshot=orders.map(r=>({businessOrderId:r.business_order_id,externalOrderId:r.external_order_id,orderId:r.order_id,amount:Number(r.total_amount),orderStatus:r.status}));const total=snapshot.reduce((sum,item)=>sum+item.amount,0);
    await this.pool.query(`INSERT INTO enterprise_bill_snapshots(bill_id,business_client_id,city_code,period_start,period_end,order_count,total_amount,snapshot_json) VALUES(?,?,?,?,?,?,?,?)`,[input.billId,input.clientId,input.cityCode,input.start,input.end,snapshot.length,total.toFixed(2),JSON.stringify(snapshot)]);
    return this.findBill(input.cityCode,input.clientId,input.billId);
  }
  async findBill(cityCode:CityCode,clientId:string,billId:string){const [rows]=await this.pool.query<BillRow[]>(`SELECT * FROM enterprise_bill_snapshots WHERE city_code=? AND business_client_id=? AND bill_id=? LIMIT 1`,[cityCode,clientId,billId]);return rows[0]?mapBill(rows[0]):null;}
  async listBills(cityCode:CityCode,clientId:string){const [rows]=await this.pool.query<BillRow[]>(`SELECT * FROM enterprise_bill_snapshots WHERE city_code=? AND business_client_id=? ORDER BY period_start DESC`,[cityCode,clientId]);return rows.map(mapBill);}
  async issueBill(cityCode:CityCode,clientId:string,billId:string){const [result]=await this.pool.query(`UPDATE enterprise_bill_snapshots SET status='issued',issued_at=CURRENT_TIMESTAMP WHERE city_code=? AND business_client_id=? AND bill_id=? AND status='draft'`,[cityCode,clientId,billId]);return (result as {affectedRows:number}).affectedRows===1;}
}

export const enterpriseRepository=new EnterpriseRepository();
export { mapCredential, mapAgreement, mapSubscription, mapDelivery };
