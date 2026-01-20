import { db } from "./db";
import { 
  audits, leads, InsertAudit, InsertLead, Audit, DbLead,
  monitoringClients, monitoringGroups, monitoringPrompts, checkResults, checkSessions,
  checkGroupMetrics, checkCompetitorMetrics,
  InsertMonitoringClient, InsertMonitoringGroup, InsertMonitoringPrompt, InsertCheckResult, InsertCheckSession,
  InsertCheckGroupMetric, InsertCheckCompetitorMetric,
  MonitoringClient, MonitoringGroup, MonitoringPrompt, CheckResult, CheckSession,
  CheckGroupMetric, CheckCompetitorMetric,
  adminUsers, InsertAdminUser, AdminUser
} from "@shared/schema";
import { eq, desc, and, lte, isNull, or, isNotNull, gte } from "drizzle-orm";

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

  async updateMonitoringClient(id: number, data: Partial<InsertMonitoringClient>): Promise<MonitoringClient | undefined> {
    const [client] = await db
      .update(monitoringClients)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(monitoringClients.id, id))
      .returning();
    return client;
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
}

export const storage = new DatabaseStorage();
