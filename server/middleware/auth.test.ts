import test from "node:test";
import assert from "node:assert/strict";

import { storage } from "../storage";
import { loginRateLimiter, requireAdminAuth, requireAdminOrClientAuth, resetLoginAttempts } from "./auth";

type MockRes = {
  statusCode: number;
  body: unknown;
  status: (code: number) => MockRes;
  json: (payload: unknown) => MockRes;
};

function createRes(onSend?: () => void): MockRes {
  return {
    statusCode: 200,
    body: null,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      onSend?.();
      return this;
    },
  };
}

async function runRequireAdminAuth(req: any): Promise<{ nextCalled: boolean; res: MockRes }> {
  let nextCalled = false;
  const res = createRes();

  await new Promise<void>((resolve) => {
    const wrappedRes = {
      status(code: number) {
        res.status(code);
        return this;
      },
      json(payload: unknown) {
        res.json(payload);
        resolve();
        return this;
      },
    };

    requireAdminAuth(req as any, wrappedRes as any, () => {
      nextCalled = true;
      resolve();
    });
  });

  return { nextCalled, res };
}

test("requireAdminAuth allows valid bearer token", async () => {
  const original = storage.getAdminSessionByToken;
  try {
    storage.getAdminSessionByToken = async () => ({ id: 1 } as any);

    const req = { headers: { authorization: "Bearer valid" } };
    const { nextCalled, res } = await runRequireAdminAuth(req);

    assert.equal(nextCalled, true);
    assert.equal(res.statusCode, 200);
  } finally {
    storage.getAdminSessionByToken = original;
  }
});

test("requireAdminAuth returns 401 for missing authorization header", async () => {
  const req = { headers: {} };
  const { nextCalled, res } = await runRequireAdminAuth(req);

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.body, { error: "Authorization required" });
});

test("requireAdminAuth returns 401 for bearer token that is missing/invalid", async () => {
  const original = storage.getAdminSessionByToken;
  try {
    storage.getAdminSessionByToken = async () => undefined;

    const req = { headers: { authorization: "Bearer " } };
    const { nextCalled, res } = await runRequireAdminAuth(req);

    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 401);
    assert.deepEqual(res.body, { error: "Invalid or expired token" });
  } finally {
    storage.getAdminSessionByToken = original;
  }
});

test("requireAdminAuth returns 401 for expired/non-existent token", async () => {
  const original = storage.getAdminSessionByToken;
  try {
    storage.getAdminSessionByToken = async () => undefined;

    const req = { headers: { authorization: "Bearer expired-token" } };
    const { nextCalled, res } = await runRequireAdminAuth(req);

    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 401);
    assert.deepEqual(res.body, { error: "Invalid or expired token" });
  } finally {
    storage.getAdminSessionByToken = original;
  }
});

test("requireAdminOrClientAuth allows client when route client id matches session", async () => {
  const originalAdmin = storage.getAdminSessionByToken;
  const originalClient = storage.getClientSessionByToken;
  try {
    storage.getAdminSessionByToken = async () => undefined;
    storage.getClientSessionByToken = async () => ({ clientId: 123 } as any);

    const req = {
      headers: {},
      cookies: { clientSession: "client-token" },
      params: { clientId: "123" },
    } as any;
    const res = createRes();
    let nextCalled = false;

    await requireAdminOrClientAuth("clientId")(req, res as any, () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, true);
    assert.equal(req.isAdmin, false);
    assert.equal(req.clientId, 123);
  } finally {
    storage.getAdminSessionByToken = originalAdmin;
    storage.getClientSessionByToken = originalClient;
  }
});

test("requireAdminOrClientAuth blocks client from another client id", async () => {
  const originalAdmin = storage.getAdminSessionByToken;
  const originalClient = storage.getClientSessionByToken;
  try {
    storage.getAdminSessionByToken = async () => undefined;
    storage.getClientSessionByToken = async () => ({ clientId: 123 } as any);

    const req = {
      headers: {},
      cookies: { clientSession: "client-token" },
      params: { clientId: "999" },
    } as any;
    const res = createRes();
    let nextCalled = false;

    await requireAdminOrClientAuth("clientId")(req, res as any, () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 403);
    assert.deepEqual(res.body, { error: "Access denied" });
  } finally {
    storage.getAdminSessionByToken = originalAdmin;
    storage.getClientSessionByToken = originalClient;
  }
});

test("requireAdminOrClientAuth returns 401 when request is completely unauthenticated", async () => {
  const originalAdmin = storage.getAdminSessionByToken;
  const originalClient = storage.getClientSessionByToken;
  try {
    storage.getAdminSessionByToken = async () => undefined;
    storage.getClientSessionByToken = async () => undefined;

    const req = {
      headers: {},
      cookies: {},
      params: { clientId: "123" },
    } as any;
    const res = createRes();
    let nextCalled = false;

    await requireAdminOrClientAuth("clientId")(req, res as any, () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 401);
    assert.deepEqual(res.body, { error: "Authorization required" });
  } finally {
    storage.getAdminSessionByToken = originalAdmin;
    storage.getClientSessionByToken = originalClient;
  }
});

test("loginRateLimiter blocks on attempt MAX_ATTEMPTS + 1", () => {
  // Keep in sync with MAX_ATTEMPTS in auth middleware.
  const MAX_ATTEMPTS = 5;
  const ip = "1.2.3.4";
  resetLoginAttempts(ip);

  const req = { ip, socket: { remoteAddress: "9.9.9.9" } } as any;

  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    const res = createRes();
    let nextCalled = false;
    loginRateLimiter(req, res as any, () => {
      nextCalled = true;
    });
    assert.equal(nextCalled, true);
    assert.equal(res.statusCode, 200);
  }

  const blockedRes = createRes();
  let blockedNext = false;
  loginRateLimiter(req, blockedRes as any, () => {
    blockedNext = true;
  });

  assert.equal(blockedNext, false);
  assert.equal(blockedRes.statusCode, 429);
  assert.deepEqual(blockedRes.body, {
    error: "Too many login attempts",
    retryAfter: 900,
  });

  resetLoginAttempts(ip);
});

test("loginRateLimiter falls back to socket.remoteAddress when req.ip is undefined", () => {
  const socketIp = "2.3.4.5";
  resetLoginAttempts(socketIp);

  const req = { socket: { remoteAddress: socketIp } } as any;

  const res = createRes();
  let nextCalled = false;
  loginRateLimiter(req, res as any, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.equal(res.statusCode, 200);

  resetLoginAttempts(socketIp);
});
