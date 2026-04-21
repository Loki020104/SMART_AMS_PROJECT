-- Run this in Supabase SQL editor before using the API

create table if not exists users (
  id            uuid primary key default gen_random_uuid(),
  role          text not null check (role in ('student', 'faculty')),
  full_name     text not null,
  username      text not null unique,
  email         text not null unique,
  password_hash text not null,
  department    text not null,
  program       text not null,
  section       text,
  roll_no       text,
  employee_id   text,
  designation   text,
  subjects      text,
  semester      text,
  created_at    timestamptz default now()
);

-- Indexes for fast filter-based deletes and lookups
create index if not exists idx_users_department on users(department);
create index if not exists idx_users_role       on users(role);
create index if not exists idx_users_username   on users(username);

-- Optional: disable RLS for bulk ops using service role key
-- (service role key bypasses RLS by default — no extra config needed)
