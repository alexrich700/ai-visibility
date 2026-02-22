import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.MY_OPENAI_API_KEY });

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

const model = process.argv[2] || "gpt-5-mini";

const systemPrompt = `You are a marketing expert specializing in AI search optimization. Generate exactly 5 unique research-based search queries that potential customers would type into AI assistants (like ChatGPT or Google AI) when actively looking for digital marketing services in Dallas, TX.

CRITICAL REQUIREMENTS:
1. These must be GENERIC research queries that do NOT include any specific business or brand names
2. Each query MUST explicitly ask for SPECIFIC BUSINESS NAMES to be listed
3. Use long-tail, specific queries that will trigger AI to list actual company names
4. Each query must be UNIQUE and different from the others

Return ONLY a valid JSON array of exactly 5 strings. No explanations, no markdown, just the JSON array.`;

const userPrompt = `Generate 5 unique, specific, long-tail AI search queries for digital marketing services in Dallas, TX.

IMPORTANT:
- Each query must be UNIQUE - do not repeat similar phrasing
- Each query should explicitly request a LIST of specific business names
- NO brand names in the queries themselves
- Include variety: transactional, comparison, emergency, cost-focused, quality-focused queries`;

async function main() {
  console.log(`\n=== ${model.toUpperCase()} — Chat Completions (Prompt Generation) ===\n`);

  const start = Date.now();
  const response = await openai.chat.completions.create({
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    max_completion_tokens: 2048,
  });

  const elapsed = Date.now() - start;
  const text = response.choices[0]?.message?.content || "";
  const usage = response.usage;
  const inputTokens = usage?.prompt_tokens || 0;
  const outputTokens = usage?.completion_tokens || 0;

  console.log(`Time: ${elapsed}ms`);
  console.log(`Tokens: ${inputTokens} in + ${outputTokens} out = ${inputTokens + outputTokens}`);
  console.log(`Cost: ${estimateCost(model, inputTokens, outputTokens)}`);

  let parsedPrompts: string[] = [];
  try {
    const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    parsedPrompts = JSON.parse(cleaned);
  } catch {
    parsedPrompts = [];
  }

  console.log(`Parsed ${parsedPrompts.length} prompts successfully\n`);

  if (parsedPrompts.length > 0) {
    parsedPrompts.forEach((p, i) => {
      console.log(`  ${i + 1}. "${p}"`);
    });
  } else {
    console.log(`Raw output:\n${text}`);
  }
  console.log("");
}

main().catch(console.error);
