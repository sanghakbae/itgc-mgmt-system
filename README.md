# IT 통제(ITGC) 관리 시스템

React + Vite 기반의 ITGC 운영 관리 화면입니다.  
Google OAuth 로그인, Google Sheets / Drive 연동, 감사 로그, 회원 관리, 수행 리포트 출력까지 포함합니다.

## 주요 기능

- Google OAuth 로그인
  - `muhayu.com` 도메인 계정만 허용
- 대시보드
  - 주기별 / 통제별 / 카테고리별 진행 현황
  - 수행 유닛, 지연 필터
- 통제 목록
  - 통제 상세 조회
  - 관련 시스템, 테스트 방법, 증적, 모집단 확인
- 통제 운영
  - 수행 내역 등록
  - 증적 파일 첨부 / 삭제 / 미리보기
  - 검토 완료 처리
- 통제 등록/수정
  - 통제 신규 등록 및 기존 통제 수정
- 회원 관리
  - 로그인한 회원 목록 관리
  - `admin / editor / viewer` 권한 관리
- 감사 로그
  - 로그인/로그아웃
  - 회원 가입
  - 권한 변경
  - 통제 등록/수정
  - 통제 운영 저장 / 검토 완료
- 리포트
  - 월 / 분기 / 반기 / 연 기준 출력
  - HTML / PDF 미리보기 및 인쇄

## 기술 스택

- React 19
- Vite 7
- Google Identity Services
- Google Apps Script
- Google Sheets
- Google Drive

## 로컬 실행

```bash
npm install
npm run dev
```

기본 개발 주소:

- `http://127.0.0.1:5173`
- `http://localhost:5173`

## 환경 변수

`.env.example` 기준으로 아래 값을 설정합니다.

```env
VITE_GOOGLE_CLIENT_ID=YOUR_GOOGLE_CLIENT_ID
VITE_GOOGLE_SCRIPT_URL=https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec
VITE_GOOGLE_CHAT_WEBHOOK_URL=https://chat.googleapis.com/v1/spaces/...
VITE_GOOGLE_CHAT_ALERT_ACTIONS=EXECUTION_SAVED,REVIEW_COMPLETED
VITE_GOOGLE_CHAT_DEDUP_MS=60000

# optional: supabase backend
VITE_DATA_BACKEND=supabase
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
```

설명:

- `VITE_GOOGLE_CLIENT_ID`
  - Google Cloud OAuth 웹 클라이언트 ID
- `VITE_GOOGLE_SCRIPT_URL`
  - Apps Script 웹앱 `/exec` 주소
- `VITE_GOOGLE_CHAT_WEBHOOK_URL`
  - 통제 변경 알림을 받을 Google Chat Incoming Webhook URL (옵션)
- `VITE_GOOGLE_CHAT_ALERT_ACTIONS`
  - 알림 액션 목록 (콤마 구분). 예: `EXECUTION_SAVED,REVIEW_COMPLETED`
- `VITE_GOOGLE_CHAT_DEDUP_MS`
  - 동일 이벤트 중복 알림 방지 시간(ms). 예: `60000`이면 60초 내 중복 전송 차단
- `VITE_DATA_BACKEND`
  - `supabase` 또는 `google` (미설정 시 자동 선택)
- `VITE_SUPABASE_URL`
  - Supabase 프로젝트 URL
- `VITE_SUPABASE_ANON_KEY`
  - Supabase anon public key

## Supabase 마이그레이션

Supabase 리소스는 모두 `itgc_` 접두사로 생성합니다.

### 1. 테이블 생성

`Supabase SQL Editor`에서 아래 파일 순서대로 실행합니다.

- [supabase/itgc_schema.sql](/Users/shbae-pc/Tools/ITGC/supabase/itgc_schema.sql)
- [supabase/itgc_storage.sql](/Users/shbae-pc/Tools/ITGC/supabase/itgc_storage.sql)

주요 리소스:

- 테이블: `itgc_control_master`, `itgc_control_execution`, `itgc_evidence_files`, `itgc_member_master`, `itgc_audit_log`, `itgc_workspace_state`
- Storage bucket: `itgc_evidence_files`

### 2. 기존 스프레드시트 CSV를 SQL로 변환

기존 Google 스프레드시트에서 아래 탭을 CSV로 내보내 `templates/` 파일을 덮어쓴 뒤 실행합니다.

- `control_master` -> `templates/control_master.csv`
- `control_execution` -> `templates/control_execution.csv`
- `evidence_files` -> `templates/evidence_files.csv`

그다음 시드 SQL을 생성합니다.

```bash
npm run supabase:seed-sql
```

생성 파일:

- [supabase/itgc_seed_from_csv.sql](/Users/shbae-pc/Tools/ITGC/supabase/itgc_seed_from_csv.sql)

이 파일을 `Supabase SQL Editor`에서 실행하면 기존 CSV 데이터가 `itgc_` 테이블로 적재됩니다.

참고:

- `npm run supabase:seed-xlsx`는 로컬 `ITGC_3 ver.xlsx`를 읽어 SQL 생성 시도를 합니다.
- 해당 엑셀에 `control_master/control_execution/evidence_files` 시트가 없으면 자동 스킵됩니다.

## Google OAuth 설정

현재 로그인 방식은 Google Identity Services JavaScript 버튼 방식입니다.

`승인된 JavaScript 원본`에 아래 주소를 넣어야 합니다.

- 로컬 개발
  - `http://127.0.0.1:5173`
  - `http://localhost:5173`
- GitHub Pages
  - `https://sanghakbae.github.io`
- Amplify
  - 예: `https://main.d3jgpbgqiei104.amplifyapp.com`
- 운영 커스텀 도메인 사용 시
  - 예: `https://itgc.muhayu.com`

주의:

- `승인된 리디렉션 URI`는 현재 방식에서는 보통 필요하지 않습니다.
- origin만 등록해야 하므로 경로는 넣지 않습니다.

## Apps Script 연동

프런트 배포와 Apps Script 배포는 별개입니다.  
프런트만 배포해도 스프레드시트 구조는 자동 갱신되지 않습니다.

### Apps Script 반영 순서

1. [google-apps-script/Code.gs](/Users/shbae-pc/Tools/ITGC/google-apps-script/Code.gs) 내용을 Apps Script 편집기에 붙여넣기
2. 웹 앱으로 다시 배포
3. 새 `/exec` URL을 `VITE_GOOGLE_SCRIPT_URL`에 반영

### 사용 시트

- `control_master`
- `control_execution`
- `evidence_files`
- `audit_log`
- `member_master`

### Apps Script health check

배포 후 아래 주소가 정상 JSON을 반환해야 합니다.

- `VITE_GOOGLE_SCRIPT_URL?action=getWorkspace`
- `VITE_GOOGLE_SCRIPT_URL?action=healthCheck`

정상 예시:

```json
{"ok":true,"spreadsheet":true,"drive":true}
```

## 배포

### GitHub Pages

GitHub Actions 워크플로우:

- [.github/workflows/deploy.yml](/Users/shbae-pc/Tools/ITGC/.github/workflows/deploy.yml)

필요한 GitHub Actions Secrets:

- `VITE_GOOGLE_CLIENT_ID`
- `VITE_GOOGLE_SCRIPT_URL`

`main` 브랜치에 푸시하면 자동 배포됩니다.

### AWS Amplify

Amplify에서는 `.env` 파일 업로드가 아니라 콘솔 환경 변수로 넣어야 합니다.

등록 위치:

1. Amplify Console
2. `Hosting`
3. `Environment variables`

추가할 값:

- `VITE_GOOGLE_CLIENT_ID`
- `VITE_GOOGLE_SCRIPT_URL`

값 저장 후 재배포가 필요합니다.

## 스크립트

- `npm run dev`: 개발 서버 실행
- `npm run build`: 프로덕션 빌드
- `npm run preview`: 빌드 결과 미리보기

## 주요 파일

- [src/App.jsx](/Users/shbae-pc/Tools/ITGC/src/App.jsx): 메인 UI 및 상태 관리
- [src/styles.css](/Users/shbae-pc/Tools/ITGC/src/styles.css): 전역 스타일 및 반응형 레이아웃
- [src/googleSheetApi.js](/Users/shbae-pc/Tools/ITGC/src/googleSheetApi.js): Apps Script 통신
- [google-apps-script/Code.gs](/Users/shbae-pc/Tools/ITGC/google-apps-script/Code.gs): Google Sheets / Drive 연동 스크립트
- [vite.config.js](/Users/shbae-pc/Tools/ITGC/vite.config.js): GitHub Pages base 경로 설정

## 운영 메모

- 로그인 회원과 감사 로그는 앱 상태뿐 아니라 스프레드시트에도 저장되도록 설계되어 있습니다.
- 실제 IP는 현재 구조상 신뢰성 있게 수집되지 않아 감사 로그에는 기본값 `-`로 기록됩니다.
- Apps Script를 최신으로 재배포하지 않으면 회원 정보 / 감사 로그 / 통제 변경 이력이 시트에 저장되지 않을 수 있습니다.
