import type { FastifyInstance, FastifyReply } from "fastify";
import {
  createRequestContextMiddleware,
  getRequestContext,
} from "../../context/requestContextMiddleware.js";
import { authorizeRequest } from "../../gateway/authz.js";
import { canAccessAdminOperation } from "../../auth/operationsAuthorization.js";
import {
  aftersaleCaseService,
  AftersaleConflictError,
  AftersaleForbiddenError,
  AftersaleNotFoundError,
  AftersaleValidationError,
} from "./aftersaleCaseService.js";
import { InvalidAftersaleTransitionError } from "./aftersaleStateMachines.js";

function mapError(error: unknown, reply: FastifyReply) {
  if (error instanceof AftersaleValidationError) return reply.status(400).send({ ok:false,error:error.message });
  if (error instanceof AftersaleForbiddenError) return reply.status(403).send({ ok:false,error:error.message });
  if (error instanceof AftersaleNotFoundError) return reply.status(404).send({ ok:false,error:error.message });
  if (error instanceof AftersaleConflictError || error instanceof InvalidAftersaleTransitionError) {
    return reply.status(409).send({ ok:false,error:error.message });
  }
  throw error;
}

export async function registerAftersaleCaseRoutes(app: FastifyInstance): Promise<void> {
  const preHandler=createRequestContextMiddleware({requireCityCode:true});

  app.post("/api/aftersale/complaints",{preHandler},async(request,reply)=>{
    const context=getRequestContext(request);const authz=authorizeRequest(context);
    if(!authz.ok)return reply.status(authz.statusCode).send({ok:false,error:authz.message});
    if(context.appType!=="customer"||context.role!=="customer")return reply.status(403).send({ok:false,error:"complaint creation requires customer role"});
    try{return {ok:true,...await aftersaleCaseService.createComplaint(context,request.body)};}catch(error){return mapError(error,reply);}
  });
  app.get("/api/aftersale/complaints",{preHandler},async(request,reply)=>{
    const context=getRequestContext(request);const authz=authorizeRequest(context);
    if(!authz.ok)return reply.status(authz.statusCode).send({ok:false,error:authz.message});
    if(context.appType!=="customer"||context.role!=="customer")return reply.status(403).send({ok:false,error:"complaint list requires customer role"});
    try{return {ok:true,complaints:await aftersaleCaseService.listForCustomer(context,(request.query as {orderId?:string}).orderId)};}catch(error){return mapError(error,reply);}
  });
  app.get("/api/aftersale/complaints/:complaintId",{preHandler},async(request,reply)=>{
    const context=getRequestContext(request);const authz=authorizeRequest(context);
    if(!authz.ok)return reply.status(authz.statusCode).send({ok:false,error:authz.message});
    if(context.appType!=="customer"||context.role!=="customer")return reply.status(403).send({ok:false,error:"complaint detail requires customer role"});
    try{return {ok:true,detail:await aftersaleCaseService.getForCustomer(context,(request.params as {complaintId:string}).complaintId)};}catch(error){return mapError(error,reply);}
  });
  app.post("/api/aftersale/complaints/:complaintId/notes",{preHandler},async(request,reply)=>{
    const context=getRequestContext(request);const authz=authorizeRequest(context);
    if(!authz.ok)return reply.status(authz.statusCode).send({ok:false,error:authz.message});
    if(context.appType!=="customer"||context.role!=="customer")return reply.status(403).send({ok:false,error:"complaint note requires customer role"});
    try{await aftersaleCaseService.addCustomerNote(context,(request.params as {complaintId:string}).complaintId,request.body);return {ok:true};}catch(error){return mapError(error,reply);}
  });

  app.get("/api/internal/aftersale/complaints",{preHandler},async(request,reply)=>{
    const context=getRequestContext(request);const authz=authorizeRequest(context);
    if(!authz.ok)return reply.status(authz.statusCode).send({ok:false,error:authz.message});
    if(!canAccessAdminOperation(context,["admin","operator"]))return reply.status(403).send({ok:false,error:"complaint operations require admin operator or OA headquarters authority"});
    return {ok:true,complaints:await aftersaleCaseService.listForAdmin(context,request.query as {orderId?:string;status?:string})};
  });
  app.get("/api/internal/aftersale/complaints/:complaintId",{preHandler},async(request,reply)=>{
    const context=getRequestContext(request);const authz=authorizeRequest(context);
    if(!authz.ok)return reply.status(authz.statusCode).send({ok:false,error:authz.message});
    if(!canAccessAdminOperation(context,["admin","operator"]))return reply.status(403).send({ok:false,error:"complaint detail requires admin operator or OA headquarters authority"});
    try{return {ok:true,detail:await aftersaleCaseService.getForAdmin(context,(request.params as {complaintId:string}).complaintId)};}catch(error){return mapError(error,reply);}
  });
  app.post("/api/internal/aftersale/complaints/:complaintId/triage",{preHandler},async(request,reply)=>{
    const context=getRequestContext(request);const authz=authorizeRequest(context);
    if(!authz.ok)return reply.status(authz.statusCode).send({ok:false,error:authz.message});
    if(!canAccessAdminOperation(context,["admin","operator"]))return reply.status(403).send({ok:false,error:"complaint triage requires admin operator or OA headquarters authority"});
    try{return {ok:true,complaint:await aftersaleCaseService.triage(context,(request.params as {complaintId:string}).complaintId,request.body)};}catch(error){return mapError(error,reply);}
  });
  app.post("/api/internal/aftersale/complaints/:complaintId/resolve",{preHandler},async(request,reply)=>{
    const context=getRequestContext(request);const authz=authorizeRequest(context);
    if(!authz.ok)return reply.status(authz.statusCode).send({ok:false,error:authz.message});
    if(!canAccessAdminOperation(context,["admin","operator"]))return reply.status(403).send({ok:false,error:"complaint resolution requires admin operator or OA headquarters authority"});
    try{return {ok:true,complaint:await aftersaleCaseService.resolve(context,(request.params as {complaintId:string}).complaintId,request.body)};}catch(error){return mapError(error,reply);}
  });
  app.post("/api/internal/aftersale/complaints/:complaintId/close",{preHandler},async(request,reply)=>{
    const context=getRequestContext(request);const authz=authorizeRequest(context);
    if(!authz.ok)return reply.status(authz.statusCode).send({ok:false,error:authz.message});
    if(!canAccessAdminOperation(context,["admin","operator"]))return reply.status(403).send({ok:false,error:"complaint close requires admin operator or OA headquarters authority"});
    try{return {ok:true,complaint:await aftersaleCaseService.close(context,(request.params as {complaintId:string}).complaintId)};}catch(error){return mapError(error,reply);}
  });
  app.post("/api/internal/aftersale/complaints/:complaintId/notes",{preHandler},async(request,reply)=>{
    const context=getRequestContext(request);const authz=authorizeRequest(context);
    if(!authz.ok)return reply.status(authz.statusCode).send({ok:false,error:authz.message});
    if(!canAccessAdminOperation(context,["admin","operator"]))return reply.status(403).send({ok:false,error:"customer-service note requires admin operator or OA headquarters authority"});
    try{await aftersaleCaseService.addAdminNote(context,(request.params as {complaintId:string}).complaintId,request.body);return {ok:true};}catch(error){return mapError(error,reply);}
  });
  app.post("/api/internal/aftersale/complaints/:complaintId/repair-orders",{preHandler},async(request,reply)=>{
    const context=getRequestContext(request);const authz=authorizeRequest(context);
    if(!authz.ok)return reply.status(authz.statusCode).send({ok:false,error:authz.message});
    if(!canAccessAdminOperation(context,["admin","operator"]))return reply.status(403).send({ok:false,error:"repair creation requires admin operator or OA headquarters authority"});
    try{return {ok:true,repairOrder:await aftersaleCaseService.createRepair(context,(request.params as {complaintId:string}).complaintId,request.body)};}catch(error){return mapError(error,reply);}
  });
  app.post("/api/internal/aftersale/complaints/:complaintId/liability-decisions",{preHandler},async(request,reply)=>{
    const context=getRequestContext(request);const authz=authorizeRequest(context);
    if(!authz.ok)return reply.status(authz.statusCode).send({ok:false,error:authz.message});
    if(!canAccessAdminOperation(context,["admin","operator"]))return reply.status(403).send({ok:false,error:"liability decision requires admin operator or OA headquarters authority"});
    try{return {ok:true,...await aftersaleCaseService.decideLiability(context,(request.params as {complaintId:string}).complaintId,request.body)};}catch(error){return mapError(error,reply);}
  });
  app.post("/api/internal/aftersale/complaints/:complaintId/compensation-intents",{preHandler},async(request,reply)=>{
    const context=getRequestContext(request);const authz=authorizeRequest(context);
    if(!authz.ok)return reply.status(authz.statusCode).send({ok:false,error:authz.message});
    if(!canAccessAdminOperation(context,["admin","operator"]))return reply.status(403).send({ok:false,error:"compensation proposal requires admin operator or OA headquarters authority"});
    try{return {ok:true,compensationIntent:await aftersaleCaseService.proposeCompensation(context,(request.params as {complaintId:string}).complaintId,request.body)};}catch(error){return mapError(error,reply);}
  });
  app.post("/api/internal/aftersale/compensation-intents/:compensationIntentId/review",{preHandler},async(request,reply)=>{
    const context=getRequestContext(request);const authz=authorizeRequest(context);
    if(!authz.ok)return reply.status(authz.statusCode).send({ok:false,error:authz.message});
    if(!canAccessAdminOperation(context,["admin","operator"]))return reply.status(403).send({ok:false,error:"compensation review requires admin operator or OA headquarters authority"});
    try{return {ok:true,...await aftersaleCaseService.reviewCompensation(context,(request.params as {compensationIntentId:string}).compensationIntentId,request.body)};}catch(error){return mapError(error,reply);}
  });

  app.get("/api/worker/aftersale/repair-orders",{preHandler},async(request,reply)=>{
    const context=getRequestContext(request);const authz=authorizeRequest(context);
    if(!authz.ok)return reply.status(authz.statusCode).send({ok:false,error:authz.message});
    if(context.appType!=="worker"||context.role!=="worker")return reply.status(403).send({ok:false,error:"repair list requires worker role"});
    try{return {ok:true,repairOrders:await aftersaleCaseService.listRepairsForWorker(context)};}catch(error){return mapError(error,reply);}
  });
  app.post("/api/worker/aftersale/repair-orders/:repairOrderId/start",{preHandler},async(request,reply)=>{
    const context=getRequestContext(request);const authz=authorizeRequest(context);
    if(!authz.ok)return reply.status(authz.statusCode).send({ok:false,error:authz.message});
    if(context.appType!=="worker"||context.role!=="worker")return reply.status(403).send({ok:false,error:"repair start requires worker role"});
    try{return {ok:true,repairOrder:await aftersaleCaseService.startRepair(context,(request.params as {repairOrderId:string}).repairOrderId)};}catch(error){return mapError(error,reply);}
  });
  app.post("/api/worker/aftersale/repair-orders/:repairOrderId/complete",{preHandler},async(request,reply)=>{
    const context=getRequestContext(request);const authz=authorizeRequest(context);
    if(!authz.ok)return reply.status(authz.statusCode).send({ok:false,error:authz.message});
    if(context.appType!=="worker"||context.role!=="worker")return reply.status(403).send({ok:false,error:"repair completion requires worker role"});
    try{return {ok:true,repairOrder:await aftersaleCaseService.completeRepair(context,(request.params as {repairOrderId:string}).repairOrderId,request.body)};}catch(error){return mapError(error,reply);}
  });
}
