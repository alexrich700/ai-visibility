export type LogLevel = "debug" | "info" | "warn" | "error";

type LogValue = string | number | boolean | null | undefined;

export interface LogContext {
  requestId?: string;
  jobId?: string | number;
  clientId?: string | number;
  module?: string;
  [key: string]: LogValue;
}

const levelPriority: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function normalizeLogLevel(level: string | undefined): LogLevel {
  if (!level) {
    return process.env.NODE_ENV === "development" ? "debug" : "info";
  }

  const normalized = level.toLowerCase();
  if (normalized === "debug" || normalized === "info" || normalized === "warn" || normalized === "error") {
    return normalized;
  }

  return "info";
}

const activeLogLevel = normalizeLogLevel(process.env.LOG_LEVEL);

function shouldLog(level: LogLevel): boolean {
  return levelPriority[level] >= levelPriority[activeLogLevel];
}

function stringifyContext(context: LogContext): string {
  const entries = Object.entries(context).filter(([, value]) => value !== undefined);
  if (entries.length === 0) {
    return "";
  }

  return JSON.stringify(Object.fromEntries(entries));
}

function writeLog(level: LogLevel, message: string, context: LogContext): void {
  if (!shouldLog(level)) {
    return;
  }

  const timestamp = new Date().toISOString();
  const moduleName = context.module ?? "app";
  const contextLine = stringifyContext(context);
  const formatted = `${timestamp} [${level.toUpperCase()}] [${moduleName}] ${message}${contextLine ? ` ${contextLine}` : ""}`;

  if (level === "error") {
    console.error(formatted);
    return;
  }

  if (level === "warn") {
    console.warn(formatted);
    return;
  }

  console.log(formatted);
}

export interface Logger {
  debug(message: string, context?: Omit<LogContext, "module">): void;
  info(message: string, context?: Omit<LogContext, "module">): void;
  warn(message: string, context?: Omit<LogContext, "module">): void;
  error(message: string, context?: Omit<LogContext, "module">): void;
  child(context: Omit<LogContext, "module">): Logger;
}

export function createLogger(moduleName: string, baseContext: Omit<LogContext, "module"> = {}): Logger {
  const contextWithModule: LogContext = { module: moduleName, ...baseContext };

  return {
    debug(message, context = {}) {
      writeLog("debug", message, { ...contextWithModule, ...context });
    },
    info(message, context = {}) {
      writeLog("info", message, { ...contextWithModule, ...context });
    },
    warn(message, context = {}) {
      writeLog("warn", message, { ...contextWithModule, ...context });
    },
    error(message, context = {}) {
      writeLog("error", message, { ...contextWithModule, ...context });
    },
    child(context) {
      return createLogger(moduleName, { ...baseContext, ...context });
    },
  };
}
