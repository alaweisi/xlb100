import { describe, it, expect } from "vitest";
import {
  serviceCategorySchema,
  serviceSkuProfileSchema,
  serviceSkuSchema,
  serviceStandardSchema,
} from "@xlb/validators";

describe("catalog contract", () => {
  it("ServiceCategory requires cityCode", () => {
    const result = serviceCategorySchema.safeParse({
      categoryId: "demo_cleaning_category",
      name: "Demo",
      sortOrder: 1,
      isEnabled: true,
    });
    expect(result.success).toBe(false);
  });

  it("rejects __global__ cityCode", () => {
    const result = serviceSkuSchema.safeParse({
      skuId: "demo_cleaning_sku",
      itemId: "demo_cleaning_item",
      cityCode: "__global__",
      name: "Demo",
      unit: "次",
      sortOrder: 1,
      isEnabled: true,
    });
    expect(result.success).toBe(false);
  });

  it("accepts Phase 16 SKU profile and service standards", () => {
    const profile = serviceSkuProfileSchema.safeParse({
      skuId: "sku_aircon_install",
      cityCode: "hangzhou",
      serviceMode: "installation",
      brandScope: "appliance_or_device_brand",
      modelScope: "brand_model_or_size_required_when_available",
      skillLevel: "advanced",
      warrantyDays: 90,
      requiresModel: true,
      requiresMeasurement: false,
      supportsEnterprise: true,
      serviceGuaranteeText: "安装前核验型号与现场条件，完工后交付验收标准",
    });
    expect(profile.success).toBe(true);

    const standard = serviceStandardSchema.safeParse({
      standardId: "std_1",
      skuId: "sku_aircon_install",
      cityCode: "hangzhou",
      standardType: "installation",
      title: "作业标准",
      content: "按产品安装要求完成固定、调试、清洁和安全检查。",
      sortOrder: 20,
      isRequired: true,
      isEnabled: true,
    });
    expect(standard.success).toBe(true);
  });
});
