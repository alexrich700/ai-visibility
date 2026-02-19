# AGENTS.md

Guidance for AI coding agents working in this repository.

## Scope
This file applies to the entire repository unless a deeper `AGENTS.md` overrides it.

## Project Snapshot
- Stack: React + TypeScript frontend, Express + TypeScript backend, Drizzle ORM, PostgreSQL.
- Build/dev tooling: Vite (frontend), tsx/esbuild (server build/runtime).
- Priority: preserve the existing UI design and visual behavior unless explicitly requested otherwise.

## Ground Rules
1. Make the smallest safe change that solves the request.
2. Keep code style consistent with nearby files.
3. Do not refactor unrelated areas in the same change.
4. Do not add new dependencies unless truly necessary.
5. Never include secrets in code, logs, tests, or commits.

## Design & UX Constraint (Critical)
- Preserve existing UI styles, layout, spacing, typography, and colors unless the task explicitly asks for visual/design changes.
- For UI work, prefer reusing existing components and patterns in `client/src/components/ui`.

## Where Things Live
- `client/`: React app and UI code.
- `server/`: Express API routes and backend logic.
- `shared/`: shared schemas/types used by client and server.
- `script/` and `scripts/`: build/utility scripts.

## Expected Validation
Before finishing, run the minimum relevant checks for the files you touched:
- Type checks: `npm run check`
- Build sanity (when changes affect bundling/runtime): `npm run build`
- If you changed API behavior, exercise the affected endpoint logic locally when possible.

## Data & API Changes
- Keep request/response shapes backward compatible unless asked to introduce a breaking change.
- If schema or DB-impacting changes are required, update Drizzle schema and related code in one coherent patch.
- Keep error messages actionable and avoid exposing internal details.

## Frontend Changes
- Reuse existing hooks/utilities before introducing new abstractions.
- Keep accessibility intact: labels, focus states, keyboard interactions.
- Avoid unnecessary rerenders; keep state local when possible.

## Backend Changes
- Keep handlers deterministic and explicit.
- Validate incoming data and handle failure paths cleanly.
- Prefer concise logs that help debugging without leaking sensitive data.

## PR / Commit Expectations
- Use clear, scoped commit messages.
- Summarize:
  - what changed,
  - why it changed,
  - how it was validated.
- Include screenshots for user-visible UI changes when practical.

## Agent Workflow
1. Read this file and any deeper `AGENTS.md` files in touched paths.
2. Plan briefly, then implement focused changes.
3. Run relevant checks.
4. Report files changed and validation commands run.

