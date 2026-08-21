import test from "node:test";
import assert from "node:assert/strict";

import { handleCreateLead } from "./leads";

function makeRes() {
  return {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
}

function makeReq(body: unknown) {
  return { body };
}

const savedLead = {
  id: 42,
  auditId: 7,
  submissionId: "req-fixed-1234",
  name: "Jane Doe",
  email: "jane@example.com",
  phone: "555-1234",
  businessName: "Jane's Plumbing",
  auditScore: 65,
  status: "new",
  createdAt: new Date(),
  updatedAt: new Date(),
} as any;

const localAudit = {
  id: 7,
  businessName: "Jane's Plumbing",
  url: "janesplumbing.com",
  keyword: "plumber",
  scope: "local",
  city: "Austin, TX",
  overallScore: 65,
  chatgptScore: 70,
  googleAIScore: 60,
} as any;

const nationalAudit = {
  ...localAudit,
  scope: "national",
  city: "Austin, TX",
} as any;

// A valid v4 UUID so leadSchema.requestId validation preserves the caller value.
const CALLER_REQUEST_ID = "11111111-1111-4111-8111-111111111111";

const leadBody = {
  name: "Jane Doe",
  email: "jane@example.com",
  phone: "555-1234",
  businessName: "Jane's Plumbing",
  auditScore: 65,
  auditId: 7,
  requestId: CALLER_REQUEST_ID,
};

test("lead with auditId commits lead + notification atomically with correct payload (local)", async () => {
  const req = makeReq(leadBody);
  const res = makeRes();

  const txCalls: any[] = [];
  let legacyCreateCalled = 0;

  await handleCreateLead(req as any, res as any, {
    createLeadFn: async () => {
      legacyCreateCalled += 1;
      return savedLead;
    },
    getAuditByIdFn: async () => localAudit,
    createLeadWithNotificationFn: async (input: any) => {
      txCalls.push(input);
      return savedLead;
    },
  });

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, savedLead);
  // Atomic path is used, not the legacy standalone createLead.
  assert.equal(legacyCreateCalled, 0);
  assert.equal(txCalls.length, 1);

  const input = txCalls[0];
  // Caller-provided requestId is preserved exactly.
  assert.equal(input.requestId, CALLER_REQUEST_ID);

  // Lead record fields.
  assert.equal(input.lead.auditId, 7);
  assert.equal(input.lead.name, "Jane Doe");
  assert.equal(input.lead.email, "jane@example.com");
  assert.equal(input.lead.phone, "555-1234");
  assert.equal(input.lead.businessName, "Jane's Plumbing");
  assert.equal(input.lead.auditScore, 65);
  assert.equal(input.lead.status, "new");

  // Notification payload sourced from the audit + lead contact info.
  const n = input.notification;
  assert.equal(n.businessName, "Jane's Plumbing");
  assert.equal(n.url, "janesplumbing.com");
  assert.equal(n.keyword, "plumber");
  assert.equal(n.overallScore, 65);
  assert.equal(n.chatgptScore, 70);
  assert.equal(n.googleAIScore, 60);
  assert.equal(n.auditId, 7);
  assert.equal(n.leadName, "Jane Doe");
  assert.equal(n.leadEmail, "jane@example.com");
  assert.equal(n.leadPhone, "555-1234");
  // Local semantics keep the city.
  assert.equal(n.scope, "local");
  assert.equal(n.city, "Austin, TX");
});

test("national audit unlock notification omits city (null)", async () => {
  const req = makeReq(leadBody);
  const res = makeRes();

  const txCalls: any[] = [];

  await handleCreateLead(req as any, res as any, {
    createLeadFn: async () => savedLead,
    getAuditByIdFn: async () => nationalAudit,
    createLeadWithNotificationFn: async (input: any) => {
      txCalls.push(input);
      return savedLead;
    },
  });

  assert.equal(txCalls.length, 1);
  const n = txCalls[0].notification;
  assert.equal(n.scope, "national");
  assert.equal(n.city, null);
});

test("transaction failure returns HTTP 400 without a success response", async () => {
  const req = makeReq(leadBody);
  const res = makeRes();

  await handleCreateLead(req as any, res as any, {
    createLeadFn: async () => savedLead,
    getAuditByIdFn: async () => localAudit,
    createLeadWithNotificationFn: async () => {
      throw new Error("transaction rolled back");
    },
  });

  assert.equal(res.statusCode, 400);
  // The body must be the sanitized error, never the saved lead.
  assert.notDeepEqual(res.body, savedLead);
});

test("missing audit for a lead with auditId returns HTTP 400", async () => {
  const req = makeReq(leadBody);
  const res = makeRes();

  let txCalled = 0;

  await handleCreateLead(req as any, res as any, {
    createLeadFn: async () => savedLead,
    getAuditByIdFn: async () => undefined as any,
    createLeadWithNotificationFn: async () => {
      txCalled += 1;
      return savedLead;
    },
  });

  assert.equal(txCalled, 0);
  assert.equal(res.statusCode, 400);
});

test("lead without auditId uses legacy createLeadFn and never enqueues", async () => {
  const { auditId, ...bodyWithoutAudit } = leadBody;
  const req = makeReq(bodyWithoutAudit);
  const res = makeRes();

  const createCalls: any[] = [];
  let txCalled = 0;

  const noAuditLead = { ...savedLead, auditId: null } as any;

  await handleCreateLead(req as any, res as any, {
    createLeadFn: async (input: any) => {
      createCalls.push(input);
      return noAuditLead;
    },
    getAuditByIdFn: async () => localAudit,
    createLeadWithNotificationFn: async () => {
      txCalled += 1;
      return savedLead;
    },
  });

  assert.equal(txCalled, 0);
  assert.equal(createCalls.length, 1);
  assert.equal(createCalls[0].auditId, null);
  // Caller requestId is threaded through as the submissionId for idempotency.
  assert.equal(createCalls[0].submissionId, CALLER_REQUEST_ID);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, noAuditLead);
});
