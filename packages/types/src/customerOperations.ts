import type { CityCode } from "./city.js";

export interface CustomerProfile {
  customerId: string;
  phoneMasked: string;
  name: string;
  avatarUrl: string | null;
  defaultCityCode: CityCode | null;
  updatedAt: string;
}

export interface CustomerAddress {
  addressId: string;
  customerId: string;
  cityCode: CityCode;
  contactName: string;
  contactPhoneMasked: string;
  province: string;
  city: string;
  district: string;
  detailAddress: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateCustomerProfileRequest {
  name: string;
  defaultCityCode?: CityCode;
}

export interface SaveCustomerAddressRequest {
  idempotencyKey: string;
  contactName: string;
  contactPhone: string;
  province: string;
  city: string;
  district: string;
  detailAddress: string;
  isDefault?: boolean;
}
