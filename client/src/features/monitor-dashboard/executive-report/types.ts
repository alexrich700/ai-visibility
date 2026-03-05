import type {
  Citation,
  CompetitorVisibility,
  SessionChartDataPoint,
  ShareOfVoiceItem,
  VisibilityMetrics,
} from "../selectors";

export interface SentimentNarrative {
  text: string;
  strength: number;
}

export interface SentimentNarratives {
  strengths: SentimentNarrative[];
  improvements: SentimentNarrative[];
}

export interface CityMetric {
  city: string;
  visibilityRate: number;
  avgRank: number | null;
}

export interface PromptPerformanceItem {
  promptText: string;
  chatgptFound: boolean;
  googleAIFound: boolean;
  chatgptCited: boolean | null;
  googleAICited: boolean | null;
  avgRank: number | null;
  score: number;
}

export interface ReportData {
  businessName: string;
  scanDate: string | null;
  city: string | null;
  visibilityMetrics: VisibilityMetrics;
  avgRank: number | null;
  firstPlaceCount: number;
  sentimentScore: number | null;
  sessionChartData: SessionChartDataPoint[];
  shareOfVoice: ShareOfVoiceItem[];
  competitorVisibility: CompetitorVisibility[];
  topCitations: Citation[];
  sentimentNarratives: SentimentNarratives | null;
  groupBarData: { name: string; fullName: string; visibility: number; total: number }[];
  cityMetrics: CityMetric[] | null;
  topPrompts: PromptPerformanceItem[];
  bottomPrompts: PromptPerformanceItem[];
}
