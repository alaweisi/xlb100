import { describe,expect,it } from "vitest";
import { buildApp } from "../../backend/src/app.js";
import { customerHeaders } from "./helpers/dispatchTestHelper.js";
import { ensureHangzhouWorkerEligible,workerHangzhouHeaders } from "./helpers/acceptTestHelper.js";
import { createAcceptedFulfillment } from "./helpers/fulfillmentTestHelper.js";

const runDb=process.env.XLB_SKIP_DB_TESTS!=="1";
const png=Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,0x01]);

describe.skipIf(!runDb)("Phase 21 customer-worker-admin journey",{timeout:60000},()=>{
  it("runs order -> accept -> evidence -> confirmation -> complaint through real APIs",async()=>{
    await ensureHangzhouWorkerEligible();const app=await buildApp();
    try{
      const {orderId,fulfillmentId}=await createAcceptedFulfillment(app);
      expect((await app.inject({method:"POST",url:`/api/worker/fulfillments/${fulfillmentId}/start`,headers:workerHangzhouHeaders,payload:{}})).statusCode).toBe(200);
      const evidence=await app.inject({method:"POST",url:`/api/worker/fulfillments/${fulfillmentId}/evidence?evidenceType=after_service&note=phase21%20journey`,headers:{...workerHangzhouHeaders,"content-type":"image/png","x-file-name":"phase21.png"},payload:png});
      expect(evidence.statusCode,evidence.body).toBe(200);expect(evidence.json().evidence.mediaAsset.storage.externalProviderExecuted).toBe(false);
      expect((await app.inject({method:"POST",url:`/api/worker/fulfillments/${fulfillmentId}/complete`,headers:workerHangzhouHeaders,payload:{completionNote:"Phase 21 journey complete"}})).statusCode).toBe(200);
      const confirmation=await app.inject({method:"POST",url:`/api/customer/fulfillments/${fulfillmentId}/customer-confirmation`,headers:customerHeaders,payload:{decision:"confirmed",note:"Accepted in Phase 21 journey"}});
      expect(confirmation.statusCode,confirmation.body).toBe(200);expect(confirmation.json().confirmation.status).toBe("confirmed");
      const complaint=await app.inject({method:"POST",url:"/api/aftersale/complaints",headers:customerHeaders,payload:{orderId,category:"service_quality",priority:"normal",description:"Follow-up complaint created by the Phase 21 end-to-end smoke",idempotencyKey:`phase21-journey-${orderId}`}});
      expect(complaint.statusCode,complaint.body).toBe(200);expect(complaint.json().complaint).toMatchObject({orderId,customerId:"customer-dispatch-001",status:"submitted"});
    }finally{await app.close();}
  });
});
