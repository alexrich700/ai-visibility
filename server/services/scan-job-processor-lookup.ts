import { PROMPT_CATEGORIES, type MonitoringGroup, type MonitoringPrompt } from "@shared/schema";

export type ServiceResultStatusCounts = {
  found: number;
  chatgptFound: number;
  googleAIFound: number;
  cited: number;
};

export function buildPromptLookupData(
  activeGroups: MonitoringGroup[],
  prompts: MonitoringPrompt[]
): {
  groupById: Map<number, MonitoringGroup>;
  brandSentimentGroupIds: Set<number>;
  promptCountByGroupId: Map<number, number>;
  servicePromptCount: number;
} {
  const groupById = new Map(activeGroups.map(group => [group.id, group]));
  const brandSentimentGroupIds = new Set(
    activeGroups
      .filter(g => g.promptCategory === PROMPT_CATEGORIES.BRAND_SENTIMENT)
      .map(g => g.id)
  );
  const promptCountByGroupId = new Map<number, number>();
  let servicePromptCount = 0;

  for (const prompt of prompts) {
    promptCountByGroupId.set(prompt.groupId, (promptCountByGroupId.get(prompt.groupId) || 0) + 1);
    if (!brandSentimentGroupIds.has(prompt.groupId)) {
      servicePromptCount++;
    }
  }

  return {
    groupById,
    brandSentimentGroupIds,
    promptCountByGroupId,
    servicePromptCount,
  };
}

export function countServiceResultStatuses(
  serviceResults: Array<{
    chatgptFound: boolean | null;
    googleAIFound: boolean | null;
    chatgptCited: boolean | null;
    googleAICited: boolean | null;
  }>
): ServiceResultStatusCounts {
  const statusCounts: ServiceResultStatusCounts = {
    found: 0,
    chatgptFound: 0,
    googleAIFound: 0,
    cited: 0,
  };

  for (const result of serviceResults) {
    if (result.chatgptFound || result.googleAIFound) statusCounts.found++;
    if (result.chatgptFound) statusCounts.chatgptFound++;
    if (result.googleAIFound) statusCounts.googleAIFound++;
    if (result.chatgptCited || result.googleAICited) statusCounts.cited++;
  }

  return statusCounts;
}
