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
1. **OpenAI/ChatGPT** - Uses user's direct `OPENAI_API_KEY` with gpt-5.2 model via Responses API with `web_search` tool for proper grounding
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
3. Fallback checks for domain mentioned in text without full URL

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
- Classifies brand mentions as positive/neutral/negative
- Percentage breakdown visualization
- Based on context around brand mentions

**Response Viewer:**
- Full AI response modal with brand name highlighting
- Tabbed view for ChatGPT vs Google AI responses
- Competitors mentioned displayed as badges

**Historical Trending:**
- Session-level metrics stored for trend analysis
- Data includes: overall score, platform scores, found/cited counts
- API returns `trendData` array for historical visualization

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
- `OPENAI_API_KEY` - OpenAI API key for ChatGPT visibility checks (required for full functionality)
- `GEMINI_API_KEY` - Google Gemini API access (optional, uses Replit AI Integrations if not set)
- `PERPLEXITY_API_KEY` - Perplexity API access (optional, falls back to simulation)
- `ADMIN_PASSWORD` - Password for admin portal access (defaults to "admin123" if not set)