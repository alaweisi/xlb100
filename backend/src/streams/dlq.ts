import { getDispatchStreamName } from "./cityStreamNames.js";

export function getDispatchDlqStreamName(cityCode: string): string {
  return `${getDispatchStreamName(cityCode)}:dlq`;
}

export const DEFAULT_DISPATCH_DLQ_MAX_LENGTH = 10_000;
