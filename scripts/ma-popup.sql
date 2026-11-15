-- Mysterious Archive welcome pop-up + lead capture. Additive only, idempotent.

-- Store-level setting: the welcome discount percent (Alex sets the exact %).
alter table stores add column if not exists welcome_popup_enabled boolean not null default true;
alter table stores add column if not exists welcome_popup_percent integer not null default 10;

-- Leads from the storefront welcome pop-up (email and/or phone).
create table if not exists marketing_subscribers (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id) on delete cascade,
  email text,
  phone text,
  code text,
  consent boolean not null default true,
  source text not null default 'popup',
  city text,
  region text,
  country text,
  created_at timestamptz not null default now()
);
create index if not exists marketing_subscribers_store_idx on marketing_subscribers (store_id, created_at);
-- One row per email per store, one per phone per store (so a repeated pop-up submit does not duplicate).
create unique index if not exists marketing_subscribers_store_email_idx on marketing_subscribers (store_id, lower(email)) where email is not null;
create unique index if not exists marketing_subscribers_store_phone_idx on marketing_subscribers (store_id, phone) where phone is not null;
