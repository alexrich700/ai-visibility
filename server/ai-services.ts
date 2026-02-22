import OpenAI from "openai";
import { 
  ExtractedCitation, 
  extractOpenAICitations, 
  extractGeminiCitations, 
  extractUrlsFromText, 
  mergeCitations 
} from "./services/citation-extractor";
import { db } from "./db";
import { promptFallbackLogs } from "@shared/schema";
import { DatabaseKeepaliveContext } from "./db-utils";
import {
  PROMPTS_PER_GROUP,
  AUDIT_PROMPT_COUNT,
  SENTIMENT_PROMPT_COUNT,
  LEAD_GEN_TOTAL_PROMPTS,
} from "@shared/audit-constants";

// Configuration constants for prompt generation
export { PROMPTS_PER_GROUP, AUDIT_PROMPT_COUNT, SENTIMENT_PROMPT_COUNT, LEAD_GEN_TOTAL_PROMPTS };

// ============================================
// ERROR CLASSIFICATION AND DIAGNOSTICS
// ============================================

export type PromptGenerationFailureReason = 
  | 'API_KEY_MISSING'
  | 'API_RATE_LIMIT'
  | 'API_TIMEOUT'
  | 'API_AUTH_ERROR'
  | 'API_SERVER_ERROR'
  | 'JSON_PARSE_ERROR'
  | 'INSUFFICIENT_RESULTS'
  | 'NETWORK_ERROR'
  | 'CONTENT_FILTER'
  | 'EMPTY_RESPONSE'
  | 'UNKNOWN_ERROR';

interface PromptGenerationDiagnostics {
  reason: PromptGenerationFailureReason;
  message: string;
  timestamp: string;
  details?: Record<string, unknown>;
}

function classifyError(error: unknown): PromptGenerationDiagnostics {
  const timestamp = new Date().toISOString();
  
  if (error instanceof SyntaxError) {
    return {
      reason: 'JSON_PARSE_ERROR',
      message: `Failed to parse AI response as JSON: ${error.message}`,
      timestamp,
      details: { errorType: 'SyntaxError' }
    };
  }
  
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    
    if (msg.includes('api key') || msg.includes('apikey') || msg.includes('unauthorized') || msg.includes('401')) {
      return {
        reason: 'API_AUTH_ERROR',
        message: `OpenAI authentication failed: ${error.message}`,
        timestamp,
        details: { errorType: error.name }
      };
    }
    
    if (msg.includes('rate limit') || msg.includes('429') || msg.includes('too many requests')) {
      return {
        reason: 'API_RATE_LIMIT',
        message: `OpenAI rate limit exceeded: ${error.message}`,
        timestamp,
        details: { errorType: error.name }
      };
    }
    
    if (msg.includes('timeout') || msg.includes('timed out') || msg.includes('etimedout')) {
      return {
        reason: 'API_TIMEOUT',
        message: `OpenAI request timed out: ${error.message}`,
        timestamp,
        details: { errorType: error.name }
      };
    }
    
    if (msg.includes('500') || msg.includes('502') || msg.includes('503') || msg.includes('server error')) {
      return {
        reason: 'API_SERVER_ERROR',
        message: `OpenAI server error: ${error.message}`,
        timestamp,
        details: { errorType: error.name }
      };
    }
    
    if (msg.includes('network') || msg.includes('econnrefused') || msg.includes('enotfound') || msg.includes('fetch failed')) {
      return {
        reason: 'NETWORK_ERROR',
        message: `Network error connecting to OpenAI: ${error.message}`,
        timestamp,
        details: { errorType: error.name }
      };
    }
    
    return {
      reason: 'UNKNOWN_ERROR',
      message: `Unexpected error: ${error.message}`,
      timestamp,
      details: { errorType: error.name, stack: error.stack?.slice(0, 500) }
    };
  }
  
  return {
    reason: 'UNKNOWN_ERROR',
    message: `Unknown error type: ${String(error)}`,
    timestamp
  };
}

// Track fallback usage for diagnostics
let fallbackStats = {
  totalCalls: 0,
  fallbackCount: 0,
  lastFallbackReason: null as PromptGenerationDiagnostics | null,
  reasonCounts: {} as Record<PromptGenerationFailureReason, number>
};

export function getPromptGenerationStats() {
  return {
    ...fallbackStats,
    fallbackRate: fallbackStats.totalCalls > 0 
      ? (fallbackStats.fallbackCount / fallbackStats.totalCalls * 100).toFixed(1) + '%'
      : '0%'
  };
}

interface FallbackContext {
  businessName?: string;
  industry?: string;
  promptCount?: number;
}

async function recordFallback(diagnostics: PromptGenerationDiagnostics, context?: FallbackContext) {
  fallbackStats.fallbackCount++;
  fallbackStats.lastFallbackReason = diagnostics;
  fallbackStats.reasonCounts[diagnostics.reason] = (fallbackStats.reasonCounts[diagnostics.reason] || 0) + 1;
  
  console.error(`[PROMPT_GENERATION_FALLBACK] Reason: ${diagnostics.reason}`);
  console.error(`[PROMPT_GENERATION_FALLBACK] Message: ${diagnostics.message}`);
  console.error(`[PROMPT_GENERATION_FALLBACK] Timestamp: ${diagnostics.timestamp}`);
  if (diagnostics.details) {
    console.error(`[PROMPT_GENERATION_FALLBACK] Details:`, JSON.stringify(diagnostics.details));
  }
  
  // Persist to database for production debugging
  try {
    await db.insert(promptFallbackLogs).values({
      reason: diagnostics.reason,
      errorMessage: diagnostics.message,
      errorDetails: diagnostics.details || null,
      businessName: context?.businessName || null,
      industry: context?.industry || null,
      promptCount: context?.promptCount || null,
      environment: process.env.NODE_ENV || 'development',
    });
    console.log(`[PROMPT_GENERATION_FALLBACK] Logged to database`);
  } catch (dbError) {
    console.error(`[PROMPT_GENERATION_FALLBACK] Failed to log to database:`, dbError);
  }
}

// ============================================
// CIRCUIT BREAKER PATTERN FOR AI API CALLS
// ============================================

type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

class Semaphore {
  private active = 0;
  private queue: Array<() => void> = [];

  constructor(private readonly maxConcurrent: number) {}

  async acquire(): Promise<() => void> {
    if (this.active < this.maxConcurrent) {
      this.active++;
      return () => this.release();
    }

    await new Promise<void>((resolve) => this.queue.push(resolve));
    this.active++;
    return () => this.release();
  }

  private release() {
    this.active = Math.max(0, this.active - 1);
    const next = this.queue.shift();
    if (next) {
      next();
    }
  }
}

interface CircuitBreakerConfig {
  failureThreshold: number;
  resetTimeoutMs: number;
  halfOpenMaxAttempts: number;
}

class CircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private failureCount = 0;
  private lastFailureTime: number | null = null;
  private halfOpenAttempts = 0;
  private config: CircuitBreakerConfig;
  private name: string;

  constructor(name: string, config?: Partial<CircuitBreakerConfig>) {
    this.name = name;
    this.config = {
      failureThreshold: config?.failureThreshold ?? 5,
      resetTimeoutMs: config?.resetTimeoutMs ?? 60000,
      halfOpenMaxAttempts: config?.halfOpenMaxAttempts ?? 2,
    };
  }

  private updateState(): void {
    if (this.state === 'OPEN' && this.lastFailureTime) {
      const timeSinceLastFailure = Date.now() - this.lastFailureTime;
      if (timeSinceLastFailure >= this.config.resetTimeoutMs) {
        console.log(`[CIRCUIT_BREAKER:${this.name}] Transitioning from OPEN to HALF_OPEN after ${(timeSinceLastFailure/1000).toFixed(0)}s cooldown`);
        this.state = 'HALF_OPEN';
        this.halfOpenAttempts = 0;
      }
    }
  }

  isOpen(): boolean {
    this.updateState();
    return this.state === 'OPEN';
  }

  getState(): CircuitState {
    this.updateState();
    return this.state;
  }

  recordSuccess(): void {
    if (this.state === 'HALF_OPEN') {
      console.log(`[CIRCUIT_BREAKER:${this.name}] Request succeeded in HALF_OPEN state, closing circuit`);
    }
    this.state = 'CLOSED';
    this.failureCount = 0;
    this.halfOpenAttempts = 0;
    this.lastFailureTime = null;
  }

  recordFailure(isRateLimit: boolean = false): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.state === 'HALF_OPEN') {
      this.halfOpenAttempts++;
      if (this.halfOpenAttempts >= this.config.halfOpenMaxAttempts) {
        console.log(`[CIRCUIT_BREAKER:${this.name}] HALF_OPEN attempts exhausted (${this.halfOpenAttempts}), reopening circuit`);
        this.state = 'OPEN';
      }
      return;
    }

    if (isRateLimit) {
      console.log(`[CIRCUIT_BREAKER:${this.name}] Rate limit detected, immediately opening circuit for ${(this.config.resetTimeoutMs/1000)}s`);
      this.state = 'OPEN';
      return;
    }

    if (this.failureCount >= this.config.failureThreshold) {
      console.log(`[CIRCUIT_BREAKER:${this.name}] Failure threshold reached (${this.failureCount}/${this.config.failureThreshold}), opening circuit`);
      this.state = 'OPEN';
    }
  }

  getStats(): { state: CircuitState; failureCount: number; lastFailureTime: number | null } {
    this.updateState();
    return {
      state: this.state,
      failureCount: this.failureCount,
      lastFailureTime: this.lastFailureTime,
    };
  }
}

const openAICircuitBreaker = new CircuitBreaker('OpenAI', {
  failureThreshold: 5,
  resetTimeoutMs: 60000,
  halfOpenMaxAttempts: 2,
});

const geminiCircuitBreaker = new CircuitBreaker('Gemini', {
  failureThreshold: 5,
  resetTimeoutMs: 60000,
  halfOpenMaxAttempts: 2,
});

// Gemini has stricter RPM ceilings than OpenAI, so cap in-process concurrency to reduce throttling.
const geminiConcurrencyLimiter = new Semaphore(4);

export function getCircuitBreakerStats() {
  return {
    openai: openAICircuitBreaker.getStats(),
    gemini: geminiCircuitBreaker.getStats(),
  };
}

// ============================================
// API KEY VALIDATION
// ============================================

let openaiKeyValidated = false;
let openaiKeyValid = false;

export function validateOpenAIKey(): { valid: boolean; message: string } {
  const apiKey = process.env.MY_OPENAI_API_KEY;
  
  if (!apiKey) {
    console.error('[CRITICAL] MY_OPENAI_API_KEY is not set! Prompt generation will use fallback defaults.');
    return { valid: false, message: 'MY_OPENAI_API_KEY environment variable is not set' };
  }
  
  if (apiKey.length < 20) {
    console.error('[CRITICAL] MY_OPENAI_API_KEY appears to be invalid (too short).');
    return { valid: false, message: 'MY_OPENAI_API_KEY appears to be invalid' };
  }
  
  if (!apiKey.startsWith('sk-')) {
    console.warn('[WARNING] MY_OPENAI_API_KEY does not start with "sk-" - this may be an invalid key format.');
  }
  
  console.log('[OK] MY_OPENAI_API_KEY is configured');
  return { valid: true, message: 'API key is configured' };
}

export async function testOpenAIConnectivity(): Promise<{ success: boolean; message: string; latencyMs?: number }> {
  const startTime = Date.now();
  
  const keyValidation = validateOpenAIKey();
  if (!keyValidation.valid) {
    return { success: false, message: keyValidation.message };
  }
  
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5-mini",
      messages: [{ role: "user", content: "Reply with just the word 'OK'" }],
      max_completion_tokens: 10,
    });
    
    const latencyMs = Date.now() - startTime;
    const content = response.choices[0]?.message?.content || "";
    
    if (content.toLowerCase().includes('ok')) {
      openaiKeyValidated = true;
      openaiKeyValid = true;
      console.log(`[OK] OpenAI connectivity test passed (${latencyMs}ms)`);
      return { success: true, message: 'OpenAI connection successful', latencyMs };
    } else {
      console.warn(`[WARNING] OpenAI responded but with unexpected content: "${content}"`);
      return { success: true, message: 'OpenAI responded but with unexpected content', latencyMs };
    }
  } catch (error) {
    const diagnostics = classifyError(error);
    console.error(`[ERROR] OpenAI connectivity test failed: ${diagnostics.message}`);
    openaiKeyValidated = true;
    openaiKeyValid = false;
    return { success: false, message: diagnostics.message };
  }
}

// Retry helper with exponential backoff for API calls (following OpenAI recommendations)
function isRateLimitError(error: unknown): boolean {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    return msg.includes('rate limit') || 
           msg.includes('429') || 
           msg.includes('too many requests') ||
           msg.includes('quota exceeded');
  }
  return false;
}

// Add random jitter to delays as OpenAI recommends
function addJitter(baseDelay: number, jitterFactor: number = 0.5): number {
  const jitter = baseDelay * jitterFactor * Math.random();
  return Math.floor(baseDelay + jitter);
}

// Small delay with jitter to space out API requests within rate limits
async function rateLimitDelay(): Promise<void> {
  // Random delay between 800ms and 1500ms to stay well under RPM limits
  const delay = 800 + Math.floor(Math.random() * 700);
  await new Promise(resolve => setTimeout(resolve, delay));
}

async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  initialDelayMs: number = 2000
): Promise<T> {
  let lastError: Error | null = null;
  let delay = initialDelayMs;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      if (attempt < maxRetries) {
        // True exponential backoff with jitter as OpenAI recommends
        // Formula: delay *= base * (1 + jitter * random())
        const exponentialBase = 2;
        const jitterFactor = 0.5;
        
        if (isRateLimitError(error)) {
          // Rate limit: start with longer base delay (30s) and grow exponentially
          delay = 30000 * Math.pow(exponentialBase, attempt);
          delay = addJitter(delay, jitterFactor);
          console.log(`[RATE_LIMIT] Rate limit detected. Waiting ${(delay/1000).toFixed(1)}s before retry ${attempt + 1}/${maxRetries}...`);
        } else {
          // Other errors: exponential backoff from 2s base
          delay = initialDelayMs * Math.pow(exponentialBase, attempt);
          delay = addJitter(delay, jitterFactor);
          console.log(`Retry attempt ${attempt + 1}/${maxRetries} after ${(delay/1000).toFixed(1)}s delay...`);
        }
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError;
}

async function queryGeminiText(systemPrompt: string, userPrompt: string, maxTokens: number = 4096, expectJson: boolean = false): Promise<string> {
  if (!process.env.AI_INTEGRATIONS_GEMINI_API_KEY) {
    throw new Error("Gemini API key not configured");
  }
  if (geminiCircuitBreaker.isOpen()) {
    throw new Error("Gemini circuit breaker is open");
  }

  const releaseGeminiSlot = await geminiConcurrencyLimiter.acquire();
  try {
    const { GoogleGenAI } = await import("@google/genai");
    const ai = new GoogleGenAI({
      apiKey: process.env.AI_INTEGRATIONS_GEMINI_API_KEY,
      httpOptions: {
        apiVersion: "",
        baseUrl: process.env.AI_INTEGRATIONS_GEMINI_BASE_URL,
      },
    });

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: expectJson 
        ? `${systemPrompt}\n\nIMPORTANT: Return ONLY valid JSON with no markdown formatting, no code blocks, no explanations.\n\n${userPrompt}`
        : `${systemPrompt}\n\n${userPrompt}`,
      config: {
        maxOutputTokens: maxTokens,
      }
    });

    const text = response.text || "";
    geminiCircuitBreaker.recordSuccess();
    return text;
  } catch (error) {
    const isRateLimit = isRateLimitError(error);
    geminiCircuitBreaker.recordFailure(isRateLimit);
    throw error;
  } finally {
    releaseGeminiSlot();
  }
}

// ============================================
// BRAND SENTIMENT PROMPT TEMPLATES
// These prompts ask AI directly about a specific business to get sentiment feedback
// ============================================

/**
 * Generate brand sentiment prompts for a business.
 * These prompts ask AI platforms directly about the business to gather
 * specific feedback, issues, and sentiment - NOT visibility.
 * 
 * @param businessName - The name of the business
 * @param industry - The industry/category (e.g., "plumbing", "marketing agency")
 * @param city - Optional city for local businesses
 * @returns Array of 4 brand sentiment prompts
 */
export function generateBrandSentimentPrompts(
  businessName: string,
  industry: string,
  city?: string
): string[] {
  const locationContext = city ? ` in ${city}` : '';
  
  return [
    // 1. Overall perception / reputation
    `What do you know about ${businessName}${locationContext}? Is it a reputable ${industry} business?`,
    
    // 2. Customer experience and reviews
    `What are customers saying about ${businessName}? What are common complaints or praise points for this ${industry} company?`,
    
    // 3. Trust and credibility 
    `Would you recommend ${businessName}${locationContext} for ${industry} services? What are the pros and cons?`,
    
    // 4. Specific pain points / issues
    `What should someone know before hiring ${businessName}? Are there any red flags or issues with this ${industry} business?`,
  ];
}

// OpenAI client using user's direct API key
const openai = new OpenAI({
  apiKey: process.env.MY_OPENAI_API_KEY,
});

// Extract root domain from URL for detection (e.g., "buildingbrandsmarketing" from "buildingbrandsmarketing.com")
function extractDomainKeywords(url: string): string[] {
  if (!url) return [];
  
  try {
    // Clean the URL
    let cleanUrl = url.toLowerCase().trim();
    if (!cleanUrl.startsWith('http')) {
      cleanUrl = 'https://' + cleanUrl;
    }
    
    const urlObj = new URL(cleanUrl);
    let hostname = urlObj.hostname;
    
    // Remove www. prefix
    hostname = hostname.replace(/^www\./, '');
    
    // Get the domain without TLD (e.g., "buildingbrandsmarketing" from "buildingbrandsmarketing.com")
    const parts = hostname.split('.');
    const domainName = parts[0]; // e.g., "buildingbrandsmarketing"
    
    const keywords: string[] = [];
    
    // Add the full domain name
    if (domainName && domainName.length > 3) {
      keywords.push(domainName);
    }
    
    // Add the full hostname (e.g., "buildingbrandsmarketing.com")
    if (hostname && hostname.length > 3) {
      keywords.push(hostname);
    }
    
    return keywords;
  } catch {
    // If URL parsing fails, try simple extraction
    const cleaned = url.toLowerCase().replace(/^(https?:\/\/)?(www\.)?/, '').split('/')[0];
    const domainName = cleaned.split('.')[0];
    return domainName && domainName.length > 3 ? [domainName, cleaned] : [];
  }
}

// Extract all URLs and domains cited by the AI in its response
function extractCitedDomains(text: string): string[] {
  const domains: Set<string> = new Set();
  
  // Pattern 1: Full URLs (https://example.com/path or http://example.com)
  const urlPattern = /https?:\/\/(?:www\.)?([a-zA-Z0-9][-a-zA-Z0-9]*(?:\.[a-zA-Z0-9][-a-zA-Z0-9]*)+)(?:\/[^\s\)>\]"']*)?/gi;
  let match;
  while ((match = urlPattern.exec(text)) !== null) {
    const domain = match[1].toLowerCase();
    if (domain.length > 3) {
      domains.add(domain);
    }
  }
  
  // Pattern 2: Markdown links [text](url)
  const markdownPattern = /\]\(https?:\/\/(?:www\.)?([a-zA-Z0-9][-a-zA-Z0-9]*(?:\.[a-zA-Z0-9][-a-zA-Z0-9]*)+)[^\)]*\)/gi;
  while ((match = markdownPattern.exec(text)) !== null) {
    const domain = match[1].toLowerCase();
    if (domain.length > 3) {
      domains.add(domain);
    }
  }
  
  // Pattern 3: Bare domains mentioned in text (e.g., "visit example.com" or "their website example.com")
  // Match domain patterns that look like real domains (word.tld or word.word.tld)
  const bareDomainPattern = /\b([a-zA-Z0-9][-a-zA-Z0-9]*\.(?:com|org|net|io|co|us|biz|info|me|tv|app|dev|ai|tech|agency|services|pro|consulting|solutions|group|llc|inc))\b/gi;
  while ((match = bareDomainPattern.exec(text)) !== null) {
    const domain = match[1].toLowerCase();
    if (domain.length > 3) {
      domains.add(domain);
    }
  }
  
  return Array.from(domains);
}

// Normalize a domain for comparison (remove www, lowercase)
function normalizeDomain(domain: string): string {
  return domain.toLowerCase().replace(/^www\./, '').trim();
}

// Generate name variations for better detection
// Also accepts brand aliases for comprehensive matching
// Uses Set for deduplication and efficient lookups
function generateNameVariations(businessName: string, brandAliases?: string[]): string[] {
  const variationSet = new Set<string>();
  
  // Add primary business name (lowercase)
  const primaryName = businessName.toLowerCase().trim();
  if (primaryName.length > 2) {
    variationSet.add(primaryName);
  }
  
  // Add brand aliases (highest priority after exact name)
  if (brandAliases && brandAliases.length > 0) {
    for (const alias of brandAliases) {
      const lowerAlias = alias.toLowerCase().trim();
      if (lowerAlias.length > 2) {
        variationSet.add(lowerAlias);
        // Also add concatenated version of alias (e.g., "smartfix" from "Smart Fix")
        const concatenatedAlias = lowerAlias.replace(/\s+/g, '');
        if (concatenatedAlias.length > 3) {
          variationSet.add(concatenatedAlias);
        }
      }
    }
  }
  
  // Remove common suffixes and create variations
  const suffixesToRemove = [' marketing', ' agency', ' consulting', ' services', ' llc', ' inc', ' co', ' company'];
  let baseName = primaryName;
  for (const suffix of suffixesToRemove) {
    if (baseName.endsWith(suffix)) {
      baseName = baseName.slice(0, -suffix.length).trim();
      if (baseName.length > 3) {
        variationSet.add(baseName);
      }
      break;
    }
  }
  
  // Create concatenated version (e.g., "buildingbrands" from "Building Brands")
  const concatenated = primaryName.replace(/\s+/g, '');
  if (concatenated.length > 4) {
    variationSet.add(concatenated);
  }
  
  return Array.from(variationSet);
}

// Check if any of the search terms are found in the text
// Priority: 1) Domain cited by AI, 2) Business name mentioned in text, 3) Brand aliases
function checkForMentions(text: string, businessName: string, url?: string, brandAliases?: string[]): { found: boolean; matchedTerm?: string; matchType?: 'domain' | 'name' } {
  // STEP 1: Extract all domains/URLs cited by the AI in its response
  const citedDomains = extractCitedDomains(text);
  
  // STEP 2: Check if brand's domain is among the cited domains (highest priority)
  if (url) {
    const brandDomainKeywords = extractDomainKeywords(url);
    // Get the full domain with TLD for exact matching (e.g., "bakerbrothersplumbing.com")
    const brandFullDomain = brandDomainKeywords.find(d => d.includes('.'));
    
    for (const citedDomain of citedDomains) {
      const normalizedCited = normalizeDomain(citedDomain);
      
      // Only allow EXACT domain match (with or without www prefix already normalized)
      // This prevents false positives like "exampleplumbing.com" matching "example.com"
      if (brandFullDomain && normalizedCited === brandFullDomain) {
        console.log(`[DOMAIN MATCH] Brand domain "${brandFullDomain}" exactly matches AI-cited URL: "${citedDomain}"`);
        return { found: true, matchedTerm: citedDomain, matchType: 'domain' };
      }
    }
  }
  
  // STEP 3: If domain not cited, check if business name or aliases are mentioned in the text
  const lowerText = text.toLowerCase();
  const nameVariations = generateNameVariations(businessName, brandAliases);
  
  for (const term of nameVariations) {
    if (term && term.length > 3 && lowerText.includes(term)) {
      console.log(`[NAME MATCH] Business name/alias "${term}" found in AI response text`);
      return { found: true, matchedTerm: term, matchType: 'name' };
    }
  }
  
  // Also check for full domain mentioned in text as fallback (in case AI mentions domain without link)
  // Only match the full domain with TLD to avoid false positives
  if (url) {
    const brandDomainKeywords = extractDomainKeywords(url);
    const brandFullDomain = brandDomainKeywords.find(d => d.includes('.'));
    if (brandFullDomain && lowerText.includes(brandFullDomain)) {
      console.log(`[TEXT DOMAIN MATCH] Brand domain "${brandFullDomain}" found in AI response text`);
      return { found: true, matchedTerm: brandFullDomain, matchType: 'domain' };
    }
  }
  
  // Log cited domains for debugging if no match found
  if (citedDomains.length > 0) {
    console.log(`[NO MATCH] AI cited these domains: ${citedDomains.slice(0, 5).join(', ')}`);
  }
  
  return { found: false };
}

// Type for Gemini grounding metadata extracted from API response
export interface GeminiGroundingMetadata {
  webSearchQueries?: string[];
  groundingSupports?: Array<{
    segment?: { startIndex?: number; endIndex?: number; text?: string };
    groundingChunkIndices?: number[];
  }>;
}

// Helper to extract grounding metadata from Gemini response
function extractGroundingMetadata(response: any): GeminiGroundingMetadata | null {
  try {
    // Check candidates[0].groundingMetadata first
    const candidates = response?.candidates;
    if (Array.isArray(candidates) && candidates.length > 0) {
      const gm = candidates[0]?.groundingMetadata;
      if (gm) {
        return {
          webSearchQueries: Array.isArray(gm.webSearchQueries) ? gm.webSearchQueries : undefined,
          groundingSupports: Array.isArray(gm.groundingSupports) ? gm.groundingSupports.map((s: any) => ({
            segment: s.segment ? {
              startIndex: s.segment.startIndex,
              endIndex: s.segment.endIndex,
              text: s.segment.text
            } : undefined,
            groundingChunkIndices: Array.isArray(s.groundingChunkIndices) ? s.groundingChunkIndices : undefined
          })) : undefined
        };
      }
    }
    
    // Fallback: check direct response.groundingMetadata
    if (response?.groundingMetadata) {
      const gm = response.groundingMetadata;
      return {
        webSearchQueries: Array.isArray(gm.webSearchQueries) ? gm.webSearchQueries : undefined,
        groundingSupports: Array.isArray(gm.groundingSupports) ? gm.groundingSupports : undefined
      };
    }
    
    return null;
  } catch (error) {
    console.error('[extractGroundingMetadata] Error:', error);
    return null;
  }
}

// Gemini client using Replit AI Integrations with Google Search grounding
async function queryGemini(prompt: string, businessName: string, url?: string, brandAliases?: string[]): Promise<{ found: boolean; response: string; competitors: string[]; citations: ExtractedCitation[]; groundingMetadata: GeminiGroundingMetadata | null }> {
  // Check circuit breaker before making API call
  if (geminiCircuitBreaker.isOpen()) {
    console.log(`[GEMINI] Circuit breaker is OPEN, skipping API call for prompt`);
    const fallback = simulateResponse(prompt, businessName);
    return { ...fallback, citations: [], groundingMetadata: null };
  }

  try {
    const releaseGeminiSlot = await geminiConcurrencyLimiter.acquire();
    try {
      const { GoogleGenAI } = await import("@google/genai");
    
    // Use Replit AI Integrations for Gemini access
      const ai = new GoogleGenAI({
        apiKey: process.env.AI_INTEGRATIONS_GEMINI_API_KEY,
        httpOptions: {
          apiVersion: "",
          baseUrl: process.env.AI_INTEGRATIONS_GEMINI_BASE_URL,
        },
      });
    
    // Enable Google Search grounding for real-time search results
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
          tools: [{ googleSearch: {} }]
        }
      });

      const text = response.text || "";
    
    // Extract citations from the Gemini response structure and text
      const structuredCitations = extractGeminiCitations(response);
      const textCitations = extractUrlsFromText(text);
      const citations = mergeCitations(structuredCitations, textCitations);
    
    // Extract grounding metadata for geo-optimization analysis
      const groundingMetadata = extractGroundingMetadata(response);
      if (groundingMetadata?.webSearchQueries?.length) {
        console.log(`[GEMINI] Web search queries used: ${groundingMetadata.webSearchQueries.join(', ')}`);
      }
    
      const detection = checkForMentions(text, businessName, url, brandAliases);
      const competitors = extractCompetitors(text, businessName);
    
    // Debug logging for detection
      const searchTerms = [...generateNameVariations(businessName, brandAliases), ...(url ? extractDomainKeywords(url) : [])];
      console.log(`[GEMINI DETECTION] Business: "${businessName}" | URL: "${url}" | Aliases: ${brandAliases?.length || 0} | Search terms: ${JSON.stringify(searchTerms)} | Found: ${detection.found}${detection.matchedTerm ? ` (matched: "${detection.matchedTerm}")` : ''}`);
      console.log(`[GEMINI] Extracted ${citations.length} citations`);
      if (!detection.found) {
        console.log(`[GEMINI] Response preview (first 300 chars): ${text.slice(0, 300).replace(/\n/g, ' ')}`);
      }

    // Record success - circuit breaker will close if in half-open state
      geminiCircuitBreaker.recordSuccess();

      return { found: detection.found, response: text, competitors, citations, groundingMetadata };
    } finally {
      releaseGeminiSlot();
    }
  } catch (error) {
    console.error("Gemini API error:", error);
    
    // Record failure and check if it's a rate limit
    const isRateLimit = isRateLimitError(error);
    geminiCircuitBreaker.recordFailure(isRateLimit);
    
    const fallback = simulateResponse(prompt, businessName);
    return { ...fallback, citations: [], groundingMetadata: null };
  }
}

// ChatGPT client using Responses API with web_search tool for proper grounding
interface QueryOptions {
  skipRateLimitDelay?: boolean; // Skip delay for batched contexts that handle rate limiting at batch level
}

async function queryChatGPT(prompt: string, businessName: string, url?: string, location?: string, brandAliases?: string[], options?: QueryOptions): Promise<{ found: boolean; response: string; competitors: string[]; citations: ExtractedCitation[] }> {
  // Check circuit breaker before making API call
  if (openAICircuitBreaker.isOpen()) {
    console.log(`[CHATGPT] Circuit breaker is OPEN, skipping API call for prompt`);
    const fallback = simulateResponse(prompt, businessName);
    return { ...fallback, citations: [] };
  }

  try {
    // Build web search tool config with location if provided
    const webSearchTool: Record<string, any> = { type: "web_search" };
    if (location && location !== "nationwide") {
      const parts = location.split(',').map(p => p.trim());
      webSearchTool.user_location = {
        type: "approximate",
        country: "US",
        city: parts[0] || undefined,
        region: parts[1] || undefined
      };
    }
    
    // Add rate limit delay unless we're in a batched context (batch handles rate limiting)
    if (!options?.skipRateLimitDelay) {
      await rateLimitDelay();
    }
    
    // Use Responses API with web_search tool for real-time grounded search results
    // The Responses API uses 'input' and 'instructions' instead of 'messages'
    const response = await openai.responses.create({
      model: "gpt-5-mini",
      tools: [webSearchTool],
      instructions: "You are a helpful assistant that provides factual, detailed answers about local and national businesses. When asked about service providers, list specific company names with their website URLs when possible. At the end of your response, provide a clean bullet list of just the business names you mentioned (no ratings, reviews, hours, or other details).",
      input: prompt
    } as any);

    // Extract text from Responses API response using output_text
    const text = (response as any).output_text || "";
    
    // Debug: log the raw response structure if text is empty
    if (!text) {
      console.log("[CHATGPT] Empty output_text, response structure:", JSON.stringify(response).slice(0, 500));
    }
    
    // Extract citations from the structured response and text
    const structuredCitations = extractOpenAICitations(response);
    const textCitations = extractUrlsFromText(text);
    const citations = mergeCitations(structuredCitations, textCitations);
    
    const detection = checkForMentions(text, businessName, url, brandAliases);
    const competitors = extractCompetitors(text, businessName);
    
    // Debug logging for detection
    const searchTerms = [...generateNameVariations(businessName, brandAliases), ...(url ? extractDomainKeywords(url) : [])];
    console.log(`[CHATGPT DETECTION] Business: "${businessName}" | URL: "${url}" | Aliases: ${brandAliases?.length || 0} | Search terms: ${JSON.stringify(searchTerms)} | Found: ${detection.found}${detection.matchedTerm ? ` (matched: "${detection.matchedTerm}")` : ''}`);
    console.log(`[CHATGPT] Extracted ${citations.length} citations`);
    if (!detection.found) {
      console.log(`[CHATGPT] Response preview (first 300 chars): ${text.slice(0, 300).replace(/\n/g, ' ')}`);
    }

    // Record success - circuit breaker will close if in half-open state
    openAICircuitBreaker.recordSuccess();

    return { found: detection.found, response: text, competitors, citations };
  } catch (error) {
    console.error("ChatGPT API error:", error);
    
    // Record failure and check if it's a rate limit
    const isRateLimit = isRateLimitError(error);
    openAICircuitBreaker.recordFailure(isRateLimit);
    
    const fallback = simulateResponse(prompt, businessName);
    return { ...fallback, citations: [] };
  }
}

// Generic service keywords to filter out from competitor extraction
const SERVICE_KEYWORDS = new Set([
  // Service types
  'handyman', 'plumber', 'electrician', 'painter', 'contractor', 'roofer',
  'landscaper', 'cleaner', 'mover', 'carpenter', 'mechanic', 'technician',
  // Service categories
  'plumbing', 'painting', 'roofing', 'electrical', 'carpentry', 'landscaping',
  'cleaning', 'moving', 'hvac', 'flooring', 'remodeling', 'renovation',
  // Generic terms
  'services', 'service', 'provider', 'providers', 'professional', 'professionals',
  'company', 'companies', 'business', 'businesses', 'expert', 'experts',
  'specialist', 'specialists', 'contractor', 'contractors', 'team', 'crew',
  // Common descriptors that get extracted incorrectly
  'local', 'national', 'certified', 'licensed', 'insured', 'experienced',
  'reliable', 'trusted', 'quality', 'affordable', 'premium', 'top',
  // Phrases that get partially extracted
  'and', 'or', 'the', 'for', 'with', 'from', 'their', 'your', 'our',
]);

// Business name suffixes that indicate a real company name
const BUSINESS_SUFFIXES = [
  'services', 'service', 'company', 'co', 'llc', 'inc', 'corp', 'corporation',
  'group', 'solutions', 'pros', 'masters', 'experts', 'enterprises', 'associates',
];

// Common phrases that are NOT business names (section headers, CTAs, etc.)
const NON_BUSINESS_PHRASES = new Set([
  'get multiple quotes',
  'get quotes',
  'request quotes',
  'compare prices',
  'read reviews',
  'check reviews',
  'view reviews',
  'contact us',
  'learn more',
  'find out more',
  'here are some',
  'things to consider',
  'key factors',
  'important tips',
  'how to choose',
  'what to look for',
  'pros and cons',
  'final thoughts',
  'in conclusion',
  'keep in mind',
  'additional tips',
]);

// Major US cities that should NOT be treated as competitor names
const MAJOR_US_CITIES = new Set([
  'new york', 'los angeles', 'chicago', 'houston', 'phoenix', 'philadelphia',
  'san antonio', 'san diego', 'dallas', 'san jose', 'austin', 'jacksonville',
  'fort worth', 'columbus', 'charlotte', 'san francisco', 'indianapolis',
  'seattle', 'denver', 'washington', 'boston', 'el paso', 'nashville',
  'detroit', 'oklahoma city', 'portland', 'las vegas', 'memphis', 'louisville',
  'baltimore', 'milwaukee', 'albuquerque', 'tucson', 'fresno', 'sacramento',
  'mesa', 'kansas city', 'atlanta', 'miami', 'colorado springs', 'raleigh',
  'omaha', 'long beach', 'virginia beach', 'oakland', 'minneapolis', 'tulsa',
  'arlington', 'tampa', 'new orleans', 'wichita', 'cleveland', 'bakersfield',
  'aurora', 'anaheim', 'honolulu', 'santa ana', 'riverside', 'corpus christi',
  'lexington', 'stockton', 'henderson', 'saint paul', 'st louis', 'cincinnati',
  'pittsburgh', 'greensboro', 'anchorage', 'plano', 'lincoln', 'orlando',
  'irvine', 'newark', 'toledo', 'durham', 'chula vista', 'fort wayne',
  'jersey city', 'st. petersburg', 'laredo', 'scottsdale', 'gilbert', 'lubbock',
  'madison', 'reno', 'buffalo', 'north las vegas', 'chandler', 'glendale',
  'irving', 'hialeah', 'garland', 'fremont', 'baton rouge', 'richmond',
  'boise', 'des moines', 'spokane', 'san bernardino', 'modesto', 'birmingham',
  'tacoma', 'fontana', 'rochester', 'oxnard', 'moreno valley', 'fayetteville',
  'glendale', 'yonkers', 'worcester', 'huntington beach', 'salt lake city',
  'grand rapids', 'amarillo', 'montgomery', 'little rock', 'akron', 'huntsville',
  'augusta', 'grand prairie', 'overland park', 'tallahassee', 'mobile', 'knoxville',
  'shreveport', 'tempe', 'brownsville', 'newport news', 'chattanooga', 'fort lauderdale',
  'providence', 'ontario', 'peoria', 'rancho cucamonga', 'oceanside', 'santa clarita',
  'garden grove', 'vancouver', 'springfield', 'pembroke pines', 'cape coral', 'sioux falls',
  'mckinney', 'frisco', 'keller', 'allen', 'carrollton', 'lewisville', 'richardson',
  'mesquite', 'denton', 'midland', 'abilene', 'beaumont', 'waco', 'round rock',
  'pasadena', 'mcallen', 'killeen', 'sugar land', 'the woodlands', 'conroe',
]);

// US state names and abbreviations
const US_STATES = new Set([
  'alabama', 'al', 'alaska', 'ak', 'arizona', 'az', 'arkansas', 'ar', 'california', 'ca',
  'colorado', 'co', 'connecticut', 'ct', 'delaware', 'de', 'florida', 'fl', 'georgia', 'ga',
  'hawaii', 'hi', 'idaho', 'id', 'illinois', 'il', 'indiana', 'in', 'iowa', 'ia',
  'kansas', 'ks', 'kentucky', 'ky', 'louisiana', 'la', 'maine', 'me', 'maryland', 'md',
  'massachusetts', 'ma', 'michigan', 'mi', 'minnesota', 'mn', 'mississippi', 'ms', 'missouri', 'mo',
  'montana', 'mt', 'nebraska', 'ne', 'nevada', 'nv', 'new hampshire', 'nh', 'new jersey', 'nj',
  'new mexico', 'nm', 'new york', 'ny', 'north carolina', 'nc', 'north dakota', 'nd', 'ohio', 'oh',
  'oklahoma', 'ok', 'oregon', 'or', 'pennsylvania', 'pa', 'rhode island', 'ri', 'south carolina', 'sc',
  'south dakota', 'sd', 'tennessee', 'tn', 'texas', 'tx', 'utah', 'ut', 'vermont', 'vt',
  'virginia', 'va', 'washington', 'wa', 'west virginia', 'wv', 'wisconsin', 'wi', 'wyoming', 'wy',
]);

// Check if a name is a valid business name (not a generic term)
function isValidBusinessName(name: string): boolean {
  const lowerName = name.toLowerCase().trim();
  const words = lowerName.split(/\s+/);
  
  // Reject names ending with colons (section headers)
  if (name.endsWith(':')) {
    return false;
  }
  
  // Reject Google Business Profile metadata patterns
  // e.g., "Closed · Marketing agency · 5.0 (8 reviews)"
  if (/\b(closed|open)\s*·/i.test(name)) {
    return false;
  }
  
  // Reject star ratings with reviews pattern (e.g., "5.0 (71 reviews)" or "4.8 (123)")
  if (/\d+\.\d+\s*\(\d+(\s*reviews?)?\)/i.test(name)) {
    return false;
  }
  
  // Reject standalone category descriptors with separators (e.g., "· Marketing agency ·")
  if (/·\s*[A-Za-z\s]+\s*·/.test(name)) {
    return false;
  }
  
  // Reject if contains common Google Maps metadata patterns (action phrases, not words that could be in business names)
  if (/\b(closed now|open now|opens at|closes at|get directions|business hours)\b/i.test(lowerName)) {
    return false;
  }
  // Reject rating context patterns (e.g., "rated 4.8 stars", "4.5-star rating", "4 star reviews")
  // Preserves business names like "5 Star Plumbing" or "Five Star Auto"
  if (/\b(rated\s+)?\d+\.?\d*[\s-]*stars?\s*(rating|reviews?|service)?\b/i.test(lowerName) && 
      /\b(rating|reviews?|rated)\b/i.test(lowerName)) {
    return false;
  }
  
  // Reject known non-business phrases
  const cleanLowerName = lowerName.replace(/[:\-–·]/g, '').trim();
  if (NON_BUSINESS_PHRASES.has(cleanLowerName)) {
    return false;
  }
  
  // Reject phrases that start with action verbs (typically CTAs/instructions)
  const actionVerbs = ['get', 'check', 'read', 'view', 'find', 'look', 'compare', 'request', 'contact', 'learn', 'see', 'visit', 'call', 'ask', 'choose', 'hire', 'consider'];
  if (actionVerbs.some(verb => lowerName.startsWith(verb + ' '))) {
    return false;
  }
  
  // Reject city names - but ONLY exact matches or "City, State" patterns
  // Do NOT reject legitimate businesses like "Fort Worth Handyman" or "Dallas Electric"
  
  // Pattern 1: Exact city name match (e.g., "Fort Worth" as the complete name)
  if (MAJOR_US_CITIES.has(lowerName)) {
    return false;
  }
  
  // Pattern 2: "City, ST" or "City, State" format (e.g., "Fort Worth, TX" or "Dallas, Texas")
  // This pattern requires a comma followed by a state abbreviation or name
  const cityCommaStatePattern = /^(.+),\s*([a-z]{2}|[a-z]+)$/i;
  const cityStateMatch = lowerName.match(cityCommaStatePattern);
  if (cityStateMatch) {
    const potentialState = cityStateMatch[2]?.trim();
    // Only reject if the part after comma is a valid US state
    if (potentialState && US_STATES.has(potentialState)) {
      return false;
    }
  }
  
  // Reject single-word generic terms
  if (words.length === 1) {
    // Single word is only valid if it's a proper branded name (contains numbers, unique spelling)
    // or ends with a business suffix that makes it a name
    if (SERVICE_KEYWORDS.has(lowerName)) {
      return false;
    }
    // Single words like "TaskRabbit" or "Thumbtack" are valid
    // But "Handyman" or "Plumber" are not
    if (/^[a-z]+$/.test(lowerName) && lowerName.length < 12) {
      return false; // Generic single lowercase word
    }
  }
  
  // Reject if ALL words are generic service keywords
  const nonGenericWords = words.filter(w => !SERVICE_KEYWORDS.has(w));
  if (nonGenericWords.length === 0) {
    return false;
  }
  
  // Reject partial phrases
  if (lowerName.startsWith('and ') || lowerName.startsWith('or ') || 
      lowerName.startsWith('the ') || lowerName.startsWith('to ')) {
    return false;
  }
  
  // Accept multi-word names with at least one capitalized proper noun
  // Accept names ending with business suffixes (e.g., "ABC Services")
  const hasBusinessSuffix = BUSINESS_SUFFIXES.some(suffix => 
    lowerName.endsWith(' ' + suffix) || lowerName === suffix
  );
  
  // Valid if: multi-word OR has business suffix OR contains location indicator
  const hasLocation = /\b(of|in)\s+[A-Z]/.test(name); // "Mr. Handyman of Keller"
  
  return words.length >= 2 || hasBusinessSuffix || hasLocation;
}

// Extract competitor names from AI responses
function extractCompetitors(text: string, excludeBusiness: string): string[] {
  const competitors: Set<string> = new Set();
  
  // Pattern 1: Bold Markdown names **Business Name**
  const boldPattern = /\*\*([A-Z][^*]+?)\*\*/g;
  let match;
  while ((match = boldPattern.exec(text)) !== null) {
    const name = match[1].trim();
    if (isValidBusinessName(name) && name.length > 2 && name.length < 60) {
      if (!name.toLowerCase().includes(excludeBusiness.toLowerCase())) {
        competitors.add(name);
      }
    }
  }
  
  // Pattern 2: Numbered list items with business names (1. Business Name, 2. Another Business)
  const numberedPattern = /^\s*\d+\.\s+\*?\*?([A-Z][A-Za-z\s&'.-]+?)(?:\*?\*?)\s*[-–:]?\s/gm;
  while ((match = numberedPattern.exec(text)) !== null) {
    const name = match[1].trim().replace(/\*+/g, '');
    if (isValidBusinessName(name) && name.length > 2 && name.length < 60) {
      if (!name.toLowerCase().includes(excludeBusiness.toLowerCase())) {
        competitors.add(name);
      }
    }
  }
  
  // Pattern 3: Business names with location patterns (e.g., "Mr. Handyman of Keller")
  const locationPattern = /\b([A-Z][A-Za-z\s&'.-]+?\s+(?:of|in)\s+[A-Z][A-Za-z\s]+?)(?:[,.]|\s+is|\s+offers|\s+provides)/g;
  while ((match = locationPattern.exec(text)) !== null) {
    const name = match[1].trim();
    if (isValidBusinessName(name) && name.length > 5 && name.length < 60) {
      if (!name.toLowerCase().includes(excludeBusiness.toLowerCase())) {
        competitors.add(name);
      }
    }
  }
  
  // Pattern 4: Recommendation patterns with proper business names
  const recommendPattern = /(?:recommend|suggest|consider|try|check out)\s+([A-Z][A-Za-z\s&'.-]+?)(?:\s*[,.]|\s+for|\s+if|\s+as)/gi;
  while ((match = recommendPattern.exec(text)) !== null) {
    const name = match[1].trim();
    if (isValidBusinessName(name) && name.length > 2 && name.length < 60) {
      if (!name.toLowerCase().includes(excludeBusiness.toLowerCase())) {
        competitors.add(name);
      }
    }
  }
  
  // Pattern 5: Names in quotes
  const quotedPattern = /"([A-Z][A-Za-z\s&'.-]+?)"/g;
  while ((match = quotedPattern.exec(text)) !== null) {
    const name = match[1].trim();
    if (isValidBusinessName(name) && name.length > 2 && name.length < 60) {
      if (!name.toLowerCase().includes(excludeBusiness.toLowerCase())) {
        competitors.add(name);
      }
    }
  }

  return Array.from(competitors).slice(0, 10);
}

// Simulate response when APIs are not available
// Note: Simulated responses do NOT include the business to provide realistic "not found" scores
function simulateResponse(prompt: string, businessName: string): { found: boolean; response: string; competitors: string[] } {
  // Always return not found for simulated responses - this prevents artificial score inflation
  const found = false;
  
  const commonCompetitors = [
    "ABC Services", "Premier Solutions", "Quality First", "Pro Masters",
    "Elite Services", "Top Choice", "Best Value", "Reliable Pros",
  ];
  
  const numCompetitors = Math.floor(Math.random() * 4) + 1;
  const competitors = commonCompetitors.sort(() => Math.random() - 0.5).slice(0, numCompetitors);
  
  const response = `Here are some recommended providers: ${competitors.join(", ")}. I would suggest researching each to find the best fit for your needs.`;
  
  return { found, response, competitors };
}

// Generate a one-liner summary for prompt results
function generatePromptSummary(chatgptFound: boolean, googleAIFound: boolean, chatgptCompetitors: string[], googleAICompetitors: string[], businessName: string): string {
  if (chatgptFound && googleAIFound) {
    return `${businessName} was mentioned by both ChatGPT and Google AI.`;
  }
  if (chatgptFound) {
    return `${businessName} found on ChatGPT only. Google AI cited competitors.`;
  }
  if (googleAIFound) {
    return `${businessName} found on Google AI only. ChatGPT cited competitors.`;
  }
  const allCompetitors = Array.from(new Set([...chatgptCompetitors, ...googleAICompetitors]));
  if (allCompetitors.length > 0) {
    const cited = allCompetitors.slice(0, 2).map(c => `'${c}'`).join(' and ');
    return `Cited ${cited}. ${businessName} not mentioned.`;
  }
  return `AI provided generic response. ${businessName} not found.`;
}

// Generate executive summary using AI with GPT-4o
// Fast template-based executive summary - no AI call needed
function generateFastExecutiveSummary(
  businessName: string,
  keyword: string,
  overallScore: number,
  chatgptScore: number,
  googleAIScore: number,
  sentimentOverall: string,
  location: string,
  promptCount: number
): string {
  const locationText = location !== "nationwide" ? ` for ${keyword} in ${location}` : ` for ${keyword} nationwide`;
  
  // Determine visibility level
  let visibilityLevel: string;
  let recommendation: string;
  
  if (overallScore >= 70) {
    visibilityLevel = "strong";
    recommendation = "Your brand has solid AI visibility. Focus on maintaining this position and expanding to related keywords.";
  } else if (overallScore >= 40) {
    visibilityLevel = "moderate";
    recommendation = "There's opportunity to improve. Consider optimizing your digital presence and building more authoritative content.";
  } else if (overallScore >= 20) {
    visibilityLevel = "limited";
    recommendation = "AI platforms are not recommending your business. Immediate action is needed to improve your digital footprint.";
  } else {
    visibilityLevel = "minimal";
    recommendation = "Your competitors are getting recommended while you're invisible to AI. This requires urgent attention.";
  }
  
  return `We analyzed ${businessName} across ${promptCount} high-intent AI prompts on ChatGPT and Google AI${locationText}. The results show ${visibilityLevel} visibility with an overall score of ${overallScore}/100 (ChatGPT: ${chatgptScore}%, Google AI: ${googleAIScore}%) and ${sentimentOverall} brand sentiment. ${recommendation}`;
}

async function generateExecutiveSummary(
  businessName: string,
  keyword: string,
  overallScore: number,
  chatgptScore: number,
  googleAIScore: number,
  sentimentOverall: string,
  location: string
): Promise<string> {
  const systemPrompt = "You write professional, matter-of-fact executive summaries for AI visibility audit reports. Be concise and data-driven.";
  const userPrompt = `Write a 2-3 sentence executive summary for an AI visibility audit.
Start with: "We analyzed ${businessName} across ${LEAD_GEN_TOTAL_PROMPTS} high-intent AI prompts on ChatGPT and Google AI${location !== "nationwide" ? ` for ${keyword} in ${location}` : ` for ${keyword} nationwide`}."
Key findings: overall score ${overallScore}/100, ChatGPT ${chatgptScore}%, Google AI ${googleAIScore}%, sentiment ${sentimentOverall}.
Describe what this means for AI visibility. Be professional.`;

  const templateFallback = `We analyzed ${businessName} across ${LEAD_GEN_TOTAL_PROMPTS} high-intent AI prompts on ChatGPT and Google AI. The results indicate a visibility score of ${overallScore}/100 with ${sentimentOverall} brand sentiment.`;

  if (!openAICircuitBreaker.isOpen() && process.env.MY_OPENAI_API_KEY) {
    try {
      await rateLimitDelay();
      const response = await retryWithBackoff(() =>
        openai.chat.completions.create({
          model: "gpt-5-mini",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt }
          ],
          max_completion_tokens: 512,
        })
      );
      const content = response.choices[0]?.message?.content;
      if (content) return content;
    } catch (error) {
      console.error("Executive summary generation error (OpenAI):", error);
    }
  } else {
    console.log(`[EXEC_SUMMARY] OpenAI unavailable, skipping to Gemini...`);
  }

  console.log(`[EXEC_SUMMARY] Trying Gemini fallback for executive summary...`);
  try {
    const geminiText = await queryGeminiText(systemPrompt, userPrompt, 512);
    if (geminiText && geminiText.length > 20) {
      console.log(`[EXEC_SUMMARY] Gemini fallback generated executive summary successfully`);
      return geminiText;
    }
  } catch (geminiError) {
    console.error("[EXEC_SUMMARY] Gemini fallback also failed:", geminiError);
  }

  console.log(`[EXEC_SUMMARY] Using template fallback`);
  return templateFallback;
}

// Scrape website homepage content
async function scrapeWebsite(url: string): Promise<string | null> {
  try {
    const normalizedUrl = url.startsWith('http') ? url : `https://${url}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    
    const response = await fetch(normalizedUrl, { 
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    
    if (!response.ok) return null;
    const html = await response.text();
    
    // Strip HTML tags and get text only
    const text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
      .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 3000);
    
    return text.length > 100 ? text : null;
  } catch (error) {
    console.error("Website scrape error:", error);
    return null;
  }
}

// Fallback research prompts (NO brand name - for visibility testing)
// These prompts explicitly request specific named businesses to avoid generic advice responses
// serviceCategory can override keyword for service-specific prompts (e.g., "AC Repair" within "HVAC")
function getFallbackResearchPrompts(keyword: string, location: string, serviceCategory?: string): string[] {
  const loc = location !== "nationwide" ? ` in ${location}` : "";
  const year = new Date().getFullYear();
  const target = serviceCategory || keyword;
  return [
    `Give me a list of the top 3 ${target} companies${loc}`,
    `Name 5 specific ${target} businesses I can call today${loc}`,
    `What are the best reviewed ${target} services${loc}?`,
    `List the top-rated ${target} companies${loc}`,
    `Which ${target} businesses${loc} have the best reputation?`,
    `Can you recommend specific ${target} companies${loc}?`,
    `Name the most trusted ${target} services${loc}`,
    `What ${target} companies${loc} have the best Google reviews in ${year}?`,
    `List 3 ${target} businesses that offer same-day service${loc}`,
    `Which specific ${target} companies do you recommend${loc}?`,
    `Give me the names of reliable ${target} services${loc}`,
    `What are 5 ${target} companies I should get quotes from${loc}?`,
    `Name some well-known ${target} franchises${loc}`,
    `List ${target} businesses${loc} with 4.5+ star ratings`,
    `Which ${target} companies${loc} are best for residential work?`,
    `Can you name the leading ${target} providers${loc}?`,
    `What are the top ${target} companies for emergencies${loc}?`,
    `List specific ${target} providers I can hire${loc}`,
    `Name ${target} businesses${loc} that offer free estimates`,
    `Which ${target} companies${loc} are best for commercial jobs?`,
  ];
}

// Fallback sentiment prompts (WITH brand name - for sentiment analysis)
function getFallbackSentimentPrompts(businessName: string, keyword: string, location: string): string[] {
  const loc = location !== "nationwide" ? ` in ${location}` : "";
  return [
    `Would you recommend ${businessName}${loc}?`,
    `Is ${businessName} a reliable ${keyword}?`,
    `What do customers say about ${businessName}?`,
    `${businessName} reviews - are they worth it?`,
    `Should I hire ${businessName} for ${keyword}?`,
  ];
}

// Fast research prompts for lead gen audits - skips AI generation and website scraping
// Returns exactly AUDIT_PROMPT_COUNT (10) high-quality prompts immediately
export function getFastAuditPrompts(keyword: string, location: string): string[] {
  const loc = location !== "nationwide" ? ` in ${location}` : "";
  const year = new Date().getFullYear();
  return [
    `Who are the best ${keyword} companies${loc}?`,
    `List the top-rated ${keyword} services${loc}`,
    `Which ${keyword} businesses do you recommend${loc}?`,
    `Name 5 specific ${keyword} companies I can call today${loc}`,
    `What are the most trusted ${keyword} providers${loc}?`,
    `Best ${keyword} for residential work${loc}`,
    `Top ${keyword} companies with great reviews in ${year}${loc}`,
    `Emergency ${keyword} services available now${loc}`,
    `Affordable ${keyword} companies${loc}`,
    `Which ${keyword} businesses offer same-day service${loc}`,
  ];
}

// Fast sentiment prompts for lead gen audits - 3 high-impact prompts only
export function getFastSentimentPrompts(businessName: string, keyword: string, location: string): string[] {
  const loc = location !== "nationwide" ? ` in ${location}` : "";
  return [
    `Would you recommend ${businessName}${loc}?`,
    `What do customers say about ${businessName}?`,
    `Is ${businessName} a good ${keyword}?`,
  ];
}

// Generate RESEARCH-BASED prompts (NO brand name - for visibility testing)
// Uses PROMPTS_PER_GROUP constant to determine how many prompts to generate
// Optional serviceCategory param allows generating prompts for specific service groups (e.g., "AC Repair")
export async function generateResearchPrompts(
  keyword: string,
  scope: "local" | "national",
  city?: string,
  url?: string,
  serviceCategory?: string
): Promise<string[]> {
  const location = scope === "local" && city ? city : "nationwide";
  const locationStr = location !== "nationwide" ? ` in ${location}` : "";
  const promptCount = PROMPTS_PER_GROUP; // Use the shared constant
  
  // If serviceCategory is provided, focus prompts on that specific service
  const targetService = serviceCategory || keyword;
  const industryContext = serviceCategory ? `${keyword} industry, specifically ${serviceCategory}` : keyword;
  
  // Try to scrape homepage for context about services (only for general prompts, not group-specific)
  let homepageContent: string | null = null;
  if (url && !serviceCategory) {
    console.log(`Scraping website: ${url}`);
    homepageContent = await scrapeWebsite(url);
    if (homepageContent) {
      console.log(`Got ${homepageContent.length} chars of homepage content`);
    }
  }
  
  // Build prompt for OpenAI - explicitly exclude brand name but request specific business names in responses
  const systemPrompt = `You are a marketing expert specializing in AI search optimization. Generate exactly ${promptCount} unique research-based search queries that potential customers would type into AI assistants (like ChatGPT or Google AI) when actively looking for ${targetService} services${locationStr}.

CRITICAL REQUIREMENTS:
1. These must be GENERIC research queries that do NOT include any specific business or brand names
2. Each query MUST explicitly ask for SPECIFIC BUSINESS NAMES to be listed - avoid vague queries that result in generic advice
3. Use long-tail, specific queries that will trigger AI to list actual company names
4. ALL prompts must be focused on "${targetService}" - this is the specific service category we're testing visibility for
5. Each query must be UNIQUE and different from the others - vary the phrasing, intent, and focus

PROMPT VARIETY - include different intent types:
- Transactional: "Who can I hire for ${targetService}${locationStr}?"
- Comparison: "Compare the top ${targetService} companies${locationStr}"
- Specific needs: "Best ${targetService} for [specific use case]${locationStr}"
- Emergency: "Emergency ${targetService} services available now${locationStr}"
- Cost-focused: "Affordable ${targetService} services${locationStr}"
- Quality-focused: "Highest rated ${targetService} providers${locationStr}"
- Recommendation: "Which ${targetService} companies do you recommend${locationStr}?"

DO NOT generate prompts that will result in generic advice like:
- "What to look for in ${targetService}" (educational, not transactional)
- "Pros and cons of ${targetService}" (informational, won't list businesses)
- Generic prompts without asking for specific business names

Return ONLY a valid JSON array of exactly ${promptCount} strings. No explanations, no markdown, just the JSON array.`;
  
  let userPrompt = `Generate ${promptCount} unique, specific, long-tail AI search queries for ${targetService} services${locationStr}.
${serviceCategory ? `\nThis is for the "${serviceCategory}" service category within the ${keyword} industry.` : ''}

IMPORTANT:
- Each query must be UNIQUE - do not repeat similar phrasing
- Each query should explicitly request a LIST of specific business names
- ALL queries must be focused on ${targetService} - do not mix in other service types
- NO brand names in the queries themselves, but queries should request brand names in the response
- Include variety: transactional, comparison, emergency, cost-focused, quality-focused queries`;
  
  if (homepageContent) {
    userPrompt += `

Here is homepage content for context about typical services in this industry (but DO NOT use the company name):
${homepageContent}`;
  }
  
  // Track this call for diagnostics
  fallbackStats.totalCalls++;
  
  // Check API key and circuit breaker before making call
  const openAIAvailable = !!process.env.MY_OPENAI_API_KEY && !openAICircuitBreaker.isOpen();
  
  if (!openAIAvailable) {
    const reason = !process.env.MY_OPENAI_API_KEY ? 'API_KEY_MISSING' : 'API_RATE_LIMIT';
    const message = !process.env.MY_OPENAI_API_KEY 
      ? 'MY_OPENAI_API_KEY environment variable is not set'
      : 'OpenAI circuit breaker is open, trying Gemini fallback';
    console.log(`[PROMPT_GEN] OpenAI unavailable (${reason}), trying Gemini for research prompts...`);
    
    try {
      const geminiText = await queryGeminiText(systemPrompt, userPrompt, 4096, true);
      const cleanText = geminiText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const parsed = JSON.parse(cleanText);
      if (Array.isArray(parsed)) {
        const validPrompts = parsed
          .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
          .map(s => s.trim())
          .slice(0, promptCount);
        if (validPrompts.length >= 3) {
          console.log(`[PROMPT_GEN] Gemini fallback generated ${validPrompts.length} research prompts for "${targetService}"`);
          const fallbackPad = getFallbackResearchPrompts(keyword, location, serviceCategory);
          return [...validPrompts, ...fallbackPad].slice(0, promptCount);
        }
      }
    } catch (geminiError) {
      console.error(`[PROMPT_GEN] Gemini fallback also failed:`, geminiError);
    }
    
    const diagnostics: PromptGenerationDiagnostics = {
      reason,
      message,
      timestamp: new Date().toISOString(),
      details: { targetService, location }
    };
    await recordFallback(diagnostics, { industry: keyword, promptCount });
    return getFallbackResearchPrompts(keyword, location, serviceCategory).slice(0, promptCount);
  }
  
  try {
    console.log(`Generating ${promptCount} research prompts with GPT-5.2 for "${targetService}"...`);
    
    // Add rate limit delay before API call to spread requests evenly (as OpenAI recommends)
    await rateLimitDelay();
    
    const response = await retryWithBackoff(() => 
      openai.chat.completions.create({
        model: "gpt-5-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        max_completion_tokens: 4096,
      })
    );
    
    // Detailed logging to diagnose empty responses
    const choice = response.choices[0];
    const text = choice?.message?.content || "";
    const finishReason = choice?.finish_reason;
    const refusal = (choice?.message as any)?.refusal;
    
    console.log(`[OPENAI_DEBUG] Response for "${targetService}":`);
    console.log(`  - finish_reason: ${finishReason}`);
    console.log(`  - refusal: ${refusal || 'none'}`);
    console.log(`  - content length: ${text.length} chars`);
    console.log(`  - has choices: ${response.choices?.length || 0}`);
    if (response.usage) {
      console.log(`  - tokens: prompt=${response.usage.prompt_tokens}, completion=${response.usage.completion_tokens}`);
    }
    if (!text && finishReason !== 'stop') {
      console.log(`  - FULL RESPONSE: ${JSON.stringify(response).slice(0, 1000)}`);
    }
    
    console.log("OpenAI research prompts response:", text.slice(0, 200));
    
    // Check for refusal or abnormal finish reason
    if (refusal) {
      const diagnostics: PromptGenerationDiagnostics = {
        reason: 'CONTENT_FILTER',
        message: `OpenAI refused to generate content: ${refusal}`,
        timestamp: new Date().toISOString(),
        details: { targetService, refusal, finishReason }
      };
      console.log(`[OPENAI_REFUSAL] ${refusal}`);
      await recordFallback(diagnostics, { industry: keyword, promptCount });
      return getFallbackResearchPrompts(keyword, location, serviceCategory).slice(0, promptCount);
    }
    
    // Check for empty response with abnormal finish reason
    if (!text && finishReason !== 'stop') {
      const diagnostics: PromptGenerationDiagnostics = {
        reason: 'EMPTY_RESPONSE',
        message: `OpenAI returned empty content with finish_reason: ${finishReason}`,
        timestamp: new Date().toISOString(),
        details: { targetService, finishReason, choiceCount: response.choices?.length || 0 }
      };
      console.log(`[OPENAI_EMPTY] Empty response, finish_reason=${finishReason}`);
      await recordFallback(diagnostics, { industry: keyword, promptCount });
      return getFallbackResearchPrompts(keyword, location, serviceCategory).slice(0, promptCount);
    }
    
    // Attempt to parse JSON
    let parsed: unknown;
    try {
      const cleanText = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      parsed = JSON.parse(cleanText);
    } catch (parseError) {
      const diagnostics = classifyError(parseError);
      diagnostics.details = { 
        ...diagnostics.details, 
        targetService, 
        rawResponse: text.slice(0, 500),
        finishReason 
      };
      await recordFallback(diagnostics, { industry: keyword, promptCount });
      return getFallbackResearchPrompts(keyword, location, serviceCategory).slice(0, promptCount);
    }
    
    if (Array.isArray(parsed)) {
      const validPrompts = parsed
        .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        .map(s => s.trim())
        .slice(0, promptCount);
      
      // Accept if we got at least the required number of prompts (more flexible than exact match)
      if (validPrompts.length >= promptCount) {
        console.log(`[SUCCESS] Generated ${validPrompts.length} valid research prompts for "${targetService}"`);
        return validPrompts.slice(0, promptCount);
      } else if (validPrompts.length >= 3) {
        // Accept fewer prompts if we got at least 3 (pad with fallback if needed)
        console.log(`[PARTIAL] OpenAI returned ${validPrompts.length} prompts, padding with fallback for "${targetService}"`);
        const fallbackPrompts = getFallbackResearchPrompts(keyword, location, serviceCategory);
        const combined = [...validPrompts, ...fallbackPrompts.slice(0, promptCount - validPrompts.length)];
        return combined.slice(0, promptCount);
      } else {
        const diagnostics: PromptGenerationDiagnostics = {
          reason: 'INSUFFICIENT_RESULTS',
          message: `OpenAI returned only ${validPrompts.length} valid prompts (need ${promptCount})`,
          timestamp: new Date().toISOString(),
          details: { targetService, validPromptCount: validPrompts.length, requiredCount: promptCount }
        };
        await recordFallback(diagnostics, { industry: keyword, promptCount });
      }
    } else {
      const diagnostics: PromptGenerationDiagnostics = {
        reason: 'JSON_PARSE_ERROR',
        message: 'OpenAI response was not a valid array',
        timestamp: new Date().toISOString(),
        details: { targetService, parsedType: typeof parsed }
      };
      await recordFallback(diagnostics, { industry: keyword, promptCount });
    }
  } catch (error) {
    const diagnostics = classifyError(error);
    diagnostics.details = { ...diagnostics.details, targetService, location };
    await recordFallback(diagnostics, { industry: keyword, promptCount });
    
    console.log(`[PROMPT_GEN] OpenAI failed for research prompts, trying Gemini fallback...`);
    try {
      const geminiText = await queryGeminiText(systemPrompt, userPrompt, 4096, true);
      const cleanText = geminiText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const parsed = JSON.parse(cleanText);
      if (Array.isArray(parsed)) {
        const validPrompts = parsed
          .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
          .map(s => s.trim())
          .slice(0, promptCount);
        if (validPrompts.length >= 3) {
          console.log(`[PROMPT_GEN] Gemini fallback generated ${validPrompts.length} research prompts for "${targetService}"`);
          const fallbackPad = getFallbackResearchPrompts(keyword, location, serviceCategory);
          return [...validPrompts, ...fallbackPad].slice(0, promptCount);
        }
      }
    } catch (geminiError) {
      console.error(`[PROMPT_GEN] Gemini fallback also failed:`, geminiError);
    }
  }
  
  return getFallbackResearchPrompts(keyword, location, serviceCategory).slice(0, promptCount);
}

// Generate 5 SENTIMENT prompts (WITH brand name - for sentiment analysis)
export async function generateSentimentPrompts(
  businessName: string,
  keyword: string,
  scope: "local" | "national",
  city?: string
): Promise<string[]> {
  const location = scope === "local" && city ? city : "nationwide";
  
  const systemPrompt = `You are a marketing expert. Generate exactly 5 brand-specific search queries that someone would type into AI assistants to learn about the reputation and quality of a specific business.

These queries should:
- Directly mention the business name: "${businessName}"
- Ask about reviews, recommendations, reliability, quality
- Be natural questions a potential customer would ask

Return ONLY a valid JSON array of exactly ${SENTIMENT_PROMPT_COUNT} strings. No explanations, no markdown, just the JSON array.`;
  
  const userPrompt = `Generate ${SENTIMENT_PROMPT_COUNT} brand-specific queries for:
Business Name: ${businessName}
Industry: ${keyword}
Location: ${location !== "nationwide" ? location : "National"}

Example formats:
- "Would you recommend [business name]?"
- "Is [business name] a good [service]?"
- "What do customers say about [business name]?"`;
  
  const parseSentimentResponse = (text: string): string[] | null => {
    const cleanText = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    try {
      const parsed = JSON.parse(cleanText);
      if (Array.isArray(parsed)) {
        const validPrompts = parsed
          .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
          .map(s => s.trim())
          .slice(0, SENTIMENT_PROMPT_COUNT);
        if (validPrompts.length === SENTIMENT_PROMPT_COUNT) {
          return validPrompts;
        }
      }
    } catch {}
    return null;
  };

  if (!openAICircuitBreaker.isOpen() && process.env.MY_OPENAI_API_KEY) {
    try {
      console.log("Generating sentiment prompts with GPT-5.2...");
      await rateLimitDelay();
      
      const response = await retryWithBackoff(() =>
        openai.chat.completions.create({
          model: "gpt-5-mini",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt }
          ],
          max_completion_tokens: 512,
        })
      );
      
      const text = response.choices[0]?.message?.content || "";
      console.log("GPT sentiment prompts response:", text.slice(0, 200));
      
      const result = parseSentimentResponse(text);
      if (result) {
        console.log(`Generated ${SENTIMENT_PROMPT_COUNT} valid sentiment prompts`);
        return result;
      }
    } catch (error) {
      console.error("Sentiment prompt generation error (OpenAI):", error);
    }
  } else {
    console.log(`[PROMPT_GEN] OpenAI unavailable for sentiment prompts, skipping to Gemini...`);
  }

  console.log(`[PROMPT_GEN] Trying Gemini fallback for sentiment prompts...`);
  try {
    const geminiText = await queryGeminiText(systemPrompt, userPrompt, 512, true);
    const result = parseSentimentResponse(geminiText);
    if (result) {
      console.log(`[PROMPT_GEN] Gemini fallback generated ${SENTIMENT_PROMPT_COUNT} valid sentiment prompts`);
      return result;
    }
  } catch (geminiError) {
    console.error("[PROMPT_GEN] Gemini fallback also failed for sentiment:", geminiError);
  }
  
  console.log("Using fallback sentiment prompts");
  return getFallbackSentimentPrompts(businessName, keyword, location);
}

// Analyze sentiment of an AI response
function analyzeSentiment(response: string, businessName: string): "positive" | "negative" | "neutral" {
  const lowerResponse = response.toLowerCase();
  const lowerBusiness = businessName.toLowerCase();
  
  // Check if business is even mentioned
  if (!lowerResponse.includes(lowerBusiness)) {
    return "neutral";
  }
  
  // Positive indicators
  const positiveWords = [
    "recommend", "excellent", "great", "reliable", "trusted", "professional",
    "quality", "satisfied", "happy", "best", "top-rated", "highly rated",
    "good reviews", "positive", "outstanding", "exceptional", "worth it"
  ];
  
  // Negative indicators
  const negativeWords = [
    "not recommend", "avoid", "poor", "bad reviews", "complaints", "issues",
    "problems", "unreliable", "overpriced", "disappointing", "negative",
    "caution", "be careful", "concerns", "warning"
  ];
  
  let positiveScore = 0;
  let negativeScore = 0;
  
  for (const word of positiveWords) {
    if (lowerResponse.includes(word)) positiveScore++;
  }
  
  for (const word of negativeWords) {
    if (lowerResponse.includes(word)) negativeScore++;
  }
  
  if (positiveScore > negativeScore + 1) return "positive";
  if (negativeScore > positiveScore) return "negative";
  return "neutral";
}

// Batched AI query helper - optimized for maximum speed
// OpenAI: 500 RPM (very generous) - bottleneck is API response time, not rate limit
// Gemini: 10-15 RPM - but calls are fast (~2-5s each)
// Strategy: Run all prompts in parallel with minimal delay - API response time is the bottleneck
const AUDIT_BATCH_SIZE = 13; // Run ALL prompts in parallel (10 research + 3 sentiment max)
const AUDIT_BATCH_DELAY_MS = 500; // Minimal delay since bottleneck is API response time, not rate limits

// Progress callback type for SSE streaming
export type ProgressCallback = (stage: string, progress?: number, total?: number) => void;
export type WarningCallback = (message: string, subtext?: string) => void;

async function runBatchedAIQueries<T>(
  items: T[],
  queryFn: (item: T) => Promise<any>,
  batchSize: number = AUDIT_BATCH_SIZE,
  onProgress?: (completed: number, total: number) => void
): Promise<any[]> {
  const results: any[] = [];
  const totalBatches = Math.ceil(items.length / batchSize);
  let completedCount = 0;
  
  for (let i = 0; i < items.length; i += batchSize) {
    const batchNum = Math.floor(i / batchSize) + 1;
    const batch = items.slice(i, i + batchSize);
    
    console.log(`[AUDIT] Processing batch ${batchNum}/${totalBatches} (${batch.length} items)`);
    
    // Run this batch in parallel
    const batchResults = await Promise.all(batch.map(queryFn));
    results.push(...batchResults);
    
    // Update progress after each batch
    completedCount += batch.length;
    if (onProgress) {
      onProgress(completedCount, items.length);
    }
    
    // Add delay before next batch (skip for last batch)
    if (i + batchSize < items.length) {
      console.log(`[AUDIT] Waiting ${AUDIT_BATCH_DELAY_MS}ms before next batch...`);
      await new Promise(resolve => setTimeout(resolve, AUDIT_BATCH_DELAY_MS));
    }
  }
  
  return results;
}

// Main audit function - OPTIMIZED for speed with parallel execution
// Uses AI-generated industry-specific prompts for accuracy
export async function runAudit(
  businessName: string,
  url: string,
  keyword: string,
  scope: "local" | "national",
  city?: string,
  onProgress?: ProgressCallback,
  onWarning?: WarningCallback
): Promise<{
  promptResults: Array<{
    prompt: string;
    summary: string;
    chatgpt: { found: boolean; response: string; competitors: string[] };
    googleAI: { found: boolean; response: string; competitors: string[] };
  }>;
  overallScore: number;
  chatgptScore: number;
  googleAIScore: number;
  executiveSummary: string;
  competitors: Array<{ name: string; mentions: number }>;
  sentimentAnalysis: {
    overall: "positive" | "negative" | "neutral";
    positiveCount: number;
    negativeCount: number;
    neutralCount: number;
    results: Array<{
      prompt: string;
      chatgpt: { response: string; sentiment: "positive" | "negative" | "neutral" };
      googleAI: { response: string; sentiment: "positive" | "negative" | "neutral" };
    }>;
  };
}> {
  const startTime = Date.now();
  
  // Start database keepalive to prevent connection timeout during long AI operations
  const keepalive = new DatabaseKeepaliveContext(10000);
  console.log("[AUDIT] Started audit with parallel execution optimization");
  
  try {
    // Stage 1: Generate AI-crafted prompts tailored to the specific industry, scope, and location
    console.log("[AUDIT] Generating industry-specific prompts...");
    onProgress?.("generating_prompts");
    const location = scope === "local" && city ? city : "nationwide";
    
    if (openAICircuitBreaker.isOpen()) {
      onWarning?.("Switching to backup AI provider for prompt generation", "Using Google AI while ChatGPT recovers...");
    }
    
    // Generate both prompt types in parallel for speed
    const [researchPrompts, sentimentPrompts] = await Promise.all([
      generateResearchPrompts(keyword, scope, city, url),
      generateSentimentPrompts(businessName, keyword, scope, city),
    ]);

    const totalPrompts = researchPrompts.length + sentimentPrompts.length;
    console.log(`[AUDIT] Generated ${researchPrompts.length} research prompts + ${sentimentPrompts.length} sentiment prompts`);

    // Format location for web search (use city if provided)
    const searchLocation = city || undefined;

    // Stage 2: Query AI platforms (ChatGPT and Gemini)
    onProgress?.("querying_ai", 0, totalPrompts);
    
    // Track combined progress from both parallel query streams
    let researchCompleted = 0;
    let sentimentCompleted = 0;
    const updateQueryProgress = () => {
      const completed = researchCompleted + sentimentCompleted;
      onProgress?.("querying_ai", completed, totalPrompts);
    };

    // Run research and sentiment prompts in PARALLEL for maximum speed
    // Both use batched execution internally to respect rate limits
    const [promptResults, sentimentResults] = await Promise.all([
      // Research prompts
      runBatchedAIQueries(
        researchPrompts,
        async (prompt) => {
          const [chatgpt, googleAI] = await Promise.all([
            queryChatGPT(prompt, businessName, url, searchLocation, undefined, { skipRateLimitDelay: true }),
            queryGemini(prompt, businessName, url),
          ]);
          const summary = generatePromptSummary(
            chatgpt.found,
            googleAI.found,
            chatgpt.competitors,
            googleAI.competitors,
            businessName
          );
          return { prompt, summary, chatgpt, googleAI };
        },
        AUDIT_BATCH_SIZE,
        (completed) => {
          researchCompleted = completed;
          updateQueryProgress();
        }
      ),
      // Sentiment prompts (run in parallel with research)
      runBatchedAIQueries(
        sentimentPrompts,
        async (prompt) => {
          const [chatgptResult, googleAIResult] = await Promise.all([
            queryChatGPT(prompt, businessName, url, searchLocation, undefined, { skipRateLimitDelay: true }),
            queryGemini(prompt, businessName, url),
          ]);
          return {
            prompt,
            chatgpt: {
              response: chatgptResult.response,
              sentiment: analyzeSentiment(chatgptResult.response, businessName),
            },
            googleAI: {
              response: googleAIResult.response,
              sentiment: analyzeSentiment(googleAIResult.response, businessName),
            },
          };
        },
        AUDIT_BATCH_SIZE,
        (completed) => {
          sentimentCompleted = completed;
          updateQueryProgress();
        }
      ),
    ]);

    // Stage 3: Analyze results
    onProgress?.("analyzing_results");
    
    // Calculate visibility scores
    const chatgptFound = promptResults.filter((r: any) => r.chatgpt.found).length;
    const googleAIFound = promptResults.filter((r: any) => r.googleAI.found).length;

    const chatgptScore = Math.round((chatgptFound / researchPrompts.length) * 100);
    const googleAIScore = Math.round((googleAIFound / researchPrompts.length) * 100);
    const overallScore = Math.round((chatgptScore + googleAIScore) / 2);

    // Calculate sentiment summary
    let positiveCount = 0;
    let negativeCount = 0;
    let neutralCount = 0;
    
    for (const result of sentimentResults) {
      for (const sentiment of [result.chatgpt.sentiment, result.googleAI.sentiment]) {
        if (sentiment === "positive") positiveCount++;
        else if (sentiment === "negative") negativeCount++;
        else neutralCount++;
      }
    }
    
    const overallSentiment: "positive" | "negative" | "neutral" = 
      positiveCount > negativeCount + neutralCount ? "positive" :
      negativeCount > positiveCount ? "negative" : "neutral";

    // Aggregate competitors
    const competitorMap = new Map<string, number>();
    for (const result of promptResults) {
      for (const competitor of [...result.chatgpt.competitors, ...result.googleAI.competitors]) {
        competitorMap.set(competitor, (competitorMap.get(competitor) || 0) + 1);
      }
    }

    const competitors = Array.from(competitorMap.entries())
      .map(([name, mentions]) => ({ name, mentions }))
      .sort((a, b) => b.mentions - a.mentions)
      .slice(0, 5);

    // Stage 4: Generate AI-crafted executive summary with personalized insights
    onProgress?.("generating_summary");
    if (openAICircuitBreaker.isOpen()) {
      onWarning?.("Switching to backup AI provider for summary", "Using Google AI for your executive summary...");
    }
    console.log("[AUDIT] Generating executive summary...");
    const executiveSummary = await generateExecutiveSummary(
      businessName,
      keyword,
      overallScore,
      chatgptScore,
      googleAIScore,
      overallSentiment,
      location
    );

    const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[AUDIT] Audit completed in ${elapsedTime}s`);
    
    // Stage 5: Complete
    onProgress?.("complete");
    
    return {
      promptResults,
      overallScore,
      chatgptScore,
      googleAIScore,
      executiveSummary,
      competitors,
      sentimentAnalysis: {
        overall: overallSentiment,
        positiveCount,
        negativeCount,
        neutralCount,
        results: sentimentResults,
      },
    };
  } finally {
    keepalive.stop();
  }
}

// ============================================
// MONITORING SERVICE FUNCTIONS
// ============================================

// Return type includes high-level category plus specific service groups
export interface ServiceGroupsResult {
  highLevelCategory: { name: string; description: string };
  groups: { name: string; description: string }[];
}

const GENERIC_TERMS = [
  "core services", "specialty services", "primary services", "main services",
  "other services", "additional services", "general services", "basic services",
  "standard services", "premium services", "custom solutions", "custom services",
  "training & education", "planning & strategy", "consulting", "maintenance & support",
  "maintenance and support", "training and education", "planning and strategy"
];

function isGenericGroupName(name: string): boolean {
  const normalized = name.toLowerCase().trim();
  return GENERIC_TERMS.some(term => normalized === term || normalized.includes(term));
}

function validateServiceGroups(groups: { name: string; description: string }[]): boolean {
  if (!groups || groups.length < 5) return false;
  const genericCount = groups.filter(g => isGenericGroupName(g.name)).length;
  return genericCount <= 2;
}

export async function generateServiceGroups(
  businessName: string,
  industry: string,
  scope: string,
  city?: string
): Promise<ServiceGroupsResult> {
  const locationContext = scope === "local" && city ? ` in ${city}` : "";
  
  const systemPrompt = `You are an expert marketing strategist specializing in service/product categorization for AI visibility tracking. Your task is to:
1. Identify ONE high-level category (umbrella term) that best describes the PRIMARY business type
2. Generate exactly 10 distinct service/product groups that represent specific offerings

# CRITICAL: SINGLE-FOCUS CATEGORIES ONLY
- The high-level category must be ONE SPECIFIC service type - NEVER combine multiple services
- If the business lists multiple services (e.g., "plumbing, heating, and cooling"), pick the FIRST or PRIMARY one
- DO NOT use combined terms like "HVAC & Plumbing" or "Heating and Cooling" - pick just ONE
- Examples of CORRECT single-focus categories: "Plumber", "HVAC Contractor", "AC Repair Company", "Electrician"
- Examples of WRONG combined categories: "HVAC & Plumbing", "Heating and Cooling", "Plumbing and Electrical"

# High-Level Category Guidelines
- This is the broadest, most common search term for this type of business
- 1-3 words maximum, focusing on ONE service type
- What someone would search if they just needed "any" provider of this type
- Examples: "HVAC Contractor", "Plumber", "Marketing Agency", "Personal Injury Lawyer", "Handyman", "Electrician", "Dentist"

# Service Group Guidelines
- Generate granular, search-intent-focused groups (how real customers would search)
- Each group should represent ONE distinct, searchable service - NOT combined services
- Include variations customers actually use (e.g., "Heater Repair" not just "HVAC Repair")
- Each group name should be a SINGLE specific service, not multiple services combined
- Names should be 1-4 words, matching natural search language

# CRITICAL: DO NOT USE THESE GENERIC TERMS
The following are FORBIDDEN as group names - NEVER use them:
- "Core Services", "Primary Services", "Main Services", "General Services"
- "Specialty Services", "Premium Services", "Standard Services", "Basic Services"  
- "Other Services", "Additional Services", "Custom Solutions"
- "Consulting", "Maintenance & Support", "Training & Education", "Planning & Strategy"

Instead, use SPECIFIC, SEARCHABLE service names like:
- "Drain Cleaning" NOT "Core Plumbing Services"
- "AC Repair" NOT "Primary HVAC Services"
- "Roof Leak Repair" NOT "Specialty Roofing"
- "Kitchen Remodeling" NOT "Custom Solutions"

# Output Format
Return a JSON object with:
- "highLevelCategory": object with "name" and "description" fields (SINGLE service type only)
- "groups": array of exactly 10 objects, each with "name" and "description" fields (each focused on ONE service)

# Examples

For a "plumbing, heating, and cooling" business (pick PRIMARY service - plumbing):
{
  "highLevelCategory": {"name": "Plumber", "description": "Professional plumbing services"},
  "groups": [
    {"name": "Drain Cleaning", "description": "Clogged drain and sewer line cleaning"},
    {"name": "Water Heater Repair", "description": "Water heater troubleshooting and repairs"},
    {"name": "Water Heater Installation", "description": "New water heater installations"},
    {"name": "Plumbing Leak Repair", "description": "Pipe leak detection and repair services"},
    {"name": "Toilet Repair", "description": "Toilet installation and repair services"},
    {"name": "Faucet Repair", "description": "Faucet installation and repair"},
    {"name": "Sewer Line Repair", "description": "Sewer line inspection and repair"},
    {"name": "Garbage Disposal Repair", "description": "Garbage disposal installation and repair"},
    {"name": "Sump Pump Installation", "description": "Sump pump installation and repair"},
    {"name": "Emergency Plumber", "description": "24/7 emergency plumbing services"}
  ]
}

For a local HVAC company:
{
  "highLevelCategory": {"name": "HVAC Contractor", "description": "Heating, ventilation, and air conditioning services"},
  "groups": [
    {"name": "AC Repair", "description": "Air conditioning system repairs and troubleshooting"},
    {"name": "AC Installation", "description": "New air conditioning system installations"},
    {"name": "Heater Repair", "description": "Furnace and heating system repairs"},
    {"name": "Furnace Installation", "description": "New furnace and heating system installations"},
    {"name": "HVAC Maintenance", "description": "Preventive maintenance and tune-ups for heating and cooling systems"},
    {"name": "Duct Cleaning", "description": "Air duct cleaning and indoor air quality services"},
    {"name": "Thermostat Installation", "description": "Smart thermostat and temperature control installations"},
    {"name": "Water Heater Repair", "description": "Water heater troubleshooting and repairs"},
    {"name": "Water Heater Installation", "description": "New water heater installations and replacements"},
    {"name": "Emergency HVAC Service", "description": "24/7 emergency heating and cooling repairs"}
  ]
}

For a marketing agency:
{
  "highLevelCategory": {"name": "Marketing Agency", "description": "Full-service marketing and advertising agency"},
  "groups": [
    {"name": "SEO Services", "description": "Search engine optimization and organic visibility"},
    {"name": "PPC Management", "description": "Pay-per-click advertising and Google Ads management"},
    {"name": "Web Design", "description": "Website design and development"},
    {"name": "Social Media Marketing", "description": "Social media management and advertising"},
    {"name": "Content Marketing", "description": "Blog writing, content strategy, and copywriting"},
    {"name": "Branding", "description": "Brand identity, logo design, and brand strategy"},
    {"name": "Email Marketing", "description": "Email campaigns, automation, and newsletter management"},
    {"name": "Graphic Design", "description": "Visual design for print and digital materials"},
    {"name": "Video Production", "description": "Video marketing and production services"},
    {"name": "Marketing Strategy", "description": "Marketing consulting and strategic planning"}
  ]
}

For a personal injury law firm:
{
  "highLevelCategory": {"name": "Personal Injury Lawyer", "description": "Legal representation for accident and injury victims"},
  "groups": [
    {"name": "Car Accident Lawyer", "description": "Legal representation for auto accident victims"},
    {"name": "Truck Accident Attorney", "description": "Commercial truck and 18-wheeler accident cases"},
    {"name": "Motorcycle Accident Lawyer", "description": "Legal help for motorcycle crash injuries"},
    {"name": "Slip and Fall Attorney", "description": "Premises liability and slip and fall cases"},
    {"name": "Wrongful Death Lawyer", "description": "Legal claims for families who lost loved ones"},
    {"name": "Medical Malpractice Attorney", "description": "Cases against negligent healthcare providers"},
    {"name": "Work Injury Lawyer", "description": "Workplace accident and workers compensation cases"},
    {"name": "Dog Bite Attorney", "description": "Animal attack injury claims"},
    {"name": "Pedestrian Accident Lawyer", "description": "Legal help for injured pedestrians"},
    {"name": "Product Liability Attorney", "description": "Cases involving defective products"}
  ]
}`;

  const userPrompt = `Generate the high-level category and exactly 10 service/product groups for "${businessName}", a ${industry} business${locationContext}.

CRITICAL REQUIREMENTS:
1. The high-level category must be ONE SINGLE service type (e.g., "Plumber" or "HVAC Contractor") - NEVER combine services like "HVAC & Plumbing"
2. If multiple services are listed in the industry, pick the FIRST/PRIMARY one only
3. Each group name must be a SPECIFIC, SEARCHABLE service that real customers would type into an AI assistant
4. Do NOT use generic terms like "Core Services" or "Specialty Services" - use actual service names like "Drain Cleaning", "AC Repair", "Roof Leak Repair", etc.`;

  async function attemptGeneration(isRetry: boolean = false): Promise<ServiceGroupsResult> {
    // Add rate limit delay before API call
    await rateLimitDelay();
    
    const response = await retryWithBackoff(() =>
      openai.chat.completions.create({
        model: "gpt-5-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { 
            role: "user", 
            content: isRetry 
              ? userPrompt + "\n\nYour previous response contained generic terms. Please provide SPECIFIC service names only."
              : userPrompt
          }
        ],
        response_format: { type: "json_object" }
      })
    );

    const content = response.choices[0]?.message?.content || "{}";
    const parsed = JSON.parse(content);
    
    const highLevelCategory = parsed.highLevelCategory || {
      name: industry,
      description: `${industry} services and products`
    };
    
    const groups = Array.isArray(parsed.groups) ? parsed.groups : (parsed.categories || []);
    
    return { highLevelCategory, groups };
  }

  try {
    let result = await attemptGeneration(false);
    
    if (!validateServiceGroups(result.groups)) {
      console.log("Service groups validation failed, retrying with stricter prompt...");
      result = await attemptGeneration(true);
      
      if (!validateServiceGroups(result.groups)) {
        console.log("Retry also produced generic results, filtering and using partial results...");
        result.groups = result.groups.filter(g => !isGenericGroupName(g.name));
        
        if (result.groups.length < 5) {
          console.log("Not enough valid groups, falling back to defaults");
          return {
            highLevelCategory: result.highLevelCategory,
            groups: getDefaultGroups(industry)
          };
        }
      }
    }
    
    if (result.groups.length === 0) {
      return {
        highLevelCategory: result.highLevelCategory,
        groups: getDefaultGroups(industry)
      };
    }
    
    return result;
  } catch (error) {
    console.error("Error generating service groups:", error);
    return {
      highLevelCategory: {
        name: industry,
        description: `${industry} services and products`
      },
      groups: getDefaultGroups(industry)
    };
  }
}

function getDefaultGroups(industry: string): { name: string; description: string }[] {
  return [
    { name: "Core Services", description: `Primary ${industry} services offered` },
    { name: "Specialty Services", description: `Specialized ${industry} solutions` },
    { name: "Maintenance & Support", description: `Ongoing support and maintenance services` },
    { name: "Consulting", description: `${industry} consulting and advisory services` },
    { name: "Emergency Services", description: `Urgent and emergency ${industry} assistance` },
    { name: "Installation", description: `New ${industry} installations and setup` },
    { name: "Repair Services", description: `${industry} repair and troubleshooting` },
    { name: "Custom Solutions", description: `Custom and tailored ${industry} solutions` },
    { name: "Training & Education", description: `${industry} training and workshops` },
    { name: "Planning & Strategy", description: `${industry} planning and strategic services` }
  ];
}

// Multi-category service group result - includes multiple high-level categories
export interface MultiCategoryServiceGroupsResult {
  highLevelCategories: { name: string; description: string }[];
  groups: { name: string; description: string }[];
}

/**
 * Generate service groups for a business with multiple primary service categories.
 * This function intelligently merges and deduplicates service groups across categories.
 * 
 * For a business offering both Plumbing and HVAC services:
 * - Returns 2 high-level categories: "Plumber" and "HVAC Contractor"
 * - Returns 12-15 deduplicated service groups covering both (not 20)
 * - Shared services (like "Water Heater Repair") appear only once
 */
export async function generateServiceGroupsMultiCategory(
  businessName: string,
  primaryCategories: string[],
  scope: string,
  city?: string
): Promise<MultiCategoryServiceGroupsResult> {
  const locationContext = scope === "local" && city ? ` in ${city}` : "";
  
  // If only one category, delegate to the single-category function
  if (primaryCategories.length === 1) {
    const result = await generateServiceGroups(businessName, primaryCategories[0], scope, city);
    return {
      highLevelCategories: [result.highLevelCategory],
      groups: result.groups
    };
  }
  
  const categoriesList = primaryCategories.join(", ");
  
  const systemPrompt = `You are an expert marketing strategist specializing in multi-service business categorization for AI visibility tracking.

# YOUR TASK
A business offers MULTIPLE primary service types. You must:
1. Identify the high-level category (umbrella term) for EACH primary service type provided
2. Generate 12-15 deduplicated service groups that intelligently cover ALL categories
3. Identify and merge overlapping services that apply to multiple categories

# HIGH-LEVEL CATEGORY GUIDELINES
- Create ONE high-level category per primary service type provided
- Each should be 1-3 words, the broadest search term for that service type
- Examples: "Plumber", "HVAC Contractor", "Electrician", "Marketing Agency"

# SERVICE GROUP GUIDELINES - CRITICAL
- Generate 12-15 TOTAL service groups (NOT 10 per category - we're merging!)
- Identify overlapping services (e.g., "Water Heater Repair" applies to both Plumbing and HVAC)
- Include only ONE entry for shared services - DO NOT DUPLICATE
- Distribute groups fairly across categories (e.g., 5-6 plumbing-specific, 5-6 HVAC-specific, 2-3 shared)
- Each group name should be 1-4 words, matching natural search language
- NEVER use generic terms like "Core Services", "Specialty Services", etc.

# EXAMPLES OF OVERLAPPING SERVICES TO MERGE
For Plumbing + HVAC businesses:
- "Water Heater Repair" - appears ONCE (applies to both)
- "Water Heater Installation" - appears ONCE (applies to both)
- "Emergency Services" / "24/7 Emergency" - appears ONCE (applies to both)

For Plumbing + Electrical businesses:
- "New Construction" - appears ONCE (applies to both)
- "Remodeling Services" - appears ONCE (applies to both)

# OUTPUT FORMAT
Return a JSON object with:
- "highLevelCategories": array of objects with "name" and "description" fields (one per primary category)
- "groups": array of 12-15 objects with "name" and "description" fields (deduplicated across categories)

# EXAMPLE OUTPUT for "Plumbing" + "HVAC" business:
{
  "highLevelCategories": [
    {"name": "Plumber", "description": "Professional plumbing services"},
    {"name": "HVAC Contractor", "description": "Heating, ventilation, and air conditioning services"}
  ],
  "groups": [
    {"name": "Drain Cleaning", "description": "Clogged drain and sewer line cleaning"},
    {"name": "Plumbing Leak Repair", "description": "Pipe leak detection and repair"},
    {"name": "Toilet Repair", "description": "Toilet installation and repair"},
    {"name": "Faucet Repair", "description": "Faucet installation and repair"},
    {"name": "Sewer Line Repair", "description": "Sewer line inspection and repair"},
    {"name": "AC Repair", "description": "Air conditioning repairs and troubleshooting"},
    {"name": "AC Installation", "description": "New AC system installations"},
    {"name": "Heater Repair", "description": "Furnace and heating system repairs"},
    {"name": "Furnace Installation", "description": "New furnace and heating installations"},
    {"name": "HVAC Maintenance", "description": "Preventive heating and cooling maintenance"},
    {"name": "Duct Cleaning", "description": "Air duct cleaning and air quality services"},
    {"name": "Water Heater Repair", "description": "Water heater troubleshooting and repairs (plumbing and HVAC)"},
    {"name": "Water Heater Installation", "description": "New water heater installations"},
    {"name": "Emergency Plumber", "description": "24/7 emergency plumbing and HVAC services"}
  ]
}`;

  const userPrompt = `Generate high-level categories and 12-15 deduplicated service groups for "${businessName}"${locationContext}.

Primary service categories: ${categoriesList}

CRITICAL REQUIREMENTS:
1. Create ONE high-level category per primary service type (${primaryCategories.length} total)
2. Generate 12-15 TOTAL service groups covering ALL categories (not 10 per category!)
3. Identify overlapping services and include them ONLY ONCE
4. Each group name must be specific and searchable (e.g., "Drain Cleaning", "AC Repair")
5. Do NOT use generic terms like "Core Services" or "Specialty Services"`;

  try {
    // Add rate limit delay before API call
    await rateLimitDelay();
    
    const response = await retryWithBackoff(() =>
      openai.chat.completions.create({
        model: "gpt-5-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        response_format: { type: "json_object" }
      })
    );

    const content = response.choices[0]?.message?.content || "{}";
    const parsed = JSON.parse(content);
    
    // Extract high-level categories
    const highLevelCategories = Array.isArray(parsed.highLevelCategories) 
      ? parsed.highLevelCategories 
      : primaryCategories.map(cat => ({ name: cat, description: `${cat} services` }));
    
    // Extract and validate groups
    let groups = Array.isArray(parsed.groups) ? parsed.groups : [];
    
    // Filter out generic group names
    groups = groups.filter((g: { name: string }) => !isGenericGroupName(g.name));
    
    // If not enough valid groups, fall back to generating for each category separately
    if (groups.length < 8) {
      console.log("Multi-category generation produced insufficient groups, falling back to category-by-category generation...");
      return await generateServiceGroupsFallback(businessName, primaryCategories, scope, city);
    }
    
    console.log(`Generated ${groups.length} deduplicated service groups for ${primaryCategories.length} categories`);
    return { highLevelCategories, groups };
    
  } catch (error) {
    console.error("Error generating multi-category service groups:", error);
    return await generateServiceGroupsFallback(businessName, primaryCategories, scope, city);
  }
}

/**
 * Fallback: Generate service groups for each category separately and merge with deduplication
 */
async function generateServiceGroupsFallback(
  businessName: string,
  primaryCategories: string[],
  scope: string,
  city?: string
): Promise<MultiCategoryServiceGroupsResult> {
  const highLevelCategories: { name: string; description: string }[] = [];
  const allGroups: { name: string; description: string; normalized: string }[] = [];
  
  // Generate groups for each category
  for (const category of primaryCategories) {
    try {
      const result = await generateServiceGroups(businessName, category, scope, city);
      highLevelCategories.push(result.highLevelCategory);
      
      // Add groups with normalized names for deduplication
      for (const group of result.groups) {
        const normalized = normalizeGroupName(group.name);
        allGroups.push({ ...group, normalized });
      }
    } catch (error) {
      console.error(`Failed to generate groups for category ${category}:`, error);
      highLevelCategories.push({ name: category, description: `${category} services` });
    }
  }
  
  // Deduplicate groups by normalized name
  const seenNames = new Set<string>();
  const uniqueGroups: { name: string; description: string }[] = [];
  
  for (const group of allGroups) {
    if (!seenNames.has(group.normalized)) {
      seenNames.add(group.normalized);
      uniqueGroups.push({ name: group.name, description: group.description });
    }
  }
  
  // Limit to 15 groups maximum
  const finalGroups = uniqueGroups.slice(0, 15);
  
  console.log(`Fallback: Generated ${finalGroups.length} deduplicated groups from ${primaryCategories.length} categories`);
  return { highLevelCategories, groups: finalGroups };
}

/**
 * Normalize a group name for deduplication comparison
 * e.g., "Water Heater Repair" and "water heater repairs" would match
 */
function normalizeGroupName(name: string): string {
  return name
    .toLowerCase()
    .replace(/s$/i, '') // Remove trailing 's' for singular/plural matching
    .replace(/\s+/g, ' ')
    .trim();
}

// Generate prompts for each group using PARALLEL execution with bounded concurrency
// Reduced concurrency to 2 with jitter delays between batches (following OpenAI rate limit guidance)
const PROMPT_GENERATION_CONCURRENCY = 2;
const MIN_BATCH_DELAY_MS = 2000; // Minimum 2 second delay between batches
const MAX_BATCH_DELAY_MS = 3500; // Maximum 3.5 second delay between batches

// Helper to add delay with jitter between operations
const delayWithJitter = (minMs: number, maxMs: number) => {
  const jitteredDelay = minMs + Math.floor(Math.random() * (maxMs - minMs));
  return new Promise(resolve => setTimeout(resolve, jitteredDelay));
};

export async function generatePromptsForGroups(
  businessName: string,
  domain: string,
  industry: string,
  scope: string,
  city: string | undefined,
  groups: { name: string; description: string }[],
  maxPromptsPerGroup?: number
): Promise<{ groupName: string; prompts: string[] }[]> {
  const promptLimit = maxPromptsPerGroup || PROMPTS_PER_GROUP;
  console.log(`[RATE_LIMIT_SAFE] Generating prompts for ${groups.length} groups (max ${promptLimit} per group) with concurrency ${PROMPT_GENERATION_CONCURRENCY}, ${MIN_BATCH_DELAY_MS}-${MAX_BATCH_DELAY_MS}ms jittered delay between batches...`);
  
  const generateForGroup = async (group: { name: string; description: string }, index: number): Promise<{ groupName: string; prompts: string[] }> => {
    try {
      // Add small staggered delay based on index within batch to spread requests
      if (index > 0) {
        const staggerDelay = 500 + Math.floor(Math.random() * 500); // 500-1000ms stagger
        await new Promise(resolve => setTimeout(resolve, staggerDelay));
      }
      
      console.log(`Generating prompts for group: ${group.name}`);
      
      let prompts = await generateResearchPrompts(
        industry,
        scope as "local" | "national",
        city,
        undefined,
        group.name
      );
      
      if (prompts.length > promptLimit) {
        prompts = prompts.slice(0, promptLimit);
      }
      
      console.log(`Completed prompts for group: ${group.name} (${prompts.length} prompts)`);
      return { groupName: group.name, prompts };
    } catch (error) {
      console.error(`Error generating prompts for group ${group.name}:`, error);
      return { groupName: group.name, prompts: [] };
    }
  };

  const results: { groupName: string; prompts: string[] }[] = [];
  const totalBatches = Math.ceil(groups.length / PROMPT_GENERATION_CONCURRENCY);
  
  for (let i = 0; i < groups.length; i += PROMPT_GENERATION_CONCURRENCY) {
    const batchNum = Math.floor(i / PROMPT_GENERATION_CONCURRENCY) + 1;
    const batch = groups.slice(i, i + PROMPT_GENERATION_CONCURRENCY);
    console.log(`Processing batch ${batchNum}/${totalBatches}: ${batch.map(g => g.name).join(', ')}`);
    
    // Pass index within batch for staggering
    const batchResults = await Promise.all(batch.map((group, idx) => generateForGroup(group, idx)));
    results.push(...batchResults);
    
    // Add jittered delay between batches to avoid rate limiting (skip delay after last batch)
    if (i + PROMPT_GENERATION_CONCURRENCY < groups.length) {
      const actualDelay = MIN_BATCH_DELAY_MS + Math.floor(Math.random() * (MAX_BATCH_DELAY_MS - MIN_BATCH_DELAY_MS));
      console.log(`[RATE_LIMIT_SAFE] Waiting ${actualDelay}ms before next batch (jittered)...`);
      await delayWithJitter(MIN_BATCH_DELAY_MS, MAX_BATCH_DELAY_MS);
    }
  }
  
  console.log(`Generated prompts for all ${results.length} groups`);
  return results;
}

// Re-export ExtractedCitation type for use by routes
export type { ExtractedCitation } from "./services/citation-extractor";

export interface PromptCheckResult {
  chatgpt: {
    found: boolean;
    response: string;
    cited: boolean;
    citations: ExtractedCitation[];
  };
  googleAI: {
    found: boolean;
    response: string;
    cited: boolean;
    citations: ExtractedCitation[];
    groundingMetadata?: GeminiGroundingMetadata | null;
  };
  competitors: string[];
}

// Helper function to query OpenAI/ChatGPT for monitoring (with location for web search grounding)
async function queryOpenAI(prompt: string, businessName: string, domain: string, location?: string, brandAliases?: string[]): Promise<{ found: boolean; response: string; cited: boolean; competitors: string[]; citations: ExtractedCitation[] }> {
  try {
    console.log(`[queryOpenAI] Calling ChatGPT with location: "${location || 'none'}", aliases: ${brandAliases?.length || 0}`);
    const result = await queryChatGPT(prompt, businessName, domain, location, brandAliases);
    console.log(`[queryOpenAI] Result - found: ${result.found}, response length: ${result.response.length}, citations: ${result.citations.length}`);
    return {
      found: result.found,
      response: result.response,
      cited: result.response.toLowerCase().includes(domain.toLowerCase()),
      competitors: result.competitors,
      citations: result.citations,
    };
  } catch (error) {
    console.error("queryOpenAI error (full):", error);
    return { found: false, response: "Error querying ChatGPT", cited: false, competitors: [], citations: [] };
  }
}

// Helper function to query Google AI/Gemini for monitoring
async function queryGoogleAI(prompt: string, businessName: string, domain: string, brandAliases?: string[]): Promise<{ found: boolean; response: string; cited: boolean; competitors: string[]; citations: ExtractedCitation[]; groundingMetadata: GeminiGroundingMetadata | null }> {
  try {
    console.log(`[queryGoogleAI] Calling Gemini...`);
    const result = await queryGemini(prompt, businessName, domain, brandAliases);
    console.log(`[queryGoogleAI] Result - found: ${result.found}, response length: ${result.response.length}, citations: ${result.citations.length}, has grounding: ${!!result.groundingMetadata}`);
    return {
      found: result.found,
      response: result.response,
      cited: result.response.toLowerCase().includes(domain.toLowerCase()),
      competitors: result.competitors,
      citations: result.citations,
      groundingMetadata: result.groundingMetadata,
    };
  } catch (error) {
    console.error("queryGoogleAI error (full):", error);
    return { found: false, response: "Error querying Google AI", cited: false, competitors: [], citations: [], groundingMetadata: null };
  }
}

// Run visibility check for a single prompt across ChatGPT and Google AI
// Location parameter enables web search grounding for better local results
// brandAliases: alternative names for the business (e.g., "SmartFix", "The Smart Fix")
export async function runPromptCheck(
  prompt: string,
  businessName: string,
  domain: string,
  location?: string,
  brandAliases?: string[]
): Promise<PromptCheckResult> {
  try {
    console.log(`[runPromptCheck] Checking visibility for "${businessName}" with location: "${location || 'none'}", aliases: ${brandAliases?.length || 0}`);
    // Run both checks in parallel
    const [chatgptResult, googleAIResult] = await Promise.all([
      queryOpenAI(prompt, businessName, domain, location, brandAliases),
      queryGoogleAI(prompt, businessName, domain, brandAliases)
    ]);
    
    // Collect competitors from both results
    const allCompetitors = [...chatgptResult.competitors, ...googleAIResult.competitors];
    const uniqueCompetitors = Array.from(new Set(allCompetitors)).filter(c => 
      c.toLowerCase() !== businessName.toLowerCase()
    );
    
    return {
      chatgpt: {
        found: chatgptResult.found,
        response: chatgptResult.response,
        cited: chatgptResult.cited,
        citations: chatgptResult.citations,
      },
      googleAI: {
        found: googleAIResult.found,
        response: googleAIResult.response,
        cited: googleAIResult.cited,
        citations: googleAIResult.citations,
        groundingMetadata: googleAIResult.groundingMetadata,
      },
      competitors: uniqueCompetitors.slice(0, 10),
    };
  } catch (error) {
    console.error("Error running prompt check:", error);
    return {
      chatgpt: { found: false, response: "Error occurred during check", cited: false, citations: [] },
      googleAI: { found: false, response: "Error occurred during check", cited: false, citations: [], groundingMetadata: null },
      competitors: [],
    };
  }
}

// Synthesize clean sentiment narratives from raw AI response snippets
// Returns structured narratives like SEMRush: "Brand Strength Factors" and "Areas for Improvement"
export interface SynthesizedNarrative {
  text: string;
  strength: number; // 1-5 scale
  prompt?: string; // The specific prompt that triggered this insight
  platform?: 'chatgpt' | 'google';
}

export interface SynthesizedNarratives {
  strengths: SynthesizedNarrative[];
  improvements: SynthesizedNarrative[];
}

// Input type for sentiment statements with prompt context
export interface SentimentStatementInput {
  text: string;
  promptText?: string;
  platform?: 'chatgpt' | 'google';
}

export async function synthesizeSentimentNarratives(
  rawStatements: { positive: SentimentStatementInput[]; negative: SentimentStatementInput[] },
  businessName: string
): Promise<SynthesizedNarratives> {
  const result: SynthesizedNarratives = { strengths: [], improvements: [] };
  
  // Skip if no statements to analyze
  if (rawStatements.positive.length === 0 && rawStatements.negative.length === 0) {
    return result;
  }
  
  try {
    // Format statements with their prompts for context
    const formatStatements = (statements: SentimentStatementInput[]) => 
      statements.slice(0, 10).map((s, i) => {
        const promptRef = s.promptText ? `[Prompt: "${s.promptText.substring(0, 100)}${s.promptText.length > 100 ? '...' : ''}"]` : '';
        const platformRef = s.platform ? `[${s.platform === 'chatgpt' ? 'ChatGPT' : 'Google AI'}]` : '';
        return `${i + 1}. ${platformRef} ${promptRef}\n   Response snippet: "${s.text}"`;
      }).join('\n\n');

    const prompt = `Analyze these AI-generated statements about "${businessName}" and create SPECIFIC, ACTIONABLE insights.

POSITIVE STATEMENTS (AI responses that mentioned the brand positively):
${formatStatements(rawStatements.positive)}

NEGATIVE/NEUTRAL STATEMENTS (AI responses with concerns or missed opportunities):
${formatStatements(rawStatements.negative)}

CRITICAL INSTRUCTIONS:
1. Create SPECIFIC insights that reference the actual prompt and what the AI said
2. Each insight MUST include:
   - What specific prompt triggered this finding
   - What the AI specifically said or didn't say
   - A clear, actionable takeaway
3. Format: Start with the prompt context, then the insight
4. Examples of GOOD insights:
   - "When asked 'best plumber in Austin for emergencies', ChatGPT highlighted your 24/7 availability as a key differentiator"
   - "For 'water heater installation near me', Google AI mentioned competitors' same-day service but didn't mention your scheduling options"
5. Examples of BAD insights (too vague):
   - "The brand has good reviews" (no prompt reference)
   - "Customers appreciate quality service" (generic)
6. Rate importance 1-5 (5 = most actionable)
7. Return EXACTLY 3 strengths and 3 improvements (or fewer if not enough data)

Return ONLY valid JSON:
{
  "strengths": [
    {"text": "When asked '[prompt]', [platform] said [specific thing]...", "strength": 4, "prompt": "the exact prompt text", "platform": "chatgpt"},
    {"text": "...", "strength": 3, "prompt": "...", "platform": "google"}
  ],
  "improvements": [
    {"text": "For '[prompt]', [platform] recommended [competitor] because [reason]. Consider...", "strength": 4, "prompt": "the exact prompt text", "platform": "chatgpt"},
    {"text": "...", "strength": 3, "prompt": "...", "platform": "google"}
  ]
}`;

    // Add rate limit delay before API call
    await rateLimitDelay();
    
    const response = await retryWithBackoff(() =>
      openai.chat.completions.create({
        model: "gpt-5-mini",
        messages: [
          {
            role: "system",
            content: "You are a brand visibility analyst. Create SPECIFIC, ACTIONABLE insights from AI response data. Each insight MUST reference the exact prompt that triggered it. Never write generic statements. Always respond with valid JSON only."
          },
          { role: "user", content: prompt }
        ],
        temperature: 0.3,
        max_completion_tokens: 2000,
      })
    );
    
    const content = response.choices[0]?.message?.content?.trim() || "";
    
    // Extract JSON from response (handle potential markdown code blocks)
    let jsonStr = content;
    if (content.includes("```json")) {
      jsonStr = content.replace(/```json\s*/g, "").replace(/```\s*/g, "");
    } else if (content.includes("```")) {
      jsonStr = content.replace(/```\s*/g, "");
    }
    
    const parsed = JSON.parse(jsonStr);
    
    if (Array.isArray(parsed.strengths)) {
      result.strengths = parsed.strengths
        .filter((s: any) => s.text && typeof s.strength === 'number')
        .slice(0, 3) // Max 3 strengths
        .map((s: any) => ({
          text: String(s.text).trim(),
          strength: Math.max(1, Math.min(5, Math.round(s.strength))),
          prompt: s.prompt ? String(s.prompt).trim() : undefined,
          platform: s.platform === 'google' ? 'google' : s.platform === 'chatgpt' ? 'chatgpt' : undefined
        }));
    }
    
    if (Array.isArray(parsed.improvements)) {
      result.improvements = parsed.improvements
        .filter((s: any) => s.text && typeof s.strength === 'number')
        .slice(0, 3) // Max 3 improvements
        .map((s: any) => ({
          text: String(s.text).trim(),
          strength: Math.max(1, Math.min(5, Math.round(s.strength))),
          prompt: s.prompt ? String(s.prompt).trim() : undefined,
          platform: s.platform === 'google' ? 'google' : s.platform === 'chatgpt' ? 'chatgpt' : undefined
        }));
    }
    
  } catch (error: any) {
    console.error("[synthesizeSentimentNarratives] Error:", error?.message || error);
    // Return empty result on error - the UI will handle gracefully
  }
  
  return result;
}
