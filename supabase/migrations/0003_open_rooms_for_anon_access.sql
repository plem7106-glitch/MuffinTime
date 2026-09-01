-- Auth (magic-link login) was removed in favor of a localStorage-based player
-- identity with no accounts at all -- auth.uid() is now always null, so the
-- 0002 policies would block every request. Revert to open access, matching
-- 0001's original intent: anyone holding the anon key (i.e. anyone with the
-- app open) can read/write rooms, gated only by knowing the room code.

drop policy if exists "authenticated can read rooms" on rooms;
drop policy if exists "authenticated can insert rooms" on rooms;
drop policy if exists "authenticated can update rooms" on rooms;

create policy "anyone can read rooms" on rooms for select using (true);
create policy "anyone can insert rooms" on rooms for insert with check (true);
create policy "anyone can update rooms" on rooms for update using (true) with check (true);
