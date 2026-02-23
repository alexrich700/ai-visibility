import { parseSitemap, type ParsedSitemap, type SitemapUrl } from "./sitemap-parser";
import { storage } from "../storage";
import { createLogger } from "../utils/logger";
import * as XLSX from "xlsx";

const logger = createLogger("content-gap-analysis");

export interface SearchTermMatch {
  searchTerm: string;
  matchedUrl: string | null;
  matchedPageTitle: string | null;
  matchScore: number;
  category: string;
  promptText: string;
  status: "covered" | "opportunity";
}

export interface ContentGapResult {
  clientId: number;
  domain: string;
  sitemapSummary: {
    totalUrls: number;
    categories: { name: string; count: number }[];
    errors: string[];
  };
  searchTermsCount: number;
  uniqueSearchTermsCount: number;
  coveredCount: number;
  opportunityCount: number;
  coveragePercent: number;
  matches: SearchTermMatch[];
  opportunities: SearchTermMatch[];
  coveredTerms: SearchTermMatch[];
}

function normalizeForMatching(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2)
    .filter((w) => !["the", "and", "for", "are", "but", "not", "you", "all", "can", "her", "was", "one", "our", "out", "how", "who", "what", "when", "where", "why", "which", "with", "this", "that", "from", "have", "has", "had", "been", "will", "would", "could", "should", "may", "might", "does", "did", "its", "best", "top", "near", "find"].includes(w));
}

function extractSlugWords(url: string): string[] {
  try {
    const parsed = new URL(url);
    return parsed.pathname
      .toLowerCase()
      .split(/[\/\-_.]/)
      .filter((w) => w.length > 2)
      .filter((w) => !["html", "htm", "php", "asp", "aspx", "jsp", "xml", "json", "www", "com", "org", "net", "index"].includes(w));
  } catch {
    return [];
  }
}

function computeMatchScore(searchTermWords: string[], urlSlugWords: string[]): number {
  if (searchTermWords.length === 0 || urlSlugWords.length === 0) return 0;

  let matchedCount = 0;
  for (const word of searchTermWords) {
    if (urlSlugWords.some((slug) => slug.includes(word) || word.includes(slug))) {
      matchedCount++;
    }
  }

  return matchedCount / searchTermWords.length;
}

function findBestMatch(
  searchTerm: string,
  sitemapUrls: SitemapUrl[]
): { url: string; score: number; title: string } | null {
  const searchWords = normalizeForMatching(searchTerm);
  if (searchWords.length === 0) return null;

  let bestMatch: { url: string; score: number; title: string } | null = null;

  for (const sitemapUrl of sitemapUrls) {
    const slugWords = extractSlugWords(sitemapUrl.loc);
    const score = computeMatchScore(searchWords, slugWords);

    if (score >= 0.4 && (!bestMatch || score > bestMatch.score)) {
      const pathTitle = new URL(sitemapUrl.loc).pathname
        .split("/")
        .filter(Boolean)
        .pop()
        ?.replace(/[-_]/g, " ")
        .replace(/\.\w+$/, "") || sitemapUrl.loc;
      bestMatch = { url: sitemapUrl.loc, score, title: pathTitle };
    }
  }

  return bestMatch;
}

function getCategoryForUrl(url: string, categories: { name: string; urls: SitemapUrl[] }[]): string {
  for (const cat of categories) {
    if (cat.urls.some((u) => u.loc === url)) {
      return cat.name;
    }
  }
  return "Uncategorized";
}

export async function analyzeContentGaps(clientId: number): Promise<ContentGapResult> {
  const client = await storage.getMonitoringClientById(clientId);
  if (!client) throw new Error("Client not found");

  logger.info(`Starting content gap analysis for client ${clientId} (${client.domain})`);

  const [sitemap, results] = await Promise.all([
    parseSitemap(client.domain),
    storage.getCheckResultsByClientId(clientId),
  ]);

  const allSearchTerms: { term: string; promptText: string }[] = [];
  for (const result of results) {
    const metadata = result.googleAIGroundingMetadata as any;
    if (metadata?.webSearchQueries && Array.isArray(metadata.webSearchQueries)) {
      for (const query of metadata.webSearchQueries) {
        if (typeof query === "string" && query.trim()) {
          allSearchTerms.push({ term: query.trim(), promptText: result.promptText });
        }
      }
    }
  }

  const uniqueTermsMap = new Map<string, { term: string; promptText: string }>();
  for (const item of allSearchTerms) {
    const key = item.term.toLowerCase();
    if (!uniqueTermsMap.has(key)) {
      uniqueTermsMap.set(key, item);
    }
  }
  const uniqueTerms = Array.from(uniqueTermsMap.values());

  logger.info(`Found ${uniqueTerms.length} unique search terms and ${sitemap.totalUrls} sitemap URLs`);

  const matches: SearchTermMatch[] = [];

  for (const { term, promptText } of uniqueTerms) {
    const best = findBestMatch(term, sitemap.allUrls);

    if (best) {
      matches.push({
        searchTerm: term,
        matchedUrl: best.url,
        matchedPageTitle: best.title,
        matchScore: Math.round(best.score * 100),
        category: getCategoryForUrl(best.url, sitemap.categories),
        promptText,
        status: "covered",
      });
    } else {
      matches.push({
        searchTerm: term,
        matchedUrl: null,
        matchedPageTitle: null,
        matchScore: 0,
        category: "No Match",
        promptText,
        status: "opportunity",
      });
    }
  }

  const opportunities = matches.filter((m) => m.status === "opportunity");
  const coveredTerms = matches.filter((m) => m.status === "covered");
  const coveragePercent = uniqueTerms.length > 0 ? Math.round((coveredTerms.length / uniqueTerms.length) * 100) : 0;

  logger.info(`Analysis complete: ${coveredTerms.length} covered, ${opportunities.length} opportunities`);

  return {
    clientId,
    domain: client.domain,
    sitemapSummary: {
      totalUrls: sitemap.totalUrls,
      categories: sitemap.categories.map((c) => ({ name: c.name, count: c.urls.length })),
      errors: sitemap.errors,
    },
    searchTermsCount: allSearchTerms.length,
    uniqueSearchTermsCount: uniqueTerms.length,
    coveredCount: coveredTerms.length,
    opportunityCount: opportunities.length,
    coveragePercent,
    matches,
    opportunities,
    coveredTerms,
  };
}

export function generateContentGapExcel(analysis: ContentGapResult): Buffer {
  const wb = XLSX.utils.book_new();

  const summaryData = [
    ["Content Gap Analysis Report"],
    ["Domain", analysis.domain],
    [""],
    ["Sitemap Summary"],
    ["Total Pages Found", analysis.sitemapSummary.totalUrls],
    ["Sitemap Categories", analysis.sitemapSummary.categories.length],
    [""],
    ["Search Terms Analysis"],
    ["Total Gemini Search Terms", analysis.searchTermsCount],
    ["Unique Search Terms", analysis.uniqueSearchTermsCount],
    ["Terms with Matching Pages", analysis.coveredCount],
    ["Opportunity Terms (No Page)", analysis.opportunityCount],
    ["Coverage Percentage", `${analysis.coveragePercent}%`],
    [""],
    ["Sitemap Categories Breakdown"],
    ["Category", "Page Count"],
    ...analysis.sitemapSummary.categories.map((c) => [c.name, c.count]),
  ];

  if (analysis.sitemapSummary.errors.length > 0) {
    summaryData.push([""], ["Sitemap Errors"]);
    for (const err of analysis.sitemapSummary.errors) {
      summaryData.push([err]);
    }
  }

  const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
  summarySheet["!cols"] = [{ wch: 35 }, { wch: 60 }];
  XLSX.utils.book_append_sheet(wb, summarySheet, "Summary");

  const opportunityRows = analysis.opportunities.map((m) => ({
    "Search Term": m.searchTerm,
    "Source Prompt": m.promptText,
    "Status": "OPPORTUNITY - No Matching Page",
    "Suggested Action": "Create a dedicated page targeting this search term",
  }));

  if (opportunityRows.length > 0) {
    const oppSheet = XLSX.utils.json_to_sheet(opportunityRows);
    oppSheet["!cols"] = [{ wch: 50 }, { wch: 60 }, { wch: 35 }, { wch: 50 }];
    XLSX.utils.book_append_sheet(wb, oppSheet, "Opportunities");
  }

  const coveredRows = analysis.coveredTerms.map((m) => ({
    "Search Term": m.searchTerm,
    "Matched Page URL": m.matchedUrl || "",
    "Matched Page": m.matchedPageTitle || "",
    "Match Score": `${m.matchScore}%`,
    "Sitemap Category": m.category,
    "Source Prompt": m.promptText,
  }));

  if (coveredRows.length > 0) {
    const coveredSheet = XLSX.utils.json_to_sheet(coveredRows);
    coveredSheet["!cols"] = [{ wch: 50 }, { wch: 60 }, { wch: 30 }, { wch: 12 }, { wch: 20 }, { wch: 60 }];
    XLSX.utils.book_append_sheet(wb, coveredSheet, "Covered Terms");
  }

  const allRows = analysis.matches.map((m) => ({
    "Search Term": m.searchTerm,
    "Status": m.status === "covered" ? "Covered" : "OPPORTUNITY",
    "Matched Page URL": m.matchedUrl || "—",
    "Matched Page": m.matchedPageTitle || "—",
    "Match Score": m.matchScore > 0 ? `${m.matchScore}%` : "—",
    "Sitemap Category": m.category,
    "Source Prompt": m.promptText,
  }));

  if (allRows.length > 0) {
    const allSheet = XLSX.utils.json_to_sheet(allRows);
    allSheet["!cols"] = [{ wch: 50 }, { wch: 15 }, { wch: 60 }, { wch: 30 }, { wch: 12 }, { wch: 20 }, { wch: 60 }];
    XLSX.utils.book_append_sheet(wb, allSheet, "All Terms");
  }

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  return Buffer.from(buf);
}
