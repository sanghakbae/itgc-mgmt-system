-- ITGC relational schema for Supabase (all table names start with itgc_)

create extension if not exists pgcrypto;

create table if not exists public.itgc_control_master (
  control_id text primary key,
  category text not null,
  sub_process text,
  risk_name text,
  control_name text not null,
  control_objective text,
  control_activity text,
  key_control text,
  frequency text,
  control_type text,
  automation_level text,
  perform_dept text,
  review_dept text,
  owner_person text,
  target_systems text,
  evidence_text text,
  test_method text,
  policy_reference text,
  deficiency_impact text,
  status text,
  evidence_status text,
  review_checked text,
  control_description text,
  active_yn text default 'Y',
  sort_order integer,
  control_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.itgc_control_execution (
  execution_id text primary key,
  control_id text not null references public.itgc_control_master(control_id) on delete cascade,
  execution_date date,
  execution_note text,
  status text,
  review_checked text,
  review_date date,
  review_note text,
  performed_by text,
  reviewed_by text,
  drive_folder_id text,
  last_updated_at timestamptz,
  execution_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.itgc_evidence_files (
  evidence_id text primary key,
  execution_id text references public.itgc_control_execution(execution_id) on delete set null,
  control_id text not null references public.itgc_control_master(control_id) on delete cascade,
  file_name text not null,
  drive_file_id text,
  drive_url text,
  uploaded_at timestamptz,
  uploaded_by text,
  file_note text,
  storage_bucket text default 'itgc_evidence_files',
  storage_path text,
  storage_url text,
  provider text default 'supabase',
  evidence_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.itgc_workflows (
  workflow_id text primary key,
  control_id text references public.itgc_control_master(control_id) on delete cascade,
  step text not null,
  assignee text,
  reviewer text,
  due_date date,
  status text,
  memo text,
  workflow_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.itgc_member_master (
  member_id text primary key,
  member_name text not null,
  email text,
  role text,
  team text,
  unit text,
  access_role text,
  active_yn text default 'Y',
  member_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.itgc_audit_log (
  log_id text primary key,
  action text not null,
  target text,
  detail text,
  actor_name text,
  actor_email text,
  ip text,
  created_at text,
  created_at_ts timestamptz not null default now()
  ,
  audit_payload jsonb
);

create index if not exists itgc_control_execution_control_id_idx
  on public.itgc_control_execution (control_id);

create index if not exists itgc_evidence_files_control_id_idx
  on public.itgc_evidence_files (control_id);

create index if not exists itgc_workflows_control_id_idx
  on public.itgc_workflows (control_id);
