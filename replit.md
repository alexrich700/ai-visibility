# AI Visibility Audit Tool

## Overview

This AI Visibility Audit Tool for ROSSMAN MEDIA assesses a business's visibility across major AI platforms (ChatGPT, Gemini, Perplexity). It queries AI services with business-related prompts to generate visibility scores, conduct competitor analysis, and provide actionable recommendations. The tool aims to enhance business presence in AI search results, identify competitive advantages, and offer data-driven insights to improve digital marketing strategies. It operates with a React frontend, Express backend, and PostgreSQL database.

## User Preferences

Preferred communication style: Simple, everyday language.

**CRITICAL Design Requirement**: The existing UI design must be preserved exactly as implemented. Keep all colors, fonts, styles, layouts, and visual elements unchanged.

## System Architecture

### Frontend
- **Framework**: React 18 with TypeScript
- **State Management**: TanStack React Query
- **UI Components**: shadcn/ui (built on Radix UI)
- **Styling**: Tailwind CSS with custom CSS variables
- **Build**: Vite

The frontend is a single-page application managing the audit workflow through React state.

### Backend
- **Framework**: Express.js with TypeScript
- **Runtime**: Node.js
- **API Design**: RESTful endpoints
- **Build**: esbuild

The backend handles AI service integration, data processing, and persistence. It includes endpoints for initiating audits, managing leads, and an admin portal for viewing and managing audit data.

### AI Service Integration
The tool integrates with:
1.  **OpenAI/ChatGPT**: Uses `MY_OPENAI_API_KEY` with `gpt-5-mini` model via Responses API, utilizing a `web_search` tool for grounding.
2.  **Google Gemini**: Integrates via Replit AI Integrations (no API key needed), using a `googleSearch` tool for grounding. Captures grounding metadata (`webSearchQueries`, `groundingSupports`) for geo-optimization analysis.
3.  **Perplexity**: Requires `PERPLEXITY_API_KEY`.

AI queries are processed with bounded concurrency (8 simultaneous prompts) and parallel API calls to optimize performance and cost.

### Gemini Grounding Metadata
-   **Purpose**: Captures what geographic search queries Gemini uses internally when answering prompts (e.g., "best plumber Woodbury MN"). This reveals how AI platforms interpret location-specific queries.
-   **Data Captured**: 
    - `webSearchQueries`: Array of actual search queries Gemini generates
    - `groundingSupports`: Maps response segments to source chunks for citation tracking
-   **Storage**: Stored as JSONB in `check_results.google_ai_grounding_metadata` column
-   **Export**: "Gemini Web Search Queries" column in Excel exports (pipe-separated list)
-   **Use Case**: Enables geo-optimization analysis to understand how clients can improve visibility for specific city-based searches

### Core Features
-   **Multi-City Support**: Businesses can configure multiple target cities (e.g., Minneapolis, St. Paul, Rochester). Each city can be scanned separately, with dashboard filtering to view per-city or aggregate results.
-   **Multi-Category Support**: Supports businesses offering multiple primary services (e.g., Plumbing + HVAC). The system intelligently merges overlapping service groups to generate ~12-15 unique groups instead of 20+ duplicates.
-   **High-Level Category & Service Groups**: Identifies an umbrella category and 10 specific service groups per primary category, generating 5 prompts per group for comprehensive analysis.
-   **Citation Detection**: Prioritizes exact domain matches in AI responses, then business name mentions, and brand aliases.
-   **Brand Aliases**: Allows clients to configure alternative business names for more accurate mention detection.
-   **Brand Sentiment Prompts**: Includes specific prompts to gather AI-driven feedback on brand perception, customer experience, trust factors, and pain points, separate from visibility scoring.
-   **Real-time Progress Streaming**: Uses Server-Sent Events (SSE) for live updates during scans, including group progress, prompt status, and early termination on client disconnect.
-   **Resilient Scan System**: Implements checkpoint/resume architecture for long-running scans:
    - Sessions created at scan start with 'running' status and track progress incrementally
    - Checkpoint updated after each prompt completion with running scores (foundCount, overallScore, chatgptScore, googleAIScore)
    - Incremental score updates ensure partial/interrupted scans display accurate data, not 0%
    - Auto-reconnection on connection drops with exponential backoff (1s, 2s, 4s, 8s, 16s up to 5 attempts)
    - Resume endpoint (`/api/monitoring/resume-stream/:sessionId`) continues from last checkpoint
    - Partial results preserved even if scan fails to complete
-   **Multi-City Resilience**: Individual city scans wrapped in try-catch blocks so failures don't block remaining cities:
    - If one city fails, loop continues to scan remaining cities
    - Partial success toast shown when some cities complete but others fail
    - Average score calculated only from successful cities

### Analytics Dashboard
The monitoring dashboard provides a 3-column analytics grid:
-   **City-Filtered Analytics**: All dashboard metrics are dynamically recalculated based on selected city filter:
    - "All Cities" aggregates latest session per city (scores averaged, competitors combined top 5)
    - Specific city selection shows only that city's session data
    - Frontend computes analytics from city-filtered results using helper functions: `computeCompetitorVisibility`, `computeTopCitations`, `computeFirstPlaceCount`
-   **3-Column Analytics Grid Layout**: Top Citations | Prominence | Competitor Visibility
-   **Top Citations**: Tracks and displays top domains cited by AI platforms (from service results only). Filters out Google internal redirect URLs (vertexaisearch.cloud.google.com, grounding-api-redirect).
-   **Prominence Tracking**: Measures average mention rank and "first place" recommendations.
-   **Sentiment Analysis**: Uses categorical sentiment classification (positive/neutral/negative) with AI-synthesized narratives (strengths and improvements) based on brand sentiment prompts. Numerical sentiment scores (0-100) were removed in favor of the more valuable categorical approach.
-   **Competitor Visibility**: Identifies and tracks top 5 competitors, filtering out city names (from service results only).
-   **Response Viewer**: Allows detailed viewing of AI responses with brand highlighting.
-   **Historical Trending**: Stores session-level metrics for trend analysis, including overall visibility, group-specific visibility, and competitor visibility over time, presented in tabbed charts.
-   **Platform Visibility**: Shows per-platform visibility percentages for ChatGPT and Google AI.
-   **Data Export**: Allows exporting comprehensive audit data (summaries, raw results, metadata) in a ZIP format with date range filtering.
-   **Prompt City Substitution**: When rescanning for a different city, prompts dynamically replace city names using regex escaping and length-sorted replacement to avoid substring collisions (e.g., "St. Paul" or "New York" vs "York").

### Data Layer
-   **ORM**: Drizzle ORM with PostgreSQL.
-   **Schema**: Defined in `shared/schema.ts`.
-   **Migrations**: Managed via `drizzle-kit`.
-   **Models**: Users, Audits (JSON storage), and Leads.

### Admin Portal
-   **Functionality**: Provides a dashboard for viewing audit submissions, managing lead statuses, and detailed audit reports.
-   **Authentication**: Token-based authentication with `ADMIN_PASSWORD` and rate limiting.

### Security
-   **Authentication Middleware**: Ensures secure access to admin routes with token validation and rate limiting.
-   **Protected Routes**: All `/api/admin/*` endpoints are secured.

### Shared Code
The `shared/` directory contains common TypeScript schemas and types, using Zod for runtime validation.

## External Dependencies

### AI Services
-   **OpenAI API**: For ChatGPT visibility checks.
-   **Google Gemini API**: Accessed via Replit AI Integrations for Google AI visibility.
-   **Perplexity API**: For additional AI visibility analysis.

### Database
-   **PostgreSQL**: Primary database for all application data.
-   **Drizzle ORM**: Used for database interaction.

### Key npm Packages
-   `@tanstack/react-query`: Server state management.
-   `shadcn/ui`: UI component library.
-   `zod`: Schema validation.
-   `drizzle-orm`: ORM for PostgreSQL.

### Environment Variables
-   `DATABASE_URL`: PostgreSQL connection string.
-   `MY_OPENAI_API_KEY`: OpenAI API key.
-   `GEMINI_API_KEY`: Google Gemini API key (optional).
-   `PERPLEXITY_API_KEY`: Perplexity API key (optional).
-   `ADMIN_PASSWORD`: Admin portal password.