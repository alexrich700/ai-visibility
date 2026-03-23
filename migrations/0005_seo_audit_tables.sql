CREATE TABLE IF NOT EXISTS seo_audits (
  id serial PRIMARY KEY,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'draft',
  current_stage text,
  business_name text NOT NULL,
  business_url text NOT NULL,
  business_address text,
  business_lat real,
  business_lng real,
  business_type text NOT NULL DEFAULT 'local',
  industry text,
  service_area_cities jsonb DEFAULT '[]'::jsonb,
  services jsonb DEFAULT '[]'::jsonb,
  geo_grid_keywords jsonb DEFAULT '[]'::jsonb,
  geo_grid_size integer DEFAULT 13,
  geo_grid_spacing_miles real DEFAULT 1.0,
  competitors jsonb DEFAULT '[]'::jsonb,
  market_position_score integer,
  site_health_grade text,
  share_of_local_voice real,
  average_grid_rank real,
  total_keyword_gaps integer,
  total_content_gaps integer,
  total_deliverables integer,
  estimated_total_hours real,
  estimated_monthly_investment real,
  ai_visibility_score integer,
  geo_visibility_data jsonb,
  executive_narrative text,
  crawl_task_id text,
  created_by integer,
  magic_link_token text UNIQUE,
  organization_id integer
);

CREATE INDEX IF NOT EXISTS seo_audits_status_idx ON seo_audits (status);
CREATE INDEX IF NOT EXISTS seo_audits_magic_link_idx ON seo_audits (magic_link_token);

CREATE TABLE IF NOT EXISTS audit_keywords (
  id serial PRIMARY KEY,
  audit_id integer NOT NULL REFERENCES seo_audits(id) ON DELETE CASCADE,
  keyword text NOT NULL,
  search_volume integer,
  cpc real,
  competition_level text,
  seasonal_trends jsonb,
  intent text,
  page_type text,
  target_city text,
  target_service text,
  existing_page_url text,
  current_organic_rank integer,
  current_local_pack_rank integer,
  in_ai_overview boolean DEFAULT false,
  competitor_ranks jsonb DEFAULT '{}'::jsonb,
  priority text DEFAULT 'medium'
);

CREATE INDEX IF NOT EXISTS audit_keywords_audit_id_idx ON audit_keywords (audit_id);

CREATE TABLE IF NOT EXISTS audit_geo_grids (
  id serial PRIMARY KEY,
  audit_id integer NOT NULL REFERENCES seo_audits(id) ON DELETE CASCADE,
  keyword text NOT NULL,
  grid_size integer NOT NULL,
  spacing_miles real NOT NULL,
  center_lat real NOT NULL,
  center_lng real NOT NULL,
  client_solv real,
  client_avg_rank real,
  competitor_solv real,
  competitor_name text,
  competitor_avg_rank real,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_geo_grids_audit_id_idx ON audit_geo_grids (audit_id);

CREATE TABLE IF NOT EXISTS audit_geo_grid_points (
  id serial PRIMARY KEY,
  grid_id integer NOT NULL REFERENCES audit_geo_grids(id) ON DELETE CASCADE,
  grid_row integer NOT NULL,
  grid_col integer NOT NULL,
  lat real NOT NULL,
  lng real NOT NULL,
  client_rank integer,
  competitor_rank integer,
  local_pack_results jsonb DEFAULT '[]'::jsonb
);

CREATE INDEX IF NOT EXISTS audit_geo_grid_points_grid_id_idx ON audit_geo_grid_points (grid_id);

CREATE TABLE IF NOT EXISTS audit_technical_findings (
  id serial PRIMARY KEY,
  audit_id integer NOT NULL REFERENCES seo_audits(id) ON DELETE CASCADE,
  category text NOT NULL,
  check_name text NOT NULL,
  status text NOT NULL,
  value text,
  threshold text,
  description text,
  impact text
);

CREATE INDEX IF NOT EXISTS audit_technical_findings_audit_id_idx ON audit_technical_findings (audit_id);

CREATE TABLE IF NOT EXISTS audit_competitors (
  id serial PRIMARY KEY,
  audit_id integer NOT NULL REFERENCES seo_audits(id) ON DELETE CASCADE,
  domain text NOT NULL,
  business_name text,
  domain_rating integer,
  total_organic_keywords integer,
  monthly_organic_traffic integer,
  referring_domains integer,
  google_review_count integer,
  google_review_rating real,
  backlink_summary jsonb,
  top_backlinks jsonb DEFAULT '[]'::jsonb
);

CREATE INDEX IF NOT EXISTS audit_competitors_audit_id_idx ON audit_competitors (audit_id);

CREATE TABLE IF NOT EXISTS audit_content_gaps (
  id serial PRIMARY KEY,
  audit_id integer NOT NULL REFERENCES seo_audits(id) ON DELETE CASCADE,
  gap_type text NOT NULL,
  target_keyword text,
  target_city text,
  target_service text,
  search_volume integer,
  priority text DEFAULT 'medium',
  estimated_hours real,
  status text DEFAULT 'missing'
);

CREATE INDEX IF NOT EXISTS audit_content_gaps_audit_id_idx ON audit_content_gaps (audit_id);

CREATE TABLE IF NOT EXISTS audit_reviews (
  id serial PRIMARY KEY,
  audit_id integer NOT NULL REFERENCES seo_audits(id) ON DELETE CASCADE,
  entity_type text NOT NULL,
  entity_name text NOT NULL,
  platform text NOT NULL,
  review_count integer,
  average_rating real,
  most_recent_review_date timestamp,
  monthly_velocity real,
  sentiment_summary jsonb
);

CREATE INDEX IF NOT EXISTS audit_reviews_audit_id_idx ON audit_reviews (audit_id);

CREATE TABLE IF NOT EXISTS audit_deliverables (
  id serial PRIMARY KEY,
  audit_id integer NOT NULL REFERENCES seo_audits(id) ON DELETE CASCADE,
  phase integer NOT NULL,
  category text NOT NULL,
  title text NOT NULL,
  description text,
  estimated_hours real NOT NULL,
  priority text DEFAULT 'medium',
  sort_order integer DEFAULT 0
);

CREATE INDEX IF NOT EXISTS audit_deliverables_audit_id_idx ON audit_deliverables (audit_id);

CREATE TABLE IF NOT EXISTS audit_ppc_forecast (
  id serial PRIMARY KEY,
  audit_id integer NOT NULL REFERENCES seo_audits(id) ON DELETE CASCADE,
  keyword text NOT NULL,
  geo_target text,
  estimated_clicks real,
  estimated_impressions real,
  estimated_cpc real,
  estimated_cost real,
  estimated_conversions real,
  forecast_period_days integer DEFAULT 90
);

CREATE INDEX IF NOT EXISTS audit_ppc_forecast_audit_id_idx ON audit_ppc_forecast (audit_id);

CREATE TABLE IF NOT EXISTS audit_stage_log (
  id serial PRIMARY KEY,
  audit_id integer NOT NULL REFERENCES seo_audits(id) ON DELETE CASCADE,
  stage text NOT NULL,
  stage_index integer NOT NULL DEFAULT 0,
  status text NOT NULL,
  started_at timestamp NOT NULL DEFAULT now(),
  completed_at timestamp,
  error_message text,
  metadata jsonb DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS audit_stage_log_audit_id_idx ON audit_stage_log (audit_id);
CREATE INDEX IF NOT EXISTS audit_stage_log_status_idx ON audit_stage_log (status);
