import { describe, it, expect } from "vitest";
import { getDispatchStreamName, CityStreamNameError } from "../../backend/src/streams/cityStreamNames.js";

describe("cityStreamNames", () => {
  it("getDispatchStreamName(hangzhou) returns city-scoped stream", () => {
    expect(getDispatchStreamName("hangzhou")).toBe("xlb:dispatch:hangzhou:orders");
  });

  it("rejects __global__ as dispatch cityCode", () => {
    expect(() => getDispatchStreamName("__global__")).toThrow(CityStreamNameError);
  });

  it("rejects empty cityCode", () => {
    expect(() => getDispatchStreamName("")).toThrow(CityStreamNameError);
  });

  it("rejects national stream city codes", () => {
    expect(() => getDispatchStreamName("all")).toThrow(CityStreamNameError);
    expect(() => getDispatchStreamName("global")).toThrow(CityStreamNameError);
    expect(() => getDispatchStreamName("national")).toThrow(CityStreamNameError);
  });
});
