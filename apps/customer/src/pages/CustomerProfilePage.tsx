import type { CityCode } from "@xlb/types";
import { Button, CustomerAnswerCard, CustomerProfileTemplate, ErrorState } from "@xlb/ui";
import { createCustomerUiBinding } from "../adapters/workflowAdapter";
import { UatDebugPanel } from "./customerPageShell";

export interface CustomerProfilePageProps {
  cityCode: CityCode;
}

export function CustomerProfilePage({ cityCode }: CustomerProfilePageProps) {
  const binding = createCustomerUiBinding({ route: "profile", cityCode });
  const forbiddenClaims = binding.notWiredPolicy?.forbiddenClaims ?? ["profile not wired"];

  return (
    <CustomerProfileTemplate route="/customer/profile" cityCode={cityCode} binding={binding}>
      <ErrorState
        title="Profile not yet wired"
        description="Profile, address and auth endpoints are not yet connected in this stage."
        action={<Button type="button" onClick={() => (window.location.href = "/customer/")}>Back to home</Button>}
      />
      <CustomerAnswerCard state={binding.state} />
      <ul style={{ color: "#6b7280", fontSize: 13, lineHeight: "20px", margin: 0, paddingLeft: 20 }}>
        {forbiddenClaims.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <UatDebugPanel
        binding={binding}
        facts={[
          { label: "city_code", value: cityCode },
          { label: "workflow state", value: binding.state },
          { label: "availableActions", value: binding.availableActions },
          { label: "disabledReason", value: binding.disabledReasons },
        ]}
      />
    </CustomerProfileTemplate>
  );
}
