create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid references public.rooms(id) on delete cascade,
  scope text not null,
  profile_id uuid references public.profiles(id) on delete set null,
  author text not null,
  message text not null,
  created_at timestamptz not null default now()
);

create index if not exists chat_messages_room_scope_created_at_idx
  on public.chat_messages (room_id, scope, created_at);

create index if not exists chat_messages_scope_created_at_idx
  on public.chat_messages (scope, created_at);

alter table public.chat_messages enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'chat_messages'
      and policyname = 'Allow read chat messages'
  ) then
    create policy "Allow read chat messages"
      on public.chat_messages
      for select
      to anon, authenticated
      using (true);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'chat_messages'
      and policyname = 'Allow insert chat messages'
  ) then
    create policy "Allow insert chat messages"
      on public.chat_messages
      for insert
      to anon, authenticated
      with check (true);
  end if;
end $$;