create table if not exists public.tenant_profiles (
  id text primary key,
  created_by text null,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.admin_users (
  id text primary key,
  created_by text null,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.mikrotiks (
  id text primary key,
  created_by text null,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.wifi_packages (
  id text primary key,
  created_by text null,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.hotspot_users (
  id text primary key,
  created_by text null,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.sessions (
  id text primary key,
  created_by text null,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.payments (
  id text primary key,
  created_by text null,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.payment_intents (
  id text primary key,
  created_by text null,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.vouchers (
  id text primary key,
  created_by text null,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'mikrotiks_created_by_fkey') then
    alter table public.mikrotiks add constraint mikrotiks_created_by_fkey foreign key (created_by) references public.admin_users(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'wifi_packages_created_by_fkey') then
    alter table public.wifi_packages add constraint wifi_packages_created_by_fkey foreign key (created_by) references public.admin_users(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'hotspot_users_created_by_fkey') then
    alter table public.hotspot_users add constraint hotspot_users_created_by_fkey foreign key (created_by) references public.admin_users(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'sessions_created_by_fkey') then
    alter table public.sessions add constraint sessions_created_by_fkey foreign key (created_by) references public.admin_users(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'payments_created_by_fkey') then
    alter table public.payments add constraint payments_created_by_fkey foreign key (created_by) references public.admin_users(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'payment_intents_created_by_fkey') then
    alter table public.payment_intents add constraint payment_intents_created_by_fkey foreign key (created_by) references public.admin_users(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'vouchers_created_by_fkey') then
    alter table public.vouchers add constraint vouchers_created_by_fkey foreign key (created_by) references public.admin_users(id) on delete cascade;
  end if;
end $$;
