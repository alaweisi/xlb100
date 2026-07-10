import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";
import type {
  AftersaleComplaint,
  AftersaleComplaintDetail,
  AftersaleCompensationIntent,
  AftersaleLiabilityDecision,
  AftersaleRepairOrder,
  AftersaleTimelineEvent,
  CityCode,
  ComplaintPriority,
  ComplaintResolutionType,
  ComplaintStatus,
  CompensationIntentStatus,
  CompensationIntentType,
  LiabilityParty,
  RepairOrderStatus,
  RequestContext,
} from "@xlb/types";
import { RepositoryBase } from "../../dal/repositoryBase.js";
import { assertCityScopedContext, buildCityScopedWhere } from "../../dal/scopedExecutor.js";

type ComplaintRow = RowDataPacket & {
  complaint_id: string; city_code: string; order_id: string; customer_id: string;
  category: string; priority: string; description: string; status: string; idempotency_key: string;
  assigned_admin_id: string | null; resolution_type: string | null; resolution_note: string | null;
  submitted_at: Date; resolved_at: Date | null; closed_at: Date | null; updated_at: Date;
};
type RepairRow = RowDataPacket & {
  repair_order_id: string; city_code: string; complaint_id: string; order_id: string;
  worker_id: string | null; reason: string; status: string; service_note: string | null;
  created_by_admin_id: string; started_at: Date | null; completed_at: Date | null;
  created_at: Date; updated_at: Date;
};
type LiabilityRow = RowDataPacket & {
  liability_decision_id: string; city_code: string; complaint_id: string; order_id: string;
  liable_party: string; worker_liability_percent: number; platform_liability_percent: number;
  customer_liability_percent: number; reason: string; decided_by_admin_id: string; decided_at: Date;
};
type CompensationRow = RowDataPacket & {
  compensation_intent_id: string; city_code: string; complaint_id: string; order_id: string;
  intent_type: string; requested_amount: string; approved_amount: string | null; currency: "CNY";
  reason: string; status: string; provider_execution_status: "not_executed";
  proposed_by_admin_id: string; decided_by_admin_id: string | null; decision_note: string | null;
  proposed_at: Date; decided_at: Date | null;
};
type TimelineRow = RowDataPacket & {
  timeline_event_id: string; city_code: string; order_id: string; complaint_id: string | null;
  reverse_request_id: string | null; repair_order_id: string | null; event_type: string;
  actor_type: string; actor_id: string | null; content: string;
  payload_json: string | Record<string, unknown>; created_at: Date;
};

const SELECT_COMPLAINT = `SELECT complaint_id,city_code,order_id,customer_id,category,priority,
  description,status,idempotency_key,assigned_admin_id,resolution_type,resolution_note,
  submitted_at,resolved_at,closed_at,updated_at FROM aftersale_complaints`;
const SELECT_REPAIR = `SELECT repair_order_id,city_code,complaint_id,order_id,worker_id,reason,status,
  service_note,created_by_admin_id,started_at,completed_at,created_at,updated_at FROM aftersale_repair_orders`;
const SELECT_LIABILITY = `SELECT liability_decision_id,city_code,complaint_id,order_id,liable_party,
  worker_liability_percent,platform_liability_percent,customer_liability_percent,reason,
  decided_by_admin_id,decided_at FROM aftersale_liability_decisions`;
const SELECT_COMPENSATION = `SELECT compensation_intent_id,city_code,complaint_id,order_id,intent_type,
  requested_amount,approved_amount,currency,reason,status,provider_execution_status,
  proposed_by_admin_id,decided_by_admin_id,decision_note,proposed_at,decided_at FROM aftersale_compensation_intents`;
const SELECT_TIMELINE = `SELECT timeline_event_id,city_code,order_id,complaint_id,reverse_request_id,
  repair_order_id,event_type,actor_type,actor_id,content,payload_json,created_at FROM aftersale_timeline_events`;

function mapComplaint(row: ComplaintRow): AftersaleComplaint {
  return {
    complaintId: row.complaint_id, cityCode: row.city_code as CityCode, orderId: row.order_id,
    customerId: row.customer_id, category: row.category as AftersaleComplaint["category"],
    priority: row.priority as ComplaintPriority, description: row.description,
    status: row.status as ComplaintStatus, idempotencyKey: row.idempotency_key,
    assignedAdminId: row.assigned_admin_id,
    resolutionType: row.resolution_type as ComplaintResolutionType | null,
    resolutionNote: row.resolution_note, submittedAt: row.submitted_at.toISOString(),
    resolvedAt: row.resolved_at?.toISOString() ?? null, closedAt: row.closed_at?.toISOString() ?? null,
    updatedAt: row.updated_at.toISOString(),
  };
}
function mapRepair(row: RepairRow): AftersaleRepairOrder {
  return {
    repairOrderId: row.repair_order_id, cityCode: row.city_code as CityCode,
    complaintId: row.complaint_id, orderId: row.order_id, workerId: row.worker_id,
    reason: row.reason, status: row.status as RepairOrderStatus, serviceNote: row.service_note,
    createdByAdminId: row.created_by_admin_id, startedAt: row.started_at?.toISOString() ?? null,
    completedAt: row.completed_at?.toISOString() ?? null, createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}
function mapLiability(row: LiabilityRow): AftersaleLiabilityDecision {
  return {
    liabilityDecisionId: row.liability_decision_id, cityCode: row.city_code as CityCode,
    complaintId: row.complaint_id, orderId: row.order_id, liableParty: row.liable_party as LiabilityParty,
    workerLiabilityPercent: row.worker_liability_percent,
    platformLiabilityPercent: row.platform_liability_percent,
    customerLiabilityPercent: row.customer_liability_percent,
    reason: row.reason, decidedByAdminId: row.decided_by_admin_id,
    decidedAt: row.decided_at.toISOString(),
  };
}
function mapCompensation(row: CompensationRow): AftersaleCompensationIntent {
  return {
    compensationIntentId: row.compensation_intent_id, cityCode: row.city_code as CityCode,
    complaintId: row.complaint_id, orderId: row.order_id,
    intentType: row.intent_type as CompensationIntentType, requestedAmount: Number(row.requested_amount),
    approvedAmount: row.approved_amount === null ? null : Number(row.approved_amount),
    currency: "CNY", reason: row.reason, status: row.status as CompensationIntentStatus,
    providerExecutionStatus: "not_executed", proposedByAdminId: row.proposed_by_admin_id,
    decidedByAdminId: row.decided_by_admin_id, decisionNote: row.decision_note,
    proposedAt: row.proposed_at.toISOString(), decidedAt: row.decided_at?.toISOString() ?? null,
  };
}
function mapTimeline(row: TimelineRow): AftersaleTimelineEvent {
  return {
    timelineEventId: row.timeline_event_id, cityCode: row.city_code as CityCode,
    orderId: row.order_id, complaintId: row.complaint_id, reverseRequestId: row.reverse_request_id,
    repairOrderId: row.repair_order_id, eventType: row.event_type as AftersaleTimelineEvent["eventType"],
    actorType: row.actor_type as AftersaleTimelineEvent["actorType"], actorId: row.actor_id,
    content: row.content,
    payload: typeof row.payload_json === "string" ? JSON.parse(row.payload_json) as Record<string, unknown> : row.payload_json,
    createdAt: row.created_at.toISOString(),
  };
}

export class AftersaleCaseRepository extends RepositoryBase {
  constructor(pool?: Pool) { super(pool); }

  async loadOwnedOrderForUpdate(connection: PoolConnection, cityCode: CityCode, orderId: string): Promise<{ orderId: string; customerId: string } | null> {
    const [rows] = await connection.query<(RowDataPacket & { order_id: string; customer_id: string })[]>(
      `SELECT order_id,customer_id FROM orders WHERE city_code=? AND order_id=? LIMIT 1 FOR UPDATE`,
      [cityCode,orderId],
    );
    return rows[0] ? { orderId: rows[0].order_id, customerId: rows[0].customer_id } : null;
  }

  async findComplaintByIdempotencyForUpdate(connection: PoolConnection, cityCode: CityCode, customerId: string, key: string): Promise<AftersaleComplaint | null> {
    const [rows] = await connection.query<ComplaintRow[]>(`${SELECT_COMPLAINT} WHERE city_code=? AND customer_id=? AND idempotency_key=? LIMIT 1 FOR UPDATE`,[cityCode,customerId,key]);
    return rows[0] ? mapComplaint(rows[0]) : null;
  }
  async findComplaintForUpdate(connection: PoolConnection, cityCode: CityCode, id: string): Promise<AftersaleComplaint | null> {
    const [rows] = await connection.query<ComplaintRow[]>(`${SELECT_COMPLAINT} WHERE city_code=? AND complaint_id=? LIMIT 1 FOR UPDATE`,[cityCode,id]);
    return rows[0] ? mapComplaint(rows[0]) : null;
  }
  async insertComplaint(connection: PoolConnection, input: { complaintId:string;cityCode:CityCode;orderId:string;customerId:string;category:string;priority:string;description:string;idempotencyKey:string }): Promise<void> {
    await connection.query(
      `INSERT INTO aftersale_complaints
        (complaint_id,city_code,order_id,customer_id,category,priority,description,status,idempotency_key)
       VALUES (?,?,?,?,?,?,?,'submitted',?)`,
      [input.complaintId,input.cityCode,input.orderId,input.customerId,input.category,input.priority,input.description,input.idempotencyKey],
    );
  }
  async updateComplaintStatus(connection: PoolConnection, cityCode: CityCode, id: string, status: ComplaintStatus, input: { priority?: ComplaintPriority; assignedAdminId?: string }): Promise<void> {
    await connection.query(
      `UPDATE aftersale_complaints SET status=?,priority=COALESCE(?,priority),assigned_admin_id=COALESCE(?,assigned_admin_id)
       WHERE city_code=? AND complaint_id=?`,
      [status,input.priority ?? null,input.assignedAdminId ?? null,cityCode,id],
    );
  }
  async resolveComplaint(connection: PoolConnection, cityCode: CityCode, id: string, type: ComplaintResolutionType, note: string): Promise<void> {
    await connection.query(
      `UPDATE aftersale_complaints SET status='resolved',resolution_type=?,resolution_note=?,resolved_at=CURRENT_TIMESTAMP
       WHERE city_code=? AND complaint_id=?`,[type,note,cityCode,id],
    );
  }
  async closeComplaint(connection: PoolConnection, cityCode: CityCode, id: string): Promise<void> {
    await connection.query(`UPDATE aftersale_complaints SET status='closed',closed_at=CURRENT_TIMESTAMP WHERE city_code=? AND complaint_id=?`,[cityCode,id]);
  }

  async listComplaints(context: RequestContext, cityCode: CityCode, filters: { customerId?: string; orderId?: string; status?: string }): Promise<AftersaleComplaint[]> {
    this.requireContext(context); assertCityScopedContext(context);
    const where=buildCityScopedWhere(cityCode); const clauses=[where.clause]; const params:unknown[]=[...where.params];
    if(filters.customerId){clauses.push("customer_id=?");params.push(filters.customerId);}
    if(filters.orderId){clauses.push("order_id=?");params.push(filters.orderId);}
    if(filters.status){clauses.push("status=?");params.push(filters.status);}
    const [rows]=await this.pool.query<ComplaintRow[]>(`${SELECT_COMPLAINT} WHERE ${clauses.join(" AND ")} ORDER BY submitted_at DESC LIMIT 200`,params);
    return rows.map(mapComplaint);
  }
  async findComplaint(context: RequestContext, cityCode: CityCode, id: string): Promise<AftersaleComplaint | null> {
    this.requireContext(context); assertCityScopedContext(context); const where=buildCityScopedWhere(cityCode);
    const [rows]=await this.pool.query<ComplaintRow[]>(`${SELECT_COMPLAINT} WHERE ${where.clause} AND complaint_id=? LIMIT 1`,[...where.params,id]);
    return rows[0]?mapComplaint(rows[0]):null;
  }

  async insertRepair(connection: PoolConnection,input:{repairOrderId:string;cityCode:CityCode;complaintId:string;orderId:string;workerId:string|null;reason:string;adminId:string}):Promise<void>{
    await connection.query(
      `INSERT INTO aftersale_repair_orders
        (repair_order_id,city_code,complaint_id,order_id,worker_id,reason,status,created_by_admin_id)
       VALUES (?,?,?,?,?,?,?,?)`,
      [input.repairOrderId,input.cityCode,input.complaintId,input.orderId,input.workerId,input.reason,input.workerId?"assigned":"requested",input.adminId],
    );
  }
  async findRepairForUpdate(connection:PoolConnection,cityCode:CityCode,id:string):Promise<AftersaleRepairOrder|null>{
    const [rows]=await connection.query<RepairRow[]>(`${SELECT_REPAIR} WHERE city_code=? AND repair_order_id=? LIMIT 1 FOR UPDATE`,[cityCode,id]);
    return rows[0]?mapRepair(rows[0]):null;
  }
  async updateRepairStatus(connection:PoolConnection,cityCode:CityCode,id:string,status:RepairOrderStatus,serviceNote:string|null):Promise<void>{
    const started=status==="in_progress"?",started_at=CURRENT_TIMESTAMP":"";
    const completed=status==="completed"?",completed_at=CURRENT_TIMESTAMP":"";
    await connection.query(`UPDATE aftersale_repair_orders SET status=?,service_note=COALESCE(?,service_note)${started}${completed} WHERE city_code=? AND repair_order_id=?`,[status,serviceNote,cityCode,id]);
  }
  async listRepairsByComplaint(context:RequestContext,cityCode:CityCode,complaintId:string):Promise<AftersaleRepairOrder[]>{
    this.requireContext(context);assertCityScopedContext(context);const where=buildCityScopedWhere(cityCode);
    const [rows]=await this.pool.query<RepairRow[]>(`${SELECT_REPAIR} WHERE ${where.clause} AND complaint_id=? ORDER BY created_at`,[...where.params,complaintId]);
    return rows.map(mapRepair);
  }
  async listRepairsForWorker(context:RequestContext,cityCode:CityCode,workerId:string):Promise<AftersaleRepairOrder[]>{
    this.requireContext(context);assertCityScopedContext(context);const where=buildCityScopedWhere(cityCode);
    const [rows]=await this.pool.query<RepairRow[]>(`${SELECT_REPAIR} WHERE ${where.clause} AND worker_id=? ORDER BY created_at DESC`,[...where.params,workerId]);
    return rows.map(mapRepair);
  }

  async findLiabilityForUpdate(connection:PoolConnection,cityCode:CityCode,complaintId:string):Promise<AftersaleLiabilityDecision|null>{
    const [rows]=await connection.query<LiabilityRow[]>(`${SELECT_LIABILITY} WHERE city_code=? AND complaint_id=? LIMIT 1 FOR UPDATE`,[cityCode,complaintId]);
    return rows[0]?mapLiability(rows[0]):null;
  }
  async insertLiability(connection:PoolConnection,input:{id:string;cityCode:CityCode;complaintId:string;orderId:string;liableParty:LiabilityParty;worker:number;platform:number;customer:number;reason:string;adminId:string}):Promise<void>{
    await connection.query(
      `INSERT INTO aftersale_liability_decisions
        (liability_decision_id,city_code,complaint_id,order_id,liable_party,worker_liability_percent,platform_liability_percent,customer_liability_percent,reason,decided_by_admin_id)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [input.id,input.cityCode,input.complaintId,input.orderId,input.liableParty,input.worker,input.platform,input.customer,input.reason,input.adminId],
    );
  }
  async findLiability(context:RequestContext,cityCode:CityCode,complaintId:string):Promise<AftersaleLiabilityDecision|null>{
    this.requireContext(context);assertCityScopedContext(context);const where=buildCityScopedWhere(cityCode);
    const [rows]=await this.pool.query<LiabilityRow[]>(`${SELECT_LIABILITY} WHERE ${where.clause} AND complaint_id=? LIMIT 1`,[...where.params,complaintId]);
    return rows[0]?mapLiability(rows[0]):null;
  }

  async insertCompensation(connection:PoolConnection,input:{id:string;cityCode:CityCode;complaintId:string;orderId:string;intentType:CompensationIntentType;amount:number;reason:string;adminId:string}):Promise<void>{
    await connection.query(
      `INSERT INTO aftersale_compensation_intents
        (compensation_intent_id,city_code,complaint_id,order_id,intent_type,requested_amount,currency,reason,status,provider_execution_status,proposed_by_admin_id)
       VALUES (?,?,?,?,?,?,'CNY',?,'proposed','not_executed',?)`,
      [input.id,input.cityCode,input.complaintId,input.orderId,input.intentType,input.amount,input.reason,input.adminId],
    );
  }
  async findCompensationForUpdate(connection:PoolConnection,cityCode:CityCode,id:string):Promise<AftersaleCompensationIntent|null>{
    const [rows]=await connection.query<CompensationRow[]>(`${SELECT_COMPENSATION} WHERE city_code=? AND compensation_intent_id=? LIMIT 1 FOR UPDATE`,[cityCode,id]);
    return rows[0]?mapCompensation(rows[0]):null;
  }
  async reviewCompensation(connection:PoolConnection,cityCode:CityCode,id:string,status:"approved"|"rejected",approvedAmount:number|null,adminId:string,note:string|null):Promise<void>{
    await connection.query(
      `UPDATE aftersale_compensation_intents SET status=?,approved_amount=?,decided_by_admin_id=?,decision_note=?,decided_at=CURRENT_TIMESTAMP
       WHERE city_code=? AND compensation_intent_id=? AND status='proposed'`,
      [status,approvedAmount,adminId,note,cityCode,id],
    );
  }
  async listCompensations(context:RequestContext,cityCode:CityCode,complaintId:string):Promise<AftersaleCompensationIntent[]>{
    this.requireContext(context);assertCityScopedContext(context);const where=buildCityScopedWhere(cityCode);
    const [rows]=await this.pool.query<CompensationRow[]>(`${SELECT_COMPENSATION} WHERE ${where.clause} AND complaint_id=? ORDER BY proposed_at`,[...where.params,complaintId]);
    return rows.map(mapCompensation);
  }

  async insertTimeline(connection:PoolConnection,input:{id:string;cityCode:CityCode;orderId:string;complaintId?:string|null;repairOrderId?:string|null;eventType:string;actorType:string;actorId:string|null;content:string;payload?:Record<string,unknown>}):Promise<void>{
    await connection.query(
      `INSERT INTO aftersale_timeline_events
        (timeline_event_id,city_code,order_id,complaint_id,repair_order_id,event_type,actor_type,actor_id,content,payload_json)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [input.id,input.cityCode,input.orderId,input.complaintId??null,input.repairOrderId??null,input.eventType,input.actorType,input.actorId,input.content,JSON.stringify(input.payload??{})],
    );
  }
  async listTimeline(context:RequestContext,cityCode:CityCode,complaintId:string):Promise<AftersaleTimelineEvent[]>{
    this.requireContext(context);assertCityScopedContext(context);const where=buildCityScopedWhere(cityCode);
    const [rows]=await this.pool.query<TimelineRow[]>(`${SELECT_TIMELINE} WHERE ${where.clause} AND complaint_id=? ORDER BY created_at,timeline_event_id`,[...where.params,complaintId]);
    return rows.map(mapTimeline);
  }

  async getDetail(context:RequestContext,cityCode:CityCode,complaintId:string):Promise<AftersaleComplaintDetail|null>{
    const complaint=await this.findComplaint(context,cityCode,complaintId);if(!complaint)return null;
    const [repairOrders,liabilityDecision,compensationIntents,timeline]=await Promise.all([
      this.listRepairsByComplaint(context,cityCode,complaintId),
      this.findLiability(context,cityCode,complaintId),
      this.listCompensations(context,cityCode,complaintId),
      this.listTimeline(context,cityCode,complaintId),
    ]);
    return {complaint,repairOrders,liabilityDecision,compensationIntents,timeline};
  }
}

export const aftersaleCaseRepository = new AftersaleCaseRepository();
