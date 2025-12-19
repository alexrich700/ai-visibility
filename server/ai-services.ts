import OpenAI from "openai";

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
function generateNameVariations(businessName: string): string[] {
  const variations: string[] = [businessName.toLowerCase()];
  
  // Remove common suffixes and create variations
  const suffixesToRemove = [' marketing', ' agency', ' consulting', ' services', ' llc', ' inc', ' co', ' company'];
  let baseName = businessName.toLowerCase();
  for (const suffix of suffixesToRemove) {
    if (baseName.endsWith(suffix)) {
      baseName = baseName.slice(0, -suffix.length).trim();
      if (baseName.length > 3) {
        variations.push(baseName);
      }
      break;
    }
  }
  
  // Create camelCase/concatenated version (e.g., "buildingbrands" from "Building Brands")
  const concatenated = businessName.toLowerCase().replace(/\s+/g, '');
  if (concatenated.length > 4 && !variations.includes(concatenated)) {
    variations.push(concatenated);
  }
  
  return variations;
}

// Check if any of the search terms are found in the text
// Priority: 1) Domain cited by AI, 2) Business name mentioned in text
function checkForMentions(text: string, businessName: string, url?: string): { found: boolean; matchedTerm?: string; matchType?: 'domain' | 'name' } {
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
  
  // STEP 3: If domain not cited, check if business name is mentioned in the text
  const lowerText = text.toLowerCase();
  const nameVariations = generateNameVariations(businessName);
  
  for (const term of nameVariations) {
    if (term && term.length > 3 && lowerText.includes(term)) {
      console.log(`[NAME MATCH] Business name "${term}" found in AI response text`);
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
async function queryGemini(prompt: string, businessName: string, url?: string): Promise<{ found: boolean; response: string; competitors: string[] }> {
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
    const detection = checkForMentions(text, businessName, url);
    const competitors = extractCompetitors(text, businessName);
    
    // Debug logging for detection
    const searchTerms = [...generateNameVariations(businessName), ...(url ? extractDomainKeywords(url) : [])];
    console.log(`[GEMINI DETECTION] Business: "${businessName}" | URL: "${url}" | Search terms: ${JSON.stringify(searchTerms)} | Found: ${detection.found}${detection.matchedTerm ? ` (matched: "${detection.matchedTerm}")` : ''}`);
    if (!detection.found) {
      console.log(`[GEMINI] Response preview (first 300 chars): ${text.slice(0, 300).replace(/\n/g, ' ')}`);
    }

    return { found: detection.found, response: text, competitors };
  } catch (error) {
    console.error("Gemini API error:", error);
    return simulateResponse(prompt, businessName);
  }
}

// ChatGPT client using user's direct OpenAI API key with web search enabled
async function queryChatGPT(prompt: string, businessName: string, url?: string, location?: string): Promise<{ found: boolean; response: string; competitors: string[] }> {
  try {
    // Build web search options with location if provided
    const webSearchOptions: any = {};
    if (location && location !== "nationwide") {
      const parts = location.split(',').map(p => p.trim());
      webSearchOptions.user_location = {
        type: "approximate",
        approximate: {
          country: "US",
          city: parts[0] || undefined,
          region: parts[1] || undefined
        }
      };
    }
    
    // Use gpt-4o-search-preview with web_search_options for real-time search results
    const response = await openai.chat.completions.create({
      model: "gpt-4o-search-preview",
      web_search_options: webSearchOptions,
      messages: [
        { role: "system", content: "You are a helpful assistant that provides factual, detailed answers about local and national businesses. When asked about service providers, list specific company names with their website URLs when possible. At the end of your response, provide a clean bullet list of just the business names you mentioned (no ratings, reviews, hours, or other details)." },
        { role: "user", content: prompt }
      ],
    } as any);

    // Extract text from response
    const text = response.choices[0]?.message?.content || "";
    const detection = checkForMentions(text, businessName, url);
    const competitors = extractCompetitors(text, businessName);
    
    // Debug logging for detection
    const searchTerms = [...generateNameVariations(businessName), ...(url ? extractDomainKeywords(url) : [])];
    console.log(`[CHATGPT DETECTION] Business: "${businessName}" | URL: "${url}" | Search terms: ${JSON.stringify(searchTerms)} | Found: ${detection.found}${detection.matchedTerm ? ` (matched: "${detection.matchedTerm}")` : ''}`);
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
      model: "gpt-4o",
      messages: [
        { role: "system", content: "You write professional, matter-of-fact executive summaries for AI visibility audit reports. Be concise and data-driven." },
        { role: "user", content: userPrompt }
      ],
      max_tokens: 512,
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
// Note: These are GENERIC prompts that work for any industry - no hardcoded service types
function getFallbackResearchPrompts(keyword: string, location: string): string[] {
  const loc = location !== "nationwide" ? ` in ${location}` : "";
  const year = new Date().getFullYear();
  return [
    `Give me a list of the top 3 ${keyword} companies${loc}`,
    `Name 5 specific ${keyword} businesses I can call today${loc}`,
    `What are the best reviewed ${keyword} services${loc}?`,
    `List the top-rated ${keyword} companies${loc}`,
    `Which ${keyword} businesses${loc} have the best reputation?`,
    `Can you recommend specific ${keyword} companies${loc}?`,
    `Name the most trusted ${keyword} services${loc}`,
    `What ${keyword} companies${loc} have the best Google reviews in ${year}?`,
    `List 3 ${keyword} businesses that offer same-day service${loc}`,
    `Which specific ${keyword} companies do you recommend${loc}?`,
    `Give me the names of reliable ${keyword} services${loc}`,
    `What are 5 ${keyword} companies I should get quotes from${loc}?`,
    `Name some well-known ${keyword} franchises${loc}`,
    `List ${keyword} businesses${loc} with 4.5+ star ratings`,
    `Which ${keyword} companies${loc} are best for residential work?`,
    `Can you name the leading ${keyword} providers${loc}?`,
    `What are the top ${keyword} companies for emergencies${loc}?`,
    `List specific ${keyword} providers I can hire${loc}`,
    `Name ${keyword} businesses${loc} that offer free estimates`,
    `Which ${keyword} companies${loc} are best for commercial jobs?`,
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

// Generate 20 RESEARCH-BASED prompts (NO brand name - for visibility testing)
export async function generateResearchPrompts(
  keyword: string,
  scope: "local" | "national",
  city?: string,
  url?: string
): Promise<string[]> {
  const location = scope === "local" && city ? city : "nationwide";
  
  // Try to scrape homepage for context about services
  let homepageContent: string | null = null;
  if (url) {
    console.log(`Scraping website: ${url}`);
    homepageContent = await scrapeWebsite(url);
    if (homepageContent) {
      console.log(`Got ${homepageContent.length} chars of homepage content`);
    }
  }
  
  // Build prompt for OpenAI - explicitly exclude brand name but request specific business names in responses
  const systemPrompt = `You are a marketing expert specializing in AI search optimization. Generate exactly 20 research-based search queries that potential customers would type into AI assistants (like ChatGPT or Google AI) when actively looking to hire a ${keyword} business${location !== "nationwide" ? ` in ${location}` : ""}.

CRITICAL REQUIREMENTS:
1. These must be GENERIC research queries that do NOT include any specific business or brand names
2. Each query MUST explicitly ask for SPECIFIC BUSINESS NAMES to be listed - avoid vague queries that result in generic advice
3. Use long-tail, specific queries that will trigger AI to list actual company names
4. Include service types that are RELEVANT TO THE "${keyword.toUpperCase()}" INDUSTRY - do NOT use services from other industries

INCLUDE these types of prompts (MUST request specific business names):
- "Give me the top 3 ${keyword} companies in ${location !== "nationwide" ? location : "my area"}"
- "Name 5 specific ${keyword} businesses I can call today"
- "List the best reviewed ${keyword} services for [specific ${keyword}-related service]"
- "Which ${keyword} companies do you recommend for [specific ${keyword}-related task]?"
- "Can you name ${keyword} services that specialize in [specific ${keyword}-related specialty]?"

IMPORTANT: Generate service types that are SPECIFIC TO THE ${keyword.toUpperCase()} INDUSTRY. For example:
- If keyword is "plumbing": use pipe repair, drain cleaning, water heater installation, sewer line repair, leak detection
- If keyword is "electrician": use panel upgrades, outlet installation, lighting repair, wiring, circuit breaker replacement
- If keyword is "handyman": use drywall repair, door installation, furniture assembly, TV mounting, painting touch-ups
- If keyword is "roofing": use shingle replacement, leak repair, gutter installation, roof inspection, storm damage repair
- If keyword is "HVAC": use AC repair, furnace installation, duct cleaning, thermostat replacement, heating maintenance

DO NOT generate prompts that will result in generic advice like:
- "Who should I hire for ${keyword}?" (too vague - will get generic tips)
- "What to look for in a ${keyword}" (educational, not transactional)
- "Pros and cons of hiring ${keyword}" (informational, won't list businesses)

Return ONLY a valid JSON array of exactly 20 strings. No explanations, no markdown, just the JSON array.`;
  
  let userPrompt = `Generate 20 specific, long-tail AI search queries for the ${keyword} industry${location !== "nationwide" ? ` in ${location}` : ""}.

IMPORTANT:
- Each query should explicitly request a LIST of specific business names (e.g., "List 3 companies", "Name 5 businesses", "Which companies do you recommend")
- Include queries for specific services that are RELEVANT TO ${keyword.toUpperCase()} - NOT services from other industries
- NO brand names in the queries themselves, but queries should request brand names in the response
- Avoid vague queries like "best ${keyword}" - use "Give me the top 3 ${keyword} companies" instead`;
  
  if (homepageContent) {
    userPrompt += `

Here is homepage content for context about typical services in this industry (but DO NOT use the company name):
${homepageContent}`;
  }
  
  try {
    console.log("Generating research prompts with GPT-4o...");
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      max_tokens: 2048,
    });
    
    const text = response.choices[0]?.message?.content || "";
    console.log("OpenAI research prompts response:", text.slice(0, 200));
    
    const cleanText = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(cleanText);
    
    if (Array.isArray(parsed)) {
      const validPrompts = parsed
        .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        .map(s => s.trim())
        .slice(0, 20);
      
      if (validPrompts.length === 20) {
        console.log(`Generated 20 valid research prompts`);
        return validPrompts;
      } else {
        console.log(`OpenAI returned ${validPrompts.length} valid prompts (need 20), using fallback`);
      }
    }
  } catch (error) {
    console.error("Research prompt generation error:", error);
  }
  
  console.log("Using fallback research prompts");
  return getFallbackResearchPrompts(keyword, location);
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
    console.log("Generating sentiment prompts with GPT-4o...");
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      max_tokens: 512,
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

export async function generateServiceGroups(
  businessName: string,
  industry: string,
  scope: string,
  city?: string
): Promise<{ name: string; description: string }[]> {
  try {
    const locationContext = scope === "local" && city ? ` in ${city}` : "";
    
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You are an expert marketing strategist. Generate 3-5 service/product groups for a business that represent their main offerings. Each group should represent a distinct category of services or products the business offers.

Return your response as a JSON array with objects containing "name" and "description" fields.
Example format:
[
  {"name": "HVAC Repair", "description": "Emergency and routine heating and cooling system repairs"},
  {"name": "HVAC Installation", "description": "New system installations and replacements"}
]`
        },
        {
          role: "user",
          content: `Generate service/product groups for "${businessName}", a ${industry} business${locationContext}. 

Consider the typical services and products that a ${industry} company would offer. Return 3-5 distinct groups that cover their main offerings.`
        }
      ],
      temperature: 0.7,
      response_format: { type: "json_object" }
    });

    const content = response.choices[0]?.message?.content || "{}";
    const parsed = JSON.parse(content);
    
    // Handle different response formats
    const groups = Array.isArray(parsed) ? parsed : (parsed.groups || parsed.categories || []);
    
    if (groups.length === 0) {
      // Return default groups based on industry
      return [
        { name: "Core Services", description: `Primary ${industry} services offered` },
        { name: "Specialty Services", description: `Specialized ${industry} solutions` },
        { name: "Maintenance & Support", description: `Ongoing support and maintenance services` }
      ];
    }
    
    return groups;
  } catch (error) {
    console.error("Error generating service groups:", error);
    // Return fallback groups
    return [
      { name: "Core Services", description: `Primary ${industry} services offered` },
      { name: "Specialty Services", description: `Specialized ${industry} solutions` },
      { name: "Maintenance & Support", description: `Ongoing support and maintenance services` }
    ];
  }
}

export async function generatePromptsForGroups(
  businessName: string,
  domain: string,
  industry: string,
  scope: string,
  city: string | undefined,
  groups: { name: string; description: string }[]
): Promise<{ groupName: string; prompts: string[] }[]> {
  try {
    const locationContext = scope === "local" && city ? ` in ${city}` : "";
    
    const groupsList = groups.map(g => `- ${g.name}: ${g.description}`).join("\n");
    
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You are an expert SEO and AI visibility strategist. Generate search prompts that potential customers might use when looking for services in each category. These prompts will be used to test how visible the business is in AI assistants like ChatGPT and Google AI.

Generate exactly 20 prompts for EACH group. Prompts should:
1. Be natural questions a customer would ask an AI assistant
2. Include local variations if relevant (e.g., "in [city]")
3. Cover different intent types: informational, transactional, comparison
4. Include both general and specific queries
5. Vary between asking for recommendations, comparisons, and specific information

Return your response as a JSON object with a "prompts" array containing objects with "groupName" and "prompts" (array of 20 strings) fields.`
        },
        {
          role: "user",
          content: `Generate 20 search prompts for each service group for "${businessName}", a ${industry} business${locationContext}.

Service Groups:
${groupsList}

For each group, create 20 prompts that potential customers would ask AI assistants. Make sure the prompts are realistic and cover various search intents.`
        }
      ],
      temperature: 0.8,
      response_format: { type: "json_object" }
    });

    const content = response.choices[0]?.message?.content || "{}";
    const parsed = JSON.parse(content);
    
    // Handle different response formats
    const promptGroups = parsed.prompts || parsed.groups || [];
    
    if (promptGroups.length === 0) {
      // Generate fallback prompts for each group
      return groups.map(group => ({
        groupName: group.name,
        prompts: generateFallbackPrompts(group.name, industry, locationContext, 20)
      }));
    }
    
    // Ensure each group has exactly 20 prompts
    return promptGroups.map((pg: { groupName: string; prompts: string[] }) => ({
      groupName: pg.groupName,
      prompts: pg.prompts.slice(0, 20).concat(
        pg.prompts.length < 20 
          ? generateFallbackPrompts(pg.groupName, industry, locationContext, 20 - pg.prompts.length)
          : []
      )
    }));
  } catch (error) {
    console.error("Error generating prompts:", error);
    // Return fallback prompts for each group
    return groups.map(group => ({
      groupName: group.name,
      prompts: generateFallbackPrompts(group.name, industry, "", 20)
    }));
  }
}

function generateFallbackPrompts(groupName: string, industry: string, location: string, count: number): string[] {
  const templates = [
    `Best ${groupName.toLowerCase()} services${location}`,
    `Who offers ${groupName.toLowerCase()}${location}?`,
    `Top rated ${groupName.toLowerCase()} companies${location}`,
    `${groupName} near me`,
    `How much does ${groupName.toLowerCase()} cost?`,
    `Recommended ${groupName.toLowerCase()} providers${location}`,
    `${groupName} reviews and ratings`,
    `Professional ${groupName.toLowerCase()} services`,
    `Affordable ${groupName.toLowerCase()}${location}`,
    `Compare ${groupName.toLowerCase()} services`,
    `${groupName} specialists${location}`,
    `Best ${industry} company for ${groupName.toLowerCase()}`,
    `${groupName} experts near me`,
    `Quality ${groupName.toLowerCase()} providers`,
    `Emergency ${groupName.toLowerCase()} services${location}`,
    `${groupName} consultation`,
    `${groupName} pricing and quotes`,
    `Local ${groupName.toLowerCase()} businesses`,
    `${groupName} service options`,
    `${groupName} recommendations`
  ];
  
  return templates.slice(0, count);
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

// Helper function to query OpenAI/ChatGPT for monitoring
async function queryOpenAI(prompt: string, businessName: string, domain: string): Promise<{ found: boolean; response: string; cited: boolean; competitors: string[] }> {
  try {
    const result = await queryChatGPT(prompt, businessName, domain);
    return {
      found: result.found,
      response: result.response,
      cited: result.response.toLowerCase().includes(domain.toLowerCase()),
      competitors: result.competitors,
    };
  } catch (error) {
    console.error("queryOpenAI error:", error);
    return { found: false, response: "Error querying ChatGPT", cited: false, competitors: [] };
  }
}

// Helper function to query Google AI/Gemini for monitoring
async function queryGoogleAI(prompt: string, businessName: string, domain: string): Promise<{ found: boolean; response: string; cited: boolean; competitors: string[] }> {
  try {
    const result = await queryGemini(prompt, businessName, domain);
    return {
      found: result.found,
      response: result.response,
      cited: result.response.toLowerCase().includes(domain.toLowerCase()),
      competitors: result.competitors,
    };
  } catch (error) {
    console.error("queryGoogleAI error:", error);
    return { found: false, response: "Error querying Google AI", cited: false, competitors: [] };
  }
}

export async function runPromptCheck(
  prompt: string,
  businessName: string,
  domain: string
): Promise<PromptCheckResult> {
  try {
    // Run both checks in parallel
    const [chatgptResult, googleAIResult] = await Promise.all([
      queryOpenAI(prompt, businessName, domain),
      queryGoogleAI(prompt, businessName, domain)
    ]);
    
    // Collect competitors from both results
    const allCompetitors = [...chatgptResult.competitors, ...googleAIResult.competitors];
    const uniqueCompetitors = [...new Set(allCompetitors)].filter(c => 
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
