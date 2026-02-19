import test from "node:test";
import assert from "node:assert/strict";
import { hasDataClassPolicy, queryClient } from "./queryClient";

test("near-real-time keys poll in background", () => {
  const defaults = queryClient.getQueryDefaults(["/api/monitoring/dashboard", 123]);

  assert.equal(defaults.staleTime, 30 * 1000);
  assert.equal(defaults.refetchInterval, 60 * 1000);
  assert.equal(defaults.refetchOnWindowFocus, true);
});

test("tier defaults are matched by key prefix, regardless of trailing ID", () => {
  const firstClientDefaults = queryClient.getQueryDefaults(["/api/monitoring/dashboard", 123]);
  const secondClientDefaults = queryClient.getQueryDefaults(["/api/monitoring/dashboard", 987]);

  assert.deepEqual(firstClientDefaults, secondClientDefaults);
});

test("hasDataClassPolicy identifies mapped and unmapped api keys", () => {
  assert.equal(hasDataClassPolicy(["/api/monitoring/dashboard", 123]), true);
  assert.equal(hasDataClassPolicy(["/api/something/random", 123]), false);
});

test("semi-static reporting keys use moderate staleness without interval polling", () => {
  const defaults = queryClient.getQueryDefaults(["/api/monitoring/trends/groups", 123]);

  assert.equal(defaults.staleTime, 10 * 60 * 1000);
  assert.equal(defaults.refetchInterval, false);
  assert.equal(defaults.refetchOnWindowFocus, false);
});

test("reference/config keys are long-lived", () => {
  const defaults = queryClient.getQueryDefaults(["/api/monitoring/settings", 123]);

  assert.equal(defaults.staleTime, 30 * 60 * 1000);
  assert.equal(defaults.refetchInterval, false);
  assert.equal(defaults.refetchOnWindowFocus, false);
});

test("unmapped keys have no per-key override", () => {
  const defaults = queryClient.getQueryDefaults(["/api/something/random", 123]);

  assert.deepEqual(defaults, {});
});

test("global baseline defaults are finite for uncategorized queries", () => {
  const defaults = queryClient.getDefaultOptions().queries;

  assert.equal(defaults?.staleTime, 60 * 1000);
  assert.equal(defaults?.refetchInterval, false);
  assert.equal(defaults?.refetchOnWindowFocus, false);
  assert.notEqual(defaults?.staleTime, Infinity);
});
