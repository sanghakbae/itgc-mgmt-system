# IT 통제(ITGC) 관리 시스템

React + Vite 기반의 ITGC 운영 관리 화면입니다.  
Google OAuth 로그인, PostgreSQL 연동, S3/로컬 증적 업로드, 감사 로그, 회원 관리, 수행 리포트 출력을 포함합니다.

## 주요 기능

- Google OAuth 로그인
  - `gmail.com` 도메인 계정만 허용
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
- Firebase Google OAuth
- Firebase Authentication
- Cloud Firestore
- Cloudflare R2

## 로컬 실행

```bash
npm install
npm run dev:firebase
```

기본 개발 주소:

- `http://127.0.0.1:5180`
- `http://localhost:5180`

## 환경 변수

`.env.example` 기준으로 아래 값을 설정합니다.

```env
VITE_ALLOWED_DOMAIN=gmail.com
VITE_GOOGLE_CHAT_WEBHOOK_URL=https://chat.googleapis.com/v1/spaces/...
VITE_GOOGLE_CHAT_ALERT_ACTIONS=EXECUTION_SAVED,REVIEW_COMPLETED
VITE_GOOGLE_CHAT_DEDUP_MS=60000
VITE_DATA_BACKEND=firebase
VITE_FIREBASE_API_KEY=YOUR_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN=YOUR_PROJECT.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=YOUR_PROJECT_ID
VITE_FIREBASE_STORAGE_BUCKET=YOUR_PROJECT.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=YOUR_SENDER_ID
VITE_FIREBASE_APP_ID=YOUR_APP_ID
VITE_FIREBASE_COLLECTION_PREFIX=itgc
VITE_EVIDENCE_STORAGE_PROVIDER=r2
STORAGE_PROVIDER=r2
S3_REGION=auto
S3_BUCKET=itgc
R2_ACCOUNT_ID=YOUR_CLOUDFLARE_ACCOUNT_ID
AWS_ACCESS_KEY_ID=YOUR_R2_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY=YOUR_R2_SECRET_ACCESS_KEY
S3_PRESIGNED_URL_TTL_SECONDS=3600
POSTGRES_HOST=YOUR_POSTGRES_HOST
POSTGRES_PORT=5432
POSTGRES_DB=itgc
POSTGRES_USER=YOUR_POSTGRES_USER
POSTGRES_PASSWORD=YOUR_POSTGRES_PASSWORD
LOCAL_EVIDENCE_DIR=uploads/evidence
QUERY_TEST_TIMEOUT_MS=15000
VITE_DB_INFO_TIMEOUT_MS=3000
VITE_QUERY_TEST_TIMEOUT_MS=20000
```

설명:

- `VITE_DATA_BACKEND`
  - `firebase`, `postgres`, `local` 중 하나입니다. 기본 운영 구성은 `firebase`입니다.
- `VITE_FIREBASE_*`
  - Firebase 웹 앱 설정값입니다. Google OAuth는 Firebase Authentication에서 Google provider를 활성화해 사용합니다.
- `VITE_FIREBASE_COLLECTION_PREFIX`
  - Firestore 컬렉션 prefix입니다. 기본값은 `itgc`이며 예: `itgc_itgc_control_master`.
- `VITE_EVIDENCE_STORAGE_PROVIDER`
  - 증적 파일 저장소입니다. Cloudflare R2 사용 시 `r2`로 설정합니다.
- `STORAGE_PROVIDER`
  - 서버 API의 파일 저장소입니다. `r2`, `s3`, `local`을 지원합니다.
- `R2_ACCOUNT_ID`, `S3_BUCKET`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`
  - Cloudflare R2 S3-compatible API 업로드/삭제/서명 URL 발급에 사용합니다.
- `S3_REGION`
  - R2는 `auto`를 사용합니다.
- `VITE_GOOGLE_CHAT_WEBHOOK_URL`
  - 통제 변경 알림을 받을 Google Chat Incoming Webhook URL (옵션)
- `VITE_GOOGLE_CHAT_ALERT_ACTIONS`
  - 알림 액션 목록 (콤마 구분). 예: `EXECUTION_SAVED,REVIEW_COMPLETED`
- `VITE_GOOGLE_CHAT_DEDUP_MS`
  - 동일 이벤트 중복 알림 방지 시간(ms). 예: `60000`이면 60초 내 중복 전송 차단
- `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`
  - PostgreSQL 호환 모드나 백업 복원 스크립트에서 사용합니다.
- `LOCAL_EVIDENCE_DIR`
  - `STORAGE_PROVIDER=local`일 때 증적 파일을 저장할 로컬 디렉터리입니다.
- `VITE_DB_INFO_TIMEOUT_MS`, `QUERY_TEST_TIMEOUT_MS`, `VITE_QUERY_TEST_TIMEOUT_MS`
  - DB 정보 조회와 읽기 전용 쿼리 테스트의 서버/브라우저 타임아웃입니다.

## Firebase Google OAuth 설정

현재 로그인 방식은 Firebase Authentication Google provider입니다.

Firebase Console에서 아래를 설정해야 합니다.

1. Authentication > Sign-in method > Google 사용
2. Authentication > Settings > Authorized domains에 도메인 추가
   - `localhost`
   - `127.0.0.1`
   - `itgc.sanghak.kr`
## 로컬 Firebase + R2 개발 서버

`npm run dev:firebase`는 Vite와 파일 업로드 API를 단일 서버로 띄웁니다. 데이터는 Firestore를 사용하고, 증적 파일은 `/api/evidence/upload`를 통해 R2로 저장합니다.

- 앱 주소: `http://127.0.0.1:5180`
- API 경로: 동일 origin의 `/api/*`
- 원격 상태 확인: `GET /api/db-info`
- 읽기 전용 조회 테스트: `POST /api/query-test`

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

- `VITE_DATA_BACKEND`
- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`
- `VITE_FIREBASE_COLLECTION_PREFIX`
- `VITE_EVIDENCE_STORAGE_PROVIDER`
- `STORAGE_PROVIDER`
- `R2_ACCOUNT_ID`
- `S3_REGION`
- `S3_BUCKET`
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `S3_PRESIGNED_URL_TTL_SECONDS`

값 저장 후 새 빌드로 재배포가 필요합니다.

### Cloudflare R2 증적 업로드

증적 파일 업로드는 브라우저가 R2 키를 직접 갖지 않고 서버 API(`/api/evidence/upload`)를 통해 처리합니다.

R2 API 토큰은 Object Read & Write 권한으로 만들고, 서버 환경 변수에 `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `R2_ACCOUNT_ID`, `S3_BUCKET`, `S3_REGION=auto`를 넣습니다.

필요 권한:

- `s3:PutObject`
- `s3:GetObject`
- `s3:DeleteObject`

대상 리소스 예:

- `arn:aws:s3:::itgcp-evidence-files/evidence/*`

## 스크립트

- `npm run dev`: Vite 개발 서버만 실행
- `npm run dev:firebase`: Vite + Firebase 데이터 + R2 파일 API 단일 서버 실행
- `npm run dev:postgres`: 호환용 alias. `.env`의 `VITE_DATA_BACKEND` 값을 따릅니다.
- `npm run build`: 프로덕션 빌드
- `npm run preview`: 빌드 결과 미리보기
- `npm run workspace:restore-backup`: 백업 JSON 내용을 PostgreSQL로 복원

## 주요 파일

- [src/App.jsx](/Users/shbae-pc/Tools/ITGC/src/App.jsx): 메인 UI 및 상태 관리
- [src/styles.css](/Users/shbae-pc/Tools/ITGC/src/styles.css): 전역 스타일 및 반응형 레이아웃
- [src/firebaseClient.js](/Users/shbae-pc/Tools/ITGC/src/firebaseClient.js): Firebase Auth / Firestore / Storage 초기화
- [src/postgresApi.js](/Users/shbae-pc/Tools/ITGC/src/postgresApi.js): Firestore/PostgreSQL 호환 데이터 저장 계층 및 워크스페이스 직렬화
- [scripts/postgres_api_server.mjs](/Users/shbae-pc/Tools/ITGC/scripts/postgres_api_server.mjs): 로컬 API 서버 및 R2 파일 업로드
- [scripts/single_server.mjs](/Users/shbae-pc/Tools/ITGC/scripts/single_server.mjs): Vite와 API를 함께 띄우는 단일 개발 서버
- [vite.config.js](/Users/shbae-pc/Tools/ITGC/vite.config.js): GitHub Pages base 경로 설정

## 운영 메모

- 로그인 회원과 감사 로그는 앱 상태뿐 아니라 Firestore에도 저장되도록 설계되어 있습니다.
- 실제 IP는 현재 구조상 신뢰성 있게 수집되지 않아 감사 로그에는 기본값 `-`로 기록됩니다.
- 파일 업로드 API 서버를 최신으로 재배포하지 않으면 R2 업로드/삭제가 실패할 수 있습니다.
