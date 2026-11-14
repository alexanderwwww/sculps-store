CREATE TABLE IF NOT EXISTS mob_accounts (
  id serial PRIMARY KEY,
  platform text NOT NULL CHECK (platform IN ('youtube','instagram','tiktok')),
  external_id text NOT NULL,
  handle text,
  access_token text,
  refresh_token text,
  token_expires_at timestamptz,
  refresh_expires_at timestamptz,
  scopes text,
  meta jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'connected',
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (platform, external_id)
);
CREATE TABLE IF NOT EXISTS mob_clips (
  key text PRIMARY KEY,
  title text,
  size_bytes bigint,
  source text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS mob_campaigns (
  id serial PRIMARY KEY,
  name text NOT NULL,
  url text,
  rules text,
  platforms text[] NOT NULL DEFAULT '{}',
  cpm_usd numeric,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS mob_posts (
  id serial PRIMARY KEY,
  account_id int REFERENCES mob_accounts(id) ON DELETE SET NULL,
  clip_key text NOT NULL,
  title text,
  caption text,
  privacy text,
  scheduled_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'scheduled',
  attempts int NOT NULL DEFAULT 0,
  remote_id text,
  remote_url text,
  error text,
  campaign_id int REFERENCES mob_campaigns(id) ON DELETE SET NULL,
  created_by text,
  upload_started_at timestamptz,
  published_id text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE mob_posts ADD COLUMN IF NOT EXISTS upload_started_at timestamptz;
ALTER TABLE mob_posts ADD COLUMN IF NOT EXISTS published_id text;
CREATE INDEX IF NOT EXISTS mob_posts_due ON mob_posts (status, scheduled_at);
CREATE TABLE IF NOT EXISTS mob_submissions (
  id serial PRIMARY KEY,
  campaign_id int NOT NULL REFERENCES mob_campaigns(id) ON DELETE CASCADE,
  post_id int REFERENCES mob_posts(id) ON DELETE SET NULL,
  posted_url text NOT NULL,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'submitted',
  views int,
  payout_usd numeric,
  note text,
  UNIQUE (campaign_id, posted_url)
);
CREATE TABLE IF NOT EXISTS mob_oauth_state (
  state text PRIMARY KEY,
  platform text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS mob_login_fail (
  id serial PRIMARY KEY,
  ip text NOT NULL,
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mob_login_fail_ip ON mob_login_fail (ip, at);
