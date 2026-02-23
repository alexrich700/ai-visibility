# AI Visibility Audit Tool

## Overview
The AI Visibility Audit Tool for ROSSMAN MEDIA assesses business visibility across major AI platforms (ChatGPT, Gemini, Perplexity). It generates visibility scores, conducts competitor analysis, and provides actionable recommendations to enhance business presence in AI search results, identify competitive advantages, and improve digital marketing strategies. The tool features a React frontend, Express backend, and PostgreSQL database.

## User Preferences
Preferred communication style: Simple, everyday language.

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
-   **Analytics Dashboard**: Provides a 3-column analytics grid with city-filtered analytics, top citations, prominence tracking, categorical sentiment analysis, competitor visibility, and historical trending.
-   **Response Viewer**: Detailed viewing of AI responses with brand highlighting.
-   **Data Export**: Comprehensive audit data export in ZIP format.
-   **Prompt City Substitution**: Dynamic city name replacement in prompts for rescanning.
-   **Shareable Audit Links**: Secure public links for sharing audit results without authentication.
-   **Enhanced Negative Sentiment Display**: Detailed display of negative feedback snippets with platform attribution.
-   **Content Gap Analysis**: Fetches and parses client website sitemaps (sitemap_index.xml, sitemap.xml, robots.txt), cross-references against Gemini webSearchQueries stored in check_results, identifies pages that match search terms (covered) vs. missed opportunities. Exports to Excel with Summary, Opportunities, Covered Terms, and All Terms sheets. Frontend component at `client/src/components/content-gap-analysis.tsx`, backend services at `server/services/sitemap-parser.ts` and `server/services/content-gap-analysis.ts`, API routes at `/api/monitoring/content-gaps/:clientId` and `/api/monitoring/content-gaps/:clientId/export`.

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