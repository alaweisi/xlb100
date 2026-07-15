import { createHash, randomUUID } from "node:crypto";
import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import type { RequestContext } from "@xlb/types";
import { withTransaction } from "../../dal/transaction.js";
import { eventOutboxRepository } from "../../events/eventOutbox.js";
import { generateEventId } from "../../events/eventIds.js";
export class SupportQualityError extends Error {
  constructor(
    message: string,
    readonly statusCode = 400,
  ) {
    super(message);
  }
}
const hash = (v: unknown) =>
  createHash("sha256").update(JSON.stringify(v)).digest("hex");
function base(ctx: RequestContext) {
  if (!ctx.cityCode || ctx.cityCode === "__global__" || !ctx.userId)
    throw new SupportQualityError("real city and identity required", 403);
  return { city: ctx.cityCode, user: ctx.userId };
}
function requester(ctx: RequestContext) {
  const i = base(ctx);
  if (ctx.appType === "customer" && ctx.role === "customer")
    return { ...i, type: "customer" };
  if (ctx.appType === "worker" && ctx.role === "worker")
    return { ...i, type: "worker" };
  throw new SupportQualityError("requester role required", 403);
}
async function admin(ctx: RequestContext, c: PoolConnection) {
  const i = base(ctx);
  if (ctx.appType !== "admin" || ctx.role !== "admin")
    throw new SupportQualityError("admin role required", 403);
  const [r] = await c.query<RowDataPacket[]>(
    `SELECT 1 FROM admin_city_scopes WHERE admin_user_id=? AND city_code=? LIMIT 1`,
    [i.user, i.city],
  );
  if (!r[0]) throw new SupportQualityError("explicit city scope required", 403);
  return i;
}
const body = (v: unknown) => {
  if (!v || typeof v !== "object" || Array.isArray(v))
    throw new SupportQualityError("object body required");
  return v as Record<string, unknown>;
};

type ExistingCsatRow = RowDataPacket & {
  request_fingerprint: string;
};

type TicketCsatTargetRow = RowDataPacket & {
  closed_at: Date;
  related_worker_id: string | null;
  assigned_agent_id: string | null;
  assigned_skill_group_id: string | null;
};

type ConversationCsatTargetRow = RowDataPacket & {
  closed_at: Date;
  assigned_agent_id: string | null;
};

type RubricCriterion = {
  key: string;
  weight: number;
  maxScore?: number;
};

type RubricVersionRow = RowDataPacket & {
  criteria_json: string | RubricCriterion[];
  content_hash: string;
};

type ReviewedTargetRow = RowDataPacket & {
  a: string | null;
};

type CsatDashboardRow = RowDataPacket & {
  response_count: number | string;
  average_score: number | string;
  score_1: number | string;
  score_2: number | string;
  score_3: number | string;
  score_4: number | string;
  score_5: number | string;
};

type ReviewDashboardRow = RowDataPacket & {
  review_count: number | string;
  average_review_score: number | string;
};

export class SupportQualityService {
  async submitCsat(
    ctx: RequestContext,
    targetType: "ticket" | "conversation",
    targetId: string,
    input: unknown,
  ) {
    const i = requester(ctx),
      b = body(input),
      score = Number(b.score),
      comment = b.comment === undefined ? null : String(b.comment).trim(),
      key = String(b.idempotencyKey ?? "");
    if (
      !Number.isInteger(score) ||
      score < 1 ||
      score > 5 ||
      (comment && comment.length > 1000) ||
      key.length < 8 ||
      key.length > 128
    )
      throw new SupportQualityError("invalid CSAT");
    const fingerprint = hash({ targetType, targetId, score, comment });
    try {
      return await withTransaction(async (c) => {
        const [old] = await c.query<ExistingCsatRow[]>(
          `SELECT * FROM support_csat_records WHERE city_code=? AND requester_type=? AND requester_id=? AND idempotency_key=? LIMIT 1 FOR UPDATE`,
          [i.city, i.type, i.user, key],
        );
        if (old[0]) {
          if (old[0].request_fingerprint !== fingerprint)
            throw new SupportQualityError(
              "idempotency key reused with different content",
              409,
            );
          return old[0];
        }
        let closedAt: Date,
          relatedWorker: string | null = null,
          agent: string | null,
          group: string | null = null;
        if (targetType === "ticket") {
          const [r] = await c.query<TicketCsatTargetRow[]>(
            `SELECT closed_at,related_worker_id,assigned_agent_id,assigned_skill_group_id FROM support_tickets WHERE city_code=? AND ticket_id=? AND source=? AND requester_id=? AND status='closed' LIMIT 1 FOR UPDATE`,
            [i.city, targetId, i.type, i.user],
          );
          if (!r[0])
            throw new SupportQualityError("closed owned target not found", 404);
          closedAt = r[0].closed_at;
          relatedWorker = r[0].related_worker_id;
          agent = r[0].assigned_agent_id;
          group = r[0].assigned_skill_group_id;
        } else {
          const [r] = await c.query<ConversationCsatTargetRow[]>(
            `SELECT closed_at,assigned_agent_id FROM support_conversations WHERE city_code=? AND conversation_id=? AND source=? AND requester_id=? AND status='closed' LIMIT 1 FOR UPDATE`,
            [i.city, targetId, i.type, i.user],
          );
          if (!r[0])
            throw new SupportQualityError("closed owned target not found", 404);
          closedAt = r[0].closed_at;
          agent = r[0].assigned_agent_id;
        }
        const csatId = `csat_${randomUUID()}`;
        await c.query(
          `INSERT INTO support_csat_records(csat_id,city_code,ticket_id,conversation_id,requester_type,requester_id,score,comment,related_worker_id,assigned_agent_admin_id,assigned_skill_group_id,closed_at_snapshot,idempotency_key,request_fingerprint) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [
            csatId,
            i.city,
            targetType === "ticket" ? targetId : null,
            targetType === "conversation" ? targetId : null,
            i.type,
            i.user,
            score,
            comment,
            relatedWorker,
            agent,
            group,
            closedAt,
            key,
            fingerprint,
          ],
        );
        await eventOutboxRepository.insertEvent(c, {
          eventId: generateEventId(),
          eventType: "support.csat.submitted",
          aggregateType: "support_csat",
          aggregateId: csatId,
          cityCode: i.city,
          payload: {
            csatId,
            cityCode: i.city,
            targetType,
            targetId,
            score,
            relatedWorkerId: relatedWorker,
            assignedAgentAdminId: agent,
          },
        });
        return {
          csatId,
          cityCode: i.city,
          targetType,
          targetId,
          score,
          comment,
        };
      });
    } catch (e) {
      const databaseError = e as { code?: string; errno?: number; cause?: { code?: string; errno?: number } };
      if (databaseError.code === "ER_DUP_ENTRY" || databaseError.errno === 1062
        || databaseError.cause?.code === "ER_DUP_ENTRY" || databaseError.cause?.errno === 1062)
        throw new SupportQualityError("target already rated", 409);
      throw e;
    }
  }
  async createRubric(ctx: RequestContext, input: unknown) {
    const b = body(input),
      name = String(b.name ?? "").trim(),
      criteria = Array.isArray(b.criteria) ? (b.criteria as RubricCriterion[]) : [];
    if (
      name.length < 1 ||
      name.length > 128 ||
      criteria.length < 1 ||
      criteria.reduce((s, x) => s + Number(x.weight), 0) !== 100
    )
      throw new SupportQualityError("invalid rubric");
    return withTransaction(async (c) => {
      const i = await admin(ctx, c),
        rubricId = `qrb_${randomUUID()}`,
        versionId = `qrv_${randomUUID()}`,
        snapshot = JSON.stringify(criteria),
        contentHash = hash(criteria);
      await c.query(
        `INSERT INTO support_quality_rubrics(rubric_id,city_code,name,status,current_version,created_by_admin_id) VALUES(?, ?, ?,'published',1,?)`,
        [rubricId, i.city, name, i.user],
      );
      await c.query(
        `INSERT INTO support_quality_rubric_versions(rubric_version_id,city_code,rubric_id,version_number,criteria_json,maximum_score,content_hash,created_by_admin_id,published_at) VALUES(?,?,?,?,?,100,?,?,CURRENT_TIMESTAMP(3))`,
        [versionId, i.city, rubricId, 1, snapshot, contentHash, i.user],
      );
      return {
        rubricId,
        rubricVersionId: versionId,
        name,
        criteria,
        contentHash,
      };
    });
  }
  async review(ctx: RequestContext, input: unknown) {
    const b = body(input),
      targetType = String(b.targetType),
      targetId = String(b.targetId),
      versionId = String(b.rubricVersionId),
      scores = body(b.criterionScores),
      key = String(b.idempotencyKey ?? "");
    return withTransaction(async (c) => {
      const i = await admin(ctx, c);
      const [rv] = await c.query<RubricVersionRow[]>(
        `SELECT criteria_json,content_hash FROM support_quality_rubric_versions WHERE city_code=? AND rubric_version_id=? AND published_at IS NOT NULL LIMIT 1 FOR UPDATE`,
        [i.city, versionId],
      );
      if (!rv[0])
        throw new SupportQualityError("published rubric not found", 404);
      const criteria: RubricCriterion[] =
        typeof rv[0].criteria_json === "string"
          ? JSON.parse(rv[0].criteria_json) as RubricCriterion[]
          : rv[0].criteria_json;
      let total = 0;
      for (const criterion of criteria) {
        const value = Number(scores[criterion.key]);
        if (
          !Number.isFinite(value) ||
          value < 0 ||
          value > Number(criterion.maxScore ?? 5)
        )
          throw new SupportQualityError("criterion score out of bounds");
        total +=
          (Number(criterion.weight) * value) / Number(criterion.maxScore ?? 5);
      }
      const reviewed =
        targetType === "ticket"
          ? (
              await c.query<ReviewedTargetRow[]>(
                `SELECT assigned_agent_id a FROM support_tickets WHERE city_code=? AND ticket_id=? AND status='closed' LIMIT 1 FOR UPDATE`,
                [i.city, targetId],
              )
            )[0][0]
          : (
              await c.query<ReviewedTargetRow[]>(
                `SELECT assigned_agent_id a FROM support_conversations WHERE city_code=? AND conversation_id=? AND status='closed' LIMIT 1 FOR UPDATE`,
                [i.city, targetId],
              )
            )[0][0];
      if (!reviewed)
        throw new SupportQualityError("closed target not found", 404);
      if (reviewed.a === i.user)
        throw new SupportQualityError("self review forbidden", 403);
      const reviewId = `qre_${randomUUID()}`;
      await c.query(
        `INSERT INTO support_quality_reviews(quality_review_id,city_code,ticket_id,conversation_id,reviewer_admin_id,reviewed_agent_admin_id,rubric_version_id,rubric_snapshot_json,rubric_content_hash,criterion_scores_json,overall_score,finding,idempotency_key,request_fingerprint) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          reviewId,
          i.city,
          targetType === "ticket" ? targetId : null,
          targetType === "conversation" ? targetId : null,
          i.user,
          reviewed.a,
          versionId,
          JSON.stringify(criteria),
          rv[0].content_hash,
          JSON.stringify(scores),
          total,
          String(b.finding ?? "") || null,
          key,
          hash({ targetType, targetId, versionId, scores }),
        ],
      );
      await eventOutboxRepository.insertEvent(c, {
        eventId: generateEventId(),
        eventType: "support.quality.reviewed",
        aggregateType: "support_quality_review",
        aggregateId: reviewId,
        cityCode: i.city,
        payload: {
          qualityReviewId: reviewId,
          cityCode: i.city,
          targetType,
          targetId,
          reviewedAgentAdminId: reviewed.a,
          overallScore: total,
          rubricVersionId: versionId,
        },
      });
      return {
        qualityReviewId: reviewId,
        overallScore: total,
        rubricSnapshot: criteria,
        rubricContentHash: rv[0].content_hash,
      };
    });
  }
  async dashboard(ctx: RequestContext) {
    return withTransaction(async (c) => {
      const i = await admin(ctx, c);
      const [r] = await c.query<CsatDashboardRow[]>(
        `SELECT COUNT(*) response_count,COALESCE(AVG(score),0) average_score,SUM(score=1) score_1,SUM(score=2) score_2,SUM(score=3) score_3,SUM(score=4) score_4,SUM(score=5) score_5 FROM support_csat_records WHERE city_code=? AND submitted_at>=CURRENT_TIMESTAMP-INTERVAL 90 DAY`,
        [i.city],
      );
      const [q] = await c.query<ReviewDashboardRow[]>(
        `SELECT COUNT(*) review_count,COALESCE(AVG(overall_score),0) average_review_score FROM support_quality_reviews WHERE city_code=? AND status='submitted' AND submitted_at>=CURRENT_TIMESTAMP-INTERVAL 90 DAY`,
        [i.city],
      );
      return { ...r[0], ...q[0] };
    });
  }
}
export const supportQualityService = new SupportQualityService();
