drop policy if exists "anyone can read rooms" on rooms;
drop policy if exists "anyone can insert rooms" on rooms;
drop policy if exists "anyone can update rooms" on rooms;

create policy "authenticated can read rooms" on rooms for select using (auth.uid() is not null);
create policy "authenticated can insert rooms" on rooms for insert with check (auth.uid() is not null);
create policy "authenticated can update rooms" on rooms for update using (auth.uid() is not null) with check (auth.uid() is not null);
