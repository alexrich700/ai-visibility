import { storage } from "../storage";
import { log } from "../index";

const SCHEDULER_INTERVAL_MS = 60 * 1000;

let isSchedulerRunning = false;
let schedulerIntervalId: NodeJS.Timeout | null = null;

async function queueScheduledScan(clientId: number): Promise<void> {
  try {
    const client = await storage.getMonitoringClientById(clientId);
    if (!client) {
      log(`Client ${clientId} not found, skipping`, "scheduler");
      return;
    }

    if (!client.isActive) {
      log(`Client ${clientId} is not active, skipping`, "scheduler");
      return;
    }

    const groups = await storage.getGroupsByClientId(clientId);
    const allPrompts = await storage.getPromptsByClientId(clientId);
    const activeGroups = groups.filter(g => g.isActive);
    const activeGroupIds = new Set(activeGroups.map(g => g.id));
    const activePrompts = allPrompts.filter(p => p.isActive && activeGroupIds.has(p.groupId));

    if (activePrompts.length === 0) {
      log(`Client ${clientId} has no active prompts, skipping scheduled queue`, "scheduler");
      const nextCheck = new Date();
      nextCheck.setDate(nextCheck.getDate() + client.checkFrequencyDays);
      await storage.updateMonitoringClient(clientId, {
        nextCheckAt: nextCheck,
        lastCheckAt: new Date(),
      } as any);
      return;
    }

    const existingJob = await storage.getActiveScanJobForClient(clientId);
    if (existingJob) {
      log(`Client ${clientId} already has active job ${existingJob.id}, skipping scheduled queue`, "scheduler");
      return;
    }

    const job = await storage.createScanJob({
      clientId,
      targetCity: null,
      status: "queued",
      progress: 0,
      progressMessage: "Queued by scheduler...",
      completedPrompts: 0,
      totalPrompts: activePrompts.length,
    });

    log(`Queued scheduled scan job ${job.id} for client ${clientId} (${activePrompts.length} prompts)`, "scheduler");
  } catch (error) {
    log(`Error queueing scheduled scan for client ${clientId}: ${error}`, "scheduler");
    const nextCheck = new Date();
    nextCheck.setMinutes(nextCheck.getMinutes() + 30);

    try {
      await storage.updateMonitoringClient(clientId, {
        nextCheckAt: nextCheck,
      } as any);
    } catch (updateError) {
      log(`Failed to update nextCheckAt after scheduler queue error: ${updateError}`, "scheduler");
    }
  }
}

async function checkAndRunScheduledScans(): Promise<void> {
  if (isSchedulerRunning) {
    return;
  }

  isSchedulerRunning = true;

  try {
    const dueClients = await storage.getClientsDueForCheck();

    if (dueClients.length > 0) {
      log(`Found ${dueClients.length} clients due for scheduled check`, "scheduler");
    }

    for (const client of dueClients) {
      await queueScheduledScan(client.id);
    }
  } catch (error) {
    log(`Error checking for scheduled scans: ${error}`, "scheduler");
  } finally {
    isSchedulerRunning = false;
  }
}

export function startScheduler(): void {
  if (schedulerIntervalId) {
    log("Scheduler already running", "scheduler");
    return;
  }

  log("Starting visibility check scheduler", "scheduler");

  checkAndRunScheduledScans();

  schedulerIntervalId = setInterval(checkAndRunScheduledScans, SCHEDULER_INTERVAL_MS);
}

export function stopScheduler(): void {
  if (schedulerIntervalId) {
    clearInterval(schedulerIntervalId);
    schedulerIntervalId = null;
    log("Scheduler stopped", "scheduler");
  }
}
