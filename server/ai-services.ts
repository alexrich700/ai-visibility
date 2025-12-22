import OpenAI from "openai";

// Configuration constants for prompt generation
export const PROMPTS_PER_GROUP = 5; // Number of prompts to generate per service group

// OpenAI client using user's direct API key
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
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

// Gemini client using Replit AI Integrations with Google Search grounding
async function queryGemini(prompt: string, businessName: string, url?: string, brandAliases?: string[]): Promise<{ found: boolean; response: string; competitors: string[] }> {
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
    const detection = checkForMentions(text, businessName, url, brandAliases);
    const competitors = extractCompetitors(text, businessName);
    
    // Debug logging for detection
    const searchTerms = [...generateNameVariations(businessName, brandAliases), ...(url ? extractDomainKeywords(url) : [])];
    console.log(`[GEMINI DETECTION] Business: "${businessName}" | URL: "${url}" | Aliases: ${brandAliases?.length || 0} | Search terms: ${JSON.stringify(searchTerms)} | Found: ${detection.found}${detection.matchedTerm ? ` (matched: "${detection.matchedTerm}")` : ''}`);
    if (!detection.found) {
      console.log(`[GEMINI] Response preview (first 300 chars): ${text.slice(0, 300).replace(/\n/g, ' ')}`);
    }

    return { found: detection.found, response: text, competitors };
  } catch (error) {
    console.error("Gemini API error:", error);
    return simulateResponse(prompt, businessName);
  }
}

// ChatGPT client using Responses API with web_search tool for proper grounding
async function queryChatGPT(prompt: string, businessName: string, url?: string, location?: string, brandAliases?: string[]): Promise<{ found: boolean; response: string; competitors: string[] }> {
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
    
    // Use Responses API with web_search tool for real-time grounded search results
    // The Responses API uses 'input' and 'instructions' instead of 'messages'
    const response = await openai.responses.create({
      model: "gpt-5.2",
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
    
    const detection = checkForMentions(text, businessName, url, brandAliases);
    const competitors = extractCompetitors(text, businessName);
    
    // Debug logging for detection
    const searchTerms = [...generateNameVariations(businessName, brandAliases), ...(url ? extractDomainKeywords(url) : [])];
    console.log(`[CHATGPT DETECTION] Business: "${businessName}" | URL: "${url}" | Aliases: ${brandAliases?.length || 0} | Search terms: ${JSON.stringify(searchTerms)} | Found: ${detection.found}${detection.matchedTerm ? ` (matched: "${detection.matchedTerm}")` : ''}`);
    if (!detection.found) {
      console.log(`[CHATGPT] Response preview (first 300 chars): ${text.slice(0, 300).replace(/\n/g, ' ')}`);
    }

    return { found: detection.found, response: text, competitors };
  } catch (error) {
    console.error("ChatGPT API error:", error);
    return simulateResponse(prompt, businessName);
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
async function generateExecutiveSummary(
  businessName: string,
  keyword: string,
  overallScore: number,
  chatgptScore: number,
  googleAIScore: number,
  sentimentOverall: string,
  location: string
): Promise<string> {
  try {
    const userPrompt = `Write a 2-3 sentence executive summary for an AI visibility audit.
Start with: "We analyzed ${businessName} across 20 high-intent AI prompts on ChatGPT and Google AI${location !== "nationwide" ? ` for ${keyword} in ${location}` : ` for ${keyword} nationwide`}."
Key findings: overall score ${overallScore}/100, ChatGPT ${chatgptScore}%, Google AI ${googleAIScore}%, sentiment ${sentimentOverall}.
Describe what this means for AI visibility. Be professional.`;
    
    const response = await openai.chat.completions.create({
      model: "gpt-5.2",
      messages: [
        { role: "system", content: "You write professional, matter-of-fact executive summaries for AI visibility audit reports. Be concise and data-driven." },
        { role: "user", content: userPrompt }
      ],
      max_completion_tokens: 512,
    });
    return response.choices[0]?.message?.content || `We analyzed ${businessName} across 20 high-intent AI prompts on ChatGPT and Google AI. The results indicate a visibility score of ${overallScore}/100 with ${sentimentOverall} brand sentiment.`;
  } catch (error) {
    console.error("Executive summary generation error:", error);
    return `We analyzed ${businessName} across 20 high-intent AI prompts on ChatGPT and Google AI. The results indicate a visibility score of ${overallScore}/100 with ${sentimentOverall} brand sentiment.`;
  }
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
  
  try {
    console.log(`Generating ${promptCount} research prompts with GPT-5.2 for "${targetService}"...`);
    const response = await openai.chat.completions.create({
      model: "gpt-5.2",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      max_completion_tokens: 1024,
    });
    
    const text = response.choices[0]?.message?.content || "";
    console.log("OpenAI research prompts response:", text.slice(0, 200));
    
    const cleanText = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(cleanText);
    
    if (Array.isArray(parsed)) {
      const validPrompts = parsed
        .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        .map(s => s.trim())
        .slice(0, promptCount);
      
      // Accept if we got at least the required number of prompts (more flexible than exact match)
      if (validPrompts.length >= promptCount) {
        console.log(`Generated ${validPrompts.length} valid research prompts for "${targetService}"`);
        return validPrompts.slice(0, promptCount);
      } else if (validPrompts.length >= 3) {
        // Accept fewer prompts if we got at least 3 (pad with fallback if needed)
        console.log(`OpenAI returned ${validPrompts.length} prompts, padding with fallback for "${targetService}"`);
        const fallbackPrompts = getFallbackResearchPrompts(keyword, location, serviceCategory);
        const combined = [...validPrompts, ...fallbackPrompts.slice(0, promptCount - validPrompts.length)];
        return combined.slice(0, promptCount);
      } else {
        console.log(`OpenAI returned only ${validPrompts.length} valid prompts (need ${promptCount}), using fallback`);
      }
    }
  } catch (error) {
    console.error("Research prompt generation error:", error);
  }
  
  console.log(`Using fallback research prompts for "${targetService}"`);
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

Return ONLY a valid JSON array of exactly 5 strings. No explanations, no markdown, just the JSON array.`;
  
  const userPrompt = `Generate 5 brand-specific queries for:
Business Name: ${businessName}
Industry: ${keyword}
Location: ${location !== "nationwide" ? location : "National"}

Example formats:
- "Would you recommend [business name]?"
- "Is [business name] a good [service]?"
- "What do customers say about [business name]?"`;
  
  try {
    console.log("Generating sentiment prompts with GPT-5.2...");
    const response = await openai.chat.completions.create({
      model: "gpt-5.2",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      max_completion_tokens: 512,
    });
    
    const text = response.choices[0]?.message?.content || "";
    console.log("GPT-4o sentiment prompts response:", text.slice(0, 200));
    
    const cleanText = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(cleanText);
    
    if (Array.isArray(parsed)) {
      const validPrompts = parsed
        .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        .map(s => s.trim())
        .slice(0, 5);
      
      if (validPrompts.length === 5) {
        console.log(`Generated 5 valid sentiment prompts`);
        return validPrompts;
      }
    }
  } catch (error) {
    console.error("Sentiment prompt generation error:", error);
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

// Main audit function
export async function runAudit(
  businessName: string,
  url: string,
  keyword: string,
  scope: "local" | "national",
  city?: string
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
  // Generate research prompts (NO brand name - for visibility testing)
  const researchPrompts = await generateResearchPrompts(keyword, scope, city, url);
  
  // Generate sentiment prompts (WITH brand name - for sentiment analysis)
  const sentimentPrompts = await generateSentimentPrompts(businessName, keyword, scope, city);

  // Format location for web search (use city if provided)
  const searchLocation = city || undefined;

  // Query ChatGPT and Google AI for research prompts (visibility)
  const promptResults = await Promise.all(
    researchPrompts.map(async (prompt) => {
      const [chatgpt, googleAI] = await Promise.all([
        queryChatGPT(prompt, businessName, url, searchLocation),
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
    })
  );

  // Query ChatGPT and Google AI for sentiment prompts
  const sentimentResults = await Promise.all(
    sentimentPrompts.map(async (prompt) => {
      const [chatgptResult, googleAIResult] = await Promise.all([
        queryChatGPT(prompt, businessName, url, searchLocation),
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
    })
  );

  // Calculate visibility scores
  const chatgptFound = promptResults.filter((r) => r.chatgpt.found).length;
  const googleAIFound = promptResults.filter((r) => r.googleAI.found).length;

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

  // Generate executive summary
  const location = scope === "local" && city ? city : "nationwide";
  const executiveSummary = await generateExecutiveSummary(
    businessName,
    keyword,
    overallScore,
    chatgptScore,
    googleAIScore,
    overallSentiment,
    location
  );

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
}

// ============================================
// MONITORING SERVICE FUNCTIONS
// ============================================

// Return type includes high-level category plus specific service groups
export interface ServiceGroupsResult {
  highLevelCategory: { name: string; description: string };
  groups: { name: string; description: string }[];
}

export async function generateServiceGroups(
  businessName: string,
  industry: string,
  scope: string,
  city?: string
): Promise<ServiceGroupsResult> {
  try {
    const locationContext = scope === "local" && city ? ` in ${city}` : "";
    
    const response = await openai.chat.completions.create({
      model: "gpt-5.2",
      messages: [
        {
          role: "system",
          content: `You are an expert marketing strategist specializing in service/product categorization for AI visibility tracking. Your task is to:
1. Identify ONE high-level category (umbrella term) that best describes the business type
2. Generate exactly 10 distinct service/product groups that represent specific offerings

# High-Level Category Guidelines
- This is the broadest, most common search term for this type of business
- 1-3 words maximum
- What someone would search if they just needed "any" provider of this type
- Examples: "HVAC Contractor", "Plumber", "Marketing Agency", "Personal Injury Lawyer", "Handyman", "Electrician", "Dentist"

# Service Group Guidelines
- Generate granular, search-intent-focused groups (how real customers would search)
- Each group should represent a distinct, searchable service or product category
- Include variations customers actually use (e.g., "heater repair" not just "HVAC repair")
- Groups should cover the full spectrum of typical offerings for this industry
- Names should be 1-4 words, matching natural search language

# Output Format
Return a JSON object with:
- "highLevelCategory": object with "name" and "description" fields
- "groups": array of exactly 10 objects, each with "name" and "description" fields

# Examples

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
}

For Smart Fix Handyman:
{
  "highLevelCategory": {"name": "Handyman", "description": "General home repair and maintenance services"},
  "groups": [...]
}

For Roto-Rooter:
{
  "highLevelCategory": {"name": "Plumber", "description": "Plumbing repair and installation services"},
  "groups": [...]
}`
        },
        {
          role: "user",
          content: `Generate the high-level category and exactly 10 service/product groups for "${businessName}", a ${industry} business${locationContext}.

Consider what real customers would search for when looking for this type of business. The high-level category should be the broadest umbrella term, while groups should be specific enough to track AI visibility by individual service/product offering.`
        }
      ],
      temperature: 0.7,
      response_format: { type: "json_object" }
    });

    const content = response.choices[0]?.message?.content || "{}";
    const parsed = JSON.parse(content);
    
    // Extract high-level category
    const highLevelCategory = parsed.highLevelCategory || {
      name: industry,
      description: `${industry} services and products`
    };
    
    // Handle different response formats for groups
    const groups = Array.isArray(parsed.groups) ? parsed.groups : 
                   (parsed.categories || []);
    
    if (groups.length === 0) {
      // Return default with fallback high-level category
      return {
        highLevelCategory,
        groups: getDefaultGroups(industry)
      };
    }
    
    return { highLevelCategory, groups };
  } catch (error) {
    console.error("Error generating service groups:", error);
    // Return fallback with industry as high-level category
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

// Generate prompts for each group by reusing the unified generateResearchPrompts function
// This ensures one source of truth for prompt generation logic - edit once, apply everywhere
export async function generatePromptsForGroups(
  businessName: string,
  domain: string,
  industry: string,
  scope: string,
  city: string | undefined,
  groups: { name: string; description: string }[],
  maxPromptsPerGroup?: number // Optional: limit prompts per group (default uses PROMPTS_PER_GROUP constant)
): Promise<{ groupName: string; prompts: string[] }[]> {
  const promptLimit = maxPromptsPerGroup || PROMPTS_PER_GROUP;
  console.log(`Generating prompts for ${groups.length} groups (max ${promptLimit} per group)...`);
  
  // Generate prompts for each group sequentially (to avoid rate limiting)
  const results: { groupName: string; prompts: string[] }[] = [];
  
  for (const group of groups) {
    console.log(`Generating prompts for group: ${group.name}`);
    
    // Use the unified generateResearchPrompts with serviceCategory parameter
    let prompts = await generateResearchPrompts(
      industry,
      scope as "local" | "national",
      city,
      undefined, // no URL scraping for group-specific prompts
      group.name // serviceCategory - this focuses prompts on this specific service
    );
    
    // Limit prompts to the configured limit
    if (prompts.length > promptLimit) {
      prompts = prompts.slice(0, promptLimit);
    }
    
    results.push({
      groupName: group.name,
      prompts
    });
  }
  
  console.log(`Generated prompts for all ${results.length} groups`);
  return results;
}

export interface PromptCheckResult {
  chatgpt: {
    found: boolean;
    response: string;
    cited: boolean;
  };
  googleAI: {
    found: boolean;
    response: string;
    cited: boolean;
  };
  competitors: string[];
}

// Helper function to query OpenAI/ChatGPT for monitoring (with location for web search grounding)
async function queryOpenAI(prompt: string, businessName: string, domain: string, location?: string, brandAliases?: string[]): Promise<{ found: boolean; response: string; cited: boolean; competitors: string[] }> {
  try {
    console.log(`[queryOpenAI] Calling ChatGPT with location: "${location || 'none'}", aliases: ${brandAliases?.length || 0}`);
    const result = await queryChatGPT(prompt, businessName, domain, location, brandAliases);
    console.log(`[queryOpenAI] Result - found: ${result.found}, response length: ${result.response.length}`);
    return {
      found: result.found,
      response: result.response,
      cited: result.response.toLowerCase().includes(domain.toLowerCase()),
      competitors: result.competitors,
    };
  } catch (error) {
    console.error("queryOpenAI error (full):", error);
    return { found: false, response: "Error querying ChatGPT", cited: false, competitors: [] };
  }
}

// Helper function to query Google AI/Gemini for monitoring
async function queryGoogleAI(prompt: string, businessName: string, domain: string, brandAliases?: string[]): Promise<{ found: boolean; response: string; cited: boolean; competitors: string[] }> {
  try {
    console.log(`[queryGoogleAI] Calling Gemini...`);
    const result = await queryGemini(prompt, businessName, domain, brandAliases);
    console.log(`[queryGoogleAI] Result - found: ${result.found}, response length: ${result.response.length}`);
    return {
      found: result.found,
      response: result.response,
      cited: result.response.toLowerCase().includes(domain.toLowerCase()),
      competitors: result.competitors,
    };
  } catch (error) {
    console.error("queryGoogleAI error (full):", error);
    return { found: false, response: "Error querying Google AI", cited: false, competitors: [] };
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
      },
      googleAI: {
        found: googleAIResult.found,
        response: googleAIResult.response,
        cited: googleAIResult.cited,
      },
      competitors: uniqueCompetitors.slice(0, 10),
    };
  } catch (error) {
    console.error("Error running prompt check:", error);
    return {
      chatgpt: { found: false, response: "Error occurred during check", cited: false },
      googleAI: { found: false, response: "Error occurred during check", cited: false },
      competitors: [],
    };
  }
}

// Synthesize clean sentiment narratives from raw AI response snippets
// Returns structured narratives like SEMRush: "Brand Strength Factors" and "Areas for Improvement"
export interface SynthesizedNarrative {
  text: string;
  strength: number; // 1-5 scale
}

export interface SynthesizedNarratives {
  strengths: SynthesizedNarrative[];
  improvements: SynthesizedNarrative[];
}

export async function synthesizeSentimentNarratives(
  rawStatements: { positive: string[]; negative: string[] },
  businessName: string
): Promise<SynthesizedNarratives> {
  const result: SynthesizedNarratives = { strengths: [], improvements: [] };
  
  // Skip if no statements to analyze
  if (rawStatements.positive.length === 0 && rawStatements.negative.length === 0) {
    return result;
  }
  
  try {
    const prompt = `Analyze these AI-generated statements about "${businessName}" and extract key sentiment narratives.

POSITIVE STATEMENTS (raw snippets from AI responses):
${rawStatements.positive.slice(0, 10).map((s, i) => `${i + 1}. ${s}`).join('\n\n')}

NEGATIVE STATEMENTS (raw snippets from AI responses):
${rawStatements.negative.slice(0, 10).map((s, i) => `${i + 1}. ${s}`).join('\n\n')}

Instructions:
1. Extract and synthesize the KEY themes from these statements
2. Convert raw AI text into clean, concise narrative statements (1-2 sentences each)
3. Remove markdown formatting, URLs, phone numbers, and technical artifacts
4. Focus on actionable insights - what makes the brand strong or weak
5. Rate each narrative's strength/importance on a 1-5 scale (5 = very significant)
6. Return up to 7 strengths and 7 areas for improvement

Return ONLY valid JSON in this exact format:
{
  "strengths": [
    {"text": "Clean narrative about a brand strength", "strength": 4},
    {"text": "Another clean narrative", "strength": 3}
  ],
  "improvements": [
    {"text": "Clean narrative about an area for improvement", "strength": 3},
    {"text": "Another improvement area", "strength": 2}
  ]
}`;

    const response = await openai.chat.completions.create({
      model: "gpt-5.2",
      messages: [
        {
          role: "system",
          content: "You are a brand perception analyst. Extract clean, actionable sentiment narratives from raw AI response snippets. Always respond with valid JSON only."
        },
        { role: "user", content: prompt }
      ],
      temperature: 0.3,
      max_tokens: 2000,
    });
    
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
        .slice(0, 7)
        .map((s: any) => ({
          text: String(s.text).trim(),
          strength: Math.max(1, Math.min(5, Math.round(s.strength)))
        }));
    }
    
    if (Array.isArray(parsed.improvements)) {
      result.improvements = parsed.improvements
        .filter((s: any) => s.text && typeof s.strength === 'number')
        .slice(0, 7)
        .map((s: any) => ({
          text: String(s.text).trim(),
          strength: Math.max(1, Math.min(5, Math.round(s.strength)))
        }));
    }
    
    console.log(`[synthesizeSentimentNarratives] Extracted ${result.strengths.length} strengths, ${result.improvements.length} improvements`);
    
  } catch (error) {
    console.error("[synthesizeSentimentNarratives] Error:", error);
    // Return empty result on error - the UI will handle gracefully
  }
  
  return result;
}
