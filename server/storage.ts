import { db } from "./db";
import { audits, leads, InsertAudit, InsertLead, Audit, DbLead } from "@shared/schema";
import { eq, desc } from "drizzle-orm";

export interface IStorage {
  createAudit(audit: InsertAudit): Promise<Audit>;
  getAudits(): Promise<Audit[]>;
  getAuditById(id: number): Promise<Audit | undefined>;
  createLead(lead: InsertLead): Promise<DbLead>;
  getLeads(): Promise<DbLead[]>;
  getLeadById(id: number): Promise<DbLead | undefined>;
  updateLeadStatus(id: number, status: string): Promise<DbLead | undefined>;
  getAuditsWithLeads(): Promise<(Audit & { lead?: DbLead })[]>;
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
}

export const storage = new DatabaseStorage();
