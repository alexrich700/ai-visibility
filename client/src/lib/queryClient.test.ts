import test from "node:test";
import assert from "node:assert/strict";
import { hasDataClassPolicy } from "@/lib/queryClient";

test("unmapped keys have no per-key override", () => {
  assert.equal(hasDataClassPolicy(["/api/unknown/resource", 1]), false);
  assert.equal(hasDataClassPolicy(["/api/another/unknown"]), false);
});

test("hasDataClassPolicy returns true for registered keys and false for unknown keys", () => {
  assert.equal(hasDataClassPolicy(["/api/monitoring/dashboard", 123]), true);
  assert.equal(hasDataClassPolicy(["/api/monitoring/settings", 456]), true);
  assert.equal(hasDataClassPolicy(["/api/something/random", 123]), false);
  assert.equal(hasDataClassPolicy(["/not-an-api-path"]), false);
});
