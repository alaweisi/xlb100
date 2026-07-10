// @vitest-environment jsdom
import React from "react";
import { afterEach,describe,expect,it,vi } from "vitest";
import { cleanup,fireEvent,render,screen,waitFor } from "@testing-library/react";
import { PlatformOperationsPage } from "../../apps/admin/src/pages/PlatformOperationsPage";

const mocks=vi.hoisted(()=>({
  listOperationsOrders:vi.fn(),listOperationsSkus:vi.fn(),setOperationsSkuEnabled:vi.fn(),
  listWorkerCertifications:vi.fn(),approveWorkerCertification:vi.fn(),rejectWorkerCertification:vi.fn(),
}));
vi.mock("../../apps/admin/src/adminAuth",()=>({adminOpsApi:mocks}));

describe("Admin platform operations page",()=>{
  afterEach(cleanup);
  it("loads real operation records and invokes canonical SKU and certification writes",async()=>{
    mocks.listOperationsOrders.mockResolvedValue({ok:true,orders:[{orderId:"order-1",cityCode:"hangzhou",customerId:"customer-1",skuId:"sku-1",skuName:"Cleaning",status:"pending_dispatch",totalAmount:89,scheduledAt:"2026-07-11T01:00:00.000Z",createdAt:"2026-07-10T01:00:00.000Z"}]});
    mocks.listOperationsSkus.mockResolvedValue({ok:true,skus:[{skuId:"sku-1",cityCode:"hangzhou",categoryName:"Home",itemName:"Cleaning",skuName:"Cleaning",unit:"session",isEnabled:true,basePrice:89,priceType:"fixed",warrantyDays:7,supportsEnterprise:true}]});
    mocks.listWorkerCertifications.mockResolvedValue({ok:true,certifications:[{certificationId:"cert-1",workerId:"worker-1",cityCode:"hangzhou",certType:"basic",certName:"Basic",status:"pending",submittedAt:"2026-07-10T00:00:00.000Z",reviewedAt:null,reviewerId:null,rejectReason:null,createdAt:"2026-07-10T00:00:00.000Z",updatedAt:"2026-07-10T00:00:00.000Z"}]});
    mocks.setOperationsSkuEnabled.mockResolvedValue({ok:true,sku:{skuId:"sku-1",isEnabled:false}});
    mocks.approveWorkerCertification.mockResolvedValue({ok:true,certification:{certificationId:"cert-1",status:"approved"}});
    render(<PlatformOperationsPage initialCityCode="hangzhou"/>);
    expect(await screen.findByText("order-1")).toBeTruthy();expect(screen.getAllByText("Cleaning").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button",{name:"Disable"}));
    await waitFor(()=>expect(mocks.setOperationsSkuEnabled).toHaveBeenCalledWith("sku-1",false));
    fireEvent.click(screen.getByRole("button",{name:"Approve"}));
    await waitFor(()=>expect(mocks.approveWorkerCertification).toHaveBeenCalledWith("cert-1"));
  });
});
