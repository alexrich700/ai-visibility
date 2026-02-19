import { db, pool } from "./db";
import { 
  audits, leads, InsertAudit, InsertLead, Audit, DbLead,
  monitoringClients, monitoringGroups, monitoringPrompts, checkResults, checkSessions,
  checkGroupMetrics, checkCompetitorMetrics, scanJobs, clientSessions, adminSessions,
  InsertMonitoringClient, InsertMonitoringGroup, InsertMonitoringPrompt, InsertCheckResult, InsertCheckSession,
  InsertCheckGroupMetric, InsertCheckCompetitorMetric, InsertScanJob,
  MonitoringClient, MonitoringGroup, MonitoringPrompt, CheckResult, CheckSession,
  CheckGroupMetric, CheckCompetitorMetric, ScanJob, ClientSession as DbClientSession, AdminSession as DbAdminSession,
  adminUsers, InsertAdminUser, AdminUser
} from "@shared/schema";
import { eq, desc, and, lte, lt, isNull, or, isNotNull, gte, asc, inArray, sql } from "drizzle-orm";

export function normalizeBusinessNameForLookup(businessName: string): string {
  return businessName.trim().toLowerCase();
}

export function normalizeDomainForLookup(domain: string): string {
  // Intentionally conservative normalization: strip protocol, trim/lowercase, and remove trailing slashes.
  // We intentionally keep subdomains (including "www."), ports, paths, and query strings unchanged.
  return domain
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/+$/, "");
}

export interface IStorage {
  createAudit(audit: InsertAudit): Promise<Audit>;
  getAudits(): Promise<Audit[]>;
  getAuditById(id: number): Promise<Audit | undefined>;
  getAuditByShareToken(token: string): Promise<Audit | undefined>;
  updateAuditShareToken(id: number, shareToken: string): Promise<Audit | undefined>;
  createLead(lead: InsertLead): Promise<DbLead>;
  getLeads(): Promise<DbLead[]>;
  getLeadById(id: number): Promise<DbLead | undefined>;
  updateLeadStatus(id: number, status: string): Promise<DbLead | undefined>;
  getAuditsWithLeads(): Promise<(Audit & { lead?: DbLead })[]>;
  
  // Monitoring client operations
  createMonitoringClient(client: InsertMonitoringClient): Promise<MonitoringClient>;
  getMonitoringClients(): Promise<MonitoringClient[]>;
  getMonitoringClientById(id: number): Promise<MonitoringClient | undefined>;
  getMonitoringClientByAccessToken(token: string): Promise<MonitoringClient | undefined>;
  getMonitoringClientByBusinessNameAndDomain(businessName: string, domain: string): Promise<MonitoringClient | undefined>;
  updateMonitoringClient(id: number, data: Partial<InsertMonitoringClient>): Promise<MonitoringClient | undefined>;
  deleteMonitoringClient(id: number): Promise<void>;
  
  // Group operations
  createGroup(group: InsertMonitoringGroup): Promise<MonitoringGroup>;
  getGroupsByClientId(clientId: number): Promise<MonitoringGroup[]>;
  updateGroup(id: number, data: Partial<InsertMonitoringGroup>): Promise<MonitoringGroup | undefined>;
  deleteGroup(id: number): Promise<void>;
  
  // Prompt operations
  createPrompt(prompt: InsertMonitoringPrompt): Promise<MonitoringPrompt>;
  getPromptsByGroupId(groupId: number): Promise<MonitoringPrompt[]>;
  getPromptsByClientId(clientId: number): Promise<MonitoringPrompt[]>;
  updatePrompt(id: number, data: Partial<InsertMonitoringPrompt>): Promise<MonitoringPrompt | undefined>;
  deletePrompt(id: number): Promise<void>;
  
  // Check result operations
  createCheckResult(result: InsertCheckResult): Promise<CheckResult>;
  getCheckResultsByClientId(clientId: number): Promise<CheckResult[]>;
  getCheckResultsByGroupId(groupId: number): Promise<CheckResult[]>;
  getCheckResultsBySessionId(sessionId: number): Promise<CheckResult[]>;
  
  // Check session operations
  createCheckSession(session: InsertCheckSession): Promise<CheckSession>;
  getCheckSessionsByClientId(clientId: number): Promise<CheckSession[]>;
  getCheckSessionByPrepareId(prepareId: string): Promise<CheckSession | undefined>;
  getCheckSessionById(sessionId: number): Promise<CheckSession | undefined>;
  getResumableSessions(clientId: number): Promise<CheckSession[]>;
  updateCheckSession(id: number, data: Partial<InsertCheckSession>): Promise<CheckSession | undefined>;
  
  // Group metrics operations (for trending by group)
  createCheckGroupMetric(metric: InsertCheckGroupMetric): Promise<CheckGroupMetric>;
  getGroupMetricsByClientId(clientId: number): Promise<CheckGroupMetric[]>;
  getGroupMetricsBySessionId(sessionId: number): Promise<CheckGroupMetric[]>;
  
  // Competitor metrics operations (for competitor trending)
  createCheckCompetitorMetric(metric: InsertCheckCompetitorMetric): Promise<CheckCompetitorMetric>;
  getCompetitorMetricsByClientId(clientId: number): Promise<CheckCompetitorMetric[]>;
  getCompetitorMetricsBySessionId(sessionId: number): Promise<CheckCompetitorMetric[]>;
  
  // Scheduled check operations
  getClientsDueForCheck(): Promise<MonitoringClient[]>;
  
  // Admin user operations
  createAdminUser(user: InsertAdminUser): Promise<AdminUser>;
  getAdminUserByEmail(email: string): Promise<AdminUser | undefined>;
  getAdminUserById(id: number): Promise<AdminUser | undefined>;
  getAdminUserByResetToken(token: string): Promise<AdminUser | undefined>;
  getAdminUsersWithPendingReset(): Promise<AdminUser[]>;
  updateAdminUser(id: number, data: Partial<InsertAdminUser>): Promise<AdminUser | undefined>;
  
  // Scan job operations (background job queue)
  createScanJob(job: InsertScanJob): Promise<ScanJob>;
  getScanJobById(id: number): Promise<ScanJob | undefined>;
  getScanJobsByClientId(clientId: number): Promise<ScanJob[]>;
  getQueuedScanJobs(): Promise<ScanJob[]>;
  getRunningScanJobs(): Promise<ScanJob[]>;
  getOrphanedJobs(staleQueuedThresholdMs: number): Promise<ScanJob[]>; // Get running jobs + stale queued jobs
  getActiveScanJobForClient(clientId: number): Promise<ScanJob | undefined>;
  claimQueuedJob(): Promise<ScanJob | null>; // Atomically claim a queued job for processing
  updateScanJob(id: number, data: Partial<InsertScanJob & { startedAt?: Date; lastProgressAt?: Date; completedAt?: Date }>): Promise<ScanJob | undefined>;
  deleteScanJob(id: number): Promise<void>;
  
  // Client session operations (for client portal auth)
  createClientSession(clientId: number, sessionToken: string, expiresAt: Date): Promise<DbClientSession>;
  getClientSessionByToken(token: string): Promise<DbClientSession | undefined>;
  deleteClientSession(token: string): Promise<void>;
  deleteExpiredClientSessions(): Promise<number>;
  
  // Admin session operations (for admin portal auth - database-backed for persistence)
  createAdminSession(sessionToken: string, expiresAt: Date): Promise<DbAdminSession>;
  getAdminSessionByToken(token: string): Promise<DbAdminSession | undefined>;
  deleteAdminSession(token: string): Promise<void>;
  deleteExpiredAdminSessions(): Promise<number>;
}

export class DatabaseStorage implements IStorage {
  async createAudit(auditData: InsertAudit): Promise<Audit> {
    const [audit] = await db.insert(audits).values(auditData).returning();
    return audit;
  }

  async getAudits(): Promise<Audit[]> {
    return await db.select().from(audits).orderBy(desc(audits.createdAt));
  }

  async getAuditById(id: number): Promise<Audit | undefined> {
    const [audit] = await db.select().from(audits).where(eq(audits.id, id));
    return audit;
  }

  async getAuditByShareToken(token: string): Promise<Audit | undefined> {
    const [audit] = await db.select().from(audits).where(eq(audits.shareToken, token));
    return audit;
  }

  async updateAuditShareToken(id: number, shareToken: string): Promise<Audit | undefined> {
    const [audit] = await db
      .update(audits)
      .set({ shareToken })
      .where(eq(audits.id, id))
      .returning();
    return audit;
  }

  async createLead(leadData: InsertLead): Promise<DbLead> {
    const [lead] = await db.insert(leads).values(leadData).returning();
    return lead;
  }

  async getLeads(): Promise<DbLead[]> {
    return await db.select().from(leads).orderBy(desc(leads.createdAt));
  }

  async getLeadById(id: number): Promise<DbLead | undefined> {
    const [lead] = await db.select().from(leads).where(eq(leads.id, id));
    return lead;
  }

  async updateLeadStatus(id: number, status: string): Promise<DbLead | undefined> {
    const [lead] = await db
      .update(leads)
      .set({ status, updatedAt: new Date() })
      .where(eq(leads.id, id))
      .returning();
    return lead;
  }

  async getAuditsWithLeads(): Promise<(Audit & { lead?: DbLead })[]> {
    const results = await db
      .select({
        audit: audits,
        lead: leads,
      })
      .from(audits)
      .leftJoin(leads, eq(audits.id, leads.auditId))
      .orderBy(desc(audits.createdAt));
    
    return results.map(row => ({
      ...row.audit,
      lead: row.lead ?? undefined,
    }));
  }

  // Monitoring client operations
  async createMonitoringClient(clientData: InsertMonitoringClient): Promise<MonitoringClient> {
    const nextCheck = new Date();
    nextCheck.setDate(nextCheck.getDate() + (clientData.checkFrequencyDays || 14));
    
    const [client] = await db.insert(monitoringClients).values({
      ...clientData,
      normalizedBusinessName: normalizeBusinessNameForLookup(clientData.businessName),
      normalizedDomain: normalizeDomainForLookup(clientData.domain),
      nextCheckAt: nextCheck,
    }).returning();
    return client;
  }

  async getMonitoringClients(): Promise<MonitoringClient[]> {
    return await db.select().from(monitoringClients).orderBy(desc(monitoringClients.createdAt));
  }

  async getMonitoringClientById(id: number): Promise<MonitoringClient | undefined> {
    const [client] = await db.select().from(monitoringClients).where(eq(monitoringClients.id, id));
    return client;
  }

  async getMonitoringClientByAccessToken(token: string): Promise<MonitoringClient | undefined> {
    if (!token) return undefined;
    const [client] = await db.select().from(monitoringClients).where(eq(monitoringClients.clientAccessToken, token));
    return client;
  }

  async getMonitoringClientByBusinessNameAndDomain(businessName: string, domain: string): Promise<MonitoringClient | undefined> {
    if (!businessName || !domain) return undefined;

    const normalizedName = normalizeBusinessNameForLookup(businessName);
    const normalizedDomain = normalizeDomainForLookup(domain);

    const [client] = await db.select()
      .from(monitoringClients)
      .where(and(
        eq(monitoringClients.normalizedBusinessName, normalizedName),
        eq(monitoringClients.normalizedDomain, normalizedDomain),
      ))
      .orderBy(desc(monitoringClients.createdAt))
      .limit(1);

    if (client) return client;

    // Fallback for rows that predate normalized-column backfill.
    const [legacyClient] = await db.select()
      .from(monitoringClients)
      .where(and(
        eq(sql`lower(trim(${monitoringClients.businessName}))`, normalizedName),
        eq(sql`regexp_replace(regexp_replace(lower(trim(${monitoringClients.domain})), '^https?://', ''), '/+$', '')`, normalizedDomain),
      ))
      .orderBy(desc(monitoringClients.createdAt))
      .limit(1);

    return legacyClient;
  }

  async updateMonitoringClient(id: number, data: Partial<InsertMonitoringClient>): Promise<MonitoringClient | undefined> {
    return await db.transaction(async (tx) => {
      const [updatedClient] = await tx
        .update(monitoringClients)
        .set({
          ...data,
          updatedAt: new Date(),
        })
        .where(eq(monitoringClients.id, id))
        .returning({ id: monitoringClients.id });

      if (!updatedClient) return undefined;

      const [client] = await tx
        .update(monitoringClients)
        .set({
          normalizedBusinessName: sql`lower(trim(${monitoringClients.businessName}))`,
          normalizedDomain: sql`regexp_replace(regexp_replace(lower(trim(${monitoringClients.domain})), '^https?://', ''), '/+$', '')`,
        })
        .where(eq(monitoringClients.id, id))
        .returning();

      return client;
    });
  }

  async deleteMonitoringClient(id: number): Promise<void> {
    // Delete in order respecting foreign key constraints:
    // 1. Delete check results (depends on sessions and prompts)
    await db.delete(checkResults).where(eq(checkResults.clientId, id));
    // 2. Delete group metrics (depends on sessions)
    await db.delete(checkGroupMetrics).where(eq(checkGroupMetrics.clientId, id));
    // 3. Delete competitor metrics (depends on sessions)
    await db.delete(checkCompetitorMetrics).where(eq(checkCompetitorMetrics.clientId, id));
    // 4. Delete check sessions
    await db.delete(checkSessions).where(eq(checkSessions.clientId, id));
    // 5. Delete prompts (get groups first, then delete prompts by group)
    const groups = await this.getGroupsByClientId(id);
    for (const group of groups) {
      await db.delete(monitoringPrompts).where(eq(monitoringPrompts.groupId, group.id));
    }
    // 6. Delete groups
    await db.delete(monitoringGroups).where(eq(monitoringGroups.clientId, id));
    // 7. Delete the client
    await db.delete(monitoringClients).where(eq(monitoringClients.id, id));
  }

  // Group operations
  async createGroup(groupData: InsertMonitoringGroup): Promise<MonitoringGroup> {
    const [group] = await db.insert(monitoringGroups).values(groupData).returning();
    return group;
  }

  async getGroupsByClientId(clientId: number): Promise<MonitoringGroup[]> {
    return await db.select().from(monitoringGroups)
      .where(eq(monitoringGroups.clientId, clientId))
      .orderBy(monitoringGroups.createdAt);
  }

  async updateGroup(id: number, data: Partial<InsertMonitoringGroup>): Promise<MonitoringGroup | undefined> {
    const [group] = await db
      .update(monitoringGroups)
      .set(data)
      .where(eq(monitoringGroups.id, id))
      .returning();
    return group;
  }

  async deleteGroup(id: number): Promise<void> {
    await db.delete(monitoringPrompts).where(eq(monitoringPrompts.groupId, id));
    await db.delete(monitoringGroups).where(eq(monitoringGroups.id, id));
  }

  // Prompt operations
  async createPrompt(promptData: InsertMonitoringPrompt): Promise<MonitoringPrompt> {
    const [prompt] = await db.insert(monitoringPrompts).values(promptData).returning();
    return prompt;
  }

  async getPromptsByGroupId(groupId: number): Promise<MonitoringPrompt[]> {
    return await db.select().from(monitoringPrompts)
      .where(eq(monitoringPrompts.groupId, groupId))
      .orderBy(monitoringPrompts.createdAt);
  }

  async getPromptsByClientId(clientId: number): Promise<MonitoringPrompt[]> {
    const results = await db
      .select({
        prompt: monitoringPrompts,
      })
      .from(monitoringPrompts)
      .innerJoin(monitoringGroups, eq(monitoringPrompts.groupId, monitoringGroups.id))
      .where(eq(monitoringGroups.clientId, clientId))
      .orderBy(monitoringPrompts.createdAt);
    
    return results.map(r => r.prompt);
  }

  async updatePrompt(id: number, data: Partial<InsertMonitoringPrompt>): Promise<MonitoringPrompt | undefined> {
    const [prompt] = await db
      .update(monitoringPrompts)
      .set(data)
      .where(eq(monitoringPrompts.id, id))
      .returning();
    return prompt;
  }

  async deletePrompt(id: number): Promise<void> {
    await db.delete(monitoringPrompts).where(eq(monitoringPrompts.id, id));
  }

  // Check result operations
  async createCheckResult(resultData: InsertCheckResult): Promise<CheckResult> {
    const [result] = await db.insert(checkResults).values(resultData).returning();
    return result;
  }

  async getCheckResultsByClientId(clientId: number): Promise<CheckResult[]> {
    return await db.select().from(checkResults)
      .where(eq(checkResults.clientId, clientId))
      .orderBy(desc(checkResults.checkedAt));
  }

  async getCheckResultsByGroupId(groupId: number): Promise<CheckResult[]> {
    return await db.select().from(checkResults)
      .where(eq(checkResults.groupId, groupId))
      .orderBy(desc(checkResults.checkedAt));
  }

  async getCheckResultsBySessionId(sessionId: number): Promise<CheckResult[]> {
    return await db.select().from(checkResults)
      .where(eq(checkResults.sessionId, sessionId))
      .orderBy(desc(checkResults.checkedAt));
  }

  // Check session operations
  async createCheckSession(sessionData: InsertCheckSession): Promise<CheckSession> {
    const [session] = await db.insert(checkSessions).values(sessionData).returning();
    return session;
  }

  async getCheckSessionsByClientId(clientId: number): Promise<CheckSession[]> {
    return await db.select().from(checkSessions)
      .where(eq(checkSessions.clientId, clientId))
      .orderBy(desc(checkSessions.createdAt));
  }

  async getCheckSessionByPrepareId(prepareId: string): Promise<CheckSession | undefined> {
    const [session] = await db.select().from(checkSessions)
      .where(eq(checkSessions.prepareId, prepareId));
    return session;
  }

  async getCheckSessionById(sessionId: number): Promise<CheckSession | undefined> {
    const [session] = await db.select().from(checkSessions)
      .where(eq(checkSessions.id, sessionId));
    return session;
  }

  async getResumableSessions(clientId: number): Promise<CheckSession[]> {
    return await db.select().from(checkSessions)
      .where(
        and(
          eq(checkSessions.clientId, clientId),
          or(
            eq(checkSessions.status, 'running'),
            eq(checkSessions.status, 'paused')
          )
        )
      )
      .orderBy(desc(checkSessions.createdAt));
  }

  async updateCheckSession(id: number, data: Partial<InsertCheckSession>): Promise<CheckSession | undefined> {
    const [session] = await db
      .update(checkSessions)
      .set(data)
      .where(eq(checkSessions.id, id))
      .returning();
    return session;
  }

  // Group metrics operations
  async createCheckGroupMetric(metricData: InsertCheckGroupMetric): Promise<CheckGroupMetric> {
    const [metric] = await db.insert(checkGroupMetrics).values(metricData).returning();
    return metric;
  }

  async getGroupMetricsByClientId(clientId: number): Promise<CheckGroupMetric[]> {
    return await db.select().from(checkGroupMetrics)
      .where(eq(checkGroupMetrics.clientId, clientId))
      .orderBy(desc(checkGroupMetrics.createdAt));
  }

  async getGroupMetricsBySessionId(sessionId: number): Promise<CheckGroupMetric[]> {
    return await db.select().from(checkGroupMetrics)
      .where(eq(checkGroupMetrics.sessionId, sessionId))
      .orderBy(checkGroupMetrics.groupName);
  }

  // Competitor metrics operations
  async createCheckCompetitorMetric(metricData: InsertCheckCompetitorMetric): Promise<CheckCompetitorMetric> {
    const [metric] = await db.insert(checkCompetitorMetrics).values(metricData).returning();
    return metric;
  }

  async getCompetitorMetricsByClientId(clientId: number): Promise<CheckCompetitorMetric[]> {
    return await db.select().from(checkCompetitorMetrics)
      .where(eq(checkCompetitorMetrics.clientId, clientId))
      .orderBy(desc(checkCompetitorMetrics.createdAt));
  }

  async getCompetitorMetricsBySessionId(sessionId: number): Promise<CheckCompetitorMetric[]> {
    return await db.select().from(checkCompetitorMetrics)
      .where(eq(checkCompetitorMetrics.sessionId, sessionId))
      .orderBy(desc(checkCompetitorMetrics.mentionCount));
  }

  // Scheduled check operations - get active clients whose nextCheckAt is in the past or null
  async getClientsDueForCheck(): Promise<MonitoringClient[]> {
    const now = new Date();
    return await db.select().from(monitoringClients)
      .where(
        and(
          eq(monitoringClients.isActive, true),
          or(
            lte(monitoringClients.nextCheckAt, now),
            isNull(monitoringClients.nextCheckAt)
          )
        )
      )
      .orderBy(monitoringClients.nextCheckAt);
  }

  // Admin user operations
  async createAdminUser(userData: InsertAdminUser): Promise<AdminUser> {
    const [user] = await db.insert(adminUsers).values(userData).returning();
    return user;
  }

  async getAdminUserByEmail(email: string): Promise<AdminUser | undefined> {
    const [user] = await db.select().from(adminUsers).where(eq(adminUsers.email, email.toLowerCase()));
    return user;
  }

  async getAdminUserById(id: number): Promise<AdminUser | undefined> {
    const [user] = await db.select().from(adminUsers).where(eq(adminUsers.id, id));
    return user;
  }

  async getAdminUserByResetToken(token: string): Promise<AdminUser | undefined> {
    const [user] = await db.select().from(adminUsers).where(eq(adminUsers.resetToken, token));
    return user;
  }

  async getAdminUsersWithPendingReset(): Promise<AdminUser[]> {
    const now = new Date();
    return await db.select().from(adminUsers)
      .where(
        and(
          isNotNull(adminUsers.resetToken),
          gte(adminUsers.resetTokenExpiry, now)
        )
      );
  }

  async updateAdminUser(id: number, data: Partial<InsertAdminUser>): Promise<AdminUser | undefined> {
    const [user] = await db
      .update(adminUsers)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(adminUsers.id, id))
      .returning();
    return user;
  }

  // Scan job operations (background job queue)
  async createScanJob(jobData: InsertScanJob): Promise<ScanJob> {
    const [job] = await db.insert(scanJobs).values(jobData).returning();
    return job;
  }

  async getScanJobById(id: number): Promise<ScanJob | undefined> {
    const [job] = await db.select().from(scanJobs).where(eq(scanJobs.id, id));
    return job;
  }

  async getScanJobsByClientId(clientId: number): Promise<ScanJob[]> {
    return await db.select().from(scanJobs)
      .where(eq(scanJobs.clientId, clientId))
      .orderBy(desc(scanJobs.createdAt));
  }

  async getQueuedScanJobs(): Promise<ScanJob[]> {
    return await db.select().from(scanJobs)
      .where(eq(scanJobs.status, 'queued'))
      .orderBy(asc(scanJobs.createdAt)); // FIFO: oldest jobs first
  }

  async getRunningScanJobs(): Promise<ScanJob[]> {
    return await db.select().from(scanJobs)
      .where(eq(scanJobs.status, 'running'))
      .orderBy(asc(scanJobs.startedAt));
  }

  async getOrphanedJobs(staleQueuedThresholdMs: number): Promise<ScanJob[]> {
    // Get all running jobs (always considered potentially orphaned after restart)
    // AND queued jobs older than threshold (stuck in queue)
    const staleThreshold = new Date(Date.now() - staleQueuedThresholdMs);
    
    const runningJobs = await db.select().from(scanJobs)
      .where(eq(scanJobs.status, 'running'));
    
    const staleQueuedJobs = await db.select().from(scanJobs)
      .where(
        and(
          eq(scanJobs.status, 'queued'),
          lt(scanJobs.createdAt, staleThreshold)
        )
      );
    
    return [...runningJobs, ...staleQueuedJobs];
  }

  async getActiveScanJobForClient(clientId: number): Promise<ScanJob | undefined> {
    const [job] = await db.select().from(scanJobs)
      .where(
        and(
          eq(scanJobs.clientId, clientId),
          inArray(scanJobs.status, ['queued', 'running'])
        )
      )
      .orderBy(desc(scanJobs.createdAt))
      .limit(1);
    return job;
  }

  async claimQueuedJob(): Promise<ScanJob | null> {
    // Uses database-level locking with FOR UPDATE SKIP LOCKED to atomically claim a job
    // This ensures safe distributed processing across multiple server instances:
    // - FOR UPDATE locks the selected row
    // - SKIP LOCKED causes other workers to skip already-locked rows
    // - All within a single transaction for atomic claim
    
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      // Select and lock the oldest queued job, skipping any that are already locked by other workers
      const selectResult = await client.query<ScanJob>(`
        SELECT * FROM scan_jobs 
        WHERE status = 'queued' 
        ORDER BY created_at ASC 
        LIMIT 1 
        FOR UPDATE SKIP LOCKED
      `);
      
      if (selectResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return null;
      }
      
      const job = selectResult.rows[0];
      const now = new Date();
      
      // Update the job to 'running' while still holding the lock
      const updateResult = await client.query<ScanJob>(`
        UPDATE scan_jobs 
        SET status = 'running', 
            started_at = $1, 
            last_progress_at = $2, 
            progress_message = 'Starting scan...'
        WHERE id = $3
        RETURNING *
      `, [now, now, job.id]);
      
      await client.query('COMMIT');
      
      if (updateResult.rows.length === 0) {
        return null;
      }
      
      // Map snake_case columns to camelCase for TypeScript
      const row = updateResult.rows[0];
      return {
        id: row.id,
        clientId: (row as any).client_id ?? row.clientId,
        targetCity: (row as any).target_city ?? row.targetCity,
        status: row.status,
        progress: row.progress,
        progressMessage: (row as any).progress_message ?? row.progressMessage,
        completedPrompts: (row as any).completed_prompts ?? row.completedPrompts,
        totalPrompts: (row as any).total_prompts ?? row.totalPrompts,
        sessionId: (row as any).session_id ?? row.sessionId,
        errorMessage: (row as any).error_message ?? row.errorMessage,
        resultScore: (row as any).result_score ?? row.resultScore,
        startedAt: (row as any).started_at ?? row.startedAt,
        lastProgressAt: (row as any).last_progress_at ?? row.lastProgressAt,
        completedAt: (row as any).completed_at ?? row.completedAt,
        createdAt: (row as any).created_at ?? row.createdAt,
      } as ScanJob;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async updateScanJob(id: number, data: Partial<InsertScanJob & { startedAt?: Date; lastProgressAt?: Date; completedAt?: Date }>): Promise<ScanJob | undefined> {
    const [job] = await db
      .update(scanJobs)
      .set(data)
      .where(eq(scanJobs.id, id))
      .returning();
    return job;
  }

  async deleteScanJob(id: number): Promise<void> {
    await db.delete(scanJobs).where(eq(scanJobs.id, id));
  }

  // Client session operations
  async createClientSession(clientId: number, sessionToken: string, expiresAt: Date): Promise<DbClientSession> {
    const [session] = await db.insert(clientSessions).values({
      clientId,
      sessionToken,
      expiresAt,
    }).returning();
    return session;
  }

  async getClientSessionByToken(token: string): Promise<DbClientSession | undefined> {
    const [session] = await db.select().from(clientSessions)
      .where(and(
        eq(clientSessions.sessionToken, token),
        gte(clientSessions.expiresAt, new Date())
      ));
    return session;
  }

  async deleteClientSession(token: string): Promise<void> {
    await db.delete(clientSessions).where(eq(clientSessions.sessionToken, token));
  }

  async deleteExpiredClientSessions(): Promise<number> {
    const result = await db.delete(clientSessions)
      .where(lte(clientSessions.expiresAt, new Date()))
      .returning();
    return result.length;
  }

  // Admin session operations (database-backed for persistence across restarts)
  async createAdminSession(sessionToken: string, expiresAt: Date): Promise<DbAdminSession> {
    const [session] = await db.insert(adminSessions).values({
      sessionToken,
      expiresAt,
    }).returning();
    return session;
  }

  async getAdminSessionByToken(token: string): Promise<DbAdminSession | undefined> {
    const [session] = await db.select().from(adminSessions)
      .where(and(
        eq(adminSessions.sessionToken, token),
        gte(adminSessions.expiresAt, new Date())
      ));
    return session;
  }

  async deleteAdminSession(token: string): Promise<void> {
    await db.delete(adminSessions).where(eq(adminSessions.sessionToken, token));
  }

  async deleteExpiredAdminSessions(): Promise<number> {
    const result = await db.delete(adminSessions)
      .where(lte(adminSessions.expiresAt, new Date()))
      .returning();
    return result.length;
  }
}

export const storage = new DatabaseStorage();
