import archiver from "archiver";
import type { MonitoringClient, MonitoringGroup, CheckSession, CheckResult } from "@shared/schema";
import type { Response } from "express";

interface SentimentNarrative {
  text: string;
  strength: number;
}

interface CompetitorVisibility {
  name: string;
  mentionCount: number;
  visibilityPercent: number;
}

interface ShareOfVoice {
  brand: number;
  competitors: number;
}

interface Citation {
  url: string;
  count: number;
}

interface ExportAnalytics {
  sentimentScore: number | null;
  sentimentNarratives: {
    strengths: SentimentNarrative[];
    improvements: SentimentNarrative[];
  } | null;
  shareOfVoice: ShareOfVoice | null;
  competitorVisibility: CompetitorVisibility[];
  topCitations: Citation[];
  avgMentionRank: number | null;
  firstPlaceCount: number;
}

interface ExportData {
  client: MonitoringClient;
  groups: MonitoringGroup[];
  sessions: CheckSession[];
  results: CheckResult[];
  dateRange: { start: Date; end: Date };
  analytics?: ExportAnalytics;
}

interface ExportSummary {
  clientName: string;
  domain: string;
  industry: string;
  exportDate: string;
  dateRange: { start: string; end: string };
  totalSessions: number;
  totalPrompts: number;
  overallScore: number;
  chatgptScore: number;
  googleAIScore: number;
  visibilityRate: number;
  citationRate: number;
  chatgptVisibility: number;
  googleAIVisibility: number;
  analytics: {
    sentimentScore: number | null;
    sentimentNarratives: {
      strengths: SentimentNarrative[];
      improvements: SentimentNarrative[];
    };
    shareOfVoice: ShareOfVoice | null;
    competitorVisibility: CompetitorVisibility[];
    topCitations: Citation[];
    avgMentionRank: number | null;
    firstPlaceCount: number;
  };
}

interface CSVRow {
  [key: string]: string | number | boolean | null;
}

function escapeCSV(value: string | null | undefined): string {
  if (value == null) return "";
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function toCSV(rows: CSVRow[], headers: string[]): string {
  const headerLine = headers.join(",");
  const dataLines = rows.map(row => 
    headers.map(h => escapeCSV(String(row[h] ?? ""))).join(",")
  );
  return [headerLine, ...dataLines].join("\n");
}

function generateReadme(data: ExportData): string {
  const now = new Date().toISOString().split("T")[0];
  return `AI VISIBILITY AUDIT EXPORT
==========================

Generated: ${now}
Client: ${data.client.businessName}
Domain: ${data.client.domain}
Date Range: ${data.dateRange.start.toISOString().split("T")[0]} to ${data.dateRange.end.toISOString().split("T")[0]}

CONTENTS
--------
- summary.json: Overall metrics, scores, and AI-generated sentiment analysis
- chatgpt_results.csv: All ChatGPT prompts, responses, and grounding data
- google_results.csv: All Google AI prompts, responses, and grounding data
- metadata.json: Schema definitions and field descriptions

ANALYTICS INCLUDED
------------------
The summary.json file now includes comprehensive analytics:

1. SENTIMENT ANALYSIS
   - Sentiment Score (0-100): Overall brand perception score
   - Brand Strength Factors: AI-synthesized positive narratives with strength ratings
   - Areas for Improvement: AI-synthesized improvement opportunities with priority ratings

2. COMPETITIVE INTELLIGENCE
   - Share of Voice: Your brand visibility vs competitors
   - Competitor Visibility: Top competitors and their mention frequency
   - Top Citations: Most cited domains by AI platforms

3. PROMINENCE METRICS
   - Average Mention Rank: Where you typically appear in AI responses
   - First Place Count: How often you're recommended first

HOW TO USE WITH AI ASSISTANTS
-----------------------------
You can upload these files to Claude, ChatGPT, or other AI assistants to:
1. Analyze your visibility patterns and identify gaps
2. Get recommendations for improving your website content
3. Understand which prompts you're missing from
4. Compare your visibility against competitors
5. Prioritize improvements based on sentiment analysis

SUGGESTED PROMPTS FOR AI ASSISTANTS
-----------------------------------
- "Analyze this visibility data and identify the top 5 prompts where I should improve my website content"
- "Based on the sentiment narratives, what are my brand's key strengths and weaknesses?"
- "Which competitors are appearing more often than me, and what might they be doing differently?"
- "Review the citations and recommend how I can get my website cited more often"
- "Create an action plan based on the Areas for Improvement section"

FILE FORMATS
------------
- CSV files use UTF-8 encoding with comma separators
- JSON files are formatted for readability
- All timestamps are in ISO 8601 format

For support, contact Rossman Media.
`;
}

function generateSummary(data: ExportData): ExportSummary {
  const latestSession = data.sessions[0];
  const totalPrompts = data.results.length;
  const foundCount = data.results.filter(r => r.chatgptFound || r.googleAIFound).length;
  const citedCount = data.results.filter(r => r.chatgptCited || r.googleAICited).length;
  const chatgptFoundCount = data.results.filter(r => r.chatgptFound).length;
  const googleAIFoundCount = data.results.filter(r => r.googleAIFound).length;

  return {
    clientName: data.client.businessName,
    domain: data.client.domain,
    industry: data.client.industry,
    exportDate: new Date().toISOString(),
    dateRange: {
      start: data.dateRange.start.toISOString(),
      end: data.dateRange.end.toISOString(),
    },
    totalSessions: data.sessions.length,
    totalPrompts,
    overallScore: latestSession?.overallScore ?? 0,
    chatgptScore: latestSession?.chatgptScore ?? 0,
    googleAIScore: latestSession?.googleAIScore ?? 0,
    visibilityRate: totalPrompts > 0 ? Math.round((foundCount / totalPrompts) * 100) : 0,
    citationRate: totalPrompts > 0 ? Math.round((citedCount / totalPrompts) * 100) : 0,
    chatgptVisibility: totalPrompts > 0 ? Math.round((chatgptFoundCount / totalPrompts) * 100) : 0,
    googleAIVisibility: totalPrompts > 0 ? Math.round((googleAIFoundCount / totalPrompts) * 100) : 0,
    analytics: {
      sentimentScore: data.analytics?.sentimentScore ?? null,
      sentimentNarratives: data.analytics?.sentimentNarratives ?? { strengths: [], improvements: [] },
      shareOfVoice: data.analytics?.shareOfVoice ?? null,
      competitorVisibility: data.analytics?.competitorVisibility ?? [],
      topCitations: data.analytics?.topCitations ?? [],
      avgMentionRank: data.analytics?.avgMentionRank ?? null,
      firstPlaceCount: data.analytics?.firstPlaceCount ?? 0,
    },
  };
}

function generateChatGPTCSV(data: ExportData): string {
  const headers = [
    "session_date",
    "group_name",
    "prompt",
    "found",
    "cited",
    "sentiment",
    "response",
    "competitors_mentioned",
  ];

  const groupMap = new Map(data.groups.map(g => [g.id, g.name]));
  const sessionMap = new Map(data.sessions.map(s => [s.id, s.createdAt]));

  const rows: CSVRow[] = data.results.map(r => ({
    session_date: r.sessionId ? sessionMap.get(r.sessionId)?.toISOString().split("T")[0] ?? "" : "",
    group_name: groupMap.get(r.groupId) ?? "",
    prompt: r.promptText,
    found: r.chatgptFound ? "Yes" : "No",
    cited: r.chatgptCited ? "Yes" : "No",
    sentiment: r.chatgptSentiment ?? "",
    response: r.chatgptResponse ?? "",
    competitors_mentioned: r.competitors ?? "",
  }));

  return toCSV(rows, headers);
}

function generateGoogleAICSV(data: ExportData): string {
  const headers = [
    "session_date",
    "group_name",
    "prompt",
    "found",
    "cited",
    "sentiment",
    "response",
    "competitors_mentioned",
  ];

  const groupMap = new Map(data.groups.map(g => [g.id, g.name]));
  const sessionMap = new Map(data.sessions.map(s => [s.id, s.createdAt]));

  const rows: CSVRow[] = data.results.map(r => ({
    session_date: r.sessionId ? sessionMap.get(r.sessionId)?.toISOString().split("T")[0] ?? "" : "",
    group_name: groupMap.get(r.groupId) ?? "",
    prompt: r.promptText,
    found: r.googleAIFound ? "Yes" : "No",
    cited: r.googleAICited ? "Yes" : "No",
    sentiment: r.googleAISentiment ?? "",
    response: r.googleAIResponse ?? "",
    competitors_mentioned: r.competitors ?? "",
  }));

  return toCSV(rows, headers);
}

function generateMetadata(): object {
  return {
    version: "2.0",
    generatedBy: "Rossman Media AI Visibility Audit Tool",
    fields: {
      summary: {
        clientName: "The business name being monitored",
        domain: "The business website domain",
        industry: "The industry/category of the business",
        overallScore: "Combined visibility score (0-100)",
        chatgptScore: "Visibility score on ChatGPT (0-100)",
        googleAIScore: "Visibility score on Google AI (0-100)",
        visibilityRate: "Percentage of prompts where business was mentioned",
        citationRate: "Percentage of prompts where website was directly cited",
      },
      analytics: {
        sentimentScore: "Overall sentiment score (0-100). 50 = neutral, 70+ = positive, <40 = needs improvement",
        sentimentNarratives: {
          strengths: "Array of AI-synthesized positive brand narratives with strength ratings (1-5)",
          improvements: "Array of AI-synthesized improvement areas with priority ratings (1-5)",
        },
        shareOfVoice: {
          brand: "Percentage of mentions that are your brand",
          competitors: "Percentage of mentions that are competitors",
        },
        competitorVisibility: "Array of top 5 competitors with name, mention count, and visibility percentage",
        topCitations: "Array of top 5 cited domains with URL and citation count",
        avgMentionRank: "Average position of your brand in AI responses (1 = first mentioned)",
        firstPlaceCount: "Number of times your brand was recommended first",
      },
      csvColumns: {
        session_date: "The date when this check was performed",
        group_name: "The service category group (e.g., 'Emergency Plumber', 'Water Heater Repair')",
        prompt: "The exact prompt sent to the AI platform",
        found: "Whether the business was mentioned in the response (Yes/No)",
        cited: "Whether the business website URL was cited (Yes/No)",
        sentiment: "The sentiment of the mention (positive/neutral/negative)",
        response: "The full AI response text",
        competitors_mentioned: "List of competitor names found in the response",
      },
    },
    tips: [
      "Responses where 'found' is No are opportunities - create content targeting those prompts",
      "Compare chatgpt_results.csv and google_results.csv to see platform differences",
      "Focus on prompts where competitors appear but you don't",
      "Cited responses indicate strong domain authority for that topic",
      "Use the sentimentNarratives.strengths to understand what AI platforms like about your brand",
      "Use the sentimentNarratives.improvements to prioritize website and content updates",
      "Higher strength ratings (4-5) indicate more significant or frequently mentioned points",
    ],
  };
}

export async function streamExportZip(res: Response, data: ExportData): Promise<void> {
  const archive = archiver("zip", { zlib: { level: 9 } });
  const filename = `visibility-export-${data.client.businessName.replace(/[^a-zA-Z0-9]/g, "-")}-${new Date().toISOString().split("T")[0]}.zip`;

  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

  archive.pipe(res);

  archive.append(generateReadme(data), { name: "README.txt" });
  archive.append(JSON.stringify(generateSummary(data), null, 2), { name: "summary.json" });
  archive.append(generateChatGPTCSV(data), { name: "chatgpt_results.csv" });
  archive.append(generateGoogleAICSV(data), { name: "google_results.csv" });
  archive.append(JSON.stringify(generateMetadata(), null, 2), { name: "metadata.json" });

  await archive.finalize();
}
