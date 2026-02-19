import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PROMPT_CATEGORIES,
  type MonitoringGroup,
  type MonitoringPrompt,
} from '@shared/schema';
import { buildPromptLookupData, countServiceResultStatuses } from './scan-job-processor-lookup';

function createMonitoringGroup(overrides: Partial<MonitoringGroup>): MonitoringGroup {
  return {
    id: overrides.id ?? 1,
    clientId: overrides.clientId ?? 1,
    name: overrides.name ?? 'Default Group',
    description: overrides.description ?? null,
    isHighLevelCategory: overrides.isHighLevelCategory ?? false,
    promptCategory: overrides.promptCategory ?? PROMPT_CATEGORIES.SERVICE,
    isActive: overrides.isActive ?? true,
    createdAt: overrides.createdAt ?? new Date('2024-01-01T00:00:00.000Z'),
  };
}

function createMonitoringPrompt(overrides: Partial<MonitoringPrompt>): MonitoringPrompt {
  return {
    id: overrides.id ?? 1,
    groupId: overrides.groupId ?? 1,
    promptText: overrides.promptText ?? 'best service in city',
    isActive: overrides.isActive ?? true,
    createdAt: overrides.createdAt ?? new Date('2024-01-01T00:00:00.000Z'),
  };
}

test('buildPromptLookupData builds group map, prompt counts, and service prompt totals', () => {
  const activeGroups: MonitoringGroup[] = [
    createMonitoringGroup({ id: 1, name: 'Service', promptCategory: PROMPT_CATEGORIES.SERVICE }),
    createMonitoringGroup({ id: 2, name: 'Brand Sentiment', promptCategory: PROMPT_CATEGORIES.BRAND_SENTIMENT }),
  ];

  const prompts: MonitoringPrompt[] = [
    createMonitoringPrompt({ id: 11, groupId: 1 }),
    createMonitoringPrompt({ id: 12, groupId: 1 }),
    createMonitoringPrompt({ id: 13, groupId: 2 }),
  ];

  const lookupData = buildPromptLookupData(activeGroups, prompts);

  assert.equal(lookupData.groupById.get(1)?.name, 'Service');
  assert.equal(lookupData.groupById.get(2)?.name, 'Brand Sentiment');
  assert.equal(lookupData.promptCountByGroupId.get(1), 2);
  assert.equal(lookupData.promptCountByGroupId.get(2), 1);
  assert.equal(lookupData.servicePromptCount, 2);
  assert.equal(lookupData.brandSentimentGroupIds.has(2), true);
  assert.equal(lookupData.brandSentimentGroupIds.has(1), false);
});

test('countServiceResultStatuses computes found/cited counters in one pass', () => {
  const counts = countServiceResultStatuses([
    { chatgptFound: true, googleAIFound: false, chatgptCited: true, googleAICited: false },
    { chatgptFound: false, googleAIFound: true, chatgptCited: false, googleAICited: true },
    { chatgptFound: false, googleAIFound: false, chatgptCited: false, googleAICited: false },
    { chatgptFound: true, googleAIFound: true, chatgptCited: false, googleAICited: false },
  ]);

  assert.deepEqual(counts, {
    found: 3,
    chatgptFound: 2,
    googleAIFound: 2,
    cited: 2,
  });
});

test('countServiceResultStatuses returns zeros for empty arrays', () => {
  assert.deepEqual(countServiceResultStatuses([]), {
    found: 0,
    chatgptFound: 0,
    googleAIFound: 0,
    cited: 0,
  });
});

test('countServiceResultStatuses counts all dimensions when a single result is fully true', () => {
  assert.deepEqual(
    countServiceResultStatuses([
      { chatgptFound: true, googleAIFound: true, chatgptCited: true, googleAICited: true },
    ]),
    {
      found: 1,
      chatgptFound: 1,
      googleAIFound: 1,
      cited: 1,
    }
  );
});
