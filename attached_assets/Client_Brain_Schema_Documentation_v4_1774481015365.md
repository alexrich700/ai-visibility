# Client Brain — Schema Documentation

**Version 4.0 | March 25, 2026 | Supabase (PostgreSQL) + Mem0**
**20 Tables · 3 Views · 2 Functions · Mem0 Integration**

---

## 1. Overview

Client Brain is a unified Supabase (PostgreSQL) database that consolidates all client data into a single system. It replaces two separate Excel workbooks (BBM Clients and RMG Clients, 37+ sheets combined) and is designed to power AI-assisted client management — conversational interfaces, automated health scoring, and semantic search over meeting notes, Slack messages, and email threads via Mem0.

**Migration Status (v4.0):** Data migration complete. 469 raw client records cleaned, deduplicated, and classified into 372 unique clients (243 active, 129 past). All active clients have tier assignments. Duplicate merges preserved all service records, contacts, and creative team assignments under canonical client names.

### Design Principles

- **One company, one database.** No agency separation, no source tracking. Every client, team member, and service lives in one unified schema.
- **Class Table Inheritance.** A shared `client_services` base table holds fields common to ALL services (client, type, strategist, status, dates). Each service type has a dedicated extension table with platform-specific fields. Zero wasted NULLs.
- **Agent-ready.** Brand profiles, target audiences, brand assets, and competitors are structured for direct consumption by AI agents (ad copy writers, creative generators, reporting agents).
- **Mem0 for memory.** All unstructured content (meeting transcripts, Slack threads, email chains, manual notes) flows through Mem0. The database stores structured facts; Mem0 handles semantic search, deduplication, and recency weighting.

---

## 2. Table Inventory

**Total: 20 Tables (down from 27 in v2.0)**

### Core Tables (5)

| Table | Purpose | Record Count | Key Fields |
|-------|---------|--------------|------------|
| `team_members` | All staff | 33 members | `first_name`, `role`, `department`, `status` |
| `clients` | All clients | 372 clients (243 active, 129 past) | `name`, `status`, `tier`, `health_status`, `csm_id`, `monthly_retainer` |
| `client_contacts` | Multiple contacts per client | 109 contacts | `contact_name`, `email`, `is_primary`, `is_billing_contact` |
| `client_services` | Base table for ALL services | 319 services | `service_type`, `strategist_id`, `status`, `start_date` |
| `client_creative_team` | Client-level designer/editor assignment | 21 clients | `graphic_designer`, `video_editor` |

### Service Extension Tables (7)

Each extension table has a 1:1 relationship with `client_services` via `service_id`. When inserting a new service, one row goes into `client_services` and one into the matching extension table.

| Table | Service Type | Record Count | Key Fields |
|-------|-------------|--------------|-----------|
| `google_ads_services` | Google Ads | 42 services | `mcc_id`, `google_ad_account_id`, `monthly_budget`, `fraud_blocker`, `ad_spend_card_owner` |
| `lsa_services` | Local Service Ads | 15 services | `monthly_budget`, `ad_spend_card_owner`, `budget_caps` |
| `social_ad_services` | Meta, TikTok, LinkedIn, Pinterest, YouTube | 32 services | `monthly_ad_spend`, `platforms` (JSONB), `campaign_type`, `pixel_installed` |
| `seo_services` | Search engine optimization | 56 services | `allocated_hours`, `service_level`, `website_url`, `next_review_date`, `sow` |
| `social_media_services` | Organic social media management | 32 services | `posts_per_week`, `platforms` (JSONB), `content_poc`, `community_management`, `boosting_budget`, `planning_hours`, `creative_hours`, `post_types` |
| `email_services` | Email marketing campaigns | 22 services | `platform`, `scoped_hours`, `sow`, `monthly_retainer` |
| `imm_services` | Influencer marketing management | 4 services | `scope`, `budget_per_creator`, `sop_link`, `airtable_base` |
| `content_services` | Content creation / video (0 records) | 0 services | `monthly_budget`, `videographer`, `shoot_location`, `concept_owner` |

**Note:** `content_services` extension table exists but has no active records.

### Supporting Tables (8)

| Table | Purpose | Status |
|-------|---------|--------|
| `client_brand_profiles` | About statement, do-not-do list, brand voice, priorities, colors, fonts | Empty — populate per client |
| `client_target_audiences` | Demographics, psychographics, miracles/miseries, objections/overcomes | Empty — populate per client |
| `client_brand_assets` | Logo URLs, font files, brand guides (links to Drive/Canva/S3) | Empty — populate per client |
| `client_competitors` | Competitor name + website per client | Empty — populate per client |
| `slack_channel_mappings` | Slack channel ID → client lookup | Populated |
| `mem0_entity_mappings` | Bridges Client Brain UUIDs to Mem0 user IDs | Empty — set up with Mem0 |
| `performance_pull_schedule` | Tracks performance data pull cadence and status | Empty — configure with integrations |
| `csm_health_dashboard` | View-like table for CSM health reporting | Query-based |

---

## 3. Dropped Tables (v2.0 → v3.0)

The following tables were removed as unused or redundant:

- **`design_services`** — Replaced by `client_creative_team` table. Client-level assignment of graphic designer and video editor is now centralized.
- **`copywriting_services`** — Removed due to lack of usage and no clients currently subscribed.
- **`media_services`** — Traditional media buying tracked as service_type; no dedicated extension table needed.
- **`nextdoor_ads_services`** — Removed; no active clients (was 1 row).
- **`bing_ads_services`** — Removed; no active clients, minimal usage.
- **`team_assignments`** — Removed; strategist assignment is now done via `strategist_id` on `client_services` base table.
- **`dashboard_links`** — Removed; reporting dashboards now tracked in `performance_pull_schedule`.

**Service type availability in `client_services`:** Removed bing_ads, nextdoor_ads, copywriting, media_buying (as constraint value). Current valid types use the list in Section 6.

---

## 4. New: `client_creative_team` Table

This table replaces the old `design_services` approach. Each client can now have a single assigned graphic designer and video editor at the client level, rather than tracking it per design service.

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID (PK) | Auto-generated |
| `client_id` | UUID (FK → clients, UNIQUE) | One-to-one relationship; one assignment per client |
| `graphic_designer` | VARCHAR(255) | Name or ID of assigned graphic designer |
| `video_editor` | VARCHAR(255) | Name or ID of assigned video editor |
| `notes` | TEXT | Additional context or notes |
| `created_at` | TIMESTAMPTZ | Auto-set to NOW() |
| `updated_at` | TIMESTAMPTZ | Auto-set to NOW(), updated on row changes |

**Usage:** Query this table to find who handles design/video for a specific client, rather than looking up old service-level assignments.

---

## 5. Updated: `social_media_services` Extensions

Added four new fields to support more granular budgeting and planning:

| Field | Type | Description |
|-------|------|-------------|
| `boosting_budget` | DECIMAL(12,2) | Budget allocated for boosted organic posts |
| `planning_hours` | DECIMAL(8,2) | Monthly hours budgeted for content planning |
| `creative_hours` | DECIMAL(8,2) | Monthly hours budgeted for content creation |
| `post_types` | TEXT | Description of post types (e.g., "carousel, video, static, reels") |

These fields sit alongside existing fields like `posts_per_week`, `budget_hours`, `platforms`, etc.

---

## 6. Tier & Constraint Updates

### Updated `tier` Constraint on `clients`

**Old valid values:** `enterprise`, `premium`, `growth`, `core`, `starter`, `maintenance`, `monitor`

**New valid values:** `enterprise`, `premium`, `growth`, `core`, `starter`, `micro`, `maintenance`

- **Removed:** `monitor` — redundant with `maintenance` tier.
- **Added:** `micro` — for very small/minimal retainer clients (tier between `starter` and `maintenance`).

**Current tier distribution (243 active clients — all assigned):**
- Maintenance: 82 clients
- Core: 48 clients
- Starter: 42 clients
- Micro: 33 clients
- Growth: 15 clients
- Premium: 15 clients
- Enterprise: 8 clients

**Past clients:** 129 (tier cleared on status change to past)

### Updated `service_type` Constraint on `client_services`

**Old valid values:** google_ads, lsa, bing_ads, nextdoor_ads, social_ads, seo, social_media, email_marketing, content_creation, imm, design, copywriting, media_buying, programmatic, traditional_media, pr, direct_mail, other

**New valid values:** google_ads, lsa, social_ads, seo, social_media, email_marketing, content_creation, imm, programmatic, traditional_media, pr, direct_mail, other

**Removed from constraint:** bing_ads, nextdoor_ads, copywriting, design, media_buying

**Current service type distribution (319 client_services):**
- social_ads: 86 services
- seo: 67 services
- google_ads: 55 services
- social_media: 55 services
- email_marketing: 32 services
- lsa: 20 services
- imm: 4 services
- (others: 0 records each)

---

## 7. Relationships & Data Flow

Every table connects back to `clients` via `client_id` foreign keys. The Class Table Inheritance pattern means services have two layers: the base `client_services` row (shared fields) and one extension table row (platform-specific fields).

### Entity Relationship Summary

```
clients (1) → (many) client_contacts
clients (1) → (many) client_services
clients (1) → (1)    client_brand_profiles
clients (1) → (many) client_target_audiences
clients (1) → (many) client_brand_assets
clients (1) → (many) client_competitors
clients (1) → (many) slack_channel_mappings
clients (1) → (many) performance_pull_schedule
clients (1) → (1)    client_creative_team
clients (many) → (1) team_members  [via csm_id, sales_rep_id]

client_services (1) → (1) google_ads_services  [via service_id]
client_services (1) → (1) lsa_services          [via service_id]
client_services (1) → (1) social_ad_services    [via service_id]
client_services (1) → (1) seo_services          [via service_id]
client_services (1) → (1) social_media_services [via service_id]
client_services (1) → (1) email_services        [via service_id]
client_services (1) → (1) imm_services          [via service_id]
client_services (1) → (1) content_services      [via service_id]
```

### Mem0 Integration Flow

**Ingestion:** Slack message arrives → `slack_channel_mappings` resolves `client_id` → `mem0_entity_mappings` resolves `mem0_user_id` → content sent to Mem0 → Mem0 extracts facts, deduplicates, embeds, stores.

**Retrieval:** Team member asks about a client → agent resolves `client_id` → looks up `mem0_user_id` → queries Mem0 for semantic matches → combines with structured data from views → returns enriched response.

---

## 8. Views & Functions

### Views (3)

| View | Purpose | Key Columns |
|------|---------|-------------|
| `client_overview` | Everything at a glance for one client | `name`, `status`, `tier`, `csm_name`, `active_services`, `total_paid_search_spend`, `total_social_ad_spend` |
| `service_detail` | Flat row for any service type with all extension fields | `client_name`, `service_type`, `strategist`, `google_mcc_id`, `google_ads_budget`, `seo_hours`, `social_ad_spend`, etc. |
| `csm_health_dashboard` | Active clients sorted by health (red first) | `name`, `tier`, `health_status`, `csm_name`, `active_service_count`, `contract_end_date` |

### Functions (2)

**`calculate_tier(retainer DECIMAL) → VARCHAR`** — Returns tier name based on monthly retainer: $9K+ = enterprise, $5K+ = premium, $3K+ = growth, $1.5K+ = core, $500+ = starter, $200+ = micro, below = maintenance.

**`update_updated_at() → TRIGGER`** — Automatically sets `updated_at = NOW()` on any row update. Applied to all tables with an `updated_at` column.

---

## 9. Client Brand System

Four tables work together to give agents everything they need to create on-brand content for any client.

### client_brand_profiles (1:1 with clients)

| Field | Type | Description |
|-------|------|-------------|
| `about` | TEXT | Company description / about statement. Freeform, any length. |
| `do_not_do` | TEXT[] | Array of rules: `["Don't use 'expert'", "Don't mention competitors"]` |
| `brand_voice` | TEXT | Tone guidelines: "Professional but approachable" |
| `tagline` | VARCHAR(500) | Company tagline or slogan |
| `priorities` | TEXT[] | Ordered by importance: `["Show up on Google", "More phone calls"]` |
| `brand_colors` | JSONB | `[{"hex": "#1B365D", "name": "Navy", "role": "primary"}]` |
| `primary_font` | VARCHAR(100) | e.g. "Montserrat" |
| `secondary_font` | VARCHAR(100) | e.g. "Open Sans" |

### client_target_audiences (many per client)

Each client can have multiple target audiences. Each audience has demographics, psychographics, pain points (miseries), dream outcomes (miracles), and objection/overcome pairs.

| Field | Type | Example |
|-------|------|---------|
| `audience_name` | VARCHAR(255) | "Homeowners 35-55" |
| `age_range` | VARCHAR(50) | "35-55" |
| `gender` | VARCHAR(50) | "All" |
| `annual_income` | VARCHAR(100) | "$75K-$150K" |
| `location` | TEXT | "San Antonio metro" |
| `education` | VARCHAR(100) | "College-educated" |
| `occupation` | TEXT | "White-collar professionals" |
| `psychographics` | TEXT | "Values reliability. Frustrated by big telecoms." |
| `lifestyle` | TEXT | "Works from home 3-5 days/week. Video calls daily." |
| `interests` | TEXT[] | `["home improvement", "outdoor living"]` |
| `miseries` | TEXT[] | `["Slow internet", "Feeling disconnected during calls"]` |
| `miracles` | TEXT[] | `["Fast fiber", "Seamless video calls"]` |
| `objections` | JSONB | `[{"objection": "Too expensive", "overcome": "Compare vs cable"}]` |

### client_brand_assets (many per client)

Stores URLs to logos, font files, brand guides, and other visual assets. Asset types: `primary_logo`, `secondary_logo`, `white_logo`, `icon`, `favicon`, `font_file`, `brand_guide`, `style_guide`, `photo`, `other`.

| Field | Type | Description |
|-------|------|-------------|
| `asset_type` | VARCHAR(50) | Constrained to the types listed above |
| `url` | TEXT | Link to the asset (Google Drive, Canva, S3, etc.) |
| `file_format` | VARCHAR(20) | e.g. `svg`, `png`, `pdf`, `ttf`, `woff2` |
| `notes` | TEXT | Optional context |

### client_competitors (many per client)

Simple name + website pairs. Deeper competitive intelligence lives in Mem0.

| Field | Type | Description |
|-------|------|-------------|
| `competitor_name` | VARCHAR(255) | e.g. "ABC Roofing" |
| `website_url` | VARCHAR(500) | e.g. "https://abcroofing.com" |
| `notes` | TEXT | Optional context |

---

## 10. Service Type Reference

The `service_type` CHECK constraint on `client_services` defines all valid service types:

| service_type | Extension Table | Description |
|-------------|----------------|-------------|
| `google_ads` | `google_ads_services` | Google Ads search, display, shopping, PMax campaigns |
| `lsa` | `lsa_services` | Google Local Service Ads |
| `social_ads` | `social_ad_services` | Meta, TikTok, LinkedIn, Pinterest, YouTube paid social |
| `seo` | `seo_services` | Search engine optimization |
| `social_media` | `social_media_services` | Organic social media management |
| `email_marketing` | `email_services` | Email marketing campaigns |
| `content_creation` | `content_services` | Video production, content shoots |
| `imm` | `imm_services` | Influencer marketing management |
| `programmatic` | (no extension yet) | Programmatic advertising |
| `traditional_media` | (no extension yet) | TV, radio, print |
| `pr` | (no extension yet) | Public relations |
| `direct_mail` | (no extension yet) | Direct mail campaigns |
| `other` | (no extension yet) | Catch-all for unlisted services |

**Removed types (no longer valid in constraint):**
- `bing_ads` — dropped table, no active clients
- `nextdoor_ads` — dropped table, no active clients
- `copywriting` — dropped table, no active clients
- `design` — functionality moved to `client_creative_team` table
- `media_buying` — replaced by traditional_media classification

---

## 11. Inserting a New Service (CTE Pattern)

Every service insert uses a CTE that atomically creates both the base `client_services` row and the extension table row:

```sql
WITH new_svc AS (
  INSERT INTO client_services (client_id, service_type, strategist_id, notes)
  SELECT c.id, 'google_ads',
    (SELECT id FROM team_members WHERE first_name = 'Caden' LIMIT 1),
    'New campaign launching Q2'
  FROM clients c WHERE c.name = 'Acme Roofing'
  LIMIT 1 RETURNING id
)
INSERT INTO google_ads_services (service_id, mcc_id, google_ad_account_id, monthly_budget, ad_spend_card_owner, fraud_blocker)
SELECT id, '123-456-7890', '987-654-3210', 2500.00, 'agency', TRUE
FROM new_svc;
```

If the client doesn't exist, the INSERT silently returns zero rows (no error).

---

## 12. Common Query Patterns

### Everything about a client
```sql
SELECT * FROM client_overview WHERE name ILIKE '%Acme%';
```

### All Google Ads clients with budgets
```sql
SELECT c.name, ga.mcc_id, ga.google_ad_account_id, ga.monthly_budget
FROM client_services cs
JOIN clients c ON c.id = cs.client_id
JOIN google_ads_services ga ON ga.service_id = cs.id
WHERE cs.status = 'active' ORDER BY ga.monthly_budget DESC;
```

### What services does a client have?
```sql
SELECT cs.service_type, cs.status, tm.first_name AS strategist
FROM client_services cs
LEFT JOIN team_members tm ON tm.id = cs.strategist_id
WHERE cs.client_id = (SELECT id FROM clients WHERE name = 'Client X');
```

### Red-health clients by retainer
```sql
SELECT * FROM csm_health_dashboard WHERE health_status = 'red';
```

### Client's creative team assignment
```sql
SELECT cct.graphic_designer, cct.video_editor, cct.notes
FROM client_creative_team cct
WHERE cct.client_id = (SELECT id FROM clients WHERE name = 'Client X');
```

### Client's brand profile + audiences
```sql
-- Brand profile
SELECT bp.about, bp.do_not_do, bp.brand_voice, bp.priorities, bp.brand_colors,
       bp.primary_font, bp.secondary_font
FROM client_brand_profiles bp
JOIN clients c ON c.id = bp.client_id WHERE c.name = 'Client X';

-- Target audiences
SELECT audience_name, miseries, miracles, objections
FROM client_target_audiences
WHERE client_id = (SELECT id FROM clients WHERE name = 'Client X');

-- Brand assets (logos, fonts, guides)
SELECT asset_type, url, file_format
FROM client_brand_assets
WHERE client_id = (SELECT id FROM clients WHERE name = 'Client X');

-- Competitors
SELECT competitor_name, website_url
FROM client_competitors
WHERE client_id = (SELECT id FROM clients WHERE name = 'Client X');
```

### Get Mem0 user ID for a client (agent pipeline)
```sql
SELECT m.mem0_user_id FROM mem0_entity_mappings m
JOIN clients c ON c.id = m.entity_id
WHERE m.entity_type = 'client' AND c.name ILIKE '%Rise & Shine%';
```

### Service detail for a specific type
```sql
SELECT * FROM service_detail WHERE service_type = 'google_ads' AND status = 'active';
```

---

## 13. Complete Field Reference

### clients

| Field | Type | Notes |
|-------|------|-------|
| `id` | UUID (PK) | Auto-generated |
| `name` | VARCHAR(255) UNIQUE | Client/company name |
| `website` | VARCHAR(500) | |
| `industry` | VARCHAR(100) | |
| `company_size` | VARCHAR(50) | |
| `address` | TEXT | |
| `status` | VARCHAR(20) | `active`, `paused`, `past`, `prospect` |
| `client_type` | VARCHAR(100) | e.g. "Retainer", "Web Hosting", "Multi-Service" |
| `tier` | VARCHAR(20) | `enterprise`, `premium`, `growth`, `core`, `starter`, `micro`, `maintenance` |
| `tier_pending` | VARCHAR(20) | |
| `meeting_frequency` | TEXT | e.g. "Monthly", "Bi-Weekly", "Quarterly" |
| `best_form_of_contact` | VARCHAR(100) | e.g. "Email", "Phone Call", "Text" |
| `best_time_of_day` | VARCHAR(100) | e.g. "Office Hours", "Evenings/Weekends" |
| `health_status` | VARCHAR(10) | `green`, `yellow`, `red` |
| `client_sentiment` | VARCHAR(50) | e.g. "Happy", "Neutral", "At Risk", "Unhappy" |
| `client_sentiment_notes` | TEXT | |
| `touch_model` | VARCHAR(20) | CSM playbook field |
| `call_cadence` | VARCHAR(100) | |
| `qbr_frequency` | VARCHAR(50) | |
| `response_sla` | VARCHAR(50) | |
| `monthly_retainer` | DECIMAL(12,2) | |
| `payment_method` | VARCHAR(100) | e.g. "Cash Pay", "Electronic Pay (3% processing fee)" |
| `auto_draft` | BOOLEAN | |
| `invoice_date` | VARCHAR(20) | |
| `tax_exempt` | BOOLEAN | |
| `contract_start_date` | DATE | |
| `contract_end_date` | DATE | |
| `renewal_terms` | VARCHAR(255) | |
| `primary_goal` | VARCHAR(100) | |
| `csm_id` | UUID (FK → team_members) | |
| `sales_rep_id` | UUID (FK → team_members) | |
| `added_to_clutch` | BOOLEAN | |
| `white_label_agency` | VARCHAR(255) | |
| `notes` | TEXT | |
| `metadata` | JSONB | Flexible key-value store |

### google_ads_services

| Field | Type | Notes |
|-------|------|-------|
| `service_id` | UUID (PK, FK → client_services) | 1:1 with client_services |
| `mcc_id` | VARCHAR(30) | Google Ads MCC (Manager) Account ID |
| `google_ad_account_id` | VARCHAR(30) | Individual Google Ads Account ID (CID) |
| `monthly_budget` | DECIMAL(12,2) | |
| `management_fee` | DECIMAL(12,2) | |
| `ad_spend_card_owner` | VARCHAR(20) | `client` or `agency` |
| `fraud_blocker` | BOOLEAN | |
| `budget_caps` | BOOLEAN | |
| `utm_level` | VARCHAR(50) | |
| `overdelivered` | DECIMAL(12,2) | |
| `underdelivered` | DECIMAL(12,2) | |
| `monthly_adj_date` | DATE | |

### lsa_services

| Field | Type | Notes |
|-------|------|-------|
| `service_id` | UUID (PK, FK → client_services) | |
| `monthly_budget` | DECIMAL(12,2) | |
| `ad_spend_card_owner` | VARCHAR(20) | `client` or `agency` |
| `budget_caps` | BOOLEAN | |
| `utm_level` | VARCHAR(50) | |

### social_ad_services

| Field | Type | Notes |
|-------|------|-------|
| `service_id` | UUID (PK, FK → client_services) | |
| `monthly_ad_spend` | DECIMAL(12,2) | |
| `ad_spend_card_owner` | VARCHAR(20) | `client` or `agency` |
| `billing_type` | VARCHAR(50) | |
| `campaign_type` | VARCHAR(100) | |
| `platforms` | JSONB | e.g. `{"meta": true, "tiktok": true}` |
| `pixel_installed` | BOOLEAN | |
| `ads_live` | BOOLEAN | |
| `utm_codes` | BOOLEAN | |
| `ad_account_in_agency` | BOOLEAN | |
| `creative_refresh_frequency` | VARCHAR(50) | |
| `ads_per_refresh` | INTEGER | |
| `overdelivered` | DECIMAL(12,2) | |
| `underdelivered` | DECIMAL(12,2) | |
| `monthly_adj_date` | DATE | |

### seo_services

| Field | Type | Notes |
|-------|------|-------|
| `service_id` | UUID (PK, FK → client_services) | |
| `allocated_hours` | DECIMAL(8,2) | |
| `service_level` | VARCHAR(50) | |
| `website_url` | VARCHAR(500) | |
| `next_review_date` | DATE | |
| `recurring_gmb_task` | BOOLEAN | |
| `monthly_retainer` | DECIMAL(12,2) | |
| `sow` | TEXT | Statement of work |
| `scoped_hours` | DECIMAL(8,2) | |

### social_media_services

| Field | Type | Notes |
|-------|------|-------|
| `service_id` | UUID (PK, FK → client_services) | |
| `posts_per_week` | DECIMAL(6,2) | |
| `budget_hours` | DECIMAL(8,2) | |
| `content_poc` | VARCHAR(255) | Content point of contact |
| `platforms` | JSONB | e.g. `{"facebook": true, "instagram": true}` |
| `community_management` | BOOLEAN | |
| `boosted_posts` | BOOLEAN | |
| `boosting_budget` | DECIMAL(12,2) | **NEW** — Budget for boosted posts |
| `planning_hours` | DECIMAL(8,2) | **NEW** — Monthly planning hours |
| `creative_hours` | DECIMAL(8,2) | **NEW** — Monthly creative hours |
| `post_types` | TEXT | **NEW** — Description of post types |

### email_services

| Field | Type | Notes |
|-------|------|-------|
| `service_id` | UUID (PK, FK → client_services) | |
| `platform` | VARCHAR(100) | e.g. "Mailchimp", "Klaviyo" |
| `scoped_hours` | DECIMAL(8,2) | |
| `sow` | TEXT | |
| `monthly_retainer` | DECIMAL(12,2) | |

### content_services

| Field | Type | Notes |
|-------|------|-------|
| `service_id` | UUID (PK, FK → client_services) | |
| `monthly_budget` | DECIMAL(12,2) | |
| `tier` | TEXT | |
| `sow` | TEXT | |
| `frequency` | VARCHAR(100) | |
| `videographer` | VARCHAR(255) | |
| `production_assistant` | VARCHAR(255) | |
| `account_manager` | VARCHAR(255) | |
| `smm` | VARCHAR(255) | Social media manager |
| `shoot_location` | VARCHAR(255) | |
| `model_info` | TEXT | |
| `concept_owner` | VARCHAR(255) | |

### imm_services

| Field | Type | Notes |
|-------|------|-------|
| `service_id` | UUID (PK, FK → client_services) | |
| `scope` | TEXT | |
| `budget_per_creator` | VARCHAR(100) | |
| `sop_link` | TEXT | |
| `airtable_base` | VARCHAR(255) | |

### client_creative_team

| Field | Type | Notes |
|-------|------|-------|
| `id` | UUID (PK) | Auto-generated |
| `client_id` | UUID (FK → clients, UNIQUE) | One per client |
| `graphic_designer` | VARCHAR(255) | Assigned designer |
| `video_editor` | VARCHAR(255) | Assigned editor |
| `notes` | TEXT | Additional context |
| `created_at` | TIMESTAMPTZ | Auto-set to NOW() |
| `updated_at` | TIMESTAMPTZ | Auto-set to NOW() |

### performance_pull_schedule

| Field | Type | Notes |
|-------|------|-------|
| `id` | UUID (PK) | |
| `client_id` | UUID (FK → clients) | |
| `service_id` | UUID (FK → client_services) | Optional — NULL means client-level pull |
| `pull_type` | VARCHAR(50) | e.g. "google_ads_performance", "ga4_traffic", "seo_rankings" |
| `platform` | VARCHAR(50) | e.g. "google_ads", "ga4", "meta" |
| `pull_method` | VARCHAR(20) | `api`, `csv_upload`, `manual` |
| `frequency` | VARCHAR(20) | `weekly`, `biweekly`, `monthly`, `quarterly` |
| `last_pull_at` | TIMESTAMPTZ | |
| `next_pull_at` | TIMESTAMPTZ | Filtered index on active schedules |
| `status` | VARCHAR(20) | `active`, `paused`, `disabled` |
| `notes` | TEXT | |

---

## 14. What Was Intentionally Left Out

These tables existed in v2.0 but were removed in v3.0:

- **`design_services`** — Replaced by `client_creative_team`. Design assignments are now client-level, not service-level.
- **`copywriting_services`** — No active clients; removed from schema and service_type constraint.
- **`media_services`** — Traditional media tracking consolidated into `traditional_media` service_type; no dedicated extension table.
- **`nextdoor_ads_services`** — Had only 1 row, no current clients. Removed table and constraint value.
- **`bing_ads_services`** — Had 0 active clients. Removed table and constraint value.
- **`team_assignments`** — Functionality replaced by `strategist_id` on `client_services` base table.
- **`dashboard_links`** — Dashboard tracking moved to `performance_pull_schedule`.

Also intentionally omitted (from original v1/v2 drafts):

- **`thoughts`** — Replaced by Mem0. Custom pgvector + embedding management is unnecessary.
- **`budget_history`** — Only useful with triggers that actively write on budget changes.
- **`credential_hub`** — Platform access tracking as a boolean never gets updated.
- **`payment_accounts`** — Sensitive card data with low query value.
- **`profitability_records`** — Vague text fields with no real data source.
- **`contractors`** — Standalone directory with no FK to services.
- **`web_services`** — Website maintenance tracking removed as unnecessary.
- **`gmb_services`** — Google Business Profile tracking removed as unnecessary.

---

## 15. Mem0 Setup Reference

Mem0 uses Supabase as its vector store backend (pgvector). It creates its own `memories` table with a `vector(1536)` column. The `mem0_entity_mappings` table bridges Client Brain UUIDs to Mem0 `user_id` strings.

```python
from mem0 import Memory

config = {
    "vector_store": {
        "provider": "supabase",
        "config": {
            "connection_string": "postgresql://user:password@db.PROJECT_REF.supabase.co:5432/postgres",
            "collection_name": "memories",
            "index_method": "hnsw",
            "index_measure": "cosine_distance"
        }
    }
}

m = Memory.from_config(config)
```

---

## 16. Technical Details

- All tables use UUID primary keys via `gen_random_uuid()`
- Row Level Security (RLS) is enabled on every table with a permissive "Service role full access" policy
- All tables with mutable data have `updated_at` triggers via `update_updated_at()`
- The `pgvector` extension is enabled for Mem0 compatibility
- Supabase project: Client Brain | Motivent | Project ref: `zqmteiehwhbhcsubcqvr`
- Database: PostgreSQL via Supabase
- Schema version: 4.0 | Last updated: March 25, 2026
