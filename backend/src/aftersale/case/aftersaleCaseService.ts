import type { PoolConnection } from "mysql2/promise";
import type {
  AftersaleComplaint,
  AftersaleComplaintDetail,
  AftersaleCompensationIntent,
  AftersaleLiabilityDecision,
  AftersaleRepairOrder,
  RequestContext,
} from "@xlb/types";
import {
  addAftersaleTimelineNoteRequestSchema,
  completeAftersaleRepairOrderRequestSchema,
  createAftersaleComplaintRequestSchema,
  createAftersaleRepairOrderRequestSchema,
  decideAftersaleLiabilityRequestSchema,
  proposeAftersaleCompensationRequestSchema,
  resolveAftersaleComplaintRequestSchema,
  reviewAftersaleCompensationRequestSchema,
  triageAftersaleComplaintRequestSchema,
} from "@xlb/validators";
import { assertCityScopedContext } from "../../dal/scopedExecutor.js";
import { withTransaction } from "../../dal/transaction.js";
import { eventOutboxRepository, EventOutboxRepository } from "../../events/eventOutbox.js";
import {
  generateAftersaleCompensationIntentId,
  generateAftersaleComplaintId,
  generateAftersaleLiabilityDecisionId,
  generateAftersaleRepairOrderId,
  generateAftersaleTimelineEventId,
  generateEventId,
} from "../../events/eventIds.js";
import {
  assertComplaintTransition,
  assertCompensationIntentTransition,
  assertRepairOrderTransition,
} from "./aftersaleStateMachines.js";
import { aftersaleCaseRepository, AftersaleCaseRepository } from "./aftersaleCaseRepository.js";

export class AftersaleValidationError extends Error { readonly statusCode = 400; }
export class AftersaleForbiddenError extends Error { readonly statusCode = 403; }
export class AftersaleNotFoundError extends Error { readonly statusCode = 404; }
export class AftersaleConflictError extends Error { readonly statusCode = 409; }

type TransactionRunner = <T>(callback: (connection: PoolConnection) => Promise<T>) => Promise<T>;

export class AftersaleCaseService {
  constructor(
    private readonly repository: AftersaleCaseRepository = aftersaleCaseRepository,
    private readonly outbox: EventOutboxRepository = eventOutboxRepository,
    private readonly transactionRunner: TransactionRunner = withTransaction,
  ) {}

  async createComplaint(context: RequestContext, body: unknown): Promise<{ complaint: AftersaleComplaint; idempotent: boolean }> {
    const parsed=createAftersaleComplaintRequestSchema.safeParse(body);
    if(!parsed.success)throw new AftersaleValidationError(parsed.error.message);
    const cityCode=assertCityScopedContext(context);
    if(!context.userId)throw new AftersaleValidationError("customer identity is required");
    const customerId=context.userId;
    return this.transactionRunner(async(connection)=>{
      const existing=await this.repository.findComplaintByIdempotencyForUpdate(connection,cityCode,customerId,parsed.data.idempotencyKey);
      if(existing){
        if(existing.orderId!==parsed.data.orderId)throw new AftersaleConflictError("idempotency key was used for another complaint");
        return {complaint:existing,idempotent:true};
      }
      const order=await this.repository.loadOwnedOrderForUpdate(connection,cityCode,parsed.data.orderId);
      if(!order)throw new AftersaleNotFoundError(`Order not found: ${parsed.data.orderId}`);
      if(order.customerId!==customerId)throw new AftersaleForbiddenError("complaint requires order ownership");
      const complaintId=generateAftersaleComplaintId();
      await this.repository.insertComplaint(connection,{
        complaintId,cityCode,orderId:order.orderId,customerId,category:parsed.data.category,
        priority:parsed.data.priority,description:parsed.data.description,idempotencyKey:parsed.data.idempotencyKey,
      });
      await this.repository.insertTimeline(connection,{
        id:generateAftersaleTimelineEventId(),cityCode,orderId:order.orderId,complaintId,
        eventType:"complaint.submitted",actorType:"customer",actorId:customerId,
        content:parsed.data.description,payload:{category:parsed.data.category,priority:parsed.data.priority},
      });
      await this.outbox.insertEvent(connection,{
        eventId:generateEventId(),eventType:"aftersale.complaint.submitted",aggregateType:"aftersale_complaint",
        aggregateId:complaintId,cityCode,payload:{complaintId,orderId:order.orderId,customerId,category:parsed.data.category},
      });
      const created=await this.repository.findComplaintForUpdate(connection,cityCode,complaintId);
      if(!created)throw new Error("failed to load created complaint");
      return {complaint:created,idempotent:false};
    });
  }

  async listForCustomer(context:RequestContext,orderId?:string):Promise<AftersaleComplaint[]>{
    const cityCode=assertCityScopedContext(context);if(!context.userId)throw new AftersaleValidationError("customer identity is required");
    return this.repository.listComplaints(context,cityCode,{customerId:context.userId,orderId});
  }
  async getForCustomer(context:RequestContext,id:string):Promise<AftersaleComplaintDetail>{
    const cityCode=assertCityScopedContext(context);const detail=await this.repository.getDetail(context,cityCode,id);
    if(!detail)throw new AftersaleNotFoundError(`Complaint not found: ${id}`);
    if(detail.complaint.customerId!==context.userId)throw new AftersaleForbiddenError("complaint requires customer ownership");
    return detail;
  }
  async listForAdmin(context:RequestContext,filters:{orderId?:string;status?:string}):Promise<AftersaleComplaint[]>{
    const cityCode=assertCityScopedContext(context);return this.repository.listComplaints(context,cityCode,filters);
  }
  async getForAdmin(context:RequestContext,id:string):Promise<AftersaleComplaintDetail>{
    const cityCode=assertCityScopedContext(context);const detail=await this.repository.getDetail(context,cityCode,id);
    if(!detail)throw new AftersaleNotFoundError(`Complaint not found: ${id}`);return detail;
  }

  async triage(context:RequestContext,id:string,body:unknown):Promise<AftersaleComplaint>{
    const parsed=triageAftersaleComplaintRequestSchema.safeParse(body);if(!parsed.success)throw new AftersaleValidationError(parsed.error.message);
    const cityCode=assertCityScopedContext(context);if(!context.userId)throw new AftersaleValidationError("admin identity is required");
    return this.transactionRunner(async(connection)=>{
      const complaint=await this.repository.findComplaintForUpdate(connection,cityCode,id);if(!complaint)throw new AftersaleNotFoundError(`Complaint not found: ${id}`);
      if(complaint.status!==parsed.data.status)assertComplaintTransition(complaint.status,parsed.data.status);
      await this.repository.updateComplaintStatus(connection,cityCode,id,parsed.data.status,{priority:parsed.data.priority,assignedAdminId:parsed.data.assignedAdminId??context.userId!});
      await this.repository.insertTimeline(connection,{
        id:generateAftersaleTimelineEventId(),cityCode,orderId:complaint.orderId,complaintId:id,
        eventType:parsed.data.status==="triaged"?"complaint.triaged":"complaint.status_changed",
        actorType:"admin",actorId:context.userId!,content:parsed.data.note??parsed.data.status,payload:{status:parsed.data.status,priority:parsed.data.priority},
      });
      return (await this.repository.findComplaintForUpdate(connection,cityCode,id))!;
    });
  }

  async resolve(context:RequestContext,id:string,body:unknown):Promise<AftersaleComplaint>{
    const parsed=resolveAftersaleComplaintRequestSchema.safeParse(body);if(!parsed.success)throw new AftersaleValidationError(parsed.error.message);
    const cityCode=assertCityScopedContext(context);
    return this.transactionRunner(async(connection)=>{
      const complaint=await this.repository.findComplaintForUpdate(connection,cityCode,id);if(!complaint)throw new AftersaleNotFoundError(`Complaint not found: ${id}`);
      if(complaint.status!=="resolved")assertComplaintTransition(complaint.status,"resolved");
      await this.repository.resolveComplaint(connection,cityCode,id,parsed.data.resolutionType,parsed.data.resolutionNote);
      await this.repository.insertTimeline(connection,{
        id:generateAftersaleTimelineEventId(),cityCode,orderId:complaint.orderId,complaintId:id,eventType:"complaint.resolved",
        actorType:"admin",actorId:context.userId??null,content:parsed.data.resolutionNote,payload:{resolutionType:parsed.data.resolutionType},
      });
      await this.outbox.insertEvent(connection,{
        eventId:generateEventId(),eventType:"aftersale.complaint.resolved",aggregateType:"aftersale_complaint",aggregateId:id,
        cityCode,payload:{complaintId:id,orderId:complaint.orderId,resolutionType:parsed.data.resolutionType},
      });
      return (await this.repository.findComplaintForUpdate(connection,cityCode,id))!;
    });
  }

  async close(context:RequestContext,id:string):Promise<AftersaleComplaint>{
    const cityCode=assertCityScopedContext(context);
    return this.transactionRunner(async(connection)=>{
      const complaint=await this.repository.findComplaintForUpdate(connection,cityCode,id);if(!complaint)throw new AftersaleNotFoundError(`Complaint not found: ${id}`);
      if(complaint.status!=="closed")assertComplaintTransition(complaint.status,"closed");
      await this.repository.closeComplaint(connection,cityCode,id);
      await this.repository.insertTimeline(connection,{
        id:generateAftersaleTimelineEventId(),cityCode,orderId:complaint.orderId,complaintId:id,eventType:"complaint.closed",
        actorType:"admin",actorId:context.userId??null,content:"complaint closed",
      });
      return (await this.repository.findComplaintForUpdate(connection,cityCode,id))!;
    });
  }

  async addCustomerNote(context:RequestContext,id:string,body:unknown):Promise<void>{
    const parsed=addAftersaleTimelineNoteRequestSchema.safeParse(body);if(!parsed.success)throw new AftersaleValidationError(parsed.error.message);
    const cityCode=assertCityScopedContext(context);if(!context.userId)throw new AftersaleValidationError("customer identity is required");
    await this.transactionRunner(async(connection)=>{
      const complaint=await this.repository.findComplaintForUpdate(connection,cityCode,id);if(!complaint)throw new AftersaleNotFoundError(`Complaint not found: ${id}`);
      if(complaint.customerId!==context.userId)throw new AftersaleForbiddenError("complaint note requires customer ownership");
      await this.repository.insertTimeline(connection,{
        id:generateAftersaleTimelineEventId(),cityCode,orderId:complaint.orderId,complaintId:id,eventType:"customer_service.note",
        actorType:"customer",actorId:context.userId,content:parsed.data.content,
      });
    });
  }

  async addAdminNote(context:RequestContext,id:string,body:unknown):Promise<void>{
    const parsed=addAftersaleTimelineNoteRequestSchema.safeParse(body);if(!parsed.success)throw new AftersaleValidationError(parsed.error.message);
    const cityCode=assertCityScopedContext(context);if(!context.userId)throw new AftersaleValidationError("admin identity is required");
    await this.transactionRunner(async(connection)=>{
      const complaint=await this.repository.findComplaintForUpdate(connection,cityCode,id);if(!complaint)throw new AftersaleNotFoundError(`Complaint not found: ${id}`);
      await this.repository.insertTimeline(connection,{
        id:generateAftersaleTimelineEventId(),cityCode,orderId:complaint.orderId,complaintId:id,eventType:"customer_service.note",
        actorType:"admin",actorId:context.userId!,content:parsed.data.content,
      });
    });
  }

  async createRepair(context:RequestContext,complaintId:string,body:unknown):Promise<AftersaleRepairOrder>{
    const parsed=createAftersaleRepairOrderRequestSchema.safeParse(body);if(!parsed.success)throw new AftersaleValidationError(parsed.error.message);
    const cityCode=assertCityScopedContext(context);if(!context.userId)throw new AftersaleValidationError("admin identity is required");
    return this.transactionRunner(async(connection)=>{
      const complaint=await this.repository.findComplaintForUpdate(connection,cityCode,complaintId);if(!complaint)throw new AftersaleNotFoundError(`Complaint not found: ${complaintId}`);
      if(["closed","rejected"].includes(complaint.status))throw new AftersaleConflictError("closed or rejected complaint cannot create repair order");
      const repairOrderId=generateAftersaleRepairOrderId();
      await this.repository.insertRepair(connection,{repairOrderId,cityCode,complaintId,orderId:complaint.orderId,workerId:parsed.data.workerId??null,reason:parsed.data.reason,adminId:context.userId!});
      await this.repository.insertTimeline(connection,{
        id:generateAftersaleTimelineEventId(),cityCode,orderId:complaint.orderId,complaintId,repairOrderId,eventType:"repair.created",
        actorType:"admin",actorId:context.userId!,content:parsed.data.reason,payload:{workerId:parsed.data.workerId??null},
      });
      await this.outbox.insertEvent(connection,{
        eventId:generateEventId(),eventType:"aftersale.repair.created",aggregateType:"aftersale_repair",aggregateId:repairOrderId,
        cityCode,payload:{repairOrderId,complaintId,orderId:complaint.orderId,workerId:parsed.data.workerId??null},
      });
      return (await this.repository.findRepairForUpdate(connection,cityCode,repairOrderId))!;
    });
  }

  async listRepairsForWorker(context:RequestContext):Promise<AftersaleRepairOrder[]>{
    const cityCode=assertCityScopedContext(context);if(!context.userId)throw new AftersaleValidationError("worker identity is required");
    return this.repository.listRepairsForWorker(context,cityCode,context.userId);
  }
  async startRepair(context:RequestContext,id:string):Promise<AftersaleRepairOrder>{return this.mutateRepair(context,id,"in_progress",null);}
  async completeRepair(context:RequestContext,id:string,body:unknown):Promise<AftersaleRepairOrder>{
    const parsed=completeAftersaleRepairOrderRequestSchema.safeParse(body);if(!parsed.success)throw new AftersaleValidationError(parsed.error.message);
    return this.mutateRepair(context,id,"completed",parsed.data.serviceNote);
  }
  private async mutateRepair(context:RequestContext,id:string,target:"in_progress"|"completed",serviceNote:string|null):Promise<AftersaleRepairOrder>{
    const cityCode=assertCityScopedContext(context);if(!context.userId)throw new AftersaleValidationError("worker identity is required");
    return this.transactionRunner(async(connection)=>{
      const repair=await this.repository.findRepairForUpdate(connection,cityCode,id);if(!repair)throw new AftersaleNotFoundError(`Repair order not found: ${id}`);
      if(repair.workerId!==context.userId)throw new AftersaleForbiddenError("repair order is assigned to another worker");
      if(repair.status!==target)assertRepairOrderTransition(repair.status,target);
      await this.repository.updateRepairStatus(connection,cityCode,id,target,serviceNote);
      await this.repository.insertTimeline(connection,{
        id:generateAftersaleTimelineEventId(),cityCode,orderId:repair.orderId,complaintId:repair.complaintId,repairOrderId:id,
        eventType:target==="completed"?"repair.completed":"repair.started",actorType:"worker",actorId:context.userId,
        content:serviceNote??"repair started",
      });
      if(target==="completed")await this.outbox.insertEvent(connection,{
        eventId:generateEventId(),eventType:"aftersale.repair.completed",aggregateType:"aftersale_repair",aggregateId:id,
        cityCode,payload:{repairOrderId:id,complaintId:repair.complaintId,orderId:repair.orderId,workerId:context.userId},
      });
      return (await this.repository.findRepairForUpdate(connection,cityCode,id))!;
    });
  }

  async decideLiability(context:RequestContext,complaintId:string,body:unknown):Promise<{liabilityDecision:AftersaleLiabilityDecision;idempotent:boolean}>{
    const parsed=decideAftersaleLiabilityRequestSchema.safeParse(body);if(!parsed.success)throw new AftersaleValidationError(parsed.error.message);
    const cityCode=assertCityScopedContext(context);if(!context.userId)throw new AftersaleValidationError("admin identity is required");
    return this.transactionRunner(async(connection)=>{
      const complaint=await this.repository.findComplaintForUpdate(connection,cityCode,complaintId);if(!complaint)throw new AftersaleNotFoundError(`Complaint not found: ${complaintId}`);
      const existing=await this.repository.findLiabilityForUpdate(connection,cityCode,complaintId);
      if(existing){
        const same=existing.liableParty===parsed.data.liableParty
          && existing.workerLiabilityPercent===parsed.data.workerLiabilityPercent
          && existing.platformLiabilityPercent===parsed.data.platformLiabilityPercent
          && existing.customerLiabilityPercent===parsed.data.customerLiabilityPercent
          && existing.reason===parsed.data.reason;
        if(!same)throw new AftersaleConflictError("liability decision is immutable");
        return {liabilityDecision:existing,idempotent:true};
      }
      const id=generateAftersaleLiabilityDecisionId();
      await this.repository.insertLiability(connection,{id,cityCode,complaintId,orderId:complaint.orderId,liableParty:parsed.data.liableParty,worker:parsed.data.workerLiabilityPercent,platform:parsed.data.platformLiabilityPercent,customer:parsed.data.customerLiabilityPercent,reason:parsed.data.reason,adminId:context.userId!});
      await this.repository.insertTimeline(connection,{id:generateAftersaleTimelineEventId(),cityCode,orderId:complaint.orderId,complaintId,eventType:"liability.decided",actorType:"admin",actorId:context.userId!,content:parsed.data.reason,payload:{liableParty:parsed.data.liableParty}});
      await this.outbox.insertEvent(connection,{eventId:generateEventId(),eventType:"aftersale.liability.decided",aggregateType:"aftersale_complaint",aggregateId:complaintId,cityCode,payload:{complaintId,orderId:complaint.orderId,liableParty:parsed.data.liableParty}});
      return {liabilityDecision:(await this.repository.findLiabilityForUpdate(connection,cityCode,complaintId))!,idempotent:false};
    });
  }

  async proposeCompensation(context:RequestContext,complaintId:string,body:unknown):Promise<AftersaleCompensationIntent>{
    const parsed=proposeAftersaleCompensationRequestSchema.safeParse(body);if(!parsed.success)throw new AftersaleValidationError(parsed.error.message);
    const cityCode=assertCityScopedContext(context);if(!context.userId)throw new AftersaleValidationError("admin identity is required");
    return this.transactionRunner(async(connection)=>{
      const complaint=await this.repository.findComplaintForUpdate(connection,cityCode,complaintId);if(!complaint)throw new AftersaleNotFoundError(`Complaint not found: ${complaintId}`);
      const id=generateAftersaleCompensationIntentId();
      await this.repository.insertCompensation(connection,{id,cityCode,complaintId,orderId:complaint.orderId,intentType:parsed.data.intentType,amount:parsed.data.requestedAmount,reason:parsed.data.reason,adminId:context.userId!});
      await this.repository.insertTimeline(connection,{id:generateAftersaleTimelineEventId(),cityCode,orderId:complaint.orderId,complaintId,eventType:"compensation.proposed",actorType:"admin",actorId:context.userId!,content:parsed.data.reason,payload:{intentType:parsed.data.intentType,requestedAmount:parsed.data.requestedAmount,providerExecutionStatus:"not_executed"}});
      return (await this.repository.findCompensationForUpdate(connection,cityCode,id))!;
    });
  }

  async reviewCompensation(context:RequestContext,id:string,body:unknown):Promise<{compensationIntent:AftersaleCompensationIntent;idempotent:boolean}>{
    const parsed=reviewAftersaleCompensationRequestSchema.safeParse(body);if(!parsed.success)throw new AftersaleValidationError(parsed.error.message);
    const cityCode=assertCityScopedContext(context);if(!context.userId)throw new AftersaleValidationError("admin identity is required");
    return this.transactionRunner(async(connection)=>{
      const intent=await this.repository.findCompensationForUpdate(connection,cityCode,id);if(!intent)throw new AftersaleNotFoundError(`Compensation intent not found: ${id}`);
      if(intent.status===parsed.data.decision)return {compensationIntent:intent,idempotent:true};
      assertCompensationIntentTransition(intent.status,parsed.data.decision);
      if(parsed.data.decision==="approved" && parsed.data.approvedAmount!>intent.requestedAmount){
        throw new AftersaleValidationError("approved compensation amount cannot exceed requested amount");
      }
      await this.repository.reviewCompensation(connection,cityCode,id,parsed.data.decision,parsed.data.approvedAmount??null,context.userId!,parsed.data.decisionNote??null);
      await this.repository.insertTimeline(connection,{id:generateAftersaleTimelineEventId(),cityCode,orderId:intent.orderId,complaintId:intent.complaintId,eventType:parsed.data.decision==="approved"?"compensation.approved":"compensation.rejected",actorType:"admin",actorId:context.userId!,content:parsed.data.decisionNote??parsed.data.decision,payload:{approvedAmount:parsed.data.approvedAmount??null,providerExecutionStatus:"not_executed"}});
      if(parsed.data.decision==="approved")await this.outbox.insertEvent(connection,{eventId:generateEventId(),eventType:"aftersale.compensation.approved",aggregateType:"aftersale_compensation_intent",aggregateId:id,cityCode,payload:{compensationIntentId:id,complaintId:intent.complaintId,orderId:intent.orderId,approvedAmount:parsed.data.approvedAmount,providerExecutionStatus:"not_executed"}});
      return {compensationIntent:(await this.repository.findCompensationForUpdate(connection,cityCode,id))!,idempotent:false};
    });
  }
}

export const aftersaleCaseService = new AftersaleCaseService();
