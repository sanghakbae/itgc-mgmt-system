# ITGC 관리 시스템 사용자 매뉴얼

## 1. 목적
이 문서는 IT 통제(ITGC) 관리 시스템을 실제 운영할 때 필요한 사용 절차를 설명합니다.

## 2. 접속 및 로그인
1. 시스템 URL에 접속합니다.
2. Google 로그인 버튼을 클릭합니다.
3. 테스트 앱 경고가 나오면 `고급` → `...으로 이동`을 선택합니다.
4. 권한 요청을 허용합니다.

주의:
- 허용 도메인 외 계정은 로그인할 수 없습니다.
- Google OAuth 앱이 `Testing` 상태면 `테스트 사용자`로 등록된 계정만 로그인할 수 있습니다.

## 3. 권한 체계
권한은 `viewer`, `reviewer`, `admin` 3단계입니다.

1. `viewer`
- 조회 중심

2. `reviewer`
- 통제 수행/검토 가능

3. `admin`
- 통제 등록/수정, 회원 관리, 권한 변경 가능

## 4. 화면별 사용법
### 4.1 대시보드
1. 주기/카테고리/통제별 진행현황을 확인합니다.
2. 유닛/지연 필터로 필요한 대상만 확인합니다.

### 4.2 통제 목록
1. 통제 항목을 검색/필터링합니다.
2. 항목 선택 후 상세 설명과 상태를 확인합니다.

### 4.3 통제 운영(수행/검토)
1. `수행 내역`에 메모를 입력합니다.
2. 필요 시 증적 파일을 첨부합니다.
3. `수행 내역 저장` 클릭
4. 검토자가 검토 결과(양호/반려)를 저장합니다.

### 4.4 회원 관리
1. admin이 회원 유닛/권한을 수정합니다.
2. 회원 삭제 시 해당 계정은 자동 재등록되지 않습니다.
3. 삭제 계정 재활성화는 admin이 회원 저장/등록으로 다시 승인합니다.

## 5. 증적 파일 업로드(Google Drive)
### 5.1 정상 흐름
1. 파일 첨부 후 저장
2. Google 권한 창이 뜨면 허용
3. 업로드 성공 시 통제 항목에 파일 링크가 저장됨

### 5.2 인증 팝업이 반복될 때
- 현재 세션에서 토큰 캐시를 사용하므로 보통 반복되지 않습니다.
- 아래 경우 다시 뜰 수 있습니다.
1. 브라우저 재시작
2. 토큰 만료(일반적으로 약 1시간 전후)
3. Google 계정 변경/권한 변경

## 6. 장애 대응(자주 발생하는 에러)
업로드 실패 시 팝업에 `[debug] ...` 메시지가 표시됩니다.

1. `google_oauth_not_ready`
- 페이지 새로고침 후 재시도

2. `access_denied`
- OAuth 동의 화면 `테스트 사용자`에 계정 추가

3. `accessNotConfigured`
- Google Cloud에서 `Google Drive API` 활성화

4. `insufficientFilePermissions` 또는 `File not found`
- 대상 Drive 폴더 권한(편집자) 및 폴더 ID 확인

5. `google_drive_not_configured`
- `.env`의 `VITE_GOOGLE_CLIENT_ID`, `VITE_GOOGLE_DRIVE_FOLDER_ID` 확인

6. `postgres_backend_failed:*`
- Postgres API 서버가 실행 중인지 확인
- `npm run dev:postgres` 사용 시 `POSTGRES_PASSWORD`가 설정되어 있는지 확인

## 7. 운영 체크리스트
매일/배포 후 아래를 점검합니다.

1. 로그인 정상 여부
2. 통제 수행 저장 정상 여부
3. 증적 업로드 정상 여부
4. 검토 완료 반영 여부
5. 회원 권한 변경 반영 여부
6. 감사 로그 누락 여부

## 8. 초기 설정 체크리스트(관리자용)
1. Google OAuth 클라이언트 생성
2. `Authorized JavaScript origins` 등록
   - `https://itgc.muhayu.com`
3. OAuth 동의 화면 테스트 사용자 등록
4. Google Drive API 활성화
5. 업로드 대상 폴더 생성 및 계정 권한 부여
6. `.env`에 아래 설정

```env
VITE_GOOGLE_CLIENT_ID=...
VITE_GOOGLE_DRIVE_FOLDER_ID=...
VITE_DATA_BACKEND=postgres
POSTGRES_HOST=...
POSTGRES_PORT=5432
POSTGRES_DB=itgc
POSTGRES_USER=...
POSTGRES_PASSWORD=...
```

## 9. 문의 시 전달 정보
문제 발생 시 아래를 함께 전달하면 원인 파악이 빠릅니다.

1. 발생 시각
2. 로그인 계정 이메일
3. 수행한 메뉴/동작
4. 팝업 에러 문구 전체
5. `[debug] ...` 한 줄
