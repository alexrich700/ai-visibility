ALTER TABLE seo_audits ADD COLUMN IF NOT EXISTS ai_visibility_score INTEGER;
ALTER TABLE seo_audits ADD COLUMN IF NOT EXISTS geo_visibility_data JSONB;
