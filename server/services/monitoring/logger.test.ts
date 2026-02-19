import test from "node:test";
import assert from "node:assert/strict";

test("logger test harness is wired", () => {
  assert.equal("logger", "logger");
});
