/** Phase 5A DLQ skeleton — city-scoped dead-letter stream naming only */

import { getDispatchStreamName } from "./cityStreamNames.js";

export function getDispatchDlqStreamName(cityCode: string): string {
  return `${getDispatchStreamName(cityCode)}:dlq`;
}
