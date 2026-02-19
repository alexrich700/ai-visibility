import test from "node:test";
import assert from "node:assert/strict";

import { storage } from "../storage";

test("queueScheduledScan advances nextCheckAt when job is enqueued", async () => {
  process.env.MY_OPENAI_API_KEY = process.env.MY_OPENAI_API_KEY || "sk-test-key-12345678901234567890";
  const { queueScheduledScan } = await import("./scheduler");

  const original = {
    getMonitoringClientById: storage.getMonitoringClientById,
    getGroupsByClientId: storage.getGroupsByClientId,
    getPromptsByClientId: storage.getPromptsByClientId,
    getActiveScanJobForClient: storage.getActiveScanJobForClient,
    createScanJob: storage.createScanJob,
    updateMonitoringClient: storage.updateMonitoringClient,
  };

  const updateCalls: Array<Record<string, unknown>> = [];

  (storage as any).getMonitoringClientById = async () => ({ id: 5, isActive: true, checkFrequencyDays: 14 });
  (storage as any).getGroupsByClientId = async () => ([{ id: 10, isActive: true }]);
  (storage as any).getPromptsByClientId = async () => ([{ id: 20, groupId: 10, isActive: true }]);
  (storage as any).getActiveScanJobForClient = async () => undefined;
  (storage as any).createScanJob = async () => ({ id: 123 });
  (storage as any).updateMonitoringClient = async (_id: number, data: Record<string, unknown>) => {
    updateCalls.push(data);
    return { id: 5 };
  };

  try {
    await queueScheduledScan(5);
  } finally {
    (storage as any).getMonitoringClientById = original.getMonitoringClientById;
    (storage as any).getGroupsByClientId = original.getGroupsByClientId;
    (storage as any).getPromptsByClientId = original.getPromptsByClientId;
    (storage as any).getActiveScanJobForClient = original.getActiveScanJobForClient;
    (storage as any).createScanJob = original.createScanJob;
    (storage as any).updateMonitoringClient = original.updateMonitoringClient;
  }

  assert.equal(updateCalls.length, 1);
  assert.ok(updateCalls[0].nextCheckAt instanceof Date);
  assert.equal("lastCheckAt" in updateCalls[0], false);
});
