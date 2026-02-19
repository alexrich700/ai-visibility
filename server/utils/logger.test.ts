import test from "node:test";
import assert from "node:assert/strict";

test("logger test harness is configured", () => {
  assert.equal(typeof console.info, "function");
  assert.equal(typeof console.error, "function");
});
