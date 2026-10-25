-- Mysterious Archive: accounts, offers and messages. Additive only.
create table if not exists ma_login_codes (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null,
  email text not null,
  code_hash text not null,
  attempts integer not null default 0,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists ma_login_codes_email_idx on ma_login_codes (store_id, email, created_at);
create table if not exists ma_sessions (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null,
  email text not null,
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create table if not exists ma_offers (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null,
  product_id uuid not null,
  variant_id uuid not null,
  email text not null,
  name text,
  list_cents integer not null,
  amount_cents integer not null,
  status text not null default 'pending',
  discount_code text,
  expires_at timestamptz,
  accepted_at timestamptz,
  owner_unread boolean not null default true,
  customer_unread boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ma_offers_store_status_idx on ma_offers (store_id, status, updated_at);
create index if not exists ma_offers_email_idx on ma_offers (store_id, email);
create unique index if not exists ma_offers_code_idx on ma_offers (discount_code) where discount_code is not null;
create table if not exists ma_messages (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references ma_offers(id) on delete cascade,
  sender text not null,
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists ma_messages_offer_idx on ma_messages (offer_id, created_at);
alter table ma_offers add column if not exists counter_cents integer;
create table if not exists ma_owner_codes (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null,
  code_hash text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists ma_owner_sessions (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null,
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create table if not exists ma_owner_attempts (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null,
  ip text not null,
  ok boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists ma_owner_attempts_idx on ma_owner_attempts (store_id, created_at);
alter table ma_offers add column if not exists customer_typing_at timestamptz;
