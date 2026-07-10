import type { RowDataPacket } from "mysql2/promise";
import { describe,expect,it } from "vitest";
import { buildApp } from "../../backend/src/app.js";
import { getMysqlPool } from "../../backend/src/dal/mysqlPool.js";
import { loginAdminHeaders } from "./helpers/authTestHelper.js";

const runDb=process.env.XLB_SKIP_DB_TESTS!=="1";

describe.skipIf(!runDb)("Phase 21 admin operations",{timeout:30000},()=>{
  it("lists city-scoped orders/SKUs/certifications and persists a canonical SKU status change",async()=>{
    const app=await buildApp();const pool=getMysqlPool();const headers=await loginAdminHeaders(app,{userId:"phase21-admin",username:"phase21_admin",role:"operator",cityCode:"hangzhou"});await pool.query("INSERT INTO admin_city_scopes(admin_user_id,city_code) VALUES('phase21-admin','hangzhou') ON DUPLICATE KEY UPDATE city_code=VALUES(city_code)");
    const [before]=await pool.query<(RowDataPacket&{is_enabled:number})[]>("SELECT is_enabled FROM service_skus WHERE city_code='hangzhou' AND sku_id='sku_home_daily_2h'");
    const original=Boolean(before[0]?.is_enabled);
    try{
      const orders=await app.inject({method:"GET",url:"/api/internal/operations/orders",headers});expect(orders.statusCode,orders.body).toBe(200);expect(orders.json().orders.every((row:{cityCode:string})=>row.cityCode==="hangzhou")).toBe(true);
      const skus=await app.inject({method:"GET",url:"/api/internal/operations/skus",headers});expect(skus.statusCode,skus.body).toBe(200);expect(skus.json().skus.length).toBeGreaterThan(100);
      const toggle=await app.inject({method:"POST",url:"/api/internal/operations/skus/sku_home_daily_2h/status",headers,payload:{enabled:!original}});expect(toggle.statusCode,toggle.body).toBe(200);
      const [changed]=await pool.query<(RowDataPacket&{is_enabled:number})[]>("SELECT is_enabled FROM service_skus WHERE city_code='hangzhou' AND sku_id='sku_home_daily_2h'");expect(Boolean(changed[0]?.is_enabled)).toBe(!original);
      const certifications=await app.inject({method:"GET",url:"/api/admin/certifications",headers});expect(certifications.statusCode,certifications.body).toBe(200);expect(certifications.json().certifications.every((row:{cityCode:string})=>row.cityCode==="hangzhou")).toBe(true);
      const crossCityHeaders={...headers,"x-xlb-city-code":"shanghai"};
      expect((await app.inject({method:"GET",url:"/api/internal/operations/orders",headers:crossCityHeaders})).statusCode).toBe(403);
      expect((await app.inject({method:"GET",url:"/api/admin/certifications",headers:crossCityHeaders})).statusCode).toBe(403);
    }finally{await pool.query("UPDATE service_skus SET is_enabled=? WHERE city_code='hangzhou' AND sku_id='sku_home_daily_2h'",[original?1:0]);await pool.query("DELETE FROM admin_city_scopes WHERE admin_user_id='phase21-admin'");await pool.query("DELETE FROM admin_users WHERE id='phase21-admin'");await app.close();}
  });
});
