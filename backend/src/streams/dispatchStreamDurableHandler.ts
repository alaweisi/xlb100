import type { DispatchStreamMessage } from "@xlb/types";
import type { Pool, RowDataPacket } from "mysql2/promise";
import { getMysqlPool } from "../dal/mysqlPool.js";
import type { DispatchStreamHandler } from "./dispatchStreamConsumer.js";

type DispatchTaskRow = RowDataPacket & {
  dispatch_task_id: string;
  city_code: string;
  order_id: string;
  customer_id: string;
  sku_id: string;
  amount: string;
  source_event_id: string;
};

/**
 * Redis is only a delivery accelerator. Before ACK, verify that the complete
 * dispatch projection already exists in authoritative MySQL and matches the
 * streamed payload. The check is idempotent and safe across PEL reclaim.
 */
export function createDispatchStreamDurableHandler(
  poolProvider: () => Pick<Pool, "query"> = getMysqlPool,
): DispatchStreamHandler {
  return async (message: DispatchStreamMessage) => {
    const [rows] = await poolProvider().query<DispatchTaskRow[]>(
      `SELECT dispatch_task_id,city_code,order_id,customer_id,sku_id,amount,source_event_id
       FROM dispatch_tasks
       WHERE city_code=? AND dispatch_task_id=?
       LIMIT 1`,
      [message.cityCode, message.dispatchTaskId],
    );
    const row = rows[0];
    if (!row) {
      throw new Error("authoritative dispatch task is missing");
    }
    const matches = row.dispatch_task_id === message.dispatchTaskId
      && row.city_code === message.cityCode
      && row.order_id === message.orderId
      && row.customer_id === message.customerId
      && row.sku_id === message.skuId
      && Number(row.amount) === message.amount
      && row.source_event_id === message.sourceEventId;
    if (!matches) {
      throw new Error("Redis dispatch payload does not match authoritative MySQL state");
    }
  };
}

export const dispatchStreamDurableHandler = createDispatchStreamDurableHandler();
