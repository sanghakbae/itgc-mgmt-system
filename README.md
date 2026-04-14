# IT 통제(ITGC) 관리 시스템

React + Vite 기반의 ITGC 운영 관리 화면입니다.  
Google OAuth 로그인, PostgreSQL 연동, Google Drive 증적 업로드, 감사 로그, 회원 관리, 수행 리포트 출력을 포함합니다.

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
  - `admin / reviewer / viewer` 권한 관리
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
- PostgreSQL
- Google Drive

## 로컬 실행

```bash
npm install
npm run dev:postgres
```

기본 개발 주소:

- `http://127.0.0.1:5180`
- `http://localhost:5180`

## 환경 변수

`.env.example` 기준으로 아래 값을 설정합니다.

```env
VITE_GOOGLE_CLIENT_ID=YOUR_GOOGLE_CLIENT_ID
VITE_GOOGLE_DRIVE_FOLDER_ID=YOUR_GOOGLE_DRIVE_FOLDER_ID
VITE_GOOGLE_CHAT_WEBHOOK_URL=https://chat.googleapis.com/v1/spaces/...
VITE_GOOGLE_CHAT_ALERT_ACTIONS=EXECUTION_SAVED,REVIEW_COMPLETED
VITE_GOOGLE_CHAT_DEDUP_MS=60000
VITE_DATA_BACKEND=postgres
POSTGRES_HOST=YOUR_POSTGRES_HOST
POSTGRES_PORT=5432
POSTGRES_DB=itgc
POSTGRES_USER=YOUR_POSTGRES_USER
POSTGRES_PASSWORD=YOUR_POSTGRES_PASSWORD
```

설명:

- `VITE_GOOGLE_CLIENT_ID`
  - Google Cloud OAuth 웹 클라이언트 ID
- `VITE_GOOGLE_DRIVE_FOLDER_ID`
  - 증적 업로드 대상 Google Drive 폴더 ID
- `VITE_GOOGLE_CHAT_WEBHOOK_URL`
  - 통제 변경 알림을 받을 Google Chat Incoming Webhook URL (옵션)
- `VITE_GOOGLE_CHAT_ALERT_ACTIONS`
  - 알림 액션 목록 (콤마 구분). 예: `EXECUTION_SAVED,REVIEW_COMPLETED`
- `VITE_GOOGLE_CHAT_DEDUP_MS`
  - 동일 이벤트 중복 알림 방지 시간(ms). 예: `60000`이면 60초 내 중복 전송 차단
- `VITE_DATA_BACKEND`
  - `postgres` 또는 `local` (미설정 시 자동 선택)
- `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`
  - `npm run dev:postgres`에서 사용하는 PostgreSQL 접속 정보

## Google OAuth 설정

현재 로그인 방식은 Google Identity Services JavaScript 버튼 방식입니다.

`승인된 JavaScript 원본`에 아래 주소를 넣어야 합니다.

- 로컬 개발
  - `http://127.0.0.1:5180`
  - `http://localhost:5180`
- GitHub Pages
  - `https://sanghakbae.github.io`
- Amplify
  - 예: `https://main.d3jgpbgqiei104.amplifyapp.com`
- 운영 커스텀 도메인 사용 시
  - `https://itgc.muhayu.com`

주의:

- `승인된 리디렉션 URI`는 현재 방식에서는 보통 필요하지 않습니다.
- origin만 등록해야 하므로 경로는 넣지 않습니다.

## 로컬 Postgres 개발 서버

`npm run dev:postgres`는 Vite와 Postgres API를 단일 서버로 띄웁니다.

- 앱 주소: `http://127.0.0.1:5180`
- API 경로: 동일 origin의 `/api/*`
- DB 상태 확인: `GET /api/db-info`
- 읽기 전용 쿼리 테스트: `POST /api/query-test`

별도 API 주소를 프런트에 주입해야 하는 배포 환경에서만 `VITE_POSTGRES_API_BASE_URL`을 사용합니다.

## 배포

### GitHub Pages

GitHub Actions 워크플로우:

- [.github/workflows/deploy.yml](/Users/shbae-pc/Tools/ITGC/.github/workflows/deploy.yml)

필요한 GitHub Actions Secrets:

- `VITE_GOOGLE_CLIENT_ID`
- `VITE_ALLOWED_DOMAIN`
- `VITE_GOOGLE_CHAT_WEBHOOK_URL` (선택)
- `VITE_GOOGLE_CHAT_ALERT_ACTIONS` (선택)
- `VITE_GOOGLE_CHAT_DEDUP_MS` (선택)
- `VITE_POSTGRES_API_BASE_URL`

`main` 브랜치에 푸시하면 자동 배포됩니다.

주의:

- GitHub Pages 배포는 로컬 `.env`를 읽지 않고 위 GitHub Actions Secrets 값을 사용합니다.

### AWS Amplify

Amplify에서는 `.env` 파일 업로드가 아니라 콘솔 환경 변수로 넣어야 합니다.

등록 위치:

1. Amplify Console
2. `Hosting`
3. `Environment variables`

추가할 값:

- `VITE_GOOGLE_CLIENT_ID`
- `VITE_GOOGLE_DRIVE_FOLDER_ID`
- `VITE_DATA_BACKEND`
- `VITE_POSTGRES_API_BASE_URL`

값 저장 후 새 빌드로 재배포가 필요합니다.

## 스크립트

- `npm run dev`: Vite 개발 서버만 실행
- `npm run dev:postgres`: Vite + Postgres API 단일 서버 실행
- `npm run build`: 프로덕션 빌드
- `npm run preview`: 빌드 결과 미리보기
- `npm run workspace:restore-backup`: 백업 JSON 내용을 PostgreSQL로 복원

## 주요 파일

- [src/App.jsx](/Users/shbae-pc/Tools/ITGC/src/App.jsx): 메인 UI 및 상태 관리
- [src/styles.css](/Users/shbae-pc/Tools/ITGC/src/styles.css): 전역 스타일 및 반응형 레이아웃
- [src/postgresApi.js](/Users/shbae-pc/Tools/ITGC/src/postgresApi.js): PostgreSQL API 통신 및 워크스페이스 직렬화
- [scripts/postgres_api_server.mjs](/Users/shbae-pc/Tools/ITGC/scripts/postgres_api_server.mjs): 로컬 Postgres API 서버
- [scripts/single_server.mjs](/Users/shbae-pc/Tools/ITGC/scripts/single_server.mjs): Vite와 API를 함께 띄우는 단일 개발 서버
- [vite.config.js](/Users/shbae-pc/Tools/ITGC/vite.config.js): GitHub Pages base 경로 설정

## 운영 메모

- 로그인 회원과 감사 로그는 앱 상태뿐 아니라 PostgreSQL에도 저장되도록 설계되어 있습니다.
- 실제 IP는 현재 구조상 신뢰성 있게 수집되지 않아 감사 로그에는 기본값 `-`로 기록됩니다.
- Postgres API 서버를 최신으로 재배포하지 않으면 회원 정보 / 감사 로그 / 통제 변경 이력이 DB에 저장되지 않을 수 있습니다.
