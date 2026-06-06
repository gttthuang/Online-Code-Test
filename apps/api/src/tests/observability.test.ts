import test from "node:test";
import assert from "node:assert/strict";

import type { JudgeQueue } from "../infra/judge-queue.js";
import {
  authHeader,
  createHarness,
  destroyHarness
} from "./helpers.js";

const opsToken = "test-ops-token";

test("liveness, readiness, and protected operations endpoints report healthy state", async () => {
  const harness = await createHarness({ opsToken });

  try {
    const healthResponse = await harness.app.inject({
      method: "GET",
      url: "/healthz"
    });
    const readinessResponse = await harness.app.inject({
      method: "GET",
      url: "/readyz"
    });
    const anonymousStatsResponse = await harness.app.inject({
      method: "GET",
      url: "/internal/stats"
    });
    const invalidMetricsResponse = await harness.app.inject({
      method: "GET",
      url: "/metrics",
      headers: authHeader("wrong-token")
    });
    const statsResponse = await harness.app.inject({
      method: "GET",
      url: "/internal/stats",
      headers: authHeader(opsToken)
    });

    assert.equal(healthResponse.statusCode, 200);
    assert.deepEqual(healthResponse.json(), {
      status: "ok",
      service: "api"
    });

    assert.equal(readinessResponse.statusCode, 200);
    assert.deepEqual(readinessResponse.json(), {
      status: "ready",
      service: "api",
      dependencies: {
        postgres: "reachable",
        redis: "reachable"
      }
    });
    assert.equal(readinessResponse.headers["cache-control"], "no-store");

    assert.equal(anonymousStatsResponse.statusCode, 401);
    assert.equal(anonymousStatsResponse.json().error.code, "ops_unauthorized");
    assert.equal(invalidMetricsResponse.statusCode, 401);
    assert.equal(statsResponse.statusCode, 200);
    assert.equal(statsResponse.headers["cache-control"], "no-store");
  } finally {
    await destroyHarness(harness);
  }
});

test("readiness returns 503 when Redis is unavailable", async () => {
  const unavailableQueue: JudgeQueue = {
    async enqueue() {},
    async ping() {
      throw new Error("redis unavailable");
    }
  };
  const harness = await createHarness({
    judgeQueue: unavailableQueue
  });

  try {
    const response = await harness.app.inject({
      method: "GET",
      url: "/readyz"
    });

    assert.equal(response.statusCode, 503);
    assert.deepEqual(response.json().dependencies, {
      postgres: "reachable",
      redis: "unreachable"
    });
  } finally {
    await destroyHarness(harness);
  }
});

test("Prometheus metrics use bounded route templates and exclude resource IDs", async () => {
  const harness = await createHarness({ opsToken });

  try {
    const sensitiveProblemId = "sensitive-problem-id";
    const requestResponse = await harness.app.inject({
      method: "GET",
      url: `/me/problems/${sensitiveProblemId}`
    });

    assert.equal(requestResponse.statusCode, 401);

    const metricsResponse = await harness.app.inject({
      method: "GET",
      url: "/metrics",
      headers: authHeader(opsToken)
    });
    const metrics = metricsResponse.body;

    assert.equal(metricsResponse.statusCode, 200);
    assert.match(metricsResponse.headers["content-type"] ?? "", /text\/plain/);
    assert.equal(metricsResponse.headers["cache-control"], "no-store");
    assert.match(
      metrics,
      /oct_api_http_requests_total\{route="\/me\/problems\/:problemId",method="GET",status_class="4xx"\} 1/
    );
    assert.doesNotMatch(metrics, new RegExp(sensitiveProblemId));
    assert.match(metrics, /oct_api_submissions\{status="queued"\} 0/);
    assert.match(metrics, /oct_api_process_cpu_user_seconds_total/);
  } finally {
    await destroyHarness(harness);
  }
});
