import { db } from "./db";
import { 
  audits, leads, InsertAudit, InsertLead, Audit, DbLead,
  monitoringClients, monitoringGroups, monitoringPrompts, checkResults, checkSessions,
  InsertMonitoringClient, InsertMonitoringGroup, InsertMonitoringPrompt, InsertCheckResult, InsertCheckSession,
  MonitoringClient, MonitoringGroup, MonitoringPrompt, CheckResult, CheckSession
} from "@shared/schema";
import { eq, desc, and } from "drizzle-orm";

export interface IStorage {
  createAudit(audit: InsertAudit): Promise<Audit>;
  getAudits(): Promise<Audit[]>;
  getAuditById(id: number): Promise<Audit | undefined>;
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
  updateCheckSession(id: number, data: Partial<InsertCheckSession>): Promise<CheckSession | undefined>;
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
    const allAudits = await db.select().from(audits).orderBy(desc(audits.createdAt));
    const allLeads = await db.select().from(leads);
    
    const leadsByAuditId = new Map<number, DbLead>();
    for (const lead of allLeads) {
      if (lead.auditId) {
        leadsByAuditId.set(lead.auditId, lead);
      }
    }
    
    return allAudits.map(audit => ({
      ...audit,
      lead: leadsByAuditId.get(audit.id),
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
    const groups = await this.getGroupsByClientId(clientId);
    const groupIds = groups.map(g => g.id);
    if (groupIds.length === 0) return [];
    
    const allPrompts: MonitoringPrompt[] = [];
    for (const groupId of groupIds) {
      const prompts = await this.getPromptsByGroupId(groupId);
      allPrompts.push(...prompts);
    }
    return allPrompts;
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

  async updateCheckSession(id: number, data: Partial<InsertCheckSession>): Promise<CheckSession | undefined> {
    const [session] = await db
      .update(checkSessions)
      .set(data)
      .where(eq(checkSessions.id, id))
      .returning();
    return session;
  }
}

export const storage = new DatabaseStorage();
