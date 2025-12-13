import { pgTable, text, varchar, integer, jsonb, timestamp, boolean } from "drizzle-orm/pg-core";
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
