-- Minha Rotina: rode este arquivo uma vez no Supabase (SQL Editor → New query → Run).

create table if not exists public.tasks (
  id          text primary key,
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  data        jsonb not null,
  updated_at  timestamptz not null default now()
);
create index if not exists tasks_user_idx on public.tasks (user_id);

create table if not exists public.settings (
  user_id     uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  data        jsonb not null,
  updated_at  timestamptz not null default now()
);

-- O app acessa as tabelas como usuário logado.
grant select, insert, update, delete on public.tasks, public.settings to authenticated;

-- Cada pessoa só lê e escreve os próprios dados.
alter table public.tasks    enable row level security;
alter table public.settings enable row level security;

drop policy if exists "tasks: dono" on public.tasks;
create policy "tasks: dono" on public.tasks
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "settings: dono" on public.settings;
create policy "settings: dono" on public.settings
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Atualização em tempo real entre dispositivos (e quando o Claude revisa).
alter publication supabase_realtime add table public.tasks, public.settings;
