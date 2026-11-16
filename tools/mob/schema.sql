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
ALTER TABLE mob_campaigns ADD COLUMN IF NOT EXISTS min_payout_usd numeric;
ALTER TABLE mob_campaigns ADD COLUMN IF NOT EXISTS max_payout_usd numeric;
ALTER TABLE mob_campaigns ADD COLUMN IF NOT EXISTS budget_usd numeric;
ALTER TABLE mob_campaigns ADD COLUMN IF NOT EXISTS paid_out_usd numeric;
ALTER TABLE mob_submissions ADD COLUMN IF NOT EXISTS est_payout_usd numeric;
ALTER TABLE mob_submissions ADD COLUMN IF NOT EXISTS views_at timestamptz;
CREATE TABLE IF NOT EXISTS mob_platform_apps (
  platform text PRIMARY KEY CHECK (platform IN ('youtube','instagram','tiktok')),
  stage text NOT NULL DEFAULT 'none',
  stage_note text,
  client_id_hint text,
  keys_set_at timestamptz,
  review_status text NOT NULL DEFAULT 'none',
  updated_by text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS mob_account_stats (
  id serial PRIMARY KEY,
  account_id int NOT NULL REFERENCES mob_accounts(id) ON DELETE CASCADE,
  day date NOT NULL,
  taken_at timestamptz NOT NULL DEFAULT now(),
  views_total bigint,
  followers bigint,
  videos int,
  likes_total bigint,
  raw jsonb NOT NULL DEFAULT '{}',
  UNIQUE (account_id, day)
);
CREATE TABLE IF NOT EXISTS mob_post_stats (
  id serial PRIMARY KEY,
  account_id int NOT NULL REFERENCES mob_accounts(id) ON DELETE CASCADE,
  post_id int REFERENCES mob_posts(id) ON DELETE SET NULL,
  remote_id text NOT NULL,
  day date NOT NULL,
  taken_at timestamptz NOT NULL DEFAULT now(),
  title text,
  url text,
  views bigint,
  likes bigint,
  comments bigint,
  shares bigint,
  saves bigint,
  UNIQUE (account_id, remote_id, day)
);
CREATE INDEX IF NOT EXISTS mob_post_stats_day ON mob_post_stats (day);
CREATE TABLE IF NOT EXISTS mob_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS mob_aquarius (
  id serial PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('say','heard')),
  text text NOT NULL,
  face text,
  suit boolean,
  to_chat boolean NOT NULL DEFAULT false,
  taken_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS mob_aquarius_brain (
  id serial PRIMARY KEY,
  idea text NOT NULL,
  business text,
  cost numeric,
  expected_return numeric,
  result text,
  score numeric,
  kill_date date,
  source text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS mob_aquarius_link (
  id text PRIMARY KEY,
  action text NOT NULL,
  input jsonb NOT NULL DEFAULT '{}',
  state text NOT NULL DEFAULT 'queued',
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  taken_at timestamptz,
  done_at timestamptz
);
CREATE TABLE IF NOT EXISTS mob_income (
  id serial PRIMARY KEY,
  date date NOT NULL DEFAULT current_date,
  business text NOT NULL,
  source text NOT NULL,
  amount_cents bigint NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  ext_ref text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS mob_income_ext_ref ON mob_income (ext_ref) WHERE ext_ref IS NOT NULL;
CREATE TABLE IF NOT EXISTS mob_news (
  id serial PRIMARY KEY,
  topic text NOT NULL DEFAULT 'business',
  headline text NOT NULL,
  url text,
  source text,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS mob_aq_depts (id text PRIMARY KEY, name text NOT NULL, god text, skills jsonb NOT NULL DEFAULT '[]', live boolean NOT NULL DEFAULT false, note text, last_run_at timestamptz);
CREATE TABLE IF NOT EXISTS mob_aq_bots (
  id serial PRIMARY KEY, key text UNIQUE, dept text NOT NULL, name text NOT NULL, job text NOT NULL, rules text NOT NULL DEFAULT '',
  skills jsonb NOT NULL DEFAULT '[]', power text NOT NULL DEFAULT 'code', status text NOT NULL DEFAULT 'idle', note text,
  created_by text NOT NULL DEFAULT 'seed', approved boolean NOT NULL DEFAULT true, proposed_by text, verdict text,
  created_at timestamptz NOT NULL DEFAULT now(), last_run_at timestamptz
);
CREATE TABLE IF NOT EXISTS mob_aq_positions (
  id serial PRIMARY KEY, strategy text NOT NULL, mint text NOT NULL, pool text NOT NULL, symbol text, decimals int NOT NULL,
  tokens_raw text NOT NULL, size_sol double precision NOT NULL, fee_sol double precision NOT NULL, entry_price_usd double precision NOT NULL,
  entry_mid_usd double precision, stop_price double precision NOT NULL, target_price double precision NOT NULL, stop_pct double precision, target_pct double precision,
  rt_pct double precision, buy_slip_pct double precision, opened_at timestamptz NOT NULL DEFAULT now(), time_stop_at timestamptz NOT NULL,
  last_price_usd double precision, last_value_sol double precision, last_at timestamptz
);
CREATE TABLE IF NOT EXISTS mob_aq_trades (
  id serial PRIMARY KEY, position_id int, strategy text NOT NULL, mint text, symbol text, size_sol double precision, back_sol double precision,
  entry_price_usd double precision, exit_price_usd double precision, pnl_sol double precision, pnl_pct double precision, fees_sol double precision,
  slippage_pct double precision, reason text, grade text, opened_at timestamptz, closed_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS mob_aq_flows (id bigserial PRIMARY KEY, kind text NOT NULL, sol double precision NOT NULL, dept text, label text, at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS mob_aq_council (id serial PRIMARY KEY, verdict text NOT NULL, symbol text, mint text, strategy text, reason text, number double precision, facts jsonb, at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS mob_aq_brain (id serial PRIMARY KEY, dept text NOT NULL, kind text NOT NULL DEFAULT 'lesson', text text NOT NULL, data jsonb, at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS mob_aq_state (k text PRIMARY KEY, v jsonb, at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS mob_aq_market (k text PRIMARY KEY, data jsonb, ok boolean NOT NULL DEFAULT false, err text, at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS mob_aq_strategies (id text PRIMARY KEY, name text NOT NULL, market text, params jsonb NOT NULL DEFAULT '{}', alive boolean NOT NULL DEFAULT true, status text NOT NULL DEFAULT 'not tested', stats jsonb, parent text, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS mob_aq_tools (name text PRIMARY KEY, licence text, verdict text, status text NOT NULL DEFAULT 'planned', used_by text, best_use text);
CREATE TABLE IF NOT EXISTS mob_aq_helpers (id serial PRIMARY KEY, from_helper text NOT NULL, role text, dept text, channel text, text text NOT NULL, labels jsonb NOT NULL DEFAULT '[]', weight double precision NOT NULL DEFAULT 1, at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS mob_aq_candles (pool text NOT NULL, t bigint NOT NULL, o double precision, h double precision, l double precision, c double precision, v double precision, PRIMARY KEY (pool, t));
CREATE TABLE IF NOT EXISTS mob_aq_tasks (id serial PRIMARY KEY, kind text NOT NULL DEFAULT 'research', title text NOT NULL, detail text, created_by text NOT NULL DEFAULT 'alex', status text NOT NULL DEFAULT 'open', result text, done_by text, created_at timestamptz NOT NULL DEFAULT now(), done_at timestamptz);
CREATE TABLE IF NOT EXISTS mob_aq_helper_log (id serial PRIMARY KEY, helper text NOT NULL, session text, tool text NOT NULL, args jsonb, ok boolean, at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS mob_aq_wtrades (tx text NOT NULL, wallet text NOT NULL, mint text NOT NULL, kind text NOT NULL, sol double precision NOT NULL, at timestamptz NOT NULL, PRIMARY KEY (tx, wallet, kind));
CREATE INDEX IF NOT EXISTS mob_aq_wtrades_wallet ON mob_aq_wtrades (wallet, mint);
CREATE TABLE IF NOT EXISTS mob_aq_funders (wallet text PRIMARY KEY, funder text, source text, checked_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS mob_aq_shadow (id serial PRIMARY KEY, mint text NOT NULL, pool text NOT NULL, symbol text, block_reason text NOT NULL, entry_price double precision NOT NULL, stop_price double precision NOT NULL, target_price double precision NOT NULL, cost_pct double precision NOT NULL, cost_source text, opened_at timestamptz NOT NULL DEFAULT now(), time_stop_at timestamptz NOT NULL, closed_at timestamptz, exit_price double precision, pnl_pct double precision, outcome text);
CREATE TABLE IF NOT EXISTS mob_aq_picks (id serial PRIMARY KEY, helper text NOT NULL, symbol text, mint text NOT NULL, pool text, thesis text NOT NULL, labels jsonb NOT NULL DEFAULT '[]', stop_pct double precision NOT NULL, target_pct double precision NOT NULL, entry_hint double precision, status text NOT NULL DEFAULT 'queued', verdict text, verdict_reason text, verdict_number double precision, entry_price double precision, stop_price double precision, target_price double precision, cost_pct double precision, cost_source text, created_at timestamptz NOT NULL DEFAULT now(), opened_at timestamptz, time_stop_at timestamptz, closed_at timestamptz, exit_price double precision, pnl_pct double precision, outcome text);
