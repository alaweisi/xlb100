import { describe,expect,it } from "vitest";
import { LocalMockGeoProvider } from "../../backend/src/dispatch/geoProvider.js";

describe("Phase 20 local geo provider",()=>{
  const provider=new LocalMockGeoProvider();
  it("deterministically geocodes without an external provider",async()=>{expect(await provider.geocode("hangzhou","same address")).toEqual(await provider.geocode("hangzhou","same address"));});
  it("returns an honest local/mock route envelope",async()=>{expect(await provider.route({latitude:30.2741,longitude:120.1551},{latitude:30.2841,longitude:120.1551})).toMatchObject({provider:"local_mock",providerStatus:"calculated_mock",externalProviderExecuted:false,algorithm:"haversine_local_v1"});});
  it("calculates deterministic distance and ETA",async()=>{const first=await provider.route({latitude:30,longitude:120},{latitude:30.01,longitude:120});const second=await provider.route({latitude:30,longitude:120},{latitude:30.01,longitude:120});expect(first.distanceKm).toBe(second.distanceKm);expect(first.etaMinutes).toBeGreaterThan(0);});
});
