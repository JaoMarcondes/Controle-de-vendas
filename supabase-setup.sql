-- verde. Dashboard de vendas
-- Execute este arquivo no SQL Editor do Supabase.

create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client text not null,
  project text not null,
  sale_date date not null default current_date,
  status text not null default 'Fechada' check (status in ('Fechada','Pendente')),
  value numeric(12,2) not null default 0 check (value >= 0),
  created_at timestamptz not null default now()
);

create index if not exists sales_user_id_idx on public.sales(user_id);
create index if not exists sales_user_date_idx on public.sales(user_id, sale_date desc);

alter table public.sales enable row level security;

drop policy if exists "sales_select_own" on public.sales;
drop policy if exists "sales_insert_own" on public.sales;
drop policy if exists "sales_update_own" on public.sales;
drop policy if exists "sales_delete_own" on public.sales;

create policy "sales_select_own"
on public.sales for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "sales_insert_own"
on public.sales for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "sales_update_own"
on public.sales for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "sales_delete_own"
on public.sales for delete
to authenticated
using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.sales to authenticated;
