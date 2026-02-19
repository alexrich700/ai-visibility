import test from "node:test";
import assert from "node:assert/strict";

import {
  PROMPTS_PER_GROUP,
  SENTIMENT_PROMPT_COUNT,
  LEAD_GEN_TOTAL_PROMPTS,
} from "@shared/audit-constants";

test("lead gen total prompts matches configured research + sentiment prompt counts", () => {
  assert.equal(LEAD_GEN_TOTAL_PROMPTS, PROMPTS_PER_GROUP + SENTIMENT_PROMPT_COUNT);
});
