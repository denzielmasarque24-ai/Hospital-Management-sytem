-- Additive only: existing product records and values are left untouched.
alter table public.products add column if not exists image_url text;
