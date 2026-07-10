// @vitest-environment jsdom
import React from "react";
import { afterEach,describe,expect,it,vi } from "vitest";
import { cleanup,fireEvent,render,screen,waitFor } from "@testing-library/react";
import { CustomerProfilePage } from "../../apps/customer/src/pages/CustomerProfilePage";

describe("Customer profile operations page",()=>{
  afterEach(cleanup);
  it("loads profile and persists a new service address through the API",async()=>{
    const api={
      getProfile:vi.fn().mockResolvedValue({ok:true,profile:{customerId:"customer-a",phoneMasked:"138****0001",name:"Lin",avatarUrl:null,defaultCityCode:"hangzhou",updatedAt:"2026-07-10T00:00:00.000Z"}}),
      updateProfile:vi.fn(),
      listAddresses:vi.fn().mockResolvedValue({ok:true,addresses:[]}),
      createAddress:vi.fn().mockResolvedValue({ok:true,address:{addressId:"addr-1"}}),
      updateAddress:vi.fn(),deleteAddress:vi.fn(),
    };
    render(<CustomerProfilePage api={api} cityCode="hangzhou"/>);
    expect(await screen.findByText("138****0001")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Contact"),{target:{value:"Lin"}});
    fireEvent.change(screen.getByLabelText("Mobile"),{target:{value:"13800000001"}});
    fireEvent.change(screen.getByLabelText("District"),{target:{value:"西湖区"}});
    fireEvent.change(screen.getByLabelText("Detail address"),{target:{value:"文三路 1 号"}});
    fireEvent.click(screen.getByRole("button",{name:"Add address"}));
    await waitFor(()=>expect(api.createAddress).toHaveBeenCalledWith(expect.objectContaining({contactName:"Lin",contactPhone:"13800000001",district:"西湖区",detailAddress:"文三路 1 号"})));
  });
});
