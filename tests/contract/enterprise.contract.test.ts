import { describe,expect,it } from "vitest";
import { BUSINESS_WEBHOOK_EVENT_TYPES } from "@xlb/types";
import { createBusinessClientSchema,createBusinessCredentialSchema,createBusinessOrderSchema,createBusinessWebhookSubscriptionSchema } from "@xlb/validators";

describe("Phase 19 enterprise contracts",()=>{
  it("validates client and least-privilege credential contracts",()=>{
    expect(createBusinessClientSchema.safeParse({clientCode:"ACME_HZ",name:"Acme Hangzhou",billingMode:"monthly",contactName:"Ops",contactPhone:"13800000001"}).success).toBe(true);
    expect(createBusinessCredentialSchema.safeParse({name:"read only",scopes:["enterprise:orders:read"]}).success).toBe(true);
    expect(createBusinessCredentialSchema.safeParse({name:"none",scopes:[]}).success).toBe(false);
  });
  it("requires external identity, idempotency, and a real service address",()=>{
    expect(createBusinessOrderSchema.safeParse({externalOrderId:"ERP-1001",idempotencyKey:"idem-erp-1001",skuId:"sku_home_daily_2h",quantity:2,addressProvince:"浙江省",addressCity:"杭州市",addressDistrict:"西湖区",detailAddress:"文三路 1 号",contactName:"张三",contactPhone:"13800000001",scheduledAt:"2026-07-20T02:00:00.000Z",scheduledTimeSlot:"morning"}).success).toBe(true);
    expect(createBusinessOrderSchema.safeParse({externalOrderId:"x",idempotencyKey:"short"}).success).toBe(false);
  });
  it("limits webhook subscriptions to documented events and HTTPS/mock schemes",()=>{
    expect(BUSINESS_WEBHOOK_EVENT_TYPES).toContain("fulfillment.evidence.created");
    expect(createBusinessWebhookSubscriptionSchema.safeParse({callbackUrl:"mock://success/acme",eventTypes:["order.created"]}).success).toBe(true);
    expect(createBusinessWebhookSubscriptionSchema.safeParse({callbackUrl:"http://127.0.0.1/hook",eventTypes:["order.created"]}).success).toBe(false);
  });
});
