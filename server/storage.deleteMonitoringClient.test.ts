import test from "node:test";
import assert from "node:assert/strict";
import { db } from "./db";
import { DatabaseStorage } from "./storage";
import {
  checkCompetitorMetrics,
  checkGroupMetrics,
  checkResults,
  checkSessions,
  monitoringClients,
  monitoringGroups,
  monitoringPrompts,
} from "@shared/schema";

type DeleteCall = {
  table: unknown;
  where: unknown;
};

test("deleteMonitoringClient deletes dependent data in expected order and with expected IDs", async () => {
  const storage = new DatabaseStorage();
  const clientId = 123;
  const deletedCalls: DeleteCall[] = [];

  const originalDelete = db.delete.bind(db);
  Object.defineProperty(db, "delete", {
    value: (table: unknown) => ({
      where: async (condition: unknown) => {
        deletedCalls.push({ table, where: condition });
      },
    }),
    configurable: true,
    writable: true,
  });

  const originalGetGroups = storage.getGroupsByClientId.bind(storage);
  Object.defineProperty(storage, "getGroupsByClientId", {
    value: async () => [{ id: 101 }, { id: 102 }],
    configurable: true,
    writable: true,
  });

  try {
    await storage.deleteMonitoringClient(clientId);
  } finally {
    Object.defineProperty(db, "delete", {
      value: originalDelete,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(storage, "getGroupsByClientId", {
      value: originalGetGroups,
      configurable: true,
      writable: true,
    });
  }

  assert.deepEqual(
    deletedCalls.map((call) => call.table),
    [
      checkResults,
      checkGroupMetrics,
      checkCompetitorMetrics,
      checkSessions,
      monitoringPrompts,
      monitoringPrompts,
      monitoringGroups,
      monitoringClients,
    ],
  );

  const whereSql = deletedCalls.map((call) =>
    db.select().from(checkResults).where(call.where as never).toSQL(),
  );

  assert.deepEqual(
    whereSql.map((sql) => sql.params[0]),
    [clientId, clientId, clientId, clientId, 101, 102, clientId, clientId],
  );
});
