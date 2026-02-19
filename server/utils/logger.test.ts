import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createLogger } from "./logger";

type ConsoleMethod = "log" | "warn" | "error";

function captureConsole(methods: ConsoleMethod[]): {
  calls: Record<ConsoleMethod, string[]>;
  restore: () => void;
} {
  const calls: Record<ConsoleMethod, string[]> = { log: [], warn: [], error: [] };
  const originals: Partial<Record<ConsoleMethod, typeof console.log>> = {};

  for (const method of methods) {
    originals[method] = console[method].bind(console);
    console[method] = (...args: unknown[]) => {
      calls[method].push(args.map(String).join(" "));
    };
  }

  return {
    calls,
    restore: () => {
      for (const method of methods) {
        if (originals[method]) {
          console[method] = originals[method] as typeof console.log;
        }
      }
    },
  };
}

test("logger emits structured line with module and context", () => {
  const captured = captureConsole(["log"]);

  try {
    const logger = createLogger("unit-test", { clientId: 42 });
    logger.info("hello", { requestId: "req-1", jobId: "job-2" });
  } finally {
    captured.restore();
  }

  assert.equal(captured.calls.log.length, 1);
  const line = captured.calls.log[0];
  assert.match(line, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z \[INFO\] \[unit-test\] hello /);
  assert.match(line, /"clientId":42/);
  assert.match(line, /"requestId":"req-1"/);
  assert.match(line, /"jobId":"job-2"/);
});

test("logger routes warn/error to correct console methods", () => {
  const captured = captureConsole(["warn", "error"]);

  try {
    const logger = createLogger("unit-test");
    logger.warn("warn-message");
    logger.error("error-message");
  } finally {
    captured.restore();
  }

  assert.equal(captured.calls.warn.length, 1);
  assert.equal(captured.calls.error.length, 1);
  assert.match(captured.calls.warn[0], /\[WARN\] \[unit-test\] warn-message/);
  assert.match(captured.calls.error[0], /\[ERROR\] \[unit-test\] error-message/);
});

test("logger output without context omits context block", () => {
  const captured = captureConsole(["warn"]);

  try {
    const logger = createLogger("unit-test");
    logger.warn("warn-no-context");
  } finally {
    captured.restore();
  }

  assert.equal(captured.calls.warn.length, 1);
  const line = captured.calls.warn[0];
  assert.match(line, /\[WARN\] \[unit-test\] warn-no-context/);
  assert.match(line, /"module":"unit-test"/);
  assert.doesNotMatch(line, /undefined|\{\}/);
});

test("logger respects LOG_LEVEL filtering and output stream routing", () => {
  const result = spawnSync(
    "node",
    [
      "--import",
      "tsx",
      "--eval",
      'import { createLogger } from "./server/utils/logger.ts"; const l=createLogger("lvl"); l.info("info"); l.warn("warn"); l.error("error");',
    ],
    {
      cwd: process.cwd(),
      env: { ...process.env, LOG_LEVEL: "warn", NODE_ENV: "production" },
      encoding: "utf8",
    },
  );

  assert.equal(result.status, 0);
  assert.doesNotMatch(result.stdout, /\[(INFO|WARN|ERROR)\] \[lvl\]/);
  assert.doesNotMatch(result.stderr, /\[INFO\] \[lvl\] info/);
  assert.match(result.stderr, /\[WARN\] \[lvl\] warn/);
  assert.match(result.stderr, /\[ERROR\] \[lvl\] error/);
});

test("debug logs are suppressed at info level and emitted at debug level", () => {
  const suppressed = spawnSync(
    "node",
    [
      "--import",
      "tsx",
      "--eval",
      'import { createLogger } from "./server/utils/logger.ts"; createLogger("dbg").debug("hidden");',
    ],
    {
      cwd: process.cwd(),
      env: { ...process.env, LOG_LEVEL: "info", NODE_ENV: "production" },
      encoding: "utf8",
    },
  );

  assert.equal(suppressed.status, 0);
  assert.equal(suppressed.stdout.trim(), "");
  assert.equal(suppressed.stderr.trim(), "");

  const emitted = spawnSync(
    "node",
    [
      "--import",
      "tsx",
      "--eval",
      'import { createLogger } from "./server/utils/logger.ts"; createLogger("dbg").debug("visible");',
    ],
    {
      cwd: process.cwd(),
      env: { ...process.env, LOG_LEVEL: "debug", NODE_ENV: "production" },
      encoding: "utf8",
    },
  );

  assert.equal(emitted.status, 0);
  assert.match(emitted.stdout, /\[DEBUG\] \[dbg\] visible/);
  assert.equal(emitted.stderr.trim(), "");
});
