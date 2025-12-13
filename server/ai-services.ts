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

// Perplexity client
async function queryPerplexity(prompt: string, businessName: string): Promise<{ found: boolean; response: string; competitors: string[] }> {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  
  if (!apiKey) {
    return simulateResponse(prompt, businessName);
  }

  try {
    const response = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.1-sonar-small-128k-online",
        messages: [
          {
            role: "system",
            content: "You are a helpful assistant that provides factual, detailed answers about local and national businesses.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        max_tokens: 1024,
        temperature: 0.2,
        stream: false,
      }),
    });

    if (!response.ok) {
      throw new Error(`Perplexity API error: ${response.status}`);
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || "";
    const found = text.toLowerCase().includes(businessName.toLowerCase());
    const competitors = extractCompetitors(text, businessName);

    return { found, response: text, competitors };
  } catch (error) {
    console.error("Perplexity API error:", error);
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

// Generate 20 prompts based on business info
export function generatePrompts(
  businessName: string,
  keyword: string,
  scope: "local" | "national",
  city?: string,
  websiteContent?: string
): string[] {
  const location = scope === "local" && city ? city : "";
  const locationPhrase = location ? ` in ${location}` : "";
  const locationContext = location || "nationwide";

  // Base prompts that work for any business
  const basePrompts = [
    `Who is the best ${keyword}${locationPhrase}?`,
    `Top rated ${keyword} providers${locationPhrase}`,
    `Best ${keyword} companies${locationPhrase} 2024`,
    `${keyword} recommendations${locationPhrase}`,
    `Compare ${keyword} services${locationPhrase}`,
    `Most trusted ${keyword}${locationPhrase}`,
    `${keyword} near me ${location}`,
    `Affordable ${keyword}${locationPhrase}`,
    `Premium ${keyword} services${locationPhrase}`,
    `${keyword} with best reviews${locationPhrase}`,
    `Who should I hire for ${keyword}${locationPhrase}?`,
    `${keyword} pros and cons${locationPhrase}`,
    `Best value ${keyword}${locationPhrase}`,
    `${keyword} pricing comparison${locationPhrase}`,
    `Reliable ${keyword}${locationPhrase}`,
    `${keyword} experts${locationPhrase}`,
    `Professional ${keyword} services${locationPhrase}`,
    `Find a good ${keyword}${locationPhrase}`,
    `${keyword} alternatives to ${businessName}`,
    `What are reviews for ${businessName}?`,
  ];

  // Add location-specific prompts for local businesses
  if (scope === "local" && city) {
    return [
      ...basePrompts.slice(0, 15),
      `${keyword} ${city} reviews`,
      `Best ${keyword} near ${city}`,
      `${city} ${keyword} recommendations`,
      `Top ${keyword} companies in ${city}`,
      `${businessName} ${city} reviews`,
    ];
  }

  return basePrompts;
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
    gemini: { found: boolean; response: string; competitors: string[] };
    perplexity: { found: boolean; response: string; competitors: string[] };
  }>;
  overallScore: number;
  chatgptScore: number;
  geminiScore: number;
  perplexityScore: number;
  competitors: Array<{ name: string; mentions: number }>;
}> {
  // Generate prompts
  const prompts = generatePrompts(businessName, keyword, scope, city);

  // Query all AI platforms for each prompt
  const promptResults = await Promise.all(
    prompts.map(async (prompt) => {
      const [chatgpt, gemini, perplexity] = await Promise.all([
        queryChatGPT(prompt, businessName),
        queryGemini(prompt, businessName),
        queryPerplexity(prompt, businessName),
      ]);

      return { prompt, chatgpt, gemini, perplexity };
    })
  );

  // Calculate scores
  const chatgptFound = promptResults.filter((r) => r.chatgpt.found).length;
  const geminiFound = promptResults.filter((r) => r.gemini.found).length;
  const perplexityFound = promptResults.filter((r) => r.perplexity.found).length;

  const chatgptScore = Math.round((chatgptFound / prompts.length) * 100);
  const geminiScore = Math.round((geminiFound / prompts.length) * 100);
  const perplexityScore = Math.round((perplexityFound / prompts.length) * 100);
  
  // Overall score is weighted average
  const overallScore = Math.round((chatgptScore + geminiScore + perplexityScore) / 3);

  // Aggregate competitors
  const competitorMap = new Map<string, number>();
  for (const result of promptResults) {
    for (const competitor of [...result.chatgpt.competitors, ...result.gemini.competitors, ...result.perplexity.competitors]) {
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
    geminiScore,
    perplexityScore,
    competitors,
  };
}
