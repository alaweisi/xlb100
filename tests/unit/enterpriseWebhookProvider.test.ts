import { describe,expect,it } from "vitest";
import { assertSafeHttpsWebhookUrl,BlockedHttpsWebhookProvider,MockWebhookProvider } from "../../backend/src/enterprise/webhookProvider.js";

const input={callbackUrl:"mock://success/test",deliveryId:"d1",eventType:"order.created",payload:"{}",signature:"v1=abc",timestamp:"2026-07-10T00:00:00.000Z"};
describe("enterprise webhook provider",()=>{
  it("labels mock success without pretending external execution",async()=>{expect(await new MockWebhookProvider().deliver(input)).toMatchObject({provider:"mock",providerStatus:"delivered_mock",externalProviderExecuted:false,httpStatus:200});});
  it("produces an explicit retryable mock failure",async()=>{expect(await new MockWebhookProvider().deliver({...input,callbackUrl:"mock://fail/test"})).toMatchObject({providerStatus:"failed_mock",externalProviderExecuted:false,httpStatus:503});});
  it("blocks HTTPS execution while retaining a truthful readiness envelope",async()=>{expect(await new BlockedHttpsWebhookProvider().deliver({...input,callbackUrl:"https://example.com/hook"})).toMatchObject({provider:"https",providerStatus:"failed_https",externalProviderExecuted:false,httpStatus:null,responseBody:"external provider execution is disabled"});});
  it.each(["http://example.com/hook","https://localhost/hook","https://127.0.0.1/hook","https://user:pass@example.com/hook","https://example.com:8443/hook"])("rejects unsafe callback URL %s",async url=>{await expect(assertSafeHttpsWebhookUrl(url)).rejects.toThrow();});
});
