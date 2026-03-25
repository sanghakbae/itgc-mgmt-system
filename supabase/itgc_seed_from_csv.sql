-- Generated from templates/*.csv
-- Run after supabase/itgc_schema.sql

-- source: templates/control_master.csv
truncate table public.itgc_control_master cascade;
insert into public.itgc_control_master (control_id, category, sub_process, risk_name, control_name, control_objective, control_activity, key_control, frequency, control_type, automation_level, perform_dept, review_dept, owner_person, target_systems, evidence_text, test_method, policy_reference, deficiency_impact, status, evidence_status, review_checked, control_description, active_yn, sort_order) values
('PWC-01', 'IT정책관리', 'IT정책관리', 'IT 프로세스에 대한 정책 미수립 위험', 'IT 조직 SOD 및 IT 운영 프로세스 정책의 수립 검토 및 공지', 'IT 정책과 운영 프로세스 정책화', '정책 제개정 후 승인 및 공지', 'Yes', 'Annual', '예방', '수동', 'QA유닛', '정보보호유닛', '정보보호유닛', '영림원|판다|BI|관리자콘솔(HR)|관리자콘솔(CK)', 'IT 정책서|승인 증빙|공지 내역', '정책서와 승인 및 공지 이력 대조', 'IT 정책관리 기준 1.1', '높음', '점검 예정', '미수집', '미검토', 'IT 정책과 운영 프로세스 정책 문서의 수립 검토 및 공지 여부를 관리한다.', 'Y', '1');
-- source: templates/control_execution.csv
truncate table public.itgc_control_execution cascade;
insert into public.itgc_control_execution (execution_id, control_id, execution_date, execution_note, status, review_checked, review_date, review_note, performed_by, reviewed_by, drive_folder_id, last_updated_at) values
('EXE-001', 'PWC-01', '2026-03-23', '정책서 최신본 요청 및 공지 이력 확인 예정', '점검 예정', '미검토', null, null, 'QA유닛', '정보보호유닛', '1xq6ecVXXcK4ujxDIiOVGsAyf-abwF9h3', '2026-03-23T09:00:00+09:00');
-- source: templates/evidence_files.csv
truncate table public.itgc_evidence_files cascade;
insert into public.itgc_evidence_files (evidence_id, execution_id, control_id, file_name, drive_file_id, drive_url, uploaded_at, uploaded_by, file_note) values
('EVD-001', 'EXE-001', 'PWC-01', 'it-policy-2026.pdf', null, null, '2026-03-23T09:10:00+09:00', 'QA유닛', '업로드 전 템플릿 행');
