# AI Visibility Audit Tool

## Overview
The AI Visibility Audit Tool for Motivent Marketing assesses business visibility across major AI platforms (ChatGPT, Gemini, Perplexity). It generates visibility scores, conducts competitor analysis, and provides actionable recommendations to enhance business presence in AI search results, identify competitive advantages, and improve digital marketing strategies. The tool features a React frontend, Express backend, and PostgreSQL database.

## User Preferences
Preferred communication style: Simple, everyday language.

### Testing Credentials
For authenticated e2e testing in the staging environment, use the secrets `TEST_ADMIN_EMAIL` and `TEST_ADMIN_PASSWORD` to log in to the admin portal. Always reference these environment variables when running tests that require admin authentication.

**CRITICAL Design Requirement**: The existing UI design must be preserved exactly as implemented. Keep all colors, fonts, styles, layouts, and visual elements unchanged.

### Landing Page (Feb 2026 Redesign)
The root `/` landing page was redesigned for paid social media traffic conversion. It uses Gemini 3.1 Pro-generated copy. Key sections:
- **Urgency banner** (dark bar at top)
- **Centered hero**: Headline, 3 benefit pill badges with icons, platform badges (ChatGPT, Google AI Overviews), then the audit form card — all centered for optimal paid social traffic conversion.
- **How It Works** (3 steps below the fold)
- **FAQ accordion** (3 expandable items)
- **Bottom CTA** (dark section with CTA button that scrolls to form)
- **Footer** with branding

## System Architecture
### Frontend
-   **Framework**: React 18 with TypeScript
-   **State Management**: TanStack React Query
-   **UI Components**: shadcn/ui (built on Radix UI)
-   **Styling**: Tailwind CSS
-   **Build**: Vite
The frontend operates as a single-page application managing the audit workflow.

### Backend
-   **Framework**: Express.js with TypeScript
-   **Runtime**: Node.js
-   **API Design**: RESTful endpoints
-   **Build**: esbuild
The backend integrates with AI services, processes data, and handles persistence, offering endpoints for audits, lead management, and an admin portal.

### AI Service Integration
The tool integrates with OpenAI (ChatGPT), Google Gemini (via Replit AI Integrations), and Perplexity. Gemini 2.5 Flash is the primary model for all prompt generation (research, sentiment, executive summaries) and uses `googleSearch` for grounding. OpenAI's `gpt-5-nano` is used for visibility checking with `web_search` for grounding, with `gpt-5-mini` as a fallback for prompt generation. AI queries are processed with maximum parallelization.

### Gemini Grounding Metadata
The tool captures `webSearchQueries` and `groundingSupports` from Gemini to understand how location-specific queries are interpreted by AI platforms, enabling geo-optimization analysis. This data is stored in `check_results.google_ai_grounding_metadata` and exported for analysis.

### Core Features
-   **Multi-City and Multi-Category Support**: Allows configuration for multiple target cities and service categories, intelligently merging service groups.
-   **High-Level Category & Service Groups**: Identifies umbrella categories and specific service groups for comprehensive analysis.
-   **Citation Detection**: Prioritizes exact domain matches, business name mentions, and brand aliases.
-   **Brand Sentiment Prompts**: Gathers AI-driven feedback on brand perception.
-   **Real-time Progress Streaming**: Uses Server-Sent Events (SSE) for live updates during scans.
-   **Background-Safe and Resilient Scans**: Scans continue on the server even if the client disconnects, utilizing a checkpoint/resume architecture for long-running processes and partial result preservation. Individual city scans are wrapped in try-catch blocks to ensure overall process resilience.
-   **Multi-City Scheduled Scans**: The scheduler creates one scan job per city for multi-city clients, with each city's `targetCity` set explicitly. The processor runs them sequentially and only updates `nextCheckAt` after the last city job completes.
-   **Analytics Dashboard**: Provides a 3-column analytics grid with city-filtered analytics, top citations, prominence tracking, categorical sentiment analysis, competitor visibility, and historical trending.
-   **Response Viewer**: Detailed viewing of AI responses with brand highlighting.
-   **Data Export**: Comprehensive audit data export in ZIP format.
-   **Prompt City Substitution**: Dynamic city name replacement in prompts for rescanning.
-   **Shareable Audit Links**: Secure public links for sharing audit results without authentication.
-   **Enhanced Negative Sentiment Display**: Detailed display of negative feedback snippets with platform attribution.
-   **Scan History Management**: Admin-only feature in Settings page to view and delete individual scan sessions. Supports city-based filtering and confirmation dialogs. Backend endpoints: `DELETE /api/monitoring/sessions/:sessionId` (single) and `DELETE /api/monitoring/clients/:clientId/sessions?date=YYYY-MM-DD&city=` (bulk by date/city). Deletion cascades through check_results, check_group_metrics, check_competitor_metrics, and nullifies scan_jobs references.

### SEO Audit Pipeline (Task #2+)
A comprehensive 10-section SEO audit system with a 12-stage data pipeline, designed for 50 concurrent audits.

**Database Tables** (11 new tables in `shared/schema.ts`):
- `seo_audits` — Master audit record with business info, scores, and narrative
- `audit_keywords` — Keyword research data with rankings, CPC, search volume
- `audit_geo_grids` / `audit_geo_grid_points` — Geo Grid (SoLV) map data
- `audit_technical_findings` — Site health checks (speed, mobile, on-page, crawlability)
- `audit_competitors` — Competitor profiles with domain rating, backlinks, reviews
- `audit_content_gaps` — Missing pages/content opportunities
- `audit_reviews` — Google review health data
- `audit_deliverables` — Action plan line items by phase
- `audit_ppc_forecast` — Google Ads forecast data (stubbed)
- `audit_stage_log` — Pipeline stage progress tracking

**Service Layer** (`server/services/seo-audit/`):
- `http-client.ts` — Shared HTTP client: `fetchWithTimeout`, `TokenBucketRateLimiter` (batch-aware via `acquire(count)` parameter), `DailyQuotaTracker`
- `dataforseo.ts` — DataForSEO API: organic SERP (batch size 25), Maps SERP/Geo Grid (batch size 10, Haversine), site crawl, backlinks. Three-tier error classification (fatal/network-retryable/server-retryable) with exponential backoff+jitter. Both POST and GET requests have retry logic. Batch functions return partial results on partial failure, throw only on total failure.
- `pagespeed.ts` — Google PageSpeed Insights (25K/day quota) + technical check scoring engine
- `google-places.ts` — Google Places API: search, details, reviews, geocoding
- `keyword-planner.ts` — Google Ads Keyword Planner (stubbed, requires OAuth)
- `llm.ts` — Anthropic LLM: keyword classification, page scoring, review analysis, narrative generation
- `queue.ts` — In-memory audit job queue with priority, concurrency control, DB-backed stage logging
- `index.ts` — Pipeline orchestrator (12-stage pipeline)

**Storage** (`server/storage.ts`): IStorage interface extended with full CRUD for all 11 tables.

**External API Keys Needed**: `DATAFORSEO_LOGIN`, `DATAFORSEO_PASSWORD`, `GOOGLE_PSI_API_KEY`, `GOOGLE_PLACES_API_KEY`, `GOOGLE_ADS_*` (5 vars, for Keyword Planner)

**SEO Audit Dashboard** (`client/src/pages/seo-audit-dashboard.tsx`):
- 10-section scrollable dashboard with sidebar navigation and sticky header
- Sections: Competitive Snapshot, Geo Grid (SVG map with rank-colored dots), AI/GEO Visibility, Keyword Rankings (service-grouped grid with city columns, max 6 with pagination), Revenue Opportunity (funnel chart + PPC table), Site Health (collapsible category cards with A-F grades), Content Gap Analysis, Backlinks (DR comparison charts), Review Health (scorecard with competitor comparison), Investment & Action Plan (phased deliverables)
- Present Mode: fullscreen overlay, arrow key + click navigation, slide counter, progress dots with tooltips, ESC to close
- Magic link client view at `/seo-audit/view/:token` — same dashboard, read-only, no admin sidebar
- Charts built with Recharts; data fetched per-section via `/api/seo-audits/:id/sections/:section`

### Data Layer
-   **ORM**: Drizzle ORM with PostgreSQL.
-   **Schema**: Defined in `shared/schema.ts`.
-   **Migrations**: Managed via `drizzle-kit`.
-   **Models**: Users, Audits (JSON storage), and Leads.

### Admin Portal
A sidebar-based admin portal provides a dashboard for viewing audit submissions, managing leads, detailed audit reports, team member management, and user profiles. It uses email/password-based authentication with bcrypt hashing, token-based sessions, and a password reset flow. All admin routes are protected and require authentication.

### Security
Authentication middleware secures admin routes with token validation and rate limiting. Passwords and reset tokens are hashed using bcrypt.

### Shared Code
The `shared/` directory contains common TypeScript schemas and types, utilizing Zod for runtime validation.

## External Dependencies
### AI Services
-   **OpenAI API**: For ChatGPT visibility checks.
-   **Google Gemini API**: Accessed via Replit AI Integrations.
-   **Perplexity API**: For additional AI visibility analysis.

### Database
-   **PostgreSQL**: Primary database.
-   **Drizzle ORM**: For database interaction.

### Key npm Packages
-   `@tanstack/react-query`
-   `shadcn/ui`
-   `zod`
-   `drizzle-orm`