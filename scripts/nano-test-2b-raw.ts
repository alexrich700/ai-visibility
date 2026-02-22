import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.MY_OPENAI_API_KEY });
const model = process.argv[2] || "gpt-5-nano";

const systemPrompt = `You are a marketing expert specializing in AI search optimization. Generate exactly 5 unique research-based search queries that potential customers would type into AI assistants (like ChatGPT or Google AI) when actively looking for digital marketing services in Dallas, TX.

CRITICAL REQUIREMENTS:
1. These must be GENERIC research queries that do NOT include any specific business or brand names
2. Each query MUST explicitly ask for SPECIFIC BUSINESS NAMES to be listed
3. Use long-tail, specific queries that will trigger AI to list actual company names
4. Each query must be UNIQUE and different from the others

Return ONLY a valid JSON array of exactly 5 strings. No explanations, no markdown, just the JSON array.`;

const userPrompt = `Generate 5 unique, specific, long-tail AI search queries for digital marketing services in Dallas, TX.`;

async function main() {
  console.log(`Model: ${model}`);
  const start = Date.now();
  const response = await openai.chat.completions.create({
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    max_completion_tokens: 4096,
  });

  const elapsed = Date.now() - start;
  const text = response.choices[0]?.message?.content || "";
  const finishReason = response.choices[0]?.finish_reason;
  console.log(`Time: ${elapsed}ms | finish_reason: ${finishReason}`);
  console.log(`Tokens: ${response.usage?.prompt_tokens} in + ${response.usage?.completion_tokens} out`);
  console.log(`\nRaw output:\n${text}`);

  try {
    const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const parsed = JSON.parse(cleaned);
    console.log(`\nParsed ${parsed.length} prompts OK`);
    parsed.forEach((p: string, i: number) => console.log(`  ${i + 1}. "${p}"`));
  } catch (e: any) {
    console.log(`\nJSON parse failed: ${e.message}`);
  }
}

main().catch(console.error);
