import { EventEmitter } from 'events';
import { storage } from '../../storage';

export interface QueueJob {
  id: string;
  auditId: number;
  priority: number;
  createdAt: number;
  status: 'queued' | 'running' | 'completed' | 'failed';
}

export interface QueueConfig {
  maxConcurrent: number;
  maxQueued: number;
}

const DEFAULT_CONFIG: QueueConfig = {
  maxConcurrent: 5,
  maxQueued: 50,
};

export type StageProcessor = (auditId: number) => Promise<void>;

export interface PipelineStage {
  name: string;
  processor: StageProcessor;
}

class AuditJobQueue extends EventEmitter {
  private queue: QueueJob[] = [];
  private running: Map<string, QueueJob> = new Map();
  private config: QueueConfig;
  private processors: Map<string, (auditId: number) => Promise<void>> = new Map();

  constructor(config?: Partial<QueueConfig>) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  getStatus(): { queued: number; running: number; maxConcurrent: number; maxQueued: number } {
    return {
      queued: this.queue.length,
      running: this.running.size,
      maxConcurrent: this.config.maxConcurrent,
      maxQueued: this.config.maxQueued,
    };
  }

  enqueue(auditId: number, processor: (auditId: number) => Promise<void>): QueueJob {
    if (this.queue.length >= this.config.maxQueued) {
      throw new Error(`Queue is full (${this.config.maxQueued} max). Please try again later.`);
    }

    const existingJob = this.queue.find(j => j.auditId === auditId) ||
                        Array.from(this.running.values()).find(j => j.auditId === auditId);
    if (existingJob) {
      throw new Error(`Audit ${auditId} is already in the queue or running.`);
    }

    const job: QueueJob = {
      id: `audit-${auditId}-${Date.now()}`,
      auditId,
      priority: 0,
      createdAt: Date.now(),
      status: 'queued',
    };

    this.queue.push(job);
    this.processors.set(job.id, processor);
    this.emit('job_queued', job);
    this.processNext();

    return job;
  }

  private async processNext(): Promise<void> {
    if (this.running.size >= this.config.maxConcurrent) return;
    if (this.queue.length === 0) return;

    this.queue.sort((a, b) => {
      if (a.priority !== b.priority) return b.priority - a.priority;
      return a.createdAt - b.createdAt;
    });

    const job = this.queue.shift();
    if (!job) return;

    const processor = this.processors.get(job.id);
    if (!processor) {
      console.error(`[AuditQueue] No processor found for job ${job.id}`);
      return;
    }

    job.status = 'running';
    this.running.set(job.id, job);
    this.emit('job_started', job);

    try {
      await processor(job.auditId);
      job.status = 'completed';
      this.emit('job_completed', job);
    } catch (error) {
      job.status = 'failed';
      const errMsg = error instanceof Error ? error.message : String(error);
      console.error(`[AuditQueue] Job ${job.id} failed:`, errMsg);
      this.emit('job_failed', job, errMsg);
    } finally {
      this.running.delete(job.id);
      this.processors.delete(job.id);
      this.processNext();
    }
  }

  getJobByAuditId(auditId: number): QueueJob | undefined {
    const queued = this.queue.find(j => j.auditId === auditId);
    if (queued) return queued;
    return Array.from(this.running.values()).find(j => j.auditId === auditId);
  }

  getQueuedJobs(): QueueJob[] {
    return [...this.queue];
  }

  getRunningJobs(): QueueJob[] {
    return Array.from(this.running.values());
  }

  cancelJob(auditId: number): boolean {
    const idx = this.queue.findIndex(j => j.auditId === auditId);
    if (idx !== -1) {
      const [removed] = this.queue.splice(idx, 1);
      this.processors.delete(removed.id);
      this.emit('job_cancelled', removed);
      return true;
    }
    return false;
  }
}

export const auditQueue = new AuditJobQueue();

export interface StageResult {
  skipped?: boolean;
  skipReason?: string;
}

export async function runStageWithLogging(
  auditId: number,
  stageName: string,
  stageIndex: number,
  processor: () => Promise<StageResult | void>
): Promise<void> {
  const stageLog = await storage.createAuditStageLog({
    auditId,
    stage: stageName,
    stageIndex,
    status: 'running',
  });

  try {
    const result = await processor();

    if (result?.skipped) {
      await storage.updateAuditStageLog(stageLog.id, {
        status: 'skipped',
        errorMessage: result.skipReason || 'Stage skipped',
        metadata: { skipped: true, skipReason: result.skipReason },
        completedAt: new Date(),
      });
    } else {
      await storage.updateAuditStageLog(stageLog.id, {
        status: 'completed',
        completedAt: new Date(),
      });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    await storage.updateAuditStageLog(stageLog.id, {
      status: 'failed',
      errorMessage,
      completedAt: new Date(),
    });

    throw error;
  }
}

export async function runPipelineWithLogging(
  auditId: number,
  stages: PipelineStage[]
): Promise<void> {
  for (let i = 0; i < stages.length; i++) {
    const stage = stages[i];
    await runStageWithLogging(auditId, stage.name, i, () => stage.processor(auditId));
  }
}
