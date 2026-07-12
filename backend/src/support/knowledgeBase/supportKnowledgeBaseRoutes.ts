import type { FastifyInstance, FastifyReply } from "fastify";
import { createRequestContextMiddleware, getRequestContext } from "../../context/requestContextMiddleware.js";
import { supportKnowledgeBaseService, SupportKnowledgeBaseError } from "./supportKnowledgeBaseService.js";
const fail=(error:unknown,reply:FastifyReply)=>error instanceof SupportKnowledgeBaseError?reply.status(error.statusCode).send({ok:false,error:error.message}):Promise.reject(error);
export async function registerSupportKnowledgeBaseRoutes(app:FastifyInstance){const preHandler=createRequestContextMiddleware({requireCityCode:true});
 app.post("/api/internal/support/kb/articles",{preHandler},async(req,reply)=>{try{return{ok:true,...await supportKnowledgeBaseService.createArticle(getRequestContext(req),req.body)}}catch(e){return fail(e,reply)}});
 app.post("/api/internal/support/kb/articles/:articleId/versions",{preHandler},async(req,reply)=>{try{return{ok:true,...await supportKnowledgeBaseService.createRevision(getRequestContext(req),(req.params as{articleId:string}).articleId,req.body)}}catch(e){return fail(e,reply)}});
 for(const action of ["submit","approve","reject"] as const)app.post(`/api/internal/support/kb/articles/:articleId/versions/:versionId/${action}`,{preHandler},async(req,reply)=>{try{const p=req.params as{articleId:string;versionId:string};const method=action==="submit"?"submitRevision":action==="approve"?"approveRevision":"rejectRevision";return{ok:true,...await supportKnowledgeBaseService[method](getRequestContext(req),p.articleId,p.versionId,req.body)}}catch(e){return fail(e,reply)}});
 app.post("/api/internal/support/kb/articles/:articleId/publish",{preHandler},async(req,reply)=>{try{const p=req.params as{articleId:string},b=req.body as Record<string,unknown>;return{ok:true,...await supportKnowledgeBaseService.publishRevision(getRequestContext(req),p.articleId,String(b.versionId??""),b)}}catch(e){return fail(e,reply)}});
}
