import { pgTable, text, varchar, integer, jsonb, timestamp, boolean, serial, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// User table (keeping existing)
export const users = pgTable("users", {
  id: varchar("id", { length: 36 }).primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// Audits table - stores every audit run
export const audits = pgTable("audits", {
  id: serial("id").primaryKey(),
  businessName: text("business_name").notNull(),
  url: text("url"),
  keyword: text("keyword").notNull(),
  scope: text("scope").notNull(),
  city: text("city"),
  overallScore: integer("overall_score").notNull(),
  chatgptScore: integer("chatgpt_score").notNull(),
  googleAIScore: integer("google_ai_score").notNull(),
  fullResults: text("full_results"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertAuditSchema = createInsertSchema(audits).omit({
  id: true,
  createdAt: true,
});

export type InsertAudit = z.infer<typeof insertAuditSchema>;
export type Audit = typeof audits.$inferSelect;

// Leads table - stores contact info when user requests full report
export const leads = pgTable("leads", {
  id: serial("id").primaryKey(),
  auditId: integer("audit_id").references(() => audits.id),
  name: text("name").notNull(),
  email: text("email").notNull(),
  phone: text("phone").notNull(),
  businessName: text("business_name").notNull(),
  auditScore: integer("audit_score").notNull(),
  status: text("status").notNull().default("new"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertLeadSchema = createInsertSchema(leads).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertLead = z.infer<typeof insertLeadSchema>;
export type DbLead = typeof leads.$inferSelect;

// Audit request schema for frontend validation
export const auditRequestSchema = z.object({
  businessName: z.string().min(1, "Business name is required"),
  url: z.string().min(1, "Website URL is required"),
  keyword: z.string().min(1, "Target keyword is required"),
  scope: z.enum(["local", "national"]),
  city: z.string().optional(),
});

export type AuditRequest = z.infer<typeof auditRequestSchema>;

// Prompt result from each AI platform (research-based visibility prompts)
export const promptResultSchema = z.object({
  prompt: z.string(),
  summary: z.string().optional(),
  chatgpt: z.object({
    found: z.boolean(),
    response: z.string(),
    competitors: z.array(z.string()).optional(),
  }),
  googleAI: z.object({
    found: z.boolean(),
    response: z.string(),
    competitors: z.array(z.string()).optional(),
  }),
});

export type PromptResult = z.infer<typeof promptResultSchema>;

// Sentiment result from brand-specific prompts
export const sentimentResultSchema = z.object({
  prompt: z.string(),
  chatgpt: z.object({
    response: z.string(),
    sentiment: z.enum(["positive", "negative", "neutral"]),
  }),
  googleAI: z.object({
    response: z.string(),
    sentiment: z.enum(["positive", "negative", "neutral"]),
  }),
});

export type SentimentResult = z.infer<typeof sentimentResultSchema>;

// Overall sentiment analysis summary
export const sentimentSummarySchema = z.object({
  overall: z.enum(["positive", "negative", "neutral"]),
  positiveCount: z.number(),
  negativeCount: z.number(),
  neutralCount: z.number(),
  results: z.array(sentimentResultSchema),
});

export type SentimentSummary = z.infer<typeof sentimentSummarySchema>;

// Audit results
export const auditResultsSchema = z.object({
  auditId: z.number().optional(),
  businessName: z.string(),
  url: z.string(),
  keyword: z.string(),
  scope: z.enum(["local", "national"]),
  city: z.string().optional(),
  overallScore: z.number(),
  chatgptScore: z.number(),
  googleAIScore: z.number(),
  executiveSummary: z.string().optional(),
  promptResults: z.array(promptResultSchema),
  sentimentAnalysis: sentimentSummarySchema.optional(),
  competitors: z.array(z.object({
    name: z.string(),
    mentions: z.number(),
  })),
  timestamp: z.string(),
});

export type AuditResults = z.infer<typeof auditResultsSchema>;

// Lead capture schema
export const leadSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Valid email is required"),
  phone: z.string().min(1, "Phone number is required"),
  businessName: z.string(),
  auditScore: z.number(),
  auditId: z.number().optional(),
});

export type Lead = z.infer<typeof leadSchema>;

// Scan progress update schema
export const scanProgressSchema = z.object({
  progress: z.number(),
  status: z.string(),
  subtext: z.string(),
  currentPrompt: z.string().optional(),
  currentPlatform: z.enum(["chatgpt", "googleAI"]).optional(),
});

export type ScanProgress = z.infer<typeof scanProgressSchema>;

// ============================================
// MONITORING CLIENTS - For ongoing visibility tracking
// ============================================

export const monitoringClients = pgTable("monitoring_clients", {
  id: serial("id").primaryKey(),
  businessName: text("business_name").notNull(),
  domain: text("domain").notNull(),
  industry: text("industry").notNull(),
  scope: text("scope").notNull(), // "local" or "national"
  city: text("city"),
  checkFrequencyDays: integer("check_frequency_days").notNull().default(14),
  lastCheckAt: timestamp("last_check_at"),
  nextCheckAt: timestamp("next_check_at"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertMonitoringClientSchema = createInsertSchema(monitoringClients).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  lastCheckAt: true,
  nextCheckAt: true,
});

export type InsertMonitoringClient = z.infer<typeof insertMonitoringClientSchema>;
export type MonitoringClient = typeof monitoringClients.$inferSelect;

// ============================================
// GROUPS - Service/product line categories
// ============================================

export const monitoringGroups = pgTable("monitoring_groups", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").references(() => monitoringClients.id).notNull(),
  name: text("name").notNull(),
  description: text("description"),
  isHighLevelCategory: boolean("is_high_level_category").notNull().default(false), // True for umbrella term (e.g., "Plumber", "HVAC Contractor")
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertMonitoringGroupSchema = createInsertSchema(monitoringGroups).omit({
  id: true,
  createdAt: true,
});

export type InsertMonitoringGroup = z.infer<typeof insertMonitoringGroupSchema>;
export type MonitoringGroup = typeof monitoringGroups.$inferSelect;

// ============================================
// PROMPTS - Individual prompts within groups
// ============================================

export const monitoringPrompts = pgTable("monitoring_prompts", {
  id: serial("id").primaryKey(),
  groupId: integer("group_id").references(() => monitoringGroups.id).notNull(),
  promptText: text("prompt_text").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertMonitoringPromptSchema = createInsertSchema(monitoringPrompts).omit({
  id: true,
  createdAt: true,
});

export type InsertMonitoringPrompt = z.infer<typeof insertMonitoringPromptSchema>;
export type MonitoringPrompt = typeof monitoringPrompts.$inferSelect;

// ============================================
// CHECK SESSIONS - Aggregated check run data
// ============================================

export const checkSessions = pgTable("check_sessions", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").references(() => monitoringClients.id).notNull(),
  overallScore: integer("overall_score").notNull(),
  chatgptScore: integer("chatgpt_score").notNull(),
  googleAIScore: integer("google_ai_score").notNull(),
  totalPrompts: integer("total_prompts").notNull(),
  foundCount: integer("found_count").notNull(),
  citedCount: integer("cited_count").notNull(),
  // Session-level analytics
  shareOfVoice: jsonb("share_of_voice"), // [{name, mentionCount, percentage}]
  avgChatgptRank: real("avg_chatgpt_rank"),
  avgGoogleAIRank: real("avg_google_ai_rank"),
  firstPlaceCount: integer("first_place_count"), // How many times ranked #1
  sentimentBreakdown: jsonb("sentiment_breakdown"), // {positive, neutral, negative}
  topCitations: jsonb("top_citations"), // [{domain, count}]
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertCheckSessionSchema = createInsertSchema(checkSessions).omit({
  id: true,
  createdAt: true,
});

export type InsertCheckSession = z.infer<typeof insertCheckSessionSchema>;
export type CheckSession = typeof checkSessions.$inferSelect;

// ============================================
// CHECK RESULTS - Historical visibility data
// ============================================

export const checkResults = pgTable("check_results", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").references(() => checkSessions.id),
  clientId: integer("client_id").references(() => monitoringClients.id).notNull(),
  groupId: integer("group_id").references(() => monitoringGroups.id).notNull(),
  promptId: integer("prompt_id").references(() => monitoringPrompts.id).notNull(),
  promptText: text("prompt_text").notNull(),
  chatgptFound: boolean("chatgpt_found").notNull(),
  chatgptResponse: text("chatgpt_response"),
  chatgptCited: boolean("chatgpt_cited").default(false),
  googleAIFound: boolean("google_ai_found").notNull(),
  googleAIResponse: text("google_ai_response"),
  googleAICited: boolean("google_ai_cited").default(false),
  competitors: text("competitors"), // JSON string of competitor names
  // Analytics fields
  chatgptSentiment: text("chatgpt_sentiment"), // positive, neutral, negative
  googleAISentiment: text("google_ai_sentiment"),
  chatgptRank: integer("chatgpt_rank"), // Position in response (1 = first mentioned)
  googleAIRank: integer("google_ai_rank"),
  chatgptCitations: jsonb("chatgpt_citations"), // Array of {url, domain} objects
  googleAICitations: jsonb("google_ai_citations"),
  chatgptSnippet: text("chatgpt_snippet"), // Context around brand mention
  googleAISnippet: text("google_ai_snippet"),
  checkedAt: timestamp("checked_at").defaultNow().notNull(),
});

export const insertCheckResultSchema = createInsertSchema(checkResults).omit({
  id: true,
  checkedAt: true,
});

export type InsertCheckResult = z.infer<typeof insertCheckResultSchema>;
export type CheckResult = typeof checkResults.$inferSelect;

// ============================================
// Frontend Request Schemas
// ============================================

export const monitoringClientRequestSchema = z.object({
  businessName: z.string().min(1, "Business name is required"),
  domain: z.string().min(1, "Domain is required"),
  industry: z.string().min(1, "Industry is required"),
  scope: z.enum(["local", "national"]),
  city: z.string().optional(),
  checkFrequencyDays: z.number().min(1).max(90).default(14),
});

export type MonitoringClientRequest = z.infer<typeof monitoringClientRequestSchema>;

export const groupSuggestionSchema = z.object({
  name: z.string(),
  description: z.string(),
});

export type GroupSuggestion = z.infer<typeof groupSuggestionSchema>;
