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

type SelectCall = {
  table: unknown;
  where: unknown;
};

test("deleteMonitoringClient deletes dependent data in expected order with batch prompt deletion", async () => {
  const storage = new DatabaseStorage();
  const clientId = 123;
  const deletedCalls: DeleteCall[] = [];
  const selectCalls: SelectCall[] = [];

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

  const originalSelect = db.select.bind(db);
  Object.defineProperty(db, "select", {
    value: (...args: unknown[]) => ({
      from: (table: unknown) => ({
        where: async (condition: unknown) => {
          selectCalls.push({ table, where: condition });
          // Return mock group IDs for the subquery
          if (table === monitoringGroups) {
            return [{ id: 101 }, { id: 102 }];
          }
          return [];
        },
      }),
    }),
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
    Object.defineProperty(db, "select", {
      value: originalSelect,
      configurable: true,
      writable: true,
    });
  }

  // With batch deletion, prompts are deleted once via inArray instead of per-group
  assert.deepEqual(
    deletedCalls.map((call) => call.table),
    [
      checkResults,
      checkGroupMetrics,
      checkCompetitorMetrics,
      checkSessions,
      monitoringPrompts,   // Single batch delete for all group prompts
      monitoringGroups,
      monitoringClients,
    ],
  );
});
