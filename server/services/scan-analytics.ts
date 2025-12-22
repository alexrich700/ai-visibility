/**
 * Scan Analytics Service
 * 
 * Pure helper functions for analyzing AI visibility scan results.
 * Extracts citations, computes share of voice, detects mention rank,
 * classifies sentiment, and builds snippets.
 */

// ============================================
// TYPES
// ============================================

export interface Citation {
  url: string;
  domain: string;
}

export interface CompetitorMention {
  name: string;
  mentionCount: number;
  percentage: number;
}

export interface SentimentBreakdown {
  positive: number;
  neutral: number;
  negative: number;
}

export interface AnalyticsResult {
  sentiment: 'positive' | 'neutral' | 'negative' | null;
  rank: number | null;
  citations: Citation[];
  snippet: string | null;
}

// ============================================
// CITATION EXTRACTION
// ============================================

/**
 * Extracts URLs from response text and normalizes to domain
 */
export function extractCitations(responseText: string | null | undefined): Citation[] {
  if (!responseText) return [];
  
  const urlRegex = /https?:\/\/[^\s\)\]\}>"']+/gi;
  const urls = responseText.match(urlRegex) || [];
  
  const citations: Citation[] = [];
  const seenDomains = new Set<string>();
  
  for (const url of urls) {
    try {
      const cleanUrl = url.replace(/[.,;!?]+$/, '');
      const urlObj = new URL(cleanUrl);
      const domain = urlObj.hostname.replace(/^www\./, '');
      
      if (!seenDomains.has(domain)) {
        seenDomains.add(domain);
        citations.push({ url: cleanUrl, domain });
      }
    } catch {
      continue;
    }
  }
  
  return citations;
}

/**
 * Aggregates citations across multiple results
 */
export function aggregateCitations(allCitations: Citation[][]): { domain: string; count: number }[] {
  const domainCounts = new Map<string, number>();
  
  for (const citations of allCitations) {
    for (const citation of citations) {
      const current = domainCounts.get(citation.domain) || 0;
      domainCounts.set(citation.domain, current + 1);
    }
  }
  
  return Array.from(domainCounts.entries())
    .map(([domain, count]) => ({ domain, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
}

// ============================================
// SHARE OF VOICE
// ============================================

/**
 * Computes share of voice from competitor mentions
 * Returns array sorted by mention count
 */
export function computeShareOfVoice(
  clientName: string,
  clientMentionCount: number,
  competitorCounts: Map<string, number>,
  totalPrompts: number
): CompetitorMention[] {
  const allMentions: CompetitorMention[] = [];
  
  allMentions.push({
    name: clientName,
    mentionCount: clientMentionCount,
    percentage: totalPrompts > 0 ? Math.round((clientMentionCount / totalPrompts) * 100) : 0
  });
  
  const entries = Array.from(competitorCounts.entries());
  for (const [name, count] of entries) {
    allMentions.push({
      name,
      mentionCount: count,
      percentage: totalPrompts > 0 ? Math.round((count / totalPrompts) * 100) : 0
    });
  }
  
  return allMentions.sort((a, b) => b.mentionCount - a.mentionCount);
}

// US Cities and States for filtering false positives from competitor names
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
]);

const US_STATES = new Set([
  'al', 'alabama', 'ak', 'alaska', 'az', 'arizona', 'ar', 'arkansas',
  'ca', 'california', 'co', 'colorado', 'ct', 'connecticut', 'de', 'delaware',
  'fl', 'florida', 'ga', 'georgia', 'hi', 'hawaii', 'id', 'idaho',
  'il', 'illinois', 'in', 'indiana', 'ia', 'iowa', 'ks', 'kansas',
  'ky', 'kentucky', 'la', 'louisiana', 'me', 'maine', 'md', 'maryland',
  'ma', 'massachusetts', 'mi', 'michigan', 'mn', 'minnesota', 'ms', 'mississippi',
  'mo', 'missouri', 'mt', 'montana', 'ne', 'nebraska', 'nv', 'nevada',
  'nh', 'new hampshire', 'nj', 'new jersey', 'nm', 'new mexico', 'ny', 'new york',
  'nc', 'north carolina', 'nd', 'north dakota', 'oh', 'ohio', 'ok', 'oklahoma',
  'or', 'oregon', 'pa', 'pennsylvania', 'ri', 'rhode island', 'sc', 'south carolina',
  'sd', 'south dakota', 'tn', 'tennessee', 'tx', 'texas', 'ut', 'utah',
  'vt', 'vermont', 'va', 'virginia', 'wa', 'washington', 'wv', 'west virginia',
  'wi', 'wisconsin', 'wy', 'wyoming', 'dc', 'district of columbia'
]);

// Generic service keywords to filter out from competitor extraction
const SERVICE_KEYWORDS = new Set([
  'handyman', 'plumber', 'electrician', 'painter', 'contractor', 'roofer',
  'landscaper', 'cleaner', 'mover', 'carpenter', 'mechanic', 'technician',
  'plumbing', 'painting', 'roofing', 'electrical', 'carpentry', 'landscaping',
  'cleaning', 'moving', 'hvac', 'flooring', 'remodeling', 'renovation',
  'services', 'service', 'provider', 'providers', 'professional', 'professionals',
  'company', 'companies', 'business', 'businesses', 'expert', 'experts',
  'specialist', 'specialists', 'contractor', 'contractors', 'team', 'crew',
  'local', 'national', 'certified', 'licensed', 'insured', 'experienced',
  'reliable', 'trusted', 'quality', 'affordable', 'premium', 'top',
  'and', 'or', 'the', 'for', 'with', 'from', 'their', 'your', 'our',
]);

// Common phrases that are NOT business names (section headers, CTAs, etc.)
const NON_BUSINESS_PHRASES = new Set([
  'get multiple quotes', 'get quotes', 'request quotes', 'compare prices',
  'read reviews', 'check reviews', 'view reviews', 'contact us', 'learn more',
  'find out more', 'here are some', 'things to consider', 'key factors',
  'important tips', 'how to choose', 'what to look for', 'pros and cons',
  'final thoughts', 'in conclusion', 'keep in mind', 'additional tips',
]);

// Action verbs that typically start CTAs/instructions, not business names
const ACTION_VERBS = [
  'get', 'check', 'read', 'view', 'find', 'look', 'compare', 'request',
  'contact', 'learn', 'see', 'visit', 'call', 'ask', 'choose', 'hire', 'consider'
];

// Business name suffixes that indicate a real company name
const BUSINESS_SUFFIXES = [
  'services', 'service', 'company', 'co', 'llc', 'inc', 'corp', 'corporation',
  'group', 'solutions', 'pros', 'masters', 'experts', 'enterprises', 'associates',
];

/**
 * Checks if a name is a valid competitor (not a city, generic term, or location reference)
 * Mirrors the full validation logic from isValidBusinessName in ai-services.ts
 */
function isValidCompetitor(name: string): boolean {
  const lowerName = name.toLowerCase().trim();
  const words = lowerName.split(/\s+/);
  
  // Reject names ending with colons (section headers)
  if (name.endsWith(':')) {
    return false;
  }
  
  // Reject Google Business Profile metadata patterns (e.g., "Closed · Marketing agency")
  if (/\b(closed|open)\s*·/i.test(name)) {
    return false;
  }
  
  // Reject star ratings with reviews pattern (e.g., "5.0 (71 reviews)")
  if (/\d+\.\d+\s*\(\d+(\s*reviews?)?\)/i.test(name)) {
    return false;
  }
  
  // Reject standalone category descriptors with separators (e.g., "· Marketing agency ·")
  if (/·\s*[A-Za-z\s]+\s*·/.test(name)) {
    return false;
  }
  
  // Reject common Google Maps metadata patterns
  if (/\b(closed now|open now|opens at|closes at|get directions|business hours)\b/i.test(lowerName)) {
    return false;
  }
  
  // Reject rating context patterns (e.g., "rated 4.8 stars", "4.5-star rating")
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
  if (ACTION_VERBS.some(verb => lowerName.startsWith(verb + ' '))) {
    return false;
  }
  
  // Reject exact city matches
  if (MAJOR_US_CITIES.has(lowerName)) {
    return false;
  }
  
  // Reject "City, ST" or "City, State" patterns
  const cityCommaStatePattern = /^(.+),\s*([a-z]{2}|[a-z]+)$/i;
  const cityStateMatch = lowerName.match(cityCommaStatePattern);
  if (cityStateMatch) {
    const potentialState = cityStateMatch[2]?.trim();
    if (potentialState && US_STATES.has(potentialState)) {
      return false;
    }
  }
  
  // Reject single-word generic terms
  if (words.length === 1) {
    if (SERVICE_KEYWORDS.has(lowerName)) {
      return false;
    }
    // Generic single lowercase word
    if (/^[a-z]+$/.test(lowerName) && lowerName.length < 12) {
      return false;
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

/**
 * Aggregates competitor mentions from results (with city filtering)
 */
export function aggregateCompetitorMentions(
  results: { competitors: string | null }[]
): Map<string, number> {
  const counts = new Map<string, number>();
  
  for (const result of results) {
    if (!result.competitors) continue;
    
    try {
      const competitors = JSON.parse(result.competitors) as string[];
      for (const comp of competitors) {
        const normalized = comp.trim();
        // Filter out cities and location-only mentions
        if (normalized && isValidCompetitor(normalized)) {
          counts.set(normalized, (counts.get(normalized) || 0) + 1);
        }
      }
    } catch {
      continue;
    }
  }
  
  return counts;
}

// ============================================
// MENTION RANK DETECTION
// ============================================

/**
 * Detects position of brand mention in AI response
 * Returns 1 for first, 2 for second, etc. or null if not in ranked context
 */
export function detectMentionRank(
  responseText: string | null | undefined,
  brandName: string
): number | null {
  if (!responseText || !brandName) return null;
  
  const lowerText = responseText.toLowerCase();
  const lowerBrand = brandName.toLowerCase();
  
  if (!lowerText.includes(lowerBrand)) return null;
  
  const lines = responseText.split('\n');
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lowerLine = line.toLowerCase();
    
    if (!lowerLine.includes(lowerBrand)) continue;
    
    const numberedMatch = line.match(/^[\s]*(\d+)[.\):\-]/);
    if (numberedMatch) {
      return parseInt(numberedMatch[1], 10);
    }
    
    const rankPatterns = [
      { pattern: /\b(first|1st|#1|top pick|best choice|number one)\b/i, rank: 1 },
      { pattern: /\b(second|2nd|#2|number two|runner[- ]?up)\b/i, rank: 2 },
      { pattern: /\b(third|3rd|#3|number three)\b/i, rank: 3 },
      { pattern: /\b(fourth|4th|#4)\b/i, rank: 4 },
      { pattern: /\b(fifth|5th|#5)\b/i, rank: 5 },
    ];
    
    for (const { pattern, rank } of rankPatterns) {
      if (pattern.test(line)) {
        return rank;
      }
    }
  }
  
  const numberedListRegex = /^[\s]*(\d+)[.\):\-]\s*[^\n]*$/gm;
  let match;
  while ((match = numberedListRegex.exec(responseText)) !== null) {
    const fullLine = match[0].toLowerCase();
    if (fullLine.includes(lowerBrand)) {
      return parseInt(match[1], 10);
    }
  }
  
  return null;
}

/**
 * Calculate average rank from array of ranks (ignoring nulls)
 */
export function calculateAverageRank(ranks: (number | null)[]): number | null {
  const validRanks = ranks.filter((r): r is number => r !== null && r > 0);
  if (validRanks.length === 0) return null;
  
  const sum = validRanks.reduce((a, b) => a + b, 0);
  return Math.round((sum / validRanks.length) * 10) / 10;
}

/**
 * Count first place mentions
 */
export function countFirstPlace(ranks: (number | null)[]): number {
  return ranks.filter(r => r === 1).length;
}

// ============================================
// SENTIMENT ANALYSIS
// ============================================

const POSITIVE_WORDS = [
  'best', 'top', 'leading', 'excellent', 'outstanding', 'highly recommended',
  'premier', 'trusted', 'reliable', 'professional', 'quality', 'expert',
  'reputable', 'renowned', 'award-winning', 'exceptional', 'superior',
  'great', 'fantastic', 'wonderful', 'amazing', 'impressive', 'recommended',
  'first choice', 'go-to', 'favorite', 'preferred', 'popular', 'well-known',
  'highly rated', 'top-rated', 'five star', '5 star', 'excellent reputation'
];

const NEGATIVE_WORDS = [
  'avoid', 'poor', 'disappointing', 'issues', 'complaints', 'problems',
  'unreliable', 'unprofessional', 'overpriced', 'slow', 'bad reviews',
  'not recommended', 'stay away', 'warning', 'scam', 'terrible', 'awful',
  'horrible', 'worst', 'bad', 'negative reviews', 'concerns', 'beware',
  'caution', 'mixed reviews', 'inconsistent', 'hit or miss', 'subpar'
];

// Weighted sentiment words (stronger positive/negative indicators)
const STRONG_POSITIVE_WORDS = [
  'best', 'highly recommended', 'excellent', 'outstanding', 'exceptional',
  'first choice', 'top-rated', 'award-winning', 'premier'
];

const STRONG_NEGATIVE_WORDS = [
  'avoid', 'scam', 'terrible', 'worst', 'stay away', 'warning', 'beware'
];

/**
 * Classifies sentiment of brand mention in response
 */
export function classifySentiment(
  responseText: string | null | undefined,
  brandName: string
): 'positive' | 'neutral' | 'negative' | null {
  if (!responseText || !brandName) return null;
  
  const snippet = extractMentionContext(responseText, brandName);
  if (!snippet) return null;
  
  const lowerSnippet = snippet.toLowerCase();
  
  let positiveScore = 0;
  let negativeScore = 0;
  
  for (const word of POSITIVE_WORDS) {
    if (lowerSnippet.includes(word)) {
      positiveScore++;
    }
  }
  
  for (const word of NEGATIVE_WORDS) {
    if (lowerSnippet.includes(word)) {
      negativeScore++;
    }
  }
  
  if (positiveScore > negativeScore) return 'positive';
  if (negativeScore > positiveScore) return 'negative';
  return 'neutral';
}

/**
 * Aggregates sentiment across multiple results
 */
export function aggregateSentiment(
  sentiments: (string | null)[]
): SentimentBreakdown {
  const breakdown = { positive: 0, neutral: 0, negative: 0 };
  
  for (const sentiment of sentiments) {
    if (sentiment === 'positive') breakdown.positive++;
    else if (sentiment === 'negative') breakdown.negative++;
    else if (sentiment === 'neutral') breakdown.neutral++;
  }
  
  return breakdown;
}

/**
 * Calculates a numerical sentiment score (0-100) based on word analysis
 * 50 = neutral, 100 = very positive, 0 = very negative
 * Uses mutually exclusive counting - strong words are counted at 2x, regular words at 1x
 */
export function calculateSentimentScore(
  responseText: string | null | undefined,
  brandName: string
): number | null {
  if (!responseText || !brandName) return null;
  
  const snippet = extractMentionContext(responseText, brandName);
  if (!snippet) return null;
  
  const lowerSnippet = snippet.toLowerCase();
  
  // Track found words to avoid double-counting
  const foundPositive = new Set<string>();
  const foundNegative = new Set<string>();
  
  // Check for positive words
  for (const word of POSITIVE_WORDS) {
    if (lowerSnippet.includes(word)) {
      foundPositive.add(word);
    }
  }
  
  // Check for negative words
  for (const word of NEGATIVE_WORDS) {
    if (lowerSnippet.includes(word)) {
      foundNegative.add(word);
    }
  }
  
  // Calculate scores - strong words get 2 points, regular words get 1 point
  // No double counting: a word is either strong (2 points) or regular (1 point)
  let positiveScore = 0;
  let negativeScore = 0;
  
  for (const word of Array.from(foundPositive)) {
    if (STRONG_POSITIVE_WORDS.includes(word)) {
      positiveScore += 2;
    } else {
      positiveScore += 1;
    }
  }
  
  for (const word of Array.from(foundNegative)) {
    if (STRONG_NEGATIVE_WORDS.includes(word)) {
      negativeScore += 2;
    } else {
      negativeScore += 1;
    }
  }
  
  // Calculate score: neutral = 50, shift based on positive/negative balance
  // Maximum shift is 50 points in either direction
  const netScore = positiveScore - negativeScore;
  const maxPoints = 10; // After this many net points, we hit 100 or 0
  
  // Clamp netScore to [-maxPoints, maxPoints] range
  const clampedNet = Math.max(-maxPoints, Math.min(maxPoints, netScore));
  
  // Convert to 0-100 scale: -maxPoints -> 0, 0 -> 50, +maxPoints -> 100
  const score = 50 + (clampedNet / maxPoints) * 50;
  
  return Math.round(score);
}

/**
 * Calculates overall sentiment score from multiple individual scores
 */
export function calculateOverallSentimentScore(
  scores: (number | null)[]
): number | null {
  const validScores = scores.filter((s): s is number => s !== null);
  if (validScores.length === 0) return null;
  
  const sum = validScores.reduce((a, b) => a + b, 0);
  return Math.round(sum / validScores.length);
}

export interface SentimentStatement {
  text: string;
  platform: 'chatgpt' | 'google';
  promptText?: string;
}

export interface SentimentStatements {
  positive: SentimentStatement[];
  negative: SentimentStatement[];
}

// New improved sentiment narrative interface (like SEMRush)
export interface SentimentNarrative {
  text: string;
  strength: number; // 1-5 scale for visual bar
}

export interface SentimentNarratives {
  strengths: SentimentNarrative[];
  improvements: SentimentNarrative[];
}

/**
 * Extracts sentiment statements (quotes) from AI responses
 */
export function extractSentimentStatement(
  responseText: string | null | undefined,
  brandName: string,
  platform: 'chatgpt' | 'google',
  promptText?: string
): { positive: SentimentStatement | null; negative: SentimentStatement | null } {
  if (!responseText || !brandName) return { positive: null, negative: null };
  
  const snippet = extractMentionContext(responseText, brandName);
  if (!snippet) return { positive: null, negative: null };
  
  const lowerSnippet = snippet.toLowerCase();
  
  // Check for positive indicators
  let isPositive = false;
  for (const word of POSITIVE_WORDS) {
    if (lowerSnippet.includes(word)) {
      isPositive = true;
      break;
    }
  }
  
  // Check for negative indicators
  let isNegative = false;
  for (const word of NEGATIVE_WORDS) {
    if (lowerSnippet.includes(word)) {
      isNegative = true;
      break;
    }
  }
  
  const statement: SentimentStatement = {
    text: snippet.length > 300 ? snippet.substring(0, 300) + '...' : snippet,
    platform,
    promptText
  };
  
  return {
    positive: isPositive ? statement : null,
    negative: isNegative ? statement : null
  };
}

/**
 * Aggregates sentiment statements from multiple results
 */
export function aggregateSentimentStatements(
  results: Array<{
    chatgptResponse: string | null;
    googleAIResponse: string | null;
    promptText: string;
  }>,
  brandName: string
): SentimentStatements {
  const statements: SentimentStatements = { positive: [], negative: [] };
  
  for (const result of results) {
    // Check ChatGPT response
    const chatgptResult = extractSentimentStatement(
      result.chatgptResponse,
      brandName,
      'chatgpt',
      result.promptText
    );
    if (chatgptResult.positive) statements.positive.push(chatgptResult.positive);
    if (chatgptResult.negative) statements.negative.push(chatgptResult.negative);
    
    // Check Google AI response
    const googleResult = extractSentimentStatement(
      result.googleAIResponse,
      brandName,
      'google',
      result.promptText
    );
    if (googleResult.positive) statements.positive.push(googleResult.positive);
    if (googleResult.negative) statements.negative.push(googleResult.negative);
  }
  
  // Limit to top 5 of each
  return {
    positive: statements.positive.slice(0, 5),
    negative: statements.negative.slice(0, 5)
  };
}

export interface CompetitorVisibility {
  name: string;
  visibilityPercent: number;
  mentionCount: number;
}

/**
 * Computes visibility scores for competitors
 */
export function computeCompetitorVisibility(
  competitorCounts: Map<string, number>,
  totalPrompts: number,
  limit: number = 5
): CompetitorVisibility[] {
  const entries = Array.from(competitorCounts.entries());
  
  return entries
    .map(([name, count]) => ({
      name,
      mentionCount: count,
      visibilityPercent: totalPrompts > 0 ? Math.round((count / totalPrompts) * 100) : 0
    }))
    .sort((a, b) => b.mentionCount - a.mentionCount)
    .slice(0, limit);
}

// ============================================
// SNIPPET EXTRACTION
// ============================================

/**
 * Extracts context around brand mention (2 sentences before/after)
 */
export function extractMentionContext(
  responseText: string | null | undefined,
  brandName: string
): string | null {
  if (!responseText || !brandName) return null;
  
  const lowerText = responseText.toLowerCase();
  const lowerBrand = brandName.toLowerCase();
  
  const mentionIndex = lowerText.indexOf(lowerBrand);
  if (mentionIndex === -1) return null;
  
  const sentencePattern = /[.!?]+\s+/g;
  const sentences = responseText.split(sentencePattern);
  
  let charCount = 0;
  let targetSentenceIndex = 0;
  
  for (let i = 0; i < sentences.length; i++) {
    charCount += sentences[i].length + 2;
    if (charCount > mentionIndex) {
      targetSentenceIndex = i;
      break;
    }
  }
  
  const startIndex = Math.max(0, targetSentenceIndex - 1);
  const endIndex = Math.min(sentences.length, targetSentenceIndex + 2);
  
  const snippet = sentences.slice(startIndex, endIndex).join('. ').trim();
  
  if (snippet.length > 500) {
    return snippet.substring(0, 500) + '...';
  }
  
  return snippet || null;
}

// ============================================
// FULL ANALYSIS
// ============================================

/**
 * Runs complete analytics on a single AI response
 */
export function analyzeResponse(
  responseText: string | null | undefined,
  brandName: string
): AnalyticsResult {
  return {
    sentiment: classifySentiment(responseText, brandName),
    rank: detectMentionRank(responseText, brandName),
    citations: extractCitations(responseText),
    snippet: extractMentionContext(responseText, brandName)
  };
}
