import { monitoringClientRequestSchema } from "@shared/schema";
import { z } from "zod";
import { createLogger } from "../../utils/logger";

interface PendingScanConfig {
  client: z.infer<typeof monitoringClientRequestSchema>;
  groups: { name: string; description: string; isHighLevelCategory: boolean }[];
  prompts: { groupName: string; text: string }[];
  targetCity?: string;
  createdAt: number;
}

interface PendingRescanConfig {
  clientId: number;
  targetCity?: string;
  client: {
    id: number;
    businessName: string;
    domain: string;
    industry: string | null;
    scope: string | null;
    city: string | null;
    cities: string[] | null;
    primaryCategories: string[] | null;
    brandAliases: string[] | null;
    checkFrequencyDays: number;
    nextCheckAt: Date | null;
    isActive: boolean;
    createdAt: Date | null;
  };
  groups: {
    id: number;
    clientId: number;
    name: string;
    description: string | null;
    isHighLevelCategory: boolean;
    isActive: boolean;
    createdAt: Date | null;
  }[];
  prompts: {
    id: number;
    groupId: number;
    promptText: string;
    isActive: boolean;
    createdAt: Date | null;
  }[];
  createdAt: number;
}

const monitoringLogger = createLogger("monitoring-service");

class MonitoringService {
  private pendingScanConfigs = new Map<string, PendingScanConfig>();
  private pendingRescanConfigs = new Map<string, PendingRescanConfig>();

  constructor() {
    const cleanupInterval = setInterval(() => this.cleanupStaleConfigs(), 60 * 1000);
    cleanupInterval.unref();
  }

  setPendingScanConfig(id: string, config: PendingScanConfig): void {
    this.pendingScanConfigs.set(id, config);
  }

  consumePendingScanConfig(id: string): PendingScanConfig | undefined {
    const config = this.pendingScanConfigs.get(id);
    if (config) this.pendingScanConfigs.delete(id);
    return config;
  }

  setPendingRescanConfig(id: string, config: PendingRescanConfig): void {
    this.pendingRescanConfigs.set(id, config);
  }

  consumePendingRescanConfig(id: string): PendingRescanConfig | undefined {
    const config = this.pendingRescanConfigs.get(id);
    if (config) this.pendingRescanConfigs.delete(id);
    return config;
  }

  async retryWithBackoff<T>(fn: () => Promise<T>, maxRetries = 3, baseDelayMs = 10000): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        const errorType = lastError.message.includes("rate") || lastError.message.includes("429")
          ? "RATE_LIMIT"
          : lastError.message.includes("timeout")
            ? "TIMEOUT"
            : "API_ERROR";

        if (attempt < maxRetries) {
          const delayMs = baseDelayMs * (attempt + 1);
          monitoringLogger.warn(`Attempt ${attempt + 1}/${maxRetries} failed (${errorType}): ${lastError.message}`, { retryAttempt: attempt + 1, maxRetries, errorType });
          monitoringLogger.info(`Waiting ${delayMs / 1000}s before next attempt...`, { retryAttempt: attempt + 1, delayMs });
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        } else {
          monitoringLogger.error(`All ${maxRetries} retries exhausted. Final error: ${lastError.message}`, { maxRetries, errorType });
        }
      }
    }

    throw lastError;
  }

  private cleanupStaleConfigs(): void {
    const now = Date.now();

    for (const [id, config] of Array.from(this.pendingScanConfigs.entries())) {
      if (now - config.createdAt > 5 * 60 * 1000) {
        this.pendingScanConfigs.delete(id);
      }
    }

    for (const [id, config] of Array.from(this.pendingRescanConfigs.entries())) {
      if (now - config.createdAt > 5 * 60 * 1000) {
        this.pendingRescanConfigs.delete(id);
      }
    }
  }
}

export const monitoringService = new MonitoringService();
