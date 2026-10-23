-- This former seed proposal is superseded by the verified 26-row catalog.
-- Read-only count check only: this file intentionally contains no INSERT,
-- UPDATE, DELETE, schema, policy, or publication statements.
select section, count(*) as service_count
from public.services
where section in ('clinical_departments', 'services_facilities')
group by section
order by section;
