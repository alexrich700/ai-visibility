import test from "node:test";
import assert from "node:assert/strict";
import { MonitoringService } from "./MonitoringService";

const makePendingScanConfig = (overrides: Partial<any> = {}) => ({
  client: {
    businessName: "Acme",
    domain: "acme.com",
    industry: "Legal",
    scope: "local",
    city: "Austin",
    cities: null,
    primaryCategories: null,
    brandAliases: null,
    checkFrequencyDays: 7,
  },
  groups: [{ name: "Group A", description: "Desc", isHighLevelCategory: false }],
  prompts: [{ groupName: "Group A", text: "prompt" }],
  createdAt: Date.now(),
  ...overrides,
});

const makePendingRescanConfig = (overrides: Partial<any> = {}) => ({
  clientId: 1,
  client: {
    id: 1,
    businessName: "Acme",
    domain: "acme.com",
    industry: null,
    scope: null,
    city: null,
    cities: null,
    primaryCategories: null,
    brandAliases: null,
    checkFrequencyDays: 7,
    nextCheckAt: null,
    isActive: true,
    createdAt: null,
  },
  groups: [],
  prompts: [],
  createdAt: Date.now(),
  ...overrides,
});

test("consumePendingScanConfig returns undefined for a key that was never set", () => {
  const service = new MonitoringService();
  assert.equal(service.consumePendingScanConfig("never-set"), undefined);
});

test("consumePendingScanConfig returns item once and then removes it", () => {
  const service = new MonitoringService();
  const config = makePendingScanConfig();

  service.setPendingScanConfig("scan-1", config);

  assert.deepEqual(service.consumePendingScanConfig("scan-1"), config);
  assert.equal(service.consumePendingScanConfig("scan-1"), undefined);
});

test("consumePendingRescanConfig returns item once and then removes it", () => {
  const service = new MonitoringService();
  const config = makePendingRescanConfig();

  service.setPendingRescanConfig("rescan-1", config);

  assert.deepEqual(service.consumePendingRescanConfig("rescan-1"), config);
  assert.equal(service.consumePendingRescanConfig("rescan-1"), undefined);
});

test("retryWithBackoff retries and then succeeds", async () => {
  const service = new MonitoringService();
  let attempts = 0;

  const result = await service.retryWithBackoff(async () => {
    attempts += 1;
    if (attempts < 3) {
      throw new Error("rate limited");
    }
    return "ok";
  }, 3, 0);

  assert.equal(result, "ok");
  assert.equal(attempts, 3);
});

test("retryWithBackoff applies increasing delays between attempts", async () => {
  const service = new MonitoringService();
  let attempts = 0;
  const startMs = Date.now();

  await service.retryWithBackoff(async () => {
    attempts += 1;
    if (attempts < 3) {
      throw new Error("temporary failure");
    }
    return "ok";
  }, 3, 20);

  const elapsedMs = Date.now() - startMs;
  assert.equal(attempts, 3);
  assert.ok(elapsedMs >= 55, `Expected at least ~60ms elapsed, got ${elapsedMs}ms`);
});

test("retryWithBackoff throws after exhausting retries", async () => {
  const service = new MonitoringService();
  const expected = new Error("always fails");

  await assert.rejects(
    () => service.retryWithBackoff(async () => {
      throw expected;
    }, 1, 0),
    expected,
  );
});

test("retryWithBackoff with maxRetries=0 calls fn once and throws on failure", async () => {
  const service = new MonitoringService();
  let attempts = 0;

  await assert.rejects(
    () => service.retryWithBackoff(async () => {
      attempts += 1;
      throw new Error("boom");
    }, 0, 0),
    /boom/,
  );

  assert.equal(attempts, 1);
});
