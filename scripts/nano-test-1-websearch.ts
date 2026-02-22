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

const prompt = "Who are the best digital marketing agencies in Dallas, Texas? List specific company names and their websites.";
const model = process.argv[2] || "gpt-5-mini";

async function main() {
  console.log(`\n=== ${model.toUpperCase()} — Responses API + web_search ===`);
  console.log(`Prompt: "${prompt}"\n`);

  const webSearchTool: Record<string, any> = {
    type: "web_search",
    user_location: {
      type: "approximate",
      country: "US",
      city: "Dallas",
      region: "TX",
    },
  };

  const start = Date.now();
  const response = await openai.responses.create({
    model,
    tools: [webSearchTool],
    instructions: "You are a helpful assistant that provides factual, detailed answers about local and national businesses. When asked about service providers, list specific company names with their website URLs when possible. At the end of your response, provide a clean bullet list of just the business names you mentioned (no ratings, reviews, hours, or other details).",
    input: prompt,
  } as any);

  const elapsed = Date.now() - start;
  const text = (response as any).output_text || "";
  const usage = (response as any).usage;
  const inputTokens = usage?.input_tokens || 0;
  const outputTokens = usage?.output_tokens || 0;

  console.log(`Time: ${elapsed}ms`);
  console.log(`Tokens: ${inputTokens} in + ${outputTokens} out = ${inputTokens + outputTokens}`);
  console.log(`Cost: ${estimateCost(model, inputTokens, outputTokens)}`);
  console.log(`Response length: ${text.length} chars\n`);
  console.log("--- RESPONSE ---");
  console.log(text.slice(0, 2000));
  if (text.length > 2000) console.log(`\n... (${text.length - 2000} more chars)`);
  console.log("--- END ---\n");
}

main().catch(console.error);
