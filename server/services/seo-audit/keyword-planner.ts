export interface KeywordIdea {
  keyword: string;
  avgMonthlySearches: number;
  competition: string;
  competitionIndex: number;
  lowTopOfPageBidMicros: number;
  highTopOfPageBidMicros: number;
  monthlySearchVolumes: Array<{ year: number; month: number; monthlySearches: number }>;
}

export interface HistoricalMetric {
  keyword: string;
  avgMonthlySearches: number;
  monthlySearchVolumes: Array<{ year: number; month: number; searches: number }>;
  competition: string;
  competitionIndex: number;
  averageCpcMicros: number;
}

export interface ForecastResult {
  keyword: string;
  clicks: number;
  impressions: number;
  averageCpcMicros: number;
  costMicros: number;
  conversions: number;
}

export interface GeoTarget {
  id: number;
  name: string;
  countryCode: string;
  targetType: string;
}

function isConfigured(): boolean {
  return !!(
    process.env.GOOGLE_ADS_CLIENT_ID &&
    process.env.GOOGLE_ADS_CLIENT_SECRET &&
    process.env.GOOGLE_ADS_DEVELOPER_TOKEN &&
    process.env.GOOGLE_ADS_REFRESH_TOKEN &&
    process.env.GOOGLE_ADS_CUSTOMER_ID
  );
}

export async function generateKeywordIdeas(params: {
  seedKeywords: string[];
  url?: string;
  geoTargetId: number;
  languageId?: number;
}): Promise<KeywordIdea[]> {
  if (!isConfigured()) {
    console.warn('[KeywordPlanner] Google Ads API not configured. Returning empty results.');
    return [];
  }

  console.log(`[KeywordPlanner] generateKeywordIdeas called with ${params.seedKeywords.length} seed keywords, geo: ${params.geoTargetId}`);

  // TODO: Implement with google-ads-api npm package or direct REST API
  // POST to GoogleAdsService with KeywordPlanIdeaService.GenerateKeywordIdeas
  // Requires OAuth 2.0 token refresh flow

  return [];
}

export async function getHistoricalMetrics(params: {
  keywords: string[];
  geoTargetId: number;
}): Promise<HistoricalMetric[]> {
  if (!isConfigured()) {
    console.warn('[KeywordPlanner] Google Ads API not configured. Returning empty results.');
    return [];
  }

  console.log(`[KeywordPlanner] getHistoricalMetrics called with ${params.keywords.length} keywords, geo: ${params.geoTargetId}`);

  // TODO: Implement with KeywordPlanService.GenerateHistoricalMetrics

  return [];
}

export async function generateForecast(params: {
  keywords: string[];
  geoTargetId: number;
  dailyBudgetMicros?: number;
}): Promise<ForecastResult[]> {
  if (!isConfigured()) {
    console.warn('[KeywordPlanner] Google Ads API not configured. Returning empty results.');
    return [];
  }

  console.log(`[KeywordPlanner] generateForecast called with ${params.keywords.length} keywords, geo: ${params.geoTargetId}`);

  // TODO: Implement with KeywordPlanService.GenerateForecastMetrics
  // 1. Create temporary KeywordPlan
  // 2. Add KeywordPlanCampaign with geo targeting + budget
  // 3. Add KeywordPlanAdGroup
  // 4. Add KeywordPlanKeywords
  // 5. Call GenerateForecastMetrics
  // 6. Delete temporary KeywordPlan

  return [];
}

export async function lookupGeoTarget(cityName: string, stateName?: string): Promise<GeoTarget | null> {
  if (!isConfigured()) {
    console.warn('[KeywordPlanner] Google Ads API not configured. Returning null geo target.');
    return null;
  }

  const query = stateName ? `${cityName}, ${stateName}` : cityName;
  console.log(`[KeywordPlanner] lookupGeoTarget called for: ${query}`);

  // TODO: Implement with GeoTargetConstantService.SuggestGeoTargetConstants

  return null;
}