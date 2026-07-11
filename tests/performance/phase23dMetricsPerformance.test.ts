import { afterEach, describe, expect, it } from "vitest";
import {
  MAX_HTTP_METRIC_SERIES,
  recordHttpRequest,
  renderPrometheusMetrics,
  resetMetricsForTests,
} from "../../backend/src/observability/metrics.js";

const RECORD_COUNT = 100_000;
const RECORD_THRESHOLD_MS = 1_500;
const RENDER_THRESHOLD_MS = 250;

function alphabeticId(index: number): string {
  let value = index;
  let output = "";
  do {
    output = String.fromCharCode(97 + value % 26) + output;
    value = Math.floor(value / 26) - 1;
  } while (value >= 0);
  return output;
}

describe("Phase 23D metric aggregation performance thresholds", () => {
  afterEach(resetMetricsForTests);

  it(`records ${RECORD_COUNT} requests within ${RECORD_THRESHOLD_MS}ms without exceeding the series ceiling`, () => {
    const started = performance.now();
    for (let index = 0; index < RECORD_COUNT; index += 1) {
      recordHttpRequest({
        method: index % 2 === 0 ? "GET" : "POST",
        routeTemplate: `/api/orders/order-${index}`,
        statusCode: index % 10 === 0 ? 500 : 200,
        durationMs: index % 25,
      });
    }
    const elapsedMs = performance.now() - started;
    const output = renderPrometheusMetrics();
    const seriesCount = output.split("\n").filter((line) => line.startsWith("xlb_http_requests_total{")).length;
    expect(elapsedMs).toBeLessThan(RECORD_THRESHOLD_MS);
    expect(seriesCount).toBeLessThanOrEqual(MAX_HTTP_METRIC_SERIES);
  });

  it(`renders the maximum bounded series set within ${RENDER_THRESHOLD_MS}ms`, () => {
    for (let index = 0; index < MAX_HTTP_METRIC_SERIES * 2; index += 1) {
      recordHttpRequest({ method: "GET", routeTemplate: `/route-${alphabeticId(index)}`, statusCode: 200, durationMs: 1 });
    }
    const started = performance.now();
    const output = renderPrometheusMetrics();
    const elapsedMs = performance.now() - started;
    const seriesCount = output.split("\n").filter((line) => line.startsWith("xlb_http_requests_total{")).length;
    expect(elapsedMs).toBeLessThan(RENDER_THRESHOLD_MS);
    expect(seriesCount).toBe(MAX_HTTP_METRIC_SERIES);
    expect(output).toContain("xlb_http_request_duration_ms_count");
  });
});
