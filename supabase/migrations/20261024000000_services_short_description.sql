-- Add a dedicated short blurb without changing the existing full description.
alter table public.services
  add column if not exists short_description text not null default '';

-- Existing public cards showed the description column. Give those rows a usable
-- short blurb while preserving their full description value.
update public.services
set short_description = left(description, 240)
where short_description = '' and description <> '';
