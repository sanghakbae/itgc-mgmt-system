with canonical_map as (
  select
    exec.execution_id as old_execution_id,
    concat(exec.control_id, '::', exec.execution_year, '::', exec.execution_period) as new_execution_id
  from public.itgc_control_execution exec
  where exec.execution_id like 'EXE-%'
    and nullif(exec.control_id, '') is not null
    and nullif(exec.execution_year, '') is not null
    and nullif(exec.execution_period, '') is not null
    and not exists (
      select 1
      from public.itgc_control_execution dup
      where dup.execution_id = concat(exec.control_id, '::', exec.execution_year, '::', exec.execution_period)
        and dup.ctid <> exec.ctid
    )
)
update public.itgc_evidence_files ev
set execution_id = canonical_map.new_execution_id
from canonical_map
where ev.execution_id = canonical_map.old_execution_id;

with canonical_map as (
  select
    exec.execution_id as old_execution_id,
    concat(exec.control_id, '::', exec.execution_year, '::', exec.execution_period) as new_execution_id
  from public.itgc_control_execution exec
  where exec.execution_id like 'EXE-%'
    and nullif(exec.control_id, '') is not null
    and nullif(exec.execution_year, '') is not null
    and nullif(exec.execution_period, '') is not null
    and not exists (
      select 1
      from public.itgc_control_execution dup
      where dup.execution_id = concat(exec.control_id, '::', exec.execution_year, '::', exec.execution_period)
        and dup.ctid <> exec.ctid
    )
)
update public.itgc_control_execution exec
set execution_id = canonical_map.new_execution_id
from canonical_map
where exec.execution_id = canonical_map.old_execution_id;
