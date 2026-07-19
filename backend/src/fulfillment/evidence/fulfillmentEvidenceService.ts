import type { PoolConnection } from "mysql2/promise";
import type {
  CityCode,
  FulfillmentEvidence,
  FulfillmentEvidenceAggregate,
  MediaAsset,
  RequestContext,
} from "@xlb/types";
import {
  createFulfillmentEvidenceMetadataSchema,
  decideFulfillmentConfirmationRequestSchema,
} from "@xlb/validators";
import { assertCityScopedContext } from "../../dal/scopedExecutor.js";
import { withTransaction } from "../../dal/transaction.js";
import { canAccessAdminOperation } from "../../auth/operationsAuthorization.js";
import { eventOutboxRepository, type EventOutboxRepository } from "../../events/eventOutbox.js";
import {
  generateAftersaleTimelineEventId,
  generateEventId,
  generateFulfillmentEvidenceId,
  generateMediaAssetId,
} from "../../events/eventIds.js";
import { orderRepository } from "../../order/orderRepository.js";
import { aftersaleCaseRepository } from "../../aftersale/case/aftersaleCaseRepository.js";
import { fulfillmentRepository, type FulfillmentRepository } from "../fulfillmentRepository.js";
import {
  objectStorageProvider,
  type ObjectStorageProvider,
  type StoredObject,
} from "../../providers/objectStorage/objectStorageProvider.js";
import { assertCustomerConfirmationTransition } from "./customerConfirmationStateMachine.js";
import { validateEvidenceFile } from "./fileSafety.js";
import {
  fulfillmentEvidenceRepository,
  type FulfillmentEvidenceRepository,
} from "./fulfillmentEvidenceRepository.js";

export class FulfillmentEvidenceValidationError extends Error { readonly statusCode=400; constructor(message:string){super(message);this.name="FulfillmentEvidenceValidationError";} }
export class FulfillmentEvidenceForbiddenError extends Error { readonly statusCode=403; constructor(message:string){super(message);this.name="FulfillmentEvidenceForbiddenError";} }
export class FulfillmentEvidenceNotFoundError extends Error { readonly statusCode=404; constructor(message:string){super(message);this.name="FulfillmentEvidenceNotFoundError";} }
export class FulfillmentEvidenceConflictError extends Error { readonly statusCode=409; constructor(message:string){super(message);this.name="FulfillmentEvidenceConflictError";} }

type TransactionRunner=<T>(callback:(connection:PoolConnection)=>Promise<T>)=>Promise<T>;

export class FulfillmentEvidenceService {
  constructor(
    private readonly repository:FulfillmentEvidenceRepository=fulfillmentEvidenceRepository,
    private readonly fulfillmentRepo:FulfillmentRepository=fulfillmentRepository,
    private readonly storage:ObjectStorageProvider=objectStorageProvider,
    private readonly outbox:EventOutboxRepository=eventOutboxRepository,
    private readonly transactionRunner:TransactionRunner=withTransaction,
    private readonly now:()=>Date=()=>new Date(),
  ){}

  async uploadForWorker(context:RequestContext,fulfillmentId:string,input:{metadata:unknown;bytes:Buffer;contentType:string;fileName:string}):Promise<FulfillmentEvidence>{
    const cityCode=this.requireActor(context,"worker");
    const parsed=createFulfillmentEvidenceMetadataSchema.safeParse(input.metadata);
    if(!parsed.success)throw new FulfillmentEvidenceValidationError(parsed.error.message);
    const file=validateEvidenceFile({bytes:input.bytes,declaredContentType:input.contentType,originalFileName:input.fileName});
    const fulfillment=await this.fulfillmentRepo.findByIdForWorker(fulfillmentId,cityCode,context.userId!);
    if(!fulfillment)throw new FulfillmentEvidenceNotFoundError(`Fulfillment not found for worker: ${fulfillmentId}`);
    if(fulfillment.status==="cancelled")throw new FulfillmentEvidenceConflictError("cancelled fulfillment cannot accept evidence");
    if(parsed.data.complaintId){
      const complaint=await aftersaleCaseRepository.findComplaint(context,cityCode,parsed.data.complaintId);
      if(!complaint||complaint.orderId!==fulfillment.orderId)throw new FulfillmentEvidenceValidationError("complaint must belong to the same city and order");
    }
    const existingConfirmation=await this.repository.findConfirmation(cityCode,fulfillmentId);
    if(existingConfirmation&&existingConfirmation.status!=="pending")throw new FulfillmentEvidenceConflictError("customer confirmation is terminal; evidence is frozen");
    const mediaAssetId=generateMediaAssetId();
    const evidenceId=generateFulfillmentEvidenceId();
    const objectKey=`${cityCode}/${fulfillment.orderId}/${fulfillmentId}/${mediaAssetId}.${file.extension}`;
    const envelope=await this.storage.putObject({objectKey,bytes:input.bytes,contentType:file.contentType,checksumSha256:file.checksumSha256});
    try{
      await this.transactionRunner(async(connection)=>{
        const locked=await this.fulfillmentRepo.findByIdForWorkerForUpdate(connection,fulfillmentId,cityCode,context.userId!);
        if(!locked)throw new FulfillmentEvidenceNotFoundError(`Fulfillment not found for worker: ${fulfillmentId}`);
        const confirmation=await this.repository.findConfirmationForUpdate(connection,cityCode,fulfillmentId);
        if(confirmation&&confirmation.status!=="pending")throw new FulfillmentEvidenceConflictError("customer confirmation is terminal; evidence is frozen");
        await this.repository.insertMediaAsset(connection,{mediaAssetId,cityCode,orderId:locked.orderId,fulfillmentId,
          complaintId:parsed.data.complaintId??null,workerId:context.userId!,originalFileName:file.safeOriginalFileName,envelope});
        await this.repository.insertEvidence(connection,{evidenceId,cityCode,fulfillmentId,orderId:locked.orderId,
          complaintId:parsed.data.complaintId??null,mediaAssetId,evidenceType:parsed.data.evidenceType,note:parsed.data.note??null,
          capturedAt:parsed.data.capturedAt?new Date(parsed.data.capturedAt):this.now(),workerId:context.userId!});
        await this.repository.refreshPendingSnapshot(connection,cityCode,fulfillmentId);
        await this.outbox.insertEvent(connection,{eventId:generateEventId(),eventType:"fulfillment.evidence.created",
          aggregateType:"fulfillment",aggregateId:fulfillmentId,cityCode,payload:{evidenceId,mediaAssetId,fulfillmentId,
            orderId:locked.orderId,complaintId:parsed.data.complaintId??null,evidenceType:parsed.data.evidenceType,
            storageProvider:envelope.provider,providerStatus:envelope.providerStatus,
            externalProviderExecuted:envelope.externalProviderExecuted}});
      });
    }catch(error){await this.storage.deleteObject(objectKey);throw error;}
    const created=(await this.repository.listEvidence(cityCode,fulfillmentId)).find((item)=>item.evidenceId===evidenceId);
    if(!created)throw new Error("failed to load created fulfillment evidence");
    return created;
  }

  async listForWorker(context:RequestContext,fulfillmentId:string):Promise<FulfillmentEvidenceAggregate>{
    const cityCode=this.requireActor(context,"worker");
    const fulfillment=await this.fulfillmentRepo.findByIdForWorker(fulfillmentId,cityCode,context.userId!);
    if(!fulfillment)throw new FulfillmentEvidenceNotFoundError(`Fulfillment not found for worker: ${fulfillmentId}`);
    return {fulfillmentId,orderId:fulfillment.orderId,cityCode,fulfillmentStatus:fulfillment.status,
      evidence:await this.repository.listEvidence(cityCode,fulfillmentId),confirmation:await this.repository.findConfirmation(cityCode,fulfillmentId)};
  }

  async listForCustomerOrder(context:RequestContext,orderId:string):Promise<FulfillmentEvidenceAggregate[]>{
    const cityCode=this.requireActor(context,"customer");
    const order=await orderRepository.findById(context,cityCode,orderId);
    if(!order)throw new FulfillmentEvidenceNotFoundError(`Order not found: ${orderId}`);
    if(order.customerId!==context.userId)throw new FulfillmentEvidenceForbiddenError("fulfillment evidence requires order ownership");
    return this.repository.listAggregatesForOrder(cityCode,orderId,context.userId!);
  }

  async listForAdminOrder(context:RequestContext,orderId:string):Promise<FulfillmentEvidenceAggregate[]>{
    const cityCode=assertCityScopedContext(context);
    if(!canAccessAdminOperation(context,["admin","operator"]))throw new FulfillmentEvidenceForbiddenError("evidence operations require admin, operator, or OA headquarters authority");
    return this.repository.listAggregatesForOrder(cityCode,orderId);
  }

  async decideForCustomer(context:RequestContext,fulfillmentId:string,body:unknown):Promise<{confirmation:NonNullable<FulfillmentEvidenceAggregate["confirmation"]>;idempotent:boolean}>{
    const cityCode=this.requireActor(context,"customer");
    const parsed=decideFulfillmentConfirmationRequestSchema.safeParse(body);
    if(!parsed.success)throw new FulfillmentEvidenceValidationError(parsed.error.message);
    const evidence=await this.repository.listEvidence(cityCode,fulfillmentId);
    if(parsed.data.decision==="confirmed"&&!evidence.some((item)=>item.evidenceType==="after_service"||item.evidenceType==="completion")){
      throw new FulfillmentEvidenceConflictError("customer confirmation requires after_service or completion evidence");
    }
    let complaintId:string|null=null;
    if(parsed.data.decision==="disputed"){
      const complaint=await aftersaleCaseRepository.findComplaint(context,cityCode,parsed.data.complaintId!);
      if(!complaint||complaint.customerId!==context.userId)throw new FulfillmentEvidenceForbiddenError("dispute complaint requires customer ownership");
      complaintId=complaint.complaintId;
    }
    const target=parsed.data.decision;
    const result=await this.transactionRunner(async(connection)=>{
      const current=await this.repository.findConfirmationForUpdate(connection,cityCode,fulfillmentId);
      if(!current)throw new FulfillmentEvidenceConflictError("customer confirmation is available only after worker completion");
      if(current.customerId!==context.userId)throw new FulfillmentEvidenceForbiddenError("confirmation requires order ownership");
      if(target==="disputed"){
        const complaint=await aftersaleCaseRepository.findComplaintForUpdate(connection,cityCode,complaintId!);
        if(!complaint||complaint.orderId!==current.orderId||complaint.customerId!==context.userId){
          throw new FulfillmentEvidenceValidationError("dispute complaint must belong to the same city, customer, and order");
        }
      }
      if(current.status===target)return {idempotent:true};
      assertCustomerConfirmationTransition(current.status,target);
      const at=this.now();
      await this.repository.decideConfirmation(connection,{cityCode,fulfillmentId,status:target,complaintId,
        note:parsed.data.note??null,at});
      if(target==="disputed"){
        await aftersaleCaseRepository.insertTimeline(connection,{id:generateAftersaleTimelineEventId(),cityCode,
          orderId:current.orderId,complaintId,eventType:"fulfillment.customer_disputed",actorType:"customer",
          actorId:context.userId!,content:parsed.data.note!,payload:{fulfillmentId,evidenceCount:evidence.length}});
      }
      await this.outbox.insertEvent(connection,{eventId:generateEventId(),eventType:`fulfillment.customer_confirmation.${target}`,
        aggregateType:"fulfillment_confirmation",aggregateId:current.confirmationId,cityCode,payload:{confirmationId:current.confirmationId,
          fulfillmentId,orderId:current.orderId,customerId:context.userId,complaintId,evidenceCount:evidence.length}});
      return {idempotent:false};
    });
    const confirmation=await this.repository.findConfirmation(cityCode,fulfillmentId);
    if(!confirmation)throw new Error("failed to load customer confirmation");
    return {confirmation,idempotent:result.idempotent};
  }

  async getMediaContent(context:RequestContext,mediaAssetId:string):Promise<{asset:MediaAsset;object:StoredObject}>{
    const cityCode=assertCityScopedContext(context);
    const asset=await this.repository.findMediaAsset(cityCode,mediaAssetId);
    if(!asset)throw new FulfillmentEvidenceNotFoundError(`Media asset not found: ${mediaAssetId}`);
    const access=await this.repository.findMediaAccess(cityCode,mediaAssetId);
    if(!access)throw new FulfillmentEvidenceNotFoundError(`Media access subject not found: ${mediaAssetId}`);
    const allowed=canAccessAdminOperation(context,["admin","operator"])
      ||(context.appType==="customer"&&context.role==="customer"&&context.userId===access.customerId)
      ||(context.appType==="worker"&&context.role==="worker"&&context.userId===access.workerId);
    if(!allowed)throw new FulfillmentEvidenceForbiddenError("media asset access denied");
    if(asset.storage.provider!==this.storage.kind)throw new FulfillmentEvidenceConflictError("configured storage provider does not match asset envelope");
    return {asset,object:await this.storage.getObject(asset.storage.objectKey,asset.contentType)};
  }

  private requireActor(context:RequestContext,actor:"worker"|"customer"):CityCode{
    const cityCode=assertCityScopedContext(context);
    if(context.appType!==actor||context.role!==actor||!context.userId)throw new FulfillmentEvidenceForbiddenError(`${actor} evidence action requires authenticated ${actor}`);
    return cityCode;
  }
}

export const fulfillmentEvidenceService=new FulfillmentEvidenceService();
