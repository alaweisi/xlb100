import { describe, it, expect } from "vitest";
import { serviceCategorySchema, serviceSkuSchema } from "@xlb/validators";

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
});
