import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../../backend/src/app.js";
import {
  HTTP_METRIC_LABEL_NAMES,
  MAX_HTTP_METRIC_SERIES,
  recordHttpRequest,
  renderPrometheusMetrics,
  resetMetricsForTests,
} from "../../backend/src/observability/metrics.js";

function requestSeries(output: string): string[] {
  return output.split("\n").filter((line) => line.startsWith("xlb_http_requests_total{"));
}

function alphabeticId(index: number): string {
  let value = index;
  let output = "";
  do {
    output = String.fromCharCode(97 + value % 26) + output;
    value = Math.floor(value / 26) - 1;
  } while (value >= 0);
  return output;
}

describe("Phase 23D HTTP metric cardinality", () => {
  afterEach(resetMetricsForTests);

  it("collapses caller-controlled 404 URLs before metrics export", async () => {
    const app = await buildApp();
    try {
      for (let index = 0; index < 100; index += 1) {
        const response = await app.inject({
          method: "GET",
          url: `/not-registered/${crypto.randomUUID()}?cityCode=hangzhou&orderId=${index}`,
        });
        expect(response.statusCode).toBe(404);
      }

      const output = renderPrometheusMetrics();
      expect(output).toContain('xlb_http_requests_total{method="GET",route="__unmatched__",status="4xx"} 100');
      expect(requestSeries(output)).toHaveLength(1);
      expect(output).not.toContain("not-registered");
      expect(output).not.toContain("hangzhou");
      expect(output).not.toContain("orderId");
    } finally {
      await app.close();
    }
  });

  it("uses fixed label names and allowlisted value buckets", () => {
    expect(HTTP_METRIC_LABEL_NAMES).toEqual(["method", "route", "status"]);
    recordHttpRequest({ method: " get ", routeTemplate: "/api/orders/:orderId", statusCode: 201, durationMs: 2.125 });
    recordHttpRequest({ method: "GET", routeTemplate: "/api/payments/orders", statusCode: 204, durationMs: 1 });
    recordHttpRequest({ method: "GET", routeTemplate: "/api/payments/mock-webhook", statusCode: 204, durationMs: 1 });
    recordHttpRequest({ method: "TRACE", routeTemplate: "/api/cities/:cityCode", statusCode: 999, durationMs: Number.NaN });
    recordHttpRequest({ method: "POST", routeTemplate: "/bad?userId=secret", statusCode: 503, durationMs: -1 });

    const output = renderPrometheusMetrics();
    expect(output).toContain('method="GET",route="/api/orders/:param",status="2xx"} 1');
    expect(output).toContain('method="GET",route="/api/payments/orders",status="2xx"} 1');
    expect(output).toContain('method="GET",route="/api/payments/mock-webhook",status="2xx"} 1');
    expect(output).toContain('method="OTHER",route="/api/cities/:param",status="other"} 1');
    expect(output).toContain('method="POST",route="__unmatched__",status="5xx"} 1');
    expect(output).not.toContain("userId");
    expect(output).not.toContain("NaN");
  });

  it("enforces the hard label-combination ceiling and preserves all counts in overflow", () => {
    const requestCount = MAX_HTTP_METRIC_SERIES * 8;
    for (let index = 0; index < requestCount; index += 1) {
      recordHttpRequest({
        method: "GET",
        routeTemplate: `/synthetic-${alphabeticId(index)}`,
        statusCode: 200,
        durationMs: 1,
      });
    }

    const output = renderPrometheusMetrics();
    const series = requestSeries(output);
    expect(series).toHaveLength(MAX_HTTP_METRIC_SERIES);
    expect(output).toContain('method="OTHER",route="__overflow__",status="other"');
    const represented = series.reduce(
      (total, line) => total + Number(line.slice(line.lastIndexOf(" ") + 1)),
      0,
    );
    expect(represented).toBe(requestCount);
  });
});
