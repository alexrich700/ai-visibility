import archiver from "archiver";
import * as XLSX from "xlsx";
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

function formatCitations(citations: unknown): string {
  let citationArray: Array<{ url?: string; title?: string; domain?: string }> | null = null;
  
  if (typeof citations === 'string') {
    try { citationArray = JSON.parse(citations); } catch { return ""; }
  } else if (Array.isArray(citations)) {
    citationArray = citations;
  }
  
  if (!citationArray || !Array.isArray(citationArray)) return "";
  
  // Handle both object entries and legacy string entries
  return citationArray
    .map((c) => {
      if (typeof c === 'string') {
        // Legacy format: plain URL or domain string
        return c;
      }
      return c.url || c.domain || "";
    })
    .filter(Boolean)
    .join(" | ");
}

function generateChatGPTCSV(data: ExportData): string {
  const headers = [
    "session_date",
    "group_name",
    "prompt",
    "found",
    "cited",
    "sentiment",
    "source_urls",
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
    source_urls: formatCitations(r.chatgptCitations),
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
    "source_urls",
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
    source_urls: formatCitations(r.googleAICitations),
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
        source_urls: "Full URLs of sources cited by the AI platform in its response (pipe-separated)",
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

// ============================================
// NEW: Excel export with per-city files and service group sheets
// ============================================

interface ExportBySessionData {
  client: MonitoringClient;
  groups: MonitoringGroup[];
  sessions: CheckSession[]; // Sessions for the selected scan date
  results: CheckResult[];
  scanDate: string; // The selected scan date (YYYY-MM-DD)
}

interface CityExportData {
  city: string;
  session: CheckSession;
  results: CheckResult[];
  groups: MonitoringGroup[];
}

// Sanitize sheet name for Excel (max 31 chars, no special chars)
function sanitizeSheetName(name: string): string {
  // Remove special chars that Excel doesn't allow
  let sanitized = name.replace(/[\\\/\*\?\[\]:]/g, "");
  // Truncate to 31 characters
  if (sanitized.length > 31) {
    sanitized = sanitized.substring(0, 31);
  }
  return sanitized || "Sheet";
}

// Create Excel worksheet data for a service group
function createGroupSheetData(
  groupName: string,
  results: CheckResult[],
  sessionDate: Date
): any[][] {
  const headers = [
    "Prompt",
    "ChatGPT Found",
    "ChatGPT Response",
    "ChatGPT Citations",
    "ChatGPT Sentiment",
    "Google AI Found",
    "Google AI Response",
    "Google AI Citations",
    "Google AI Sentiment",
    "Competitors Mentioned",
    "Scan Date"
  ];

  const rows: any[][] = [headers];

  for (const result of results) {
    rows.push([
      result.promptText,
      result.chatgptFound ? "Yes" : "No",
      result.chatgptResponse || "",
      formatCitations(result.chatgptCitations),
      result.chatgptSentiment || "",
      result.googleAIFound ? "Yes" : "No",
      result.googleAIResponse || "",
      formatCitations(result.googleAICitations),
      result.googleAISentiment || "",
      result.competitors || "",
      sessionDate.toISOString().split("T")[0]
    ]);
  }

  return rows;
}

// Generate Excel workbook for a city with service group sheets
function generateCityExcel(cityData: CityExportData, clientName: string): Buffer {
  const workbook = XLSX.utils.book_new();
  
  // Create a map of group ID to group name
  const groupMap = new Map(cityData.groups.map(g => [g.id, g.name]));
  
  // Group results by service group
  const resultsByGroup = new Map<number, CheckResult[]>();
  for (const result of cityData.results) {
    const groupResults = resultsByGroup.get(result.groupId) || [];
    groupResults.push(result);
    resultsByGroup.set(result.groupId, groupResults);
  }
  
  // Filter to only service groups (exclude brand sentiment)
  const serviceGroups = cityData.groups.filter(g => 
    (g as any).promptCategory === 'service' || !(g as any).promptCategory
  );
  
  // Track sheet names to avoid duplicates
  const usedSheetNames = new Set<string>();
  
  // Create a sheet for each service group that has results
  for (const group of serviceGroups) {
    const groupResults = resultsByGroup.get(group.id);
    if (!groupResults || groupResults.length === 0) continue;
    
    let sheetName = sanitizeSheetName(group.name);
    
    // Ensure unique sheet names
    let counter = 1;
    const originalName = sheetName;
    while (usedSheetNames.has(sheetName)) {
      const suffix = ` (${counter})`;
      sheetName = sanitizeSheetName(originalName.substring(0, 31 - suffix.length) + suffix);
      counter++;
    }
    usedSheetNames.add(sheetName);
    
    const sheetData = createGroupSheetData(
      group.name,
      groupResults,
      cityData.session.createdAt
    );
    
    const worksheet = XLSX.utils.aoa_to_sheet(sheetData);
    
    // Set column widths for better readability
    worksheet['!cols'] = [
      { wch: 50 },  // Prompt
      { wch: 12 },  // ChatGPT Found
      { wch: 60 },  // ChatGPT Response
      { wch: 40 },  // ChatGPT Citations
      { wch: 12 },  // ChatGPT Sentiment
      { wch: 12 },  // Google AI Found
      { wch: 60 },  // Google AI Response
      { wch: 40 },  // Google AI Citations
      { wch: 12 },  // Google AI Sentiment
      { wch: 30 },  // Competitors
      { wch: 12 },  // Scan Date
    ];
    
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  }
  
  // If no sheets were added, add an empty summary sheet
  if (workbook.SheetNames.length === 0) {
    const summaryData = [
      ["No service group results found for this scan"],
      [""],
      ["Client", clientName],
      ["City", cityData.city],
      ["Scan Date", cityData.session.createdAt.toISOString().split("T")[0]]
    ];
    const worksheet = XLSX.utils.aoa_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(workbook, worksheet, "Summary");
  }
  
  // Write to buffer
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  return buffer;
}

// Main export function: generates ZIP with Excel files per city
export async function streamSessionExportZip(
  res: Response, 
  data: ExportBySessionData
): Promise<void> {
  const archive = archiver("zip", { zlib: { level: 9 } });
  const safeName = data.client.businessName.replace(/[^a-zA-Z0-9]/g, "-");
  const filename = `visibility-export-${safeName}-${data.scanDate}.zip`;

  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

  archive.pipe(res);

  // Group sessions by city
  const sessionsByCity = new Map<string, CheckSession>();
  for (const session of data.sessions) {
    const city = session.city || "All Cities";
    sessionsByCity.set(city, session);
  }

  // Create a map of session ID to results
  const resultsBySession = new Map<number, CheckResult[]>();
  for (const result of data.results) {
    if (!result.sessionId) continue;
    const sessionResults = resultsBySession.get(result.sessionId) || [];
    sessionResults.push(result);
    resultsBySession.set(result.sessionId, sessionResults);
  }

  // Generate Excel file for each city
  const cities = Array.from(sessionsByCity.keys());
  
  if (cities.length === 0) {
    // No city-specific sessions, create a single file
    const allResults = data.results;
    const cityData: CityExportData = {
      city: "All",
      session: data.sessions[0],
      results: allResults,
      groups: data.groups,
    };
    const excelBuffer = generateCityExcel(cityData, data.client.businessName);
    archive.append(excelBuffer, { 
      name: `${safeName}-${data.scanDate}.xlsx` 
    });
  } else {
    for (const city of cities) {
      const session = sessionsByCity.get(city);
      if (!session) continue;
      
      const cityResults = resultsBySession.get(session.id) || [];
      
      const cityData: CityExportData = {
        city,
        session,
        results: cityResults,
        groups: data.groups,
      };
      
      const excelBuffer = generateCityExcel(cityData, data.client.businessName);
      const safeCity = city.replace(/[^a-zA-Z0-9]/g, "-");
      archive.append(excelBuffer, { 
        name: `${safeName}-${safeCity}-${data.scanDate}.xlsx` 
      });
    }
  }

  // Add a README file
  const readmeContent = `AI VISIBILITY AUDIT EXPORT
==========================

Generated: ${new Date().toISOString().split("T")[0]}
Client: ${data.client.businessName}
Domain: ${data.client.domain}
Scan Date: ${data.scanDate}

CONTENTS
--------
${cities.length > 1 
  ? `This export contains ${cities.length} Excel files, one for each city:\n${cities.map(c => `- ${safeName}-${c.replace(/[^a-zA-Z0-9]/g, "-")}-${data.scanDate}.xlsx`).join("\n")}`
  : `This export contains one Excel file with all scan results.`}

Each Excel file contains:
- Multiple sheets, one for each service group (e.g., "Plumber", "Drain Cleaner")
- Each sheet contains all prompts and AI responses for that service group

SHEET COLUMNS
-------------
- Prompt: The search query sent to AI platforms
- ChatGPT Found/Response/Citations/Sentiment: Results from ChatGPT
- Google AI Found/Response/Citations/Sentiment: Results from Google AI
- Competitors Mentioned: Other businesses mentioned in responses
- Scan Date: When this check was performed

HOW TO USE
----------
1. Open the Excel file for the city you want to analyze
2. Navigate between service group tabs to review different categories
3. Filter by "Found = No" to identify visibility gaps
4. Compare ChatGPT vs Google AI results for each prompt

For support, contact Rossman Media.
`;

  archive.append(readmeContent, { name: "README.txt" });

  await archive.finalize();
}
