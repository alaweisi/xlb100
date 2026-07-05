import type { RowDataPacket } from "mysql2/promise"; import { randomBytes } from "node:crypto";
import type { RequestContext } from "@xlb/types"; import type { GovernanceReadinessPacketRecord, CreateReadinessPacketRequest, ExecutionBoundary, DryRunGuard } from "@xlb/types";
import { getMysqlPool } from "../dal/mysqlPool.js"; import { assertCityScopedContext, buildCityScopedWhere } from "../dal/scopedExecutor.js";

const genId = (): string => `rp_${Date.now().toString(36)}_${randomBytes(4).toString("hex")}`;
type R = RowDataPacket & { id:string;city_code:string;intent_id:string;review_id:string|null;evidence_bundle_id:string|null;statement_id:string|null;packet_status:string;readiness_checks_json:string;blocker_flags_json:string;risk_flags_json:string;source_refs_json:string;dry_run_guard_json:string;execution_boundary_json:string;created_by_admin_id:string;created_at:Date;updated_at:Date;archived_at:Date|null };
const map = (r:R): GovernanceReadinessPacketRecord => ({ id:r.id,cityCode:r.city_code,intentId:r.intent_id,reviewId:r.review_id,evidenceBundleId:r.evidence_bundle_id,statementId:r.statement_id,packetStatus:r.packet_status as GovernanceReadinessPacketRecord["packetStatus"],readinessChecks:JSON.parse(r.readiness_checks_json),blockerFlags:JSON.parse(r.blocker_flags_json),riskFlags:JSON.parse(r.risk_flags_json),sourceRefs:JSON.parse(r.source_refs_json),dryRunGuard:JSON.parse(r.dry_run_guard_json),executionBoundary:JSON.parse(r.execution_boundary_json),createdByAdminId:r.created_by_admin_id,createdAt:r.created_at.toISOString(),updatedAt:r.updated_at.toISOString(),archivedAt:r.archived_at?.toISOString()??null });

const defaultBoundary: ExecutionBoundary = { governanceOnly:true,executionEnabled:false,mutationEnabled:false,payoutEnabled:false,refundExecutionEnabled:false,ledgerMutationEnabled:false,settlementMutationEnabled:false,fileGenerationEnabled:false,downloadEnabled:false,providerDispatchEnabled:false };
const defaultGuard: DryRunGuard = { dryRunMode:"governance_guard_only",executionSimulationEnabled:false,moneyMovementSimulationEnabled:false,providerSimulationEnabled:false,ledgerSimulationEnabled:false,refundSimulationEnabled:false,fileGenerationSimulationEnabled:false,guardReason:"Execution disabled — Phase 11 required",nextAllowedPhase:"Phase 11 readiness after Phase 10 lock" };

class GovernanceReadinessService { private pool=getMysqlPool();
  async create(ctx:RequestContext,req:CreateReadinessPacketRequest):Promise<GovernanceReadinessPacketRecord>{ const c=assertCityScopedContext(ctx); const id=genId(); const n=new Date();
    await this.pool.query(`INSERT INTO settlement_action_governance_readiness_packets(id,city_code,intent_id,review_id,evidence_bundle_id,statement_id,packet_status,readiness_checks_json,blocker_flags_json,risk_flags_json,source_refs_json,dry_run_guard_json,execution_boundary_json,created_by_admin_id,created_at,updated_at) VALUES (?,?,?,?,?,?,'draft','{}','[]','[]','[]',?,?,?,?,?)`,
      [id,c,req.intentId,req.reviewId??null,req.evidenceBundleId??null,req.statementId??null,JSON.stringify(defaultGuard),JSON.stringify(defaultBoundary),req.createdByAdminId,n,n]);
    return (await this.get(ctx,id))!; }
  async get(ctx:RequestContext,id:string):Promise<GovernanceReadinessPacketRecord|null>{ const c=assertCityScopedContext(ctx); const {clause,params}=buildCityScopedWhere(c,"city_code");
    const [rows]=await this.pool.query<R[]>(`SELECT * FROM settlement_action_governance_readiness_packets WHERE id=? AND ${clause}`,[id,...params]); return rows.length===0?null:map(rows[0]); }
  async list(ctx:RequestContext,intentId?:string):Promise<GovernanceReadinessPacketRecord[]>{ const c=assertCityScopedContext(ctx); const {clause,params}=buildCityScopedWhere(c,"city_code"); const conds=[clause]; const qp:unknown[]=[...params]; if(intentId){conds.push("intent_id=?");qp.push(intentId);}
    const [rows]=await this.pool.query<R[]>(`SELECT * FROM settlement_action_governance_readiness_packets WHERE ${conds.join(" AND ")} ORDER BY created_at DESC LIMIT 50`,qp); return rows.map(map); }
  async recomputeChecks(ctx:RequestContext,packetId:string):Promise<GovernanceReadinessPacketRecord|null>{ const c=assertCityScopedContext(ctx); const {clause,params}=buildCityScopedWhere(c,"city_code");
    const pkt=await this.get(ctx,packetId); if(!pkt)return null;
    const checks:Record<string,boolean>={ has_governance_intent:!!pkt.intentId, has_governance_review:!!pkt.reviewId, has_evidence_bundle:!!pkt.evidenceBundleId,
      city_scope_confirmed:true, execution_disabled_confirmed:true, no_money_movement_confirmed:true, no_file_generation_confirmed:true };
    await this.pool.query(`UPDATE settlement_action_governance_readiness_packets SET readiness_checks_json=?,packet_status='checks_pending',updated_at=? WHERE id=? AND ${clause}`,[JSON.stringify(checks),new Date(),packetId,...params]);
    return this.get(ctx,packetId); }
  async markBlocked(ctx:RequestContext,packetId:string):Promise<GovernanceReadinessPacketRecord|null>{ const c=assertCityScopedContext(ctx); const {clause,params}=buildCityScopedWhere(c,"city_code");
    const [r]=await this.pool.query(`UPDATE settlement_action_governance_readiness_packets SET packet_status='blocked',updated_at=? WHERE id=? AND ${clause}`,[new Date(),packetId,...params]);
    if((r as {affectedRows:number}).affectedRows===0)return null; return this.get(ctx,packetId); }
  async archive(ctx:RequestContext,packetId:string):Promise<GovernanceReadinessPacketRecord|null>{ const c=assertCityScopedContext(ctx); const {clause,params}=buildCityScopedWhere(c,"city_code"); const n=new Date();
    const [r]=await this.pool.query(`UPDATE settlement_action_governance_readiness_packets SET packet_status='archived',archived_at=?,updated_at=? WHERE id=? AND ${clause}`,[n,n,packetId,...params]);
    if((r as {affectedRows:number}).affectedRows===0)return null; return this.get(ctx,packetId); }
}
export const governanceReadinessService = new GovernanceReadinessService();
