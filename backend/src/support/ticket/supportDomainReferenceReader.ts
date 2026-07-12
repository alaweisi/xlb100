import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import type { CityCode } from "@xlb/types";

/**
 * Explicit SELECT-only anti-corruption boundary for Support references.
 * This reader validates locked-domain facts and never imports or mutates their repositories.
 */
export class SupportDomainReferenceReader {
  async loadOwnedOrder(connection: PoolConnection, input: {
    cityCode: CityCode;
    orderId: string;
    source: "customer" | "worker";
    requesterId: string;
  }): Promise<{ orderId: string; customerId: string; workerId: string | null } | null> {
    const ownership = input.source === "customer" ? "o.customer_id=?" : "f.worker_id=?";
    const join = input.source === "worker"
      ? "INNER JOIN fulfillments f ON f.city_code=o.city_code AND f.order_id=o.order_id"
      : "LEFT JOIN fulfillments f ON f.city_code=o.city_code AND f.order_id=o.order_id";
    const [rows] = await connection.query<(RowDataPacket & {
      order_id: string; customer_id: string; worker_id: string | null;
    })[]>(
      `SELECT o.order_id,o.customer_id,MAX(f.worker_id) AS worker_id
       FROM orders o ${join}
       WHERE o.city_code=? AND o.order_id=? AND ${ownership}
       GROUP BY o.order_id,o.customer_id LIMIT 1`,
      [input.cityCode, input.orderId, input.requesterId],
    );
    return rows[0]
      ? { orderId: rows[0].order_id, customerId: rows[0].customer_id, workerId: rows[0].worker_id }
      : null;
  }

  async loadComplaint(connection: PoolConnection, input: {
    cityCode: CityCode;
    complaintId: string;
    orderId: string;
    customerId?: string;
  }): Promise<{ complaintId: string; orderId: string; customerId: string; status: string } | null> {
    const params: unknown[] = [input.cityCode, input.orderId, input.complaintId];
    const ownerClause = input.customerId ? " AND customer_id=?" : "";
    if (input.customerId) params.push(input.customerId);
    const [rows] = await connection.query<(RowDataPacket & {
      complaint_id: string; order_id: string; customer_id: string; status: string;
    })[]>(
      `SELECT complaint_id,order_id,customer_id,status FROM aftersale_complaints
       WHERE city_code=? AND order_id=? AND complaint_id=?${ownerClause}
       LIMIT 1`,
      params,
    );
    return rows[0]
      ? { complaintId: rows[0].complaint_id, orderId: rows[0].order_id,
          customerId: rows[0].customer_id, status: rows[0].status }
      : null;
  }

  async hasEnabledWorkerBinding(
    connection: PoolConnection,
    cityCode: CityCode,
    workerId: string,
  ): Promise<boolean> {
    const [rows] = await connection.query<RowDataPacket[]>(
      `SELECT worker_id FROM worker_city_bindings
       WHERE worker_id=? AND city_code=? AND is_enabled=1 LIMIT 1`,
      [workerId, cityCode],
    );
    return Boolean(rows[0]);
  }

  async isAssignableAgent(
    connection: PoolConnection,
    cityCode: CityCode,
    adminUserId: string,
  ): Promise<boolean> {
    const [rows] = await connection.query<RowDataPacket[]>(
      `SELECT au.id FROM admin_users au
       LEFT JOIN admin_city_scopes acs
         ON acs.admin_user_id=au.id AND acs.city_code=?
       WHERE au.id=? AND (
         au.role='admin' OR (au.role='operator' AND acs.admin_user_id IS NOT NULL)
       ) LIMIT 1`,
      [cityCode, adminUserId],
    );
    return Boolean(rows[0]);
  }
}

export const supportDomainReferenceReader = new SupportDomainReferenceReader();
