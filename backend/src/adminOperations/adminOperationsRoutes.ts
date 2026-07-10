import type { FastifyInstance,FastifyReply } from "fastify";
import { createRequestContextMiddleware,getRequestContext } from "../context/requestContextMiddleware.js";
import { AdminOperationsError,adminOperationsService } from "./adminOperationsService.js";

function fail(error:unknown,reply:FastifyReply){if(error instanceof AdminOperationsError)return reply.status(error.statusCode).send({ok:false,error:error.message});throw error;}
export async function registerAdminOperationsRoutes(app:FastifyInstance):Promise<void>{
  const preHandler=createRequestContextMiddleware({requireCityCode:true});
  app.get("/api/internal/operations/orders",{preHandler},async(request,reply)=>{try{return {ok:true,orders:await adminOperationsService.listOrders(getRequestContext(request))};}catch(error){return fail(error,reply);}});
  app.get("/api/internal/operations/skus",{preHandler},async(request,reply)=>{try{return {ok:true,skus:await adminOperationsService.listSkus(getRequestContext(request))};}catch(error){return fail(error,reply);}});
  app.post("/api/internal/operations/skus/:skuId/status",{preHandler},async(request,reply)=>{const {skuId}=request.params as {skuId:string};const {enabled}=request.body as {enabled?:unknown};try{return {ok:true,sku:await adminOperationsService.setSkuEnabled(getRequestContext(request),skuId,enabled)};}catch(error){return fail(error,reply);}});
}
