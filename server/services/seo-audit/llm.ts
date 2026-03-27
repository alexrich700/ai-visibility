import { z } from 'zod';

function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

function stripCodeFences(text: string): string {
  return text.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?\s*```\s*$/, '').trim();
}

async function getAnthropicClient() {
  const Anthropic = (await import('@anthropic-ai/sdk')).default;
  return new Anthropic();
}

export interface KeywordClassification {
  keyword: string;
  intent: string;
  page_type: string;
  target_service: string | null;
  target_city: string | null;
}

export async function classifyKeywords(
  keywords: Array<{ keyword: string; searchVolume?: number; cpc?: number }>,
  services: string[],
  cities: string[]
): Promise<KeywordClassification[]> {
  const client = await getAnthropicClient();
  const batches = chunk(keywords, 200);
  const results: KeywordClassification[] = [];

  for (const batch of batches) {
    try {
      const response = await client.messages.create({
        model: 'claude-haiku-4-5',
        max_tokens: 4096,
        temperature: 0,
        system: `You are a keyword classification engine for local SEO.
Classify each keyword by search intent and the type of page it should target.

Intent types: transactional, informational, navigational, comparison
Page types: service_page, city_page, subcity_page, comparison_page, resource_page, faq_page

Return ONLY valid JSON array. No explanation.`,
        messages: [{
          role: 'user',
          content: `Services: ${JSON.stringify(services)}
Cities: ${JSON.stringify(cities)}

Classify these keywords:
${JSON.stringify(batch.map(k => k.keyword))}

Return JSON: [{"keyword": "...", "intent": "...", "page_type": "...", "target_service": "...", "target_city": "..."}]`
        }]
      });

      const text = response.content[0].type === 'text' ? response.content[0].text : '';
      const parsed = JSON.parse(stripCodeFences(text));
      results.push(...parsed);
    } catch (error) {
      console.error('[LLM] Keyword classification batch failed:', error);
      for (const kw of batch) {
        results.push({
          keyword: kw.keyword,
          intent: 'informational',
          page_type: 'resource_page',
          target_service: null,
          target_city: null,
        });
      }
    }
  }

  return results;
}

const PAGE_SCORING_RUBRIC = `You are a page quality scoring engine for local SEO.

Score each page on a 100-point rubric across 4 categories (25 points each):

RELEVANCE (25 pts):
- Title tag contains target keyword (5 pts)
- H1 contains target keyword (5 pts)
- Meta description mentions keyword (3 pts)
- First 100 words mention keyword (4 pts)
- Content is topically relevant throughout (8 pts)

COMPLETENESS (25 pts):
- Word count >= 800 (5 pts)
- Has FAQ section (3 pts)
- Has answer capsules (120-150 char direct answers after H2s) (5 pts)
- Includes pricing/cost information (3 pts)
- Has proof blocks (licenses, years, warranties) (4 pts)
- Internal links to related pages (5 pts)

TECHNICAL (25 pts):
- Has LocalBusiness or Service schema (5 pts)
- Has FAQ schema if FAQ content exists (3 pts)
- Images have alt text with keyword (3 pts)
- Proper heading hierarchy (H1>H2>H3) (4 pts)
- Page loads in < 3 seconds (3 pts)
- Mobile-friendly layout (4 pts)
- Has canonical tag (3 pts)

GEO OPTIMIZATION (25 pts):
- Mentions target city/location in content (5 pts)
- Has location-specific information (landmarks, neighborhoods) (5 pts)
- NAP (name, address, phone) visible on page (3 pts)
- Embedded Google Map (3 pts)
- Local testimonials or case studies (4 pts)
- Service area mentioned (5 pts)

Return structured JSON with scores per category and overall.`;

export interface PageScore {
  total_score: number;
  action: 'keep' | 'optimize' | 'rewrite' | 'create_new';
  estimated_optimization_hours: number;
  key_improvements: string[];
  category_scores: {
    relevance: number;
    completeness: number;
    technical: number;
    geo_optimization: number;
  };
}

export async function scorePage(
  pageUrl: string,
  pageContent: string,
  targetKeyword: string,
  intent: string
): Promise<PageScore> {
  const client = await getAnthropicClient();

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 2048,
      temperature: 0,
      system: [{
        type: 'text',
        text: PAGE_SCORING_RUBRIC,
        cache_control: { type: 'ephemeral' },
      }],
      messages: [{
        role: 'user',
        content: `URL: ${pageUrl}
Target Keyword: ${targetKeyword}
Intent: ${intent}
Page Content (truncated to 3000 chars):
${pageContent.slice(0, 3000)}

Score this page. Return JSON:
{
  "total_score": 0-100,
  "action": "keep|optimize|rewrite|create_new",
  "estimated_optimization_hours": 0-8,
  "key_improvements": ["..."],
  "category_scores": {"relevance": 0-25, "completeness": 0-25, "technical": 0-25, "geo_optimization": 0-25}
}`
      }]
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    return JSON.parse(stripCodeFences(text));
  } catch (error) {
    console.error('[LLM] Page scoring failed:', error);
    return {
      total_score: 0,
      action: 'create_new',
      estimated_optimization_hours: 4,
      key_improvements: ['Unable to score page'],
      category_scores: { relevance: 0, completeness: 0, technical: 0, geo_optimization: 0 },
    };
  }
}

export interface ReviewSentiment {
  overall_sentiment: 'positive' | 'neutral' | 'negative';
  positive_themes: string[];
  negative_themes: string[];
  service_mentions: Record<string, number>;
  location_mentions: Record<string, number>;
}

export async function analyzeReviews(
  reviews: Array<{ text: string; rating: number }>,
  businessName: string
): Promise<ReviewSentiment> {
  const client = await getAnthropicClient();

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 1024,
      temperature: 0,
      messages: [{
        role: 'user',
        content: `Analyze these reviews for ${businessName}. Extract sentiment themes.

Reviews:
${JSON.stringify(reviews.slice(0, 50))}

Return JSON:
{
  "overall_sentiment": "positive|neutral|negative",
  "positive_themes": ["fast response time", "professional", ...],
  "negative_themes": ["pricing concerns", ...],
  "service_mentions": {"roof repair": 12, "roof replacement": 8, ...},
  "location_mentions": {"Austin": 15, "Round Rock": 3, ...}
}`
      }]
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    return JSON.parse(stripCodeFences(text));
  } catch (error) {
    console.error('[LLM] Review analysis failed:', error);
    return {
      overall_sentiment: 'neutral',
      positive_themes: [],
      negative_themes: [],
      service_mentions: {},
      location_mentions: {},
    };
  }
}

export interface AuditSummaryForNarrative {
  businessName: string;
  businessUrl: string;
  siteHealthGrade?: string;
  shareOfLocalVoice?: number;
  averageGridRank?: number;
  totalKeywordGaps?: number;
  totalContentGaps?: number;
  totalDeliverables?: number;
  estimatedTotalHours?: number;
  estimatedMonthlyInvestment?: number;
  marketPositionScore?: number;
  topFindings?: string[];
}

export async function generateActionPlanNarrative(auditSummary: AuditSummaryForNarrative): Promise<string> {
  const client = await getAnthropicClient();

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 2048,
      temperature: 0.3,
      messages: [{
        role: 'user',
        content: `You are writing a brief executive summary for a local business SEO audit.
The audience is a non-technical business owner. Keep it conversational and focused on business impact.

Audit Summary:
${JSON.stringify(auditSummary)}

Write 3-4 paragraphs covering:
1. Current competitive position (use specific competitor names)
2. The biggest opportunities (revenue framing, not technical)
3. Recommended investment and expected timeline
4. One compelling reason to act now

Do NOT use jargon. Frame everything in terms of leads, calls, and revenue.`
      }]
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    return text;
  } catch (error) {
    console.error('[LLM] Narrative generation failed:', error);
    return 'Executive summary generation failed. Please contact support.';
  }
}

export interface ParsedBusinessInfo {
  businessName: string;
  businessUrl: string;
  industry: string;
  businessType: 'local' | 'national';
  serviceAreaCities: string[];
  primaryCategories: string[];
}

export async function parseBusinessDescription(description: string): Promise<ParsedBusinessInfo> {
  const client = await getAnthropicClient();

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 2048,
      temperature: 0,
      system: `You are an SEO audit intake assistant. Extract structured business information from a free-form description.
Return ONLY valid JSON with these fields:
- businessName: string (the company/business name)
- businessUrl: string (website URL if mentioned, empty string if not)
- industry: string (primary industry/category)
- businessType: "local" or "national"
- serviceAreaCities: string[] (cities/areas mentioned, format as "City, ST" for US cities)
- primaryCategories: string[] (service categories the business offers)

Be thorough in extracting categories. If the user mentions multiple service types, include all of them.
If information is not provided, use empty string or empty array as appropriate.`,
      messages: [{
        role: 'user',
        content: description
      }]
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    const parsed = JSON.parse(stripCodeFences(text));
    return {
      businessName: parsed.businessName || '',
      businessUrl: parsed.businessUrl || '',
      industry: parsed.industry || '',
      businessType: parsed.businessType === 'national' ? 'national' : 'local',
      serviceAreaCities: Array.isArray(parsed.serviceAreaCities) ? parsed.serviceAreaCities : [],
      primaryCategories: Array.isArray(parsed.primaryCategories) ? parsed.primaryCategories : [],
    };
  } catch (error) {
    console.error('[LLM] Business description parsing failed:', error);
    throw new Error('Failed to parse business description with AI');
  }
}

export interface KeywordResearchResult {
  keyword: string;
  estVolume: number;
  intent: string;
  service: string;
}

export async function generateKeywordResearch(params: {
  categories: string[];
  businessName: string;
  businessUrl: string;
  businessType: string;
  cities: string[];
}): Promise<KeywordResearchResult[]> {
  const client = await getAnthropicClient();

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 4096,
      temperature: 0,
      system: `You are an SEO keyword research specialist. Generate relevant keywords for a business based on their service categories and location.

For each service category, generate 5-8 keywords including:
- Primary service keyword (e.g., "plumber", "roof repair")
- Location-modified keywords (e.g., "plumber in Austin TX")
- "Near me" variants (e.g., "plumber near me")
- Long-tail keywords (e.g., "emergency drain cleaning service")
- Commercial intent keywords (e.g., "best plumber", "affordable plumbing")

For each keyword provide:
- keyword: the search term
- estVolume: estimated monthly search volume (realistic numbers based on your knowledge)
- intent: one of "transactional", "informational", "commercial", "navigational"
- service: which service category this keyword belongs to

Return ONLY a valid JSON array. No explanation.`,
      messages: [{
        role: 'user',
        content: `Business: ${params.businessName}
Website: ${params.businessUrl}
Type: ${params.businessType}
Service Categories: ${JSON.stringify(params.categories)}
Service Areas: ${JSON.stringify(params.cities)}

Generate keyword research results for these service categories.`
      }]
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    const parsed: unknown = JSON.parse(stripCodeFences(text));
    if (!Array.isArray(parsed)) return [];
    const keywordItemSchema = z.object({
      keyword: z.string(),
      estVolume: z.number().default(0),
      intent: z.string().default('informational'),
      service: z.string().default(''),
    });
    const results: KeywordResearchResult[] = [];
    for (const item of parsed) {
      const validated = keywordItemSchema.safeParse(item);
      if (validated.success && validated.data.keyword.length > 0) {
        results.push(validated.data);
      }
    }
    return results;
  } catch (error) {
    console.error('[LLM] Keyword research generation failed:', error);
    throw new Error('Failed to generate keyword research with AI');
  }
}

export async function extractServicesFromPages(pages: Array<{ url: string; title?: string; meta_description?: string }>): Promise<Array<{ name: string; category: string; keywords: string[] }>> {
  const client = await getAnthropicClient();

  try {
    const pageData = pages.slice(0, 50).map(p => ({
      url: p.url,
      title: p.title || '',
      description: p.meta_description || '',
    }));

    const response = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 2048,
      temperature: 0,
      messages: [{
        role: 'user',
        content: `Analyze these web pages and extract the services this business offers.

Pages:
${JSON.stringify(pageData)}

Return JSON array of services:
[{"name": "Roof Repair", "category": "Roofing", "keywords": ["roof repair", "fix roof", "roof leak repair"]}]

Only return services that are clearly offered by this business. Return ONLY valid JSON.`
      }]
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    return JSON.parse(stripCodeFences(text));
  } catch (error) {
    console.error('[LLM] Service extraction failed:', error);
    return [];
  }
}