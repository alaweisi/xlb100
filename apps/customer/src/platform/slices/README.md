# Customer Slice Foundation

This directory is the common application-owned contract layer for Customer
business slices.

- `CustomerSliceDefinition` declares route, template, guard and orchestration
  ownership. It does not contain business facts.
- `CustomerTemplateRegistry` maps bundled templates to an orchestration level.
  L1 template props cannot receive an operational Manifest.
- `CustomerFeatureRouteModule` lets a feature expose routes without mounting
  them in `App.tsx`. Final route assembly belongs to the integration window.
- `guards.ts` defines the Session, City and Protected Route assembly seam.
- `sliceState.ts` defines the shared loading, empty, error, conflict and
  unavailable boundaries.

Feature implementations own only their declared
`apps/customer/src/features/**` directories. They must not restore the retired
Customer pages or create a second SDUI runtime. Home continues to use
`apps/customer/src/platform/sdui/**`.
