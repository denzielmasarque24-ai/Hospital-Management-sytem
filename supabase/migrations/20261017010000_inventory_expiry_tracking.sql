-- Add optional expiry tracking to existing product records without changing data.
alter table public.products
  add column if not exists expiry_date date;

create index if not exists products_expiry_date_idx
  on public.products (expiry_date)
  where expiry_date is not null;
