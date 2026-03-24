# Google Sheet Schema

시트는 아래 3개 탭으로 구성합니다.

## 1. `control_master`

통제 항목 등록 마스터입니다.

- `control_id`: 통제번호, 고유값
- `category`: 관리분류
- `sub_process`: 세부 프로세스
- `risk_name`: 통제 대상 위험
- `control_name`: 통제활동명
- `control_objective`: 통제 목적
- `control_activity`: 핵심 통제 활동
- `key_control`: `Yes` 또는 `No`
- `frequency`: `Annual`, `Event Driven`, `Other`, `Half-Bi-annual`, `Monthly`, `Quarterly`
- `control_type`: `예방`, `적발`
- `automation_level`: `수동`, `반자동`, `자동`
- `perform_dept`: 수행부서
- `review_dept`: 검토부서
- `owner_person`: 담당자
- `target_systems`: `|` 구분 다중값
- `evidence_text`: 감사 증적 설명
- `test_method`: 테스트 방법
- `policy_reference`: 정책/기준서 참조
- `deficiency_impact`: 결함 영향도
- `status`: `정상`, `점검 예정`, `개선 필요`
- `evidence_status`: `미수집`, `수집 중`, `준비 완료`
- `review_checked`: `미검토`, `검토 완료`, `반려`
- `control_description`: 상세 설명
- `active_yn`: `Y`, `N`
- `sort_order`: 화면 정렬용 숫자

## 2. `control_execution`

통제 수행 이력입니다. 한 통제에 여러 수행 이력이 생길 수 있습니다.

- `execution_id`: 수행 이력 ID, 고유값
- `control_id`: `control_master.control_id` 참조
- `execution_date`: 수행일
- `execution_note`: 수행 내역
- `status`: 통제 상태
- `review_checked`: 검토 여부
- `review_date`: 검토일
- `review_note`: 검토 메모
- `performed_by`: 수행부서 또는 수행자
- `reviewed_by`: 검토부서 또는 검토자
- `drive_folder_id`: 증적 저장 드라이브 폴더 ID
- `last_updated_at`: 최종 수정 일시

## 3. `evidence_files`

첨부된 증적 파일 메타데이터입니다.

- `evidence_id`: 증적 ID, 고유값
- `execution_id`: `control_execution.execution_id` 참조
- `control_id`: `control_master.control_id` 참조
- `file_name`: 파일명
- `drive_file_id`: 드라이브 파일 ID
- `drive_url`: 드라이브 파일 URL
- `uploaded_at`: 업로드 일시
- `uploaded_by`: 업로드한 부서/사용자
- `file_note`: 파일 비고
