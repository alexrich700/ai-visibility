import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

interface TestResult {
  model: string;
  prompt: string;
  found: boolean;
  responseLength: number;
  responsePreview: string;
  citedUrls: string[];
  error?: string;
  durationMs: number;
}

// Test data - using a real-ish business scenario
const TEST_BUSINESS = {
  name: "Baker Brothers Plumbing",
  url: "bakerbrothersplumbing.com",
  location: "Dallas, TX"
};

const TEST_PROMPTS = [
  `Who are the best plumbers in Dallas, Texas?`,
  `I need an emergency plumber in Dallas TX. Who do you recommend?`,
  `What plumbing companies in Dallas have good reviews?`
];

// Extract URLs from text
function extractUrls(text: string): string[] {
  const urlPattern = /https?:\/\/(?:www\.)?([a-zA-Z0-9][-a-zA-Z0-9]*(?:\.[a-zA-Z0-9][-a-zA-Z0-9]*)+)(?:\/[^\s\)>\]"']*)?/gi;
  const matches = text.match(urlPattern) || [];
  return [...new Set(matches)];
}

// Check if business is mentioned
function checkMention(text: string, businessName: string, domain: string): boolean {
  const lowerText = text.toLowerCase();
  const lowerName = businessName.toLowerCase();
  const lowerDomain = domain.toLowerCase();
  
  return lowerText.includes(lowerName) || 
         lowerText.includes(lowerDomain) ||
         lowerText.includes(lowerName.replace(/\s+/g, ''));
}

async function testModel(model: string, prompt: string, business: typeof TEST_BUSINESS): Promise<TestResult> {
  const startTime = Date.now();
  
  try {
    const webSearchTool: Record<string, any> = { 
      type: "web_search",
      user_location: {
        type: "approximate",
        country: "US",
        city: business.location.split(',')[0].trim(),
        region: business.location.split(',')[1]?.trim() || "TX"
      }
    };
    
    const response = await openai.responses.create({
      model: model,
      tools: [webSearchTool],
      instructions: "You are a helpful assistant that provides factual, detailed answers about local businesses. When asked about service providers, list specific company names with their website URLs when possible.",
      input: prompt
    } as any);

    const text = (response as any).output_text || "";
    const duration = Date.now() - startTime;
    
    return {
      model,
      prompt,
      found: checkMention(text, business.name, business.url),
      responseLength: text.length,
      responsePreview: text.slice(0, 400).replace(/\n/g, ' '),
      citedUrls: extractUrls(text).slice(0, 10),
      durationMs: duration
    };
  } catch (error: any) {
    return {
      model,
      prompt,
      found: false,
      responseLength: 0,
      responsePreview: "",
      citedUrls: [],
      error: error.message,
      durationMs: Date.now() - startTime
    };
  }
}

async function runComparison() {
  console.log("=".repeat(80));
  console.log("MODEL COMPARISON TEST: GPT-5.2 vs GPT-4o with web_search grounding");
  console.log("=".repeat(80));
  console.log(`\nTest Business: ${TEST_BUSINESS.name}`);
  console.log(`Domain: ${TEST_BUSINESS.url}`);
  console.log(`Location: ${TEST_BUSINESS.location}`);
  console.log(`\nRunning ${TEST_PROMPTS.length} prompts per model...`);
  console.log("\n");

  const models = ["gpt-5.2", "gpt-4o"];
  const results: TestResult[] = [];

  for (const prompt of TEST_PROMPTS) {
    console.log("-".repeat(80));
    console.log(`PROMPT: "${prompt}"`);
    console.log("-".repeat(80));
    
    for (const model of models) {
      console.log(`\nTesting ${model}...`);
      const result = await testModel(model, prompt, TEST_BUSINESS);
      results.push(result);
      
      if (result.error) {
        console.log(`  ERROR: ${result.error}`);
      } else {
        console.log(`  Duration: ${result.durationMs}ms`);
        console.log(`  Business Found: ${result.found ? "YES" : "NO"}`);
        console.log(`  Response Length: ${result.responseLength} chars`);
        console.log(`  URLs Cited: ${result.citedUrls.length}`);
        if (result.citedUrls.length > 0) {
          console.log(`  Top URLs: ${result.citedUrls.slice(0, 3).join(', ')}`);
        }
        console.log(`  Preview: ${result.responsePreview.slice(0, 200)}...`);
      }
    }
    console.log("\n");
  }

  // Summary
  console.log("=".repeat(80));
  console.log("SUMMARY");
  console.log("=".repeat(80));
  
  for (const model of models) {
    const modelResults = results.filter(r => r.model === model);
    const foundCount = modelResults.filter(r => r.found).length;
    const errorCount = modelResults.filter(r => r.error).length;
    const avgDuration = modelResults.reduce((sum, r) => sum + r.durationMs, 0) / modelResults.length;
    const avgResponseLength = modelResults.filter(r => !r.error).reduce((sum, r) => sum + r.responseLength, 0) / (modelResults.length - errorCount);
    const avgCitedUrls = modelResults.filter(r => !r.error).reduce((sum, r) => sum + r.citedUrls.length, 0) / (modelResults.length - errorCount);
    
    console.log(`\n${model}:`);
    console.log(`  Found rate: ${foundCount}/${modelResults.length} (${((foundCount/modelResults.length)*100).toFixed(0)}%)`);
    console.log(`  Errors: ${errorCount}`);
    console.log(`  Avg duration: ${avgDuration.toFixed(0)}ms`);
    console.log(`  Avg response length: ${avgResponseLength.toFixed(0)} chars`);
    console.log(`  Avg URLs cited: ${avgCitedUrls.toFixed(1)}`);
  }
  
  console.log("\n" + "=".repeat(80));
  console.log("Test complete!");
}

runComparison().catch(console.error);
