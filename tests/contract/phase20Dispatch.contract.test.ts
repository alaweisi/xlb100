import { describe,expect,it } from "vitest";
import { upsertWorkerLocationSchema } from "@xlb/validators";

const valid={latitude:30.2741,longitude:120.1551,accuracyMeters:10,capturedAt:"2026-07-10T00:00:00.000Z",serviceRadiusKm:10,locationSharingEnabled:true};
describe("Phase 20 location contract",()=>{
  it("accepts bounded exact worker location input",()=>expect(upsertWorkerLocationSchema.safeParse(valid).success).toBe(true));
  it("rejects invalid coordinates, accuracy, and radius",()=>{expect(upsertWorkerLocationSchema.safeParse({...valid,latitude:91}).success).toBe(false);expect(upsertWorkerLocationSchema.safeParse({...valid,accuracyMeters:6000}).success).toBe(false);expect(upsertWorkerLocationSchema.safeParse({...valid,serviceRadiusKm:51}).success).toBe(false);});
  it("rejects caller-supplied worker or city identity",()=>expect(upsertWorkerLocationSchema.safeParse({...valid,workerId:"forged",cityCode:"shanghai"}).success).toBe(false));
});
