alter table public.profiles
add column if not exists default_currency text not null default 'GBP';

alter table public.transactions
add column if not exists currency text not null default 'GBP';

alter table public.transactions
add column if not exists allocation_goal_id uuid;

alter table public.transactions
add column if not exists allocation_type text;

alter table public.transactions
add column if not exists allocation_amount numeric(12, 2) not null default 0;

create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  target_amount numeric(12, 2) not null check (target_amount > 0),
  current_amount numeric(12, 2) not null default 0 check (current_amount >= 0),
  currency text not null default 'GBP',
  deadline date not null,
  note text not null default '',
  created_at timestamptz not null default now()
);

alter table public.goals enable row level security;

drop policy if exists "goals_select_own" on public.goals;
create policy "goals_select_own"
on public.goals
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "goals_insert_own" on public.goals;
create policy "goals_insert_own"
on public.goals
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "goals_update_own" on public.goals;
create policy "goals_update_own"
on public.goals
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "goals_delete_own" on public.goals;
create policy "goals_delete_own"
on public.goals
for delete
to authenticated
using (auth.uid() = user_id);
