import test from "node:test";
import assert from "node:assert/strict";

import {
  apiRouteDefinitions,
  apiRouteKey,
  assertApiRouteContract,
  createOpenApiDocument
} from "../api-contract.js";
import { createHarness, destroyHarness } from "./helpers.js";

test("API route catalog has unique routes and operation IDs", () => {
  const routeKeys = apiRouteDefinitions.map(({ method, path }) => apiRouteKey(method, path));
  const operationIds = apiRouteDefinitions.map(({ operationId }) => operationId);

  assert.equal(new Set(routeKeys).size, routeKeys.length);
  assert.equal(new Set(operationIds).size, operationIds.length);
  assert.equal(apiRouteDefinitions.length, 43);
});

test("OpenAPI document includes every canonical route and access rule", () => {
  const document = createOpenApiDocument();

  assert.equal(document.openapi, "3.1.0");

  for (const definition of apiRouteDefinitions) {
    const path = definition.path.replace(/:([A-Za-z0-9_]+)/g, "{$1}");
    const operation = document.paths[path]?.[definition.method.toLowerCase()] as {
      operationId?: string;
      security?: unknown[];
      "x-roles"?: readonly string[];
    } | undefined;

    assert.ok(operation, `${definition.method} ${definition.path} is absent from OpenAPI`);
    assert.equal(operation.operationId, definition.operationId);
    assert.deepEqual(
      operation.security,
      definition.access === "public"
        ? []
        : [{ [definition.access === "ops" ? "opsBearer" : "bearerAuth"]: [] }]
    );
    assert.deepEqual(operation["x-roles"], definition.roles);
  }
});

test("route contract reports undocumented and missing routes", () => {
  assert.throws(
    () => assertApiRouteContract(new Set(["GET /", "GET /undocumented"])),
    /Undocumented routes: GET \/undocumented[\s\S]*Missing routes:/
  );
});

test("service index and OpenAPI route expose the canonical contract", async () => {
  const harness = await createHarness();

  try {
    const indexResponse = await harness.app.inject({
      method: "GET",
      url: "/"
    });
    const openApiResponse = await harness.app.inject({
      method: "GET",
      url: "/openapi.json"
    });

    assert.equal(indexResponse.statusCode, 200);
    assert.equal(openApiResponse.statusCode, 200);
    assert.deepEqual(
      indexResponse.json().routes,
      apiRouteDefinitions.map(({ method, path }) => apiRouteKey(method, path))
    );
    assert.equal(indexResponse.json().openapi, "/openapi.json");
    assert.equal(openApiResponse.json().openapi, "3.1.0");
  } finally {
    await destroyHarness(harness);
  }
});
