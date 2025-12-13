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
- `POST /api/audit` - Runs visibility audit across AI platforms
- `POST /api/leads` - Captures lead information from audit results

### AI Service Integration
The backend integrates with three AI platforms:
1. **OpenAI/ChatGPT** - Uses Replit AI Integrations (no API key needed)
2. **Google Gemini** - Requires `GEMINI_API_KEY` environment variable
3. **Perplexity** - Requires `PERPLEXITY_API_KEY` environment variable

Each service is queried with business-specific prompts, and responses are analyzed for business mentions and competitor identification. Fallback simulation is provided when API keys are unavailable.

### Data Layer
- **ORM**: Drizzle ORM with PostgreSQL dialect
- **Schema Location**: `shared/schema.ts`
- **Migrations**: Managed via `drizzle-kit push`
- **Current Storage**: In-memory storage implementation with database schema ready for migration

Data models include:
- Users (authentication ready)
- Audit records (business visibility results)
- Leads (contact capture from audits)

### Shared Code
The `shared/` directory contains TypeScript schemas and types used by both frontend and backend, ensuring type safety across the stack. Zod is used for runtime validation.

## External Dependencies

### AI Services
- **OpenAI API** (via Replit AI Integrations) - Primary LLM for ChatGPT visibility checks
- **Google Gemini API** - Secondary AI platform visibility analysis
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
- `GEMINI_API_KEY` - Google Gemini API access (optional, falls back to simulation)
- `PERPLEXITY_API_KEY` - Perplexity API access (optional, falls back to simulation)