import {
  collectDefaultMetrics,
  Counter,
  Gauge,
  Histogram,
  Registry
} from "prom-client";

import type { InternalStats } from "./infra/store.js";

const httpDurationBuckets = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];

export class ApiMetrics {
  readonly contentType: string;

  private readonly registry = new Registry();
  private readonly requests = new Counter({
    name: "oct_api_http_requests_total",
    help: "API requests by route template, method, and status class.",
    labelNames: ["route", "method", "status_class"] as const,
    registers: [this.registry]
  });
  private readonly requestDuration = new Histogram({
    name: "oct_api_http_request_duration_seconds",
    help: "API request duration by route template, method, and status class.",
    labelNames: ["route", "method", "status_class"] as const,
    buckets: httpDurationBuckets,
    registers: [this.registry]
  });
  private readonly resourceTotals = new Gauge({
    name: "oct_api_resources_total",
    help: "Current resource totals from PostgreSQL.",
    labelNames: ["resource"] as const,
    registers: [this.registry]
  });
  private readonly submissions = new Gauge({
    name: "oct_api_submissions",
    help: "Current submissions by state.",
    labelNames: ["status"] as const,
    registers: [this.registry]
  });
  private readonly judgeFailures = new Gauge({
    name: "oct_api_judge_failures",
    help: "Current failed submissions by bounded failure type.",
    labelNames: ["type"] as const,
    registers: [this.registry]
  });
  private readonly judgeCases = new Gauge({
    name: "oct_api_judge_cases_total",
    help: "Current persisted judge testcase result count.",
    registers: [this.registry]
  });
  private readonly judgeCaseAverageDuration = new Gauge({
    name: "oct_api_judge_case_average_duration_seconds",
    help: "Average persisted judge testcase execution duration.",
    registers: [this.registry]
  });

  constructor() {
    this.contentType = this.registry.contentType;
    collectDefaultMetrics({
      register: this.registry,
      prefix: "oct_api_"
    });

    new Gauge({
      name: "oct_api_build_info",
      help: "Static API service identity.",
      labelNames: ["service"] as const,
      registers: [this.registry]
    }).set({ service: "online-code-test-api" }, 1);
  }

  observeHttpRequest(route: string, method: string, statusCode: number, durationSeconds: number) {
    const labels = {
      route: normalizeRoute(route),
      method: normalizeMethod(method),
      status_class: statusClass(statusCode)
    };

    this.requests.inc(labels);
    this.requestDuration.observe(labels, durationSeconds);
  }

  async render(stats: InternalStats) {
    this.resourceTotals.set({ resource: "candidates" }, stats.totals.candidates);
    this.resourceTotals.set({ resource: "problems" }, stats.totals.problems);
    this.resourceTotals.set({ resource: "assignments" }, stats.totals.assignments);
    this.resourceTotals.set({ resource: "submissions" }, stats.totals.submissions);

    for (const [status, count] of Object.entries(stats.submissionsByStatus)) {
      this.submissions.set({ status }, count);
    }

    for (const [type, count] of Object.entries(stats.failuresByType)) {
      this.judgeFailures.set({ type }, count);
    }

    this.judgeCases.set(stats.judgeCases.total);
    this.judgeCaseAverageDuration.set(
      (stats.judgeCases.averageExecutionTimeMs ?? 0) / 1_000
    );

    return this.registry.metrics();
  }
}

function normalizeRoute(route: string) {
  if (!route || route === "/*") {
    return "unmatched";
  }

  return route;
}

function normalizeMethod(method: string) {
  const normalized = method.toUpperCase();
  return /^[A-Z]+$/.test(normalized) ? normalized : "UNKNOWN";
}

function statusClass(statusCode: number) {
  if (!Number.isInteger(statusCode) || statusCode < 100 || statusCode > 599) {
    return "unknown";
  }

  return `${Math.floor(statusCode / 100)}xx`;
}
