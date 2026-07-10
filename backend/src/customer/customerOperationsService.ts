import { randomUUID } from "node:crypto";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import type { CustomerAddress, CustomerProfile, RequestContext } from "@xlb/types";
import { saveCustomerAddressSchema, updateCustomerProfileSchema } from "@xlb/validators";
import { assertCityScopedContext } from "../dal/scopedExecutor.js";
import { getMysqlPool } from "../dal/mysqlPool.js";

type ProfileRow = RowDataPacket & {
  id: string;
  phone: string;
  name: string | null;
  avatar_url: string | null;
  default_city_code: string | null;
  updated_at: Date | string;
};

type AddressRow = RowDataPacket & {
  address_id: string;
  customer_id: string;
  city_code: string;
  contact_name: string;
  contact_phone: string;
  province: string;
  city: string;
  district: string;
  detail_address: string;
  is_default: number;
  created_at: Date | string;
  updated_at: Date | string;
};

export class CustomerOperationsError extends Error {
  constructor(message: string, readonly statusCode: number) {
    super(message);
    this.name = "CustomerOperationsError";
  }
}

function requireCustomer(context: RequestContext): { customerId: string; cityCode: string } {
  if (context.appType !== "customer" || context.role !== "customer" || !context.userId) {
    throw new CustomerOperationsError("Customer operations require the authenticated customer app", 403);
  }
  return { customerId: context.userId, cityCode: assertCityScopedContext(context) };
}

function iso(value: Date | string): string {
  return new Date(value).toISOString();
}

function maskPhone(phone: string): string {
  return phone.length >= 7 ? `${phone.slice(0, 3)}****${phone.slice(-4)}` : "****";
}

function mapProfile(row: ProfileRow): CustomerProfile {
  return {
    customerId: row.id,
    phoneMasked: maskPhone(row.phone),
    name: row.name ?? "XLB Customer",
    avatarUrl: row.avatar_url,
    defaultCityCode: row.default_city_code as CustomerProfile["defaultCityCode"],
    updatedAt: iso(row.updated_at),
  };
}

function mapAddress(row: AddressRow): CustomerAddress {
  return {
    addressId: row.address_id,
    customerId: row.customer_id,
    cityCode: row.city_code as CustomerAddress["cityCode"],
    contactName: row.contact_name,
    contactPhoneMasked: maskPhone(row.contact_phone),
    province: row.province,
    city: row.city,
    district: row.district,
    detailAddress: row.detail_address,
    isDefault: Boolean(row.is_default),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

export class CustomerOperationsService {
  async getProfile(context: RequestContext): Promise<CustomerProfile> {
    const { customerId } = requireCustomer(context);
    const [rows] = await getMysqlPool().query<ProfileRow[]>(
      "SELECT id,phone,name,avatar_url,default_city_code,updated_at FROM customers WHERE id=?",
      [customerId],
    );
    if (!rows[0]) throw new CustomerOperationsError("Customer not found", 404);
    return mapProfile(rows[0]);
  }

  async updateProfile(context: RequestContext, input: unknown): Promise<CustomerProfile> {
    const { customerId, cityCode } = requireCustomer(context);
    const parsed = updateCustomerProfileSchema.safeParse(input);
    if (!parsed.success) throw new CustomerOperationsError(parsed.error.message, 400);
    if (parsed.data.defaultCityCode && parsed.data.defaultCityCode !== cityCode) {
      throw new CustomerOperationsError("defaultCityCode must match request city scope", 403);
    }
    const result = await getMysqlPool().query<ResultSetHeader>(
      "UPDATE customers SET name=?,default_city_code=? WHERE id=?",
      [parsed.data.name, parsed.data.defaultCityCode ?? cityCode, customerId],
    );
    if (result[0].affectedRows !== 1) throw new CustomerOperationsError("Customer not found", 404);
    return this.getProfile(context);
  }

  async listAddresses(context: RequestContext): Promise<CustomerAddress[]> {
    const { customerId, cityCode } = requireCustomer(context);
    const [rows] = await getMysqlPool().query<AddressRow[]>(
      `SELECT * FROM customer_addresses
       WHERE customer_id=? AND city_code=?
       ORDER BY is_default DESC,updated_at DESC,address_id`,
      [customerId, cityCode],
    );
    return rows.map(mapAddress);
  }

  async createAddress(context: RequestContext, input: unknown): Promise<CustomerAddress> {
    const { customerId, cityCode } = requireCustomer(context);
    const parsed = saveCustomerAddressSchema.safeParse(input);
    if (!parsed.success) throw new CustomerOperationsError(parsed.error.message, 400);
    const connection = await getMysqlPool().getConnection();
    const addressId = `addr_${randomUUID()}`;
    try {
      await connection.beginTransaction();
      const [existing] = await connection.query<(RowDataPacket & { address_id: string })[]>(
        "SELECT address_id FROM customer_addresses WHERE customer_id=? AND city_code=? AND idempotency_key=? FOR UPDATE",
        [customerId, cityCode, parsed.data.idempotencyKey],
      );
      if (existing[0]) {
        await connection.commit();
        return this.getAddress(context, existing[0].address_id);
      }
      const [countRows] = await connection.query<(RowDataPacket & { count: number })[]>(
        "SELECT COUNT(*) count FROM customer_addresses WHERE customer_id=? AND city_code=? FOR UPDATE",
        [customerId, cityCode],
      );
      const makeDefault = parsed.data.isDefault || Number(countRows[0]?.count ?? 0) === 0;
      if (makeDefault) {
        await connection.query(
          "UPDATE customer_addresses SET is_default=0 WHERE customer_id=? AND city_code=?",
          [customerId, cityCode],
        );
      }
      await connection.query(
        `INSERT INTO customer_addresses(
          address_id,customer_id,city_code,idempotency_key,contact_name,contact_phone,province,city,district,detail_address,is_default
        ) VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
        [addressId, customerId, cityCode, parsed.data.idempotencyKey, parsed.data.contactName, parsed.data.contactPhone,
          parsed.data.province, parsed.data.city, parsed.data.district, parsed.data.detailAddress, makeDefault ? 1 : 0],
      );
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      if ((error as { code?: string }).code === "ER_DUP_ENTRY") {
        const [rows] = await getMysqlPool().query<(RowDataPacket & { address_id: string })[]>(
          "SELECT address_id FROM customer_addresses WHERE customer_id=? AND city_code=? AND idempotency_key=?",
          [customerId, cityCode, parsed.data.idempotencyKey],
        );
        if (rows[0]) return this.getAddress(context, rows[0].address_id);
      }
      throw error;
    } finally {
      connection.release();
    }
    return this.getAddress(context, addressId);
  }

  async updateAddress(context: RequestContext, addressId: string, input: unknown): Promise<CustomerAddress> {
    const { customerId, cityCode } = requireCustomer(context);
    const parsed = saveCustomerAddressSchema.safeParse(input);
    if (!parsed.success) throw new CustomerOperationsError(parsed.error.message, 400);
    const connection = await getMysqlPool().getConnection();
    try {
      await connection.beginTransaction();
      if (parsed.data.isDefault) {
        await connection.query(
          "UPDATE customer_addresses SET is_default=0 WHERE customer_id=? AND city_code=?",
          [customerId, cityCode],
        );
      }
      const [result] = await connection.query<ResultSetHeader>(
        `UPDATE customer_addresses SET contact_name=?,contact_phone=?,province=?,city=?,district=?,detail_address=?,
         is_default=IF(?,1,is_default) WHERE address_id=? AND customer_id=? AND city_code=?`,
        [parsed.data.contactName, parsed.data.contactPhone, parsed.data.province, parsed.data.city,
          parsed.data.district, parsed.data.detailAddress, parsed.data.isDefault ? 1 : 0,
          addressId, customerId, cityCode],
      );
      if (result.affectedRows !== 1) throw new CustomerOperationsError("Address not found", 404);
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
    return this.getAddress(context, addressId);
  }

  async deleteAddress(context: RequestContext, addressId: string): Promise<{ addressId: string; deleted: true }> {
    const { customerId, cityCode } = requireCustomer(context);
    const [result] = await getMysqlPool().query<ResultSetHeader>(
      "DELETE FROM customer_addresses WHERE address_id=? AND customer_id=? AND city_code=?",
      [addressId, customerId, cityCode],
    );
    if (result.affectedRows !== 1) throw new CustomerOperationsError("Address not found", 404);
    return { addressId, deleted: true };
  }

  private async getAddress(context: RequestContext, addressId: string): Promise<CustomerAddress> {
    const { customerId, cityCode } = requireCustomer(context);
    const [rows] = await getMysqlPool().query<AddressRow[]>(
      "SELECT * FROM customer_addresses WHERE address_id=? AND customer_id=? AND city_code=?",
      [addressId, customerId, cityCode],
    );
    if (!rows[0]) throw new CustomerOperationsError("Address not found", 404);
    return mapAddress(rows[0]);
  }
}

export const customerOperationsService = new CustomerOperationsService();
