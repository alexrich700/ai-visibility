import { randomUUID } from "crypto";

export interface Lead {
  id: string;
  name: string;
  email: string;
  phone: string;
  businessName: string;
  auditScore: number;
  createdAt: string;
}

export interface AuditRecord {
  id: string;
  businessName: string;
  url: string;
  keyword: string;
  scope: "local" | "national";
  city?: string;
  overallScore: number;
  createdAt: string;
}

export interface IStorage {
  createLead(lead: Omit<Lead, "id" | "createdAt">): Promise<Lead>;
  getLeads(): Promise<Lead[]>;
  createAuditRecord(audit: Omit<AuditRecord, "id" | "createdAt">): Promise<AuditRecord>;
  getAuditRecords(): Promise<AuditRecord[]>;
}

export class MemStorage implements IStorage {
  private leads: Map<string, Lead>;
  private audits: Map<string, AuditRecord>;

  constructor() {
    this.leads = new Map();
    this.audits = new Map();
  }

  async createLead(leadData: Omit<Lead, "id" | "createdAt">): Promise<Lead> {
    const id = randomUUID();
    const lead: Lead = {
      ...leadData,
      id,
      createdAt: new Date().toISOString(),
    };
    this.leads.set(id, lead);
    return lead;
  }

  async getLeads(): Promise<Lead[]> {
    return Array.from(this.leads.values());
  }

  async createAuditRecord(auditData: Omit<AuditRecord, "id" | "createdAt">): Promise<AuditRecord> {
    const id = randomUUID();
    const audit: AuditRecord = {
      ...auditData,
      id,
      createdAt: new Date().toISOString(),
    };
    this.audits.set(id, audit);
    return audit;
  }

  async getAuditRecords(): Promise<AuditRecord[]> {
    return Array.from(this.audits.values());
  }
}

export const storage = new MemStorage();
