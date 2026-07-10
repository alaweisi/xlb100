import type { FastifyInstance, FastifyReply } from "fastify";
import { FULFILLMENT_EVIDENCE_MAX_BYTES } from "@xlb/types";
import { createRequestContextMiddleware, getRequestContext } from "../../context/requestContextMiddleware.js";
import { authorizeRequest } from "../../gateway/authz.js";
import { InvalidCustomerConfirmationTransitionError } from "./customerConfirmationStateMachine.js";
import { EvidenceFileValidationError } from "./fileSafety.js";
import {
  fulfillmentEvidenceService,
  FulfillmentEvidenceConflictError,
  FulfillmentEvidenceForbiddenError,
  FulfillmentEvidenceNotFoundError,
  FulfillmentEvidenceValidationError,
} from "./fulfillmentEvidenceService.js";

const EVIDENCE_CONTENT_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

function mapError(error:unknown,reply:FastifyReply){
  if(error instanceof EvidenceFileValidationError||error instanceof FulfillmentEvidenceValidationError)return reply.status(400).send({ok:false,error:error.message});
  if(error instanceof FulfillmentEvidenceForbiddenError)return reply.status(403).send({ok:false,error:error.message});
  if(error instanceof FulfillmentEvidenceNotFoundError)return reply.status(404).send({ok:false,error:error.message});
  if(error instanceof FulfillmentEvidenceConflictError||error instanceof InvalidCustomerConfirmationTransitionError)return reply.status(409).send({ok:false,error:error.message});
  throw error;
}

function headerValue(value:string|string[]|undefined):string{
  return Array.isArray(value)?value[0]??"":value??"";
}

function decodedFileName(value:string):string{
  try{return decodeURIComponent(value);}catch{return value;}
}

export async function registerFulfillmentEvidenceRoutes(app:FastifyInstance):Promise<void>{
  for(const contentType of EVIDENCE_CONTENT_TYPES){
    if(!app.hasContentTypeParser(contentType)){
      app.addContentTypeParser(contentType,{parseAs:"buffer",bodyLimit:FULFILLMENT_EVIDENCE_MAX_BYTES},(_request,body,done)=>done(null,body));
    }
  }
  const preHandler=createRequestContextMiddleware({requireCityCode:true});

  app.post("/api/worker/fulfillments/:fulfillmentId/evidence",{preHandler},async(request,reply)=>{
    const context=getRequestContext(request);const authz=authorizeRequest(context);
    if(!authz.ok)return reply.status(authz.statusCode).send({ok:false,error:authz.message});
    try{
      if(!Buffer.isBuffer(request.body))throw new FulfillmentEvidenceValidationError("binary evidence body is required");
      const evidence=await fulfillmentEvidenceService.uploadForWorker(context,(request.params as {fulfillmentId:string}).fulfillmentId,{
        metadata:request.query,bytes:request.body,contentType:headerValue(request.headers["content-type"]),
        fileName:decodedFileName(headerValue(request.headers["x-file-name"])),
      });
      return {ok:true,evidence};
    }catch(error){return mapError(error,reply);}
  });

  app.get("/api/worker/fulfillments/:fulfillmentId/evidence",{preHandler},async(request,reply)=>{
    const context=getRequestContext(request);const authz=authorizeRequest(context);
    if(!authz.ok)return reply.status(authz.statusCode).send({ok:false,error:authz.message});
    try{return {ok:true,aggregate:await fulfillmentEvidenceService.listForWorker(context,(request.params as {fulfillmentId:string}).fulfillmentId)};}
    catch(error){return mapError(error,reply);}
  });

  app.get("/api/customer/orders/:orderId/fulfillment-evidence",{preHandler},async(request,reply)=>{
    const context=getRequestContext(request);const authz=authorizeRequest(context);
    if(!authz.ok)return reply.status(authz.statusCode).send({ok:false,error:authz.message});
    try{return {ok:true,aggregates:await fulfillmentEvidenceService.listForCustomerOrder(context,(request.params as {orderId:string}).orderId)};}
    catch(error){return mapError(error,reply);}
  });

  app.post("/api/customer/fulfillments/:fulfillmentId/customer-confirmation",{preHandler},async(request,reply)=>{
    const context=getRequestContext(request);const authz=authorizeRequest(context);
    if(!authz.ok)return reply.status(authz.statusCode).send({ok:false,error:authz.message});
    try{return {ok:true,...await fulfillmentEvidenceService.decideForCustomer(context,(request.params as {fulfillmentId:string}).fulfillmentId,request.body)};}
    catch(error){return mapError(error,reply);}
  });

  app.get("/api/internal/orders/:orderId/fulfillment-evidence",{preHandler},async(request,reply)=>{
    const context=getRequestContext(request);const authz=authorizeRequest(context);
    if(!authz.ok)return reply.status(authz.statusCode).send({ok:false,error:authz.message});
    try{return {ok:true,aggregates:await fulfillmentEvidenceService.listForAdminOrder(context,(request.params as {orderId:string}).orderId)};}
    catch(error){return mapError(error,reply);}
  });

  app.get("/api/media-assets/:mediaAssetId/content",{preHandler},async(request,reply)=>{
    const context=getRequestContext(request);const authz=authorizeRequest(context);
    if(!authz.ok)return reply.status(authz.statusCode).send({ok:false,error:authz.message});
    try{
      const result=await fulfillmentEvidenceService.getMediaContent(context,(request.params as {mediaAssetId:string}).mediaAssetId);
      return reply.header("Content-Type",result.object.contentType).header("Cache-Control","private, no-store")
        .header("X-Content-Type-Options","nosniff").send(result.object.bytes);
    }catch(error){return mapError(error,reply);}
  });
}
