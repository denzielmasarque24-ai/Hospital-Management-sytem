-- Change only the saved currency preference; preserve all other website settings.
update public.website_content
set content = jsonb_set(content, '{currency}', '"PHP"'::jsonb, true),
    updated_at = now()
where content_key = 'settings'
  and content ? 'currency'
  and content->>'currency' = 'USD';
