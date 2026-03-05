import test from "node:test";
import assert from "node:assert/strict";

import { saveMonitoringClientConfig, type MonitoringClientConfigStorage } from "./client-config";

function createStorageMock(overrides: Partial<MonitoringClientConfigStorage> = {}): MonitoringClientConfigStorage {
  const base: MonitoringClientConfigStorage = {
    async getMonitoringClientByBusinessNameAndDomain() {
      return undefined;
    },
    async updateMonitoringClient() {
      return { id: 1 };
    },
    async createMonitoringClient() {
      return { id: 1 };
    },
    async getGroupsByClientId() {
      return [];
    },
    async getPromptsByClientId() {
      return [];
    },
    async updateGroup() {
      return {};
    },
    async updatePrompt() {
      return {};
    },
    async createGroup() {
      return { id: 100 };
    },
    async createPrompt() {
      return {};
    },
  };

  return { ...base, ...overrides };
}

const validClient = {
  businessName: "Acme",
  domain: "acme.com",
  industry: "HVAC",
  scope: "local",
  city: "Austin",
  cities: ["Austin"],
  primaryCategories: ["HVAC"],
  brandAliases: null,
  checkFrequencyDays: 14,
};

test("saveMonitoringClientConfig creates a new client and seeds groups/prompts when no config exists", async () => {
  const createGroupCalls: string[] = [];
  const createPromptCalls: Array<{ groupId: number; text: string }> = [];
  let groupsLookupCount = 0;
  let promptsLookupCount = 0;
  let nextGroupId = 201;

  const storage = createStorageMock({
    async createGroup(data) {
      createGroupCalls.push(data.name as string);
      return { id: nextGroupId++ };
    },
    async createPrompt(data) {
      createPromptCalls.push({ groupId: data.groupId as number, text: data.promptText as string });
      return {};
    },
    async getGroupsByClientId() {
      // first call: before seeding, second call: after seeding
      groupsLookupCount += 1;
      if (groupsLookupCount === 1) return [];
      return [
        { id: 201, name: "Repair", isActive: true },
        { id: 202, name: "Install", isActive: true },
        { id: 203, name: "Brand Sentiment", promptCategory: "brand_sentiment", isActive: true },
      ];
    },
    async getPromptsByClientId() {
      // first call: before seeding, second call: after seeding
      promptsLookupCount += 1;
      if (promptsLookupCount === 1) return [];
      return [
        { id: 1, groupId: 201, isActive: true },
        { id: 2, groupId: 202, isActive: true },
        { id: 3, groupId: 202, isActive: false },
        { id: 4, groupId: 203, isActive: true },
        { id: 5, groupId: 203, isActive: true },
        { id: 6, groupId: 203, isActive: true },
        { id: 7, groupId: 203, isActive: true },
      ];
    },
  });

  const result = await saveMonitoringClientConfig(
    storage,
    validClient,
    [
      { name: "Repair", description: "Fixes" },
      { name: "Install", description: "New systems" },
    ],
    [
      { groupName: "Repair", text: "best repair company" },
      { groupName: "Install", text: "new hvac install near me" },
    ],
  );

  assert.equal(result.clientId, 1);
  // 2 service prompts + 4 brand sentiment prompts = 6 active
  assert.equal(result.totalPrompts, 6);
  assert.deepEqual(createGroupCalls, ["Repair", "Install", "Brand Sentiment"]);
  // Should include service prompts and 4 brand sentiment prompts
  assert.equal(createPromptCalls.filter(p => p.groupId === 201).length, 1);
  assert.equal(createPromptCalls.filter(p => p.groupId === 202).length, 1);
  assert.equal(createPromptCalls.filter(p => p.groupId === 203).length, 4);
});

test("saveMonitoringClientConfig updates an existing client and does not overwrite existing groups/prompts", async () => {
  const createGroupCalls: string[] = [];
  const createPromptCalls: Array<{ groupId: number; text: string }> = [];
  let groupsLookupCount = 0;
  let promptsLookupCount = 0;

  // Existing brand sentiment prompts (already seeded)
  const existingBrandPrompts = [
    { id: 50, groupId: 13, promptText: `What do you know about Acme in Austin? Is it a reputable HVAC business?`, isActive: true },
    { id: 51, groupId: 13, promptText: `What are customers saying about Acme? What are common complaints or praise points for this HVAC company?`, isActive: true },
    { id: 52, groupId: 13, promptText: `Would you recommend Acme in Austin for HVAC services? What are the pros and cons?`, isActive: true },
    { id: 53, groupId: 13, promptText: `What should someone know before hiring Acme? Are there any red flags or issues with this HVAC business?`, isActive: true },
  ];

  const storage = createStorageMock({
    async getMonitoringClientByBusinessNameAndDomain() {
      return { id: 42 };
    },
    async updateMonitoringClient() {
      return { id: 42 };
    },
    async getGroupsByClientId() {
      groupsLookupCount += 1;
      if (groupsLookupCount === 1) {
        return [
          { id: 11, name: "Existing Group", isActive: true },
          { id: 13, name: "Brand Sentiment", promptCategory: "brand_sentiment", isActive: true },
        ];
      }
      return [
        { id: 11, name: "Existing Group", isActive: true },
        { id: 12, name: "New Group", isActive: true },
        { id: 13, name: "Brand Sentiment", promptCategory: "brand_sentiment", isActive: true },
      ];
    },
    async getPromptsByClientId() {
      promptsLookupCount += 1;
      if (promptsLookupCount === 1) {
        return [
          { id: 11, groupId: 11, promptText: "existing prompt", isActive: true },
          ...existingBrandPrompts,
        ];
      }
      return [
        { id: 11, groupId: 11, promptText: "existing prompt", isActive: true },
        { id: 12, groupId: 12, promptText: "new prompt", isActive: true },
        ...existingBrandPrompts,
      ];
    },
    async createGroup(data) {
      createGroupCalls.push(data.name as string);
      return { id: data.name === "New Group" ? 12 : 999 };
    },
    async createPrompt(data) {
      createPromptCalls.push({ groupId: data.groupId as number, text: data.promptText as string });
      return {};
    },
  });

  const result = await saveMonitoringClientConfig(
    storage,
    validClient,
    [
      { name: "Existing Group", description: "already exists" },
      { name: "New Group", description: "should be created" },
    ],
    [
      { groupName: "Existing Group", text: "existing prompt" },
      { groupName: "New Group", text: "new prompt" },
    ],
  );

  assert.equal(result.clientId, 42);
  assert.equal(result.totalPrompts, 6); // 2 service + 4 brand sentiment
  assert.deepEqual(createGroupCalls, ["New Group"]); // Brand Sentiment already exists
  assert.deepEqual(createPromptCalls, [{ groupId: 12, text: "new prompt" }]); // Brand prompts already exist
});

test("saveMonitoringClientConfig adds only missing config on partial overlap input", async () => {
  const createGroupCalls: string[] = [];
  const createPromptCalls: Array<{ groupId: number; text: string }> = [];
  let groupsLookupCount = 0;
  let promptsLookupCount = 0;

  const existingBrandPrompts = [
    { id: 50, groupId: 13, promptText: `What do you know about Acme in Austin? Is it a reputable HVAC business?`, isActive: true },
    { id: 51, groupId: 13, promptText: `What are customers saying about Acme? What are common complaints or praise points for this HVAC company?`, isActive: true },
    { id: 52, groupId: 13, promptText: `Would you recommend Acme in Austin for HVAC services? What are the pros and cons?`, isActive: true },
    { id: 53, groupId: 13, promptText: `What should someone know before hiring Acme? Are there any red flags or issues with this HVAC business?`, isActive: true },
  ];

  const storage = createStorageMock({
    async getMonitoringClientByBusinessNameAndDomain() {
      return { id: 77 };
    },
    async updateMonitoringClient() {
      return { id: 77 };
    },
    async getGroupsByClientId() {
      groupsLookupCount += 1;
      if (groupsLookupCount === 1) {
        return [
          { id: 11, name: "Existing Group", isActive: true },
          { id: 13, name: "Brand Sentiment", promptCategory: "brand_sentiment", isActive: true },
        ];
      }
      return [
        { id: 11, name: "Existing Group", isActive: true },
        { id: 12, name: "New Group", isActive: true },
        { id: 13, name: "Brand Sentiment", promptCategory: "brand_sentiment", isActive: true },
      ];
    },
    async getPromptsByClientId() {
      promptsLookupCount += 1;
      if (promptsLookupCount === 1) {
        return [
          { id: 11, groupId: 11, promptText: "existing prompt", isActive: true },
          ...existingBrandPrompts,
        ];
      }
      return [
        { id: 11, groupId: 11, promptText: "existing prompt", isActive: true },
        { id: 12, groupId: 12, promptText: "new prompt", isActive: true },
        ...existingBrandPrompts,
      ];
    },
    async createGroup(data) {
      createGroupCalls.push(data.name as string);
      return { id: 12 };
    },
    async createPrompt(data) {
      createPromptCalls.push({ groupId: data.groupId as number, text: data.promptText as string });
      return {};
    },
  });

  await saveMonitoringClientConfig(
    storage,
    validClient,
    [
      { name: "Existing Group", description: "already present" },
      { name: "New Group", description: "new input should be added" },
    ],
    [
      { groupName: "Existing Group", text: "existing prompt" },
      { groupName: "New Group", text: "new prompt" },
    ],
  );

  assert.deepEqual(createGroupCalls, ["New Group"]); // Brand Sentiment already exists
  assert.deepEqual(createPromptCalls, [{ groupId: 12, text: "new prompt" }]); // Brand prompts already exist
});

test("saveMonitoringClientConfig ignores prompts that reference unknown groups", async () => {
  const createPromptCalls: Array<{ groupId: number; text: string }> = [];
  let groupsLookupCount = 0;
  let promptsLookupCount = 0;

  const existingBrandPrompts = [
    { id: 60, groupId: 57, promptText: `What do you know about Acme in Austin? Is it a reputable HVAC business?`, isActive: true },
    { id: 61, groupId: 57, promptText: `What are customers saying about Acme? What are common complaints or praise points for this HVAC company?`, isActive: true },
    { id: 62, groupId: 57, promptText: `Would you recommend Acme in Austin for HVAC services? What are the pros and cons?`, isActive: true },
    { id: 63, groupId: 57, promptText: `What should someone know before hiring Acme? Are there any red flags or issues with this HVAC business?`, isActive: true },
  ];

  const storage = createStorageMock({
    async createGroup(data) {
      return { id: data.name === "Known" ? 55 : 56 };
    },
    async createPrompt(data) {
      createPromptCalls.push({ groupId: data.groupId as number, text: data.promptText as string });
      return {};
    },
    async getGroupsByClientId() {
      groupsLookupCount += 1;
      if (groupsLookupCount === 1) {
        return [
          { id: 57, name: "Brand Sentiment", promptCategory: "brand_sentiment", isActive: true },
        ];
      }
      return [
        { id: 55, name: "Known", isActive: true },
        { id: 57, name: "Brand Sentiment", promptCategory: "brand_sentiment", isActive: true },
      ];
    },
    async getPromptsByClientId() {
      promptsLookupCount += 1;
      if (promptsLookupCount === 1) {
        return [...existingBrandPrompts];
      }
      return [
        { id: 55, groupId: 55, isActive: true },
        ...existingBrandPrompts,
      ];
    },
  });

  await saveMonitoringClientConfig(
    storage,
    validClient,
    [{ name: "Known", description: "desc" }],
    [
      { groupName: "Known", text: "kept" },
      { groupName: "Missing", text: "ignored" },
      // missing groupName should be handled gracefully (ignored)
      { text: "ignored no group" },
    ],
  );

  assert.deepEqual(createPromptCalls, [{ groupId: 55, text: "kept" }]);
});

test("saveMonitoringClientConfig reactivates an existing inactive group with matching name", async () => {
  const updateGroupCalls: number[] = [];

  const existingBrandPrompts = [
    { id: 50, groupId: 22, promptText: `What do you know about Acme in Austin? Is it a reputable HVAC business?`, isActive: true },
    { id: 51, groupId: 22, promptText: `What are customers saying about Acme? What are common complaints or praise points for this HVAC company?`, isActive: true },
    { id: 52, groupId: 22, promptText: `Would you recommend Acme in Austin for HVAC services? What are the pros and cons?`, isActive: true },
    { id: 53, groupId: 22, promptText: `What should someone know before hiring Acme? Are there any red flags or issues with this HVAC business?`, isActive: true },
  ];

  const storage = createStorageMock({
    async getMonitoringClientByBusinessNameAndDomain() {
      return { id: 88 };
    },
    async updateMonitoringClient() {
      return { id: 88 };
    },
    async getGroupsByClientId() {
      return [
        { id: 21, name: "Dormant Group", isActive: false },
        { id: 22, name: "Brand Sentiment", promptCategory: "brand_sentiment", isActive: true },
      ];
    },
    async getPromptsByClientId() {
      return [...existingBrandPrompts];
    },
    async updateGroup(id) {
      updateGroupCalls.push(id as number);
      return {};
    },
  });

  await saveMonitoringClientConfig(
    storage,
    validClient,
    [{ name: "Dormant Group", description: "reactivate" }],
    [],
  );

  assert.deepEqual(updateGroupCalls, [21]);
});

test("saveMonitoringClientConfig reactivates matching inactive prompt instead of skipping it", async () => {
  const updatePromptCalls: number[] = [];
  const createPromptCalls: number[] = [];
  let promptsLookupCount = 0;

  const existingBrandPrompts = [
    { id: 80, groupId: 32, promptText: `What do you know about Acme in Austin? Is it a reputable HVAC business?`, isActive: true },
    { id: 81, groupId: 32, promptText: `What are customers saying about Acme? What are common complaints or praise points for this HVAC company?`, isActive: true },
    { id: 82, groupId: 32, promptText: `Would you recommend Acme in Austin for HVAC services? What are the pros and cons?`, isActive: true },
    { id: 83, groupId: 32, promptText: `What should someone know before hiring Acme? Are there any red flags or issues with this HVAC business?`, isActive: true },
  ];

  const storage = createStorageMock({
    async getMonitoringClientByBusinessNameAndDomain() {
      return { id: 99 };
    },
    async updateMonitoringClient() {
      return { id: 99 };
    },
    async getGroupsByClientId() {
      return [
        { id: 31, name: "Services", isActive: true },
        { id: 32, name: "Brand Sentiment", promptCategory: "brand_sentiment", isActive: true },
      ];
    },
    async getPromptsByClientId() {
      promptsLookupCount += 1;
      if (promptsLookupCount === 1) {
        return [
          { id: 71, groupId: 31, promptText: "same prompt", isActive: false },
          ...existingBrandPrompts,
        ];
      }
      return [
        { id: 71, groupId: 31, promptText: "same prompt", isActive: true },
        ...existingBrandPrompts,
      ];
    },
    async updatePrompt(id) {
      updatePromptCalls.push(id as number);
      return {};
    },
    async createPrompt(data) {
      createPromptCalls.push(data.groupId as number);
      return {};
    },
  });

  const result = await saveMonitoringClientConfig(
    storage,
    validClient,
    [{ name: "Services", description: "existing" }],
    [{ groupName: "Services", text: "same prompt" }],
  );

  assert.deepEqual(updatePromptCalls, [71]);
  assert.deepEqual(createPromptCalls, []);
  assert.equal(result.totalPrompts, 5); // 1 service + 4 brand sentiment
});

test("saveMonitoringClientConfig seeds brand sentiment group/prompts even without brand aliases", async () => {
  const createGroupCalls: Array<{ name: string; promptCategory?: string }> = [];
  const createPromptCalls: Array<{ groupId: number; text: string }> = [];
  let groupsLookupCount = 0;
  let promptsLookupCount = 0;

  const storage = createStorageMock({
    async getMonitoringClientByBusinessNameAndDomain() {
      return { id: 123 };
    },
    async updateMonitoringClient() {
      return { id: 123 };
    },
    async createGroup(data) {
      createGroupCalls.push({ name: data.name as string, promptCategory: data.promptCategory as string | undefined });
      if ((data.promptCategory as string | undefined) === "brand_sentiment") {
        return { id: 90 };
      }
      return { id: 91 };
    },
    async createPrompt(data) {
      createPromptCalls.push({ groupId: data.groupId as number, text: data.promptText as string });
      return {};
    },
    async getGroupsByClientId() {
      groupsLookupCount += 1;
      if (groupsLookupCount === 1) return [];
      return [{ id: 90, name: "Brand Sentiment", promptCategory: "brand_sentiment", isActive: true }];
    },
    async getPromptsByClientId() {
      promptsLookupCount += 1;
      if (promptsLookupCount === 1) return [];
      return createPromptCalls.map((p, idx) => ({ id: idx + 1, groupId: p.groupId, promptText: p.text, isActive: true }));
    },
  });

  await saveMonitoringClientConfig(
    storage,
    validClient,  // brandAliases is null — sentiment should still be created
    [],
    [],
  );

  assert.equal(createGroupCalls.some(c => c.promptCategory === "brand_sentiment"), true);
  assert.equal(createPromptCalls.filter(p => p.groupId === 90).length, 4);
});
