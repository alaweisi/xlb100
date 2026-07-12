import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../../backend/src/app.js";
import { getMysqlPool } from "../../backend/src/dal/mysqlPool.js";
import { createToken } from "../../backend/src/auth/tokenAuth.js";

const app=await buildApp(),pool=getMysqlPool();
const customer=(city="hangzhou")=>({authorization:`Bearer ${createToken("customer-demo-001","customer","customer")}`,"x-xlb-city-code":city});
const otherCustomer={authorization:`Bearer ${createToken("customer-other","customer","customer")}`,"x-xlb-city-code":"hangzhou"};
describe("Phase 24D durable realtime conversation",()=>{
 let id="";
 beforeAll(async()=>{await app.ready()});
 afterAll(async()=>{if(id){await pool.query("DELETE FROM event_outbox WHERE aggregate_id IN (SELECT message_id FROM support_messages WHERE conversation_id=?) OR aggregate_id=?",[id,id]);await pool.query("DELETE FROM support_messages WHERE conversation_id=?",[id]);await pool.query("DELETE FROM support_conversation_participants WHERE conversation_id=?",[id]);await pool.query("DELETE FROM support_conversations WHERE conversation_id=?",[id]);}await app.close()});
 it("creates idempotently and assigns strictly monotonic sequences under concurrency",async()=>{const body={idempotencyKey:"phase24d-create-001"};const first=await app.inject({method:"POST",url:"/api/support/conversations",headers:customer(),payload:body});expect(first.statusCode).toBe(200);id=first.json().conversation.conversationId;const replay=await app.inject({method:"POST",url:"/api/support/conversations",headers:customer(),payload:body});expect(replay.json().conversation.conversationId).toBe(id);
 const results=await Promise.all(Array.from({length:8},(_,n)=>app.inject({method:"POST",url:`/api/support/conversations/${id}/messages`,headers:customer(),payload:{clientMessageId:`phase24d-message-${n}`,textContent:`message ${n}`}})));expect(results.every(r=>r.statusCode===200)).toBe(true);const seq=results.map(r=>r.json().message.serverSeq).sort((a,b)=>a-b);expect(seq).toEqual([1,2,3,4,5,6,7,8]);
 const retry=await app.inject({method:"POST",url:`/api/support/conversations/${id}/messages`,headers:customer(),payload:{clientMessageId:"phase24d-message-0",textContent:"changed retry body"}});expect(retry.json().message.serverSeq).toBe(1);
 const catchup=await app.inject({method:"GET",url:`/api/support/conversations/${id}/messages?afterSeq=4&limit=100`,headers:customer()});expect(catchup.json().messages.map((m:any)=>m.serverSeq)).toEqual([5,6,7,8]);
 });
 it("rejects cross-city reads",async()=>{const result=await app.inject({method:"GET",url:`/api/support/conversations/${id}/messages`,headers:customer("shanghai")});expect(result.statusCode).toBe(403)});
 it("rejects a same-city non-participant",async()=>{const result=await app.inject({method:"POST",url:`/api/support/conversations/${id}/messages`,headers:otherCustomer,payload:{clientMessageId:"phase24d-forbidden-1",textContent:"not mine"}});expect(result.statusCode).toBe(403)});
 it("has the append-only migration marker and sequence uniqueness",async()=>{const [marker]=await pool.query<any[]>("SELECT version FROM schema_migrations WHERE version='051_phase24d_support_realtime_conversations'");expect(marker).toHaveLength(1);const [indexes]=await pool.query<any[]>(`SELECT index_name FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='support_messages' AND index_name='uq_support_message_seq'`);expect(indexes.length).toBeGreaterThan(0)});
});
