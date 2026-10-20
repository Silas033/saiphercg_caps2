-- Run once in Supabase SQL Editor for projects that already ran schema.sql.
-- It succeeds only when there is at most one existing profile.
alter table public.profiles
  add column if not exists account_slot boolean not null default true;

create unique index if not exists profiles_one_admin_account
  on public.profiles (account_slot);
