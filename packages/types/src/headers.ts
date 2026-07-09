/** XLB standard request headers */
export const XLB_HEADERS = {
  traceId: "x-xlb-trace-id",
  cityCode: "x-xlb-city-code",
} as const;

export type XlbHeaderName = (typeof XLB_HEADERS)[keyof typeof XLB_HEADERS];
