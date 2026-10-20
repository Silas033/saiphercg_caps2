-- Run this in Supabase SQL Editor. It restricts dashboard access to approved admins.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  is_admin boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

-- There can be exactly one approved dashboard profile.
alter table public.profiles
  add column if not exists account_slot boolean not null default true;
create unique index if not exists profiles_one_admin_account
  on public.profiles (account_slot);
create policy "Users can read their own access profile"
  on public.profiles for select to authenticated using ((select auth.uid()) = id);
-- Create the single administrator only from the SQL Editor or a secure server using service_role.
-- insert into public.profiles (id, email, is_admin)
-- values ('USER_UUID_FROM_AUTH_USERS', 'admin@example.com', true);
