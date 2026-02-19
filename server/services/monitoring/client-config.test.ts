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
  brandAliases: ["Acme Heating"],
  checkFrequencyDays: 14,
};

test("saveMonitoringClientConfig creates a new client and seeds groups/prompts when no config exists", async () => {
  const createGroupCalls: string[] = [];
  const createPromptCalls: Array<{ groupId: number; text: string }> = [];
  let groupsLookupCount = 0;
  let promptsLookupCount = 0;

  const storage = createStorageMock({
    async createGroup(data) {
      createGroupCalls.push(data.name as string);
      return { id: data.name === "Repair" ? 201 : 202 };
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
  assert.equal(result.totalPrompts, 2);
  assert.deepEqual(createGroupCalls, ["Repair", "Install"]);
  assert.deepEqual(createPromptCalls, [
    { groupId: 201, text: "best repair company" },
    { groupId: 202, text: "new hvac install near me" },
  ]);
});

test("saveMonitoringClientConfig updates an existing client and does not overwrite existing groups/prompts", async () => {
  const createGroupCalls: string[] = [];
  const createPromptCalls: Array<{ groupId: number; text: string }> = [];
  let groupsLookupCount = 0;
  let promptsLookupCount = 0;

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
        return [{ id: 11, name: "Existing Group", isActive: true }];
      }
      return [
        { id: 11, name: "Existing Group", isActive: true },
        { id: 12, name: "New Group", isActive: true },
      ];
    },
    async getPromptsByClientId() {
      promptsLookupCount += 1;
      if (promptsLookupCount === 1) {
        return [{ id: 11, groupId: 11, promptText: "existing prompt", isActive: true }];
      }
      return [
        { id: 11, groupId: 11, promptText: "existing prompt", isActive: true },
        { id: 12, groupId: 12, promptText: "new prompt", isActive: true },
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
  assert.equal(result.totalPrompts, 2);
  assert.deepEqual(createGroupCalls, ["New Group"]);
  assert.deepEqual(createPromptCalls, [{ groupId: 12, text: "new prompt" }]);
});

test("saveMonitoringClientConfig adds only missing config on partial overlap input", async () => {
  const createGroupCalls: string[] = [];
  const createPromptCalls: Array<{ groupId: number; text: string }> = [];
  let groupsLookupCount = 0;
  let promptsLookupCount = 0;

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
        return [{ id: 11, name: "Existing Group", isActive: true }];
      }
      return [
        { id: 11, name: "Existing Group", isActive: true },
        { id: 12, name: "New Group", isActive: true },
      ];
    },
    async getPromptsByClientId() {
      promptsLookupCount += 1;
      if (promptsLookupCount === 1) {
        return [{ id: 11, groupId: 11, promptText: "existing prompt", isActive: true }];
      }
      return [
        { id: 11, groupId: 11, promptText: "existing prompt", isActive: true },
        { id: 12, groupId: 12, promptText: "new prompt", isActive: true },
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

  assert.deepEqual(createGroupCalls, ["New Group"]);
  assert.deepEqual(createPromptCalls, [{ groupId: 12, text: "new prompt" }]);
});

test("saveMonitoringClientConfig ignores prompts that reference unknown groups", async () => {
  const createPromptCalls: Array<{ groupId: number; text: string }> = [];
  let groupsLookupCount = 0;
  let promptsLookupCount = 0;

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
      if (groupsLookupCount === 1) return [];
      return [{ id: 55, name: "Known", isActive: true }];
    },
    async getPromptsByClientId() {
      promptsLookupCount += 1;
      if (promptsLookupCount === 1) return [];
      return [{ id: 55, groupId: 55, isActive: true }];
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

  const storage = createStorageMock({
    async getMonitoringClientByBusinessNameAndDomain() {
      return { id: 88 };
    },
    async updateMonitoringClient() {
      return { id: 88 };
    },
    async getGroupsByClientId() {
      return [{ id: 21, name: "Dormant Group", isActive: false }];
    },
    async getPromptsByClientId() {
      return [];
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

  const storage = createStorageMock({
    async getMonitoringClientByBusinessNameAndDomain() {
      return { id: 99 };
    },
    async updateMonitoringClient() {
      return { id: 99 };
    },
    async getGroupsByClientId() {
      return [{ id: 31, name: "Services", isActive: true }];
    },
    async getPromptsByClientId() {
      promptsLookupCount += 1;
      if (promptsLookupCount === 1) {
        return [{ id: 71, groupId: 31, promptText: "same prompt", isActive: false }];
      }
      return [{ id: 71, groupId: 31, promptText: "same prompt", isActive: true }];
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
  assert.equal(result.totalPrompts, 1);
});
