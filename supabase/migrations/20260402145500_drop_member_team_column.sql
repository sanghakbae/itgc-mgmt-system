alter table public.itgc_member_master
  drop column if exists team;

alter table public.itgc_control_master
  drop column if exists owner_person;
