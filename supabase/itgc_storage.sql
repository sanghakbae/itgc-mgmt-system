-- Supabase Storage (S3 compatible object storage) setup for ITGC evidence files

insert into storage.buckets (id, name, public)
values ('itgc_evidence_files', 'itgc_evidence_files', true)
on conflict (id) do nothing;

-- Public read policy (for preview URLs)
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'itgc_evidence_files_public_read'
  ) then
    create policy itgc_evidence_files_public_read
      on storage.objects
      for select
      to public
      using (bucket_id = 'itgc_evidence_files');
  end if;
end
$$;

-- Authenticated upload policy
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'itgc_evidence_files_auth_insert'
  ) then
    create policy itgc_evidence_files_auth_insert
      on storage.objects
      for insert
      to authenticated
      with check (bucket_id = 'itgc_evidence_files');
  end if;
end
$$;

-- Authenticated update/delete policies
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'itgc_evidence_files_auth_update'
  ) then
    create policy itgc_evidence_files_auth_update
      on storage.objects
      for update
      to authenticated
      using (bucket_id = 'itgc_evidence_files')
      with check (bucket_id = 'itgc_evidence_files');
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'itgc_evidence_files_auth_delete'
  ) then
    create policy itgc_evidence_files_auth_delete
      on storage.objects
      for delete
      to authenticated
      using (bucket_id = 'itgc_evidence_files');
  end if;
end
$$;
