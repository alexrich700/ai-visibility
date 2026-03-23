import { db, pool } from "./db";
import { 
  audits, leads, InsertAudit, InsertLead, Audit, DbLead,
  monitoringClients, monitoringGroups, monitoringPrompts, checkResults, checkSessions,
  checkGroupMetrics, checkCompetitorMetrics, scanJobs, clientSessions, adminSessions,
  InsertMonitoringClient, InsertMonitoringGroup, InsertMonitoringPrompt, InsertCheckResult, InsertCheckSession,
  InsertCheckGroupMetric, InsertCheckCompetitorMetric, InsertScanJob,
  MonitoringClient, MonitoringGroup, MonitoringPrompt, CheckResult, CheckSession,
  CheckGroupMetric, CheckCompetitorMetric, ScanJob, ClientSession as DbClientSession, AdminSession as DbAdminSession,
  adminUsers, InsertAdminUser, AdminUser,
  seoAudits, InsertSeoAudit, SeoAudit,
  auditKeywords, InsertAuditKeyword, AuditKeyword,
  auditGeoGrids, InsertAuditGeoGrid, AuditGeoGrid,
  auditGeoGridPoints, InsertAuditGeoGridPoint, AuditGeoGridPoint,
  auditTechnicalFindings, InsertAuditTechnicalFinding, AuditTechnicalFinding,
  auditCompetitors, InsertAuditCompetitor, AuditCompetitor,
  auditContentGaps, InsertAuditContentGap, AuditContentGap,
  auditReviews, InsertAuditReview, AuditReview,
  auditDeliverables, InsertAuditDeliverable, AuditDeliverable,
  auditPpcForecast, InsertAuditPpcForecast, AuditPpcForecast,
  auditStageLog, InsertAuditStageLog, AuditStageLog,
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
  getAuditsWithLeadsPaginated(options: {
    page: number;
    limit: number;
    search?: string;
    hasLead?: boolean;
    status?: string;
  }): Promise<{ data: (Audit & { lead?: DbLead })[]; total: number }>;
  
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
  deleteCheckSession(sessionId: number): Promise<void>;
  deleteCheckSessionsByDateAndCity(clientId: number, date: string, city?: string | null): Promise<number>;
  
  // Group metrics operations (for trending by group)
  createCheckGroupMetric(metric: InsertCheckGroupMetric): Promise<CheckGroupMetric>;
  getGroupMetricsByClientId(clientId: number): Promise<CheckGroupMetric[]>;
  getGroupMetricsBySessionId(sessionId: number): Promise<CheckGroupMetric[]>;
  
  // Competitor metrics operations (for competitor trending)
  createCheckCompetitorMetric(metric: InsertCheckCompetitorMetric): Promise<CheckCompetitorMetric>;
  getCompetitorMetricsByClientId(clientId: number): Promise<CheckCompetitorMetric[]>;
  getCompetitorMetricsBySessionId(sessionId: number): Promise<CheckCompetitorMetric[]>;
  
  // Batch query operations (for avoiding N+1 patterns)
  getCheckSessionsByClientIds(clientIds: number[]): Promise<Map<number, CheckSession[]>>;
  getCheckResultsBySessionIds(sessionIds: number[]): Promise<CheckResult[]>;
  getGroupCountsByClientIds(clientIds: number[]): Promise<Map<number, number>>;
  getPromptCountsByClientIds(clientIds: number[]): Promise<Map<number, number>>;

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
  
  getAllAdminUsers(): Promise<AdminUser[]>;
  deleteAdminUser(id: number): Promise<void>;

  // Admin session operations (for admin portal auth - database-backed for persistence)
  createAdminSession(sessionToken: string, expiresAt: Date, userId?: number): Promise<DbAdminSession>;
  getAdminSessionByToken(token: string): Promise<DbAdminSession | undefined>;
  deleteAdminSession(token: string): Promise<void>;
  deleteExpiredAdminSessions(): Promise<number>;

  // SEO Audit operations
  createSeoAudit(audit: InsertSeoAudit): Promise<SeoAudit>;
  getSeoAuditById(id: number): Promise<SeoAudit | undefined>;
  getSeoAuditByMagicLink(token: string): Promise<SeoAudit | undefined>;
  getSeoAudits(options?: { status?: string; limit?: number; offset?: number }): Promise<SeoAudit[]>;
  updateSeoAudit(id: number, data: Partial<InsertSeoAudit>): Promise<SeoAudit | undefined>;
  deleteSeoAudit(id: number): Promise<void>;

  // Audit Keywords
  createAuditKeywords(keywords: InsertAuditKeyword[]): Promise<AuditKeyword[]>;
  getAuditKeywordsByAuditId(auditId: number): Promise<AuditKeyword[]>;
  deleteAuditKeywordsByAuditId(auditId: number): Promise<void>;

  // Audit Geo Grids
  createAuditGeoGrid(grid: InsertAuditGeoGrid): Promise<AuditGeoGrid>;
  getAuditGeoGridsByAuditId(auditId: number): Promise<AuditGeoGrid[]>;
  createAuditGeoGridPoints(points: InsertAuditGeoGridPoint[]): Promise<AuditGeoGridPoint[]>;
  getAuditGeoGridPointsByGridId(gridId: number): Promise<AuditGeoGridPoint[]>;

  // Audit Technical Findings
  createAuditTechnicalFindings(findings: InsertAuditTechnicalFinding[]): Promise<AuditTechnicalFinding[]>;
  getAuditTechnicalFindingsByAuditId(auditId: number): Promise<AuditTechnicalFinding[]>;

  // Audit Competitors
  createAuditCompetitors(competitors: InsertAuditCompetitor[]): Promise<AuditCompetitor[]>;
  getAuditCompetitorsByAuditId(auditId: number): Promise<AuditCompetitor[]>;

  // Audit Content Gaps
  createAuditContentGaps(gaps: InsertAuditContentGap[]): Promise<AuditContentGap[]>;
  getAuditContentGapsByAuditId(auditId: number): Promise<AuditContentGap[]>;

  // Audit Reviews
  createAuditReviews(reviews: InsertAuditReview[]): Promise<AuditReview[]>;
  getAuditReviewsByAuditId(auditId: number): Promise<AuditReview[]>;

  // Audit Deliverables
  createAuditDeliverables(deliverables: InsertAuditDeliverable[]): Promise<AuditDeliverable[]>;
  getAuditDeliverablesByAuditId(auditId: number): Promise<AuditDeliverable[]>;

  // Audit PPC Forecast
  createAuditPpcForecasts(forecasts: InsertAuditPpcForecast[]): Promise<AuditPpcForecast[]>;
  getAuditPpcForecastsByAuditId(auditId: number): Promise<AuditPpcForecast[]>;

  // Audit Stage Log
  createAuditStageLog(log: InsertAuditStageLog): Promise<AuditStageLog>;
  getAuditStageLogsByAuditId(auditId: number): Promise<AuditStageLog[]>;
  updateAuditStageLog(id: number, data: Partial<InsertAuditStageLog & { completedAt?: Date }>): Promise<AuditStageLog | undefined>;
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

  async getAuditsWithLeadsPaginated(options: {
    page: number;
    limit: number;
    search?: string;
    hasLead?: boolean;
    status?: string;
  }): Promise<{ data: (Audit & { lead?: DbLead })[]; total: number }> {
    const { page, limit, search, hasLead, status } = options;
    const offset = (page - 1) * limit;

    const conditions: ReturnType<typeof eq>[] = [];

    if (search && search.trim()) {
      const searchLower = `%${search.trim().toLowerCase()}%`;
      conditions.push(
        or(
          sql`lower(${audits.businessName}) like ${searchLower}`,
          sql`lower(${audits.keyword}) like ${searchLower}`,
          sql`lower(${audits.city}) like ${searchLower}`,
          sql`lower(${audits.url}) like ${searchLower}`
        )! as any
      );
    }

    if (hasLead === true) {
      conditions.push(isNotNull(leads.id) as any);
    } else if (hasLead === false) {
      conditions.push(isNull(leads.id) as any);
    }

    if (status) {
      conditions.push(eq(leads.status, status) as any);
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const countResult = await db
      .select({ count: sql<number>`cast(count(distinct ${audits.id}) as int)` })
      .from(audits)
      .leftJoin(leads, eq(audits.id, leads.auditId))
      .where(whereClause);

    const total = countResult[0]?.count ?? 0;

    const results = await db
      .select({
        audit: audits,
        lead: leads,
      })
      .from(audits)
      .leftJoin(leads, eq(audits.id, leads.auditId))
      .where(whereClause)
      .orderBy(desc(audits.createdAt))
      .limit(limit)
      .offset(offset);

    const data = results.map(row => ({
      ...row.audit,
      lead: row.lead ?? undefined,
    }));

    return { data, total };
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
    try {
      await db.transaction(async (tx) => {
        // Delete in order respecting foreign key constraints:
        // 1. Delete scan jobs (references both client and sessions)
        await tx.delete(scanJobs).where(eq(scanJobs.clientId, id));
        // 2. Delete check results (depends on sessions and prompts)
        await tx.delete(checkResults).where(eq(checkResults.clientId, id));
        // 2. Delete group metrics (depends on sessions)
        await tx.delete(checkGroupMetrics).where(eq(checkGroupMetrics.clientId, id));
        // 3. Delete competitor metrics (depends on sessions)
        await tx.delete(checkCompetitorMetrics).where(eq(checkCompetitorMetrics.clientId, id));
        // 4. Delete check sessions
        await tx.delete(checkSessions).where(eq(checkSessions.clientId, id));
        // 5. Delete prompts in batch using subquery (avoids N+1 per group)
        const groupIds = await tx.select({ id: monitoringGroups.id })
          .from(monitoringGroups)
          .where(eq(monitoringGroups.clientId, id));
        if (groupIds.length > 0) {
          await tx.delete(monitoringPrompts).where(
            inArray(monitoringPrompts.groupId, groupIds.map(g => g.id))
          );
        }
        // 6. Delete groups
        await tx.delete(monitoringGroups).where(eq(monitoringGroups.clientId, id));
        // 7. Delete the client
        await tx.delete(monitoringClients).where(eq(monitoringClients.id, id));
      });
    } catch (error) {
      console.error('[DELETE_MONITORING_CLIENT_TRANSACTION] Failed to delete monitoring client', {
        clientId: id,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
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

  async deleteCheckSession(sessionId: number): Promise<void> {
    await db.transaction(async (tx) => {
      await tx.update(scanJobs).set({ sessionId: null }).where(eq(scanJobs.sessionId, sessionId));
      await tx.delete(checkResults).where(eq(checkResults.sessionId, sessionId));
      await tx.delete(checkGroupMetrics).where(eq(checkGroupMetrics.sessionId, sessionId));
      await tx.delete(checkCompetitorMetrics).where(eq(checkCompetitorMetrics.sessionId, sessionId));
      await tx.delete(checkSessions).where(eq(checkSessions.id, sessionId));
    });
  }

  async deleteCheckSessionsByDateAndCity(clientId: number, date: string, city?: string | null): Promise<number> {
    const startOfDay = new Date(date + "T00:00:00.000Z");
    const endOfDay = new Date(date + "T23:59:59.999Z");

    const conditions = [
      eq(checkSessions.clientId, clientId),
      gte(checkSessions.createdAt, startOfDay),
      lte(checkSessions.createdAt, endOfDay),
    ];

    if (city !== undefined) {
      if (city === null) {
        conditions.push(isNull(checkSessions.city));
      } else {
        conditions.push(eq(checkSessions.city, city));
      }
    }

    const sessions = await db.select({ id: checkSessions.id })
      .from(checkSessions)
      .where(and(...conditions));

    const sessionIds = sessions.map(s => s.id);
    if (sessionIds.length > 0) {
      await db.transaction(async (tx) => {
        await tx.update(scanJobs).set({ sessionId: null })
          .where(inArray(scanJobs.sessionId, sessionIds));
        await tx.delete(checkResults)
          .where(inArray(checkResults.sessionId, sessionIds));
        await tx.delete(checkGroupMetrics)
          .where(inArray(checkGroupMetrics.sessionId, sessionIds));
        await tx.delete(checkCompetitorMetrics)
          .where(inArray(checkCompetitorMetrics.sessionId, sessionIds));
        await tx.delete(checkSessions)
          .where(inArray(checkSessions.id, sessionIds));
      });
    }

    return sessionIds.length;
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

  // Batch query operations (for avoiding N+1 patterns)
  async getCheckSessionsByClientIds(clientIds: number[]): Promise<Map<number, CheckSession[]>> {
    if (clientIds.length === 0) return new Map();
    const sessions = await db.select().from(checkSessions)
      .where(inArray(checkSessions.clientId, clientIds))
      .orderBy(desc(checkSessions.createdAt));
    const map = new Map<number, CheckSession[]>();
    for (const s of sessions) {
      if (!map.has(s.clientId)) map.set(s.clientId, []);
      map.get(s.clientId)!.push(s);
    }
    return map;
  }

  async getCheckResultsBySessionIds(sessionIds: number[]): Promise<CheckResult[]> {
    if (sessionIds.length === 0) return [];
    return await db.select().from(checkResults)
      .where(inArray(checkResults.sessionId, sessionIds))
      .orderBy(desc(checkResults.checkedAt));
  }

  async getGroupCountsByClientIds(clientIds: number[]): Promise<Map<number, number>> {
    if (clientIds.length === 0) return new Map();
    const rows = await db
      .select({ clientId: monitoringGroups.clientId, count: sql<number>`count(*)::int` })
      .from(monitoringGroups)
      .where(inArray(monitoringGroups.clientId, clientIds))
      .groupBy(monitoringGroups.clientId);
    return new Map(rows.map(r => [r.clientId, r.count]));
  }

  async getPromptCountsByClientIds(clientIds: number[]): Promise<Map<number, number>> {
    if (clientIds.length === 0) return new Map();
    const rows = await db
      .select({ clientId: monitoringGroups.clientId, count: sql<number>`count(*)::int` })
      .from(monitoringPrompts)
      .innerJoin(monitoringGroups, eq(monitoringPrompts.groupId, monitoringGroups.id))
      .where(inArray(monitoringGroups.clientId, clientIds))
      .groupBy(monitoringGroups.clientId);
    return new Map(rows.map(r => [r.clientId, r.count]));
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
      
      // Select and lock the oldest queued job, skipping any that are already locked by other workers.
      // Also skip jobs whose client already has a running job to serialize per-client processing
      // and prevent overwhelming AI APIs with concurrent scans for the same client.
      const selectResult = await client.query<ScanJob>(`
        SELECT * FROM scan_jobs 
        WHERE status = 'queued' 
          AND client_id NOT IN (SELECT client_id FROM scan_jobs WHERE status = 'running')
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

  async getAllAdminUsers(): Promise<AdminUser[]> {
    return await db.select().from(adminUsers).orderBy(adminUsers.createdAt);
  }

  async deleteAdminUser(id: number): Promise<void> {
    await db.delete(adminUsers).where(eq(adminUsers.id, id));
  }

  // Admin session operations (database-backed for persistence across restarts)
  async createAdminSession(sessionToken: string, expiresAt: Date, userId?: number): Promise<DbAdminSession> {
    const [session] = await db.insert(adminSessions).values({
      sessionToken,
      userId: userId ?? null,
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

  // ============================================
  // SEO AUDIT OPERATIONS
  // ============================================

  async createSeoAudit(auditData: InsertSeoAudit): Promise<SeoAudit> {
    const [audit] = await db.insert(seoAudits).values(auditData).returning();
    return audit;
  }

  async getSeoAuditById(id: number): Promise<SeoAudit | undefined> {
    const [audit] = await db.select().from(seoAudits).where(eq(seoAudits.id, id));
    return audit;
  }

  async getSeoAuditByMagicLink(token: string): Promise<SeoAudit | undefined> {
    const [audit] = await db.select().from(seoAudits).where(eq(seoAudits.magicLinkToken, token));
    return audit;
  }

  async getSeoAudits(options?: { status?: string; limit?: number; offset?: number }): Promise<SeoAudit[]> {
    const conditions: ReturnType<typeof eq>[] = [];
    if (options?.status) {
      conditions.push(eq(seoAudits.status, options.status) as any);
    }
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    return await db.select().from(seoAudits)
      .where(whereClause)
      .orderBy(desc(seoAudits.createdAt))
      .limit(options?.limit || 100)
      .offset(options?.offset || 0);
  }

  async updateSeoAudit(id: number, data: Partial<InsertSeoAudit>): Promise<SeoAudit | undefined> {
    const [audit] = await db
      .update(seoAudits)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(seoAudits.id, id))
      .returning();
    return audit;
  }

  async deleteSeoAudit(id: number): Promise<void> {
    await db.transaction(async (tx) => {
      const grids = await tx.select({ id: auditGeoGrids.id }).from(auditGeoGrids).where(eq(auditGeoGrids.auditId, id));
      if (grids.length > 0) {
        await tx.delete(auditGeoGridPoints).where(inArray(auditGeoGridPoints.gridId, grids.map(g => g.id)));
      }
      await tx.delete(auditGeoGrids).where(eq(auditGeoGrids.auditId, id));
      await tx.delete(auditKeywords).where(eq(auditKeywords.auditId, id));
      await tx.delete(auditTechnicalFindings).where(eq(auditTechnicalFindings.auditId, id));
      await tx.delete(auditCompetitors).where(eq(auditCompetitors.auditId, id));
      await tx.delete(auditContentGaps).where(eq(auditContentGaps.auditId, id));
      await tx.delete(auditReviews).where(eq(auditReviews.auditId, id));
      await tx.delete(auditDeliverables).where(eq(auditDeliverables.auditId, id));
      await tx.delete(auditPpcForecast).where(eq(auditPpcForecast.auditId, id));
      await tx.delete(auditStageLog).where(eq(auditStageLog.auditId, id));
      await tx.delete(seoAudits).where(eq(seoAudits.id, id));
    });
  }

  async createAuditKeywords(keywords: InsertAuditKeyword[]): Promise<AuditKeyword[]> {
    if (keywords.length === 0) return [];
    return await db.insert(auditKeywords).values(keywords).returning();
  }

  async getAuditKeywordsByAuditId(auditId: number): Promise<AuditKeyword[]> {
    return await db.select().from(auditKeywords).where(eq(auditKeywords.auditId, auditId));
  }

  async deleteAuditKeywordsByAuditId(auditId: number): Promise<void> {
    await db.delete(auditKeywords).where(eq(auditKeywords.auditId, auditId));
  }

  async createAuditGeoGrid(grid: InsertAuditGeoGrid): Promise<AuditGeoGrid> {
    const [result] = await db.insert(auditGeoGrids).values(grid).returning();
    return result;
  }

  async getAuditGeoGridsByAuditId(auditId: number): Promise<AuditGeoGrid[]> {
    return await db.select().from(auditGeoGrids).where(eq(auditGeoGrids.auditId, auditId));
  }

  async createAuditGeoGridPoints(points: InsertAuditGeoGridPoint[]): Promise<AuditGeoGridPoint[]> {
    if (points.length === 0) return [];
    return await db.insert(auditGeoGridPoints).values(points).returning();
  }

  async getAuditGeoGridPointsByGridId(gridId: number): Promise<AuditGeoGridPoint[]> {
    return await db.select().from(auditGeoGridPoints).where(eq(auditGeoGridPoints.gridId, gridId));
  }

  async createAuditTechnicalFindings(findings: InsertAuditTechnicalFinding[]): Promise<AuditTechnicalFinding[]> {
    if (findings.length === 0) return [];
    return await db.insert(auditTechnicalFindings).values(findings).returning();
  }

  async getAuditTechnicalFindingsByAuditId(auditId: number): Promise<AuditTechnicalFinding[]> {
    return await db.select().from(auditTechnicalFindings).where(eq(auditTechnicalFindings.auditId, auditId));
  }

  async createAuditCompetitors(competitors: InsertAuditCompetitor[]): Promise<AuditCompetitor[]> {
    if (competitors.length === 0) return [];
    return await db.insert(auditCompetitors).values(competitors).returning();
  }

  async getAuditCompetitorsByAuditId(auditId: number): Promise<AuditCompetitor[]> {
    return await db.select().from(auditCompetitors).where(eq(auditCompetitors.auditId, auditId));
  }

  async createAuditContentGaps(gaps: InsertAuditContentGap[]): Promise<AuditContentGap[]> {
    if (gaps.length === 0) return [];
    return await db.insert(auditContentGaps).values(gaps).returning();
  }

  async getAuditContentGapsByAuditId(auditId: number): Promise<AuditContentGap[]> {
    return await db.select().from(auditContentGaps).where(eq(auditContentGaps.auditId, auditId));
  }

  async createAuditReviews(reviews: InsertAuditReview[]): Promise<AuditReview[]> {
    if (reviews.length === 0) return [];
    return await db.insert(auditReviews).values(reviews).returning();
  }

  async getAuditReviewsByAuditId(auditId: number): Promise<AuditReview[]> {
    return await db.select().from(auditReviews).where(eq(auditReviews.auditId, auditId));
  }

  async createAuditDeliverables(deliverables: InsertAuditDeliverable[]): Promise<AuditDeliverable[]> {
    if (deliverables.length === 0) return [];
    return await db.insert(auditDeliverables).values(deliverables).returning();
  }

  async getAuditDeliverablesByAuditId(auditId: number): Promise<AuditDeliverable[]> {
    return await db.select().from(auditDeliverables)
      .where(eq(auditDeliverables.auditId, auditId))
      .orderBy(asc(auditDeliverables.phase), asc(auditDeliverables.sortOrder));
  }

  async createAuditPpcForecasts(forecasts: InsertAuditPpcForecast[]): Promise<AuditPpcForecast[]> {
    if (forecasts.length === 0) return [];
    return await db.insert(auditPpcForecast).values(forecasts).returning();
  }

  async getAuditPpcForecastsByAuditId(auditId: number): Promise<AuditPpcForecast[]> {
    return await db.select().from(auditPpcForecast).where(eq(auditPpcForecast.auditId, auditId));
  }

  async createAuditStageLog(logData: InsertAuditStageLog): Promise<AuditStageLog> {
    const [result] = await db.insert(auditStageLog).values(logData).returning();
    return result;
  }

  async getAuditStageLogsByAuditId(auditId: number): Promise<AuditStageLog[]> {
    return await db.select().from(auditStageLog)
      .where(eq(auditStageLog.auditId, auditId))
      .orderBy(asc(auditStageLog.startedAt));
  }

  async updateAuditStageLog(id: number, data: Partial<InsertAuditStageLog & { completedAt?: Date }>): Promise<AuditStageLog | undefined> {
    const [result] = await db
      .update(auditStageLog)
      .set(data)
      .where(eq(auditStageLog.id, id))
      .returning();
    return result;
  }
}

export const storage = new DatabaseStorage();
