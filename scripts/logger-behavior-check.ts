import { createLogger } from "../server/utils/logger";

const lines: string[] = [];
const originalLog = console.log;
const originalWarn = console.warn;
const originalError = console.error;

console.log = (...args: unknown[]) => lines.push(args.join(" "));
console.warn = (...args: unknown[]) => lines.push(args.join(" "));
console.error = (...args: unknown[]) => lines.push(args.join(" "));

const logger = createLogger("logger-test", { clientId: 42 });
logger.info("hello", { requestId: "req-1" });
logger.warn("careful", { jobId: "job-9" });
logger.error("boom", { requestId: "req-1" });

console.log = originalLog;
console.warn = originalWarn;
console.error = originalError;

const hasLevelAndModule = lines.every((line) => line.includes("[logger-test]"));
const hasContext = lines.some((line) => line.includes('"clientId":42') && line.includes('"requestId":"req-1"'));

if (lines.length < 3 || !hasLevelAndModule || !hasContext) {
  throw new Error(`Logger behavior check failed. Captured lines: ${JSON.stringify(lines)}`);
}

originalLog("Logger behavior check passed");
