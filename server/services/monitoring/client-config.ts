import { monitoringClientRequestSchema } from "@shared/schema";
import { z } from "zod";

type MonitoringClientConfigInput = z.infer<typeof monitoringClientRequestSchema>;

type IncomingGroup = {
  name: string;
  description?: string | null;
  isHighLevelCategory?: boolean;
};

type IncomingPrompt = {
  groupName?: string;
  text: string;
};

type ClientRecord = {
  id: number;
};

type GroupRecord = {
  id: number;
  name: string;
  promptCategory?: string;
  isActive: boolean;
};

type PromptRecord = {
  id: number;
  groupId: number;
  promptText?: string;
  isActive: boolean;
};

export interface MonitoringClientConfigStorage {
  getMonitoringClientByBusinessNameAndDomain(businessName: string, domain: string): Promise<ClientRecord | undefined>;
  updateMonitoringClient(id: number, data: Record<string, unknown>): Promise<ClientRecord | undefined>;
  createMonitoringClient(data: Record<string, unknown>): Promise<ClientRecord>;
  getGroupsByClientId(clientId: number): Promise<GroupRecord[]>;
  getPromptsByClientId(clientId: number): Promise<PromptRecord[]>;
  updateGroup(id: number, data: Record<string, unknown>): Promise<unknown>;
  updatePrompt(id: number, data: Record<string, unknown>): Promise<unknown>;
  createGroup(data: Record<string, unknown>): Promise<{ id: number }>;
  createPrompt(data: Record<string, unknown>): Promise<unknown>;
}

function buildBrandSentimentPrompts(businessName: string, industry: string, city?: string): string[] {
  const locationContext = city ? ` in ${city}` : "";

  return [
    `What do you know about ${businessName}${locationContext}? Is it a reputable ${industry} business?`,
    `What are customers saying about ${businessName}? What are common complaints or praise points for this ${industry} company?`,
    `Would you recommend ${businessName}${locationContext} for ${industry} services? What are the pros and cons?`,
    `What should someone know before hiring ${businessName}? Are there any red flags or issues with this ${industry} business?`,
  ];
}

export async function saveMonitoringClientConfig(
  storage: MonitoringClientConfigStorage,
  clientData: MonitoringClientConfigInput,
  groups: IncomingGroup[] = [],
  prompts: IncomingPrompt[] = [],
): Promise<{ clientId: number; totalPrompts: number }> {
  const existingClient = await storage.getMonitoringClientByBusinessNameAndDomain(
    clientData.businessName,
    clientData.domain,
  );

  let client: ClientRecord | undefined;

  const clientUpdateData = {
    businessName: clientData.businessName,
    domain: clientData.domain,
    industry: clientData.industry,
    scope: clientData.scope,
    city: clientData.city || null,
    cities: clientData.cities || null,
    primaryCategories: clientData.primaryCategories || null,
    brandAliases: clientData.brandAliases || null,
    checkFrequencyDays: clientData.checkFrequencyDays,
    isActive: true,
  };

  if (existingClient) {
    const updatedClient = await storage.updateMonitoringClient(existingClient.id, clientUpdateData);
    client = updatedClient || existingClient;
  } else {
    client = await storage.createMonitoringClient(clientUpdateData);
  }

  if (!client) {
    throw new Error("Failed to create or update monitoring client");
  }

  const existingGroups = await storage.getGroupsByClientId(client.id);
  const existingPrompts = await storage.getPromptsByClientId(client.id);

  const groupByName = new Map(existingGroups.map((group) => [group.name, group]));
  const groupIdMap = new Map(existingGroups.map((group) => [group.name, group.id]));

  for (const group of groups) {
    const existingGroup = groupByName.get(group.name);
    if (existingGroup) {
      if (!existingGroup.isActive) {
        await storage.updateGroup(existingGroup.id, { isActive: true });
        existingGroup.isActive = true;
      }
      continue;
    }

    const createdGroup = await storage.createGroup({
      clientId: client.id,
      name: group.name,
      description: group.description || null,
      isHighLevelCategory: group.isHighLevelCategory || false,
      promptCategory: "service",
      isActive: true,
    });
    groupIdMap.set(group.name, createdGroup.id);
  }

  const activePromptKeys = new Set(
    existingPrompts
      .filter((prompt) => prompt.isActive)
      .map((prompt) => `${prompt.groupId}::${prompt.promptText || ""}`),
  );
  const promptByKey = new Map(existingPrompts.map((prompt) => [`${prompt.groupId}::${prompt.promptText || ""}`, prompt]));

  // Ensure a brand sentiment group and prompts always exist so that every
  // client gets sentiment analysis on their dashboard, regardless of how
  // they were originally set up or whether brand aliases are configured.
  {
    const brandSentimentGroupName = "Brand Sentiment";
    let brandSentimentGroup = existingGroups.find(
      (group) => group.promptCategory === "brand_sentiment" || group.name === brandSentimentGroupName,
    );

    if (brandSentimentGroup) {
      if (!brandSentimentGroup.isActive) {
        await storage.updateGroup(brandSentimentGroup.id, { isActive: true });
        brandSentimentGroup.isActive = true;
      }
    } else {
      const createdGroup = await storage.createGroup({
        clientId: client.id,
        name: brandSentimentGroupName,
        description: "Direct brand questions to gather sentiment and feedback",
        isHighLevelCategory: false,
        promptCategory: "brand_sentiment",
        isActive: true,
      });

      brandSentimentGroup = {
        id: createdGroup.id,
        name: brandSentimentGroupName,
        promptCategory: "brand_sentiment",
        isActive: true,
      };
      groupByName.set(brandSentimentGroupName, brandSentimentGroup);
      groupIdMap.set(brandSentimentGroupName, createdGroup.id);
    }

    const brandSentimentPrompts = buildBrandSentimentPrompts(
      clientData.businessName,
      clientData.industry,
      clientData.city || undefined,
    );

    for (const promptText of brandSentimentPrompts) {
      const key = `${brandSentimentGroup.id}::${promptText}`;
      if (activePromptKeys.has(key)) continue;

      const existingPrompt = promptByKey.get(key);
      if (existingPrompt && !existingPrompt.isActive) {
        await storage.updatePrompt(existingPrompt.id, { isActive: true });
        existingPrompt.isActive = true;
        activePromptKeys.add(key);
        continue;
      }

      await storage.createPrompt({
        groupId: brandSentimentGroup.id,
        promptText,
        isActive: true,
      });
      activePromptKeys.add(key);
    }
  }

  for (const prompt of prompts) {
    if (!prompt.groupName) continue;
    const groupId = groupIdMap.get(prompt.groupName);
    if (!groupId) continue;

    const key = `${groupId}::${prompt.text}`;
    if (activePromptKeys.has(key)) continue;

    const existingPrompt = promptByKey.get(key);
    if (existingPrompt && !existingPrompt.isActive) {
      await storage.updatePrompt(existingPrompt.id, { isActive: true });
      existingPrompt.isActive = true;
      activePromptKeys.add(key);
      continue;
    }

    await storage.createPrompt({
      groupId,
      promptText: prompt.text,
      isActive: true,
    });
    activePromptKeys.add(key);
  }

  const groupsForClient = await storage.getGroupsByClientId(client.id);
  const promptsForClient = await storage.getPromptsByClientId(client.id);
  const activeGroupIds = new Set(groupsForClient.filter(g => g.isActive).map(g => g.id));
  const activePrompts = promptsForClient.filter(p => p.isActive && activeGroupIds.has(p.groupId));

  return {
    clientId: client.id,
    totalPrompts: activePrompts.length,
  };
}
