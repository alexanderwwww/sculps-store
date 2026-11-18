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
CREATE TABLE IF NOT EXISTS mob_aq_watch (mint text PRIMARY KEY, pool text NOT NULL, symbol text, liq_usd double precision, vol_h1 double precision, ch1h double precision, price_usd double precision, src text, first_seen timestamptz NOT NULL DEFAULT now(), last_seen timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS mob_aq_prices (mint text NOT NULL, at timestamptz NOT NULL DEFAULT now(), price double precision NOT NULL, PRIMARY KEY (mint, at));
CREATE TABLE IF NOT EXISTS mob_aq_whales (wallet text PRIMARY KEY, wins int NOT NULL DEFAULT 0, closed int NOT NULL DEFAULT 0, net_sol double precision NOT NULL DEFAULT 0, winner boolean NOT NULL DEFAULT false, updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS mob_aq_mined (mint text PRIMARY KEY, symbol text, why text, cursor_offset text, cursor_ts text, pages int NOT NULL DEFAULT 0, trades int NOT NULL DEFAULT 0, done boolean NOT NULL DEFAULT false, oldest timestamptz, started_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS mob_aq_signals (id serial PRIMARY KEY, mint text NOT NULL, symbol text, at timestamptz NOT NULL DEFAULT now(), wallets jsonb NOT NULL DEFAULT '[]', independent int, funders text, price_usd double precision, verdict text, reason text, price_15m double precision, price_60m double precision, pct_15m double precision, pct_60m double precision);
CREATE TABLE IF NOT EXISTS mob_aq_rules (name text PRIMARY KEY, weight double precision NOT NULL DEFAULT 1, blocked_winners int NOT NULL DEFAULT 0, blocked_losers int NOT NULL DEFAULT 0, history jsonb NOT NULL DEFAULT '[]', updated_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE mob_aq_positions ADD COLUMN IF NOT EXISTS tier text;
ALTER TABLE mob_aq_positions ADD COLUMN IF NOT EXISTS tag text;
ALTER TABLE mob_aq_positions ADD COLUMN IF NOT EXISTS soft jsonb;
ALTER TABLE mob_aq_positions ADD COLUMN IF NOT EXISTS score double precision;
ALTER TABLE mob_aq_trades ADD COLUMN IF NOT EXISTS tier text;
ALTER TABLE mob_aq_trades ADD COLUMN IF NOT EXISTS tag text;
ALTER TABLE mob_aq_trades ADD COLUMN IF NOT EXISTS soft jsonb;
ALTER TABLE mob_aq_positions ADD COLUMN IF NOT EXISTS variant text;
ALTER TABLE mob_aq_positions ADD COLUMN IF NOT EXISTS entry_variant text;
ALTER TABLE mob_aq_positions ADD COLUMN IF NOT EXISTS half_done boolean NOT NULL DEFAULT false;
ALTER TABLE mob_aq_positions ADD COLUMN IF NOT EXISTS realized_sol double precision NOT NULL DEFAULT 0;
ALTER TABLE mob_aq_trades ADD COLUMN IF NOT EXISTS variant text;
ALTER TABLE mob_aq_trades ADD COLUMN IF NOT EXISTS entry_variant text;
ALTER TABLE mob_aq_trades ADD COLUMN IF NOT EXISTS scaled boolean;
ALTER TABLE mob_aq_positions ADD COLUMN IF NOT EXISTS strength double precision;
ALTER TABLE mob_aq_trades ADD COLUMN IF NOT EXISTS strength double precision;
CREATE TABLE IF NOT EXISTS mob_aq_nansen_trades (id serial PRIMARY KEY, key text UNIQUE NOT NULL, label text, prefix text, wallet text, bought text, amt_bought double precision, sold text, amt_sold double precision, value_usd double precision, is_buy boolean, seen_at timestamptz NOT NULL DEFAULT now(), trade_at timestamptz, mint text, resolved text, signal boolean NOT NULL DEFAULT false, weight double precision, cand jsonb);
CREATE TABLE IF NOT EXISTS mob_aq_nansen_leaders (prefix text PRIMARY KEY, label text, wallet text, total_pnl double precision, realized_pnl double precision, roi_pct double precision, win_rate_pct double precision, trades double precision, updated_at timestamptz NOT NULL DEFAULT now());
CREATE SEQUENCE IF NOT EXISTS mob_aq_slot_seq START 1000;
ALTER TABLE mob_aq_positions ADD COLUMN IF NOT EXISTS slot int NOT NULL DEFAULT nextval('mob_aq_slot_seq');
CREATE UNIQUE INDEX IF NOT EXISTS aqx_positions_slot ON mob_aq_positions (slot);
CREATE UNIQUE INDEX IF NOT EXISTS aqx_positions_mint ON mob_aq_positions (mint);
CREATE UNIQUE INDEX IF NOT EXISTS aqx_trades_position ON mob_aq_trades (position_id) WHERE position_id IS NOT NULL;
ALTER TABLE mob_aq_flows ADD COLUMN IF NOT EXISTS position_id int;
ALTER TABLE mob_aq_flows ADD COLUMN IF NOT EXISTS trade_id int;
ALTER TABLE mob_aq_trades ADD COLUMN IF NOT EXISTS pool text;
ALTER TABLE mob_aq_trades ADD COLUMN IF NOT EXISTS stop_price double precision;
ALTER TABLE mob_aq_trades ADD COLUMN IF NOT EXISTS target_price double precision;
ALTER TABLE mob_aq_trades ADD COLUMN IF NOT EXISTS stop_pct double precision;
ALTER TABLE mob_aq_trades ADD COLUMN IF NOT EXISTS target_pct double precision;
ALTER TABLE mob_aq_trades ADD COLUMN IF NOT EXISTS rt_pct double precision;
ALTER TABLE mob_aq_trades ADD COLUMN IF NOT EXISTS entry_mid_usd double precision;
ALTER TABLE mob_aq_trades ADD COLUMN IF NOT EXISTS exit_mid_usd double precision;
ALTER TABLE mob_aq_trades ADD COLUMN IF NOT EXISTS score double precision;
ALTER TABLE mob_aq_trades ADD COLUMN IF NOT EXISTS buy_slip_pct double precision;
ALTER TABLE mob_aq_trades ADD COLUMN IF NOT EXISTS time_stop_at timestamptz;
ALTER TABLE mob_aq_positions ADD COLUMN IF NOT EXISTS sol_usd_entry double precision;
ALTER TABLE mob_aq_positions ADD COLUMN IF NOT EXISTS exit_k double precision;
ALTER TABLE mob_aq_positions ADD COLUMN IF NOT EXISTS tvar text;
ALTER TABLE mob_aq_positions ADD COLUMN IF NOT EXISTS atr5_pct double precision;
ALTER TABLE mob_aq_positions ADD COLUMN IF NOT EXISTS hold_min double precision;
ALTER TABLE mob_aq_positions ADD COLUMN IF NOT EXISTS stop_unconfirmed int NOT NULL DEFAULT 0;
ALTER TABLE mob_aq_trades ADD COLUMN IF NOT EXISTS sol_usd_entry double precision;
ALTER TABLE mob_aq_trades ADD COLUMN IF NOT EXISTS tvar text;
ALTER TABLE mob_aq_trades ADD COLUMN IF NOT EXISTS atr5_pct double precision;
ALTER TABLE mob_aq_trades ADD COLUMN IF NOT EXISTS hold_min double precision;
ALTER TABLE mob_aq_trades ADD COLUMN IF NOT EXISTS stop_unconfirmed int;
ALTER TABLE mob_aq_shadow ADD COLUMN IF NOT EXISTS v int NOT NULL DEFAULT 1;
ALTER TABLE mob_aq_shadow ADD COLUMN IF NOT EXISTS strategy text;
ALTER TABLE mob_aq_shadow ADD COLUMN IF NOT EXISTS tier text;
ALTER TABLE mob_aq_shadow ADD COLUMN IF NOT EXISTS atr5_pct double precision;
ALTER TABLE mob_aq_signals ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'own';
ALTER TABLE mob_aq_signals ADD COLUMN IF NOT EXISTS label text;
ALTER TABLE mob_aq_signals ADD COLUMN IF NOT EXISTS pct_5m double precision;
ALTER TABLE mob_aq_signals ADD COLUMN IF NOT EXISTS pct_30m double precision;
ALTER TABLE mob_aq_signals ADD COLUMN IF NOT EXISTS ctrl_mint text;
ALTER TABLE mob_aq_signals ADD COLUMN IF NOT EXISTS ctrl_symbol text;
ALTER TABLE mob_aq_signals ADD COLUMN IF NOT EXISTS ctrl_price double precision;
ALTER TABLE mob_aq_signals ADD COLUMN IF NOT EXISTS ctrl_5m double precision;
ALTER TABLE mob_aq_signals ADD COLUMN IF NOT EXISTS ctrl_15m double precision;
ALTER TABLE mob_aq_signals ADD COLUMN IF NOT EXISTS ctrl_30m double precision;
ALTER TABLE mob_aq_signals ADD COLUMN IF NOT EXISTS ctrl_60m double precision;
ALTER TABLE mob_aq_trades ADD COLUMN IF NOT EXISTS overshoot_pct double precision;
ALTER TABLE mob_aq_positions ADD COLUMN IF NOT EXISTS sizing jsonb;
ALTER TABLE mob_aq_trades ADD COLUMN IF NOT EXISTS sizing jsonb;
ALTER TABLE mob_aq_whales ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'mined';
ALTER TABLE mob_aq_whales ADD COLUMN IF NOT EXISTS label text;
ALTER TABLE mob_aq_whales ADD COLUMN IF NOT EXISTS cand boolean NOT NULL DEFAULT false;
ALTER TABLE mob_aq_whales ADD COLUMN IF NOT EXISTS jup jsonb;
ALTER TABLE mob_aq_whales ADD COLUMN IF NOT EXISTS kol jsonb;
ALTER TABLE mob_aq_whales ADD COLUMN IF NOT EXISTS scored_at timestamptz;
CREATE TABLE IF NOT EXISTS mob_aq_pools (pool text PRIMARY KEY, mint text, symbol text, tier text, updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS mob_aq_votes (id serial PRIMARY KEY, helper text NOT NULL, mint text NOT NULL, symbol text, vote text NOT NULL, confidence double precision NOT NULL, reason text, labels jsonb NOT NULL DEFAULT '[]', at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL, live boolean NOT NULL DEFAULT true, replaced_at timestamptz, seat boolean NOT NULL DEFAULT true, counted boolean NOT NULL DEFAULT true, position_id int, price_usd double precision, cost_pct double precision, judged_at timestamptz, applied jsonb, handled_at timestamptz, outcome text, pct_15m double precision, pct_30m double precision, trade_id int, trade_pnl_pct double precision, is_right boolean, grade_by text, graded_at timestamptz);
CREATE UNIQUE INDEX IF NOT EXISTS aqx_votes_live ON mob_aq_votes (helper, mint) WHERE live;
CREATE TABLE IF NOT EXISTS mob_aq_alerts (id serial PRIMARY KEY, helper text NOT NULL, mint text NOT NULL, symbol text, kind text NOT NULL, price double precision, note text, at timestamptz NOT NULL DEFAULT now(), position_id int, confirmed boolean NOT NULL DEFAULT false, result text, trade_id int, facts jsonb);
CREATE TABLE IF NOT EXISTS mob_aq_chat (id bigserial PRIMARY KEY, at timestamptz NOT NULL DEFAULT now(), from_name text NOT NULL, to_name text, text text NOT NULL);
ALTER TABLE mob_aq_positions ADD COLUMN IF NOT EXISTS seat_exit text;
CREATE TABLE IF NOT EXISTS mob_aq_arena_agg (day date NOT NULL, variant text NOT NULL, tier text NOT NULL, tod int NOT NULL, regime text NOT NULL DEFAULT 'unknown', n int NOT NULL DEFAULT 0, wins int NOT NULL DEFAULT 0, sum_pct double precision NOT NULL DEFAULT 0, sumsq_pct double precision NOT NULL DEFAULT 0, n_stop int NOT NULL DEFAULT 0, n_target int NOT NULL DEFAULT 0, n_time int NOT NULL DEFAULT 0, cum_pct double precision NOT NULL DEFAULT 0, peak_pct double precision NOT NULL DEFAULT 0, maxdd_pct double precision NOT NULL DEFAULT 0, PRIMARY KEY (day, variant, tier, tod, regime));
CREATE TABLE IF NOT EXISTS mob_aq_arena_replay (day date NOT NULL, variant text NOT NULL, tier text NOT NULL, tod int NOT NULL, regime text NOT NULL DEFAULT 'unknown', n int NOT NULL DEFAULT 0, wins int NOT NULL DEFAULT 0, sum_pct double precision NOT NULL DEFAULT 0, sumsq_pct double precision NOT NULL DEFAULT 0, n_stop int NOT NULL DEFAULT 0, n_target int NOT NULL DEFAULT 0, n_time int NOT NULL DEFAULT 0, cum_pct double precision NOT NULL DEFAULT 0, peak_pct double precision NOT NULL DEFAULT 0, maxdd_pct double precision NOT NULL DEFAULT 0, PRIMARY KEY (day, variant, tier, tod, regime));
CREATE TABLE IF NOT EXISTS mob_aq_arena_samples (variant text NOT NULL, tier text NOT NULL, slot int NOT NULL, mint text, symbol text, entry_min bigint, hold_min int, entry_px double precision, atr_pct double precision, why text, gross_pct double precision, net_pct double precision, at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (variant, tier, slot));
CREATE TABLE IF NOT EXISTS mob_aq_arena_costs (id serial PRIMARY KEY, tier text NOT NULL, size_sol double precision NOT NULL, mint text, rt_pct double precision NOT NULL, at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS mob_aq_arena_picks (id serial PRIMARY KEY, variant text NOT NULL, tier text NOT NULL, selected_day date NOT NULL, sel jsonb, status text NOT NULL DEFAULT 'selected', confirm_day date, conf jsonb, at timestamptz NOT NULL DEFAULT now(), UNIQUE (variant, tier, selected_day));
ALTER TABLE mob_aq_arena_agg ADD COLUMN IF NOT EXISTS pnl_sol double precision NOT NULL DEFAULT 0;
ALTER TABLE mob_aq_arena_replay ADD COLUMN IF NOT EXISTS pnl_sol double precision NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS mob_aq_wroll (wallet text NOT NULL, mint text NOT NULL, buy_sol double precision NOT NULL DEFAULT 0, sell_sol double precision NOT NULL DEFAULT 0, n int NOT NULL DEFAULT 0, buys int NOT NULL DEFAULT 0, sells int NOT NULL DEFAULT 0, first_buy timestamptz, first_sell timestamptz, last_sell timestamptz, first_at timestamptz, last_at timestamptz, PRIMARY KEY (wallet, mint));
CREATE INDEX IF NOT EXISTS aqx_wroll_last ON mob_aq_wroll (last_at);
CREATE TABLE IF NOT EXISTS mob_aq_wfold (wallet text PRIMARY KEY, coins int NOT NULL DEFAULT 0, closed int NOT NULL DEFAULT 0, wins int NOT NULL DEFAULT 0, net_sol double precision NOT NULL DEFAULT 0, swaps int NOT NULL DEFAULT 0, both_sides int NOT NULL DEFAULT 0, last_at timestamptz);
CREATE TABLE IF NOT EXISTS mob_aq_candles_five (pool text NOT NULL, t bigint NOT NULL, o double precision, h double precision, l double precision, c double precision, v double precision, bars int NOT NULL DEFAULT 0, PRIMARY KEY (pool, t));
CREATE TABLE IF NOT EXISTS mob_aq_candles_hour (pool text NOT NULL, t bigint NOT NULL, o double precision, h double precision, l double precision, c double precision, v double precision, bars int NOT NULL DEFAULT 0, PRIMARY KEY (pool, t));
CREATE TABLE IF NOT EXISTS mob_aq_council_daily (day date NOT NULL, verdict text NOT NULL, kind text NOT NULL, reason text NOT NULL, n int NOT NULL DEFAULT 0, PRIMARY KEY (day, verdict, kind, reason));
CREATE INDEX IF NOT EXISTS aqx_wtrades_mint_at ON mob_aq_wtrades (mint, at);
CREATE TABLE IF NOT EXISTS mob_aq_live_orders (id bigserial PRIMARY KEY, venue text NOT NULL, side text NOT NULL, mint text, symbol text, position_id bigint, claim text NOT NULL UNIQUE, status text NOT NULL DEFAULT 'requested', reason text, error text, in_amount text, quote_out text, min_out text, impact_pct double precision, slippage_bps int, signature text UNIQUE, last_valid_height bigint, fill_sol double precision, fill_tokens text, fee_sol double precision, quote jsonb, requested_at timestamptz NOT NULL DEFAULT now(), sent_at timestamptz, confirmed_at timestamptz, updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS mob_aq_live_positions (id bigserial PRIMARY KEY, venue text NOT NULL, mint text NOT NULL, symbol text, status text NOT NULL DEFAULT 'opening', tokens_raw text, cost_sol double precision, proceeds_sol double precision, fees_sol double precision NOT NULL DEFAULT 0, stop_pct double precision, atr5_pct double precision, pool_liq_usd double precision, last_value_sol double precision, last_value_at timestamptz, sell_fails int NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now(), opened_at timestamptz, time_exit_at timestamptz, closed_at timestamptz, exit_reason text, pnl_sol double precision);
CREATE UNIQUE INDEX IF NOT EXISTS aqx_live_pos_active ON mob_aq_live_positions (venue, mint) WHERE status IN ('opening','open','closing','stuck');
CREATE TABLE IF NOT EXISTS mob_aq_sym_right (mint text PRIMARY KEY, symbol text, lane text, flagged_at timestamptz NOT NULL DEFAULT now(), gain_pct double precision, status text NOT NULL DEFAULT 'flagged', checks jsonb, checked_at timestamptz);
CREATE TABLE IF NOT EXISTS mob_aq_live_refusals (id bigserial PRIMARY KEY, venue text NOT NULL, gate text NOT NULL, mint text NOT NULL DEFAULT '', symbol text, reason text NOT NULL, bucket bigint NOT NULL, n int NOT NULL DEFAULT 1, at timestamptz NOT NULL DEFAULT now(), UNIQUE (venue, gate, mint, bucket));
ALTER TABLE mob_aq_live_orders ADD COLUMN IF NOT EXISTS dest text;
CREATE UNIQUE INDEX IF NOT EXISTS aqx_live_withdraw_pending ON mob_aq_live_orders (venue) WHERE side = 'withdraw' AND status IN ('requested','sent');
ALTER TABLE mob_aq_live_orders ADD COLUMN IF NOT EXISTS wallet text;
ALTER TABLE mob_aq_live_positions ADD COLUMN IF NOT EXISTS plan jsonb;
ALTER TABLE mob_aq_live_positions ADD COLUMN IF NOT EXISTS alert text;
ALTER TABLE mob_aq_live_positions ADD COLUMN IF NOT EXISTS alert_action text;
ALTER TABLE mob_aq_live_positions ADD COLUMN IF NOT EXISTS alert_patch jsonb;
ALTER TABLE mob_aq_live_orders ADD COLUMN IF NOT EXISTS plan_patch jsonb;
CREATE TABLE IF NOT EXISTS mob_aq_chart_paper (id bigserial PRIMARY KEY, mint text NOT NULL, symbol text, leg_high_t bigint NOT NULL, entry_px double precision NOT NULL, cost_pct double precision, liq_usd double precision, plan jsonb NOT NULL, half_pct double precision, exit_px double precision, gross_pct double precision, net_pct double precision, outcome text, opened_at timestamptz NOT NULL DEFAULT now(), closed_at timestamptz, UNIQUE (mint, leg_high_t));
CREATE TABLE IF NOT EXISTS mob_aq_sym_coins (mint text PRIMARY KEY, symbol text, name text, gta boolean NOT NULL DEFAULT false, sol boolean, created_at timestamptz, n int NOT NULL DEFAULT 0, buyers int NOT NULL DEFAULT 0, px0 double precision, last double precision, hi double precision, end_reason text, done boolean NOT NULL DEFAULT false, pp boolean NOT NULL DEFAULT false, chain boolean NOT NULL DEFAULT false, lanes jsonb, ctrl_pct double precision, updated_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS aqx_sym_coins_created ON mob_aq_sym_coins (created_at);
CREATE TABLE IF NOT EXISTS mob_aq_sym_trades (id bigserial PRIMARY KEY, mint text NOT NULL, symbol text, lane text NOT NULL, entry_at timestamptz, exit_at timestamptz, entry_px double precision, exit_px double precision, cost_sol double precision, proceeds_sol double precision, net_pct double precision, peak_pct double precision, leg_pct double precision, rt_pct double precision, exit text, half boolean, gta boolean NOT NULL DEFAULT false, at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS mob_aq_sym_missed (mint text PRIMARY KEY, symbol text, reason text NOT NULL, at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS mob_aq_sym_gta (mint text NOT NULL, m bigint NOT NULL, o double precision, h double precision, l double precision, c double precision, n int NOT NULL DEFAULT 0, src text, PRIMARY KEY (mint, m));
CREATE TABLE IF NOT EXISTS mob_aq_sym_stats (k text PRIMARY KEY, v jsonb, at timestamptz NOT NULL DEFAULT now());
