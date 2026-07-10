import { describe,expect,it } from "vitest";
import { buildApp } from "../../backend/src/app.js";
import { bearerHeaders } from "../integration/helpers/authTestHelper.js";

describe("Phase 21 role matrix",()=>{
  it("explicitly rejects customer/worker/admin cross-app operations",async()=>{
    const app=await buildApp();
    try{
      const customer=bearerHeaders({appType:"customer",role:"customer",userId:"customer-demo-001",cityCode:"hangzhou"});
      const worker=bearerHeaders({appType:"worker",role:"worker",userId:"worker-demo-hangzhou",cityCode:"hangzhou"});
      const admin=bearerHeaders({appType:"admin",role:"operator",userId:"operator-hangzhou",cityCode:"hangzhou"});
      expect((await app.inject({method:"GET",url:"/api/internal/operations/orders",headers:customer})).statusCode).toBe(403);
      expect((await app.inject({method:"POST",url:"/api/internal/operations/skus/sku_home_daily_2h/status",headers:worker,payload:{enabled:false}})).statusCode).toBe(403);
      expect((await app.inject({method:"GET",url:"/api/admin/certifications",headers:customer})).statusCode).toBe(403);
      expect((await app.inject({method:"GET",url:"/api/customer/profile",headers:worker})).statusCode).toBe(403);
      expect((await app.inject({method:"GET",url:"/api/customer/addresses",headers:admin})).statusCode).toBe(403);
    }finally{await app.close();}
  });
});
