import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.MY_OPENAI_API_KEY });

const MODELS = ["gpt-5-mini", "gpt-5-nano"] as const;

// ============================================
// TEST 1: Responses API + web_search + location grounding
// (This is what runPromptCheck / queryChatGPT uses for visibility checking)
// ============================================

const VISIBILITY_PROMPTS = [
  {
    prompt: "Who are the best digital marketing agencies in Dallas, Texas? List specific company names and their websites.",
    location: { city: "Dallas", region: "TX" },
  },
];

// ============================================
// TEST 2: Chat Completions for prompt generation
// (This is what generateResearchPrompts uses)
// ============================================

const PROMPT_GEN_SYSTEM = `You are a marketing expert specializing in AI search optimization. Generate exactly 5 unique research-based search queries that potential customers would type into AI assistants (like ChatGPT or Google AI) when actively looking for digital marketing services in Dallas, TX.

CRITICAL REQUIREMENTS:
1. These must be GENERIC research queries that do NOT include any specific business or brand names
2. Each query MUST explicitly ask for SPECIFIC BUSINESS NAMES to be listed
3. Use long-tail, specific queries that will trigger AI to list actual company names
4. Each query must be UNIQUE and different from the others

Return ONLY a valid JSON array of exactly 5 strings. No explanations, no markdown, just the JSON array.`;

const PROMPT_GEN_USER = `Generate 5 unique, specific, long-tail AI search queries for digital marketing services in Dallas, TX.

IMPORTANT:
- Each query must be UNIQUE - do not repeat similar phrasing
- Each query should explicitly request a LIST of specific business names
- NO brand names in the queries themselves
- Include variety: transactional, comparison, emergency, cost-focused, quality-focused queries`;

async function testVisibilityCheck(model: string, prompt: string, location: { city: string; region: string }) {
  const webSearchTool: Record<string, any> = {
    type: "web_search",
    user_location: {
      type: "approximate",
      country: "US",
      city: location.city,
      region: location.region,
    },
  };

  const start = Date.now();
  try {
    const response = await openai.responses.create({
      model,
      tools: [webSearchTool],
      instructions: "You are a helpful assistant that provides factual, detailed answers about local and national businesses. When asked about service providers, list specific company names with their website URLs when possible. At the end of your response, provide a clean bullet list of just the business names you mentioned (no ratings, reviews, hours, or other details).",
      input: prompt,
    } as any);

    const elapsed = Date.now() - start;
    const text = (response as any).output_text || "";
    const usage = (response as any).usage;

    return {
      model,
      elapsed,
      textLength: text.length,
      text: text.slice(0, 1500),
      inputTokens: usage?.input_tokens || 0,
      outputTokens: usage?.output_tokens || 0,
      totalTokens: (usage?.input_tokens || 0) + (usage?.output_tokens || 0),
    };
  } catch (error: any) {
    return {
      model,
      elapsed: Date.now() - start,
      textLength: 0,
      text: `ERROR: ${error.message}`,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
    };
  }
}

async function testPromptGeneration(model: string) {
  const start = Date.now();
  try {
    const response = await openai.chat.completions.create({
      model,
      messages: [
        { role: "system", content: PROMPT_GEN_SYSTEM },
        { role: "user", content: PROMPT_GEN_USER },
      ],
      max_completion_tokens: 2048,
    });

    const elapsed = Date.now() - start;
    const text = response.choices[0]?.message?.content || "";
    const usage = response.usage;

    let parsedPrompts: string[] = [];
    try {
      const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      parsedPrompts = JSON.parse(cleaned);
    } catch {
      parsedPrompts = [];
    }

    return {
      model,
      elapsed,
      text,
      parsedPrompts,
      promptCount: parsedPrompts.length,
      inputTokens: usage?.prompt_tokens || 0,
      outputTokens: usage?.completion_tokens || 0,
      totalTokens: usage?.total_tokens || 0,
    };
  } catch (error: any) {
    return {
      model,
      elapsed: Date.now() - start,
      text: `ERROR: ${error.message}`,
      parsedPrompts: [],
      promptCount: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
    };
  }
}

// Pricing per 1M tokens
const PRICING: Record<string, { input: number; output: number }> = {
  "gpt-5-mini": { input: 0.25, output: 2.0 },
  "gpt-5-nano": { input: 0.05, output: 0.4 },
};

function estimateCost(model: string, inputTokens: number, outputTokens: number): string {
  const p = PRICING[model];
  if (!p) return "N/A";
  const cost = (inputTokens / 1_000_000) * p.input + (outputTokens / 1_000_000) * p.output;
  return `$${cost.toFixed(6)}`;
}

async function main() {
  console.log("=".repeat(100));
  console.log("GPT-5-MINI vs GPT-5-NANO COMPARISON TEST");
  console.log("=".repeat(100));

  // ---- TEST 1: Visibility Checking (Responses API + web_search) ----
  console.log("\n" + "=".repeat(100));
  console.log("TEST 1: VISIBILITY CHECKING (Responses API + web_search + location grounding)");
  console.log("=".repeat(100));

  for (const testCase of VISIBILITY_PROMPTS) {
    console.log(`\n${"─".repeat(80)}`);
    console.log(`PROMPT: "${testCase.prompt}"`);
    console.log(`LOCATION: ${testCase.location.city}, ${testCase.location.region}`);
    console.log(`${"─".repeat(80)}`);

    // Run both models sequentially to avoid rate limits
    const results = [];
    for (const model of MODELS) {
      console.log(`\n  Running ${model}...`);
      const result = await testVisibilityCheck(model, testCase.prompt, testCase.location);
      results.push(result);
    }

    for (const r of results) {
      const cost = estimateCost(r.model, r.inputTokens, r.outputTokens);
      console.log(`\n  ┌── ${r.model.toUpperCase()} ──`);
      console.log(`  │ Time: ${r.elapsed}ms | Tokens: ${r.inputTokens} in + ${r.outputTokens} out = ${r.totalTokens} | Cost: ${cost}`);
      console.log(`  │ Response length: ${r.textLength} chars`);
      console.log(`  │`);
      // Show first 1200 chars of response
      const lines = r.text.slice(0, 1200).split("\n");
      for (const line of lines) {
        console.log(`  │ ${line}`);
      }
      if (r.textLength > 1200) {
        console.log(`  │ ... (${r.textLength - 1200} more chars)`);
      }
      console.log(`  └──`);
    }

    // Summary comparison
    if (results.length === 2 && results[0].elapsed > 0 && results[1].elapsed > 0) {
      const speedup = ((results[0].elapsed - results[1].elapsed) / results[0].elapsed * 100).toFixed(1);
      const cost0 = estimateCost(results[0].model, results[0].inputTokens, results[0].outputTokens);
      const cost1 = estimateCost(results[1].model, results[1].inputTokens, results[1].outputTokens);
      console.log(`\n  COMPARISON: nano is ${speedup}% ${Number(speedup) > 0 ? 'faster' : 'slower'} | mini cost: ${cost0} vs nano cost: ${cost1}`);
    }

    // Small delay between prompts
    await new Promise(r => setTimeout(r, 1500));
  }

  // ---- TEST 2: Prompt Generation (Chat Completions) ----
  console.log("\n\n" + "=".repeat(100));
  console.log("TEST 2: PROMPT GENERATION (Chat Completions API)");
  console.log("=".repeat(100));

  const promptGenResults = [];
  for (const model of MODELS) {
    console.log(`\n  Running ${model}...`);
    const result = await testPromptGeneration(model);
    promptGenResults.push(result);
  }

  for (const r of promptGenResults) {
    const cost = estimateCost(r.model, r.inputTokens, r.outputTokens);
    console.log(`\n  ┌── ${r.model.toUpperCase()} ──`);
    console.log(`  │ Time: ${r.elapsed}ms | Tokens: ${r.inputTokens} in + ${r.outputTokens} out = ${r.totalTokens} | Cost: ${cost}`);
    console.log(`  │ Parsed ${r.promptCount} prompts successfully`);
    console.log(`  │`);
    if (r.parsedPrompts.length > 0) {
      r.parsedPrompts.forEach((p: string, i: number) => {
        console.log(`  │ ${i + 1}. "${p}"`);
      });
    } else {
      console.log(`  │ Raw: ${r.text.slice(0, 500)}`);
    }
    console.log(`  └──`);
  }

  if (promptGenResults.length === 2) {
    const speedup = ((promptGenResults[0].elapsed - promptGenResults[1].elapsed) / promptGenResults[0].elapsed * 100).toFixed(1);
    console.log(`\n  COMPARISON: nano is ${speedup}% ${Number(speedup) > 0 ? 'faster' : 'slower'}`);
  }

  // ---- FINAL SUMMARY ----
  console.log("\n\n" + "=".repeat(100));
  console.log("FINAL SUMMARY");
  console.log("=".repeat(100));
  console.log("\nPricing (per 1M tokens):");
  console.log("  gpt-5-mini:  $0.25 input / $2.00 output");
  console.log("  gpt-5-nano:  $0.05 input / $0.40 output");
  console.log("  Savings:     5x cheaper input, 5x cheaper output");
  console.log("\ngpt-5-nano supports: Responses API, web_search, function calling, structured outputs");
  console.log("=".repeat(100));
}

main().catch(console.error);
