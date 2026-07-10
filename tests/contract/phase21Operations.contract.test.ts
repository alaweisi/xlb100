import { describe,expect,it } from "vitest";
import { saveCustomerAddressSchema,updateCustomerProfileSchema } from "@xlb/validators";

describe("Phase 21 operations contracts",()=>{
  it("accepts a scoped customer profile and address payload",()=>{
    expect(updateCustomerProfileSchema.safeParse({name:"Lin",defaultCityCode:"hangzhou"}).success).toBe(true);
    expect(saveCustomerAddressSchema.safeParse({idempotencyKey:"address-contract-1",contactName:"Lin",contactPhone:"13800000001",province:"浙江省",city:"杭州市",district:"西湖区",detailAddress:"文三路 1 号",isDefault:true}).success).toBe(true);
  });
  it("rejects malformed phone and incomplete address writes",()=>{
    expect(saveCustomerAddressSchema.safeParse({idempotencyKey:"short",contactName:"",contactPhone:"138",province:"",city:"",district:"",detailAddress:"x"}).success).toBe(false);
  });
});
