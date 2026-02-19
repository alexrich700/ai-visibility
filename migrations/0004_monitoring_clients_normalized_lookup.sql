ALTER TABLE monitoring_clients
  ADD COLUMN IF NOT EXISTS normalized_business_name text;

ALTER TABLE monitoring_clients
  ADD COLUMN IF NOT EXISTS normalized_domain text;

UPDATE monitoring_clients
SET
  normalized_business_name = lower(trim(business_name)),
  normalized_domain = regexp_replace(lower(trim(domain)), '^https?://', '');

UPDATE monitoring_clients
SET normalized_domain = regexp_replace(normalized_domain, '/+$', '');

ALTER TABLE monitoring_clients
  ALTER COLUMN normalized_business_name SET NOT NULL,
  ALTER COLUMN normalized_domain SET NOT NULL;

ALTER TABLE monitoring_clients
  ALTER COLUMN normalized_business_name SET DEFAULT '',
  ALTER COLUMN normalized_domain SET DEFAULT '';

CREATE INDEX IF NOT EXISTS monitoring_clients_normalized_lookup_idx
  ON monitoring_clients (normalized_business_name, normalized_domain);
