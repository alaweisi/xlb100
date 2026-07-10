import type { RowDataPacket } from "mysql2/promise";
import { describe,expect,it } from "vitest";
import { buildApp } from "../../backend/src/app.js";
import { getMysqlPool } from "../../backend/src/dal/mysqlPool.js";
import { createQueuedDispatchTask,ensureAltHangzhouWorkerBound,ensureHangzhouWorkerEligible,workerHangzhouAltHeaders,workerHangzhouHeaders,workerShanghaiHeaders } from "./helpers/acceptTestHelper.js";
import { operatorHeaders } from "./helpers/dispatchTestHelper.js";
import { bearerHeaders } from "./helpers/authTestHelper.js";

const runDb=process.env.XLB_SKIP_DB_TESTS!=="1";
describe.skipIf(!runDb)("Phase 20 LBS-lite dispatch",{timeout:120000},()=>{
  it("enforces fresh private locations, city/radius matching, and accept-timeout concurrency",async()=>{
    const app=await buildApp();const pool=getMysqlPool();
    try{
      await ensureHangzhouWorkerEligible();await ensureAltHangzhouWorkerBound();
      await pool.query(`INSERT INTO worker_online_status(worker_id,city_code,is_online) VALUES('worker-demo-hangzhou','hangzhou',1),('worker-demo-hangzhou-alt','hangzhou',1) ON DUPLICATE KEY UPDATE is_online=1`);
      await pool.query(`UPDATE worker_profiles SET status='active',dispatch_status='available',is_certified=1 WHERE worker_id IN ('worker-demo-hangzhou','worker-demo-hangzhou-alt')`);
      await pool.query(`INSERT INTO worker_qualifications(worker_id,city_code,sku_id,is_eligible,source_certification_id) VALUES('worker-demo-hangzhou-alt','hangzhou','sku_home_daily_2h',1,NULL) ON DUPLICATE KEY UPDATE is_eligible=1`);
      const fresh={latitude:30.2831,longitude:120.1551,accuracyMeters:12,capturedAt:new Date().toISOString(),serviceRadiusKm:20,locationSharingEnabled:true};
      expect((await app.inject({method:"POST",url:"/api/worker/location",headers:workerHangzhouHeaders,payload:fresh})).statusCode).toBe(200);
      expect((await app.inject({method:"POST",url:"/api/worker/location",headers:workerHangzhouAltHeaders,payload:{...fresh,latitude:30.29}})).statusCode).toBe(200);
      expect((await app.inject({method:"POST",url:"/api/worker/location",headers:workerHangzhouHeaders,payload:{...fresh,capturedAt:new Date(Date.now()-11*60*1000).toISOString()}})).statusCode).toBe(409);
      expect((await app.inject({method:"GET",url:"/api/worker/location",headers:workerHangzhouHeaders})).json().location).toMatchObject({workerId:"worker-demo-hangzhou",privacyLevel:"private_exact",freshness:"fresh"});
      expect((await app.inject({method:"GET",url:"/api/worker/location",headers:operatorHeaders})).statusCode).toBe(403);
      await expect(pool.query(`INSERT INTO worker_locations(location_id,worker_id,city_code,latitude,longitude,accuracy_meters,captured_at,expires_at) VALUES('wloc_cross_city','worker-demo-hangzhou','shanghai',31.2,121.4,10,CURRENT_TIMESTAMP(3),DATE_ADD(CURRENT_TIMESTAMP(3),INTERVAL 10 MINUTE))`)).rejects.toThrow();

      const taskId=await createQueuedDispatchTask(app);const match=await app.inject({method:"POST",url:"/api/internal/dispatch/match-once",headers:operatorHeaders,payload:{dispatchTaskId:taskId}});expect(match.statusCode,match.body).toBe(200);
      const [offers]=await pool.query<(RowDataPacket&{worker_id:string;city_code:string;geo_provider_envelope_json:string|{externalProviderExecuted:boolean};eta_minutes:number})[]>(`SELECT worker_id,city_code,geo_provider_envelope_json,eta_minutes FROM dispatch_offers WHERE dispatch_task_id=? AND status='offering'`,[taskId]);expect(offers).toHaveLength(2);expect(offers.every(row=>row.city_code==="hangzhou"&&Boolean(row.eta_minutes))).toBe(true);expect(offers.every(row=>(typeof row.geo_provider_envelope_json==="string"?JSON.parse(row.geo_provider_envelope_json):row.geo_provider_envelope_json).externalProviderExecuted===false)).toBe(true);
      const results=await Promise.all([app.inject({method:"POST",url:`/api/worker/tasks/${taskId}/accept`,headers:workerHangzhouHeaders,payload:{}}),app.inject({method:"POST",url:`/api/worker/tasks/${taskId}/accept`,headers:workerHangzhouAltHeaders,payload:{}})]);expect(results.map(r=>r.statusCode).sort(),results.map(r=>r.body).join(" | ")).toEqual([200,409]);
      const [acceptances]=await pool.query<(RowDataPacket&{count:number})[]>(`SELECT COUNT(*) count FROM worker_task_acceptances WHERE dispatch_task_id=?`,[taskId]);expect(Number(acceptances[0]?.count)).toBe(1);

      const timeoutTask=await createQueuedDispatchTask(app);await app.inject({method:"POST",url:"/api/internal/dispatch/match-once",headers:operatorHeaders,payload:{dispatchTaskId:timeoutTask}});const race=await Promise.all([app.inject({method:"POST",url:`/api/worker/tasks/${timeoutTask}/accept`,headers:workerHangzhouHeaders,payload:{}}),app.inject({method:"POST",url:`/api/worker/tasks/${timeoutTask}/simulate-timeout`,headers:workerHangzhouHeaders,payload:{}})]);expect(race.filter(r=>r.statusCode===200)).toHaveLength(1);expect(race.filter(r=>r.statusCode===409)).toHaveLength(1);
      const [terminal]=await pool.query<(RowDataPacket&{status:string;count:number})[]>(`SELECT status,COUNT(*) count FROM dispatch_offers WHERE dispatch_task_id=? AND worker_id='worker-demo-hangzhou' GROUP BY status`,[timeoutTask]);expect(terminal).toHaveLength(1);expect(["accepted","timeout"]).toContain(terminal[0]!.status);
      const shanghaiOperator=bearerHeaders({appType:"admin",role:"operator",userId:"admin-operator",cityCode:"shanghai"});expect((await app.inject({method:"POST",url:"/api/internal/dispatch/match-once",headers:shanghaiOperator,payload:{dispatchTaskId:taskId}})).statusCode).toBe(404);
      await pool.query(`UPDATE worker_dispatch_preferences SET location_sharing_enabled=0 WHERE worker_id='worker-demo-hangzhou-alt' AND city_code='hangzhou'`);await pool.query(`UPDATE worker_dispatch_preferences SET service_radius_km=1 WHERE worker_id='worker-demo-hangzhou' AND city_code='hangzhou'`);await pool.query(`UPDATE worker_locations SET latitude=30.40,expires_at=DATE_ADD(captured_at,INTERVAL 10 MINUTE) WHERE worker_id='worker-demo-hangzhou' AND city_code='hangzhou'`);
      const radiusTask=await createQueuedDispatchTask(app);await app.inject({method:"POST",url:"/api/internal/dispatch/match-once",headers:operatorHeaders,payload:{dispatchTaskId:radiusTask}});const [radiusState]=await pool.query<(RowDataPacket&{status:string})[]>(`SELECT status FROM dispatch_tasks WHERE dispatch_task_id=?`,[radiusTask]);expect(radiusState[0]?.status).toBe("no_match");
      await pool.query(`UPDATE worker_dispatch_preferences SET service_radius_km=50 WHERE worker_id='worker-demo-hangzhou' AND city_code='hangzhou'`);await pool.query(`UPDATE worker_locations SET latitude=30.2741,captured_at=DATE_SUB(CURRENT_TIMESTAMP(3),INTERVAL 11 MINUTE),expires_at=DATE_SUB(CURRENT_TIMESTAMP(3),INTERVAL 1 MINUTE) WHERE worker_id='worker-demo-hangzhou' AND city_code='hangzhou'`);
      const staleTask=await createQueuedDispatchTask(app);await app.inject({method:"POST",url:"/api/internal/dispatch/match-once",headers:operatorHeaders,payload:{dispatchTaskId:staleTask}});const [staleState]=await pool.query<(RowDataPacket&{status:string})[]>(`SELECT status FROM dispatch_tasks WHERE dispatch_task_id=?`,[staleTask]);expect(staleState[0]?.status).toBe("no_match");
    }finally{await pool.query(`DELETE FROM worker_locations WHERE worker_id IN ('worker-demo-hangzhou','worker-demo-hangzhou-alt') AND city_code='hangzhou'`);await pool.query(`DELETE FROM worker_dispatch_preferences WHERE worker_id IN ('worker-demo-hangzhou','worker-demo-hangzhou-alt') AND city_code='hangzhou'`);await pool.query(`UPDATE worker_online_status SET is_online=0 WHERE worker_id IN ('worker-demo-hangzhou','worker-demo-hangzhou-alt') AND city_code='hangzhou'`);await pool.query(`UPDATE worker_qualifications SET is_eligible=0 WHERE worker_id='worker-demo-hangzhou-alt' AND city_code='hangzhou' AND sku_id='sku_home_daily_2h'`);await app.close();}
  });
});
