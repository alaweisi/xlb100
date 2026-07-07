import type { CityCode, WorkflowActionContract, WorkflowUiBinding } from "@xlb/types";

import {
  customerWorkflowActions,
  createCustomerWorkflowBinding as createBinding,
  type CustomerWorkflowRoute,
} from "./workflowBindings";

export type CustomerRouteInput = {
  route: CustomerWorkflowRoute;
  cityCode: CityCode;
  selectedSkuId?: string;
  quoteReady?: boolean;
  submitting?: boolean;
  hasOrderIds?: boolean;
};

export function createCustomerUiBinding(input: CustomerRouteInput): WorkflowUiBinding {
  return createBinding(input);
}

export function actionByIdFromBinding(binding: WorkflowUiBinding, actionId: string): WorkflowActionContract | undefined {
  return binding.availableActions.find((action) => action.actionId === actionId);
}

export { customerWorkflowActions };

