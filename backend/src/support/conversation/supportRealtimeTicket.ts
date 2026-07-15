import { createHash, randomBytes } from "node:crypto";
import type { RequestContext } from "@xlb/types";
import { getRedisClient } from "../../dal/redisClient.js";
import { SupportConversationError } from "./supportConversationService.js";
export type RealtimeIdentity = Required<Pick<RequestContext, "cityCode" | "userId">>
  & Pick<RequestContext, "appType" | "role">;
const key=(ticket:string)=>`xlb:support:ws-ticket:${createHash("sha256").update(ticket).digest("hex")}`;
export async function issueRealtimeTicket(ctx:RequestContext){if(!ctx.cityCode||ctx.cityCode==="__global__"||!ctx.userId)throw new SupportConversationError("real city and identity required",403);const ticket=randomBytes(32).toString("base64url"),redis=getRedisClient();if(redis.status==="wait")await redis.connect();const expiresAt=new Date(Date.now()+60_000).toISOString();await redis.set(key(ticket),JSON.stringify({cityCode:ctx.cityCode,userId:ctx.userId,appType:ctx.appType,role:ctx.role}),"EX",60,"NX");return{ticket,expiresAt};}
export async function consumeRealtimeTicket(ticket:string):Promise<RealtimeIdentity|null>{if(!/^[A-Za-z0-9_-]{40,64}$/.test(ticket))return null;const redis=getRedisClient();if(redis.status==="wait")await redis.connect();const raw=await redis.call("GETDEL",key(ticket));if(typeof raw!=="string")return null;try{return JSON.parse(raw) as RealtimeIdentity}catch{return null}}
