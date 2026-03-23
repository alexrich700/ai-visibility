import { pgTable, text, varchar, integer, jsonb, timestamp, boolean, serial, real, index, decimal } from "drizzle-orm/pg-core";
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
  shareToken: text("share_token").unique(),
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

// Admin users table - for admin portal authentication
export const adminUsers = pgTable("admin_users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  resetToken: text("reset_token"),
  resetTokenExpiry: timestamp("reset_token_expiry"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertAdminUserSchema = createInsertSchema(adminUsers).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertAdminUser = z.infer<typeof insertAdminUserSchema>;
export type AdminUser = typeof adminUsers.$inferSelect;

// Admin login schema
export const adminLoginSchema = z.object({
  email: z.string().email("Valid email is required"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

export type AdminLogin = z.infer<typeof adminLoginSchema>;

// Password reset request schema
export const passwordResetRequestSchema = z.object({
  email: z.string().email("Valid email is required"),
});

// Password reset schema
export const passwordResetSchema = z.object({
  token: z.string().min(1, "Reset token is required"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

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
  normalizedBusinessName: text("normalized_business_name").notNull().default(''),
  normalizedDomain: text("normalized_domain").notNull().default(''),
  industry: text("industry").notNull(),
  scope: text("scope").notNull(), // "local" or "national"
  city: text("city"), // Legacy single city (for backward compatibility)
  cities: text("cities").array(), // Multiple target cities (e.g., ["Minneapolis", "St. Paul", "Rochester"])
  primaryCategories: text("primary_categories").array(), // Multiple service categories (e.g., ["Plumbing", "HVAC"])
  brandAliases: text("brand_aliases").array(), // Alternative names for the business (e.g., "SmartFix", "The Smart Fix")
  checkFrequencyDays: integer("check_frequency_days").notNull().default(14),
  lastCheckAt: timestamp("last_check_at"),
  nextCheckAt: timestamp("next_check_at"),
  isActive: boolean("is_active").notNull().default(true),
  // Client access authentication
  clientAccessToken: text("client_access_token").unique(), // 32-char hex token for client-only dashboard access
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  normalizedLookupIdx: index("monitoring_clients_normalized_lookup_idx").on(table.normalizedBusinessName, table.normalizedDomain),
}));

export const insertMonitoringClientSchema = createInsertSchema(monitoringClients).omit({
  id: true,
  normalizedBusinessName: true,
  normalizedDomain: true,
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

// Prompt categories for distinguishing service prompts from brand sentiment prompts
export const PROMPT_CATEGORIES = {
  SERVICE: 'service',       // Standard service-based prompts (e.g., "best plumber in Austin")
  BRAND_SENTIMENT: 'brand_sentiment',  // Direct brand questions (e.g., "What do you think of XYZ Business?")
} as const;
export type PromptCategory = typeof PROMPT_CATEGORIES[keyof typeof PROMPT_CATEGORIES];

export const monitoringGroups = pgTable("monitoring_groups", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").references(() => monitoringClients.id).notNull(),
  name: text("name").notNull(),
  description: text("description"),
  isHighLevelCategory: boolean("is_high_level_category").notNull().default(false), // True for umbrella term (e.g., "Plumber", "HVAC Contractor")
  promptCategory: text("prompt_category").notNull().default('service'), // 'service' or 'brand_sentiment'
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  clientIdIdx: index("monitoring_groups_client_id_idx").on(table.clientId),
}));

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
}, (table) => ({
  groupIdIdx: index("monitoring_prompts_group_id_idx").on(table.groupId),
}));

export const insertMonitoringPromptSchema = createInsertSchema(monitoringPrompts).omit({
  id: true,
  createdAt: true,
});

export type InsertMonitoringPrompt = z.infer<typeof insertMonitoringPromptSchema>;
export type MonitoringPrompt = typeof monitoringPrompts.$inferSelect;

// ============================================
// CHECK SESSIONS - Aggregated check run data
// ============================================

// Scan status for checkpoint/resume capability
export const SCAN_STATUS = {
  PENDING: 'pending',
  RUNNING: 'running', 
  PAUSED: 'paused',
  COMPLETE: 'complete',
  FAILED: 'failed',
} as const;
export type ScanStatus = typeof SCAN_STATUS[keyof typeof SCAN_STATUS];

export const checkSessions = pgTable("check_sessions", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").references(() => monitoringClients.id).notNull(),
  city: text("city"), // Which city this scan was for (null = all cities or legacy scan)
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
  // New: Numerical sentiment score (0-100) and competitor visibility
  sentimentScore: integer("sentiment_score"), // 0-100 overall sentiment score
  competitorVisibility: jsonb("competitor_visibility"), // [{name, visibilityPercent, mentionCount}]
  sentimentStatements: jsonb("sentiment_statements"), // {positive: [{text, platform}], negative: [{text, platform}]}
  sentimentNarratives: jsonb("sentiment_narratives"), // Cached AI-synthesized narratives {strengths: [...], improvements: [...]}
  // Checkpoint/Resume fields for resilient long-running scans
  status: text("status").notNull().default('pending'), // pending, running, paused, complete, failed
  prepareId: text("prepare_id"), // Unique ID linking to prepared scan data (for resume)
  lastCompletedPromptIndex: integer("last_completed_prompt_index").default(0), // Track progress for resume
  totalPromptsToScan: integer("total_prompts_to_scan"), // Total prompts in this scan
  errorMessage: text("error_message"), // Error details if failed
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  clientIdIdx: index("check_sessions_client_id_idx").on(table.clientId),
}));

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
  chatgptSentimentScore: integer("chatgpt_sentiment_score"), // 0-100 sentiment score
  googleAISentimentScore: integer("google_ai_sentiment_score"), // 0-100 sentiment score
  chatgptRank: integer("chatgpt_rank"), // Position in response (1 = first mentioned)
  googleAIRank: integer("google_ai_rank"),
  chatgptCitations: jsonb("chatgpt_citations"), // Array of {url, domain} objects
  googleAICitations: jsonb("google_ai_citations"),
  chatgptSnippet: text("chatgpt_snippet"), // Context around brand mention
  googleAISnippet: text("google_ai_snippet"),
  // Gemini grounding metadata for geo-optimization analysis
  googleAIGroundingMetadata: jsonb("google_ai_grounding_metadata"), // {webSearchQueries: string[], groundingSupports: [...]}
  checkedAt: timestamp("checked_at").defaultNow().notNull(),
}, (table) => ({
  sessionIdIdx: index("check_results_session_id_idx").on(table.sessionId),
  clientIdIdx: index("check_results_client_id_idx").on(table.clientId),
}));

export const insertCheckResultSchema = createInsertSchema(checkResults).omit({
  id: true,
  checkedAt: true,
});

export type InsertCheckResult = z.infer<typeof insertCheckResultSchema>;
export type CheckResult = typeof checkResults.$inferSelect;

// ============================================
// GROUP METRICS - Per-group visibility per session (for trending)
// ============================================

export const checkGroupMetrics = pgTable("check_group_metrics", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").references(() => checkSessions.id).notNull(),
  clientId: integer("client_id").references(() => monitoringClients.id).notNull(),
  groupId: integer("group_id").references(() => monitoringGroups.id).notNull(),
  groupName: text("group_name").notNull(),
  totalPrompts: integer("total_prompts").notNull(),
  foundCount: integer("found_count").notNull(),
  citedCount: integer("cited_count").notNull(),
  visibilityScore: integer("visibility_score").notNull(), // 0-100
  chatgptFoundCount: integer("chatgpt_found_count").notNull(),
  googleAIFoundCount: integer("google_ai_found_count").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  clientIdIdx: index("check_group_metrics_client_id_idx").on(table.clientId),
  sessionIdIdx: index("check_group_metrics_session_id_idx").on(table.sessionId),
}));

export const insertCheckGroupMetricSchema = createInsertSchema(checkGroupMetrics).omit({
  id: true,
  createdAt: true,
});

export type InsertCheckGroupMetric = z.infer<typeof insertCheckGroupMetricSchema>;
export type CheckGroupMetric = typeof checkGroupMetrics.$inferSelect;

// ============================================
// COMPETITOR METRICS - Competitor visibility per session (for trending)
// ============================================

export const checkCompetitorMetrics = pgTable("check_competitor_metrics", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").references(() => checkSessions.id).notNull(),
  clientId: integer("client_id").references(() => monitoringClients.id).notNull(),
  competitorName: text("competitor_name").notNull(),
  mentionCount: integer("mention_count").notNull(),
  visibilityPercent: real("visibility_percent").notNull(), // 0-100
  chatgptMentions: integer("chatgpt_mentions").notNull(),
  googleAIMentions: integer("google_ai_mentions").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  clientIdIdx: index("check_competitor_metrics_client_id_idx").on(table.clientId),
  sessionIdIdx: index("check_competitor_metrics_session_id_idx").on(table.sessionId),
}));

export const insertCheckCompetitorMetricSchema = createInsertSchema(checkCompetitorMetrics).omit({
  id: true,
  createdAt: true,
});

export type InsertCheckCompetitorMetric = z.infer<typeof insertCheckCompetitorMetricSchema>;
export type CheckCompetitorMetric = typeof checkCompetitorMetrics.$inferSelect;

// ============================================
// PROMPT FALLBACK LOGS - Track AI prompt generation failures
// ============================================

export const promptFallbackLogs = pgTable("prompt_fallback_logs", {
  id: serial("id").primaryKey(),
  reason: text("reason").notNull(), // API_KEY_MISSING, API_AUTH_ERROR, API_RATE_LIMIT, etc.
  errorMessage: text("error_message"),
  errorDetails: jsonb("error_details"), // Additional context (status code, etc.)
  businessName: text("business_name"),
  industry: text("industry"),
  promptCount: integer("prompt_count"), // How many prompts fell back
  environment: text("environment"), // development, production
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertPromptFallbackLogSchema = createInsertSchema(promptFallbackLogs).omit({
  id: true,
  createdAt: true,
});

export type InsertPromptFallbackLog = z.infer<typeof insertPromptFallbackLogSchema>;
export type PromptFallbackLog = typeof promptFallbackLogs.$inferSelect;

// ============================================
// SCAN JOBS - Background job queue for async scans
// ============================================

export const SCAN_JOB_STATUS = {
  QUEUED: 'queued',       // Job is waiting to be processed
  RUNNING: 'running',     // Job is currently being processed
  COMPLETE: 'complete',   // Job finished successfully
  FAILED: 'failed',       // Job failed with error
} as const;
export type ScanJobStatus = typeof SCAN_JOB_STATUS[keyof typeof SCAN_JOB_STATUS];

export const scanJobs = pgTable("scan_jobs", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").references(() => monitoringClients.id).notNull(),
  targetCity: text("target_city"), // Which city to scan (null = national or single city from client)
  status: text("status").notNull().default('queued'), // queued, running, complete, failed
  progress: integer("progress").notNull().default(0), // 0-100 percentage
  progressMessage: text("progress_message"), // Human-readable status message
  completedPrompts: integer("completed_prompts").notNull().default(0),
  totalPrompts: integer("total_prompts").notNull().default(0),
  sessionId: integer("session_id").references(() => checkSessions.id), // Created when job starts running
  errorMessage: text("error_message"), // Error details if failed
  resultScore: integer("result_score"), // Final visibility score when complete
  startedAt: timestamp("started_at"), // When processing began
  lastProgressAt: timestamp("last_progress_at"), // When progress was last updated (for stuck job detection)
  completedAt: timestamp("completed_at"), // When job finished (success or failure)
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  clientIdIdx: index("scan_jobs_client_id_idx").on(table.clientId),
  statusIdx: index("scan_jobs_status_idx").on(table.status),
}));

export const insertScanJobSchema = createInsertSchema(scanJobs).omit({
  id: true,
  createdAt: true,
  startedAt: true,
  lastProgressAt: true,
  completedAt: true,
});

export type InsertScanJob = z.infer<typeof insertScanJobSchema>;
export type ScanJob = typeof scanJobs.$inferSelect;

// ============================================
// CLIENT SESSIONS - For client portal authentication
// ============================================

export const clientSessions = pgTable("client_sessions", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").references(() => monitoringClients.id, { onDelete: "cascade" }).notNull(),
  sessionToken: text("session_token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type ClientSession = typeof clientSessions.$inferSelect;

// ============================================
// ADMIN SESSIONS - For admin portal authentication (database-backed for persistence)
// ============================================

export const adminSessions = pgTable("admin_sessions", {
  id: serial("id").primaryKey(),
  sessionToken: text("session_token").notNull().unique(),
  userId: integer("user_id"),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type AdminSession = typeof adminSessions.$inferSelect;

// ============================================
// Frontend Request Schemas
// ============================================

export const monitoringClientRequestSchema = z.object({
  businessName: z.string().min(1, "Business name is required"),
  domain: z.string().min(1, "Domain is required"),
  industry: z.string().min(1, "Industry is required"),
  scope: z.enum(["local", "national"]),
  city: z.string().optional(), // Legacy single city
  cities: z.array(z.string()).optional(), // Multiple cities for multi-location businesses
  primaryCategories: z.array(z.string()).optional(), // Multiple service categories (e.g., ["Plumbing", "HVAC"])
  brandAliases: z.array(z.string()).optional(), // Alternative business names for detection
  checkFrequencyDays: z.number().min(1).max(90).default(14),
});

export type MonitoringClientRequest = z.infer<typeof monitoringClientRequestSchema>;

export const groupSuggestionSchema = z.object({
  name: z.string(),
  description: z.string(),
});

export type GroupSuggestion = z.infer<typeof groupSuggestionSchema>;

// ============================================
// SEO AUDIT TABLES
// ============================================

export const SEO_AUDIT_STATUS = {
  DRAFT: 'draft',
  CONFIGURING: 'configuring',
  QUEUED: 'queued',
  RUNNING: 'running',
  COMPLETED: 'completed',
  COMPLETED_WITH_ERRORS: 'completed_with_errors',
  FAILED: 'failed',
} as const;
export type SeoAuditStatus = typeof SEO_AUDIT_STATUS[keyof typeof SEO_AUDIT_STATUS];

export const seoAudits = pgTable("seo_audits", {
  id: serial("id").primaryKey(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  status: text("status").notNull().default('draft'),
  currentStage: text("current_stage"),
  businessName: text("business_name").notNull(),
  businessUrl: text("business_url").notNull(),
  businessAddress: text("business_address"),
  businessLat: real("business_lat"),
  businessLng: real("business_lng"),
  businessType: text("business_type").notNull().default('local'),
  industry: text("industry"),
  serviceAreaCities: jsonb("service_area_cities").default([]),
  services: jsonb("services").default([]),
  geoGridKeywords: jsonb("geo_grid_keywords").default([]),
  geoGridSize: integer("geo_grid_size").default(13),
  geoGridSpacingMiles: real("geo_grid_spacing_miles").default(1.0),
  competitors: jsonb("competitors").default([]),
  marketPositionScore: integer("market_position_score"),
  siteHealthGrade: text("site_health_grade"),
  shareOfLocalVoice: real("share_of_local_voice"),
  averageGridRank: real("average_grid_rank"),
  totalKeywordGaps: integer("total_keyword_gaps"),
  totalContentGaps: integer("total_content_gaps"),
  totalDeliverables: integer("total_deliverables"),
  estimatedTotalHours: real("estimated_total_hours"),
  estimatedMonthlyInvestment: real("estimated_monthly_investment"),
  aiVisibilityScore: integer("ai_visibility_score"),
  geoVisibilityData: jsonb("geo_visibility_data"),
  executiveNarrative: text("executive_narrative"),
  crawlTaskId: text("crawl_task_id"),
  createdBy: integer("created_by"),
  magicLinkToken: text("magic_link_token").unique(),
  organizationId: integer("organization_id"),
}, (table) => ({
  statusIdx: index("seo_audits_status_idx").on(table.status),
  magicLinkIdx: index("seo_audits_magic_link_idx").on(table.magicLinkToken),
}));

export const insertSeoAuditSchema = createInsertSchema(seoAudits).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertSeoAudit = z.infer<typeof insertSeoAuditSchema>;
export type SeoAudit = typeof seoAudits.$inferSelect;

export const auditKeywords = pgTable("audit_keywords", {
  id: serial("id").primaryKey(),
  auditId: integer("audit_id").references(() => seoAudits.id, { onDelete: "cascade" }).notNull(),
  keyword: text("keyword").notNull(),
  searchVolume: integer("search_volume"),
  cpc: real("cpc"),
  competitionLevel: text("competition_level"),
  seasonalTrends: jsonb("seasonal_trends"),
  intent: text("intent"),
  pageType: text("page_type"),
  targetCity: text("target_city"),
  targetService: text("target_service"),
  existingPageUrl: text("existing_page_url"),
  currentOrganicRank: integer("current_organic_rank"),
  currentLocalPackRank: integer("current_local_pack_rank"),
  inAiOverview: boolean("in_ai_overview").default(false),
  competitorRanks: jsonb("competitor_ranks").default({}),
  priority: text("priority").default('medium'),
}, (table) => ({
  auditIdIdx: index("audit_keywords_audit_id_idx").on(table.auditId),
}));

export const insertAuditKeywordSchema = createInsertSchema(auditKeywords).omit({
  id: true,
});

export type InsertAuditKeyword = z.infer<typeof insertAuditKeywordSchema>;
export type AuditKeyword = typeof auditKeywords.$inferSelect;

export const auditGeoGrids = pgTable("audit_geo_grids", {
  id: serial("id").primaryKey(),
  auditId: integer("audit_id").references(() => seoAudits.id, { onDelete: "cascade" }).notNull(),
  keyword: text("keyword").notNull(),
  gridSize: integer("grid_size").notNull(),
  spacingMiles: real("spacing_miles").notNull(),
  centerLat: real("center_lat").notNull(),
  centerLng: real("center_lng").notNull(),
  clientSolv: real("client_solv"),
  clientAvgRank: real("client_avg_rank"),
  competitorSolv: real("competitor_solv"),
  competitorName: text("competitor_name"),
  competitorAvgRank: real("competitor_avg_rank"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  auditIdIdx: index("audit_geo_grids_audit_id_idx").on(table.auditId),
}));

export const insertAuditGeoGridSchema = createInsertSchema(auditGeoGrids).omit({
  id: true,
  createdAt: true,
});

export type InsertAuditGeoGrid = z.infer<typeof insertAuditGeoGridSchema>;
export type AuditGeoGrid = typeof auditGeoGrids.$inferSelect;

export const auditGeoGridPoints = pgTable("audit_geo_grid_points", {
  id: serial("id").primaryKey(),
  gridId: integer("grid_id").references(() => auditGeoGrids.id, { onDelete: "cascade" }).notNull(),
  gridRow: integer("grid_row").notNull(),
  gridCol: integer("grid_col").notNull(),
  lat: real("lat").notNull(),
  lng: real("lng").notNull(),
  clientRank: integer("client_rank"),
  competitorRank: integer("competitor_rank"),
  localPackResults: jsonb("local_pack_results").default([]),
}, (table) => ({
  gridIdIdx: index("audit_geo_grid_points_grid_id_idx").on(table.gridId),
}));

export const insertAuditGeoGridPointSchema = createInsertSchema(auditGeoGridPoints).omit({
  id: true,
});

export type InsertAuditGeoGridPoint = z.infer<typeof insertAuditGeoGridPointSchema>;
export type AuditGeoGridPoint = typeof auditGeoGridPoints.$inferSelect;

export const auditTechnicalFindings = pgTable("audit_technical_findings", {
  id: serial("id").primaryKey(),
  auditId: integer("audit_id").references(() => seoAudits.id, { onDelete: "cascade" }).notNull(),
  category: text("category").notNull(),
  checkName: text("check_name").notNull(),
  status: text("status").notNull(),
  value: text("value"),
  threshold: text("threshold"),
  description: text("description"),
  impact: text("impact"),
}, (table) => ({
  auditIdIdx: index("audit_technical_findings_audit_id_idx").on(table.auditId),
}));

export const insertAuditTechnicalFindingSchema = createInsertSchema(auditTechnicalFindings).omit({
  id: true,
});

export type InsertAuditTechnicalFinding = z.infer<typeof insertAuditTechnicalFindingSchema>;
export type AuditTechnicalFinding = typeof auditTechnicalFindings.$inferSelect;

export const auditCompetitors = pgTable("audit_competitors", {
  id: serial("id").primaryKey(),
  auditId: integer("audit_id").references(() => seoAudits.id, { onDelete: "cascade" }).notNull(),
  domain: text("domain").notNull(),
  businessName: text("business_name"),
  domainRating: integer("domain_rating"),
  totalOrganicKeywords: integer("total_organic_keywords"),
  monthlyOrganicTraffic: integer("monthly_organic_traffic"),
  referringDomains: integer("referring_domains"),
  googleReviewCount: integer("google_review_count"),
  googleReviewRating: real("google_review_rating"),
  backlinkSummary: jsonb("backlink_summary"),
  topBacklinks: jsonb("top_backlinks").default([]),
}, (table) => ({
  auditIdIdx: index("audit_competitors_audit_id_idx").on(table.auditId),
}));

export const insertAuditCompetitorSchema = createInsertSchema(auditCompetitors).omit({
  id: true,
});

export type InsertAuditCompetitor = z.infer<typeof insertAuditCompetitorSchema>;
export type AuditCompetitor = typeof auditCompetitors.$inferSelect;

export const auditContentGaps = pgTable("audit_content_gaps", {
  id: serial("id").primaryKey(),
  auditId: integer("audit_id").references(() => seoAudits.id, { onDelete: "cascade" }).notNull(),
  gapType: text("gap_type").notNull(),
  targetKeyword: text("target_keyword"),
  targetCity: text("target_city"),
  targetService: text("target_service"),
  searchVolume: integer("search_volume"),
  priority: text("priority").default('medium'),
  estimatedHours: real("estimated_hours"),
  status: text("status").default('missing'),
}, (table) => ({
  auditIdIdx: index("audit_content_gaps_audit_id_idx").on(table.auditId),
}));

export const insertAuditContentGapSchema = createInsertSchema(auditContentGaps).omit({
  id: true,
});

export type InsertAuditContentGap = z.infer<typeof insertAuditContentGapSchema>;
export type AuditContentGap = typeof auditContentGaps.$inferSelect;

export const auditReviews = pgTable("audit_reviews", {
  id: serial("id").primaryKey(),
  auditId: integer("audit_id").references(() => seoAudits.id, { onDelete: "cascade" }).notNull(),
  entityType: text("entity_type").notNull(),
  entityName: text("entity_name").notNull(),
  platform: text("platform").notNull(),
  reviewCount: integer("review_count"),
  averageRating: real("average_rating"),
  mostRecentReviewDate: timestamp("most_recent_review_date"),
  monthlyVelocity: real("monthly_velocity"),
  sentimentSummary: jsonb("sentiment_summary"),
}, (table) => ({
  auditIdIdx: index("audit_reviews_audit_id_idx").on(table.auditId),
}));

export const insertAuditReviewSchema = createInsertSchema(auditReviews).omit({
  id: true,
});

export type InsertAuditReview = z.infer<typeof insertAuditReviewSchema>;
export type AuditReview = typeof auditReviews.$inferSelect;

export const auditDeliverables = pgTable("audit_deliverables", {
  id: serial("id").primaryKey(),
  auditId: integer("audit_id").references(() => seoAudits.id, { onDelete: "cascade" }).notNull(),
  phase: integer("phase").notNull(),
  category: text("category").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  estimatedHours: real("estimated_hours").notNull(),
  priority: text("priority").default('medium'),
  sortOrder: integer("sort_order").default(0),
}, (table) => ({
  auditIdIdx: index("audit_deliverables_audit_id_idx").on(table.auditId),
}));

export const insertAuditDeliverableSchema = createInsertSchema(auditDeliverables).omit({
  id: true,
});

export type InsertAuditDeliverable = z.infer<typeof insertAuditDeliverableSchema>;
export type AuditDeliverable = typeof auditDeliverables.$inferSelect;

export const auditPpcForecast = pgTable("audit_ppc_forecast", {
  id: serial("id").primaryKey(),
  auditId: integer("audit_id").references(() => seoAudits.id, { onDelete: "cascade" }).notNull(),
  keyword: text("keyword").notNull(),
  geoTarget: text("geo_target"),
  estimatedClicks: real("estimated_clicks"),
  estimatedImpressions: real("estimated_impressions"),
  estimatedCpc: real("estimated_cpc"),
  estimatedCost: real("estimated_cost"),
  estimatedConversions: real("estimated_conversions"),
  forecastPeriodDays: integer("forecast_period_days").default(90),
}, (table) => ({
  auditIdIdx: index("audit_ppc_forecast_audit_id_idx").on(table.auditId),
}));

export const insertAuditPpcForecastSchema = createInsertSchema(auditPpcForecast).omit({
  id: true,
});

export type InsertAuditPpcForecast = z.infer<typeof insertAuditPpcForecastSchema>;
export type AuditPpcForecast = typeof auditPpcForecast.$inferSelect;

export const auditStageLog = pgTable("audit_stage_log", {
  id: serial("id").primaryKey(),
  auditId: integer("audit_id").references(() => seoAudits.id, { onDelete: "cascade" }).notNull(),
  stage: text("stage").notNull(),
  stageIndex: integer("stage_index").default(0).notNull(),
  status: text("status").notNull(),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
  errorMessage: text("error_message"),
  metadata: jsonb("metadata").default({}),
}, (table) => ({
  auditIdIdx: index("audit_stage_log_audit_id_idx").on(table.auditId),
  statusIdx: index("audit_stage_log_status_idx").on(table.status),
}));

export const insertAuditStageLogSchema = createInsertSchema(auditStageLog).omit({
  id: true,
  startedAt: true,
});

export type InsertAuditStageLog = z.infer<typeof insertAuditStageLogSchema>;
export type AuditStageLog = typeof auditStageLog.$inferSelect;
