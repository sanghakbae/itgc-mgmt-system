-- ITGC hardening migration
-- 1) separate app config from member table
-- 2) deduplicate member email rows and enforce uniqueness
-- 3) add supporting indexes
--
-- NOTE:
-- This project currently reads/writes Supabase directly from the browser with a publishable key.
-- Safe RLS enforcement requires either:
-- - moving writes behind a trusted server/edge function, or
-- - adopting Supabase Auth and writing policies around authenticated users.
-- Because that auth migration is not yet in this repo, this migration does not enable RLS.

create table if not exists public.itgc_app_config (
  config_key text primary key,
  config_value jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.itgc_app_config (config_key, config_value)
select
  'login_domains',
  jsonb_build_object(
    'loginDomains',
    coalesce(member_payload -> 'loginDomains', member_payload -> 'domains', '[]'::jsonb)
  )
from public.itgc_member_master
where member_id = 'CFG-LOGIN-DOMAINS'
on conflict (config_key) do update
set
  config_value = excluded.config_value,
  updated_at = now();

with ranked_members as (
  select
    member_id,
    row_number() over (
      partition by lower(trim(email))
      order by updated_at desc nulls last, created_at desc nulls last, member_id desc
    ) as row_num
  from public.itgc_member_master
  where coalesce(trim(email), '') <> ''
    and member_id <> 'CFG-LOGIN-DOMAINS'
)
delete from public.itgc_member_master members
using ranked_members ranked
where members.member_id = ranked.member_id
  and ranked.row_num > 1;

delete from public.itgc_member_master
where member_id = 'CFG-LOGIN-DOMAINS';

create unique index if not exists itgc_member_master_email_unique_idx
  on public.itgc_member_master (lower(trim(email)))
  where coalesce(trim(email), '') <> '';

create index if not exists itgc_control_master_category_idx
  on public.itgc_control_master (category);

create index if not exists itgc_control_master_review_dept_idx
  on public.itgc_control_master (review_dept);

create index if not exists itgc_control_master_perform_dept_idx
  on public.itgc_control_master (perform_dept);

create index if not exists itgc_audit_log_created_at_ts_idx
  on public.itgc_audit_log (created_at_ts desc);

create index if not exists itgc_control_execution_last_updated_at_idx
  on public.itgc_control_execution (last_updated_at desc);
