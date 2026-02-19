import { format } from "date-fns";
import type { CheckResult, CheckSession } from "@shared/schema";

export type SessionWithCity = CheckSession & { city?: string | null };

export interface Citation {
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

export interface GroupResults {
  groupId: number;
  groupName: string;
  promptCategory: string;
  results: CheckResult[];
}

export interface GroupTrendData {
  groupId: number;
  groupName: string;
  data: { date: string | null; visibilityScore: number; foundCount: number; totalPrompts: number }[];
}

export interface CompetitorTrendData {
  competitorName: string;
  data: { date: string | null; visibilityPercent: number; mentionCount: number }[];
}

export interface SessionChartDataPoint {
  date: string;
  overall: number;
  chatgpt: number;
  googleAI: number;
  city: string | null;
}

export interface VisibilityMetrics {
  promptCount: number;
  totalExposures: number;
  foundCount: number;
  citedCount: number;
  visibilityRate: number;
  citationRate: number;
  chatgptVisibility: number;
  googleAIVisibility: number;
  chatgptFoundCount: number;
  googleAIFoundCount: number;
}

export interface CityScopedDashboardData {
  isSpecificCitySelected: boolean;
  filteredSessions: CheckSession[];
  selectedCityHasNoData: boolean;
  latestSession: CheckSession | undefined;
  previousSession: CheckSession | undefined;
  cityFilteredResults: CheckResult[];
  cityFilteredResultsByGroup: GroupResults[];
}

const excludedDomains = ["vertexaisearch.cloud.google.com", "grounding-api-redirect"];

function isDomainExcluded(domain: string): boolean {
  return excludedDomains.some((excluded) => domain.includes(excluded));
}

function parseCompetitors(result: CheckResult): string[] {
  if (!result.competitors) {
    return [];
  }

  try {
    const competitors = JSON.parse(result.competitors);
    return Array.isArray(competitors) ? competitors : [];
  } catch {
    return [];
  }
}

export function selectCityScopedDashboardData(
  sessions: CheckSession[],
  latestResults: CheckResult[],
  resultsByGroup: GroupResults[],
  selectedViewCity: string,
): CityScopedDashboardData {
  const isSpecificCitySelected = Boolean(selectedViewCity && selectedViewCity !== "all");

  const filteredSessions = isSpecificCitySelected
    ? sessions.filter((session) => (session as SessionWithCity).city === selectedViewCity)
    : sessions;

  const latestSession = filteredSessions[0];

  const cityFilteredResults = isSpecificCitySelected
    ? latestSession
      ? latestResults.filter((result) => result.sessionId === latestSession.id)
      : []
    : latestResults;

  const cityFilteredResultsByGroup = isSpecificCitySelected
    ? latestSession
      ? resultsByGroup
          .map((group) => ({
            ...group,
            results: group.results.filter((result) => result.sessionId === latestSession.id),
          }))
          .filter((group) => group.results.length > 0)
      : []
    : resultsByGroup;

  return {
    isSpecificCitySelected,
    filteredSessions,
    selectedCityHasNoData: isSpecificCitySelected && filteredSessions.length === 0,
    latestSession,
    previousSession: filteredSessions[1],
    cityFilteredResults,
    cityFilteredResultsByGroup,
  };
}

export function selectBrandSentimentGroupIds(resultsByGroup: GroupResults[]): Set<number> {
  return new Set(
    resultsByGroup.filter((group) => group.promptCategory === "brand_sentiment").map((group) => group.groupId),
  );
}

export function selectAggregatedScores(
  sessions: CheckSession[],
  isSpecificCitySelected: boolean,
): { overallScore: number; chatgptScore: number; googleAIScore: number } | null {
  if (isSpecificCitySelected) {
    return null;
  }

  const sortedSessions = [...sessions].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  const citySessionMap = new Map<string | null, CheckSession>();
  for (const session of sortedSessions) {
    const city = (session as SessionWithCity).city ?? null;
    if (!citySessionMap.has(city)) {
      citySessionMap.set(city, session);
    }
  }

  const latestSessionPerCity = Array.from(citySessionMap.values());
  if (!latestSessionPerCity.length) {
    return null;
  }

  return {
    overallScore: Math.round(
      latestSessionPerCity.reduce((sum, session) => sum + (session.overallScore ?? 0), 0) /
        latestSessionPerCity.length,
    ),
    chatgptScore: Math.round(
      latestSessionPerCity.reduce((sum, session) => sum + (session.chatgptScore ?? 0), 0) /
        latestSessionPerCity.length,
    ),
    googleAIScore: Math.round(
      latestSessionPerCity.reduce((sum, session) => sum + (session.googleAIScore ?? 0), 0) /
        latestSessionPerCity.length,
    ),
  };
}

export function computeVisibilityMetrics(serviceResultsOnly: CheckResult[]): VisibilityMetrics {
  const promptCount = serviceResultsOnly.length;
  const totalExposures = promptCount * 2;

  const chatgptFoundCount = serviceResultsOnly.filter((result) => result.chatgptFound).length;
  const googleAIFoundCount = serviceResultsOnly.filter((result) => result.googleAIFound).length;
  const chatgptCitedCount = serviceResultsOnly.filter((result) => result.chatgptCited).length;
  const googleAICitedCount = serviceResultsOnly.filter((result) => result.googleAICited).length;

  const foundCount = chatgptFoundCount + googleAIFoundCount;
  const citedCount = chatgptCitedCount + googleAICitedCount;

  return {
    promptCount,
    totalExposures,
    foundCount,
    citedCount,
    visibilityRate: totalExposures > 0 ? Math.round((foundCount / totalExposures) * 100) : 0,
    citationRate: totalExposures > 0 ? Math.round((citedCount / totalExposures) * 100) : 0,
    chatgptVisibility: promptCount > 0 ? Math.round((chatgptFoundCount / promptCount) * 100) : 0,
    googleAIVisibility: promptCount > 0 ? Math.round((googleAIFoundCount / promptCount) * 100) : 0,
    chatgptFoundCount,
    googleAIFoundCount,
  };
}

export function computeAverageRank(results: CheckResult[]): number | null {
  const chatgptRanks = results.filter((result) => result.chatgptRank != null).map((result) => result.chatgptRank as number);
  const googleRanks = results.filter((result) => result.googleAIRank != null).map((result) => result.googleAIRank as number);
  const allRanks = [...chatgptRanks, ...googleRanks];

  if (!allRanks.length) {
    return null;
  }

  return Math.round((allRanks.reduce((a, b) => a + b, 0) / allRanks.length) * 10) / 10;
}


function buildCompetitorMentions(results: CheckResult[], businessName: string): Map<string, { name: string; count: number }> {
  const mentions = new Map<string, { name: string; count: number }>();

  results.forEach((result) => {
    parseCompetitors(result).forEach((competitor) => {
      const trimmedName = competitor.trim();
      const normalizedName = trimmedName.toLowerCase();

      if (!trimmedName || normalizedName === businessName.toLowerCase()) {
        return;
      }

      const existing = mentions.get(normalizedName);
      if (existing) {
        existing.count += 1;
      } else {
        mentions.set(normalizedName, { name: trimmedName, count: 1 });
      }
    });
  });

  return mentions;
}

export function computeCompetitorVisibility(results: CheckResult[], businessName: string): CompetitorVisibility[] {
  const competitorMentions = buildCompetitorMentions(results, businessName);
  const totalPrompts = results.length;

  return Array.from(competitorMentions.values())
    .map(({ name, count }) => ({
      name,
      mentionCount: count,
      visibilityPercent: totalPrompts > 0 ? Math.round((count / totalPrompts) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.visibilityPercent - a.visibilityPercent)
    .slice(0, 5);
}

export function computeShareOfVoice(results: CheckResult[], businessName: string): ShareOfVoiceItem[] {
  if (!results.length) {
    return [];
  }

  const brandMentions = results.filter((result) => result.chatgptFound || result.googleAIFound).length;
  const competitorMentions = buildCompetitorMentions(results, businessName);

  const competitorTotalMentions = Array.from(competitorMentions.values()).reduce((sum, entry) => sum + entry.count, 0);
  const totalMentions = brandMentions + competitorTotalMentions;
  if (!totalMentions) {
    return [];
  }

  const shareOfVoice: ShareOfVoiceItem[] = [
    {
      name: businessName,
      mentionCount: brandMentions,
      percentage: Math.round((brandMentions / totalMentions) * 100),
    },
  ];

  Array.from(competitorMentions.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)
    .forEach(({ name, count }) => {
      shareOfVoice.push({
        name,
        mentionCount: count,
        percentage: Math.round((count / totalMentions) * 100),
      });
    });

  return shareOfVoice;
}

export function computeTopCitations(results: CheckResult[]): Citation[] {
  const citationCounts: Record<string, number> = {};

  results.forEach((result) => {
    if (result.chatgptCitations) {
      const citations = result.chatgptCitations as { url?: string; domain?: string }[];
      if (Array.isArray(citations)) {
        citations.forEach((citation) => {
          try {
            const domain = citation.domain || (citation.url ? new URL(citation.url).hostname : null);
            if (domain && !isDomainExcluded(domain)) {
              citationCounts[domain] = (citationCounts[domain] || 0) + 1;
            }
          } catch {
            // Ignore malformed citation URLs.
          }
        });
      }
    }

    if (result.googleAICitations) {
      const citations = result.googleAICitations as { url?: string; domain?: string }[];
      if (Array.isArray(citations)) {
        citations.forEach((citation) => {
          try {
            const domain = citation.domain || (citation.url ? new URL(citation.url).hostname : null);
            if (domain && !isDomainExcluded(domain)) {
              citationCounts[domain] = (citationCounts[domain] || 0) + 1;
            }
          } catch {
            // Ignore malformed citation URLs.
          }
        });
      }
    }
  });

  return Object.entries(citationCounts)
    .map(([domain, count]) => ({ domain, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
}

export function computeFirstPlaceCount(results: CheckResult[]): number {
  let count = 0;
  results.forEach((result) => {
    if (result.chatgptRank === 1) {
      count += 1;
    }
    if (result.googleAIRank === 1) {
      count += 1;
    }
  });
  return count;
}

export function buildSessionChartData(
  filteredSessions: CheckSession[],
  isSpecificCitySelected: boolean,
): SessionChartDataPoint[] {
  if (isSpecificCitySelected) {
    return filteredSessions.slice().reverse().map((session) => ({
      date: format(new Date(session.createdAt), "MMM d"),
      overall: session.overallScore,
      chatgpt: session.chatgptScore,
      googleAI: session.googleAIScore,
      city: (session as SessionWithCity).city ?? null,
    }));
  }

  const dateGroupMap = new Map<string, { dateObj: Date; sessions: CheckSession[] }>();

  for (const session of filteredSessions) {
    const dateObj = new Date(session.createdAt);
    const dateKey = format(dateObj, "yyyy-MM-dd");

    if (!dateGroupMap.has(dateKey)) {
      dateGroupMap.set(dateKey, { dateObj, sessions: [] });
    }
    dateGroupMap.get(dateKey)?.sessions.push(session);
  }

  return Array.from(dateGroupMap.values())
    .sort((a, b) => a.dateObj.getTime() - b.dateObj.getTime())
    .map(({ dateObj, sessions }) => ({
      date: format(dateObj, "MMM d"),
      overall: Math.round(sessions.reduce((sum, session) => sum + (session.overallScore ?? 0), 0) / sessions.length),
      chatgpt: Math.round(sessions.reduce((sum, session) => sum + (session.chatgptScore ?? 0), 0) / sessions.length),
      googleAI: Math.round(sessions.reduce((sum, session) => sum + (session.googleAIScore ?? 0), 0) / sessions.length),
      city: null,
    }));
}

export function buildGroupTrendChartData(groupTrends: GroupTrendData[]): Record<string, string | number>[] {
  if (!groupTrends.length) {
    return [];
  }

  const allDatesMap = new Map<string, Date>();
  groupTrends.forEach((group) => {
    group.data.forEach((datum) => {
      if (datum.date) {
        const dateObj = new Date(datum.date);
        allDatesMap.set(dateObj.toISOString(), dateObj);
      }
    });
  });

  return Array.from(allDatesMap.entries())
    .sort((a, b) => a[1].getTime() - b[1].getTime())
    .map(([isoKey, dateObj]) => {
      const point: Record<string, string | number> = { date: format(dateObj, "MMM d") };
      groupTrends.forEach((group) => {
        const match = group.data.find((datum) => datum.date && new Date(datum.date).toISOString() === isoKey);
        point[group.groupName] = match?.visibilityScore ?? 0;
      });
      return point;
    });
}

export function buildCompetitorTrendChartData(
  competitorTrends: CompetitorTrendData[],
): Record<string, string | number>[] {
  if (!competitorTrends.length) {
    return [];
  }

  const allDatesMap = new Map<string, Date>();
  competitorTrends.forEach((competitor) => {
    competitor.data.forEach((datum) => {
      if (datum.date) {
        const dateObj = new Date(datum.date);
        allDatesMap.set(dateObj.toISOString(), dateObj);
      }
    });
  });

  return Array.from(allDatesMap.entries())
    .sort((a, b) => a[1].getTime() - b[1].getTime())
    .map(([isoKey, dateObj]) => {
      const point: Record<string, string | number> = { date: format(dateObj, "MMM d") };
      competitorTrends.forEach((competitor) => {
        const match = competitor.data.find((datum) => datum.date && new Date(datum.date).toISOString() === isoKey);
        point[competitor.competitorName] = match ? Math.round(match.visibilityPercent * 10) / 10 : 0;
      });
      return point;
    });
}

export function buildGroupBarData(serviceResultsByGroup: GroupResults[]) {
  return serviceResultsByGroup.map((group) => {
    const groupFoundCount = group.results.filter((result) => result.chatgptFound || result.googleAIFound).length;
    const total = group.results.length;

    return {
      name: group.groupName.length > 15 ? `${group.groupName.slice(0, 15)}...` : group.groupName,
      fullName: group.groupName,
      visibility: total > 0 ? Math.round((groupFoundCount / total) * 100) : 0,
      total,
    };
  });
}

export function filterResultsByGroup(serviceResultsOnly: CheckResult[], selectedGroup: string): CheckResult[] {
  return selectedGroup === "all"
    ? serviceResultsOnly
    : serviceResultsOnly.filter((result) => result.groupId === parseInt(selectedGroup));
}
