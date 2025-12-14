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
1. **OpenAI/ChatGPT** - Uses user's direct `OPENAI_API_KEY` with gpt-4o model via chat.completions API
2. **Google Gemini** - Uses Replit AI Integrations (no API key needed, billed to credits)
3. **Perplexity** - Requires `PERPLEXITY_API_KEY` environment variable

Each service is queried with business-specific prompts, and responses are analyzed for business mentions and competitor identification. 

**Citation Detection Logic:**
1. First checks if brand's exact domain is cited in AI response URLs
2. If no domain match, checks if business name is mentioned in response text
3. Fallback checks for domain mentioned in text without full URL

Fallback simulation is provided when API keys are unavailable or errors occur.

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