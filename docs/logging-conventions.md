# Backend Logging Conventions

This repository now uses `server/utils/logger.ts` as the shared backend logging abstraction.

## Why
- Replaces ad-hoc `console.log` prefixes with structured, level-based logs.
- Makes it easier to filter logs by severity and correlate logs using IDs.

## API

```ts
import { createLogger } from "../utils/logger";

const logger = createLogger("monitoring-routes");
logger.info("Created scan job", { jobId, clientId, requestId });
```

### Supported levels
- `debug`: verbose diagnostics (checkpoint details, retries, internal tracing)
- `info`: normal operational events (startup, job creation, client flow decisions)
- `warn`: recoverable anomalies (retryable failures, missing optional config)
- `error`: failed operations and terminal errors

## Context fields
Use contextual metadata whenever available:
- `module`: set automatically by `createLogger("module-name")`
- `requestId`: HTTP request correlation identifier or flow label
- `jobId`: async scan/background job identifier
- `clientId`: monitoring client identifier

You can include additional primitive fields (string/number/boolean/null) as needed.

## Log level filtering
- Controlled by `LOG_LEVEL` env var (`debug`, `info`, `warn`, `error`).
- Defaults:
  - `debug` in development
  - `info` in non-development environments

## Formatting
All log lines use a consistent format:

```text
<ISO_TIMESTAMP> [LEVEL] [module] message {"requestId":"...","jobId":123,"clientId":456}
```
