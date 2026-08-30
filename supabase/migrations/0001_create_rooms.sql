create table if not exists rooms (
  code text primary key,
  state jsonb not null,
  version integer not null default 0,
  created_at timestamptz not null default now()
);

alter table rooms enable row level security;

-- Permissive by design: no Supabase Auth, no accounts. Anyone holding a room
-- code can read/write that room's row, matching the "trusted friends" trade-off
-- from docs/superpowers/specs/2026-08-31-muffin-time-web-design.md.
drop policy if exists "anyone can read rooms" on rooms;
create policy "anyone can read rooms"
  on rooms for select
  using (true);

drop policy if exists "anyone can insert rooms" on rooms;
create policy "anyone can insert rooms"
  on rooms for insert
  with check (true);

drop policy if exists "anyone can update rooms" on rooms;
create policy "anyone can update rooms"
  on rooms for update
  using (true)
  with check (true);

do $$
begin
  alter publication supabase_realtime add table rooms;
exception
  when duplicate_object then null;
end $$;
