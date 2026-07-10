import type { RowDataPacket } from "mysql2/promise";
import { afterAll,beforeAll,describe,expect,it } from "vitest";
import { buildApp } from "../../backend/src/app.js";
import { getMysqlPool } from "../../backend/src/dal/mysqlPool.js";
import { bearerHeaders } from "./helpers/authTestHelper.js";
import { serviceAddressSchedulePayload } from "./helpers/orderTestPayload.js";

const runDb=process.env.XLB_SKIP_DB_TESTS!=="1";
const customerA="phase21-customer-a";const customerB="phase21-customer-b";
const headersA=bearerHeaders({appType:"customer",role:"customer",userId:customerA,cityCode:"hangzhou"});
const headersB=bearerHeaders({appType:"customer",role:"customer",userId:customerB,cityCode:"hangzhou"});
const headersAShanghai=bearerHeaders({appType:"customer",role:"customer",userId:customerA,cityCode:"shanghai"});

describe.skipIf(!runDb)("Phase 21 customer operations",{timeout:30000},()=>{
  let app:Awaited<ReturnType<typeof buildApp>>;let addressId="";let orderId="";
  beforeAll(async()=>{app=await buildApp();await getMysqlPool().query("DELETE FROM customers WHERE id IN (?,?)",[customerA,customerB]);await getMysqlPool().query(`INSERT INTO customers(id,phone,name) VALUES(?,?,?),(?,?,?)`,[customerA,"16690001001","Customer A",customerB,"16690001002","Customer B"]);});
  afterAll(async()=>{await getMysqlPool().query("DELETE FROM customer_addresses WHERE customer_id IN (?,?)",[customerA,customerB]);await getMysqlPool().query("DELETE FROM event_outbox WHERE aggregate_id=?",[orderId]);await getMysqlPool().query("DELETE FROM order_price_snapshots WHERE order_id=?",[orderId]);await getMysqlPool().query("DELETE FROM orders WHERE order_id=?",[orderId]);await getMysqlPool().query("DELETE FROM customers WHERE id IN (?,?)",[customerA,customerB]);await app.close();});

  it("persists profile and address operations for the authenticated customer",async()=>{
    expect((await app.inject({method:"POST",url:"/api/customer/profile",headers:headersA,payload:{name:"Lin A",defaultCityCode:"hangzhou"}})).statusCode).toBe(200);
    const addressPayload={idempotencyKey:"phase21-address-create-a",contactName:"Lin",contactPhone:"13800000001",province:"浙江省",city:"杭州市",district:"西湖区",detailAddress:"文三路 1 号",isDefault:true};
    const created=await app.inject({method:"POST",url:"/api/customer/addresses",headers:headersA,payload:addressPayload});
    expect(created.statusCode,created.body).toBe(200);addressId=created.json().address.addressId;
    expect(created.json().address).toMatchObject({customerId:customerA,cityCode:"hangzhou",isDefault:true,contactPhoneMasked:"138****0001"});
    const replay=await app.inject({method:"POST",url:"/api/customer/addresses",headers:headersA,payload:addressPayload});expect(replay.statusCode,replay.body).toBe(200);expect(replay.json().address.addressId).toBe(addressId);
    expect((await app.inject({method:"GET",url:"/api/customer/addresses",headers:headersA})).json().addresses).toHaveLength(1);
    expect((await app.inject({method:"GET",url:"/api/customer/addresses",headers:headersAShanghai})).json().addresses).toHaveLength(0);
  });

  it("rejects cross-customer and cross-city address references at API and database layers",async()=>{
    const payload={idempotencyKey:"phase21-address-other",contactName:"Other",contactPhone:"13800000002",province:"浙江省",city:"杭州市",district:"拱墅区",detailAddress:"湖墅路 2 号",isDefault:false};
    expect((await app.inject({method:"POST",url:`/api/customer/addresses/${addressId}`,headers:headersB,payload})).statusCode).toBe(404);
    expect((await app.inject({method:"POST",url:`/api/customer/addresses/${addressId}`,headers:headersAShanghai,payload})).statusCode).toBe(404);
    await expect(getMysqlPool().query(`INSERT INTO customer_addresses(address_id,customer_id,city_code,idempotency_key,contact_name,contact_phone,province,city,district,detail_address) VALUES('phase21-global-address',?,'__global__','phase21-global','x','13800000001','x','x','x','xx')`,[customerA])).rejects.toThrow();
  });

  it("prevents one customer from reading another customer's order",async()=>{
    const response=await app.inject({method:"POST",url:"/api/orders",headers:headersA,payload:{customerId:customerA,skuId:"sku_home_daily_2h",quantity:1,...serviceAddressSchedulePayload}});
    expect(response.statusCode,response.body).toBe(200);orderId=response.json().order.orderId;
    expect((await app.inject({method:"GET",url:`/api/orders/${orderId}`,headers:headersB})).statusCode).toBe(403);
    expect((await app.inject({method:"GET",url:`/api/orders/${orderId}`,headers:headersA})).statusCode).toBe(200);
    const [rows]=await getMysqlPool().query<(RowDataPacket&{customer_id:string})[]>("SELECT customer_id FROM orders WHERE order_id=? AND city_code='hangzhou'",[orderId]);
    expect(rows[0]?.customer_id).toBe(customerA);
  });
});
