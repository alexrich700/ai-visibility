import { storage } from "../storage";
import { createLogger } from "../utils/logger";

const SCHEDULER_INTERVAL_MS = 60 * 1000;

let isSchedulerRunning = false;
let schedulerIntervalId: NodeJS.Timeout | null = null;
const schedulerLogger = createLogger("scheduler");

export async function queueScheduledScan(clientId: number): Promise<void> {
  try {
    const client = await storage.getMonitoringClientById(clientId);
    if (!client) {
      schedulerLogger.info(`Client ${clientId} not found, skipping`);
      return;
    }

    if (!client.isActive) {
      schedulerLogger.info(`Client ${clientId} is not active, skipping`);
      return;
    }

    const groups = await storage.getGroupsByClientId(clientId);
    const allPrompts = await storage.getPromptsByClientId(clientId);
    const activeGroups = groups.filter(g => g.isActive);
    const activeGroupIds = new Set(activeGroups.map(g => g.id));
    const activePrompts = allPrompts.filter(p => p.isActive && activeGroupIds.has(p.groupId));

    if (activePrompts.length === 0) {
      schedulerLogger.info(`Client ${clientId} has no active prompts, skipping scheduled queue`);
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
      schedulerLogger.info(`Client ${clientId} already has active job ${existingJob.id}, skipping scheduled queue`);
      return;
    }

    const citiesToScan = client.cities && client.cities.length > 0
      ? client.cities
      : [client.city || null];

    for (const city of citiesToScan) {
      const job = await storage.createScanJob({
        clientId,
        targetCity: city,
        status: "queued",
        progress: 0,
        progressMessage: city
          ? `Queued by scheduler for ${city}...`
          : "Queued by scheduler...",
        completedPrompts: 0,
        totalPrompts: activePrompts.length,
      });
      schedulerLogger.info(`Queued scheduled scan job ${job.id} for client ${clientId}, city: ${city || 'default'} (${activePrompts.length} prompts)`);
    }

    const nextCheck = new Date();
    nextCheck.setDate(nextCheck.getDate() + client.checkFrequencyDays);
    await storage.updateMonitoringClient(clientId, {
      nextCheckAt: nextCheck,
    } as any);

    schedulerLogger.info(`Queued ${citiesToScan.length} scheduled scan job(s) for client ${clientId}`);
  } catch (error) {
    schedulerLogger.error(`Error queueing scheduled scan for client ${clientId}: ${error}`);
    const nextCheck = new Date();
    nextCheck.setMinutes(nextCheck.getMinutes() + 30);

    try {
      await storage.updateMonitoringClient(clientId, {
        nextCheckAt: nextCheck,
      } as any);
    } catch (updateError) {
      schedulerLogger.error(`Failed to update nextCheckAt after scheduler queue error: ${updateError}`);
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
      schedulerLogger.info(`Found ${dueClients.length} clients due for scheduled check`);
    }

    for (const client of dueClients) {
      await queueScheduledScan(client.id);
    }
  } catch (error) {
    schedulerLogger.error(`Error checking for scheduled scans: ${error}`);
  } finally {
    isSchedulerRunning = false;
  }
}

export function startScheduler(): void {
  if (schedulerIntervalId) {
    schedulerLogger.info("Scheduler already running");
    return;
  }

  schedulerLogger.info("Starting visibility check scheduler");

  checkAndRunScheduledScans();

  schedulerIntervalId = setInterval(checkAndRunScheduledScans, SCHEDULER_INTERVAL_MS);
}

export function stopScheduler(): void {
  if (schedulerIntervalId) {
    clearInterval(schedulerIntervalId);
    schedulerIntervalId = null;
    schedulerLogger.info("Scheduler stopped");
  }
}
