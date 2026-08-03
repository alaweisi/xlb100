import identityManifest from "./investorDemoIdentities.json";

type InvestorDemoIdentityManifest = Readonly<{
  cityCode: string;
  customer: Readonly<{ id: string; phone: string }>;
  worker: Readonly<{ id: string; phone: string }>;
  admin: Readonly<{
    id: string;
    username: string;
    role: "operator";
  }>;
}>;

const manifest = identityManifest as InvestorDemoIdentityManifest;

export const INVESTOR_DEMO_IDENTITIES = Object.freeze({
  cityCode: manifest.cityCode,
  customer: Object.freeze({ ...manifest.customer }),
  worker: Object.freeze({ ...manifest.worker }),
  admin: Object.freeze({ ...manifest.admin }),
});
