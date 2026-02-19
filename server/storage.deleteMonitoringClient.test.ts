import test from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
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
  whereClause: unknown;
};

type RecordedSelect = {
  operation: string;
  whereClause: unknown;
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

function assertWhereMatches(table: object, actualWhere: unknown, expectedWhere: unknown): void {
  const actualSql = db.select().from(table as any).where(actualWhere as any).toSQL();
  const expectedSql = db.select().from(table as any).where(expectedWhere as any).toSQL();
  assert.deepEqual(actualSql.params, expectedSql.params);
  assert.equal(actualSql.sql, expectedSql.sql);
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
          whereClause: condition,
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
            whereClause: condition,
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
  assertWhereMatches(monitoringGroups, records.selects[0].whereClause, eq(monitoringGroups.clientId, clientId));

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

  const clientScopedDeletes = records.deletes.filter((entry) => entry.operation !== "delete:monitoring_prompts");
  assertWhereMatches(checkResults, clientScopedDeletes[0].whereClause, eq(checkResults.clientId, clientId));
  assertWhereMatches(checkGroupMetrics, clientScopedDeletes[1].whereClause, eq(checkGroupMetrics.clientId, clientId));
  assertWhereMatches(checkCompetitorMetrics, clientScopedDeletes[2].whereClause, eq(checkCompetitorMetrics.clientId, clientId));
  assertWhereMatches(checkSessions, clientScopedDeletes[3].whereClause, eq(checkSessions.clientId, clientId));
  assertWhereMatches(monitoringGroups, clientScopedDeletes[4].whereClause, eq(monitoringGroups.clientId, clientId));
  assertWhereMatches(monitoringClients, clientScopedDeletes[5].whereClause, eq(monitoringClients.id, clientId));

  const promptDeletes = records.deletes.filter((entry) => entry.operation === "delete:monitoring_prompts");
  assertWhereMatches(monitoringPrompts, promptDeletes[0].whereClause, eq(monitoringPrompts.groupId, groupIds[0]));
  assertWhereMatches(monitoringPrompts, promptDeletes[1].whereClause, eq(monitoringPrompts.groupId, groupIds[1]));
});

test("deleteMonitoringClient rolls back transaction when a mid-step delete fails", async () => {
  const storage = new DatabaseStorage();
  const records = { deletes: [] as RecordedDelete[], selects: [] as RecordedSelect[], lifecycle: [] as string[] };
  const failure = new Error("simulated mid-transaction failure");
  const clientId = 456;
  const tx = buildTransactionMock({ groupIds: [1, 2], failOnDeleteNumber: 4, failure, records });

  await assert.rejects(
    withTransactionStub(
      tx,
      async () => {
        await storage.deleteMonitoringClient(clientId);
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
  assertWhereMatches(checkResults, records.deletes[0].whereClause, eq(checkResults.clientId, clientId));
  assertWhereMatches(checkGroupMetrics, records.deletes[1].whereClause, eq(checkGroupMetrics.clientId, clientId));
  assertWhereMatches(checkCompetitorMetrics, records.deletes[2].whereClause, eq(checkCompetitorMetrics.clientId, clientId));
  assertWhereMatches(checkSessions, records.deletes[3].whereClause, eq(checkSessions.clientId, clientId));
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
  assertWhereMatches(monitoringGroups, records.selects[0].whereClause, eq(monitoringGroups.clientId, clientId));
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
  const clientScopedDeletes = records.deletes.filter((entry) => entry.operation !== "delete:monitoring_prompts");
  assertWhereMatches(checkResults, clientScopedDeletes[0].whereClause, eq(checkResults.clientId, nonexistentClientId));
  assertWhereMatches(checkGroupMetrics, clientScopedDeletes[1].whereClause, eq(checkGroupMetrics.clientId, nonexistentClientId));
  assertWhereMatches(checkCompetitorMetrics, clientScopedDeletes[2].whereClause, eq(checkCompetitorMetrics.clientId, nonexistentClientId));
  assertWhereMatches(checkSessions, clientScopedDeletes[3].whereClause, eq(checkSessions.clientId, nonexistentClientId));
  assertWhereMatches(monitoringGroups, clientScopedDeletes[4].whereClause, eq(monitoringGroups.clientId, nonexistentClientId));
  assertWhereMatches(monitoringClients, clientScopedDeletes[5].whereClause, eq(monitoringClients.id, nonexistentClientId));
});
