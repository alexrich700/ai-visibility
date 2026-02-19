import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "node:net";

import { storage } from "../storage";
import adminRouter from "./admin";

async function withServer(run: (baseUrl: string) => Promise<void>): Promise<void> {
  const app = express();
  app.use(express.json());
  app.use("/api/admin", adminRouter);

  const server = await new Promise<import("node:http").Server>((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });

  try {
    const address = server.address() as AddressInfo;
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
}

test("POST /api/admin/logout invalidates validated bearer token", async () => {
  const originalGetSession = storage.getAdminSessionByToken;
  const originalDeleteSession = storage.deleteAdminSession;

  try {
    let deletedToken: string | null = null;

    storage.getAdminSessionByToken = async (token: string) => ({ id: 1, sessionToken: token } as any);
    storage.deleteAdminSession = async (token: string) => {
      deletedToken = token;
    };

    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/admin/logout`, {
        method: "POST",
        headers: {
          Authorization: "Bearer token-123",
        },
      });

      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { success: true });
    });

    assert.equal(deletedToken, "token-123");
  } finally {
    storage.getAdminSessionByToken = originalGetSession;
    storage.deleteAdminSession = originalDeleteSession;
  }
});
