import test from "node:test";
import assert from "node:assert/strict";
import type { CheckResult, CheckSession } from "@shared/schema";
import {
  buildSessionChartData,
  computeShareOfVoice,
  computeTopCitations,
  computeVisibilityMetrics,
  selectCityScopedDashboardData,
  type GroupResults,
} from "@/features/monitor-dashboard/selectors";

type SessionWithCity = CheckSession & { city?: string | null };

function makeResult(overrides: Partial<CheckResult> = {}): CheckResult {
  return {
    id: 1,
    sessionId: 10,
    groupId: 1,
    promptText: "prompt",
    promptCategory: "services",
    chatgptFound: false,
    googleAIFound: false,
    chatgptCited: false,
    googleAICited: false,
    chatgptRank: null,
    googleAIRank: null,
    competitors: null,
    chatgptCitations: null,
    googleAICitations: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  } as CheckResult;
}

function makeSession(overrides: Partial<CheckSession> = {}): CheckSession {
  return {
    id: 1,
    clientId: 10,
    overallScore: 0,
    chatgptScore: 0,
    googleAIScore: 0,
    totalPrompts: 0,
    completedPrompts: 0,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  } as CheckSession;
}

test("selectCityScopedDashboardData returns empty city results when selected city has no sessions", () => {
  const sessions: SessionWithCity[] = [{ ...makeSession({ id: 1, createdAt: new Date("2026-01-01") }), city: "Austin" }];
  const latestResults = [makeResult({ sessionId: 1 })];
  const resultsByGroup: GroupResults[] = [
    { groupId: 1, groupName: "Group", promptCategory: "services", results: latestResults },
  ];

  const result = selectCityScopedDashboardData(sessions, latestResults, resultsByGroup, "Dallas");

  assert.equal(result.isSpecificCitySelected, true);
  assert.equal(result.selectedCityHasNoData, true);
  assert.deepEqual(result.cityFilteredResults, []);
  assert.deepEqual(result.cityFilteredResultsByGroup, []);
});

test("selectCityScopedDashboardData returns selected-city latest-session data when city has sessions", () => {
  const sessions: SessionWithCity[] = [
    { ...makeSession({ id: 3, createdAt: new Date("2026-01-03") }), city: "Austin" },
    { ...makeSession({ id: 2, createdAt: new Date("2026-01-02") }), city: "Dallas" },
    { ...makeSession({ id: 1, createdAt: new Date("2026-01-01") }), city: "Dallas" },
  ];
  const latestResults = [
    makeResult({ id: 100, sessionId: 2, groupId: 10 }),
    makeResult({ id: 101, sessionId: 1, groupId: 10 }),
    makeResult({ id: 102, sessionId: 3, groupId: 11 }),
  ];
  const resultsByGroup: GroupResults[] = [
    {
      groupId: 10,
      groupName: "Services",
      promptCategory: "services",
      results: latestResults.filter((result) => result.groupId === 10),
    },
  ];

  const result = selectCityScopedDashboardData(sessions, latestResults, resultsByGroup, "Dallas");

  assert.equal(result.selectedCityHasNoData, false);
  assert.equal(result.latestSession?.id, 2);
  assert.equal(result.previousSession?.id, 1);
  assert.deepEqual(result.cityFilteredResults.map((entry) => entry.id), [100]);
  assert.deepEqual(result.cityFilteredResultsByGroup[0].results.map((entry) => entry.id), [100]);
});

test("computeShareOfVoice merges competitor mentions case-insensitively", () => {
  const results = [
    makeResult({ chatgptFound: true, competitors: JSON.stringify(["Competitor A", "Acme"]) }),
    makeResult({ googleAIFound: true, competitors: JSON.stringify(["Competitor A", "Competitor B"]) }),
    makeResult({ competitors: JSON.stringify(["competitor b"]) }),
  ];

  const share = computeShareOfVoice(results, "Acme");

  assert.equal(share[0].name, "Acme");
  assert.equal(share[0].mentionCount, 2);
  assert.equal(share.find((entry) => entry.name === "Competitor A")?.mentionCount, 2);
  assert.equal(share.find((entry) => entry.name === "Competitor B")?.mentionCount, 2);
  assert.equal(share.some((entry) => entry.name === "competitor b"), false);
});

test("computeTopCitations excludes known internal domains and handles mixed citation formats", () => {
  // ChatGPT and Google AI payloads can include either `url` or pre-parsed `domain` fields.
  const results = [
    makeResult({
      chatgptCitations: [
        { url: "https://example.com/path" },
        { domain: "vertexaisearch.cloud.google.com" },
        { url: "bad-url" },
      ],
      googleAICitations: [{ domain: "trusted-source.com" }],
    }),
  ];

  const citations = computeTopCitations(results);

  assert.deepEqual(citations, [
    { domain: "example.com", count: 1 },
    { domain: "trusted-source.com", count: 1 },
  ]);
});

test("computeVisibilityMetrics uses prompt x platform exposure denominator", () => {
  const results = [
    makeResult({ chatgptFound: true, chatgptCited: true }),
    makeResult({ googleAIFound: true, googleAICited: true }),
  ];

  const metrics = computeVisibilityMetrics(results);

  assert.equal(metrics.promptCount, 2);
  assert.equal(metrics.totalExposures, 4);
  assert.equal(metrics.foundCount, 2);
  assert.equal(metrics.citedCount, 2);
  assert.equal(metrics.chatgptFoundCount, 1);
  assert.equal(metrics.googleAIFoundCount, 1);
  assert.equal(metrics.visibilityRate, 50);
  assert.equal(metrics.citationRate, 50);
  assert.equal(metrics.chatgptVisibility, 50);
  assert.equal(metrics.googleAIVisibility, 50);
});

test("computeVisibilityMetrics returns 0 rates when no exposures have matches", () => {
  const metrics = computeVisibilityMetrics([makeResult(), makeResult({ id: 2 })]);

  assert.equal(metrics.promptCount, 2);
  assert.equal(metrics.totalExposures, 4);
  assert.equal(metrics.foundCount, 0);
  assert.equal(metrics.citedCount, 0);
  assert.equal(metrics.chatgptFoundCount, 0);
  assert.equal(metrics.googleAIFoundCount, 0);
  assert.equal(metrics.visibilityRate, 0);
  assert.equal(metrics.citationRate, 0);
  assert.equal(metrics.chatgptVisibility, 0);
  assert.equal(metrics.googleAIVisibility, 0);
});

test("buildSessionChartData aggregates all-cities rows by date", () => {
  const sessions = [
    makeSession({ id: 1, createdAt: new Date("2026-01-01T08:00:00Z"), overallScore: 80, chatgptScore: 70, googleAIScore: 90 }),
    makeSession({ id: 2, createdAt: new Date("2026-01-01T10:00:00Z"), overallScore: 60, chatgptScore: 50, googleAIScore: 70 }),
    makeSession({ id: 3, createdAt: new Date("2026-01-02T10:00:00Z"), overallScore: 100, chatgptScore: 100, googleAIScore: 100 }),
  ];

  const chartData = buildSessionChartData(sessions, false);

  assert.equal(chartData.length, 2);
  assert.deepEqual(chartData[0], {
    date: "Jan 1",
    overall: 70,
    chatgpt: 60,
    googleAI: 80,
    city: null,
  });
  assert.deepEqual(chartData[1], {
    date: "Jan 2",
    overall: 100,
    chatgpt: 100,
    googleAI: 100,
    city: null,
  });
});
