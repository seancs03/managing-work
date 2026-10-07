create table if not exists public.workout_profiles (
  profile_id text primary key check (profile_id in ('sean', 'kick')),
  state jsonb not null default '{"workouts":[],"selectedWorkoutId":null,"selectedWeek":1}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.workout_sync_members (
  user_id uuid primary key references auth.users (id) on delete cascade
);

alter table public.workout_profiles enable row level security;
alter table public.workout_sync_members enable row level security;

drop policy if exists "Members can read workout profiles" on public.workout_profiles;
create policy "Members can read workout profiles"
  on public.workout_profiles for select to authenticated
  using (
    exists (
      select 1 from public.workout_sync_members
      where user_id = (select auth.uid())
    )
  );

drop policy if exists "Members can create workout profiles" on public.workout_profiles;
create policy "Members can create workout profiles"
  on public.workout_profiles for insert to authenticated
  with check (
    exists (
      select 1 from public.workout_sync_members
      where user_id = (select auth.uid())
    )
  );

drop policy if exists "Members can update workout profiles" on public.workout_profiles;
create policy "Members can update workout profiles"
  on public.workout_profiles for update to authenticated
  using (
    exists (
      select 1 from public.workout_sync_members
      where user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.workout_sync_members
      where user_id = (select auth.uid())
    )
  );

drop policy if exists "Members can delete workout profiles" on public.workout_profiles;
create policy "Members can delete workout profiles"
  on public.workout_profiles for delete to authenticated
  using (
    exists (
      select 1 from public.workout_sync_members
      where user_id = (select auth.uid())
    )
  );

drop policy if exists "Members can read their own membership" on public.workout_sync_members;
create policy "Members can read their own membership"
  on public.workout_sync_members for select to authenticated
  using (user_id = (select auth.uid()));

grant select, insert, update, delete on public.workout_profiles to authenticated;
grant select on public.workout_sync_members to authenticated;
revoke all on public.workout_profiles, public.workout_sync_members from anon;

create or replace function public.update_workout_profile_timestamp()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists update_workout_profile_timestamp on public.workout_profiles;
create trigger update_workout_profile_timestamp
  before update on public.workout_profiles
  for each row execute function public.update_workout_profile_timestamp();

alter publication supabase_realtime add table public.workout_profiles;
