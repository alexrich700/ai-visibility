import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.MY_OPENAI_API_KEY });

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

async function testOpenAI(model: string) {
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
  const inputTokens = response.usage?.prompt_tokens || 0;
  const outputTokens = response.usage?.completion_tokens || 0;

  let parsed: string[] = [];
  try {
    const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    parsed = JSON.parse(cleaned);
  } catch {}

  return { model, elapsed, text, parsed, finishReason, inputTokens, outputTokens };
}

async function testGemini() {
  const { GoogleGenAI } = await import("@google/genai");
  const ai = new GoogleGenAI({
    apiKey: process.env.AI_INTEGRATIONS_GEMINI_API_KEY!,
    httpOptions: {
      apiVersion: "",
      baseUrl: process.env.AI_INTEGRATIONS_GEMINI_BASE_URL,
    },
  });

  const combinedPrompt = `${systemPrompt}\n\nIMPORTANT: Return ONLY valid JSON with no markdown formatting, no code blocks, no explanations.\n\n${userPrompt}`;

  const start = Date.now();
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: combinedPrompt,
    config: {
      maxOutputTokens: 4096,
    },
  });

  const elapsed = Date.now() - start;
  const text = response.text || "";
  const usage = (response as any).usageMetadata;
  const inputTokens = usage?.promptTokenCount || 0;
  const outputTokens = usage?.candidatesTokenCount || 0;
  const thinkingTokens = usage?.thoughtsTokenCount || 0;

  let parsed: string[] = [];
  try {
    const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    parsed = JSON.parse(cleaned);
  } catch {}

  return { model: "gemini-2.5-flash", elapsed, text, parsed, finishReason: "stop", inputTokens, outputTokens, thinkingTokens };
}

function printResult(r: any) {
  const label = r.model.toUpperCase();
  console.log(`\n┌── ${label} ──`);
  console.log(`│ Time: ${r.elapsed}ms | finish_reason: ${r.finishReason}`);
  console.log(`│ Tokens: ${r.inputTokens} in + ${r.outputTokens} out${r.thinkingTokens ? ` + ${r.thinkingTokens} thinking` : ""}`);

  if (r.model === "gemini-2.5-flash") {
    console.log(`│ Cost: FREE (Replit AI Integrations)`);
  } else {
    const pricing: Record<string, { input: number; output: number }> = {
      "gpt-5-mini": { input: 0.25, output: 2.0 },
      "gpt-5-nano": { input: 0.05, output: 0.4 },
    };
    const p = pricing[r.model];
    if (p) {
      const cost = (r.inputTokens / 1_000_000) * p.input + (r.outputTokens / 1_000_000) * p.output;
      console.log(`│ Cost: $${cost.toFixed(6)}`);
    }
  }

  console.log(`│ Parsed ${r.parsed.length} prompts: ${r.parsed.length === 5 ? "OK" : "FAILED"}`);
  console.log(`│`);
  if (r.parsed.length > 0) {
    r.parsed.forEach((p: string, i: number) => {
      console.log(`│  ${i + 1}. "${p}"`);
    });
  } else {
    console.log(`│  Raw: ${r.text.slice(0, 400)}`);
  }
  console.log(`└──`);
}

async function main() {
  console.log("=".repeat(90));
  console.log("PROMPT GENERATION COMPARISON: Gemini 2.5 Flash vs GPT-5-Mini vs GPT-5-Nano");
  console.log("=".repeat(90));

  // Run all three
  console.log("\nRunning Gemini 2.5 Flash...");
  const geminiResult = await testGemini();

  console.log("Running GPT-5-Mini...");
  const miniResult = await testOpenAI("gpt-5-mini");

  console.log("Running GPT-5-Nano...");
  const nanoResult = await testOpenAI("gpt-5-nano");

  // Print results
  printResult(geminiResult);
  printResult(miniResult);
  printResult(nanoResult);

  // Summary table
  console.log("\n" + "=".repeat(90));
  console.log("SUMMARY");
  console.log("=".repeat(90));
  console.log(`\n${"Model".padEnd(22)} ${"Time".padEnd(10)} ${"Parsed OK".padEnd(12)} ${"Cost".padEnd(14)} Notes`);
  console.log("─".repeat(90));

  const rows = [geminiResult, miniResult, nanoResult];
  for (const r of rows) {
    let cost = "FREE";
    if (r.model === "gpt-5-mini") {
      cost = `$${((r.inputTokens / 1e6) * 0.25 + (r.outputTokens / 1e6) * 2.0).toFixed(6)}`;
    } else if (r.model === "gpt-5-nano") {
      cost = `$${((r.inputTokens / 1e6) * 0.05 + (r.outputTokens / 1e6) * 0.4).toFixed(6)}`;
    }
    const notes = r.model === "gemini-2.5-flash"
      ? `${r.thinkingTokens || 0} thinking tokens`
      : r.model === "gpt-5-nano"
        ? `uses reasoning tokens (slower)`
        : "";
    console.log(
      `${r.model.padEnd(22)} ${(r.elapsed + "ms").padEnd(10)} ${(r.parsed.length === 5 ? "YES" : "NO").padEnd(12)} ${cost.padEnd(14)} ${notes}`
    );
  }
  console.log("");
}

main().catch(console.error);
