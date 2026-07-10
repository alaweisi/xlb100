import type { RowDataPacket } from "mysql2/promise";
import { describe, expect, it } from "vitest";
import { buildApp } from "../../backend/src/app.js";
import { getMysqlPool } from "../../backend/src/dal/mysqlPool.js";
import { bearerHeaders } from "./helpers/authTestHelper.js";
import { serviceAddressSchedulePayload } from "./helpers/orderTestPayload.js";

const runDb = process.env.XLB_SKIP_DB_TESTS !== "1";
const customerHeaders = bearerHeaders({ appType:"customer",role:"customer",userId:"customer-demo-001",cityCode:"hangzhou" });
const otherCustomerHeaders = bearerHeaders({ appType:"customer",role:"customer",userId:"customer-demo-002",cityCode:"hangzhou" });
const adminHeaders = bearerHeaders({ appType:"admin",role:"operator",userId:"admin-demo-001",cityCode:"hangzhou" });
const adminRoleHeaders = bearerHeaders({ appType:"admin",role:"admin",userId:"admin-demo-001",cityCode:"hangzhou" });
const workerHeaders = bearerHeaders({ appType:"worker",role:"worker",userId:"worker-demo-hangzhou",cityCode:"hangzhou" });
const otherWorkerHeaders = bearerHeaders({ appType:"worker",role:"worker",userId:"worker-demo-other",cityCode:"hangzhou" });

describe.skipIf(!runDb)("Phase 17 order reverse and aftersale",{timeout:30000},()=>{
  it("runs reverse, complaint, liability, compensation-intent, and repair flows without refund execution",async()=>{
    const app=await buildApp();
    const key=`p17-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const createOrder=async()=>{
      const response=await app.inject({method:"POST",url:"/api/orders",headers:customerHeaders,payload:{
        customerId:"customer-demo-001",skuId:"sku_home_daily_2h",quantity:1,...serviceAddressSchedulePayload,
      }});
      expect(response.statusCode,response.body).toBe(200);
      return response.json().order.orderId as string;
    };
    try{
      const rescheduleOrderId=await createOrder();
      const reverseCreate=await app.inject({method:"POST",url:`/api/orders/${rescheduleOrderId}/reverse-requests`,headers:customerHeaders,payload:{
        reverseType:"reschedule",reason:"customer changed appointment",requestedScheduledAt:"2026-07-20T02:00:00.000Z",requestedTimeSlot:"afternoon",idempotencyKey:`${key}-reschedule`,
      }});
      expect(reverseCreate.statusCode,reverseCreate.body).toBe(200);
      const reverse=reverseCreate.json().reverseRequest;
      const reverseReplay=await app.inject({method:"POST",url:`/api/orders/${rescheduleOrderId}/reverse-requests`,headers:customerHeaders,payload:{
        reverseType:"reschedule",reason:"customer changed appointment",requestedScheduledAt:"2026-07-20T02:00:00.000Z",requestedTimeSlot:"afternoon",idempotencyKey:`${key}-reschedule`,
      }});
      expect(reverseReplay.json().idempotent).toBe(true);
      expect((await app.inject({method:"POST",url:`/api/internal/aftersale/reverse-requests/${reverse.reverseRequestId}/review`,headers:adminHeaders,payload:{decision:"approved",reviewNote:"slot available"}})).statusCode).toBe(200);
      const applied=await app.inject({method:"POST",url:`/api/internal/aftersale/reverse-requests/${reverse.reverseRequestId}/apply`,headers:adminHeaders,payload:{}});
      expect(applied.statusCode,applied.body).toBe(200);
      expect(applied.json().reverseRequest.status).toBe("applied");
      const updatedOrder=(await app.inject({method:"GET",url:`/api/orders/${rescheduleOrderId}`,headers:customerHeaders})).json().order;
      expect(updatedOrder.scheduledTimeSlot).toBe("afternoon");

      const cancelOrderId=await createOrder();
      const cancelCreate=await app.inject({method:"POST",url:`/api/orders/${cancelOrderId}/reverse-requests`,headers:customerHeaders,payload:{reverseType:"cancel",reason:"service no longer needed",idempotencyKey:`${key}-cancel`}});
      const cancelId=cancelCreate.json().reverseRequest.reverseRequestId;
      await app.inject({method:"POST",url:`/api/internal/aftersale/reverse-requests/${cancelId}/review`,headers:adminHeaders,payload:{decision:"approved"}});
      await app.inject({method:"POST",url:`/api/internal/aftersale/reverse-requests/${cancelId}/apply`,headers:adminHeaders,payload:{}});
      expect((await app.inject({method:"GET",url:`/api/orders/${cancelOrderId}`,headers:customerHeaders})).json().order.status).toBe("cancelled");

      const complaintCreate=await app.inject({method:"POST",url:"/api/aftersale/complaints",headers:customerHeaders,payload:{
        orderId:rescheduleOrderId,category:"service_quality",priority:"urgent",description:"service quality requires a repair visit",idempotencyKey:`${key}-complaint`,
      }});
      expect(complaintCreate.statusCode,complaintCreate.body).toBe(200);
      const complaintId=complaintCreate.json().complaint.complaintId as string;
      expect((await app.inject({method:"GET",url:`/api/aftersale/complaints/${complaintId}`,headers:otherCustomerHeaders})).statusCode).toBe(403);
      expect((await app.inject({method:"GET",url:`/api/internal/aftersale/complaints?orderId=${rescheduleOrderId}`,headers:adminRoleHeaders})).statusCode).toBe(200);
      const triage=await app.inject({method:"POST",url:`/api/internal/aftersale/complaints/${complaintId}/triage`,headers:adminHeaders,payload:{status:"in_progress",priority:"urgent",note:"customer service accepted"}});
      expect(triage.statusCode,triage.body).toBe(200);

      const liability=await app.inject({method:"POST",url:`/api/internal/aftersale/complaints/${complaintId}/liability-decisions`,headers:adminHeaders,payload:{
        liableParty:"shared",workerLiabilityPercent:70,platformLiabilityPercent:30,customerLiabilityPercent:0,reason:"service and platform follow-up responsibility",
      }});
      expect(liability.statusCode,liability.body).toBe(200);
      const liabilityReplay=await app.inject({method:"POST",url:`/api/internal/aftersale/complaints/${complaintId}/liability-decisions`,headers:adminHeaders,payload:{
        liableParty:"shared",workerLiabilityPercent:70,platformLiabilityPercent:30,customerLiabilityPercent:0,reason:"service and platform follow-up responsibility",
      }});
      expect(liabilityReplay.statusCode,liabilityReplay.body).toBe(200);
      expect(liabilityReplay.json().idempotent).toBe(true);
      expect((await app.inject({method:"POST",url:`/api/internal/aftersale/complaints/${complaintId}/liability-decisions`,headers:adminHeaders,payload:{
        liableParty:"worker",workerLiabilityPercent:100,platformLiabilityPercent:0,customerLiabilityPercent:0,reason:"attempted overwrite",
      }})).statusCode).toBe(409);

      const compensation=await app.inject({method:"POST",url:`/api/internal/aftersale/complaints/${complaintId}/compensation-intents`,headers:adminHeaders,payload:{
        intentType:"refund",requestedAmount:20,reason:"partial fee review intent only",
      }});
      expect(compensation.statusCode,compensation.body).toBe(200);
      const compensationId=compensation.json().compensationIntent.compensationIntentId as string;
      expect((await app.inject({method:"POST",url:`/api/internal/aftersale/compensation-intents/${compensationId}/review`,headers:adminHeaders,payload:{decision:"approved",approvedAmount:21}})).statusCode).toBe(400);
      const compensationReview=await app.inject({method:"POST",url:`/api/internal/aftersale/compensation-intents/${compensationId}/review`,headers:adminHeaders,payload:{decision:"approved",approvedAmount:20,decisionNote:"approved as non-executing intent"}});
      expect(compensationReview.statusCode,compensationReview.body).toBe(200);
      expect(compensationReview.json().compensationIntent).toMatchObject({status:"approved",providerExecutionStatus:"not_executed",approvedAmount:20});

      const repair=await app.inject({method:"POST",url:`/api/internal/aftersale/complaints/${complaintId}/repair-orders`,headers:adminHeaders,payload:{workerId:"worker-demo-hangzhou",reason:"return visit required"}});
      expect(repair.statusCode,repair.body).toBe(200);
      const repairOrderId=repair.json().repairOrder.repairOrderId as string;
      expect((await app.inject({method:"POST",url:`/api/worker/aftersale/repair-orders/${repairOrderId}/start`,headers:otherWorkerHeaders,payload:{}})).statusCode).toBe(403);
      expect((await app.inject({method:"POST",url:`/api/worker/aftersale/repair-orders/${repairOrderId}/start`,headers:workerHeaders,payload:{}})).statusCode).toBe(200);
      const repairComplete=await app.inject({method:"POST",url:`/api/worker/aftersale/repair-orders/${repairOrderId}/complete`,headers:workerHeaders,payload:{serviceNote:"repair visit completed"}});
      expect(repairComplete.statusCode,repairComplete.body).toBe(200);
      expect(repairComplete.json().repairOrder.status).toBe("completed");

      const resolved=await app.inject({method:"POST",url:`/api/internal/aftersale/complaints/${complaintId}/resolve`,headers:adminHeaders,payload:{resolutionType:"rework",resolutionNote:"repair completed and customer informed"}});
      expect(resolved.statusCode,resolved.body).toBe(200);
      expect((await app.inject({method:"POST",url:`/api/internal/aftersale/complaints/${complaintId}/close`,headers:adminHeaders,payload:{}})).statusCode).toBe(200);
      const detail=await app.inject({method:"GET",url:`/api/aftersale/complaints/${complaintId}`,headers:customerHeaders});
      expect(detail.statusCode,detail.body).toBe(200);
      expect(detail.json().detail.complaint.status).toBe("closed");
      expect(detail.json().detail.timeline.length).toBeGreaterThanOrEqual(8);
      expect(detail.json().detail.liabilityDecision.liableParty).toBe("shared");

      const [refundRows]=await getMysqlPool().query<RowDataPacket[]>(`SELECT refund_id FROM aftersale_refund_requests WHERE city_code='hangzhou' AND order_id=?`,[rescheduleOrderId]);
      const [ledgerRows]=await getMysqlPool().query<RowDataPacket[]>(`SELECT accrual_id FROM ledger_accruals WHERE city_code='hangzhou' AND order_id=?`,[rescheduleOrderId]);
      expect(refundRows).toHaveLength(0);
      expect(ledgerRows).toHaveLength(0);
    }finally{await app.close();}
  });
});
