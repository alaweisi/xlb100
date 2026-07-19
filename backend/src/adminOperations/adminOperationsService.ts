import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import type { AdminOrderSummary, AdminSkuOperationsRow, RequestContext } from "@xlb/types";
import { AdminScopeError, assertAdminCanAccessCity } from "../dal/adminQueryGuard.js";
import { isAdminScopedRole } from "../city/cityScopeResolver.js";
import { assertCityScopedContext } from "../dal/scopedExecutor.js";
import { getMysqlPool } from "../dal/mysqlPool.js";
import { canAccessAdminOperation } from "../auth/operationsAuthorization.js";

export class AdminOperationsError extends Error {
  constructor(message: string, readonly statusCode: number) { super(message); this.name = "AdminOperationsError"; }
}

async function requireAdmin(context: RequestContext): Promise<string> {
  if (!canAccessAdminOperation(context) || !isAdminScopedRole(context.role) || !context.userId) {
    throw new AdminOperationsError("Admin operations require an authenticated admin role", 403);
  }
  const cityCode = assertCityScopedContext(context);
  try { await assertAdminCanAccessCity(context, cityCode); }
  catch (error) { if (error instanceof AdminScopeError) throw new AdminOperationsError(error.message,403); throw error; }
  return cityCode;
}

export class AdminOperationsService {
  async listOrders(context: RequestContext): Promise<AdminOrderSummary[]> {
    const cityCode = await requireAdmin(context);
    const [rows] = await getMysqlPool().query<(RowDataPacket & {
      order_id:string;city_code:string;customer_id:string;sku_id:string;sku_name:string;status:string;
      total_amount:string;scheduled_at:Date;created_at:Date;
    })[]>(`SELECT order_id,city_code,customer_id,sku_id,sku_name,status,total_amount,scheduled_at,created_at
            FROM orders WHERE city_code=? ORDER BY created_at DESC LIMIT 200`,[cityCode]);
    return rows.map(row=>({orderId:row.order_id,cityCode:row.city_code as AdminOrderSummary["cityCode"],customerId:row.customer_id,
      skuId:row.sku_id,skuName:row.sku_name,status:row.status as AdminOrderSummary["status"],totalAmount:Number(row.total_amount),
      scheduledAt:row.scheduled_at.toISOString(),createdAt:row.created_at.toISOString()}));
  }

  async listSkus(context: RequestContext): Promise<AdminSkuOperationsRow[]> {
    const cityCode = await requireAdmin(context);
    const [rows] = await getMysqlPool().query<(RowDataPacket & {
      sku_id:string;city_code:string;category_name:string;item_name:string;sku_name:string;unit:string;is_enabled:number;
      base_price:string|null;price_type:string|null;warranty_days:number|null;supports_enterprise:number|null;
    })[]>(`SELECT s.sku_id,s.city_code,c.name category_name,i.name item_name,s.name sku_name,s.unit,s.is_enabled,
                   pr.base_price,pr.price_type,p.warranty_days,p.supports_enterprise
            FROM service_skus s
            JOIN service_items i ON i.item_id=s.item_id AND i.city_code=s.city_code
            JOIN service_categories c ON c.category_id=i.category_id AND c.city_code=i.city_code
            LEFT JOIN price_rules pr ON pr.sku_id=s.sku_id AND pr.city_code=s.city_code AND pr.is_enabled=1
            LEFT JOIN service_sku_profiles p ON p.sku_id=s.sku_id AND p.city_code=s.city_code
            WHERE s.city_code=? ORDER BY c.sort_order,i.sort_order,s.sort_order,s.sku_id`,[cityCode]);
    return rows.map(row=>({skuId:row.sku_id,cityCode:row.city_code as AdminSkuOperationsRow["cityCode"],categoryName:row.category_name,
      itemName:row.item_name,skuName:row.sku_name,unit:row.unit,isEnabled:Boolean(row.is_enabled),basePrice:row.base_price===null?null:Number(row.base_price),
      priceType:row.price_type,warrantyDays:row.warranty_days,supportsEnterprise:row.supports_enterprise===null?null:Boolean(row.supports_enterprise)}));
  }

  async setSkuEnabled(context: RequestContext, skuId: string, enabled: unknown): Promise<{skuId:string;isEnabled:boolean}> {
    const cityCode = await requireAdmin(context);
    if (typeof enabled !== "boolean") throw new AdminOperationsError("enabled must be boolean",400);
    const [result] = await getMysqlPool().query<ResultSetHeader>("UPDATE service_skus SET is_enabled=? WHERE sku_id=? AND city_code=?",[enabled?1:0,skuId,cityCode]);
    if (result.affectedRows!==1) throw new AdminOperationsError("SKU not found",404);
    return {skuId,isEnabled:enabled};
  }
}

export const adminOperationsService=new AdminOperationsService();
