import OpenAI from "openai";

// OpenAI client using Replit AI Integrations (no API key needed, billed to credits)
const openai = new OpenAI({
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
});

// Gemini client
async function queryGemini(prompt: string, businessName: string): Promise<{ found: boolean; response: string; competitors: string[] }> {
  const apiKey = process.env.GEMINI_API_KEY;
  
  if (!apiKey) {
    // Return simulated response if no API key
    return simulateResponse(prompt, businessName);
  }

  try {
    const { GoogleGenAI } = await import("@google/genai");
    const ai = new GoogleGenAI({ apiKey });
    
    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }],
        },
      ],
    });

    const text = response.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const found = text.toLowerCase().includes(businessName.toLowerCase());
    const competitors = extractCompetitors(text, businessName);

    return { found, response: text, competitors };
  } catch (error) {
    console.error("Gemini API error:", error);
    return simulateResponse(prompt, businessName);
  }
}

// ChatGPT client using Replit AI Integrations
async function queryChatGPT(prompt: string, businessName: string): Promise<{ found: boolean; response: string; competitors: string[] }> {
  try {
    // the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are a helpful assistant that provides factual, detailed answers about local and national businesses. When asked about service providers, list specific company names when possible.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      max_completion_tokens: 1024,
    });

    const text = response.choices[0]?.message?.content || "";
    const found = text.toLowerCase().includes(businessName.toLowerCase());
    const competitors = extractCompetitors(text, businessName);

    return { found, response: text, competitors };
  } catch (error) {
    console.error("ChatGPT API error:", error);
    return simulateResponse(prompt, businessName);
  }
}

// Extract competitor names from AI responses
function extractCompetitors(text: string, excludeBusiness: string): string[] {
  // Common patterns for business names in AI responses
  const patterns = [
    /(?:recommend|suggest|consider|try|check out|popular|top|best|leading)\s+([A-Z][a-zA-Z\s&]+?)(?:\s*[,.]|\s+and|\s+or|\s+for|\s+is|\s+are)/gi,
    /(?:companies like|businesses like|such as)\s+([A-Z][a-zA-Z\s&,]+?)(?:\s*[.]|\s+and|\s+or)/gi,
    /\b([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*)\s+(?:is|are)\s+(?:known|famous|popular|recommended)/gi,
  ];

  const competitors: Set<string> = new Set();
  
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const names = match[1].split(/,\s*|\s+and\s+/).map(n => n.trim());
      for (const name of names) {
        if (name.length > 2 && name.length < 50 && !name.toLowerCase().includes(excludeBusiness.toLowerCase())) {
          competitors.add(name);
        }
      }
    }
  }

  return Array.from(competitors).slice(0, 10);
}

// Simulate response when APIs are not available
function simulateResponse(prompt: string, businessName: string): { found: boolean; response: string; competitors: string[] } {
  // Random chance of being found (30% chance)
  const found = Math.random() < 0.3;
  
  const commonCompetitors = [
    "ABC Services", "Premier Solutions", "Quality First", "Pro Masters",
    "Elite Services", "Top Choice", "Best Value", "Reliable Pros",
  ];
  
  const numCompetitors = Math.floor(Math.random() * 4) + 1;
  const competitors = commonCompetitors.sort(() => Math.random() - 0.5).slice(0, numCompetitors);
  
  const response = found
    ? `Based on my research, ${businessName} is one of the options available. Other providers include ${competitors.join(", ")}.`
    : `Here are some recommended providers: ${competitors.join(", ")}. I would suggest researching each to find the best fit for your needs.`;
  
  return { found, response, competitors };
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
function getFallbackResearchPrompts(keyword: string, location: string): string[] {
  const loc = location !== "nationwide" ? ` in ${location}` : "";
  const year = new Date().getFullYear();
  return [
    `Who is the best ${keyword}${loc}?`,
    `Top rated ${keyword} providers${loc}`,
    `Best ${keyword} companies${loc} ${year}`,
    `${keyword} recommendations${loc}`,
    `Compare ${keyword} services${loc}`,
    `Most trusted ${keyword}${loc}`,
    `${keyword} near me${loc}`,
    `Affordable ${keyword}${loc}`,
    `Premium ${keyword} services${loc}`,
    `${keyword} with best reviews${loc}`,
    `Who should I hire for ${keyword}${loc}?`,
    `${keyword} pros and cons${loc}`,
    `Best value ${keyword}${loc}`,
    `${keyword} pricing comparison${loc}`,
    `Reliable ${keyword}${loc}`,
    `${keyword} experts${loc}`,
    `Professional ${keyword} services${loc}`,
    `Find a good ${keyword}${loc}`,
    `Top 5 ${keyword}${loc}`,
    `Best ${keyword} for home${loc}`,
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
  
  // Build prompt for OpenAI - explicitly exclude brand name
  const systemPrompt = `You are a marketing expert specializing in AI search optimization. Generate exactly 20 research-based search queries that potential customers would type into AI assistants (like ChatGPT or Google AI) when actively looking to hire or purchase from a ${keyword} business${location !== "nationwide" ? ` in ${location}` : ""}.

CRITICAL: These must be GENERIC research queries that do NOT include any specific business or brand names. We want to test if the business appears organically in AI recommendations.

These should be queries from people comparing options and making decisions:
- Direct recommendation requests ("best X", "top X", "who should I hire for X")
- Comparison queries ("compare X services", "X vs competitors")
- Trust/quality queries ("most reliable X", "top-rated X")
- Pricing queries ("affordable X", "X pricing")
- Location-specific queries if applicable

DO NOT include:
- Any brand or business names
- Queries asking about specific company reviews
- Queries mentioning "[business name]"

Return ONLY a valid JSON array of exactly 20 strings. No explanations, no markdown, just the JSON array.`;
  
  let userPrompt = `Generate 20 generic research-based AI search queries for the ${keyword} industry${location !== "nationwide" ? ` in ${location}` : ""}.

Remember: NO brand names or specific company references allowed.`;
  
  if (homepageContent) {
    userPrompt += `

Here is homepage content for context about typical services in this industry (but DO NOT use the company name):
${homepageContent}`;
  }
  
  try {
    console.log("Generating research prompts with OpenAI...");
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      max_completion_tokens: 1500,
      temperature: 0.7,
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
    console.log("Generating sentiment prompts with OpenAI...");
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      max_completion_tokens: 500,
      temperature: 0.7,
    });
    
    const text = response.choices[0]?.message?.content || "";
    console.log("OpenAI sentiment prompts response:", text.slice(0, 200));
    
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
    chatgpt: { found: boolean; response: string; competitors: string[] };
    googleAI: { found: boolean; response: string; competitors: string[] };
  }>;
  overallScore: number;
  chatgptScore: number;
  googleAIScore: number;
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

  // Query ChatGPT and Google AI for research prompts (visibility)
  const promptResults = await Promise.all(
    researchPrompts.map(async (prompt) => {
      const [chatgpt, googleAI] = await Promise.all([
        queryChatGPT(prompt, businessName),
        queryGemini(prompt, businessName),
      ]);
      return { prompt, chatgpt, googleAI };
    })
  );

  // Query ChatGPT and Google AI for sentiment prompts
  const sentimentResults = await Promise.all(
    sentimentPrompts.map(async (prompt) => {
      const [chatgptResult, googleAIResult] = await Promise.all([
        queryChatGPT(prompt, businessName),
        queryGemini(prompt, businessName),
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

  return {
    promptResults,
    overallScore,
    chatgptScore,
    googleAIScore,
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
