import { randomUUID } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { BusinessApiContext, BusinessApiScope, CityCode } from "@xlb/types";
import { enterpriseRepository } from "./enterpriseRepository.js";
import { safeHashEqual, sha256 } from "./enterpriseCrypto.js";

declare module "fastify" { interface FastifyRequest { businessApiContext?: BusinessApiContext; } }

function readApiKey(request:FastifyRequest):string{
  const raw=request.headers["x-xlb-api-key"];return Array.isArray(raw)?raw[0]??"":raw??"";
}

export async function businessApiAuth(request:FastifyRequest,reply:FastifyReply):Promise<void>{
  const apiKey=readApiKey(request);const match=/^xlb\.([A-Za-z0-9_-]{6,64})\.([A-Za-z0-9_-]{32,128})$/.exec(apiKey);
  if(!match){return reply.status(401).send({ok:false,error:"valid X-XLB-API-Key required"});}
  const row=await enterpriseRepository.findCredential(match[1]);
  if(!row||row.status!=="active"||row.client_status!=="active"||!safeHashEqual(row.secret_hash,sha256(apiKey))){return reply.status(401).send({ok:false,error:"invalid or inactive API key"});}
  if(row.expires_at&&row.expires_at.getTime()<=Date.now()){return reply.status(401).send({ok:false,error:"API key expired"});}
  request.businessApiContext={credentialId:row.credential_id,businessClientId:row.business_client_id,cityCode:row.city_code as CityCode,billingCustomerId:row.billing_customer_id,scopes:typeof row.scopes_json==="string"?JSON.parse(row.scopes_json):row.scopes_json,traceId:randomUUID()};
  reply.header("X-Trace-Id",request.businessApiContext.traceId);await enterpriseRepository.touchCredential(row.credential_id);
}

export function getBusinessApiContext(request:FastifyRequest):BusinessApiContext{
  if(!request.businessApiContext)throw new Error("Business API context not initialized");return request.businessApiContext;
}

export function requireBusinessScope(context:BusinessApiContext,scope:BusinessApiScope):void{
  if(!context.scopes.includes(scope)){const error=new Error(`API key scope required: ${scope}`) as Error&{statusCode:number};error.statusCode=403;throw error;}
}
