import test from "node:test";
import assert from "node:assert/strict";

import { handleAuditStream } from "./audit";

function makeReq(body: unknown) {
  const handlers = new Map<string, Function>();
  return {
    body,
    on(event: string, cb: Function) {
      handlers.set(event, cb);
    },
    trigger(event: string) {
      const handler = handlers.get(event);
      if (handler) handler();
    },
  };
}

function makeRes() {
  const writes: string[] = [];
  return {
    writes,
    writableEnded: false,
    headers: new Map<string, string>(),
    setHeader(key: string, value: string) {
      this.headers.set(key, value);
    },
    flushHeaders() {},
    write(chunk: string) {
      writes.push(chunk);
      return true;
    },
    end() {
      this.writableEnded = true;
    },
  };
}

const validBody = {
  businessName: "Acme Services",
  url: "acme.com",
  keyword: "plumber",
  scope: "local",
  city: "Austin, TX",
};

test("stream route persists audit even if client disconnects mid-stream", async () => {
  const req = makeReq(validBody);
  const res = makeRes();

  let createAuditCalled = 0;
  let disconnectTriggered = false;

  await handleAuditStream(req as any, res as any, {
    runAuditFn: async (_bn, _url, _kw, _scope, _city, onProgress) => {
      onProgress?.("generating_prompts", 0, 10);
      req.trigger("close");
      disconnectTriggered = true;
      onProgress?.("querying_ai", 5, 10);
      return {
        promptResults: [],
        overallScore: 50,
        chatgptScore: 60,
        googleAIScore: 40,
        executiveSummary: "summary",
        competitors: [],
        sentimentAnalysis: {
          overall: "neutral" as const,
          positiveCount: 0,
          negativeCount: 0,
          neutralCount: 0,
          results: [],
        },
      };
    },
    withDatabaseRetryFn: async (op) => op(),
    createAuditFn: async () => {
      createAuditCalled += 1;
      return {
        id: 123,
      } as any;
    },
  });

  assert.equal(disconnectTriggered, true);
  assert.equal(createAuditCalled, 1);
  assert.equal(res.writableEnded, true);
  assert.equal(res.writes.some((w) => w.includes("querying_ai")), false);
  assert.equal(res.writes.some((w) => w.includes("event: complete")), false);
});

test("stream route sets SSE headers and emits progress + complete events on happy path", async () => {
  const req = makeReq(validBody);
  const res = makeRes();

  let createAuditCalled = 0;

  await handleAuditStream(req as any, res as any, {
    runAuditFn: async (_bn, _url, _kw, _scope, _city, onProgress) => {
      onProgress?.("generating_prompts", 1, 10);
      onProgress?.("querying_ai", 4, 10);
      return {
        promptResults: [],
        overallScore: 70,
        chatgptScore: 80,
        googleAIScore: 60,
        executiveSummary: "summary",
        competitors: [],
        sentimentAnalysis: {
          overall: "positive" as const,
          positiveCount: 1,
          negativeCount: 0,
          neutralCount: 0,
          results: [],
        },
      };
    },
    withDatabaseRetryFn: async (op) => op(),
    createAuditFn: async () => {
      createAuditCalled += 1;
      return { id: 77 } as any;
    },
  });

  assert.equal(createAuditCalled, 1);
  assert.equal(res.headers.get("Content-Type"), "text/event-stream");
  assert.equal(res.headers.get("Cache-Control"), "no-cache");
  assert.equal(res.headers.get("Connection"), "keep-alive");

  const output = res.writes.join("");
  assert.equal(output.includes("event: progress"), true);
  assert.equal(output.includes("\"stage\":\"generating_prompts\""), true);
  assert.equal(output.includes("\"stage\":\"querying_ai\""), true);
  assert.equal(output.includes("event: complete"), true);
  assert.equal(output.includes("\"auditId\":77"), true);
  assert.equal(res.writableEnded, true);
});

test("stream route emits error event when runAudit fails while connected", async () => {
  const req = makeReq(validBody);
  const res = makeRes();
  let createAuditCalled = 0;

  await handleAuditStream(req as any, res as any, {
    runAuditFn: async () => {
      throw new Error("boom");
    },
    withDatabaseRetryFn: async (op) => op(),
    createAuditFn: async () => {
      createAuditCalled += 1;
      throw new Error("should not be called");
    },
  });

  const output = res.writes.join("");
  assert.equal(createAuditCalled, 0);
  assert.equal(output.includes("event: error"), true);
  assert.equal(output.includes("Failed to run audit"), true);
  assert.equal(res.writableEnded, true);
});

test("stream route emits error event when database save fails after successful audit", async () => {
  const req = makeReq(validBody);
  const res = makeRes();

  await handleAuditStream(req as any, res as any, {
    runAuditFn: async () => ({
      promptResults: [],
      overallScore: 60,
      chatgptScore: 60,
      googleAIScore: 60,
      executiveSummary: "summary",
      competitors: [],
      sentimentAnalysis: {
        overall: "neutral" as const,
        positiveCount: 0,
        negativeCount: 0,
        neutralCount: 0,
        results: [],
      },
    }),
    withDatabaseRetryFn: async (op) => op(),
    createAuditFn: async () => {
      throw new Error("db write failed");
    },
  });

  const output = res.writes.join("");
  assert.equal(output.includes("event: error"), true);
  assert.equal(output.includes("Failed to run audit"), true);
  assert.equal(res.writableEnded, true);
});
