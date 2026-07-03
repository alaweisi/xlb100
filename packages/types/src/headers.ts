/** XLB standard request headers */
export const XLB_HEADERS = {
  traceId: "x-xlb-trace-id",
  appType: "x-xlb-app-type",
  role: "x-xlb-role",
  cityCode: "x-xlb-city-code",
  userId: "x-xlb-user-id",
} as const;

export type XlbHeaderName = (typeof XLB_HEADERS)[keyof typeof XLB_HEADERS];
