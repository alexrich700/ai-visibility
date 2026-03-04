import type {
  Citation,
  CompetitorVisibility,
  GroupResults,
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
}
