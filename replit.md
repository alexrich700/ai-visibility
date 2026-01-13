# AI Visibility Audit Tool

## Overview

This is an AI Visibility Audit Tool built for ROSSMAN MEDIA that analyzes how visible a business is across major AI platforms (ChatGPT, Gemini, Perplexity). The tool queries multiple AI services with business-related prompts and generates visibility scores, competitor analysis, and actionable recommendations.

The application follows a client-server architecture with a React frontend and Express backend, using PostgreSQL for data persistence via Drizzle ORM.

## User Preferences

Preferred communication style: Simple, everyday language.

**CRITICAL Design Requirement**: The existing UI design must be preserved exactly as implemented. Keep all colors, fonts, styles, layouts, and visual elements unchanged. Reference `design_guidelines.md` for the established brand identity including:
- Primary Blue: #5599f9
- Accent Yellow: #ffb41c
- Bold headings with tight tracking
- White cards with rounded-xl borders and subtle shadows

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter (lightweight React router)
- **State Management**: TanStack React Query for server state
- **UI Components**: shadcn/ui component library built on Radix UI primitives
- **Styling**: Tailwind CSS with custom CSS variables for theming
- **Build Tool**: Vite with HMR support

The frontend uses a single-page application pattern with the main audit workflow managed through React state (input → scanning → results steps).

### Backend Architecture
- **Framework**: Express.js with TypeScript
- **Runtime**: Node.js with tsx for TypeScript execution
- **API Design**: RESTful endpoints under `/api` prefix
- **Build**: esbuild for production bundling with dependency allowlist optimization

Key endpoints:
- `POST /api/audit` - Runs visibility audit across AI platforms (returns auditId)
- `POST /api/leads` - Captures lead information from audit results (links to auditId)
- `POST /api/admin/login` - Admin portal authentication
- `GET /api/admin/audits` - Get all audits with associated lead info
- `PATCH /api/admin/leads/:id` - Update lead status (new, contacted, not_reached, closed)
- `GET /api/admin/audits/:id` - Get single audit details

### AI Service Integration
The backend integrates with three AI platforms:
1. **OpenAI/ChatGPT** - Uses user's direct `MY_OPENAI_API_KEY` with gpt-5.2 model via Responses API with `web_search` tool for proper grounding
2. **Google Gemini** - Uses Replit AI Integrations (no API key needed, billed to credits) with `googleSearch` tool for grounding
3. **Perplexity** - Requires `PERPLEXITY_API_KEY` environment variable

### Scan Performance Optimization
- **Bounded concurrency**: Process 4 prompts simultaneously (configurable via `CONCURRENT_PROMPTS` in routes.ts)
- **Parallel AI calls**: Each prompt runs ChatGPT and Gemini API calls in parallel (via Promise.all in runPromptCheck)
- **Early termination**: Checks `isClientConnected` flag before/after each batch to stop wasted work
- **Batch processing**: Prompts processed in batches with progress updates after each batch completes
- **~70% faster scans**: 40 prompts now run in ~10 batches instead of 40 sequential calls

Each service is queried with business-specific prompts, and responses are analyzed for business mentions and competitor identification.

### High-Level Category (Umbrella Term) Feature
When generating service groups for monitoring clients:
- AI returns both a **high-level category** (umbrella term like "Plumber", "HVAC Contractor") AND 10 specific service groups
- The umbrella category is marked with `isHighLevelCategory: true` in the database
- Prompt counts: 5 prompts per group (configurable via `PROMPTS_PER_GROUP` constant in `server/ai-services.ts`)
- Total per client: 11 groups, ~55 prompts (11 × 5)
- Frontend displays "Primary Category" badge for umbrella groups 

**Citation Detection Logic:**
1. First checks if brand's exact domain is cited in AI response URLs
2. If no domain match, checks if business name is mentioned in response text
3. Brand aliases are also checked - alternative business names (e.g., "SmartFix", "The Smart Fix", "BBM") stored in `brandAliases` field
4. Fallback checks for domain mentioned in text without full URL

**Brand Aliases Feature:**
- Clients can configure alternative business names via the settings page
- Stored as `text[]` array in the `monitoring_clients` table
- The `generateNameVariations()` function creates variations from both the primary name and all aliases
- Aliases are threaded through the entire query chain: `runPromptCheck` → `queryOpenAI`/`queryGoogleAI` → `checkForMentions`
- Uses Set-based deduplication to avoid redundant comparisons

**Brand Sentiment Prompts Feature:**
- Two prompt categories: SERVICE (for visibility tracking) and BRAND_SENTIMENT (for direct feedback)
- Brand sentiment group automatically created during client onboarding with 4 specific prompts:
  - Perception prompt: "What do people say about {business name}?"
  - Customer experience prompt: "What are common customer experiences with {business name}?"
  - Trust factors prompt: "What factors affect trust in {business name}?"
  - Pain points prompt: "What issues or problems have customers reported about {business name}?"
- Brand sentiment prompts are **excluded from visibility scoring** (only service prompts count toward visibility metrics)
- Tracked via `isBrandSentiment` flag on each stored result
- Uses `servicePromptCount` for all visibility calculations (total prompts minus brand sentiment prompts)
- `collectBrandSentimentFindings()` helper extracts issues and praise from brand prompt responses
- Brand sentiment findings are merged into sentiment statements (prepended to positive/negative arrays, limited to 5)
- This provides more specific, actionable feedback about the business directly from AI platforms

Fallback simulation is provided when API keys are unavailable or errors occur.

**Real-time Progress Streaming:**
- Two-step SSE flow:
  1. POST `/api/monitoring/scan-prepare` - validates and stores scan config temporarily, returns `prepareId`
  2. GET `/api/monitoring/scan-stream/:prepareId` - EventSource connection for real-time updates
- Uses browser's native EventSource API (not fetch) for proper SSE handling
- Frontend stores EventSource in ref with cleanup on component unmount
- Event types: heartbeat, status, testing, prompt_complete, group_complete, complete, error
- Disconnect handling: cancels remaining work when client navigates away (via req.on('close'))
- Progress updates show: current group name, prompt text preview, prompt counter (X of Y)
- Temporary config cache auto-cleans entries older than 5 minutes

### Analytics Features (Dashboard)
The monitoring dashboard includes comprehensive analytics for each client:

**Share of Voice:**
- Competitor comparison showing brand vs competitor mention frequency
- Visual bar chart with percentage breakdown
- Computed from AI response analysis using `computeShareOfVoice()`

**Citation Sources:**
- Tracks which domains are cited by AI platforms
- Top 5 citations displayed with click-through links
- Aggregated across ChatGPT and Google AI responses

**Prominence Tracking:**
- Average mention rank across responses (1 = first mentioned)
- Count of "first place" recommendations
- Separate tracking for ChatGPT and Google AI

**Sentiment Analysis:**
- **Sentiment Score**: Numerical 0-100 score computed using weighted word analysis
  - Positive words add points, negative words subtract
  - Strong words (excellent, terrible, etc.) weighted 2x
  - Score of 50 = neutral, 70+ = positive perception, <40 = needs improvement
- Percentage breakdown visualization (positive/neutral/negative)
- Based on context around brand mentions
- **Sentiment Narratives (Key Sentiment Drivers)**: AI-synthesized clean statements from raw AI responses
  - Two-column SEMRush-style layout: "Brand Strength Factors" (green) and "Areas for Improvement" (amber)
  - Each narrative includes a 1-5 strength score shown as 5-segment colored bars
  - Generated by `synthesizeSentimentNarratives()` function using gpt-5.2 model
  - **IMPORTANT**: gpt-5.2 model requires `max_completion_tokens` parameter (not `max_tokens`)
  - Data structure: `{ strengths: [{text, strength}], improvements: [{text, strength}] }`
  - Conditionally rendered - only displays when data exists

**Competitor Visibility:**
- Tracks top 5 competitors by visibility percentage
- Filters out city names using 100+ US cities database to prevent false positives
- Shows mention count per competitor
- Visibility calculated as: (mentions / total prompts where business was found) × 100

**Response Viewer:**
- Full AI response modal with brand name highlighting
- Tabbed view for ChatGPT vs Google AI responses
- Competitors mentioned displayed as badges

**Historical Trending:**
- Session-level metrics stored for trend analysis
- Data includes: overall score, platform scores, found/cited counts
- API returns `trendData` array for historical visualization

**Visibility Trend Views (Tabbed Interface):**
- Three switchable chart views via tabs in the dashboard:
  1. **Overall**: AreaChart showing overall visibility score with ChatGPT/Google AI line overlays
  2. **By Group**: LineChart with multi-colored lines tracking each service group's visibility over time
  3. **Competitors**: LineChart showing top 10 competitors' visibility percentages over time
- Data stored in separate tables for efficient time-series queries:
  - `check_group_metrics`: Per-group visibility score, found count, total prompts per session
  - `check_competitor_metrics`: Per-competitor visibility percent and mention count per session
- API endpoints:
  - `GET /api/monitoring/trends/groups/:clientId` - Returns group trend data
  - `GET /api/monitoring/trends/competitors/:clientId` - Returns top 10 competitor trends
- Chart data uses ISO date keys for proper chronological sorting across years

**Platform Visibility:**
- Shows per-platform visibility percentages (ChatGPT vs Google AI)
- Displays found/total counts per platform (e.g., "45/55")
- Compact dual-pill design with color-coded indicators (blue=ChatGPT, orange=GoogleAI)

**Data Export:**
- GET `/api/monitoring/exports/:id` endpoint generates ZIP file
- Supports date range filtering via `startDate` and `endDate` query params
- Export includes:
  - README.txt with AI assistant instructions for website optimization
  - summary.json with visibility metrics and recommendations
  - chatgpt_results.csv with all ChatGPT prompts, responses, found/cited status
  - google_results.csv with all Google AI prompts, responses, found/cited status
  - metadata.json with export parameters and timestamps
- Export generator service: `server/services/export-generator.ts`

Analytics helper functions in `server/services/scan-analytics.ts`:
- `extractCitations()` - Parses URLs from AI responses
- `computeShareOfVoice()` - Calculates brand vs competitor percentages
- `detectMentionRank()` - Finds position of brand in response
- `classifySentiment()` - Analyzes mention context
- `buildSnippets()` - Extracts context around brand mentions
- `aggregateCitations()` - Consolidates citations across responses
- `aggregateSentiment()` - Computes sentiment percentages
- `computeSentimentScore()` - Calculates 0-100 numerical sentiment score using weighted word analysis
- `computeCompetitorVisibility()` - Calculates visibility % for top 5 competitors with city filtering
- `extractSentimentStatements()` - Extracts positive/negative quotes from AI responses with platform attribution

### Data Layer
- **ORM**: Drizzle ORM with PostgreSQL dialect
- **Schema Location**: `shared/schema.ts`
- **Migrations**: Managed via `drizzle-kit push`
- **Current Storage**: PostgreSQL database with Drizzle ORM

Data models include:
- Users (authentication ready)
- Audits (full audit results with scores, stored as JSON)
- Leads (contact capture linked to audits with status tracking)

### Admin Portal
- **Route**: `/admin`
- **Authentication**: Password-based (ADMIN_PASSWORD env var, defaults to "admin123")
- **Features**:
  - Dashboard table showing all audit submissions
  - Lead status management (New, Contacted, Not Reached, Closed)
  - Visual indicators for leads who submitted contact info
  - Detailed audit view with scores and lead contact info

### Shared Code
The `shared/` directory contains TypeScript schemas and types used by both frontend and backend, ensuring type safety across the stack. Zod is used for runtime validation.

## External Dependencies

### AI Services
- **OpenAI API** (direct API key) - Primary LLM for ChatGPT visibility checks using gpt-4o model
- **Google Gemini API** (via Replit AI Integrations) - Secondary AI platform visibility analysis
- **Perplexity API** - Search-focused AI visibility analysis

### Database
- **PostgreSQL** - Primary database (requires `DATABASE_URL` environment variable)
- **Drizzle ORM** - Type-safe database queries and schema management

### Key npm Packages
- `@tanstack/react-query` - Server state management
- `@radix-ui/*` - Accessible UI primitives
- `class-variance-authority` - Component variant styling
- `zod` - Schema validation
- `drizzle-orm` / `drizzle-zod` - Database ORM with Zod integration

### Environment Variables Required
- `DATABASE_URL` - PostgreSQL connection string
- `MY_OPENAI_API_KEY` - OpenAI API key for ChatGPT visibility checks (required for full functionality)
- `GEMINI_API_KEY` - Google Gemini API access (optional, uses Replit AI Integrations if not set)
- `PERPLEXITY_API_KEY` - Perplexity API access (optional, falls back to simulation)
- `ADMIN_PASSWORD` - Password for admin portal access (defaults to "admin123" if not set)