alter table public.itgc_control_execution
  add column if not exists execution_year text,
  add column if not exists execution_period text,
  add column if not exists test_method_snapshot text,
  add column if not exists population_snapshot text,
  add column if not exists evidence_text_snapshot text,
  add column if not exists evidence_status text,
  add column if not exists execution_submitted boolean default false,
  add column if not exists review_requested boolean default false,
  add column if not exists review_result text,
  add column if not exists performed_by_name text,
  add column if not exists performed_by_email text,
  add column if not exists performed_by_unit text,
  add column if not exists reviewed_by_name text,
  add column if not exists reviewed_by_email text,
  add column if not exists reviewed_by_unit text;

update public.itgc_control_execution exec
set
  execution_year = coalesce(nullif(exec.execution_year, ''), nullif(exec.execution_payload ->> 'executionYear', '')),
  execution_period = coalesce(nullif(exec.execution_period, ''), nullif(exec.execution_payload ->> 'executionPeriod', '')),
  test_method_snapshot = coalesce(
    nullif(exec.test_method_snapshot, ''),
    nullif(exec.execution_payload ->> 'testMethodSnapshot', ''),
    nullif(master.test_method, '')
  ),
  population_snapshot = coalesce(
    nullif(exec.population_snapshot, ''),
    nullif(exec.execution_payload ->> 'populationSnapshot', ''),
    nullif(master.control_payload ->> 'population', ''),
    nullif(master.control_description, '')
  ),
  evidence_text_snapshot = coalesce(
    nullif(exec.evidence_text_snapshot, ''),
    nullif(exec.execution_payload ->> 'evidenceTextSnapshot', ''),
    nullif(master.evidence_text, ''),
    nullif(master.control_payload ->> 'evidenceText', '')
  ),
  evidence_status = coalesce(
    nullif(exec.evidence_status, ''),
    nullif(exec.execution_payload ->> 'evidenceStatus', ''),
    nullif(master.evidence_status, ''),
    '미수집'
  ),
  execution_submitted = coalesce(
    exec.execution_submitted,
    case
      when exec.execution_payload ? 'executionSubmitted'
        then (exec.execution_payload ->> 'executionSubmitted')::boolean
      else null
    end,
    false
  ),
  review_requested = coalesce(
    exec.review_requested,
    case
      when exec.execution_payload ? 'reviewRequested'
        then (exec.execution_payload ->> 'reviewRequested')::boolean
      else null
    end,
    false
  ),
  review_result = coalesce(
    nullif(exec.review_result, ''),
    nullif(exec.execution_payload ->> 'reviewResult', '')
  ),
  performed_by_name = coalesce(
    nullif(exec.performed_by_name, ''),
    nullif(exec.execution_payload ->> 'executionAuthorName', '')
  ),
  performed_by_email = coalesce(
    nullif(exec.performed_by_email, ''),
    nullif(exec.execution_payload ->> 'executionAuthorEmail', '')
  ),
  performed_by_unit = coalesce(
    nullif(exec.performed_by_unit, ''),
    nullif(exec.execution_payload ->> 'executionAuthorUnit', ''),
    nullif(exec.performed_by, ''),
    nullif(master.perform_dept, '')
  ),
  reviewed_by_name = coalesce(
    nullif(exec.reviewed_by_name, ''),
    nullif(exec.execution_payload ->> 'reviewAuthorName', '')
  ),
  reviewed_by_email = coalesce(
    nullif(exec.reviewed_by_email, ''),
    nullif(exec.execution_payload ->> 'reviewAuthorEmail', '')
  ),
  reviewed_by_unit = coalesce(
    nullif(exec.reviewed_by_unit, ''),
    nullif(exec.execution_payload ->> 'reviewAuthorUnit', ''),
    nullif(exec.reviewed_by, ''),
    nullif(master.review_dept, '')
  )
from public.itgc_control_master master
where master.control_id = exec.control_id;

create index if not exists itgc_control_execution_execution_year_idx
  on public.itgc_control_execution (execution_year);

create index if not exists itgc_control_execution_execution_period_idx
  on public.itgc_control_execution (execution_period);

create index if not exists itgc_control_execution_review_checked_idx
  on public.itgc_control_execution (review_checked);
