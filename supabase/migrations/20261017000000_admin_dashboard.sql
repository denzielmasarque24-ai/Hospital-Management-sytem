-- Admin dashboard data. Apply with `supabase db push` after linking the project.
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sku text not null unique,
  category text not null,
  price numeric(12,2) not null check (price >= 0),
  stock integer not null default 0 check (stock >= 0),
  min_stock integer not null default 0 check (min_stock >= 0),
  status text not null default 'active' check (status in ('active', 'inactive', 'draft')),
  description text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null default '',
  phone text not null default '',
  company text not null default '',
  status text not null default 'active' check (status in ('active', 'inactive')),
  notes text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  customer_name text not null,
  customer_email text not null default '',
  order_date date not null default current_date,
  item_count integer not null default 0,
  total numeric(12,2) not null default 0 check (total >= 0),
  payment_status text not null default 'pending' check (payment_status in ('paid', 'pending', 'failed')),
  status text not null default 'pending' check (status in ('pending', 'processing', 'shipped', 'completed', 'cancelled')),
  created_at timestamptz not null default now()
);

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null unique,
  phone text not null default '',
  status text not null default 'active' check (status in ('active', 'inactive')),
  joined_at date not null default current_date,
  created_at timestamptz not null default now()
);

create table if not exists public.website_content (
  content_key text primary key,
  content jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

create table if not exists public.inventory_adjustments (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  quantity integer not null check (quantity <> 0),
  note text not null default '',
  adjusted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists orders_order_date_idx on public.orders(order_date desc);
create index if not exists products_stock_idx on public.products(stock, min_stock);
create index if not exists inventory_adjustments_product_idx on public.inventory_adjustments(product_id, created_at desc);

create or replace function public.current_admin_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select upper(coalesce(role, '')) from public.profiles where id = auth.uid() limit 1;
$$;

alter table public.products enable row level security;
alter table public.suppliers enable row level security;
alter table public.orders enable row level security;
alter table public.customers enable row level security;
alter table public.website_content enable row level security;
alter table public.inventory_adjustments enable row level security;

drop policy if exists "admin staff manage products" on public.products;
create policy "admin staff manage products" on public.products for all to authenticated
  using (public.current_admin_role() in ('ADMIN', 'SUPER_ADMIN', 'INVENTORY_MANAGER'))
  with check (public.current_admin_role() in ('ADMIN', 'SUPER_ADMIN', 'INVENTORY_MANAGER'));
drop policy if exists "admin staff manage suppliers" on public.suppliers;
create policy "admin staff manage suppliers" on public.suppliers for all to authenticated
  using (public.current_admin_role() in ('ADMIN', 'SUPER_ADMIN', 'INVENTORY_MANAGER'))
  with check (public.current_admin_role() in ('ADMIN', 'SUPER_ADMIN', 'INVENTORY_MANAGER'));
drop policy if exists "sales staff manage orders" on public.orders;
create policy "sales staff manage orders" on public.orders for all to authenticated
  using (public.current_admin_role() in ('ADMIN', 'SUPER_ADMIN', 'SALES_STAFF'))
  with check (public.current_admin_role() in ('ADMIN', 'SUPER_ADMIN', 'SALES_STAFF'));
drop policy if exists "sales staff manage customers" on public.customers;
create policy "sales staff manage customers" on public.customers for all to authenticated
  using (public.current_admin_role() in ('ADMIN', 'SUPER_ADMIN', 'SALES_STAFF'))
  with check (public.current_admin_role() in ('ADMIN', 'SUPER_ADMIN', 'SALES_STAFF'));
drop policy if exists "admins manage website content" on public.website_content;
create policy "admins manage website content" on public.website_content for all to authenticated
  using (public.current_admin_role() in ('ADMIN', 'SUPER_ADMIN'))
  with check (public.current_admin_role() in ('ADMIN', 'SUPER_ADMIN'));
drop policy if exists "inventory staff manage adjustments" on public.inventory_adjustments;
create policy "inventory staff manage adjustments" on public.inventory_adjustments for all to authenticated
  using (public.current_admin_role() in ('ADMIN', 'SUPER_ADMIN', 'INVENTORY_MANAGER'))
  with check (public.current_admin_role() in ('ADMIN', 'SUPER_ADMIN', 'INVENTORY_MANAGER'));

grant select, insert, update, delete on public.products, public.suppliers, public.orders, public.customers, public.website_content, public.inventory_adjustments to authenticated;
grant execute on function public.current_admin_role() to authenticated;
