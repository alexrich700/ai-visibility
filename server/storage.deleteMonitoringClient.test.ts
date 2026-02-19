import test from "node:test";
import assert from "node:assert/strict";
import {
  checkCompetitorMetrics,
  checkGroupMetrics,
  checkResults,
  checkSessions,
  monitoringClients,
  monitoringGroups,
  monitoringPrompts,
} from "@shared/schema";
import { DatabaseStorage } from "./storage";
import { db } from "./db";

type DbTransaction = Parameters<typeof db.transaction>[0] extends (tx: infer T) => Promise<void>
  ? T
  : never;

type RecordedDelete = {
  operation: string;
  whereParams: unknown[];
};

type RecordedSelect = {
  operation: string;
  whereParams: unknown[];
};

const TABLE_NAMES = new Map<object, string>([
  [checkResults, "check_results"],
  [checkGroupMetrics, "check_group_metrics"],
  [checkCompetitorMetrics, "check_competitor_metrics"],
  [checkSessions, "check_sessions"],
  [monitoringPrompts, "monitoring_prompts"],
  [monitoringGroups, "monitoring_groups"],
  [monitoringClients, "monitoring_clients"],
]);

function getTableName(table: object): string {
  const tableName = TABLE_NAMES.get(table);
  assert.ok(tableName, "unknown table encountered in transaction delete test");
  return tableName;
}

function extractWhereParams(condition: unknown): unknown[] {
  if (!condition || typeof condition !== "object") {
    return [];
  }

  const chunks = (condition as { queryChunks?: unknown[] }).queryChunks;
  if (!Array.isArray(chunks)) {
    return [];
  }

  return chunks
    .filter((chunk) => Boolean(chunk) && typeof chunk === "object" && (chunk as { constructor?: { name?: string } }).constructor?.name === "Param")
    .map((chunk) => (chunk as { value: unknown }).value);
}

function buildTransactionMock(options: {
  groupIds: number[];
  failOnDeleteNumber?: number;
  failure?: Error;
  records: {
    deletes: RecordedDelete[];
    selects: RecordedSelect[];
    lifecycle: string[];
  };
}): DbTransaction {
  const { groupIds, failOnDeleteNumber, failure, records } = options;
  let deleteCounter = 0;

  const txMock: Pick<DbTransaction, "delete" | "select"> = {
    delete: ((table: object) => ({
      where: async (condition: unknown) => {
        deleteCounter += 1;
        records.deletes.push({
          operation: `delete:${getTableName(table)}`,
          whereParams: extractWhereParams(condition),
        });

        if (failOnDeleteNumber === deleteCounter) {
          throw (failure ?? new Error("simulated delete failure"));
        }
      },
    })) as DbTransaction["delete"],
    select: (() => ({
      from: (table: object) => ({
        where: async (condition: unknown) => {
          records.selects.push({
            operation: `select:${getTableName(table)}`,
            whereParams: extractWhereParams(condition),
          });
          return groupIds.map((id) => ({ id })) as Array<{ id: number }>;
        },
      }),
    })) as DbTransaction["select"],
  };

  return txMock as DbTransaction;
}

async function withTransactionStub(
  tx: DbTransaction,
  callback: () => Promise<void>,
  lifecycle: string[],
): Promise<void> {
  const originalTransaction = db.transaction;
  (db as typeof db & { transaction: typeof db.transaction }).transaction = (async (fn) => {
    lifecycle.push("begin");
    try {
      const result = await fn(tx);
      lifecycle.push("commit");
      return result;
    } catch (error) {
      lifecycle.push("rollback");
      throw error;
    }
  }) as typeof db.transaction;

  try {
    await callback();
  } finally {
    (db as typeof db & { transaction: typeof db.transaction }).transaction = originalTransaction;
  }
}

test("deleteMonitoringClient deletes expected tables in order and commits", async () => {
  const storage = new DatabaseStorage();
  const records = { deletes: [] as RecordedDelete[], selects: [] as RecordedSelect[], lifecycle: [] as string[] };
  const clientId = 123;
  const groupIds = [1, 2];
  const tx = buildTransactionMock({ groupIds, records });

  await withTransactionStub(tx, async () => {
    await storage.deleteMonitoringClient(clientId);
  }, records.lifecycle);

  assert.deepEqual(records.lifecycle, ["begin", "commit"]);
  assert.deepEqual(records.selects.map((entry) => entry.operation), ["select:monitoring_groups"]);
  assert.deepEqual(records.selects[0].whereParams, [clientId]);

  // Expected delete operations:
  // 1) check_results
  // 2) check_group_metrics
  // 3) check_competitor_metrics
  // 4) check_sessions
  // 5) monitoring_prompts (group 1)
  // 6) monitoring_prompts (group 2)
  // 7) monitoring_groups
  // 8) monitoring_clients
  assert.deepEqual(
    records.deletes.map((entry) => entry.operation),
    [
      "delete:check_results",
      "delete:check_group_metrics",
      "delete:check_competitor_metrics",
      "delete:check_sessions",
      "delete:monitoring_prompts",
      "delete:monitoring_prompts",
      "delete:monitoring_groups",
      "delete:monitoring_clients",
    ],
  );

  const clientScopedDeleteParams = records.deletes
    .filter((entry) => entry.operation !== "delete:monitoring_prompts")
    .map((entry) => entry.whereParams);
  clientScopedDeleteParams.forEach((params) => assert.deepEqual(params, [clientId]));

  const promptDeleteParams = records.deletes
    .filter((entry) => entry.operation === "delete:monitoring_prompts")
    .map((entry) => entry.whereParams[0]);
  assert.deepEqual(promptDeleteParams, groupIds);
});

test("deleteMonitoringClient rolls back transaction when a mid-step delete fails", async () => {
  const storage = new DatabaseStorage();
  const records = { deletes: [] as RecordedDelete[], selects: [] as RecordedSelect[], lifecycle: [] as string[] };
  const failure = new Error("simulated mid-transaction failure");
  const tx = buildTransactionMock({ groupIds: [1, 2], failOnDeleteNumber: 4, failure, records });

  await assert.rejects(
    withTransactionStub(
      tx,
      async () => {
        await storage.deleteMonitoringClient(456);
      },
      records.lifecycle,
    ),
    { message: "simulated mid-transaction failure" },
  );

  assert.deepEqual(records.lifecycle, ["begin", "rollback"]);
  assert.deepEqual(records.deletes.map((entry) => entry.operation), [
    "delete:check_results",
    "delete:check_group_metrics",
    "delete:check_competitor_metrics",
    "delete:check_sessions",
  ]);
});

test("deleteMonitoringClient handles zero dependent groups without prompt deletes", async () => {
  const storage = new DatabaseStorage();
  const records = { deletes: [] as RecordedDelete[], selects: [] as RecordedSelect[], lifecycle: [] as string[] };
  const clientId = 321;
  const tx = buildTransactionMock({ groupIds: [], records });

  await withTransactionStub(tx, async () => {
    await storage.deleteMonitoringClient(clientId);
  }, records.lifecycle);

  assert.deepEqual(records.lifecycle, ["begin", "commit"]);
  assert.deepEqual(records.selects.map((entry) => entry.operation), ["select:monitoring_groups"]);
  assert.deepEqual(records.selects[0].whereParams, [clientId]);
  assert.deepEqual(records.deletes.map((entry) => entry.operation), [
    "delete:check_results",
    "delete:check_group_metrics",
    "delete:check_competitor_metrics",
    "delete:check_sessions",
    "delete:monitoring_groups",
    "delete:monitoring_clients",
  ]);
});

test("deleteMonitoringClient for nonexistent client succeeds silently", async () => {
  const storage = new DatabaseStorage();
  const records = { deletes: [] as RecordedDelete[], selects: [] as RecordedSelect[], lifecycle: [] as string[] };
  const nonexistentClientId = 999;
  const tx = buildTransactionMock({ groupIds: [], records });

  await assert.doesNotReject(
    withTransactionStub(
      tx,
      async () => {
        await storage.deleteMonitoringClient(nonexistentClientId);
      },
      records.lifecycle,
    ),
  );

  assert.deepEqual(records.lifecycle, ["begin", "commit"]);
  records.deletes
    .filter((entry) => entry.operation !== "delete:monitoring_prompts")
    .forEach((entry) => assert.deepEqual(entry.whereParams, [nonexistentClientId]));
});
