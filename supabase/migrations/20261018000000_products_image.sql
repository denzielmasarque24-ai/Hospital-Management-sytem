-- Optional product image support for the existing admin and public catalog.
alter table public.products add column if not exists image text;
