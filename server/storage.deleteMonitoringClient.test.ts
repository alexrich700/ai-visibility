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

test("deleteMonitoringClient deletes dependent data in expected order", async () => {
  const storage = new DatabaseStorage();
  const deletedTables: unknown[] = [];

  const originalDelete = db.delete.bind(db);
  Object.defineProperty(db, "delete", {
    value: (table: unknown) => ({
      where: async () => {
        deletedTables.push(table);
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
    await storage.deleteMonitoringClient(123);
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

  assert.deepEqual(deletedTables, [
    checkResults,
    checkGroupMetrics,
    checkCompetitorMetrics,
    checkSessions,
    monitoringPrompts,
    monitoringPrompts,
    monitoringGroups,
    monitoringClients,
  ]);
});
