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

/**
 * Aggregates competitor mentions from results
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
        if (normalized) {
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
  'reputable', 'renowned', 'award-winning', 'exceptional', 'superior'
];

const NEGATIVE_WORDS = [
  'avoid', 'poor', 'disappointing', 'issues', 'complaints', 'problems',
  'unreliable', 'unprofessional', 'overpriced', 'slow', 'bad reviews',
  'not recommended', 'stay away', 'warning', 'scam'
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
