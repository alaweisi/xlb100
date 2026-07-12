import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import type {
  CityCode,
  RequestContext,
  SupportTicket,
  SupportTicketActorType,
  SupportTicketEvent,
  SupportTicketEventType,
  SupportTicketEventVisibility,
  SupportTicketListFilters,
  SupportTicketPriority,
  SupportTicketSource,
  SupportTicketStatus,
  SupportTicketType,
} from "@xlb/types";
import { RepositoryBase } from "../../dal/repositoryBase.js";
import { assertCityScopedContext, buildCityScopedWhere } from "../../dal/scopedExecutor.js";

type TicketRow = RowDataPacket & {
  ticket_id: string;
  city_code: string;
  source: string;
  requester_id: string;
  business_client_id: string | null;
  type: string;
  priority: string;
  status: string;
  subject: string;
  description: string;
  related_order_id: string | null;
  related_worker_id: string | null;
  linked_aftersale_complaint_id: string | null;
  assigned_agent_id: string | null;
  assigned_skill_group_id: string | null;
  sla_first_response_due_at: Date | null;
  sla_resolution_due_at: Date | null;
  first_responded_at: Date | null;
  resolved_at: Date | null;
  closed_at: Date | null;
  resolution_code: string | null;
  version: number | string;
  created_at: Date;
  updated_at: Date;
};

type EventRow = RowDataPacket & {
  ticket_event_id: string;
  city_code: string;
  ticket_id: string;
  event_type: string;
  actor_type: string;
  actor_id: string | null;
  visibility: string;
  content: string | null;
  payload_json: string | Record<string, unknown>;
  created_at: Date;
};

const TICKET_COLUMNS = `ticket_id,city_code,source,requester_id,business_client_id,type,priority,
  status,subject,description,related_order_id,related_worker_id,linked_aftersale_complaint_id,
  assigned_agent_id,assigned_skill_group_id,sla_first_response_due_at,sla_resolution_due_at,
  first_responded_at,resolved_at,closed_at,resolution_code,version,created_at,updated_at`;
const EVENT_COLUMNS = `ticket_event_id,city_code,ticket_id,event_type,actor_type,actor_id,visibility,
  content,payload_json,created_at`;

function mapTicket(row: TicketRow): SupportTicket {
  return {
    ticketId: row.ticket_id,
    cityCode: row.city_code as CityCode,
    source: row.source as SupportTicketSource,
    requesterId: row.requester_id,
    businessClientId: row.business_client_id,
    type: row.type as SupportTicketType,
    priority: row.priority as SupportTicketPriority,
    status: row.status as SupportTicketStatus,
    subject: row.subject,
    description: row.description,
    relatedOrderId: row.related_order_id,
    relatedWorkerId: row.related_worker_id,
    linkedAftersaleComplaintId: row.linked_aftersale_complaint_id,
    assignedAgentId: row.assigned_agent_id,
    assignedSkillGroupId: row.assigned_skill_group_id,
    slaFirstResponseDueAt: row.sla_first_response_due_at?.toISOString() ?? null,
    slaResolutionDueAt: row.sla_resolution_due_at?.toISOString() ?? null,
    firstRespondedAt: row.first_responded_at?.toISOString() ?? null,
    resolvedAt: row.resolved_at?.toISOString() ?? null,
    closedAt: row.closed_at?.toISOString() ?? null,
    resolutionCode: row.resolution_code,
    version: Number(row.version),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function mapEvent(row: EventRow): SupportTicketEvent {
  return {
    ticketEventId: row.ticket_event_id,
    cityCode: row.city_code as CityCode,
    ticketId: row.ticket_id,
    eventType: row.event_type as SupportTicketEventType,
    actorType: row.actor_type as SupportTicketActorType,
    actorId: row.actor_id,
    visibility: row.visibility as SupportTicketEventVisibility,
    content: row.content,
    payload: typeof row.payload_json === "string"
      ? JSON.parse(row.payload_json) as Record<string, unknown>
      : row.payload_json,
    createdAt: row.created_at.toISOString(),
  };
}

export type TicketCursor = { createdAt: string; ticketId: string };

export class SupportTicketRepository extends RepositoryBase {
  constructor(pool?: Pool) {
    super(pool);
  }

  async findByCreateIdempotencyForUpdate(
    connection: PoolConnection,
    cityCode: CityCode,
    source: SupportTicketSource,
    requesterId: string,
    idempotencyKey: string,
  ): Promise<SupportTicket | null> {
    const [rows] = await connection.query<TicketRow[]>(
      `SELECT ${TICKET_COLUMNS} FROM support_tickets
       WHERE city_code=? AND source=? AND requester_id=? AND idempotency_key=?
       LIMIT 1 FOR UPDATE`,
      [cityCode, source, requesterId, idempotencyKey],
    );
    return rows[0] ? mapTicket(rows[0]) : null;
  }

  async findForUpdate(
    connection: PoolConnection,
    cityCode: CityCode,
    ticketId: string,
  ): Promise<SupportTicket | null> {
    const [rows] = await connection.query<TicketRow[]>(
      `SELECT ${TICKET_COLUMNS} FROM support_tickets
       WHERE city_code=? AND ticket_id=? LIMIT 1 FOR UPDATE`,
      [cityCode, ticketId],
    );
    return rows[0] ? mapTicket(rows[0]) : null;
  }

  async insertTicket(connection: PoolConnection, input: {
    ticketId: string;
    cityCode: CityCode;
    source: SupportTicketSource;
    requesterId: string;
    type: SupportTicketType;
    priority: SupportTicketPriority;
    subject: string;
    description: string;
    relatedOrderId: string | null;
    relatedWorkerId: string | null;
    linkedAftersaleComplaintId: string | null;
    idempotencyKey: string;
  }): Promise<void> {
    await connection.query(
      `INSERT INTO support_tickets
        (ticket_id,city_code,source,requester_id,type,priority,status,subject,description,
         related_order_id,related_worker_id,linked_aftersale_complaint_id,idempotency_key)
       VALUES (?,?,?,?,?,?,'open',?,?,?,?,?,?)`,
      [input.ticketId, input.cityCode, input.source, input.requesterId, input.type, input.priority,
        input.subject, input.description, input.relatedOrderId, input.relatedWorkerId,
        input.linkedAftersaleComplaintId, input.idempotencyKey],
    );
  }

  async findEventByIdempotencyForUpdate(
    connection: PoolConnection,
    cityCode: CityCode,
    ticketId: string,
    idempotencyKey: string,
  ): Promise<SupportTicketEvent | null> {
    const [rows] = await connection.query<EventRow[]>(
      `SELECT ${EVENT_COLUMNS} FROM support_ticket_events
       WHERE city_code=? AND ticket_id=? AND idempotency_key=? LIMIT 1 FOR UPDATE`,
      [cityCode, ticketId, idempotencyKey],
    );
    return rows[0] ? mapEvent(rows[0]) : null;
  }

  async insertEvent(connection: PoolConnection, input: {
    ticketEventId: string;
    cityCode: CityCode;
    ticketId: string;
    eventType: SupportTicketEventType;
    actorType: SupportTicketActorType;
    actorId: string | null;
    visibility: SupportTicketEventVisibility;
    content: string | null;
    payload: Record<string, unknown>;
    idempotencyKey: string;
  }): Promise<void> {
    await connection.query(
      `INSERT INTO support_ticket_events
        (ticket_event_id,city_code,ticket_id,event_type,actor_type,actor_id,visibility,
         content,payload_json,idempotency_key)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [input.ticketEventId, input.cityCode, input.ticketId, input.eventType, input.actorType,
        input.actorId, input.visibility, input.content, JSON.stringify(input.payload), input.idempotencyKey],
    );
  }

  async findEventById(
    connection: PoolConnection,
    cityCode: CityCode,
    ticketEventId: string,
  ): Promise<SupportTicketEvent> {
    const [rows] = await connection.query<EventRow[]>(
      `SELECT ${EVENT_COLUMNS} FROM support_ticket_events
       WHERE city_code=? AND ticket_event_id=? LIMIT 1`,
      [cityCode, ticketEventId],
    );
    if (!rows[0]) throw new Error("support ticket event insert was not visible");
    return mapEvent(rows[0]);
  }

  async updateAssignmentCas(connection: PoolConnection, input: {
    cityCode: CityCode; ticketId: string; assignedAgentId: string; status: SupportTicketStatus;
    expectedVersion: number;
  }): Promise<boolean> {
    const [result] = await connection.query<ResultSetHeader>(
      `UPDATE support_tickets SET assigned_agent_id=?,status=?,version=version+1
       WHERE city_code=? AND ticket_id=? AND version=?`,
      [input.assignedAgentId, input.status, input.cityCode, input.ticketId, input.expectedVersion],
    );
    return result.affectedRows === 1;
  }

  async updateStatusCas(connection: PoolConnection, input: {
    cityCode: CityCode;
    ticketId: string;
    status: SupportTicketStatus;
    expectedVersion: number;
    resolutionCode?: string | null;
  }): Promise<boolean> {
    const resolved = input.status === "resolved" ? ",resolved_at=CURRENT_TIMESTAMP(3)" : "";
    const reopened = input.status === "processing" ? ",resolved_at=NULL,resolution_code=NULL,closed_at=NULL" : "";
    const closed = input.status === "closed" ? ",closed_at=CURRENT_TIMESTAMP(3)" : "";
    const [result] = await connection.query<ResultSetHeader>(
      `UPDATE support_tickets SET status=?,resolution_code=COALESCE(?,resolution_code),version=version+1
       ${resolved}${reopened}${closed}
       WHERE city_code=? AND ticket_id=? AND version=?`,
      [input.status, input.resolutionCode ?? null, input.cityCode, input.ticketId, input.expectedVersion],
    );
    return result.affectedRows === 1;
  }

  async markFirstResponse(connection: PoolConnection, input: {
    cityCode: CityCode; ticketId: string; expectedVersion: number;
  }): Promise<boolean> {
    const [result] = await connection.query<ResultSetHeader>(
      `UPDATE support_tickets SET first_responded_at=CURRENT_TIMESTAMP(3),version=version+1
       WHERE city_code=? AND ticket_id=? AND version=? AND first_responded_at IS NULL`,
      [input.cityCode, input.ticketId, input.expectedVersion],
    );
    return result.affectedRows === 1;
  }

  async findTicket(
    context: RequestContext,
    cityCode: CityCode,
    ticketId: string,
    requester?: { source: "customer" | "worker"; requesterId: string },
  ): Promise<SupportTicket | null> {
    this.requireContext(context);
    assertCityScopedContext(context);
    const where = buildCityScopedWhere(cityCode);
    const params: unknown[] = [...where.params, ticketId];
    let owner = "";
    if (requester) {
      owner = " AND source=? AND requester_id=?";
      params.push(requester.source, requester.requesterId);
    }
    const [rows] = await this.pool.query<TicketRow[]>(
      `SELECT ${TICKET_COLUMNS} FROM support_tickets
       WHERE ${where.clause} AND ticket_id=?${owner} LIMIT 1`,
      params,
    );
    return rows[0] ? mapTicket(rows[0]) : null;
  }

  async listTickets(
    context: RequestContext,
    cityCode: CityCode,
    filters: SupportTicketListFilters,
    limit: number,
    cursor: TicketCursor | null,
    requester?: { source: "customer" | "worker"; requesterId: string },
  ): Promise<SupportTicket[]> {
    this.requireContext(context);
    assertCityScopedContext(context);
    const where = buildCityScopedWhere(cityCode);
    const clauses = [where.clause];
    const params: unknown[] = [...where.params];
    if (requester) {
      clauses.push("source=?", "requester_id=?");
      params.push(requester.source, requester.requesterId);
    }
    const mappings: [keyof SupportTicketListFilters, string][] = [
      ["source", "source"], ["type", "type"], ["priority", "priority"], ["status", "status"],
      ["requesterId", "requester_id"], ["relatedOrderId", "related_order_id"],
      ["assignedAgentId", "assigned_agent_id"],
    ];
    for (const [key, column] of mappings) {
      const value = filters[key];
      if (typeof value === "string" && value) {
        clauses.push(`${column}=?`);
        params.push(value);
      }
    }
    if (cursor) {
      clauses.push("(created_at < ? OR (created_at = ? AND ticket_id < ?))");
      const at = new Date(cursor.createdAt);
      params.push(at, at, cursor.ticketId);
    }
    params.push(limit);
    const [rows] = await this.pool.query<TicketRow[]>(
      `SELECT ${TICKET_COLUMNS} FROM support_tickets
       WHERE ${clauses.join(" AND ")}
       ORDER BY created_at DESC,ticket_id DESC LIMIT ?`,
      params,
    );
    return rows.map(mapTicket);
  }

  async listEvents(
    context: RequestContext,
    cityCode: CityCode,
    ticketId: string,
    requesterVisibleOnly: boolean,
  ): Promise<SupportTicketEvent[]> {
    this.requireContext(context);
    assertCityScopedContext(context);
    const where = buildCityScopedWhere(cityCode);
    const visibility = requesterVisibleOnly ? " AND visibility IN ('requester','all')" : "";
    const [rows] = await this.pool.query<EventRow[]>(
      `SELECT ${EVENT_COLUMNS} FROM support_ticket_events
       WHERE ${where.clause} AND ticket_id=?${visibility}
       ORDER BY created_at ASC,ticket_event_id ASC LIMIT 500`,
      [...where.params, ticketId],
    );
    return rows.map(mapEvent);
  }
}

export const supportTicketRepository = new SupportTicketRepository();
