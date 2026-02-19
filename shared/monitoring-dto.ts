import type { CheckResult, CheckSession, MonitoringClient, MonitoringGroup } from "@shared/schema";

export type AIPlatform = "chatgpt" | "google";

export interface CitationCount {
  domain: string;
  count: number;
}

export interface ShareOfVoiceItem {
  name: string;
  percentage: number;
  mentionCount: number;
}

export interface CompetitorVisibility {
  name: string;
  visibilityPercent: number;
  mentionCount: number;
}

export interface SentimentBreakdown {
  positive: number;
  neutral: number;
  negative: number;
}

export interface SentimentStatement {
  text: string;
  platform: AIPlatform;
  promptText?: string;
}

export interface SentimentStatements {
  positive: SentimentStatement[];
  negative: SentimentStatement[];
}

export interface SentimentNarrative {
  text: string;
  strength: number;
}

export interface SentimentNarratives {
  strengths: SentimentNarrative[];
  improvements: SentimentNarrative[];
}

export interface MonitoringAnalytics {
  shareOfVoice: ShareOfVoiceItem[];
  avgChatgptRank: number | null;
  avgGoogleAIRank: number | null;
  firstPlaceCount: number;
  sentimentBreakdown: SentimentBreakdown;
  topCitations: CitationCount[];
  sentimentScore: number | null;
  competitorVisibility: CompetitorVisibility[];
  sentimentStatements: SentimentStatements;
  sentimentNarratives?: SentimentNarratives;
}

export interface MonitoringTrendDataPoint {
  date: string;
  overallScore: number;
  chatgptScore: number;
  googleAIScore: number;
  foundCount: number;
  citedCount: number;
  shareOfVoice: ShareOfVoiceItem[] | null;
  avgRank: number | null;
  sentiment: SentimentBreakdown | null;
}

export interface DashboardResultGroup {
  groupId: number;
  groupName: string;
  promptCategory: string;
  results: CheckResult[];
}

export interface MonitoringDashboardData {
  client: MonitoringClient;
  groups: MonitoringGroup[];
  sessions: CheckSession[];
  latestResults: CheckResult[];
  resultsByGroup: DashboardResultGroup[];
  analytics: MonitoringAnalytics | null;
  trendData: MonitoringTrendDataPoint[];
}

export interface GroupTrendPoint {
  date: string | null;
  visibilityScore: number;
  foundCount: number;
  totalPrompts: number;
}

export interface GroupTrendData {
  groupId: number;
  groupName: string;
  data: GroupTrendPoint[];
}

export interface GroupTrendsResponse {
  groupTrends: GroupTrendData[];
}

export interface CompetitorTrendPoint {
  date: string | null;
  visibilityPercent: number;
  mentionCount: number;
}

export interface CompetitorTrendData {
  competitorName: string;
  data: CompetitorTrendPoint[];
}

export interface CompetitorTrendsResponse {
  competitorTrends: CompetitorTrendData[];
}
