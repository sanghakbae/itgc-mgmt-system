import { useEffect, useMemo, useRef, useState } from "react";
import {
  fetchSupabaseIntegrationStatus,
  fetchSupabaseAuditLogsPage,
  fetchSupabaseWorkspace,
  syncSupabaseWorkspace,
  createSupabaseAuditLog,
  deleteSupabaseControl,
  deleteSupabaseMember,
} from "./supabaseApi";
import { defaultControls30 } from "./defaultControls30";

const STORAGE_KEY = "itgc-workspace-v8";
const REGISTRATION_DRAFT_KEY = "itgc-registration-draft-v1";
const AUTH_STORAGE_KEY = "itgc-google-auth-v1";
const LOGIN_DOMAIN_STORAGE_KEY = "itgc-login-domain-v1";
const DELETED_MEMBER_EMAILS_STORAGE_KEY = "itgc-deleted-member-emails-v1";
const CURRENT_VIEW_STORAGE_KEY = "itgc-current-view-v1";
const WORKBENCH_TAB_STORAGE_KEY = "itgc-workbench-tab-v1";
const UI_THEME_STORAGE_KEY = "itgc-ui-theme-v1";
const AUDIT_LOG_MAX_ITEMS = 3000;
const AUDIT_LOG_PAGE_SIZE = 30;
const LOGIN_DOMAIN_ERROR_MESSAGE = "허용된 도메인만 로그인할 수 있습니다.";
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? "";
const GOOGLE_DRIVE_FOLDER_ID = (import.meta.env.VITE_GOOGLE_DRIVE_FOLDER_ID ?? "").trim();
const ALLOWED_DOMAIN_ENV = (import.meta.env.VITE_ALLOWED_DOMAIN ?? "").trim() || "muhayu.com";
const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL ?? "").trim();
const SUPABASE_ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? "").trim();
const GOOGLE_CHAT_WEBHOOK_URL = (import.meta.env.VITE_GOOGLE_CHAT_WEBHOOK_URL ?? "").trim();
const GOOGLE_CHAT_ALERT_ACTIONS_ENV = (import.meta.env.VITE_GOOGLE_CHAT_ALERT_ACTIONS ?? "").trim();
const GOOGLE_CHAT_DEDUP_MS_ENV = Number(import.meta.env.VITE_GOOGLE_CHAT_DEDUP_MS ?? 60000);
const GOOGLE_CHAT_DEDUP_WINDOW_MS = Number.isFinite(GOOGLE_CHAT_DEDUP_MS_ENV) && GOOGLE_CHAT_DEDUP_MS_ENV >= 0
  ? GOOGLE_CHAT_DEDUP_MS_ENV
  : 60000;
const DATA_BACKEND_ENV = (import.meta.env.VITE_DATA_BACKEND ?? "").trim().toLowerCase();
const IS_LOCAL_RUNTIME =
  Boolean(import.meta.env.DEV)
  || (typeof window !== "undefined" && ["localhost", "127.0.0.1"].includes(window.location.hostname));
let googleDriveAccessTokenCache = "";
let googleDriveAccessTokenExpiresAt = 0;
const googleChatAlertDedupCache = new Map();
const ALLOWED_EMAIL_DOMAINS = ALLOWED_DOMAIN_ENV
  .split(",")
  .map((domain) => domain.trim().toLowerCase())
  .filter(Boolean);
const DEV_LOCAL_LOGIN_ENABLED = Boolean(import.meta.env.DEV);
const DEFAULT_DEV_LOGIN_EMAIL = `shbae@${ALLOWED_EMAIL_DOMAINS[0] ?? "muhayu.com"}`;

const DATA_BACKEND = (() => {
  if (DATA_BACKEND_ENV === "supabase") {
    return "supabase";
  }
  if (SUPABASE_URL && SUPABASE_ANON_KEY) {
    return "supabase";
  }
  return "local";
})();

const HAS_REMOTE_BACKEND = DATA_BACKEND !== "local";
const VIEW_KEYS = ["dashboard", "dashboard-delay-detail", "control-list", "control-workbench", "report", "people", "audit", "register", "controls", "control-review", "roles"];
const WORKBENCH_TAB_KEYS = ["register", "controls", "controls-complete", "control-review", "performed-complete"];
const UI_THEME_OPTIONS = [
  { value: "classic", label: "Classic" },
  { value: "editorial", label: "Editorial White" },
  { value: "navy", label: "Navy Pro" },
  { value: "glass", label: "Soft Glass" },
  { value: "forest", label: "Forest" },
  { value: "sunset", label: "Sunset" },
  { value: "mono", label: "Monochrome" },
  { value: "mint", label: "Mint" },
  { value: "coral", label: "Coral" },
  { value: "midnight", label: "Midnight" },
];
const UI_THEME_VALUES = new Set(UI_THEME_OPTIONS.map((option) => option.value));
const CONTROL_UNIT_FILTER_ORDER = ["개발유닛", "인프라유닛", "정보보호유닛", "QA유닛"];
const DASHBOARD_DELAY_BUCKET_CONFIG = {
  annual: {
    label: "연 지연",
    frequencies: [
      "Monthly",
      "Quarterly",
      "Half-Bi-annual",
      "Annual",
      "월별",
      "분기별",
      "반기별",
      "연 1회 + 변경 시",
    ],
  },
};

const defaultData = {
  controls: defaultControls30,
  loginDomains: ALLOWED_EMAIL_DOMAINS,
  workflows: [
    {
      id: "WF-001",
      controlId: "APD-01",
      step: "권한 부여 이력 모집단 추출",
      assignee: "각 권한통제 부서",
      reviewer: "정보보호유닛",
      dueDate: "2026-03-27",
      status: "todo",
      memo: "",
    },
    {
      id: "WF-002",
      controlId: "APD-01",
      step: "요청서 및 승인 문서 샘플링",
      assignee: "정보보호유닛",
      reviewer: "정보보호유닛",
      dueDate: "2026-03-29",
      status: "todo",
      memo: "",
    },
    {
      id: "WF-003",
      controlId: "PC-01",
      step: "변경 요청서와 배포 이력 대조",
      assignee: "QA유닛",
      reviewer: "TA유닛",
      dueDate: "2026-03-26",
      status: "todo",
      memo: "",
    },
    {
      id: "WF-004",
      controlId: "CO-02",
      step: "월별 백업 결과 보고서 2건 확보",
      assignee: "인프라유닛",
      reviewer: "정보보호유닛",
      dueDate: "2026-03-30",
      status: "todo",
      memo: "",
    },
    {
      id: "WF-005",
      controlId: "PWC-01",
      step: "최신 IT 정책서 승인본 및 공지 이력 확보",
      assignee: "QA유닛",
      reviewer: "정보보호유닛",
      dueDate: "2026-03-28",
      status: "todo",
      memo: "",
    },
  ],
};

const implementationStatusOrder = ["todo", "in_progress", "done"];
const defaultPeople = [];
const systemOptions = ["영림원", "판다", "BI", "관리자콘솔(HR)", "관리자콘솔(CK)"];
const controlCatalog = {
  "PWC-01": {
    process: "IT정책관리",
    subProcess: "IT정책관리",
    title: "IT 조직 SOD 및 IT 운영 프로세스 정책의 수립, 검토 및 공지",
    keyControl: "Yes",
    frequency: "Annual",
    performDept: "QA유닛",
    reviewDept: "정보보호유닛",
    targetSystems: ["영림원", "판다", "BI", "관리자콘솔(HR)", "관리자콘솔(CK)"],
  },
  "APD-01": {
    process: "계정 관리",
    subProcess: "계정 관리",
    title: "어플리케이션 계정 생성 및 권한 부여 시 승인",
    keyControl: "Yes",
    frequency: "Event Driven",
    performDept: "각 권한통제 부서",
    reviewDept: "정보보호유닛",
    targetSystems: ["영림원", "판다", "BI", "관리자콘솔(HR)", "관리자콘솔(CK)"],
  },
  "APD-02": {
    process: "계정 관리",
    subProcess: "계정 관리",
    title: "퇴사자 계정 잠금(계정 삭제/권한회수)",
    keyControl: "No",
    frequency: "Event Driven",
    performDept: "각 권한통제 부서",
    reviewDept: "정보보호유닛",
    targetSystems: ["영림원", "판다", "BI", "관리자콘솔(HR)", "관리자콘솔(CK)"],
  },
  "APD-03": {
    process: "계정 관리",
    subProcess: "계정 관리",
    title: "부서 이동자 권한 회수",
    keyControl: "No",
    frequency: "Event Driven",
    performDept: "각 권한통제 부서",
    reviewDept: "정보보호유닛",
    targetSystems: ["영림원", "판다", "BI", "관리자콘솔(HR)", "관리자콘솔(CK)"],
  },
  "APD-04": {
    process: "계정 관리",
    subProcess: "계정 관리",
    title: "어플리케이션 Super User/Admin 권한 모니터링",
    keyControl: "Yes",
    frequency: "Half-Bi-annual",
    performDept: "각 권한통제 부서",
    reviewDept: "정보보호유닛",
    targetSystems: ["영림원", "판다", "BI", "관리자콘솔(HR)", "관리자콘솔(CK)"],
  },
  "APD-05": {
    process: "계정 관리",
    subProcess: "계정 관리",
    title: "어플리케이션 사용자 권한 모니터링",
    keyControl: "Yes",
    frequency: "Half-Bi-annual",
    performDept: "각 권한통제 부서",
    reviewDept: "정보보호유닛",
    targetSystems: ["영림원", "판다", "BI", "관리자콘솔(HR)", "관리자콘솔(CK)"],
  },
  "APD-06": {
    process: "패스워드 관리",
    subProcess: "패스워드 관리",
    title: "어플리케이션 패스워드 및 시스템 보안 설정의 효과적 설정",
    keyControl: "No",
    frequency: "Other",
    performDept: "정보보호유닛",
    reviewDept: "QA유닛",
    targetSystems: ["영림원", "판다", "BI", "관리자콘솔(HR)", "관리자콘솔(CK)"],
  },
  "APD-07": {
    process: "데이터 변경 관리",
    subProcess: "데이터 변경 관리",
    title: "DB 데이터 직접 변경 시 요청 및 승인",
    keyControl: "Yes",
    frequency: "Event Driven",
    performDept: "인프라유닛",
    reviewDept: "정보보호유닛",
    targetSystems: ["판다", "BI", "관리자콘솔(HR)", "관리자콘솔(CK)"],
  },
  "APD-08": {
    process: "DB 계정 관리",
    subProcess: "DB 계정 관리",
    title: "DB 계정 생성 및 접근 부여 시 요청 및 승인",
    keyControl: "No",
    frequency: "Event Driven",
    performDept: "인프라유닛",
    reviewDept: "정보보호유닛",
    targetSystems: ["판다", "BI", "관리자콘솔(HR)", "관리자콘솔(CK)"],
  },
  "APD-09": {
    process: "OS 계정 관리",
    subProcess: "OS 계정 관리",
    title: "OS 계정 생성 및 접근 권한 부여 시 요청 및 승인",
    keyControl: "No",
    frequency: "Event Driven",
    performDept: "인프라유닛",
    reviewDept: "QA유닛",
    targetSystems: ["판다", "BI", "관리자콘솔(HR)", "관리자콘솔(CK)"],
  },
  "APD-10": {
    process: "DB/OS 계정 모니터링",
    subProcess: "DB/OS 계정 모니터링",
    title: "DB/OS 접근 가능 사용자 및 관리자 권한 보유자 모니터링",
    keyControl: "Yes",
    frequency: "Half-Bi-annual",
    performDept: "인프라유닛",
    reviewDept: "정보보호유닛",
    targetSystems: ["판다", "BI", "관리자콘솔(HR)", "관리자콘솔(CK)"],
  },
  "PC-01": {
    process: "프로그램 변경 관리",
    subProcess: "프로그램 변경 관리",
    title: "어플리케이션 변경 승인 및 개발자/사용자 테스트",
    keyControl: "Yes",
    frequency: "Event Driven",
    performDept: "QA유닛",
    reviewDept: "TA유닛",
    targetSystems: ["판다", "BI", "관리자콘솔(HR)", "관리자콘솔(CK)"],
  },
  "PC-02": {
    process: "프로그램 변경 관리",
    subProcess: "프로그램 변경 관리",
    title: "개발/테스트, 운영 환경의 분리",
    keyControl: "Yes",
    frequency: "Other",
    performDept: "인프라유닛",
    reviewDept: "QA유닛",
    targetSystems: ["영림원", "BI"],
  },
  "PC-03": {
    process: "프로그램 변경 관리",
    subProcess: "프로그램 변경 관리",
    title: "프로그램 이관 승인",
    keyControl: "Yes",
    frequency: "Event Driven",
    performDept: "인프라유닛",
    reviewDept: "QA유닛",
    targetSystems: ["영림원", "판다", "BI", "관리자콘솔(HR)", "관리자콘솔(CK)"],
  },
  "PC-04": {
    process: "프로그램 변경 관리",
    subProcess: "프로그램 변경 관리",
    title: "운영 환경 내 시스템 변경 불가",
    keyControl: "Yes",
    frequency: "Event Driven",
    performDept: "인프라유닛",
    reviewDept: "QA유닛",
    targetSystems: ["영림원", "판다", "BI", "관리자콘솔(HR)", "관리자콘솔(CK)"],
  },
  "CO-01": {
    process: "오류 관리",
    subProcess: "오류 관리",
    title: "시스템 운영 상 발생 오류에 대한 조치 및 보고",
    keyControl: "Yes",
    frequency: "Event Driven",
    performDept: "QA유닛",
    reviewDept: "TA유닛",
    targetSystems: ["BI"],
  },
  "CO-02": {
    process: "데이터 백업 및 복구",
    subProcess: "데이터 백업 및 복구",
    title: "데이터 백업 이상 건에 대한 조치 및 보고",
    keyControl: "Yes",
    frequency: "Monthly",
    performDept: "인프라유닛",
    reviewDept: "정보보호유닛",
    targetSystems: ["BI"],
  },
  "CO-03": {
    process: "물리적 보안",
    subProcess: "물리적 보안",
    title: "데이터센터 출입 로그 검토",
    keyControl: "Yes",
    frequency: "Quarterly",
    performDept: "인프라유닛",
    reviewDept: "정보보호유닛",
    targetSystems: ["BI"],
  },
  "CO-04": {
    process: "데이터 백업 및 복구",
    subProcess: "데이터 백업 및 복구",
    title: "데이터베이스 복구테스트의 실시 및 결과 보고",
    keyControl: "Yes",
    frequency: "Annual",
    performDept: "인프라유닛",
    reviewDept: "정보보호유닛",
    targetSystems: ["BI"],
  },
  "PD-01": {
    process: "프로그램 개발",
    subProcess: "프로그램 개발",
    title: "프로그램 개발 승인 및 단위/통합/사용자 테스트",
    keyControl: "Yes",
    frequency: "Event Driven",
    performDept: "QA유닛",
    reviewDept: "TA유닛",
    targetSystems: ["BI"],
  },
  "PD-02": {
    process: "프로그램 개발",
    subProcess: "프로그램 개발",
    title: "데이터 정합성 테스트",
    keyControl: "Yes",
    frequency: "Event Driven",
    performDept: "인프라유닛",
    reviewDept: "QA유닛",
    targetSystems: ["BI"],
  },
  "PD-03": {
    process: "프로그램 개발",
    subProcess: "프로그램 개발",
    title: "프로그램 개발 이슈 및 오류 관리",
    keyControl: "No",
    frequency: "Event Driven",
    performDept: "QA유닛",
    reviewDept: "TA유닛",
    targetSystems: ["BI"],
  },
  "PD-04": {
    process: "프로그램 개발",
    subProcess: "프로그램 개발",
    title: "사용자 교육",
    keyControl: "No",
    frequency: "Event Driven",
    performDept: "QA유닛",
    reviewDept: "TA유닛",
    targetSystems: ["BI"],
  },
  "C-IT-Cyber-01": {
    process: "Cybersecurity",
    subProcess: "Cybersecurity",
    title: "정보보호지침의 수립 및 제·개정",
    keyControl: "Yes",
    frequency: "Annual",
    performDept: "정보보호유닛",
    reviewDept: "이광주",
    targetSystems: ["BI"],
  },
  "C-IT-Cyber-02": {
    process: "Cybersecurity",
    subProcess: "Cybersecurity",
    title: "정보보안 교육의 실행 및 결과 보고",
    keyControl: "Yes",
    frequency: "Annual",
    performDept: "정보보호유닛",
    reviewDept: "이광주",
    targetSystems: ["BI"],
  },
  "C-IT-Cyber-03": {
    process: "Cybersecurity",
    subProcess: "Cybersecurity",
    title: "정보보안 대상 자산 및 인프라 목록 작성 및 업데이트",
    keyControl: "Yes",
    frequency: "Annual",
    performDept: "인프라유닛",
    reviewDept: "이광주",
    targetSystems: ["BI"],
  },
  "C-IT-Cyber-04": {
    process: "Cybersecurity",
    subProcess: "Cybersecurity",
    title: "ESM(통합 관제 시스템) 상 감지된 특이상 분석, 조치 및 보고",
    keyControl: "Yes",
    frequency: "Monthly",
    performDept: "인프라유닛",
    reviewDept: "정보보호유닛",
    targetSystems: ["BI"],
  },
  "C-IT-Cyber-05": {
    process: "Cybersecurity",
    subProcess: "Cybersecurity",
    title: "네트워크 보안 장비(방화벽, 보안프로토콜, 라우터 등)의 운용 및 관리",
    keyControl: "Yes",
    frequency: "Event Driven",
    performDept: "인프라유닛",
    reviewDept: "정보보호유닛",
    targetSystems: ["BI"],
  },
  "C-IT-Cyber-06": {
    process: "Cybersecurity",
    subProcess: "Cybersecurity",
    title: "원격접속 권한의 요청 및 승인",
    keyControl: "Yes",
    frequency: "Event Driven",
    performDept: "인프라유닛",
    reviewDept: "정보보호유닛",
    targetSystems: ["BI"],
  },
  "C-IT-Cyber-07": {
    process: "Cybersecurity",
    subProcess: "Cybersecurity",
    title: "연간 정보보안 진단의 수행 및 결과보고",
    keyControl: "Yes",
    frequency: "Annual",
    performDept: "정보보호유닛",
    reviewDept: "TA유닛",
    targetSystems: ["BI"],
  },
};
const defaultSystemsByCategory = {
  PWC: ["영림원", "판다", "BI", "관리자콘솔(HR)", "관리자콘솔(CK)"],
  APD: ["영림원", "판다", "BI", "관리자콘솔(HR)", "관리자콘솔(CK)"],
  PC: ["영림원", "판다", "BI", "관리자콘솔(HR)", "관리자콘솔(CK)"],
  CO: ["영림원", "판다", "BI"],
  PD: ["영림원", "판다", "BI"],
  CS: ["영림원", "판다", "BI", "관리자콘솔(HR)", "관리자콘솔(CK)"],
};

function resolveDefaultSystems(process) {
  const normalized = String(process ?? "").trim().toUpperCase();
  return defaultSystemsByCategory[normalized] ?? [];
}

const initialRegistrationForm = {
  controlId: "",
  process: "계정관리",
  subProcess: "",
  risk: "",
  controlName: "",
  controlObjective: "",
  controlActivity: "",
  description: "",
  frequency: "Monthly",
  controlType: "예방",
  automationLevel: "수동",
  keyControl: false,
  ownerDept: "",
  reviewDept: "",
  evidence: "",
  testMethod: "",
  population: "",
  targetSystems: [],
  policyReference: "",
  deficiencyImpact: "높음",
};

const registrationRequiredFields = [
  "controlId",
  "process",
  "risk",
  "controlName",
  "controlObjective",
  "controlActivity",
  "description",
  "frequency",
  "controlType",
  "ownerDept",
  "reviewDept",
  "evidence",
  "targetSystems",
];

const registrationExamples = [
  {
    id: "PWC-01",
    name: "IT 조직 SOD 및 운영 정책 수립",
    process: "IT 정책관리",
    type: "예방",
    key: true,
    owner: "QA부서",
  },
  {
    id: "APD-01",
    name: "애플리케이션 계정 생성 시 승인",
    process: "계정관리",
    type: "예방",
    key: true,
    owner: "각 부서",
  },
  {
    id: "APD-02",
    name: "퇴사자 계정 잠금 및 삭제",
    process: "계정관리",
    type: "예방 + 탐지",
    key: false,
    owner: "각 부서",
  },
];

const registrationWritingGuide = [
  "이번 회차에 실제로 어떤 시스템을 어떤 기준으로 점검했는지 작성",
  "수행자·검토자·승인자를 분리해서 기록",
  "대상 기간·수행일·승인일을 남겨 적시성 확인 가능하게 작성",
  "스크린샷·로그·체크리스트·승인문서 등 제3자 검증 가능한 증빙 첨부",
  "예외 발생 시 사유·영향·승인자·조치기한까지 기록",
];

const registrationQualityGuide = [
  "모집단(전체 대상 건수) 먼저 확인하고 누락 여부 점검",
  "샘플 선정 이유를 기록해 재현 가능한 점검으로 유지",
  "승인일과 수행일 순서가 맞는지 날짜 대조",
  "점검표·첨부파일·로그·승인기록 간 시스템/일자/담당자 일치 확인",
  "미흡 시 원인·개선계획·담당자·기한까지 연결",
];

function uniqueSystems(systems) {
  return [...new Set((systems ?? []).filter(Boolean))];
}

function isRegistrationFieldFilled(form, key) {
  if (key === "targetSystems") {
    return Array.isArray(form.targetSystems) && form.targetSystems.length > 0;
  }

  return String(form[key] ?? "").trim().length > 0;
}

function isKeyControl(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized === "yes" || normalized === "true" || normalized === "key" || normalized === "key control";
}

function resolveControlEvidenceText(control) {
  return (
    control.evidenceText
    ?? control.testEvidence
    ?? control.test_evidence
    ?? (control.evidences ?? []).join(", ")
    ?? ""
  );
}

function resolveControlTestMethod(control) {
  return (
    control.testMethod
    ?? control.testProcedure
    ?? control.test_procedure
    ?? (control.procedures ?? []).join(", ")
    ?? ""
  );
}

function isImageEvidence(file) {
  const candidate = String(file?.mimeType || file?.name || file?.url || "").toLowerCase();
  return /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(candidate) || candidate.startsWith("image/");
}

function isPdfEvidence(file) {
  const candidate = String(file?.mimeType || file?.name || file?.url || "").toLowerCase();
  return /\.pdf($|\?)/i.test(candidate) || candidate.includes("application/pdf");
}

function extractDriveFileId(file) {
  const rawUrl = String(file?.url ?? "").trim();
  const driveFileId = String(file?.driveFileId ?? "").trim();
  if (driveFileId) {
    return driveFileId;
  }

  const byIdMatch = rawUrl.match(/[?&]id=([^&]+)/i);
  if (byIdMatch?.[1]) {
    return byIdMatch[1];
  }

  const byPathMatch = rawUrl.match(/\/d\/([^/]+)/i);
  if (byPathMatch?.[1]) {
    return byPathMatch[1];
  }

  return "";
}

function getEvidencePreviewUrl(file) {
  const rawUrl = String(file?.url ?? "").trim();
  const driveFileId = extractDriveFileId(file);

  if (driveFileId) {
    return `https://drive.google.com/uc?export=view&id=${driveFileId}`;
  }

  return rawUrl;
}

function getEvidenceEmbedUrl(file) {
  const rawUrl = String(file?.url ?? "").trim();
  const driveFileId = extractDriveFileId(file);

  if (driveFileId) {
    return `https://drive.google.com/file/d/${driveFileId}/preview`;
  }

  return rawUrl;
}

function getEvidenceReportImageUrl(file) {
  const driveFileId = extractDriveFileId(file);
  if (driveFileId) {
    return `https://drive.google.com/thumbnail?id=${driveFileId}&sz=w2000`;
  }
  return getEvidencePreviewUrl(file);
}

function getEvidenceReportImageFallbackUrl(file) {
  return getEvidencePreviewUrl(file) || getEvidenceEmbedUrl(file);
}

function isDriveEvidence(file) {
  const rawUrl = String(file?.url ?? "").trim();
  const driveFileId = String(file?.driveFileId ?? "").trim();
  return Boolean(
    driveFileId
    || rawUrl.includes("drive.google.com")
    || rawUrl.includes("docs.google.com"),
  );
}

function normalizeCompactText(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeUnitLabel(value) {
  return normalizeCompactText(value).replace(/유닛/g, "").trim();
}

function normalizeUnitName(value) {
  return normalizeUnitLabel(value).toLowerCase();
}

function toControlUnitFilterValue(control) {
  const rawUnit = normalizeCompactText(control?.performDept ?? control?.performer ?? "");
  const normalized = normalizeUnitName(rawUnit);
  if (!normalized) {
    return "미지정";
  }
  if (normalized.includes("정보보호")) {
    return "정보보호유닛";
  }
  if (normalized.includes("인프라")) {
    return "인프라유닛";
  }
  if (normalized.includes("개발")) {
    return "개발유닛";
  }
  if (normalized.includes("qa") || normalized.includes("ta")) {
    return "QA유닛";
  }
  return rawUnit;
}

function convertLeadingNumberBulletsToCircled(value) {
  const circled = ["", "①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨", "⑩", "⑪", "⑫", "⑬", "⑭", "⑮", "⑯", "⑰", "⑱", "⑲", "⑳"];
  const text = String(value ?? "");
  if (!text) {
    return "";
  }

  return text.replace(/(^|\n)\s*(\d{1,2})[.)]\s+/g, (match, prefix, numeric) => {
    const n = Number(numeric);
    if (!Number.isInteger(n) || n < 1 || n >= circled.length) {
      return match;
    }
    return `${prefix}${circled[n]} `;
  });
}

function buildActivityFromControl(control) {
  const normalizedTitle = normalizeCompactText(control?.title).replace(/[.。]+$/, "");
  if (!normalizedTitle) {
    return "";
  }
  const performDept = normalizeUnitLabel(control?.performDept ?? control?.performer ?? control?.ownerDept) || "수행 부서";
  const reviewDept = normalizeUnitLabel(control?.reviewDept ?? control?.reviewer) || "검토 부서";
  const frequency = formatFrequencyLabel(control?.frequency) || "정기";
  const objective = normalizeCompactText(control?.controlObjective ?? control?.purpose);

  return [
    `1. ${performDept}는 "${normalizedTitle}" 통제를 ${frequency} 기준에 따라 수행하고 결과를 기록한다.`,
    objective ? `2. 점검 목적은 ${objective}이며 예외 사항은 원인과 조치 계획을 함께 남긴다.` : "2. 점검 중 발견된 예외 사항은 원인과 조치 계획을 함께 남긴다.",
    `3. 근거 자료는 증적(Evidence)으로 보관하고 ${reviewDept}가 검토 결과를 승인 또는 개선조치로 확정한다.`,
  ].join("\n");
}

function formatFrequencyLabel(frequency) {
  const frequencyLabelMap = {
    Daily: "일별",
    Weekly: "주별",
    Monthly: "월별",
    Quarterly: "분기별",
    "Half-Bi-annual": "반기별",
    Annual: "연 1회",
    "Event Driven": "이벤트 발생 시",
    Other: "필요 시",
    일별: "일별",
    주별: "주별",
    월별: "월별",
    분기별: "분기별",
    반기별: "반기별",
    "연 1회 + 변경 시": "연 1회",
    연간: "연 1회",
    수시: "이벤트 발생 시",
  };
  return frequencyLabelMap[String(frequency ?? "").trim()] ?? String(frequency ?? "").trim();
}

function executionPeriodSortValue(period) {
  const value = String(period ?? "").trim();
  const monthMatch = value.match(/^(\d{1,2})월$/);
  if (monthMatch) {
    return Number(monthMatch[1]);
  }
  const quarterMatch = value.match(/^(\d)분기$/);
  if (quarterMatch) {
    return Number(quarterMatch[1]) * 10;
  }
  if (value === "상반기") return 61;
  if (value === "하반기") return 62;
  if (value === "연간") return 120;
  const weekMatch = value.match(/^(\d{1,2})주차$/);
  if (weekMatch) {
    return Number(weekMatch[1]);
  }
  const dayMatch = value.match(/^(\d{1,2})일$/);
  if (dayMatch) {
    return Number(dayMatch[1]);
  }
  return 0;
}

function resolveReviewActorDisplay(control) {
  const reviewAuthorName = String(control?.reviewAuthorName ?? "").trim();
  const reviewAuthorEmail = String(control?.reviewAuthorEmail ?? "").trim();
  if (reviewAuthorName) {
    return reviewAuthorName;
  }
  if (reviewAuthorEmail) {
    return reviewAuthorEmail;
  }
  return resolveReviewDeptDisplay(control);
}

function resolveExecutionDetailTestMethod(control) {
  return String(control?.executionTestMethod ?? control?.testMethod ?? "").trim()
    || (Array.isArray(control?.procedures) ? control.procedures.join("\n") : "");
}

function resolveExecutionDetailPopulation(control) {
  return String(control?.executionPopulation ?? control?.population ?? "").trim();
}

function executionTimestamp(value) {
  const parsed = Date.parse(String(value ?? "").trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

function isForcedBottomControl(control) {
  return String(control?.id ?? "").trim() === "C-IT-Cyber-02";
}

function compareExecutionEntriesDesc(left, right) {
  const leftForcedBottom = isForcedBottomControl(left);
  const rightForcedBottom = isForcedBottomControl(right);
  if (leftForcedBottom !== rightForcedBottom) {
    return leftForcedBottom ? 1 : -1;
  }

  const leftCreatedAt = executionTimestamp(left?.createdAt);
  const rightCreatedAt = executionTimestamp(right?.createdAt);
  if (leftCreatedAt !== rightCreatedAt) {
    return rightCreatedAt - leftCreatedAt;
  }

  const leftYear = Number.parseInt(String(left?.executionYear ?? ""), 10);
  const rightYear = Number.parseInt(String(right?.executionYear ?? ""), 10);
  const safeLeftYear = Number.isFinite(leftYear) ? leftYear : 0;
  const safeRightYear = Number.isFinite(rightYear) ? rightYear : 0;
  if (safeLeftYear !== safeRightYear) {
    return safeRightYear - safeLeftYear;
  }

  const leftPeriod = executionPeriodSortValue(left?.executionPeriod);
  const rightPeriod = executionPeriodSortValue(right?.executionPeriod);
  if (leftPeriod !== rightPeriod) {
    return rightPeriod - leftPeriod;
  }

  const leftUpdatedAt = executionTimestamp(left?.updatedAt);
  const rightUpdatedAt = executionTimestamp(right?.updatedAt);
  if (leftUpdatedAt !== rightUpdatedAt) {
    return rightUpdatedAt - leftUpdatedAt;
  }

  return 0;
}

function compareControlsByRecentExecution(left, right) {
  const leftForcedBottom = isForcedBottomControl(left);
  const rightForcedBottom = isForcedBottomControl(right);
  if (leftForcedBottom !== rightForcedBottom) {
    return leftForcedBottom ? 1 : -1;
  }

  const leftCreatedAt = executionTimestamp(left?.createdAt);
  const rightCreatedAt = executionTimestamp(right?.createdAt);
  if (leftCreatedAt !== rightCreatedAt) {
    return rightCreatedAt - leftCreatedAt;
  }
  return compareExecutionEntriesDesc(left, right);
}

function compareControlsByListOrder(left, right) {
  return compareControlsByRecentExecution(left, right) || String(left?.id ?? "").localeCompare(String(right?.id ?? ""), "ko");
}

function createExecutionEntryKey(controlId, executionYear, executionPeriod) {
  return `${String(controlId ?? "").trim()}::${String(executionYear ?? "").trim()}::${String(executionPeriod ?? "").trim()}`;
}

function normalizeExecutionId(value, controlId, executionYear, executionPeriod) {
  const rawId = String(value ?? "").trim();
  const canonicalId = createExecutionEntryKey(controlId, executionYear, executionPeriod);
  if (String(controlId ?? "").trim() && String(executionYear ?? "").trim() && String(executionPeriod ?? "").trim()) {
    if (!rawId || rawId.startsWith("EXE-")) {
      return canonicalId;
    }
  }
  return rawId || canonicalId;
}

function normalizeExecutionEntry(entry, fallbackControl = {}) {
  const executionYear = String(entry?.executionYear ?? "").trim();
  const executionPeriod = String(entry?.executionPeriod ?? "").trim();
  const fallbackControlId = String(fallbackControl?.id ?? "").trim();
  const forcedAuthorName =
    fallbackControlId === "C-IT-Cyber-04"
      ? "이치현"
      : String(entry?.executionAuthorName ?? "").trim();
  const forcedAuthorEmail =
    fallbackControlId === "C-IT-Cyber-04"
      ? ""
      : String(entry?.executionAuthorEmail ?? "").trim().toLowerCase();

  return {
    executionId: normalizeExecutionId(
      entry?.executionId ?? entry?.id,
      fallbackControl?.id,
      executionYear,
      executionPeriod,
    ),
    executionYear,
    executionPeriod,
    executionNote: String(entry?.executionNote ?? "").trim(),
    testMethodSnapshot: String(entry?.testMethodSnapshot ?? fallbackControl?.testMethod ?? "").trim(),
    populationSnapshot: String(entry?.populationSnapshot ?? fallbackControl?.population ?? "").trim(),
    evidenceTextSnapshot: String(entry?.evidenceTextSnapshot ?? fallbackControl?.evidenceText ?? "").trim(),
    executionSubmitted:
      typeof entry?.executionSubmitted === "boolean"
        ? entry.executionSubmitted
        : hasExecutionSubmissionContent(entry),
    reviewRequested:
      typeof entry?.reviewRequested === "boolean"
        ? entry.reviewRequested
        : false,
    executionAuthorName: forcedAuthorName,
    executionAuthorEmail: forcedAuthorEmail,
    executionAuthorUnit: String(entry?.executionAuthorUnit ?? fallbackControl?.performDept ?? fallbackControl?.performer ?? fallbackControl?.ownerDept ?? "").trim(),
    reviewChecked: String(entry?.reviewChecked ?? "미검토").trim() || "미검토",
    reviewResult: String(entry?.reviewResult ?? "").trim(),
    reviewAuthorName: String(entry?.reviewAuthorName ?? "").trim(),
    reviewAuthorEmail: String(entry?.reviewAuthorEmail ?? "").trim().toLowerCase(),
    reviewAuthorUnit: String(entry?.reviewAuthorUnit ?? fallbackControl?.reviewDept ?? fallbackControl?.reviewer ?? "").trim(),
    note: String(entry?.note ?? "").trim(),
    status: String(entry?.status ?? deriveAssignmentStatus(String(entry?.executionNote ?? "").trim(), String(entry?.reviewChecked ?? "미검토").trim() || "미검토")).trim(),
    evidenceFiles: Array.isArray(entry?.evidenceFiles) ? entry.evidenceFiles : [],
    evidenceStatus:
      String(entry?.evidenceStatus ?? "").trim()
      || ((Array.isArray(entry?.evidenceFiles) ? entry.evidenceFiles : []).length > 0 ? "준비 완료" : "미수집"),
    reviewDate: String(entry?.reviewDate ?? "").trim(),
    updatedAt: String(entry?.updatedAt ?? "").trim(),
    createdAt: String(entry?.createdAt ?? "").trim(),
  };
}

function buildLegacyExecutionEntry(control) {
  if (!hasExecutionEntryContent(control) && !String(control?.executionAuthorEmail ?? "").trim() && !String(control?.reviewAuthorEmail ?? "").trim()) {
    return null;
  }
  return normalizeExecutionEntry({
    executionId: createExecutionEntryKey(control?.id, control?.executionYear, control?.executionPeriod),
    executionYear: control?.executionYear,
    executionPeriod: control?.executionPeriod,
    executionNote: control?.executionNote,
    testMethodSnapshot: control?.testMethod,
    populationSnapshot: control?.population,
    evidenceTextSnapshot: control?.evidenceText,
    executionSubmitted: control?.executionSubmitted,
    reviewRequested: control?.reviewRequested,
    executionAuthorName: control?.executionAuthorName,
    executionAuthorEmail: control?.executionAuthorEmail,
    executionAuthorUnit: control?.performDept ?? control?.performer ?? control?.ownerDept,
    reviewChecked: control?.reviewChecked,
    reviewResult: control?.reviewResult,
    reviewAuthorName: control?.reviewAuthorName,
    reviewAuthorEmail: control?.reviewAuthorEmail,
    reviewAuthorUnit: control?.reviewDept ?? control?.reviewer,
    note: control?.note,
    status: control?.status,
    evidenceFiles: control?.evidenceFiles,
    evidenceStatus: control?.evidenceStatus,
    reviewDate: control?.reviewDate,
  }, control);
}

function getControlExecutionHistory(control) {
  const source = Array.isArray(control?.executionHistory) ? control.executionHistory : [];
  const normalized = source
    .map((entry) => normalizeExecutionEntry(entry, control))
    .filter((entry) => hasExecutionEntryContent(entry) || entry.executionSubmitted || entry.executionAuthorEmail || entry.reviewAuthorEmail);

  if (normalized.length > 0) {
    return normalized.sort(compareExecutionEntriesDesc);
  }

  const legacyEntry = buildLegacyExecutionEntry(control);
  return legacyEntry ? [legacyEntry] : [];
}

function hasExecutionEntryContent(entry) {
  return (
    String(entry?.executionNote ?? "").trim().length > 0
    || ((Array.isArray(entry?.evidenceFiles) ? entry.evidenceFiles : []).length > 0)
  );
}

function hasExecutionSubmissionContent(entry) {
  return hasExecutionEntryContent(entry);
}

function hasExecutionRequiredFields(entry) {
  return (
    String(entry?.executionYear ?? "").trim().length > 0
    && String(entry?.executionPeriod ?? "").trim().length > 0
    && String(entry?.executionNote ?? "").trim().length > 0
    && (Array.isArray(entry?.evidenceFiles) ? entry.evidenceFiles : []).length > 0
  );
}

function isExecutionReadyForCompletion(entry) {
  return (
    hasExecutionRequiredFields(entry)
    && String(entry?.reviewChecked ?? "미검토").trim() !== "검토 완료"
  );
}

function isExecutionInReviewQueue(entry) {
  return (
    Boolean(entry?.executionSubmitted)
    && Boolean(entry?.reviewRequested)
    && isExecutionReadyForCompletion(entry)
    && String(entry?.reviewChecked ?? "미검토").trim() === "미검토"
  );
}

function hasDraftExecutionEntry(control) {
  return getControlExecutionHistory(control).some(
    (entry) =>
      !entry?.executionSubmitted
      && (
        String(entry?.executionNote ?? "").trim().length > 0
        || (Array.isArray(entry?.evidenceFiles) ? entry.evidenceFiles : []).length > 0
      ),
  );
}

function getPreferredExecutionEntry(control, fallbackEntry = null, match = null) {
  const history = getControlExecutionHistory(control);
  if (match?.executionYear && match?.executionPeriod) {
    const matched = history.find((entry) =>
      entry.executionYear === String(match.executionYear).trim()
      && entry.executionPeriod === String(match.executionPeriod).trim(),
    );
    if (matched) {
      return matched;
    }
    return fallbackEntry;
  }
  return history[0] ?? fallbackEntry;
}

function mergeExecutionHistoryIntoControl(control, nextHistory, preferredMatch = null) {
  const normalizedHistory = (Array.isArray(nextHistory) ? nextHistory : [])
    .map((entry) => normalizeExecutionEntry(entry, control))
    .sort(compareExecutionEntriesDesc);
  const preferredEntry = getPreferredExecutionEntry({ ...control, executionHistory: normalizedHistory }, normalizedHistory[0] ?? null, preferredMatch);

  return {
    ...normalizeControl({
      ...control,
      executionHistory: normalizedHistory,
    }),
    executionNote: preferredEntry?.executionNote ?? "",
    executionYear: preferredEntry?.executionYear ?? "",
    executionPeriod: preferredEntry?.executionPeriod ?? "",
    executionSubmitted: preferredEntry?.executionSubmitted ?? false,
    reviewRequested: preferredEntry?.reviewRequested ?? false,
    executionAuthorName: preferredEntry?.executionAuthorName ?? "",
    executionAuthorEmail: preferredEntry?.executionAuthorEmail ?? "",
    reviewChecked: preferredEntry?.reviewChecked ?? "미검토",
    reviewResult: preferredEntry?.reviewResult ?? "",
    reviewAuthorName: preferredEntry?.reviewAuthorName ?? "",
    reviewAuthorEmail: preferredEntry?.reviewAuthorEmail ?? "",
    note: preferredEntry?.note ?? "",
    status: preferredEntry?.status ?? "점검 예정",
    updatedAt: preferredEntry?.updatedAt ?? "",
    createdAt: preferredEntry?.createdAt ?? "",
    evidenceFiles: preferredEntry?.evidenceFiles ?? [],
    evidenceStatus: preferredEntry?.evidenceStatus ?? "미수집",
    executionTestMethod: String(preferredEntry?.testMethodSnapshot ?? control.executionTestMethod ?? control.testMethod ?? "").trim(),
    executionPopulation: String(preferredEntry?.populationSnapshot ?? control.executionPopulation ?? control.population ?? "").trim(),
    executionEvidenceText: String(preferredEntry?.evidenceTextSnapshot ?? control.executionEvidenceText ?? control.evidenceText ?? "").trim(),
    executionHistory: normalizedHistory,
  };
}

function normalizeControl(control) {
  const catalog = controlCatalog[control.id] ?? {};
  const performDept = normalizeUnitLabel(control.performDept ?? control.performer ?? control.ownerDept ?? "");
  const reviewDept = normalizeUnitLabel(control.reviewDept ?? control.reviewer ?? "");
  const normalizedHistory = getControlExecutionHistory(control);
  const activeExecution = getPreferredExecutionEntry(control, normalizedHistory[0] ?? null);
  const hasExecutionContentValue = normalizedHistory.some((entry) => hasExecutionEntryContent(entry));
  const normalizedSystems =
    uniqueSystems(control.targetSystems ?? catalog.targetSystems).length > 0
      ? uniqueSystems(control.targetSystems ?? catalog.targetSystems)
      : defaultSystemsByCategory[control.process ?? catalog.process] ?? [];
  const normalizedTitle = control.title?.replace(/\s+/g, " ").trim() ?? catalog.title ?? "";
  const normalizedActivity = convertLeadingNumberBulletsToCircled(buildActivityFromControl({
    ...control,
    ...catalog,
    title: normalizedTitle,
  }));
  const normalizedDescription = convertLeadingNumberBulletsToCircled(control.description ?? control.population ?? "");
  const normalizedEvidenceText = convertLeadingNumberBulletsToCircled(control.evidenceText ?? "");

  return {
    ...control,
    ...catalog,
    cycle: String(control.cycle ?? catalog.cycle ?? "").trim(),
    process: control.process?.trim() ?? catalog.process ?? "",
    subProcess: control.subProcess?.trim() ?? catalog.subProcess ?? control.process?.trim() ?? catalog.process ?? "",
    title: normalizedTitle,
    riskId: String(control.riskId ?? catalog.riskId ?? "").trim(),
    riskName: String(control.riskName ?? catalog.riskName ?? "").trim(),
    controlType: control.controlType ?? catalog.controlType ?? "예방",
    keyControl: control.keyControl ?? catalog.keyControl ?? "No",
    ownerDept: performDept || normalizeUnitLabel(catalog.performDept) || "",
    performer: performDept || normalizeUnitLabel(catalog.performDept) || "",
    reviewer: reviewDept || normalizeUnitLabel(catalog.reviewDept) || "",
    performDept: performDept || normalizeUnitLabel(catalog.performDept) || "",
    reviewDept: reviewDept || normalizeUnitLabel(catalog.reviewDept) || "",
    frequency: control.frequency ?? catalog.frequency,
    targetSystems: normalizedSystems,
    controlObjective: control.controlObjective ?? control.purpose ?? "",
    controlActivity: normalizedActivity,
    description: normalizedDescription,
    automationLevel: control.automationLevel ?? "",
    evidenceText: normalizedEvidenceText,
    testMethod: control.testMethod ?? "",
    policyReference: control.policyReference ?? "",
    deficiencyImpact: String(control.deficiencyImpact ?? catalog.deficiencyImpact ?? "").trim(),
    executionNote: String(activeExecution?.executionNote ?? control.executionNote ?? "").trim(),
    executionTestMethod: String(activeExecution?.testMethodSnapshot ?? control.executionTestMethod ?? control.testMethod ?? "").trim(),
    executionPopulation: String(activeExecution?.populationSnapshot ?? control.executionPopulation ?? control.population ?? "").trim(),
    executionEvidenceText: String(activeExecution?.evidenceTextSnapshot ?? control.executionEvidenceText ?? control.evidenceText ?? "").trim(),
    executionYear: String(activeExecution?.executionYear ?? control.executionYear ?? "").trim(),
    executionPeriod: String(activeExecution?.executionPeriod ?? control.executionPeriod ?? "").trim(),
    executionSubmitted:
      typeof activeExecution?.executionSubmitted === "boolean"
        ? activeExecution.executionSubmitted
        : typeof control.executionSubmitted === "boolean"
          ? control.executionSubmitted
          : hasExecutionSubmissionContent(control),
    reviewRequested:
      typeof activeExecution?.reviewRequested === "boolean"
        ? activeExecution.reviewRequested
        : typeof control.reviewRequested === "boolean"
          ? control.reviewRequested
          : false,
    executionAuthorName: String(activeExecution?.executionAuthorName ?? control.executionAuthorName ?? "").trim(),
    executionAuthorEmail: String(activeExecution?.executionAuthorEmail ?? control.executionAuthorEmail ?? "").trim().toLowerCase(),
    reviewAuthorName: String(activeExecution?.reviewAuthorName ?? control.reviewAuthorName ?? "").trim(),
    reviewAuthorEmail: String(activeExecution?.reviewAuthorEmail ?? control.reviewAuthorEmail ?? "").trim().toLowerCase(),
    reviewChecked: String(activeExecution?.reviewChecked ?? control.reviewChecked ?? "미검토").trim() || "미검토",
    reviewResult: String(activeExecution?.reviewResult ?? control.reviewResult ?? "").trim(),
    note: String(activeExecution?.note ?? control.note ?? "").trim(),
    status: String(activeExecution?.status ?? control.status ?? "점검 예정").trim() || "점검 예정",
    evidenceFiles: Array.isArray(activeExecution?.evidenceFiles) ? activeExecution.evidenceFiles : Array.isArray(control.evidenceFiles) ? control.evidenceFiles : [],
    evidenceStatus:
      String(activeExecution?.evidenceStatus ?? control.evidenceStatus ?? "").trim()
      || ((Array.isArray(activeExecution?.evidenceFiles) ? activeExecution.evidenceFiles : []).length > 0 ? "준비 완료" : "미수집"),
    executionHistory: normalizedHistory,
    attributes: Array.isArray(control.attributes) ? control.attributes : [],
    evidences: Array.isArray(control.evidences) ? control.evidences.map((item) => convertLeadingNumberBulletsToCircled(item)) : [],
    procedures: Array.isArray(control.procedures) ? control.procedures : [],
  };
}

function buildControlManagementSnapshot(control) {
  const catalog = controlCatalog[control.id] ?? {};
  const performDept = normalizeUnitLabel(control.performDept ?? control.performer ?? control.ownerDept ?? catalog.performDept ?? "");
  const reviewDept = normalizeUnitLabel(control.reviewDept ?? control.reviewer ?? catalog.reviewDept ?? "");
  const normalizedSystems =
    uniqueSystems(control.targetSystems ?? catalog.targetSystems).length > 0
      ? uniqueSystems(control.targetSystems ?? catalog.targetSystems)
      : defaultSystemsByCategory[control.process ?? catalog.process] ?? [];

  return {
    ...catalog,
    ...control,
    cycle: String(control.cycle ?? catalog.cycle ?? "").trim(),
    process: control.process?.trim() ?? catalog.process ?? "",
    subProcess: control.subProcess?.trim() ?? catalog.subProcess ?? control.process?.trim() ?? catalog.process ?? "",
    title: control.title?.replace(/\s+/g, " ").trim() ?? catalog.title ?? "",
    riskId: String(control.riskId ?? catalog.riskId ?? "").trim(),
    riskName: String(control.riskName ?? catalog.riskName ?? "").trim(),
    controlType: control.controlType ?? catalog.controlType ?? "예방",
    keyControl: control.keyControl ?? catalog.keyControl ?? "No",
    ownerDept: performDept || normalizeUnitLabel(catalog.performDept) || "",
    performer: performDept || normalizeUnitLabel(catalog.performDept) || "",
    performDept: performDept || normalizeUnitLabel(catalog.performDept) || "",
    reviewer: reviewDept || normalizeUnitLabel(catalog.reviewDept) || "",
    reviewDept: reviewDept || normalizeUnitLabel(catalog.reviewDept) || "",
    frequency: control.frequency ?? catalog.frequency ?? "",
    targetSystems: normalizedSystems,
    controlObjective: control.controlObjective ?? control.purpose ?? "",
    controlActivity: convertLeadingNumberBulletsToCircled(buildActivityFromControl({
      ...catalog,
      ...control,
      title: control.title?.replace(/\s+/g, " ").trim() ?? catalog.title ?? "",
    })),
    description: convertLeadingNumberBulletsToCircled(control.description ?? control.population ?? ""),
    automationLevel: control.automationLevel ?? "",
    evidenceText: convertLeadingNumberBulletsToCircled(control.evidenceText ?? ""),
    testMethod: control.testMethod ?? "",
    policyReference: control.policyReference ?? "",
    deficiencyImpact: String(control.deficiencyImpact ?? catalog.deficiencyImpact ?? "").trim(),
    population: control.population ?? "",
    evidences: Array.isArray(control.evidences) ? control.evidences.map((item) => convertLeadingNumberBulletsToCircled(item)) : [],
    procedures: Array.isArray(control.procedures) ? control.procedures : [],
  };
}

function hasExecutionContent(control) {
  return getControlExecutionHistory(control).some((entry) => hasExecutionEntryContent(entry));
}

function buildExecutionYearOptions(baseYear = new Date().getFullYear(), span = 5) {
  return Array.from({ length: span }, (_, index) => String(baseYear - index));
}

function buildExecutionPeriodOptions(frequency) {
  const normalized = String(frequency ?? "").trim().toLowerCase();

  if (normalized === "monthly" || normalized === "월별") {
    return Array.from({ length: 12 }, (_, index) => `${index + 1}월`);
  }
  if (normalized === "quarterly" || normalized === "분기별") {
    return ["1분기", "2분기", "3분기", "4분기"];
  }
  if (normalized === "half-bi-annual" || normalized === "반기별") {
    return ["상반기", "하반기"];
  }
  if (normalized === "annual" || normalized === "연 1회 + 변경 시") {
    return ["연간"];
  }
  if (normalized === "weekly" || normalized === "주별") {
    return Array.from({ length: 53 }, (_, index) => `${index + 1}주차`);
  }
  if (normalized === "daily" || normalized === "일별") {
    return Array.from({ length: 31 }, (_, index) => `${index + 1}일`);
  }
  if (normalized === "event driven" || normalized === "이벤트 발생 시") {
    return ["수시"];
  }
  return ["기타"];
}

async function uploadEvidenceFiles(controlId, files) {
  const localFiles = files.map((file) => ({
    name: file.name,
    size: file.size,
    uploadedAt: new Date().toISOString(),
    url: "",
  }));

  if (files.length === 0 || DATA_BACKEND === "local") {
    return {
      uploaded: false,
      files: localFiles,
    };
  }

  if (!GOOGLE_CLIENT_ID || !GOOGLE_DRIVE_FOLDER_ID) {
    throw new Error("google_drive_not_configured");
  }
  if (!window.google?.accounts?.oauth2) {
    await new Promise((resolve, reject) => {
      if (window.google?.accounts?.oauth2) {
        resolve();
        return;
      }

      const handleLoaded = () => {
        if (window.google?.accounts?.oauth2) {
          resolve();
          return;
        }
        reject(new Error("google_oauth_not_ready"));
      };
      const handleError = () => reject(new Error("google_oauth_script_load_failed"));

      const existingScript = document.querySelector('script[data-google-identity="true"]');
      if (existingScript) {
        existingScript.addEventListener("load", handleLoaded, { once: true });
        existingScript.addEventListener("error", handleError, { once: true });
        return;
      }

      const script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.defer = true;
      script.dataset.googleIdentity = "true";
      script.onload = handleLoaded;
      script.onerror = handleError;
      document.head.appendChild(script);
    });
  }
  if (!window.google?.accounts?.oauth2) {
    throw new Error("google_oauth_not_ready");
  }

  const requestAccessToken = (prompt = "") => new Promise((resolve, reject) => {
    const tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: "https://www.googleapis.com/auth/drive.file",
      callback: (tokenResponse) => {
        if (!tokenResponse?.access_token || tokenResponse?.error) {
          const code = String(tokenResponse?.error || "google_token_failed");
          const description = String(tokenResponse?.error_description || "").trim();
          reject(new Error(`google_token_failed|code=${code}|description=${description}`));
          return;
        }
        resolve(tokenResponse);
      },
    });
    tokenClient.requestAccessToken({ prompt });
  });

  let accessToken = "";
  const now = Date.now();
  if (googleDriveAccessTokenCache && googleDriveAccessTokenExpiresAt > now + 30_000) {
    accessToken = googleDriveAccessTokenCache;
  } else {
    try {
      const tokenResponse = await requestAccessToken("");
      accessToken = String(tokenResponse?.access_token ?? "");
      const expiresInSec = Number(tokenResponse?.expires_in ?? 0);
      googleDriveAccessTokenCache = accessToken;
      googleDriveAccessTokenExpiresAt = now + (Number.isFinite(expiresInSec) && expiresInSec > 0 ? expiresInSec * 1000 : 50 * 60 * 1000);
    } catch (error) {
      const normalized = String(error?.message ?? "").toLowerCase();
      if (normalized.includes("access_denied") || normalized.includes("interaction_required") || normalized.includes("consent_required")) {
        const tokenResponse = await requestAccessToken("consent");
        accessToken = String(tokenResponse?.access_token ?? "");
        const expiresInSec = Number(tokenResponse?.expires_in ?? 0);
        googleDriveAccessTokenCache = accessToken;
        googleDriveAccessTokenExpiresAt = Date.now() + (Number.isFinite(expiresInSec) && expiresInSec > 0 ? expiresInSec * 1000 : 50 * 60 * 1000);
      } else {
        throw error;
      }
    }
  }

  const uploadedFiles = [];
  for (const file of files) {
    const boundary = `itgc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const metadata = {
      name: `${controlId}_${Date.now()}_${file.name}`,
      parents: [GOOGLE_DRIVE_FOLDER_ID],
    };
    const body = new Blob([
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`,
      `--${boundary}\r\nContent-Type: ${file.type || "application/octet-stream"}\r\n\r\n`,
      file,
      `\r\n--${boundary}--`,
    ]);
    const response = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,webViewLink,webContentLink", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body,
    });
    if (!response.ok) {
      if (response.status === 401) {
        googleDriveAccessTokenCache = "";
        googleDriveAccessTokenExpiresAt = 0;
      }
      const errorBody = await response.json().catch(() => null);
      const reason = String(errorBody?.error?.errors?.[0]?.reason || errorBody?.error?.status || "unknown_reason");
      const message = String(errorBody?.error?.message || `status_${response.status}`);
      throw new Error(`google_drive_upload_failed|status=${response.status}|reason=${reason}|message=${message}`);
    }
    const result = await response.json();
    uploadedFiles.push({
      evidenceId: `EVD-${controlId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: result.name ?? file.name,
      mimeType: result.mimeType ?? (file.type || "application/octet-stream"),
      size: file.size,
      uploadedAt: new Date().toISOString(),
      url: result.webViewLink ?? result.webContentLink ?? "",
      driveFileId: result.id ?? "",
      provider: "google-drive",
    });
  }

  const result = { files: uploadedFiles };
  return {
    uploaded: true,
    files: Array.isArray(result.files) && result.files.length > 0
      ? result.files
      : localFiles,
  };
}

async function fetchRemoteIntegrationStatusByBackend() {
  return fetchSupabaseIntegrationStatus();
}

async function fetchRemoteWorkspaceByBackend() {
  return fetchSupabaseWorkspace();
}

async function syncRemoteWorkspaceByBackend(workspace) {
  return syncSupabaseWorkspace(workspace);
}

function createDefaultWorkflowSeeds(controls) {
  const baseDate = new Date("2026-03-25");

  return controls.flatMap((control, controlIndex) => {
    const steps = [
      {
        step: `${control.id} 모집단 및 기준 자료 확보`,
        assignee: control.performer,
        reviewer: control.reviewer,
        status: controlIndex % 5 === 0 ? "in_progress" : "todo",
        memo: control.population,
      },
      {
        step: `${control.id} 핵심 증빙 수집 및 검토`,
        assignee: control.performer,
        reviewer: control.reviewer,
        status: controlIndex % 7 === 0 ? "done" : "todo",
        memo: control.evidences.slice(0, 2).join(", "),
      },
      {
        step: `${control.id} 결과 검토 및 완료 보고`,
        assignee: control.performer,
        reviewer: control.reviewer,
        status: "todo",
        memo: `${control.frequency} 주기 기준 결과 정리`,
      },
    ];

    return steps.map((step, stepIndex) => {
      const dueDate = new Date(baseDate);
      dueDate.setDate(baseDate.getDate() + controlIndex + stepIndex);

      return {
        id: `WF-${String(controlIndex * 3 + stepIndex + 1).padStart(3, "0")}`,
        controlId: control.id,
        step: step.step,
        assignee: step.assignee,
        reviewer: step.reviewer,
        dueDate: dueDate.toISOString().slice(0, 10),
        status: step.status,
        memo: step.memo,
      };
    });
  });
}

defaultData.controls = defaultData.controls.map(normalizeControl);
defaultData.workflows = createDefaultWorkflowSeeds(defaultData.controls);

function mergeMissingWorkflows(controls, workflows) {
  const existingControlIds = new Set(workflows.map((workflow) => workflow.controlId));
  const missingControls = controls.filter((control) => !existingControlIds.has(control.id));

  if (missingControls.length === 0) {
    return workflows;
  }

  const seedOffset = workflows.length;
  const seeded = createDefaultWorkflowSeeds(missingControls).map((workflow, index) => ({
    ...workflow,
    id: `WF-${String(seedOffset + index + 1).padStart(3, "0")}`,
  }));

  return [...workflows, ...seeded];
}

function loadWorkspace() {
  if (HAS_REMOTE_BACKEND) {
    return applyWorkspaceDataCorrections({
      ...structuredClone(defaultData),
      loginDomains: parseDomainList(defaultData.loginDomains),
      people: structuredClone(defaultPeople),
      auditLogs: [],
    }).workspace;
  }

  const saved = window.localStorage.getItem(STORAGE_KEY);
  if (!saved) {
    return applyWorkspaceDataCorrections({
      ...structuredClone(defaultData),
      loginDomains: parseDomainList(defaultData.loginDomains),
      people: structuredClone(defaultPeople),
      auditLogs: [],
    }).workspace;
  }

  try {
    const parsed = JSON.parse(saved);
    if (parsed && Array.isArray(parsed.controls) && Array.isArray(parsed.workflows)) {
      const parsedLoginDomains = parseDomainList(parsed.loginDomains);
      return applyWorkspaceDataCorrections({
        ...parsed,
        controls: parsed.controls.map(normalizeControl),
        workflows: mergeMissingWorkflows(parsed.controls.map(normalizeControl), parsed.workflows),
        loginDomains: parsedLoginDomains.length > 0 ? parsedLoginDomains : parseDomainList(defaultData.loginDomains),
        people: normalizePeopleCollection(Array.isArray(parsed.people) ? parsed.people : structuredClone(defaultPeople)),
        auditLogs: Array.isArray(parsed.auditLogs) ? parsed.auditLogs : [],
      }).workspace;
    }
  } catch {}

  return applyWorkspaceDataCorrections({
    ...structuredClone(defaultData),
    loginDomains: parseDomainList(defaultData.loginDomains),
    people: structuredClone(defaultPeople),
    auditLogs: [],
  }).workspace;
}

function persistWorkspace(workspace) {
  if (HAS_REMOTE_BACKEND) {
    return;
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(workspace));
}

function normalizeImportedWorkspace(source) {
  const parsed = source?.workspace ?? source;
  if (!parsed || !Array.isArray(parsed.controls) || !Array.isArray(parsed.workflows)) {
    throw new Error("invalid_workspace_backup");
  }

  const normalizedControls = parsed.controls.map(normalizeControl);
  return applyWorkspaceDataCorrections({
    ...parsed,
    controls: normalizedControls,
    workflows: mergeMissingWorkflows(normalizedControls, Array.isArray(parsed.workflows) ? parsed.workflows : []),
    loginDomains: parseDomainList(parsed.loginDomains).length > 0 ? parseDomainList(parsed.loginDomains) : parseDomainList(defaultData.loginDomains),
    people: normalizePeopleCollection(Array.isArray(parsed.people) ? parsed.people : structuredClone(defaultPeople)),
    auditLogs: Array.isArray(parsed.auditLogs) ? parsed.auditLogs : [],
  }).workspace;
}

function applyWorkspaceDataCorrections(workspace) {
  if (!workspace || !Array.isArray(workspace.controls)) {
    return { workspace, changed: false };
  }

  let changed = false;
  const nextControls = workspace.controls.map((control) => {
    const history = getControlExecutionHistory(control);
    if (history.length === 0) {
      return control;
    }

    let nextHistory = history;
    let historyChanged = false;

    if (control.id === "C-IT-Cyber-02") {
      nextHistory = nextHistory.map((entry, index) => {
        const forcedCreatedAt = `2000-01-01T00:00:${String(index).padStart(2, "0")}.000Z`;
        if (String(entry?.createdAt ?? "").trim() === forcedCreatedAt) {
          return entry;
        }
        historyChanged = true;
        return {
          ...entry,
          createdAt: forcedCreatedAt,
          updatedAt: String(entry?.updatedAt ?? "").trim() || forcedCreatedAt,
        };
      });
    }

    if (control.id === "C-IT-Cyber-04") {
      nextHistory = nextHistory.map((entry) => {
        const isTargetPeriod =
          String(entry?.executionYear ?? "").trim() === "2026"
          && ["1월", "2월", "3월"].includes(String(entry?.executionPeriod ?? "").trim());
        const completedReview = String(entry?.reviewChecked ?? "").trim() === "검토 완료";
        const targetReviewNote = "공격 시도 이벤트에 대한 조치 내역 및 위협 보고서 검토 결과 특이사항 없음.";
        if (
          !isTargetPeriod
          || !completedReview
        ) {
          return entry;
        }
        const sameAuthor =
          String(entry?.executionAuthorName ?? "").trim() === "이치현"
          && !String(entry?.executionAuthorEmail ?? "").trim();
        const sameNote = String(entry?.note ?? "").trim() === targetReviewNote;
        if (sameAuthor && sameNote) {
          return entry;
        }
        historyChanged = true;
        return {
          ...entry,
          executionAuthorName: "이치현",
          executionAuthorEmail: "",
          note: targetReviewNote,
        };
      });
    }

    if (!historyChanged) {
      return control;
    }

    changed = true;
    return mergeExecutionHistoryIntoControl(control, nextHistory);
  });

  if (!changed) {
    return { workspace, changed: false };
  }

  return {
    workspace: {
      ...workspace,
      controls: nextControls,
    },
    changed: true,
  };
}

function statusClass(status) {
  if (status === "정상" || status === "점검 완료") return "status-normal";
  if (status === "점검 중" || status === "점검 예정") return "status-warning";
  return "status-danger";
}

function isCompletedStatus(status) {
  return status === "정상" || status === "점검 완료";
}

function deriveAssignmentStatus(executionNote, reviewChecked) {
  if (reviewChecked === "검토 완료") return "점검 완료";
  if (executionNote.trim()) return "점검 중";
  return "점검 예정";
}

function controlProgressValue(control, targetYear = "") {
  const targets = {
    Daily: 365,
    Weekly: 52,
    Monthly: 12,
    Quarterly: 4,
    "Half-Bi-annual": 2,
    Annual: 1,
    "Event Driven": 1,
    Other: 1,
    일별: 365,
    주별: 52,
    월별: 12,
    분기별: 4,
    반기별: 2,
    "연 1회 + 변경 시": 1,
    "이벤트 발생 시": 1,
  };

  const target = targets[control.frequency];
  if (!target) {
    return null;
  }

  const history = getControlExecutionHistory(control);
  const completedCount = history.filter((entry) => {
    if (!hasExecutionEntryContent(entry)) {
      return false;
    }
    if (String(entry?.reviewChecked ?? "미검토").trim() !== "검토 완료") {
      return false;
    }
    if (String(targetYear ?? "").trim()) {
      return String(entry?.executionYear ?? "").trim() === String(targetYear).trim();
    }
    return true;
  }).length;

  return Math.min(100, Math.round((completedCount / target) * 100));
}

function matchesDashboardControlStatus(status, focus) {
  if (focus === "전체") {
    return true;
  }
  if (focus === "완료") {
    return status === "점검 완료" || status === "정상";
  }
  if (focus === "진행 중") {
    return status === "점검 중";
  }
  if (focus === "예정") {
    return status === "점검 예정";
  }
  return true;
}

function annualPlannedCountByFrequency(frequency) {
  const normalized = String(frequency ?? "").trim();
  if (normalized === "Monthly" || normalized === "월별") return 12;
  if (normalized === "Quarterly" || normalized === "분기별") return 4;
  if (normalized === "Half-Bi-annual" || normalized === "반기별") return 2;
  if (normalized === "Annual" || normalized === "연 1회 + 변경 시" || normalized === "연간") return 1;
  return 0;
}

const frequencyOrder = [
  "Daily",
  "Weekly",
  "Monthly",
  "Quarterly",
  "Half-Bi-annual",
  "Other",
  "Annual",
  "Event Driven",
  "일별",
  "주별",
  "월별",
  "분기별",
  "반기별",
  "연 1회 + 변경 시",
  "이벤트 발생 시",
];

const frequencyLabelMap = {
  Daily: "일별",
  Weekly: "주별",
  Monthly: "월별",
  Quarterly: "분기별",
  "Half-Bi-annual": "반기별",
  Annual: "연 1회",
  "Event Driven": "이벤트 발생 시",
  Other: "필요 시",
  일별: "일별",
  주별: "주별",
  월별: "월별",
  분기별: "분기별",
  반기별: "반기별",
  "연 1회 + 변경 시": "연 1회",
  "이벤트 발생 시": "이벤트 발생 시",
  수시: "이벤트 발생 시",
};

function scheduledMonthsByFrequency(frequency) {
  const normalized = String(frequency ?? "").trim().toLowerCase();

  if (normalized === "quarterly" || normalized === "분기별") {
    return [3, 6, 9, 12];
  }
  if (normalized === "half-bi-annual" || normalized === "반기별") {
    return [6, 12];
  }
  if (normalized === "annual" || normalized === "연 1회 + 변경 시") {
    return [12];
  }
  if (
    normalized === "monthly"
    || normalized === "월별"
    || normalized === "weekly"
    || normalized === "주별"
    || normalized === "daily"
    || normalized === "일별"
  ) {
    return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  }

  return [];
}

function overduePeriodLabelsForYear(frequency, year, currentDate = new Date()) {
  const normalized = String(frequency ?? "").trim().toLowerCase();
  const targetYear = Number(year);
  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth() + 1;

  if (!Number.isFinite(targetYear)) {
    return [];
  }
  if (targetYear > currentYear) {
    return [];
  }

  if (normalized === "monthly" || normalized === "월별") {
    const maxMonth = targetYear < currentYear ? 12 : currentMonth;
    return Array.from({ length: maxMonth }, (_, index) => `${index + 1}월`);
  }
  if (normalized === "quarterly" || normalized === "분기별") {
    const quarterLabels = ["1분기", "2분기", "3분기", "4분기"];
    const maxQuarter = targetYear < currentYear ? 4 : Math.floor(currentMonth / 3);
    return quarterLabels.slice(0, maxQuarter);
  }
  if (normalized === "half-bi-annual" || normalized === "반기별") {
    if (targetYear < currentYear) {
      return ["상반기", "하반기"];
    }
    if (currentMonth >= 12) {
      return ["상반기", "하반기"];
    }
    if (currentMonth >= 6) {
      return ["상반기"];
    }
    return [];
  }
  if (normalized === "annual" || normalized === "연 1회 + 변경 시") {
    return targetYear < currentYear || currentMonth >= 12 ? ["연간"] : [];
  }

  return [];
}

function isDashboardDelayedControl(control, year, currentDate = new Date()) {
  const normalizedStatus = deriveAssignmentStatus(control?.executionNote ?? "", control?.reviewChecked ?? "미검토");
  if (isCompletedStatus(normalizedStatus)) {
    return false;
  }
  return overduePeriodLabelsForYear(control?.frequency, year, currentDate).length > 0;
}

const controlGroupOrder = ["PWC", "APD", "PC", "CO", "PD", "CS"];

function toDashboardAnchor(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function evidenceClass(status) {
  if (status === "준비 완료") return "status-normal";
  if (status === "수집 중") return "status-warning";
  return "status-danger";
}

function evidenceBadgeLabel(control, mode = "default") {
  const evidenceFiles = Array.isArray(control?.evidenceFiles) ? control.evidenceFiles : [];
  if (evidenceFiles.length === 0 || String(control?.evidenceStatus ?? "").trim() === "미수집") {
    return "증적없음";
  }
  if (mode === "review") {
    return "증적있음";
  }
  return control?.evidenceStatus ?? "증적없음";
}

function workflowClass(status) {
  if (status === "done") return "status-normal";
  if (status === "in_progress") return "status-warning";
  return "status-danger";
}

function workflowLabel(status) {
  if (status === "done") return "완료";
  if (status === "in_progress") return "진행 중";
  return "대기";
}

function createDeleteVerificationCode(length = 6) {
  return Math.random().toString(36).slice(2, 2 + length).toUpperCase();
}

function buildCondensedPagination(totalPages, currentPage, innerSlots = 8) {
  if (totalPages <= 10) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  let start = Math.max(2, currentPage - 3);
  let end = Math.min(totalPages - 1, currentPage + 3);

  while (end - start + 1 < innerSlots) {
    if (start > 2) {
      start -= 1;
      continue;
    }
    if (end < totalPages - 1) {
      end += 1;
      continue;
    }
    break;
  }

  const pages = [1];
  if (start > 2) {
    pages.push("ellipsis-left");
  }
  for (let page = start; page <= end; page += 1) {
    pages.push(page);
  }
  if (end < totalPages - 1) {
    pages.push("ellipsis-right");
  }
  pages.push(totalPages);
  return pages;
}

function auditActionLabel(action) {
  const labels = {
    LOGIN_SUCCESS: "로그인",
    LOGOUT: "로그아웃",
    MEMBER_JOINED: "회원 가입",
    MEMBER_UPDATED: "회원 정보 수정",
    ROLE_CHANGED: "권한 변경",
    MENU_OPEN: "메뉴 열람",
    CONTROL_VIEWED: "통제 상세 조회",
    CONTROL_EDIT_VIEWED: "통제 등록/수정 조회",
    EXECUTION_VIEWED: "통제 운영 조회",
    REVIEW_VIEWED: "통제 운영 검토 조회",
    CONTROL_CREATED: "통제 등록",
    CONTROL_UPDATED: "통제 수정",
    CONTROL_DELETED: "통제 삭제",
    EXECUTION_SAVED: "통제 운영 저장",
    EXECUTION_RECALLED: "통제 운영 회수",
    REVIEW_SAVED: "검토 저장",
    REVIEW_REQUESTED: "검토 요청",
    REVIEW_COMPLETED: "승인 완료",
    REVIEW_RECALLED: "검토 회수",
    REPORT_VIEWED: "리포트 조회",
    REPORT_HTML_EXPORTED: "HTML 리포트 출력",
    REPORT_PDF_PRINTED: "PDF 리포트 출력",
  };

  return labels[action] ?? "기타";
}

const REQUIRED_CONTROL_CHANGE_ALERT_ACTIONS = [
  "REVIEW_REQUESTED",
  "REVIEW_COMPLETED",
];

const CONTROL_CHANGE_ALERT_ACTIONS = new Set([
  ...REQUIRED_CONTROL_CHANGE_ALERT_ACTIONS,
  ...GOOGLE_CHAT_ALERT_ACTIONS_ENV
    .split(/[,\n;\s]+/)
    .map((token) => token.trim().toUpperCase())
    .filter(Boolean),
]);

const CONTROL_CHANGE_ALERT_ACTIONS_ALL = new Set([
  "CONTROL_CREATED",
  "CONTROL_UPDATED",
  "CONTROL_DELETED",
  "EXECUTION_SAVED",
  "EXECUTION_RECALLED",
  "REVIEW_SAVED",
  "REVIEW_REQUESTED",
  "REVIEW_COMPLETED",
  "REVIEW_RECALLED",
]);

function sendGoogleChatControlAlert({ action, target, detail, actorName, actorEmail, createdAt, systemUrl }) {
  if (IS_LOCAL_RUNTIME) {
    return;
  }
  if (!GOOGLE_CHAT_WEBHOOK_URL || !CONTROL_CHANGE_ALERT_ACTIONS_ALL.has(action) || !CONTROL_CHANGE_ALERT_ACTIONS.has(action)) {
    return;
  }

  const dedupKey = [action, target || "-", detail || "-", actorEmail || "-"].join("|");
  const now = Date.now();
  const lastSentAt = googleChatAlertDedupCache.get(dedupKey) ?? 0;
  if (GOOGLE_CHAT_DEDUP_WINDOW_MS > 0 && now - lastSentAt < GOOGLE_CHAT_DEDUP_WINDOW_MS) {
    return;
  }
  googleChatAlertDedupCache.set(dedupKey, now);

  const host = String(systemUrl ?? "").trim() || (typeof window !== "undefined" ? window.location.origin : "");
  const alertTitle = action === "REVIEW_REQUESTED"
    ? "ITGC 통제 검토 요청 알림"
    : action === "REVIEW_COMPLETED"
      ? "ITGC 통제 검토 완료 알림"
      : "ITGC 통제 관리 변경 알림";
  const lines = [
    alertTitle,
    `- 액션: ${auditActionLabel(action)} (${action})`,
    `- 통제 ID/대상: ${target || "-"}`,
    `- 내용: ${detail || "-"}`,
    `- 작업자: ${actorName || "-"} (${actorEmail || "-"})`,
    `- 시각: ${createdAt || new Date().toISOString()}`,
    host ? `- 시스템: ${host}` : "",
  ].filter(Boolean);
  const payload = JSON.stringify({
    text: lines.join("\n"),
  });

  fetch(GOOGLE_CHAT_WEBHOOK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=UTF-8",
    },
    body: payload,
    keepalive: true,
  })
    .then((response) => {
      if (!response.ok) {
        throw new Error(`google_chat_http_${response.status}`);
      }
    })
    .catch((error) => {
      try {
        if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
          const sent = navigator.sendBeacon(
            GOOGLE_CHAT_WEBHOOK_URL,
            new Blob([payload], { type: "application/json; charset=UTF-8" }),
          );
          if (sent) {
            return;
          }
        }
      } catch {}

      fetch(GOOGLE_CHAT_WEBHOOK_URL, {
        method: "POST",
        mode: "no-cors",
        body: payload,
        keepalive: true,
      }).catch((fallbackError) => {
        console.error("Google Chat alert failed:", error, fallbackError);
        googleChatAlertDedupCache.delete(dedupKey);
      });
    });
}

function DashboardIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="3" width="8" height="8" rx="2" fill="currentColor" />
      <rect x="13" y="3" width="8" height="5" rx="2" fill="currentColor" opacity="0.72" />
      <rect x="13" y="10" width="8" height="11" rx="2" fill="currentColor" />
      <rect x="3" y="13" width="8" height="8" rx="2" fill="currentColor" opacity="0.72" />
    </svg>
  );
}

function ControlIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="4" y="4" width="16" height="16" rx="3" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8 9h8M8 12h8M8 15h5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function PeopleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="9" cy="9" r="3" fill="currentColor" />
      <circle cx="17" cy="10" r="2.5" fill="currentColor" opacity="0.72" />
      <path d="M4.5 18a4.5 4.5 0 0 1 9 0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M13.5 18a3.6 3.6 0 0 1 7 0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" opacity="0.72" />
    </svg>
  );
}

function AuditIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 4h8l3 3v13H7a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M15 4v4h4M9 11h6M9 15h6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function ShieldCheckIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3 5 6v5c0 5 3.4 8.5 7 10 3.6-1.5 7-5 7-10V6l-7-3Z" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="m9.2 12.3 1.9 1.9 3.8-4.1" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function FileStackIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 4h8l3 3v11a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M16 4v4h4M9 12h6M9 16h6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function OwnerIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="8" r="3.2" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M5 19a7 7 0 0 1 14 0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function CheckBadgeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="m8.5 12.2 2.2 2.2 4.8-5.1" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 4 3.5 19h17L12 4Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M12 9v4.5M12 17h.01" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function AutoFitTitle({ children, className = "" }) {
  const textRef = useRef(null);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const node = textRef.current;
    if (!node) {
      return undefined;
    }

    let frameId = 0;

    const fit = () => {
      cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(() => {
        const element = textRef.current;
        if (!element) {
          return;
        }

        const computedStyle = window.getComputedStyle(element);
        const baseFontSize = Number.parseFloat(computedStyle.fontSize) || 12;
        const minFontSize = Math.max(11, baseFontSize * 0.84);
        let nextLetterSpacing = 0;
        let nextFontSize = baseFontSize;

        element.style.letterSpacing = "0em";
        element.style.fontSize = `${baseFontSize}px`;

        while (element.scrollWidth > element.clientWidth + 1 && nextLetterSpacing > -0.12) {
          nextLetterSpacing -= 0.01;
          element.style.letterSpacing = `${nextLetterSpacing}em`;
        }

        while (element.scrollWidth > element.clientWidth + 1 && nextFontSize > minFontSize) {
          nextFontSize -= 0.2;
          element.style.fontSize = `${nextFontSize}px`;
        }
      });
    };

    fit();

    const resizeObserver = new ResizeObserver(() => fit());
    resizeObserver.observe(node);
    if (node.parentElement) {
      resizeObserver.observe(node.parentElement);
    }
    window.addEventListener("resize", fit);

    return () => {
      cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      window.removeEventListener("resize", fit);
    };
  }, [children]);

  return (
    <p ref={textRef} className={className ? `auto-fit-title ${className}` : "auto-fit-title"}>
      {children}
    </p>
  );
}

function integrationClass(status) {
  if (status === "연결됨") return "status-normal";
  if (status === "미확인") return "status-warning";
  return "status-danger";
}

function nextWorkflowStatus(status) {
  const index = implementationStatusOrder.indexOf(status);
  return implementationStatusOrder[Math.min(index + 1, implementationStatusOrder.length - 1)];
}

function normalizeReviewDecisionLabel(value) {
  return value === "개선조치" ? "개선 필요" : (value || "양호");
}

function formatDate(value) {
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

function formatSeoulDateTime(value) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(value)).replace(" ", " ");
}

function progressForControl(controlId, workflows) {
  const related = workflows.filter((workflow) => workflow.controlId === controlId);
  const done = related.filter((workflow) => workflow.status === "done").length;
  return {
    total: related.length,
    done,
    rate: related.length === 0 ? 0 : Math.round((done / related.length) * 100),
  };
}

function summarizeByProcess(controls, workflows) {
  const map = new Map();

  for (const control of controls) {
    const hasExecution = String(control.executionNote ?? "").trim().length > 0;
    const isDone = control.reviewChecked === "검토 완료";
    const progressPoint = isDone ? 1 : hasExecution ? 0.5 : 0;
    const current = map.get(control.process) ?? {
      process: control.process,
      controls: 0,
      pending: 0,
      done: 0,
      executionTotal: 0,
      executionProgressPoint: 0,
      reviewers: new Set(),
    };
    current.controls += 1;
    current.pending += isDone ? 0 : 1;
    current.done += isDone ? 1 : 0;
    current.executionTotal += 1;
    current.executionProgressPoint += progressPoint;
    current.reviewers.add(control.reviewer);
    map.set(control.process, current);
  }

  return [...map.values()].map((item) => ({
    ...item,
    progressRate: item.executionTotal === 0 ? 0 : Math.round((item.executionProgressPoint / item.executionTotal) * 100),
    reviewers: [...item.reviewers],
  }));
}

function renderSystemChips(systems) {
  if (!systems || systems.length === 0) {
    return <span className="empty-text">미지정</span>;
  }

  return (
    <div className="target-systems-text">{systems.join(", ")}</div>
  );
}

function preserveDisplayLineBreaks(value) {
  const text = String(value ?? "");
  if (!text) {
    return "";
  }

  return text
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/([^\n])\s(?=\d+\.\s)/g, "$1\n");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function decodeJwtPayload(token) {
  try {
    const payload = token.split(".")[1];
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const decoded = atob(normalized);
    const escaped = decoded
      .split("")
      .map((char) => `%${`00${char.charCodeAt(0).toString(16)}`.slice(-2)}`)
      .join("");
    return JSON.parse(decodeURIComponent(escaped));
  } catch {
    return null;
  }
}

function normalizeAccessRole(role) {
  const normalized = String(role ?? "").trim().toLowerCase();
  if (normalized === "admin") {
    return "admin";
  }
  if (normalized === "reviewer" || normalized === "editor") {
    return "reviewer";
  }
  return "viewer";
}

function accessRoleClassName(role) {
  const normalized = normalizeAccessRole(role);
  return `access-role access-role-${normalized}`;
}

function buildMemberChangeDetail(previousPerson, nextEntry) {
  const changes = [];
  const previousUnit = String(previousPerson?.unit ?? "-").trim() || "-";
  const nextUnit = String(nextEntry?.unit ?? "미지정").trim() || "미지정";
  const previousRole = normalizeAccessRole(previousPerson?.accessRole ?? "-");
  const nextRole = normalizeAccessRole(nextEntry?.accessRole ?? "viewer");

  if (!previousPerson || previousUnit !== nextUnit) {
    changes.push(`유닛:${previousUnit} -> ${nextUnit}`);
  }
  if (!previousPerson || previousRole !== nextRole) {
    changes.push(`권한:${previousRole} -> ${nextRole}`);
  }

  return `${nextEntry?.name ?? "회원"} · ${changes.join(", ")}`;
}

function isAllowedEmailBySet(email, domainSet) {
  const normalized = String(email ?? "").trim().toLowerCase();
  if (!normalized || !normalized.includes("@")) {
    return false;
  }
  if (!domainSet || domainSet.size === 0) {
    return false;
  }
  const domain = normalized.split("@")[1] ?? "";
  return domainSet.has(domain);
}

function parseEmailList(raw) {
  const source = Array.isArray(raw) ? raw.join(",") : String(raw ?? "");
  return [...new Set(
    source
      .split(/[,\n;\s]+/)
      .map((token) => token.trim().toLowerCase())
      .filter((token) => token.includes("@")),
  )];
}

function parseDomainList(raw) {
  const source = Array.isArray(raw) ? raw.join(",") : String(raw ?? "");
  return source
    .split(/[,\n;\s]+/)
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean)
    .map((token) => {
      const normalized = token.includes("@") ? token.split("@").pop() ?? "" : token;
      return normalized.replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^\./, "");
    })
    .filter(Boolean);
}

function loadDeletedMemberEmails() {
  try {
    const saved = window.localStorage.getItem(DELETED_MEMBER_EMAILS_STORAGE_KEY);
    if (!saved) {
      return [];
    }
    return parseEmailList(JSON.parse(saved));
  } catch {
    return [];
  }
}

function loadLoginDomains() {
  try {
    const savedWorkspace = window.localStorage.getItem(STORAGE_KEY);
    if (savedWorkspace) {
      const parsedWorkspace = JSON.parse(savedWorkspace);
      const parsedFromWorkspace = parseDomainList(parsedWorkspace?.loginDomains);
      if (parsedFromWorkspace.length > 0) {
        return parsedFromWorkspace;
      }
    }
  } catch {}

  try {
    const saved = window.localStorage.getItem(LOGIN_DOMAIN_STORAGE_KEY);
    if (saved) {
      const parsed = parseDomainList(saved);
      if (parsed.length > 0) {
        return parsed;
      }
    }
  } catch {}

  return ALLOWED_EMAIL_DOMAINS;
}

function createMemberId() {
  return `MBR-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function accessRoleRank(role) {
  const normalized = normalizeAccessRole(role);
  if (normalized === "admin") {
    return 3;
  }
  if (normalized === "reviewer") {
    return 2;
  }
  return 1;
}

function pickPreferredText(currentValue, incomingValue) {
  const current = String(currentValue ?? "").trim();
  const incoming = String(incomingValue ?? "").trim();
  const currentMeaningful = current && current !== "미지정";
  const incomingMeaningful = incoming && incoming !== "미지정";

  if (incomingMeaningful && !currentMeaningful) {
    return incoming;
  }
  if (!current && incoming) {
    return incoming;
  }
  return current || incoming;
}

function isHandleLikeMemberName(name, email = "") {
  const normalizedName = String(name ?? "").trim().toLowerCase();
  const normalizedEmail = String(email ?? "").trim().toLowerCase();
  if (!normalizedName) {
    return true;
  }
  const localPart = normalizedEmail.includes("@") ? normalizedEmail.split("@")[0] : normalizedEmail;
  if (localPart && normalizedName === localPart) {
    return true;
  }
  return /^[a-z0-9._-]+$/.test(normalizedName);
}

function pickPreferredMemberName(currentValue, incomingValue, email = "") {
  const current = String(currentValue ?? "").trim();
  const incoming = String(incomingValue ?? "").trim();
  const currentMeaningful = current && current !== "미지정";
  const incomingMeaningful = incoming && incoming !== "미지정";

  if (!currentMeaningful) {
    return incoming || current;
  }
  if (!incomingMeaningful) {
    return current;
  }
  if (isHandleLikeMemberName(incoming, email) && !isHandleLikeMemberName(current, email)) {
    return current;
  }
  if (!isHandleLikeMemberName(incoming, email) && isHandleLikeMemberName(current, email)) {
    return incoming;
  }
  return current || incoming;
}

function mergePeopleByIdOrEmail(primary = [], secondary = []) {
  const byId = new Map();
  const byEmail = new Map();
  const merged = [];

  [...primary, ...secondary].forEach((person) => {
    if (!person) {
      return;
    }
    const id = String(person.id ?? "").trim();
    const email = String(person.email ?? "").trim().toLowerCase();

    let target = null;
    if (id && byId.has(id)) {
      target = byId.get(id);
    } else if (email && byEmail.has(email)) {
      target = byEmail.get(email);
    }

    if (!target) {
      const next = {
        ...person,
        id: id || createMemberId(),
        email,
      };
      merged.push(next);
      byId.set(next.id, next);
      if (email) {
        byEmail.set(email, next);
      }
      return;
    }

    const nextAccessRole = accessRoleRank(person.accessRole) > accessRoleRank(target.accessRole)
      ? normalizeAccessRole(person.accessRole)
      : normalizeAccessRole(target.accessRole);
    const nextUnit = pickPreferredText(target.unit, person.unit) || "미지정";
    const nextName = pickPreferredMemberName(target.name, person.name, target.email || email);
    const nextRole = pickPreferredText(target.role, person.role) || "both";

    Object.assign(target, {
      ...target,
      ...person,
      id: target.id || id || createMemberId(),
      email: target.email || email,
      name: nextName,
      role: nextRole,
      unit: nextUnit,
      accessRole: nextAccessRole,
    });

    if (target.id) {
      byId.set(target.id, target);
    }
    if (target.email) {
      byEmail.set(target.email, target);
    }
  });

  return merged;
}

function normalizePeopleCollection(people = []) {
  return mergePeopleByIdOrEmail(
    (Array.isArray(people) ? people : []).map((person) => ({
      ...person,
      id: String(person?.id ?? "").trim() || createMemberId(),
      email: String(person?.email ?? "").trim().toLowerCase(),
      name: String(person?.name ?? "").trim(),
      role: String(person?.role ?? "").trim() || "both",
      unit: String(person?.unit ?? person?.team ?? "").trim() || "미지정",
      accessRole: normalizeAccessRole(person?.accessRole),
    })),
  );
}

function mergeAuditLogs(primary = [], secondary = [], maxItems = AUDIT_LOG_MAX_ITEMS) {
  const merged = [...primary, ...secondary];
  const seen = new Set();
  const unique = [];

  merged.forEach((log) => {
    const id = String(log?.id ?? "").trim();
    if (!id || seen.has(id)) {
      return;
    }
    seen.add(id);
    unique.push(log);
  });

  unique.sort((a, b) => String(b?.createdAtTs ?? "").localeCompare(String(a?.createdAtTs ?? "")));
  return unique.slice(0, maxItems);
}

function loadAuthSession() {
  try {
    const saved = window.localStorage.getItem(AUTH_STORAGE_KEY);
    if (!saved) {
      return null;
    }

    const parsed = JSON.parse(saved);
    if (!parsed?.email) {
      window.localStorage.removeItem(AUTH_STORAGE_KEY);
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

function loadPersistedCurrentView() {
  try {
    const saved = window.localStorage.getItem(CURRENT_VIEW_STORAGE_KEY);
    if (saved && VIEW_KEYS.includes(saved)) {
      return saved;
    }
  } catch {}
  return "dashboard";
}

function loadPersistedWorkbenchTab() {
  try {
    const saved = window.localStorage.getItem(WORKBENCH_TAB_STORAGE_KEY);
    if (saved && WORKBENCH_TAB_KEYS.includes(saved)) {
      return saved;
    }
  } catch {}
  return "register";
}

function loadPersistedUiTheme() {
  try {
    const saved = window.localStorage.getItem(UI_THEME_STORAGE_KEY);
    if (saved && UI_THEME_VALUES.has(saved)) {
      return saved;
    }
  } catch {}
  return "classic";
}

function loadNavigationStateFromUrl() {
  if (typeof window === "undefined") {
    return {};
  }
  try {
    const url = new URL(window.location.href);
    const view = url.searchParams.get("view");
    const tab = url.searchParams.get("tab");
    return {
      currentView: view && VIEW_KEYS.includes(view) ? view : "",
      workbenchTab: tab && WORKBENCH_TAB_KEYS.includes(tab) ? tab : "",
      selectedControlId: url.searchParams.get("controlId") ?? "",
      selectedCompletedExecutionKey: url.searchParams.get("completedKey") ?? "",
      selectedReviewExecutionKey: url.searchParams.get("reviewKey") ?? "",
    };
  } catch {
    return {};
  }
}

function buildAppNavigationUrl({
  currentView,
  workbenchTab,
  selectedControlId,
  selectedCompletedExecutionKey,
  selectedReviewExecutionKey,
}) {
  if (typeof window === "undefined") {
    return "";
  }
  const url = new URL(window.location.href);
  url.searchParams.delete("view");
  url.searchParams.delete("tab");
  url.searchParams.delete("controlId");
  url.searchParams.delete("completedKey");
  url.searchParams.delete("reviewKey");

  if (currentView && VIEW_KEYS.includes(currentView)) {
    url.searchParams.set("view", currentView);
  }
  if (currentView === "control-workbench" && workbenchTab && WORKBENCH_TAB_KEYS.includes(workbenchTab)) {
    url.searchParams.set("tab", workbenchTab);
  }
  if (selectedControlId) {
    url.searchParams.set("controlId", selectedControlId);
  }
  if (selectedCompletedExecutionKey) {
    url.searchParams.set("completedKey", selectedCompletedExecutionKey);
  }
  if (selectedReviewExecutionKey) {
    url.searchParams.set("reviewKey", selectedReviewExecutionKey);
  }
  return url.toString();
}

export default function App() {
  const initialNavigationState = loadNavigationStateFromUrl();
  const [authUser, setAuthUser] = useState(() => loadAuthSession());
  const [authError, setAuthError] = useState("");
  const [devLoginEmail, setDevLoginEmail] = useState(DEFAULT_DEV_LOGIN_EMAIL);
  const [loginDomains, setLoginDomains] = useState(() => loadLoginDomains());
  const [loginDomainDraft, setLoginDomainDraft] = useState(() => loadLoginDomains().join(", "));
  const [deletedMemberEmails, setDeletedMemberEmails] = useState(() => loadDeletedMemberEmails());
  const [workspace, setWorkspace] = useState(() => loadWorkspace());
  const workspaceRef = useRef(workspace);
  const workspaceCorrectionAppliedRef = useRef(false);
  const [currentView, setCurrentView] = useState(() => initialNavigationState.currentView || loadPersistedCurrentView());
  const [selectedControlId, setSelectedControlId] = useState(() => initialNavigationState.selectedControlId || "");
  const [selectedCompletedExecutionKey, setSelectedCompletedExecutionKey] = useState(() => initialNavigationState.selectedCompletedExecutionKey || "");
  const [selectedReviewExecutionKey, setSelectedReviewExecutionKey] = useState(() => initialNavigationState.selectedReviewExecutionKey || "");
  const [selectedPerformedExecutionKey, setSelectedPerformedExecutionKey] = useState("");
  const [processFilter, setProcessFilter] = useState("전체");
  const [controlFrequencyFilter, setControlFrequencyFilter] = useState("전체");
  const [controlIdFilter, setControlIdFilter] = useState("전체");
  const [controlUnitFilter, setControlUnitFilter] = useState("전체");
  const [controlExecutionFilter, setControlExecutionFilter] = useState("전체");
  const [reviewUnitFilter, setReviewUnitFilter] = useState("전체");
  const [controlListPage, setControlListPage] = useState(1);
  const [controlPanelMode, setControlPanelMode] = useState("create");
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [registrationForm, setRegistrationForm] = useState(() => {
    try {
      const saved = window.localStorage.getItem(REGISTRATION_DRAFT_KEY);
      return saved ? { ...initialRegistrationForm, ...JSON.parse(saved) } : initialRegistrationForm;
    } catch {
      return initialRegistrationForm;
    }
  });
  const [registrationCategoryFilter, setRegistrationCategoryFilter] = useState("전체");
  const [registrationListPage, setRegistrationListPage] = useState(1);
  const [registrationSelectedControlId, setRegistrationSelectedControlId] = useState("");
  const [roleAssignmentControlId, setRoleAssignmentControlId] = useState("");
  const [evidenceInputCount, setEvidenceInputCount] = useState(1);
  const [assignmentExecutionNote, setAssignmentExecutionNote] = useState("");
  const [assignmentExecutionYear, setAssignmentExecutionYear] = useState("");
  const [assignmentExecutionPeriod, setAssignmentExecutionPeriod] = useState("");
  const [assignmentReviewChecked, setAssignmentReviewChecked] = useState("미검토");
  const [assignmentPendingEvidenceCount, setAssignmentPendingEvidenceCount] = useState(0);
  const [assignmentReviewNote, setAssignmentReviewNote] = useState("");
  const [completedEditMode, setCompletedEditMode] = useState(false);
  const [completedEditYear, setCompletedEditYear] = useState("");
  const [completedEditPeriod, setCompletedEditPeriod] = useState("");
  const [completedEditNote, setCompletedEditNote] = useState("");
  const [completedEditEvidenceFiles, setCompletedEditEvidenceFiles] = useState([]);
  const [completedEvidenceInputCount, setCompletedEvidenceInputCount] = useState(1);
  const [completedPendingEvidenceCount, setCompletedPendingEvidenceCount] = useState(0);
  const [reviewDecisionDraft, setReviewDecisionDraft] = useState("양호");
  const [dashboardView, setDashboardView] = useState("category");
  const [dashboardUnitFilter, setDashboardUnitFilter] = useState("전체");
  const [dashboardDelayFilter, setDashboardDelayFilter] = useState("전체");
  const [dashboardFrequencyFocus, setDashboardFrequencyFocus] = useState("전체");
  const [dashboardControlStatusFocus, setDashboardControlStatusFocus] = useState("전체");
  const [dashboardCategoryFocus, setDashboardCategoryFocus] = useState("전체");
  const [dashboardDelayDetailKey, setDashboardDelayDetailKey] = useState("monthly");
  const [workbenchTab, setWorkbenchTab] = useState(() => initialNavigationState.workbenchTab || loadPersistedWorkbenchTab());
  const [uiTheme, setUiTheme] = useState(() => loadPersistedUiTheme());
  const [dashboardCalendarMonth, setDashboardCalendarMonth] = useState(() => {
    const month = new Date().getMonth() + 1;
    return Number.isInteger(month) && month >= 1 && month <= 12 ? month : 1;
  });
  const currentCalendarMonth = useMemo(() => new Date().getMonth() + 1, []);
  const currentCalendarYear = useMemo(() => String(new Date().getFullYear()), []);
  const [dashboardDelayYear, setDashboardDelayYear] = useState(() => String(new Date().getFullYear()));
  const [reportYear, setReportYear] = useState("all");
  const [reportPeriod, setReportPeriod] = useState("all");
  const [reportCompletionFilter, setReportCompletionFilter] = useState("completed");
  const [reportFormat, setReportFormat] = useState("html");
  const [reportPreviewOpen, setReportPreviewOpen] = useState(false);
  const [reportPreviewMarkup, setReportPreviewMarkup] = useState("");
  const [evidencePreviewFile, setEvidencePreviewFile] = useState(null);
  const [executionSavePopupMessage, setExecutionSavePopupMessage] = useState("");
  const [memberSavePopupMessage, setMemberSavePopupMessage] = useState("");
  const [centerAlertMessage, setCenterAlertMessage] = useState("");
  const [centerConfirmMessage, setCenterConfirmMessage] = useState("");
  const [memberDrafts, setMemberDrafts] = useState({});
  const [auditLogQuery, setAuditLogQuery] = useState("");
  const [auditLogPage, setAuditLogPage] = useState(1);
  const [remoteAuditLogs, setRemoteAuditLogs] = useState([]);
  const [remoteAuditLogTotalPages, setRemoteAuditLogTotalPages] = useState(1);
  const [remoteAuditLogLoading, setRemoteAuditLogLoading] = useState(false);
  const [remoteWorkspaceReady, setRemoteWorkspaceReady] = useState(() => !HAS_REMOTE_BACKEND);
  const [integrationStatus, setIntegrationStatus] = useState(() => ({
    spreadsheet: HAS_REMOTE_BACKEND ? "미확인" : "미설정",
    drive: HAS_REMOTE_BACKEND ? "미확인" : "미설정",
  }));
  const googleLoginRef = useRef(null);
  const reportPreviewFrameRef = useRef(null);
  const assignmentFormRef = useRef(null);
  const completedEditFormRef = useRef(null);
  const workspaceBackupInputRef = useRef(null);
  const pendingAssignmentPresetRef = useRef(null);
  const confirmResolverRef = useRef(null);
  const deletedMemberEmailSet = useMemo(() => new Set(deletedMemberEmails), [deletedMemberEmails]);
  const effectiveLoginDomains = useMemo(() => {
    const merged = parseDomainList([
      ...(Array.isArray(loginDomains) ? loginDomains : []),
      ...(Array.isArray(workspace.loginDomains) ? workspace.loginDomains : []),
    ]);
    if (merged.length > 0) {
      return merged;
    }
    return parseDomainList(defaultData.loginDomains);
  }, [loginDomains, workspace.loginDomains]);
  const loginDomainSet = useMemo(() => new Set(effectiveLoginDomains), [effectiveLoginDomains]);
  const allowedDomainText = effectiveLoginDomains.length > 0
    ? effectiveLoginDomains.join(", ")
    : "모든 도메인";

  const { controls, workflows, people } = workspace;
  const isWorkbenchView = currentView === "control-workbench";
  const auditLogs = workspace.auditLogs ?? [];
  const roleAssignmentControl = controls.find((control) => control.id === roleAssignmentControlId) ?? controls[0] ?? null;
  const processSummary = summarizeByProcess(controls, workflows);
  const processOptions = ["전체", ...new Set(controls.map((control) => control.process))];
  const controlUnitFilterOptions = useMemo(() => {
    const units = Array.from(new Set(controls.map((control) => toControlUnitFilterValue(control))));
    const knownUnits = CONTROL_UNIT_FILTER_ORDER.filter((unit) => units.includes(unit));
    const customUnits = units.filter((unit) => !CONTROL_UNIT_FILTER_ORDER.includes(unit)).sort((left, right) => left.localeCompare(right, "ko"));
    return ["전체", ...knownUnits, ...customUnits];
  }, [controls]);
  const dashboardUnitOptions = useMemo(
    () => ["전체", ...new Set(controls.map((control) => control.performDept ?? control.performer ?? "미지정"))],
    [controls],
  );
  const performerPeople = people.filter((person) => person.role === "performer" || person.role === "both");
  const reviewerPeople = people.filter((person) => person.role === "reviewer" || person.role === "both");
  const performerUnitOptions = useMemo(() => {
    const source = performerPeople.length > 0 ? performerPeople : people;
    return Array.from(new Set(source.map((person) => normalizeUnitLabel(person.unit ?? "")).filter(Boolean)))
      .sort((left, right) => left.localeCompare(right, "ko"));
  }, [people, performerPeople]);
  const reviewerUnitOptions = useMemo(() => {
    const source = reviewerPeople.length > 0 ? reviewerPeople : people;
    return Array.from(new Set(source.map((person) => normalizeUnitLabel(person.unit ?? "")).filter(Boolean)))
      .sort((left, right) => left.localeCompare(right, "ko"));
  }, [people, reviewerPeople]);
  const memberDirectory = useMemo(() => {
    const syncedPeople = normalizePeopleCollection(people);

    if (!authUser?.email) {
      return syncedPeople;
    }

    const normalizedAuthEmail = String(authUser.email ?? "").trim().toLowerCase();
    if (deletedMemberEmailSet.has(normalizedAuthEmail)) {
      return syncedPeople;
    }

    const hasCurrentUser = syncedPeople.some((person) => String(person.email ?? "").trim().toLowerCase() === normalizedAuthEmail);
    if (hasCurrentUser) {
      return syncedPeople;
    }

    return [
      {
        id: "AUTH-CURRENT",
        name: authUser.name ?? normalizedAuthEmail,
        email: normalizedAuthEmail,
        unit: "미지정",
        accessRole: "viewer",
      },
      ...syncedPeople,
    ];
  }, [authUser, people, deletedMemberEmailSet]);
  const memberNameByEmail = useMemo(
    () =>
      new Map(
        memberDirectory
          .map((person) => [String(person.email ?? "").trim().toLowerCase(), String(person.name ?? "").trim()])
          .filter(([email, name]) => email && name),
      ),
    [memberDirectory],
  );
  const memberUnitByEmail = useMemo(
    () =>
      new Map(
        memberDirectory
          .map((person) => [
            String(person.email ?? "").trim().toLowerCase(),
            String(person.unit ?? "").trim(),
          ])
          .filter(([email, unit]) => email && unit),
      ),
    [memberDirectory],
  );
  const memberUnitByName = useMemo(() => {
    const grouped = new Map();
    memberDirectory.forEach((person) => {
      const name = String(person?.name ?? "").trim();
      const unit = String(person?.unit ?? "").trim();
      if (!name || !unit) {
        return;
      }
      const current = grouped.get(name) ?? new Set();
      current.add(unit);
      grouped.set(name, current);
    });
    return new Map(
      Array.from(grouped.entries())
        .filter(([, units]) => units.size === 1)
        .map(([name, units]) => [name, Array.from(units)[0]]),
    );
  }, [memberDirectory]);
  const formatExecutionDisplayUnit = (value) =>
    normalizeUnitLabel(value);
  const memberSingleNameByUnit = useMemo(() => {
    const grouped = new Map();
    memberDirectory.forEach((person) => {
      const normalizedUnit = formatExecutionDisplayUnit(person?.unit ?? "").replace(/\s+/g, "");
      const name = String(person?.name ?? "").trim();
      if (!normalizedUnit || !name) {
        return;
      }
      const current = grouped.get(normalizedUnit) ?? new Set();
      current.add(name);
      grouped.set(normalizedUnit, current);
    });
    return new Map(
      Array.from(grouped.entries())
        .filter(([, names]) => names.size === 1)
        .map(([unit, names]) => [unit, Array.from(names)[0]]),
    );
  }, [memberDirectory]);
  const resolveExecutionAuthorName = (control) => {
    if (String(control?.id ?? "").trim() === "C-IT-Cyber-04") {
      return "이치현";
    }
    const authorEmail = String(control?.executionAuthorEmail ?? "").trim().toLowerCase();
    if (authorEmail && memberNameByEmail.has(authorEmail)) {
      return memberNameByEmail.get(authorEmail);
    }
    return String(control?.executionAuthorName ?? "").trim() || "-";
  };
  const resolveExecutionAuthorDisplay = (control) => {
    const catalog = controlCatalog[String(control?.id ?? "").trim()] ?? {};
    const rawUnit = String(control?.performDept ?? catalog.performDept ?? "").trim();
    const unit = formatExecutionDisplayUnit(rawUnit);
    return unit || rawUnit || "-";
  };
  const resolveReviewDeptDisplay = (control) => {
    const catalog = controlCatalog[String(control?.id ?? "").trim()] ?? {};
    const rawUnit = String(control?.reviewDept ?? catalog.reviewDept ?? "").trim();
    return normalizeUnitLabel(rawUnit) || rawUnit || "-";
  };
  const normalizedAuthEmail = String(authUser?.email ?? "").trim().toLowerCase();
  const currentAccessRole = normalizeAccessRole(
    memberDirectory.find((person) => String(person.email ?? "").trim().toLowerCase() === normalizedAuthEmail)?.accessRole ?? "viewer",
  );
  const sortedMemberDirectory = useMemo(() => {
    const rolePriority = {
      admin: 0,
      reviewer: 1,
      viewer: 2,
    };
    return memberDirectory.filter((person) => person.id !== "AUTH-CURRENT").sort((left, right) => {
      const leftRole = normalizeAccessRole(memberDrafts[left.id]?.accessRole ?? left.accessRole);
      const rightRole = normalizeAccessRole(memberDrafts[right.id]?.accessRole ?? right.accessRole);
      const leftRank = rolePriority[leftRole] ?? 99;
      const rightRank = rolePriority[rightRole] ?? 99;
      if (leftRank !== rightRank) {
        return leftRank - rightRank;
      }
      return String(left.name ?? "").localeCompare(String(right.name ?? ""), "ko");
    });
  }, [memberDirectory, memberDrafts]);
  const isAdmin = currentAccessRole === "admin";
  const canOperateControl = currentAccessRole === "admin" || currentAccessRole === "reviewer";
  const canManageMembers =
    isAdmin;

  useEffect(() => {
    if (!authUser?.email) {
      return;
    }
    if (isAllowedEmailBySet(authUser.email, loginDomainSet)) {
      return;
    }
    window.localStorage.removeItem(AUTH_STORAGE_KEY);
    setAuthUser(null);
    setAuthError(LOGIN_DOMAIN_ERROR_MESSAGE);
  }, [authUser, loginDomainSet]);

  useEffect(() => {
    try {
      window.localStorage.setItem(DELETED_MEMBER_EMAILS_STORAGE_KEY, JSON.stringify(deletedMemberEmails));
    } catch {}
  }, [deletedMemberEmails]);

  useEffect(() => {
    try {
      window.localStorage.setItem(CURRENT_VIEW_STORAGE_KEY, currentView);
    } catch {}
  }, [currentView]);

  useEffect(() => {
    try {
      window.localStorage.setItem(WORKBENCH_TAB_STORAGE_KEY, workbenchTab);
    } catch {}
  }, [workbenchTab]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const nextUrl = buildAppNavigationUrl({
      currentView,
      workbenchTab,
      selectedControlId,
      selectedCompletedExecutionKey,
      selectedReviewExecutionKey,
    });
    if (nextUrl && nextUrl !== window.location.href) {
      window.history.replaceState(null, "", nextUrl);
    }
  }, [
    currentView,
    workbenchTab,
    selectedControlId,
    selectedCompletedExecutionKey,
    selectedReviewExecutionKey,
  ]);

  useEffect(() => {
    try {
      window.localStorage.setItem(UI_THEME_STORAGE_KEY, uiTheme);
    } catch {}
    if (typeof document !== "undefined") {
      document.body.setAttribute("data-ui-theme", uiTheme);
    }
  }, [uiTheme]);

  useEffect(() => {
    const workspaceDomains = parseDomainList(workspace.loginDomains);
    if (workspaceDomains.length === 0) {
      return;
    }
    const nextText = workspaceDomains.join(", ");
    const prevText = loginDomains.join(", ");
    if (nextText !== prevText) {
      setLoginDomains(workspaceDomains);
      setLoginDomainDraft(nextText);
      window.localStorage.setItem(LOGIN_DOMAIN_STORAGE_KEY, workspaceDomains.join(","));
    }
  }, [workspace.loginDomains, loginDomains]);

  const listPageSize = (isWorkbenchView || currentView === "control-list") ? 15 : 10;
  const visibleControls = controls.filter((control) => {
    const matchesProcess =
      processFilter === "전체"
        ? true
        : String(control.process ?? "").trim() === processFilter;
    const matchesFrequency =
      controlFrequencyFilter === "전체"
        ? true
        : String(control.frequency ?? "").trim() === controlFrequencyFilter;
    const matchesControlId =
      controlIdFilter === "전체"
        ? true
        : String(control.id ?? "").trim() === controlIdFilter;
    const matchesUnit =
      controlUnitFilter === "전체"
        ? true
        : toControlUnitFilterValue(control) === controlUnitFilter;
    const hasDraft = hasDraftExecutionEntry(control);
    const matchesExecutionFilter =
      controlExecutionFilter === "작성중"
        ? hasDraft
        : true;

    return matchesProcess && matchesFrequency && matchesControlId && matchesUnit && matchesExecutionFilter;
  }).sort(compareControlsByListOrder);
  const controlExecutionDraftCount = controls.filter((control) => hasDraftExecutionEntry(control)).length;
  const totalControlPages = Math.max(1, Math.ceil(visibleControls.length / listPageSize));
  const currentControlPage = Math.min(controlListPage, totalControlPages);
  const limitedControls = visibleControls.slice(
    (currentControlPage - 1) * listPageSize,
    currentControlPage * listPageSize,
  );
  const selectedControl =
    visibleControls.find((control) => control.id === selectedControlId)
    ?? limitedControls[0]
    ?? null;
  const registrationCompletion = useMemo(() => {
    const filled = registrationRequiredFields.filter((key) => isRegistrationFieldFilled(registrationForm, key)).length;
    return Math.round((filled / registrationRequiredFields.length) * 100);
  }, [registrationForm]);
  const registrationMissingFields = registrationRequiredFields.filter((key) => !isRegistrationFieldFilled(registrationForm, key));
  const canSubmitRegistration = registrationMissingFields.length === 0;
  const controlManagementControls = useMemo(
    () => controls.map((control) => buildControlManagementSnapshot(control)),
    [controls],
  );
  const registrationCategoryOptions = ["전체", ...new Set(controlManagementControls.map((control) => control.process))];
  const registrationVisibleControls =
    registrationCategoryFilter === "전체"
      ? [...controlManagementControls]
      : controlManagementControls.filter((control) => control.process === registrationCategoryFilter)
  ;
  registrationVisibleControls.sort(compareControlsByListOrder);
  const registrationTotalPages = Math.max(1, Math.ceil(registrationVisibleControls.length / listPageSize));
  const registrationCurrentPage = Math.min(registrationListPage, registrationTotalPages);
  const registrationPagedControls = registrationVisibleControls.slice(
    (registrationCurrentPage - 1) * listPageSize,
    registrationCurrentPage * listPageSize,
  );
  const registrationSelectedControlSource =
    controls.find((control) => control.id === registrationSelectedControlId)
    ?? controls.find((control) => control.id === registrationPagedControls[0]?.id)
    ?? controls[0]
    ?? null;
  const registrationSelectedControl = registrationSelectedControlSource
    ? buildControlManagementSnapshot(registrationSelectedControlSource)
    : registrationPagedControls[0]
      ?? controlManagementControls[0]
      ?? null;
  const executionYearOptions = useMemo(() => buildExecutionYearOptions(), []);
  const executionPeriodOptions = useMemo(
    () => buildExecutionPeriodOptions(selectedControl?.frequency),
    [selectedControl?.frequency],
  );
  const selectedAssignmentEntry = useMemo(
    () => getPreferredExecutionEntry(
      selectedControl,
      null,
      {
        executionYear: assignmentExecutionYear,
        executionPeriod: assignmentExecutionPeriod,
      },
    ),
    [selectedControl, assignmentExecutionPeriod, assignmentExecutionYear],
  );
  const canSubmitAssignment =
    canOperateControl
    && assignmentExecutionYear.trim().length > 0
    && assignmentExecutionPeriod.trim().length > 0
    && assignmentExecutionNote.trim().length > 0
    && assignmentPendingEvidenceCount > 0;
  const canRecallSelectedExecution =
    !!selectedControl
    && normalizedAuthEmail.length > 0
    && (isAdmin || String(selectedAssignmentEntry?.executionAuthorEmail ?? "").trim().toLowerCase() === normalizedAuthEmail)
    && Boolean(selectedAssignmentEntry?.executionSubmitted)
    && hasExecutionEntryContent(selectedAssignmentEntry);
  const dashboardDelayYearOptions = useMemo(
    () => buildExecutionYearOptions(Number(currentCalendarYear), 7),
    [currentCalendarYear],
  );
  const reportYearOptions = useMemo(
    () => ["all", ...buildExecutionYearOptions(Number(currentCalendarYear), 7)],
    [currentCalendarYear],
  );
  const reportPeriodConfig = {
    all: { label: "전체", frequencies: ["Monthly", "월별", "Quarterly", "분기별", "Half-Bi-annual", "반기별", "Annual", "연 1회 + 변경 시", "Event Driven", "이벤트 발생 시", "Other", "필요 시", "수시"] },
    monthly: { label: "월", frequencies: ["Monthly", "월별"] },
    quarterly: { label: "분기", frequencies: ["Quarterly", "분기별"] },
    semiannual: { label: "반기", frequencies: ["Half-Bi-annual", "반기별"] },
    annual: { label: "연", frequencies: ["Annual", "연 1회 + 변경 시"] },
  };
  const reportControls = useMemo(() => {
    const config = reportPeriodConfig[reportPeriod];
    if (!config) {
      return [];
    }

    return controls
      .flatMap((control) =>
        getControlExecutionHistory(control)
          .filter((entry) =>
            config.frequencies.includes(control.frequency)
            && (
              reportYear === "all"
              || String(entry.executionYear ?? "").trim() === reportYear
            ),
          )
          .filter((entry) =>
            Boolean(entry.executionSubmitted)
            && (
              reportCompletionFilter === "all"
              || String(entry.reviewChecked ?? "").trim() === "검토 완료"
            ),
          )
          .map((entry) => ({
            id: control.id,
            title: control.title,
            process: control.process,
            frequency: control.frequency,
            performer: resolveExecutionAuthorDisplay(control),
            reviewer: resolveReviewDeptDisplay(control),
            status: entry.status ?? "-",
            reviewChecked: entry.reviewChecked ?? "미검토",
            executionNote: typeof entry.executionNote === "string" ? entry.executionNote : "",
            reviewNote: typeof entry.note === "string" ? entry.note : "",
            executionYear: entry.executionYear ?? "",
            executionPeriod: entry.executionPeriod ?? "",
            evidenceCount: Array.isArray(entry.evidenceFiles) ? entry.evidenceFiles.length : 0,
            evidenceFiles: Array.isArray(entry.evidenceFiles) ? entry.evidenceFiles : [],
          })),
      );
  }, [controls, reportCompletionFilter, reportPeriod, reportYear]);
  const reportSummary = useMemo(() => ({
    total: reportControls.length,
    completed: reportControls.filter((item) => item.status === "점검 완료" || item.status === "정상").length,
    inProgress: reportControls.filter((item) => item.status === "점검 중").length,
    scheduled: reportControls.filter((item) => item.status === "점검 예정").length,
  }), [reportControls]);
  const filteredAuditLogs = useMemo(() => {
    if (HAS_REMOTE_BACKEND) {
      return [];
    }
    const normalizedQuery = auditLogQuery.trim().toLowerCase();
    if (!normalizedQuery) {
      return auditLogs;
    }

    return auditLogs.filter((log) =>
      [
        log.createdAt,
        log.actorName,
        log.actorEmail,
        log.action,
        auditActionLabel(log.action),
        log.ip,
        log.target,
        log.detail,
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery),
    );
  }, [auditLogQuery, auditLogs]);
  const localTotalAuditLogPages = Math.max(1, Math.ceil(filteredAuditLogs.length / AUDIT_LOG_PAGE_SIZE));
  const totalAuditLogPages = HAS_REMOTE_BACKEND ? remoteAuditLogTotalPages : localTotalAuditLogPages;
  const currentAuditLogPage = Math.min(auditLogPage, totalAuditLogPages);
  const pagedAuditLogs = HAS_REMOTE_BACKEND
    ? remoteAuditLogs
    : filteredAuditLogs.slice(
      (currentAuditLogPage - 1) * AUDIT_LOG_PAGE_SIZE,
      currentAuditLogPage * AUDIT_LOG_PAGE_SIZE,
    );

  useEffect(() => {
    setMemberDrafts(
      Object.fromEntries(
        memberDirectory.map((person) => [
          person.id,
          {
            unit: person.unit ?? "미지정",
            accessRole: normalizeAccessRole(person.accessRole),
          },
        ]),
      ),
    );
  }, [memberDirectory]);

  useEffect(() => {
    if (HAS_REMOTE_BACKEND) {
      return;
    }
    if (auditLogPage > totalAuditLogPages) {
      setAuditLogPage(totalAuditLogPages);
    }
  }, [auditLogPage, totalAuditLogPages]);

  useEffect(() => {
    setAuditLogPage(1);
  }, [auditLogQuery]);

  useEffect(() => {
    if (!HAS_REMOTE_BACKEND || currentView !== "audit") {
      return;
    }

    let active = true;
    setRemoteAuditLogLoading(true);
    fetchSupabaseAuditLogsPage({
      page: auditLogPage,
      pageSize: AUDIT_LOG_PAGE_SIZE,
      query: auditLogQuery,
    })
      .then((result) => {
        if (!active) {
          return;
        }
        setRemoteAuditLogs(result.logs);
        setRemoteAuditLogTotalPages(result.totalPages);
      })
      .catch(() => {
        if (!active) {
          return;
        }
        setRemoteAuditLogs([]);
        setRemoteAuditLogTotalPages(1);
      })
      .finally(() => {
        if (active) {
          setRemoteAuditLogLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [auditLogPage, auditLogQuery, currentView]);

  useEffect(() => {
    if (!authUser?.email) {
      return;
    }
    if (HAS_REMOTE_BACKEND && !remoteWorkspaceReady) {
      return;
    }

    const normalizedEmail = authUser.email.toLowerCase();
    if (deletedMemberEmailSet.has(normalizedEmail)) {
      return;
    }
    const currentMember = people.find((person) => String(person.email ?? "").toLowerCase() === normalizedEmail);
    if (!currentMember) {
      updateWorkspace({
        ...workspace,
        people: [
          {
            id: createMemberId(),
            name: authUser.name ?? normalizedEmail,
            email: normalizedEmail,
            role: "both",
            unit: "미지정",
            accessRole: "viewer",
          },
          ...people,
        ],
      });
      return;
    }

    const nextMemberName = pickPreferredMemberName(currentMember.name, authUser.name ?? normalizedEmail, normalizedEmail)
      || currentMember.name
      || authUser.name
      || normalizedEmail;
    const needsPatch =
      (currentMember.name ?? "") !== nextMemberName
      || !String(currentMember.unit ?? "").trim();

    if (!needsPatch) {
      return;
    }

    updateWorkspace({
      ...workspace,
      people: people.map((person) =>
        String(person.email ?? "").toLowerCase() === normalizedEmail
          ? {
              ...person,
              name: nextMemberName,
              unit: person.unit ?? "미지정",
              accessRole: normalizeAccessRole(person.accessRole),
            }
          : person,
      ),
    });
  }, [authUser, people, deletedMemberEmailSet, remoteWorkspaceReady]);

  useEffect(() => {
    workspaceRef.current = workspace;
  }, [workspace]);

  const dashboardSummaryControls = useMemo(
    () => controls,
    [controls],
  );
  const dashboardBaseControls = useMemo(
    () => controls.filter((control) => {
      const matchesUnit =
        dashboardUnitFilter === "전체"
          ? true
          : (control.performDept ?? control.performer ?? "미지정") === dashboardUnitFilter;
      return matchesUnit;
    }),
    [controls, dashboardUnitFilter],
  );
  const dashboardFilteredControls = useMemo(
    () => dashboardBaseControls.filter((control) => {
      const matchesDelay =
        dashboardDelayFilter === "지연만"
          ? isDashboardDelayedControl(control, dashboardDelayYear)
          : true;
      return matchesDelay;
    }),
    [dashboardBaseControls, dashboardDelayYear, dashboardDelayFilter],
  );
  const dashboardProcessSummary = useMemo(
    () => summarizeByProcess(dashboardFilteredControls, workflows),
    [dashboardFilteredControls, workflows],
  );
  const dashboardCalendarSummary = useMemo(() => {
    const monthBuckets = Array.from({ length: 12 }, (_, index) => ({
      month: index + 1,
      items: [],
    }));

    dashboardSummaryControls.forEach((control) => {
      const months = scheduledMonthsByFrequency(control.frequency);
      if (months.length === 0) {
        return;
      }

      const card = {
        id: control.id,
        title: control.title,
        process: control.process,
        frequency: control.frequency,
        status: control.status || "점검 예정",
        keyControl: control.keyControl,
      };

      months.forEach((month) => {
        if (month >= 1 && month <= 12) {
          monthBuckets[month - 1].items.push(card);
        }
      });
    });

    return monthBuckets.map((bucket) => ({
      ...bucket,
      items: bucket.items.sort(compareControlsByListOrder),
    }));
  }, [dashboardSummaryControls]);
  const dashboardMonthlyCards =
    dashboardCalendarSummary.find((bucket) => bucket.month === dashboardCalendarMonth)?.items ?? [];
  const dashboardAnnualDelayBuckets = useMemo(() => {
    return Object.entries(DASHBOARD_DELAY_BUCKET_CONFIG).map(([key, config]) => {
      const items = dashboardSummaryControls
        .flatMap((control) => {
          const normalizedStatus = deriveAssignmentStatus(control.executionNote ?? "", control.reviewChecked ?? "미검토");
          if (!config.frequencies.includes(control.frequency) || isCompletedStatus(normalizedStatus)) {
            return [];
          }

          const overduePeriods = overduePeriodLabelsForYear(control.frequency, dashboardDelayYear, new Date());
          return overduePeriods.map((overduePeriod) => ({
            id: control.id,
            title: control.title,
            process: control.process,
            frequency: frequencyLabelMap[control.frequency] ?? control.frequency ?? "-",
            status: normalizedStatus,
            performer: control.performDept ?? control.performer ?? "-",
            executionYear: control.executionYear ?? "",
            executionPeriod: control.executionPeriod ?? "",
            overduePeriod,
          }));
        })
        .sort((left, right) =>
          left.id.localeCompare(right.id, "ko")
          || String(left.overduePeriod).localeCompare(String(right.overduePeriod), "ko"),
        );

      return {
        key,
        ...config,
        items,
      };
    });
  }, [dashboardDelayYear, dashboardSummaryControls]);
  const dashboardAnnualProgressSummary = useMemo(() => {
    const summary = dashboardSummaryControls.reduce((acc, control) => {
      const plannedCount = annualPlannedCountByFrequency(control.frequency);
      if (plannedCount <= 0) {
        return acc;
      }

      const completedCount = getControlExecutionHistory(control).filter((entry) =>
        String(entry?.executionYear ?? "").trim() === String(dashboardDelayYear).trim()
        && String(entry?.reviewChecked ?? "미검토").trim() === "검토 완료",
      ).length;

      acc.planned += plannedCount;
      acc.completed += Math.min(plannedCount, completedCount);
      return acc;
    }, { planned: 0, completed: 0 });

    return {
      ...summary,
      progressRate: summary.planned === 0 ? 0 : Math.round((summary.completed / summary.planned) * 100),
    };
  }, [dashboardDelayYear, dashboardSummaryControls]);
  const dashboardAnnualProgressItems = useMemo(() => (
    dashboardSummaryControls
      .flatMap((control) =>
        getControlExecutionHistory(control)
          .filter((entry) =>
            String(entry?.executionYear ?? "").trim() === String(dashboardDelayYear).trim()
            && String(entry?.reviewChecked ?? "미검토").trim() === "검토 완료",
          )
          .map((entry) => ({
            id: control.id,
            title: control.title,
            process: control.process,
            frequency: frequencyLabelMap[control.frequency] ?? control.frequency ?? "-",
            status: deriveAssignmentStatus(entry.executionNote ?? "", entry.reviewChecked ?? "미검토"),
            performer: control.performDept ?? control.performer ?? "-",
            executionYear: entry.executionYear ?? "",
            executionPeriod: entry.executionPeriod ?? "",
            updatedAt: entry.updatedAt ?? "",
          })),
      )
      .sort((left, right) =>
        left.id.localeCompare(right.id, "ko")
        || String(left.executionPeriod).localeCompare(String(right.executionPeriod), "ko"),
      )
  ), [dashboardDelayYear, dashboardSummaryControls]);
  const selectedDashboardDelayBucket =
    dashboardAnnualDelayBuckets.find((bucket) => bucket.key === dashboardDelayDetailKey)
    ?? dashboardAnnualDelayBuckets[0]
    ?? null;
  const controlProgressGroups = useMemo(() => {
    const grouped = dashboardFilteredControls.reduce((acc, control) => {
      const frequency = control.frequency || "미지정";
      const progress = controlProgressValue(control, dashboardDelayYear);
      if (frequency === "수시" || progress == null) {
        return acc;
      }
      if (!acc[frequency]) {
        acc[frequency] = [];
      }
      acc[frequency].push({
        id: control.id,
        title: control.title,
        process: control.process,
        progress,
        status: control.status || "점검 예정",
      });
      return acc;
    }, {});

    return Object.entries(grouped)
      .sort(([left], [right]) => {
        const leftIndex = frequencyOrder.indexOf(left);
        const rightIndex = frequencyOrder.indexOf(right);
        const safeLeft = leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex;
        const safeRight = rightIndex === -1 ? Number.MAX_SAFE_INTEGER : rightIndex;
        return safeLeft - safeRight || left.localeCompare(right, "ko");
      })
      .map(([frequency, items]) => ({
        frequency,
        label: frequencyLabelMap[frequency] ?? frequency,
        items: items.sort(compareControlsByListOrder),
        progressRate: items.length === 0 ? 0 : Math.round(items.reduce((sum, item) => sum + item.progress, 0) / items.length),
      }));
  }, [dashboardDelayYear, dashboardFilteredControls]);
  const visibleControlProgressGroups = useMemo(
    () => (
      dashboardFrequencyFocus === "전체"
        ? controlProgressGroups
        : controlProgressGroups.filter((group) => group.frequency === dashboardFrequencyFocus)
    ),
    [controlProgressGroups, dashboardFrequencyFocus],
  );
  const dashboardStatusSummary = useMemo(() => ({
    total: dashboardFilteredControls.length,
    inProgress: dashboardFilteredControls.filter((control) => deriveAssignmentStatus(control.executionNote ?? "", control.reviewChecked ?? "미검토") === "점검 중").length,
    completed: dashboardFilteredControls.filter((control) => deriveAssignmentStatus(control.executionNote ?? "", control.reviewChecked ?? "미검토") === "점검 완료").length,
    scheduled: dashboardFilteredControls.filter((control) => deriveAssignmentStatus(control.executionNote ?? "", control.reviewChecked ?? "미검토") === "점검 예정").length,
  }), [dashboardFilteredControls]);
  const dashboardControlItems = useMemo(
    () =>
      dashboardFilteredControls.map((control) => ({
        id: control.id,
        title: control.title,
        process: control.process,
        frequency: frequencyLabelMap[control.frequency] ?? control.frequency ?? "-",
        progress: controlProgressValue(control, dashboardDelayYear) ?? 0,
        status: deriveAssignmentStatus(control.executionNote ?? "", control.reviewChecked ?? "미검토"),
      })),
    [dashboardDelayYear, dashboardFilteredControls],
  );
  const dashboardControlGroups = useMemo(() => {
    const grouped = dashboardControlItems.reduce((acc, item) => {
      const groupKey = item.id.split("-")[0] || "기타";
      if (!acc[groupKey]) {
        acc[groupKey] = [];
      }
      acc[groupKey].push(item);
      return acc;
    }, {});

    return Object.entries(grouped)
      .sort(([left], [right]) => {
        const leftIndex = controlGroupOrder.indexOf(left);
        const rightIndex = controlGroupOrder.indexOf(right);
        const safeLeft = leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex;
        const safeRight = rightIndex === -1 ? Number.MAX_SAFE_INTEGER : rightIndex;
        return safeLeft - safeRight || left.localeCompare(right, "ko");
      })
      .map(([group, items]) => ({
        group,
        items: items.sort(compareControlsByListOrder),
        progressRate: items.length === 0 ? 0 : Math.round(items.reduce((sum, item) => sum + item.progress, 0) / items.length),
      }));
  }, [dashboardControlItems]);
  const visibleDashboardControlGroups = useMemo(
    () =>
      dashboardControlGroups
        .map((group) => {
          const filteredItems = group.items.filter((item) => matchesDashboardControlStatus(item.status, dashboardControlStatusFocus));
          return {
            ...group,
            items: filteredItems,
            progressRate:
              filteredItems.length === 0
                ? 0
                : Math.round(filteredItems.reduce((sum, item) => sum + item.progress, 0) / filteredItems.length),
          };
        })
        .filter((group) => group.items.length > 0),
    [dashboardControlGroups, dashboardControlStatusFocus],
  );
  const visibleDashboardProcessSummary = useMemo(
    () =>
      dashboardProcessSummary.filter((item) => {
        if (dashboardCategoryFocus === "완료") {
          return item.pending === 0;
        }
        if (dashboardCategoryFocus === "관리 필요") {
          return item.pending > 0;
        }
        return true;
      }),
    [dashboardCategoryFocus, dashboardProcessSummary],
  );
  const dashboardAnchorTargets = useMemo(() => ({
    firstControl: dashboardControlItems[0]?.id ?? "",
    inProgress: dashboardControlItems.find((item) => item.status === "점검 중")?.id ?? "",
    completed: dashboardControlItems.find((item) => item.status === "정상" || item.status === "점검 완료")?.id ?? "",
    scheduled: dashboardControlItems.find((item) => item.status === "점검 예정")?.id ?? "",
    firstCategory: dashboardProcessSummary[0]?.process ?? "",
    completedCategory: dashboardProcessSummary.find((item) => item.pending === 0)?.process ?? "",
    pendingCategory: dashboardProcessSummary.find((item) => item.pending > 0)?.process ?? "",
  }), [dashboardControlItems, dashboardProcessSummary]);
  const dashboardSummaryCards = useMemo(() => {
    if (dashboardView === "frequency") {
      const countByFrequency = (key) =>
        controlProgressGroups.find((group) => group.frequency === key)?.items.length ?? 0;

      return [
        { label: "월별", value: `${countByFrequency("Monthly")}개`, targetId: "dashboard-frequency-monthly", filterValue: "Monthly" },
        { label: "분기별", value: `${countByFrequency("Quarterly")}개`, targetId: "dashboard-frequency-quarterly", filterValue: "Quarterly" },
        { label: "반기별", value: `${countByFrequency("Half-Bi-annual")}개`, targetId: "dashboard-frequency-half-bi-annual", filterValue: "Half-Bi-annual" },
        { label: "연 1회", value: `${countByFrequency("Annual")}개`, targetId: "dashboard-frequency-annual", filterValue: "Annual" },
        { label: "이벤트 발생 시", value: `${countByFrequency("Event Driven")}개`, targetId: "dashboard-frequency-event-driven", filterValue: "Event Driven" },
        { label: "필요 시", value: `${countByFrequency("Other")}개`, targetId: "dashboard-frequency-other", filterValue: "Other" },
      ];
    }

    if (dashboardView === "category") {
      const completedCategories = dashboardProcessSummary.filter((item) => item.pending === 0).length;
      const pendingCategories = dashboardProcessSummary.filter((item) => item.pending > 0).length;
      const completionRate =
        dashboardProcessSummary.length === 0
          ? 0
          : Math.round((completedCategories / dashboardProcessSummary.length) * 100);

      return [
        { label: "전체", value: `${dashboardProcessSummary.length}개`, targetId: "dashboard-category-root", filterValue: "전체" },
        { label: "완료", value: `${completedCategories}개`, targetId: "dashboard-category-root", filterValue: "완료" },
        { label: "관리 필요", value: `${pendingCategories}개`, targetId: "dashboard-category-root", filterValue: "관리 필요" },
        { label: "완료율", value: `${completionRate}%`, targetId: "dashboard-category-root", filterValue: "전체" },
      ];
    }

    return [
      { label: "전체 통제", value: `${dashboardStatusSummary.total}개`, targetId: "dashboard-control-root", filterValue: "전체" },
      { label: "진행 중", value: `${dashboardStatusSummary.inProgress}개`, targetId: "dashboard-control-root", filterValue: "진행 중" },
      { label: "완료", value: `${dashboardStatusSummary.completed}개`, targetId: "dashboard-control-root", filterValue: "완료" },
      { label: "예정", value: `${dashboardStatusSummary.scheduled}개`, targetId: "dashboard-control-root", filterValue: "예정" },
    ];
  }, [controlProgressGroups, dashboardAnchorTargets, dashboardProcessSummary, dashboardStatusSummary, dashboardView]);
  const summary = useMemo(() => {
    const doneCount = workflows.filter((workflow) => workflow.status === "done").length;
    return {
      totalControls: controls.length,
      totalProcesses: new Set(controls.map((control) => control.process)).size,
      pendingControls: controls.filter((control) => control.status !== "정상").length,
      workflowRate: workflows.length === 0 ? "0%" : `${Math.round((doneCount / workflows.length) * 100)}%`,
    };
  }, [controls, workflows]);
  const reviewQueueControls = useMemo(
    () =>
      controls.flatMap((control) =>
        getControlExecutionHistory(control)
          .filter(
            (entry) => isExecutionInReviewQueue(entry),
          )
          .map((entry) => ({
            ...mergeExecutionHistoryIntoControl(control, getControlExecutionHistory(control), {
              executionYear: entry.executionYear,
              executionPeriod: entry.executionPeriod,
            }),
            executionYear: entry.executionYear,
            executionPeriod: entry.executionPeriod,
            updatedAt: entry.updatedAt ?? "",
            createdAt: entry.createdAt ?? "",
            reviewExecutionKey: entry.executionId,
          })),
      ).sort(compareControlsByRecentExecution),
    [controls],
  );
  const reviewPendingCount = reviewQueueControls.length;
  const completedExecutionControls = useMemo(
    () =>
      controls.flatMap((control) =>
        getControlExecutionHistory(control)
          .filter(
            (entry) =>
              Boolean(entry.executionSubmitted)
              && isExecutionReadyForCompletion(entry)
              && !entry.reviewRequested
              && String(entry.reviewChecked ?? "미검토").trim() !== "검토 완료",
          )
          .map((entry) => ({
            ...mergeExecutionHistoryIntoControl(control, getControlExecutionHistory(control), {
              executionYear: entry.executionYear,
              executionPeriod: entry.executionPeriod,
            }),
            executionYear: entry.executionYear,
            executionPeriod: entry.executionPeriod,
            updatedAt: entry.updatedAt ?? "",
            createdAt: entry.createdAt ?? "",
            completedExecutionKey: entry.executionId,
          })),
      ).sort(compareControlsByRecentExecution),
    [controls],
  );
  const completedExecutionCount = completedExecutionControls.length;
  const performedExecutionControls = useMemo(
    () =>
      controls.flatMap((control) =>
        getControlExecutionHistory(control)
          .filter(
            (entry) =>
              Boolean(entry.executionSubmitted)
              && hasExecutionRequiredFields(entry)
              && String(entry.reviewChecked ?? "미검토").trim() === "검토 완료",
          )
          .map((entry) => ({
            ...mergeExecutionHistoryIntoControl(control, getControlExecutionHistory(control), {
              executionYear: entry.executionYear,
              executionPeriod: entry.executionPeriod,
            }),
            executionYear: entry.executionYear,
            executionPeriod: entry.executionPeriod,
            updatedAt: entry.updatedAt ?? "",
            createdAt: entry.createdAt ?? "",
            performedExecutionKey: entry.executionId,
          })),
      ).sort(compareControlsByRecentExecution),
    [controls],
  );
  const performedExecutionCount = performedExecutionControls.length;
  const workbenchFlowSteps = [
    { key: "register", label: "통제 등록/수정", helper: "통제 기준 정보 정리", badgeCount: 0 },
    { key: "controls", label: "통제 작성", helper: "수행 내용과 증적 작성", badgeCount: controlExecutionDraftCount },
    { key: "controls-complete", label: "등록 완료", helper: "제출된 작성본 확인", badgeCount: completedExecutionCount },
    { key: "control-review", label: "통제 검토", helper: "검토 대기 건 처리", badgeCount: reviewPendingCount },
    { key: "performed-complete", label: "수행 완료", helper: "최종 완료 이력 확인", badgeCount: performedExecutionCount },
  ];
  const canOpenWorkbenchTab = (tabKey) => {
    if (tabKey === "controls-complete") {
      return completedExecutionCount > 0;
    }
    if (tabKey === "control-review") {
      return reviewPendingCount > 0;
    }
    return true;
  };
  const currentWorkbenchStepIndex = workbenchFlowSteps.findIndex((step) => step.key === workbenchTab);
  const currentWorkbenchStep = currentWorkbenchStepIndex >= 0 ? workbenchFlowSteps[currentWorkbenchStepIndex] : null;
  const totalCompletedPages = Math.max(1, Math.ceil(completedExecutionControls.length / listPageSize));
  const currentCompletedPage = Math.min(controlListPage, totalCompletedPages);
  const completedPagedControls = completedExecutionControls.slice(
    (currentCompletedPage - 1) * listPageSize,
    currentCompletedPage * listPageSize,
  );
  const selectedCompletedControl = selectedCompletedExecutionKey
    ? (completedExecutionControls.find((control) => control.completedExecutionKey === selectedCompletedExecutionKey) ?? null)
    : (completedPagedControls[0] ?? null);
  const totalPerformedPages = Math.max(1, Math.ceil(performedExecutionControls.length / listPageSize));
  const currentPerformedPage = Math.min(controlListPage, totalPerformedPages);
  const performedPagedControls = performedExecutionControls.slice(
    (currentPerformedPage - 1) * listPageSize,
    currentPerformedPage * listPageSize,
  );
  const selectedPerformedControl = selectedPerformedExecutionKey
    ? (performedExecutionControls.find((control) => control.performedExecutionKey === selectedPerformedExecutionKey) ?? null)
    : (performedPagedControls[0] ?? null);
  const reviewVisibleControls =
    reviewUnitFilter === "전체"
      ? reviewQueueControls
      : reviewQueueControls.filter((control) => toControlUnitFilterValue(control) === reviewUnitFilter);
  const totalReviewPages = Math.max(1, Math.ceil(reviewVisibleControls.length / listPageSize));
  const currentReviewPage = Math.min(controlListPage, totalReviewPages);
  const reviewPagedControls = reviewVisibleControls.slice(
    (currentReviewPage - 1) * listPageSize,
    currentReviewPage * listPageSize,
  );
  const selectedReviewControl =
    reviewVisibleControls.find((control) => control.reviewExecutionKey === selectedReviewExecutionKey)
    ?? reviewPagedControls[0]
    ?? null;
  const menuItems = [
    { key: "dashboard", label: "대시보드", icon: <DashboardIcon /> },
    { key: "control-list", label: "통제 목록", icon: <ControlIcon /> },
    { key: "control-workbench", label: "통제 관리", icon: <ControlIcon /> },
    { key: "report", label: "리포트", icon: <FileStackIcon /> },
    { key: "people", label: "회원 관리", icon: <PeopleIcon /> },
    { key: "audit", label: "감사 로그", icon: <AuditIcon /> },
  ];

  function handleViewChange(nextView) {
    if (nextView === "dashboard") {
      setDashboardView("category");
      setDashboardUnitFilter("전체");
      setDashboardDelayFilter("전체");
      setDashboardDelayYear(currentCalendarYear);
      setDashboardFrequencyFocus("전체");
      setDashboardControlStatusFocus("전체");
      setDashboardCategoryFocus("전체");
    }
    if (nextView === "control-list") {
      setRegistrationCategoryFilter("전체");
      setRegistrationListPage(1);
      setRegistrationSelectedControlId(controls[0]?.id ?? "");
    }
    if (nextView === "control-workbench") {
      setWorkbenchTab("register");
      setRegistrationCategoryFilter("전체");
      setRegistrationListPage(1);
      setProcessFilter("전체");
      setControlFrequencyFilter("전체");
      setControlIdFilter("전체");
      setControlListPage(1);
      setRegistrationSelectedControlId(controls[0]?.id ?? "");
      setSelectedControlId(controls[0]?.id ?? "");
      setSelectedReviewExecutionKey("");
    }
    if (nextView === "report") {
      setReportYear("all");
      setReportPeriod("all");
      setReportFormat("html");
      setReportPreviewOpen(false);
    }
    if (nextView === "audit") {
      setAuditLogQuery("");
      setAuditLogPage(1);
    }
    setCurrentView(nextView);
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "auto" });
    }
    if (["control-list", "control-workbench", "report"].includes(nextView)) {
      writeAuditLog("MENU_OPEN", nextView, `${nextView} 메뉴 열람`);
    }
    if (window.matchMedia("(max-width: 960px)").matches) {
      setIsSidebarOpen(false);
    }
  }

  function handleWorkbenchTabChange(nextTab) {
    if (!canOpenWorkbenchTab(nextTab)) {
      return;
    }
    setWorkbenchTab(nextTab);

    if (nextTab === "register") {
      setRegistrationCategoryFilter("전체");
      setRegistrationListPage(1);
      setRegistrationSelectedControlId(registrationVisibleControls[0]?.id ?? controls[0]?.id ?? "");
      return;
    }

    if (nextTab === "controls") {
      setProcessFilter("전체");
      setControlFrequencyFilter("전체");
      setControlIdFilter("전체");
      setControlUnitFilter("전체");
      setControlListPage(1);
      setSelectedControlId(visibleControls[0]?.id ?? controls[0]?.id ?? "");
      return;
    }

    if (nextTab === "controls-complete") {
      setControlListPage(1);
      setSelectedCompletedExecutionKey(completedExecutionControls[0]?.completedExecutionKey ?? "");
      setSelectedControlId(completedExecutionControls[0]?.id ?? "");
      return;
    }

    if (nextTab === "control-review") {
      setReviewUnitFilter("전체");
      setControlListPage(1);
      setSelectedReviewExecutionKey(reviewVisibleControls[0]?.reviewExecutionKey ?? reviewQueueControls[0]?.reviewExecutionKey ?? "");
      setSelectedControlId(reviewVisibleControls[0]?.id ?? reviewQueueControls[0]?.id ?? "");
      return;
    }

    if (nextTab === "performed-complete") {
      setControlListPage(1);
      setSelectedPerformedExecutionKey(performedExecutionControls[0]?.performedExecutionKey ?? "");
      setSelectedControlId(performedExecutionControls[0]?.id ?? "");
    }
  }

  function moveToDashboardTarget(targetId) {
    const resolveDashboardViewByTarget = (id) => {
      if (id.startsWith("dashboard-frequency-")) {
        return "frequency";
      }
      if (id.startsWith("dashboard-control-")) {
        return "control";
      }
      if (id.startsWith("dashboard-category-")) {
        return "category";
      }
      return dashboardView;
    };
    const nextView = resolveDashboardViewByTarget(targetId);
    if (nextView !== dashboardView) {
      setDashboardView(nextView);
    }

    if (typeof window === "undefined") {
      return;
    }
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const element = document.getElementById(targetId);
        if (!element) {
          return;
        }
        element.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
  }

  function handleDashboardSummaryCardClick(card) {
    if (dashboardView === "frequency") {
      setDashboardFrequencyFocus(card.filterValue ?? "전체");
    }
    if (dashboardView === "control") {
      setDashboardControlStatusFocus(card.filterValue ?? "전체");
    }
    if (dashboardView === "category") {
      setDashboardCategoryFocus(card.filterValue ?? "전체");
    }
    moveToDashboardTarget(card.targetId);
  }

  function openControlOperation(controlId, nextProcessFilter = "전체", options = {}) {
    const targetControl = controls.find((control) => control.id === controlId);
    const resolvedProcess = nextProcessFilter === "전체"
      ? (targetControl?.process ?? "전체")
      : nextProcessFilter;

    setProcessFilter(resolvedProcess);
    setControlFrequencyFilter("전체");
    setControlIdFilter(controlId ? String(controlId).trim() : "전체");
    setControlUnitFilter("전체");
    setControlListPage(1);
    setSelectedControlId(controlId || targetControl?.id || controls[0]?.id || "");
    setCurrentView("control-workbench");
    setWorkbenchTab("controls");
    pendingAssignmentPresetRef.current = {
      executionYear: String(options.executionYear ?? "").trim(),
      executionPeriod: String(options.executionPeriod ?? "").trim(),
    };
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "auto" });
    }
    writeAuditLog("MENU_OPEN", "control-workbench", `통제 관리 열람 · ${controlId || resolvedProcess}`);
    if (window.matchMedia("(max-width: 960px)").matches) {
      setIsSidebarOpen(false);
    }
  }

  function openRegistrationByCategory(category) {
    const resolvedCategory = String(category ?? "").trim() || "전체";
    const filteredControls =
      resolvedCategory === "전체"
        ? controls
        : controls.filter((control) => String(control.process ?? "").trim() === resolvedCategory);

    setCurrentView("control-workbench");
    setWorkbenchTab("register");
    setRegistrationCategoryFilter(resolvedCategory);
    setRegistrationListPage(1);
    setRegistrationSelectedControlId(filteredControls[0]?.id ?? "");
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "auto" });
    }
    writeAuditLog("MENU_OPEN", "control-workbench", `통제 작성 열람 · ${resolvedCategory}`);
    if (window.matchMedia("(max-width: 960px)").matches) {
      setIsSidebarOpen(false);
    }
  }

  function openControlOperationByFrequency(frequency) {
    const resolvedFrequency = String(frequency ?? "").trim() || "전체";
    const filteredControls =
      resolvedFrequency === "전체"
        ? controls
        : controls.filter((control) => String(control.frequency ?? "").trim() === resolvedFrequency);

    setCurrentView("control-workbench");
    setWorkbenchTab("controls");
    setProcessFilter("전체");
    setControlFrequencyFilter(resolvedFrequency);
    setControlIdFilter("전체");
    setControlUnitFilter("전체");
    setControlListPage(1);
    setSelectedControlId(filteredControls[0]?.id ?? "");
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "auto" });
    }
    writeAuditLog("MENU_OPEN", "control-workbench", `통제 관리 열람 · 주기 ${resolvedFrequency}`);
    if (window.matchMedia("(max-width: 960px)").matches) {
      setIsSidebarOpen(false);
    }
  }

  function openControlOperationByGroup(groupKey) {
    const resolvedGroup = String(groupKey ?? "").trim() || "전체";
    const filteredControls =
      resolvedGroup === "전체"
        ? controls
        : controls.filter((control) => String(control.id ?? "").trim().split("-")[0] === resolvedGroup);

    setCurrentView("control-workbench");
    setWorkbenchTab("controls");
    setProcessFilter("전체");
    setControlFrequencyFilter("전체");
    setControlIdFilter("전체");
    setControlUnitFilter("전체");
    setControlListPage(1);
    setSelectedControlId(filteredControls[0]?.id ?? "");
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "auto" });
    }
    writeAuditLog("MENU_OPEN", "control-workbench", `통제 관리 열람 · 그룹 ${resolvedGroup}`);
    if (window.matchMedia("(max-width: 960px)").matches) {
      setIsSidebarOpen(false);
    }
  }

  function openDashboardDelayDetail(delayKey) {
    const resolvedKey = delayKey === "progress" || DASHBOARD_DELAY_BUCKET_CONFIG[delayKey] ? delayKey : "monthly";
    setDashboardDelayDetailKey(resolvedKey);
    setCurrentView("dashboard-delay-detail");
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "auto" });
    }
    writeAuditLog(
      "MENU_OPEN",
      "dashboard-delay-detail",
      resolvedKey === "progress"
        ? `${dashboardDelayYear}년 진행 내역 상세 열람`
        : `${DASHBOARD_DELAY_BUCKET_CONFIG[resolvedKey].label} 상세 열람`,
    );
    if (window.matchMedia("(max-width: 960px)").matches) {
      setIsSidebarOpen(false);
    }
  }

  function completeLogin(nextUser, { verified = true } = {}) {
    const email = String(nextUser?.email ?? "").toLowerCase();
    if (!verified || !email || !isAllowedEmailBySet(email, loginDomainSet)) {
      setAuthError(
        effectiveLoginDomains.length > 0
          ? LOGIN_DOMAIN_ERROR_MESSAGE
          : "Google 계정 인증에 실패했습니다.",
      );
      window.localStorage.removeItem(AUTH_STORAGE_KEY);
      setAuthUser(null);
      return;
    }
    const currentWorkspace = workspaceRef.current;
    const currentPeople = Array.isArray(currentWorkspace.people) ? currentWorkspace.people : [];
    const existingMember = currentPeople.find((person) => String(person.email ?? "").toLowerCase() === email);
    const canAutoCreateMember = !HAS_REMOTE_BACKEND || remoteWorkspaceReady;
    if (deletedMemberEmailSet.has(email) && !existingMember) {
      setAuthError("삭제된 계정은 관리자 승인 전까지 다시 등록할 수 없습니다.");
      window.localStorage.removeItem(AUTH_STORAGE_KEY);
      setAuthUser(null);
      window.google?.accounts?.id?.disableAutoSelect?.();
      return;
    }
    const nextPeople = existingMember
      ? currentPeople.map((person) =>
          String(person.email ?? "").toLowerCase() === email
            ? {
                ...person,
                name: pickPreferredMemberName(person.name, nextUser.name, email) || person.name || nextUser.name,
                email,
                unit: person.unit ?? "미지정",
                accessRole: normalizeAccessRole(person.accessRole),
            }
          : person,
        )
      : canAutoCreateMember
        ? [
            {
              id: createMemberId(),
              name: nextUser.name,
              email,
              role: "both",
              unit: "미지정",
              accessRole: "viewer",
            },
            ...currentPeople,
          ]
        : currentPeople;

    window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(nextUser));
    setAuthError("");
    setAuthUser(nextUser);
    writeAuditLog(
      existingMember || !canAutoCreateMember ? "LOGIN_SUCCESS" : "MEMBER_JOINED",
      email,
      existingMember || !canAutoCreateMember ? `${nextUser.name} 로그인` : `${nextUser.name} 최초 로그인 및 회원 등록`,
      {
        ...currentWorkspace,
        people: nextPeople,
      },
      {
        actorName: nextUser.name,
        actorEmail: nextUser.email,
      },
    );
  }

  function handleLoginSuccess(response) {
    const payload = decodeJwtPayload(response?.credential ?? "");
    const email = String(payload?.email ?? "").toLowerCase();

    completeLogin({
      email,
      name: payload?.name ?? email,
      picture: payload?.picture ?? "",
    }, {
      verified: Boolean(payload?.email_verified),
    });
  }

  function handleDevLogin() {
    const normalizedEmail = String(devLoginEmail ?? "").trim().toLowerCase();
    const currentWorkspace = workspaceRef.current;
    const currentPeople = Array.isArray(currentWorkspace.people) ? currentWorkspace.people : [];
    const matchedMember = currentPeople.find((person) => String(person.email ?? "").trim().toLowerCase() === normalizedEmail);
    const fallbackName = normalizedEmail.split("@")[0] || "local-user";
    completeLogin({
      email: normalizedEmail,
      name: matchedMember?.name ?? fallbackName,
      picture: "",
    }, {
      verified: true,
    });
  }

  function handleLogout() {
    writeAuditLog("LOGOUT", authUser?.email ?? "", `${authUser?.name ?? ""} 로그아웃`);
    window.localStorage.removeItem(AUTH_STORAGE_KEY);
    window.google?.accounts?.id?.disableAutoSelect?.();
    setAuthUser(null);
    setAuthError("");
  }

  useEffect(() => {
    if (authUser || !GOOGLE_CLIENT_ID || !googleLoginRef.current) {
      return;
    }

    let cancelled = false;

    function renderGoogleLogin() {
      if (cancelled || !googleLoginRef.current || !window.google?.accounts?.id) {
        return;
      }

      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: handleLoginSuccess,
        auto_select: false,
        cancel_on_tap_outside: true,
      });
      googleLoginRef.current.innerHTML = "";
      window.google.accounts.id.renderButton(googleLoginRef.current, {
        theme: "filled_black",
        size: "large",
        shape: "rectangular",
        text: "continue_with",
        width: 300,
      });
    }

    if (window.google?.accounts?.id) {
      renderGoogleLogin();
      return () => {
        cancelled = true;
      };
    }

    const existingScript = document.querySelector('script[data-google-identity="true"]');
    if (existingScript) {
      existingScript.addEventListener("load", renderGoogleLogin, { once: true });
      return () => {
        cancelled = true;
      };
    }

    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.dataset.googleIdentity = "true";
    script.onload = renderGoogleLogin;
    script.onerror = () => {
      if (!cancelled) {
        setAuthError("구글 로그인 스크립트를 불러오지 못했습니다.");
      }
    };
    document.head.appendChild(script);

    return () => {
      cancelled = true;
    };
  }, [authUser, effectiveLoginDomains]);

  function syncAssignmentPendingEvidenceCount() {
    const evidenceInputs = Array.from(
      assignmentFormRef.current?.querySelectorAll('input[name="evidenceFiles"]') ?? [],
    );
    const nextCount = evidenceInputs.reduce((count, input) => count + (input.files?.length ?? 0), 0);
    setAssignmentPendingEvidenceCount(nextCount);
  }

  useEffect(() => {
    setEvidenceInputCount(1);
    setAssignmentPendingEvidenceCount(0);
    const nextEntry = getPreferredExecutionEntry(selectedControl);
    const preset = pendingAssignmentPresetRef.current;
    setAssignmentExecutionNote("");
    setAssignmentExecutionYear(String(preset?.executionYear ?? "").trim());
    setAssignmentExecutionPeriod(String(preset?.executionPeriod ?? "").trim());
    setAssignmentReviewChecked(nextEntry?.reviewChecked ?? "미검토");
    pendingAssignmentPresetRef.current = null;
  }, [
    selectedControlId,
    selectedControl?.executionHistory,
    selectedControl?.reviewDept,
    selectedControl?.reviewer,
  ]);

  useEffect(() => {
    if (!selectedControl || !assignmentExecutionYear || !assignmentExecutionPeriod) {
      setAssignmentReviewChecked("미검토");
      return;
    }
    const matchedEntry = getPreferredExecutionEntry(selectedControl, null, {
      executionYear: assignmentExecutionYear,
      executionPeriod: assignmentExecutionPeriod,
    });
    if (!matchedEntry) {
      setAssignmentExecutionNote("");
      setAssignmentReviewChecked("미검토");
      return;
    }
    setAssignmentExecutionNote("");
    setAssignmentReviewChecked(matchedEntry.reviewChecked ?? "미검토");
  }, [selectedControl, assignmentExecutionYear, assignmentExecutionPeriod]);

  useEffect(() => {
    syncAssignmentPendingEvidenceCount();
  }, [evidenceInputCount]);

  useEffect(() => {
    setCompletedEditMode(false);
    setCompletedEditYear(selectedCompletedControl?.executionYear ?? "");
    setCompletedEditPeriod(selectedCompletedControl?.executionPeriod ?? "");
    setCompletedEditNote(selectedCompletedControl?.executionNote ?? "");
    setCompletedEditEvidenceFiles(Array.isArray(selectedCompletedControl?.evidenceFiles) ? selectedCompletedControl.evidenceFiles : []);
    setCompletedEvidenceInputCount(1);
    setCompletedPendingEvidenceCount(0);
  }, [selectedCompletedControl?.completedExecutionKey]);

  useEffect(() => {
    setReviewDecisionDraft(normalizeReviewDecisionLabel(selectedReviewControl?.reviewResult ?? "양호"));
  }, [selectedReviewControl?.reviewExecutionKey, selectedReviewControl?.reviewResult]);

  useEffect(() => {
    if (!HAS_REMOTE_BACKEND) {
      return;
    }

    fetchRemoteIntegrationStatusByBackend()
      .then((status) => {
        setIntegrationStatus({
          spreadsheet: status.spreadsheet ? "연결됨" : "오류",
          drive: status.drive ? "연결됨" : "오류",
        });
      })
      .catch(() => {
        setIntegrationStatus({
          spreadsheet: "오류",
          drive: "오류",
        });
      });
  }, []);

  useEffect(() => {
    if (workspaceCorrectionAppliedRef.current) {
      return;
    }

    workspaceCorrectionAppliedRef.current = true;
    const { workspace: correctedWorkspace, changed } = applyWorkspaceDataCorrections(workspaceRef.current);
    if (changed) {
      commitWorkspace(correctedWorkspace, { syncRemote: HAS_REMOTE_BACKEND });
    }
  }, []);

  useEffect(() => {
    if (!HAS_REMOTE_BACKEND) {
      return;
    }

    let active = true;

    fetchRemoteWorkspaceByBackend()
      .then((remoteWorkspace) => {
        if (!active || !remoteWorkspace || !Array.isArray(remoteWorkspace.controls)) {
          return;
        }

        const normalizedRemoteControls = remoteWorkspace.controls.map(normalizeControl);
        const { workspace: correctedRemoteWorkspace, changed } = applyWorkspaceDataCorrections({
          ...remoteWorkspace,
          controls: normalizedRemoteControls,
          workflows: Array.isArray(remoteWorkspace.workflows) ? remoteWorkspace.workflows : [],
          loginDomains: parseDomainList(remoteWorkspace.loginDomains),
          people: Array.isArray(remoteWorkspace.people) ? remoteWorkspace.people : [],
          auditLogs: Array.isArray(remoteWorkspace.auditLogs) ? remoteWorkspace.auditLogs : [],
        });
        const remoteControls = correctedRemoteWorkspace.controls;
        if (remoteControls.length === 0) {
          const seededWorkspace = {
            controls: structuredClone(defaultData.controls),
            workflows: structuredClone(defaultData.workflows),
            loginDomains: parseDomainList(defaultData.loginDomains),
            people: structuredClone(defaultPeople),
            auditLogs: [],
          };

          updateWorkspace(seededWorkspace);
          syncRemoteWorkspaceByBackend(seededWorkspace).catch(() => {});
          return;
        }

        const currentWorkspace = workspaceRef.current;
        const remotePeople = Array.isArray(correctedRemoteWorkspace.people) ? correctedRemoteWorkspace.people : [];
        const remoteAuditLogs = Array.isArray(correctedRemoteWorkspace.auditLogs) ? correctedRemoteWorkspace.auditLogs : [];
        const remoteLoginDomains = parseDomainList(correctedRemoteWorkspace.loginDomains);
        const localLoginDomains = parseDomainList(currentWorkspace.loginDomains);
        const nextWorkspace = {
          controls: remoteControls,
          workflows: mergeMissingWorkflows(remoteControls, Array.isArray(correctedRemoteWorkspace.workflows) ? correctedRemoteWorkspace.workflows : []),
          loginDomains: remoteLoginDomains.length > 0
            ? remoteLoginDomains
            : (localLoginDomains.length > 0 ? localLoginDomains : parseDomainList(defaultData.loginDomains)),
          people: remotePeople,
          auditLogs: remoteAuditLogs,
        };

        setIntegrationStatus((current) => ({
          ...current,
          spreadsheet: "연결됨",
        }));
        updateWorkspace(nextWorkspace);
        if (changed) {
          syncRemoteWorkspaceByBackend(nextWorkspace).catch(() => {});
        }
      })
      .catch(() => {
        setIntegrationStatus((current) => ({
          ...current,
          spreadsheet: "오류",
        }));
      })
      .finally(() => {
        if (active) {
          setRemoteWorkspaceReady(true);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  function updateWorkspace(nextWorkspaceOrUpdater) {
    const nextWorkspace =
      typeof nextWorkspaceOrUpdater === "function"
        ? nextWorkspaceOrUpdater(workspaceRef.current)
        : nextWorkspaceOrUpdater;

    commitWorkspace(nextWorkspace, { syncRemote: true });
  }

  function commitWorkspace(nextWorkspace, options = {}) {
    const { syncRemote = true } = options;
    const normalizedWorkspace = {
      ...nextWorkspace,
      people: normalizePeopleCollection(Array.isArray(nextWorkspace?.people) ? nextWorkspace.people : []),
    };

    workspaceRef.current = normalizedWorkspace;
    setWorkspace(normalizedWorkspace);
    persistWorkspace(normalizedWorkspace);
    if (syncRemote && HAS_REMOTE_BACKEND) {
      syncRemoteWorkspaceByBackend(normalizedWorkspace)
        .then(() => {
          setIntegrationStatus((current) => ({
            ...current,
            spreadsheet: "연결됨",
          }));
        })
        .catch(() => {
          setIntegrationStatus((current) => ({
            ...current,
            spreadsheet: "오류",
          }));
        });
    }
  }

  function showCenterAlert(message) {
    setCenterAlertMessage(String(message ?? ""));
  }

  function showCenterConfirm(message) {
    return new Promise((resolve) => {
      confirmResolverRef.current = resolve;
      setCenterConfirmMessage(String(message ?? ""));
    });
  }

  function closeCenterConfirm(result) {
    setCenterConfirmMessage("");
    if (confirmResolverRef.current) {
      const resolver = confirmResolverRef.current;
      confirmResolverRef.current = null;
      resolver(result);
    }
  }

  async function ensureRemoteSync(nextWorkspace) {
    if (!HAS_REMOTE_BACKEND) {
      return true;
    }
    try {
      await syncRemoteWorkspaceByBackend(nextWorkspace);
      setIntegrationStatus((current) => ({
        ...current,
        spreadsheet: "연결됨",
      }));
      return true;
    } catch {
      setIntegrationStatus((current) => ({
        ...current,
        spreadsheet: "오류",
      }));
      return false;
    }
  }

  function syncRemoteAuditLog(logEntry) {
    if (!HAS_REMOTE_BACKEND) {
      return;
    }

    createSupabaseAuditLog(logEntry)
      .then((savedLog) => {
        const currentWorkspace = workspaceRef.current;
        const nextWorkspace = {
          ...currentWorkspace,
          auditLogs: mergeAuditLogs(
            [savedLog],
            (currentWorkspace.auditLogs ?? []).filter((item) => item.id !== logEntry.id),
          ),
        };
        commitWorkspace(nextWorkspace, { syncRemote: false });
      })
      .catch(() => {
        setIntegrationStatus((current) => ({
          ...current,
          spreadsheet: current.spreadsheet === "연결됨" ? current.spreadsheet : "오류",
        }));
      });
  }

  function writeAuditLog(action, target, detail, baseWorkspace = null, actorOverride = null, alertContext = null) {
    const currentWorkspace = baseWorkspace ?? workspaceRef.current;
    const actorName = actorOverride?.actorName ?? authUser?.name ?? "";
    const actorEmail = actorOverride?.actorEmail ?? authUser?.email ?? "";
    const createdAtTs = new Date().toISOString();
    const nextLog = {
      id: `LOG-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      action,
      target,
      detail,
      actorName,
      actorEmail,
      ip: "-",
      createdAt: formatSeoulDateTime(new Date()),
      createdAtTs,
    };
    const nextWorkspace = {
      ...currentWorkspace,
      auditLogs: mergeAuditLogs(
        [nextLog],
        currentWorkspace.auditLogs ?? [],
      ),
    };

    commitWorkspace(nextWorkspace, { syncRemote: baseWorkspace !== null });
    syncRemoteAuditLog(nextLog);
    sendGoogleChatControlAlert({
      action,
      target,
      detail,
      actorName,
      actorEmail,
      createdAt: createdAtTs,
      systemUrl: alertContext?.systemUrl,
    });
    return nextWorkspace;
  }

  function buildReportMarkup() {
    const periodLabel = reportPeriodConfig[reportPeriod]?.label ?? "주기";
    const reportYearLabel = reportYear === "all" ? "전체" : `${reportYear}년`;
    const reportTitle = `${reportYearLabel} ${periodLabel === "전체" ? "전체 주기" : periodLabel} 수행 리포트`;
    const toMultilineHtml = (value) => {
      const normalized = String(value ?? "").replace(/\r\n/g, "\n");
      if (!normalized.trim()) {
        return "-";
      }
      return escapeHtml(normalized).replace(/\n/g, "<br />");
    };
    const rows = reportControls.map((item) => `
      <tr>
        <td>${escapeHtml(item.id)}</td>
        <td>${escapeHtml(item.title)}</td>
        <td>${escapeHtml(item.process)}</td>
        <td>${escapeHtml(item.performer)}</td>
        <td>${escapeHtml(item.reviewer)}</td>
        <td>${escapeHtml(item.status)}</td>
        <td>${escapeHtml(item.reviewChecked)}</td>
        <td class="execution-note execution-note-body">${toMultilineHtml(item.executionNote)}</td>
        <td class="execution-note execution-review-note">${toMultilineHtml(item.reviewNote)}</td>
        <td class="execution-evidence-cell">
          <div class="execution-image-list">
            ${item.evidenceFiles
              .filter((file) => isImageEvidence(file) && Boolean(getEvidenceReportImageUrl(file)))
              .map((file) => {
                const primaryUrl = escapeHtml(getEvidenceReportImageUrl(file));
                const fallbackUrl = escapeHtml(getEvidenceReportImageFallbackUrl(file));
                return `<img src="${primaryUrl}" alt="${escapeHtml(file.name || "증적 이미지")}" class="execution-image" onerror="if(this.dataset.fallback && this.src!==this.dataset.fallback){this.src=this.dataset.fallback;return;}this.onerror=null;" data-fallback="${fallbackUrl}" />`;
              })
              .join("")}
          </div>
          ${item.evidenceFiles.filter((file) => isImageEvidence(file) && Boolean(getEvidenceReportImageUrl(file))).length === 0 ? '<div class="execution-empty">-</div>' : ""}
        </td>
      </tr>
    `).join("");

    return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <title>${reportTitle}</title>
  <style>
    @page { size: A4 landscape; margin: 8mm; }
    * { box-sizing: border-box; }
    body { font-family: Arial, sans-serif; padding: 4px; margin: 0; color: #111827; }
    h1 { margin: 0 0 4px; font-size: 18px; line-height: 1.2; }
    p { margin: 0 0 8px; font-size: 10px; color: #4b5563; }
    .summary { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px; margin-bottom: 10px; }
    .summary div { border: 1px solid #d1d5db; border-radius: 4px; padding: 6px 8px; }
    .summary span { font-size: 9px; white-space: nowrap; }
    .summary strong { display: block; margin-top: 2px; font-size: 14px; white-space: nowrap; }
    table { width: 100%; border-collapse: collapse; table-layout: auto; }
    th, td {
      border: 1px solid #d1d5db;
      padding: 4px 5px;
      font-size: 9px;
      vertical-align: middle;
      text-align: center;
      line-height: 1.2;
    }
    th { background: #f3f4f6; }
    .execution-note { background: transparent; box-shadow: none; text-align: left; vertical-align: top; white-space: pre-line; line-height: 1.45; word-break: break-word; overflow-wrap: anywhere; }
    .execution-note-body { min-width: 300px; }
    .execution-review-note { min-width: 72px; max-width: 72px; width: 72px; text-align: center; }
    .execution-evidence-cell { min-width: 220px; text-align: left; vertical-align: top; }
    .execution-image-list { display: grid; grid-template-columns: 1fr; gap: 8px; margin-top: 0; width: 100%; }
    .execution-empty { width: 100%; text-align: left; color: #6b7280; }
    .execution-image { display: block; width: 100%; min-height: 160px; max-height: 260px; object-fit: contain; border: 1px solid #d1d5db; background: #fff; }
  </style>
</head>
<body>
  <h1>${reportTitle}</h1>
  <p>생성 시각: ${formatSeoulDateTime(new Date())}</p>
  <div class="summary">
    <div><span>전체</span><strong>${reportSummary.total}건</strong></div>
    <div><span>완료</span><strong>${reportSummary.completed}건</strong></div>
    <div><span>진행 중</span><strong>${reportSummary.inProgress}건</strong></div>
    <div><span>예정</span><strong>${reportSummary.scheduled}건</strong></div>
  </div>
  <table>
    <thead>
      <tr>
        <th>ID</th><th>통제명</th><th>카테고리</th><th>수행자</th><th>검토자</th><th>상태</th><th>승인</th><th>수행 내역</th><th>검토 의견</th><th>증적</th>
      </tr>
    </thead>
    <tbody>${rows || '<tr><td colspan="10">대상 통제가 없습니다.</td></tr>'}</tbody>
  </table>
</body>
</html>`;
  }

  function handleRemoveEvidenceFile(fileIndex) {
    if (!selectedControl) {
      return;
    }

    const targetEntry = getPreferredExecutionEntry(selectedControl, null, {
      executionYear: assignmentExecutionYear,
      executionPeriod: assignmentExecutionPeriod,
    });
    if (!targetEntry) {
      return;
    }

    const nextEvidenceFiles = (targetEntry.evidenceFiles ?? []).filter((_, index) => index !== fileIndex);
    const nextHistory = getControlExecutionHistory(selectedControl).map((entry) =>
      entry.executionYear === targetEntry.executionYear && entry.executionPeriod === targetEntry.executionPeriod
        ? {
            ...entry,
            evidenceFiles: nextEvidenceFiles,
            evidenceStatus: nextEvidenceFiles.length > 0 ? (entry.evidenceStatus || "수집 중") : "미수집",
          }
        : entry,
    );
    const nextWorkspace = {
      ...workspace,
      controls: controls.map((control) =>
        control.id === selectedControl.id
          ? mergeExecutionHistoryIntoControl(control, nextHistory, {
              executionYear: targetEntry.executionYear,
              executionPeriod: targetEntry.executionPeriod,
            })
          : control,
      ),
    };

    writeAuditLog("EXECUTION_SAVED", selectedControl.id, `${selectedControl.title} 증적 파일 삭제`, nextWorkspace);
  }

  function handleOpenEvidencePreview(file) {
    if (!file) {
      return;
    }

    const previewUrl = isImageEvidence(file) ? getEvidencePreviewUrl(file) : getEvidenceEmbedUrl(file);
    if (!previewUrl) {
      showCenterAlert("저장된 파일만 미리볼 수 있습니다.");
      return;
    }

    setEvidencePreviewFile(file);
  }

  function handleDownloadEvidence(file) {
    const href = String(file?.url ?? "").trim();
    if (!href) {
      showCenterAlert("다운로드할 파일 URL이 없습니다.");
      return;
    }

    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = String(file?.name || "evidence");
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
  }

  function handleReportExport() {
    const periodLabel = reportPeriodConfig[reportPeriod]?.label ?? "주기";
    const reportPeriodLabel = periodLabel === "전체" ? "전체 주기" : periodLabel;
    const reportYearLabel = reportYear === "all" ? "전체" : `${reportYear}년`;
    const markup = buildReportMarkup();
    setReportPreviewMarkup(markup);
    setReportPreviewOpen(true);
    writeAuditLog("REPORT_VIEWED", `${reportYear}-${reportPeriod}`, `${reportYearLabel} ${reportPeriodLabel} 수행 리포트 미리보기`);
  }

  function handlePrintReportPreview() {
    const periodLabel = reportPeriodConfig[reportPeriod]?.label ?? "주기";
    const reportPeriodLabel = periodLabel === "전체" ? "전체 주기" : periodLabel;
    const reportYearLabel = reportYear === "all" ? "전체" : `${reportYear}년`;
    const frameWindow = reportPreviewFrameRef.current?.contentWindow;
    if (!frameWindow) {
      return;
    }

    frameWindow.focus();
    frameWindow.print();
    writeAuditLog(
      reportFormat === "html" ? "REPORT_HTML_EXPORTED" : "REPORT_PDF_PRINTED",
      `${reportYear}-${reportPeriod}`,
      `${reportYearLabel} ${reportPeriodLabel} 수행 리포트 ${reportFormat === "html" ? "HTML 출력" : "PDF 출력"}`,
    );
  }

  function resetWorkspace() {
    updateWorkspace({
      ...structuredClone(defaultData),
      loginDomains: parseDomainList(defaultData.loginDomains),
      people: structuredClone(defaultPeople),
      auditLogs: [],
    });
    setCurrentView("controls");
    setSelectedControlId("");
    setProcessFilter("전체");
    setControlListPage(1);
    setControlPanelMode("create");
  }

  function handleExportWorkspaceBackup() {
    const payload = {
      exportedAt: new Date().toISOString(),
      storageKey: STORAGE_KEY,
      workspace,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    anchor.href = url;
    anchor.download = `itgc-workspace-backup-${timestamp}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
    showCenterAlert("워크스페이스 백업 파일을 저장했습니다.");
  }

  function handleImportWorkspaceBackupClick() {
    workspaceBackupInputRef.current?.click();
  }

  async function handleImportWorkspaceBackupFileChange(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }

    let importedWorkspace;
    try {
      importedWorkspace = normalizeImportedWorkspace(JSON.parse(await file.text()));
    } catch {
      showCenterAlert("백업 파일을 읽지 못했습니다. 올바른 JSON 파일인지 확인하세요.");
      return;
    }

    const confirmed = await showCenterConfirm("현재 데이터를 백업 파일 내용으로 교체합니다. 계속하시겠습니까?");
    if (!confirmed) {
      return;
    }

    commitWorkspace(importedWorkspace, { syncRemote: true });
    setCurrentView("control-workbench");
    setWorkbenchTab("controls");
    setControlListPage(1);
    setSelectedControlId(importedWorkspace.controls[0]?.id ?? "");
    setSelectedCompletedExecutionKey("");
    setSelectedReviewExecutionKey("");
    setSelectedPerformedExecutionKey("");
    setProcessFilter("전체");
    setControlUnitFilter("전체");
    setReviewUnitFilter("전체");
    showCenterAlert("백업 파일로 워크스페이스를 복원했습니다.");
  }

  function advanceWorkflow(workflowId) {
    updateWorkspace({
      ...workspace,
      workflows: workflows.map((workflow) =>
        workflow.id === workflowId ? { ...workflow, status: nextWorkflowStatus(workflow.status) } : workflow,
      ),
    });
  }

  function updateRegistrationField(key, value) {
    setRegistrationForm((prev) => ({ ...prev, [key]: value }));
  }

  function toggleRegistrationSystem(system) {
    setRegistrationForm((prev) => ({
      ...prev,
      targetSystems: (prev.targetSystems ?? []).includes(system)
        ? prev.targetSystems.filter((item) => item !== system)
        : [...(prev.targetSystems ?? []), system],
    }));
  }

  function loadRegistrationControl(control) {
    const snapshot = buildControlManagementSnapshot(control);
    const fallbackControlActivity =
      snapshot.controlActivity
      ?? snapshot.attributes?.[0]
      ?? snapshot.purpose
      ?? "";
    const fallbackDescription =
      snapshot.description
      ?? snapshot.population
      ?? snapshot.note
      ?? "";
    const fallbackTargetSystems =
      Array.isArray(snapshot.targetSystems) && snapshot.targetSystems.length > 0
        ? snapshot.targetSystems
        : resolveDefaultSystems(snapshot.process);

    setRegistrationSelectedControlId(snapshot.id);
    setRegistrationForm({
      controlId: snapshot.id ?? "",
      process: snapshot.process ?? "",
      subProcess: snapshot.subProcess ?? "",
      risk: snapshot.riskName ?? "",
      controlName: snapshot.title ?? "",
      controlObjective: snapshot.controlObjective ?? snapshot.purpose ?? "",
      controlActivity: fallbackControlActivity,
      description: fallbackDescription,
      frequency: snapshot.frequency ?? "수시",
      controlType: snapshot.controlType ?? "예방",
      automationLevel: snapshot.automationLevel ?? "수동",
      keyControl: isKeyControl(snapshot.keyControl),
      ownerDept: normalizeUnitLabel(snapshot.performDept ?? snapshot.performer ?? ""),
      reviewDept: normalizeUnitLabel(snapshot.reviewDept ?? snapshot.reviewer ?? ""),
      evidence: resolveControlEvidenceText(snapshot),
      testMethod: resolveControlTestMethod(snapshot),
      population: snapshot.population ?? "",
      policyReference: snapshot.policyReference ?? "",
      deficiencyImpact: snapshot.deficiencyImpact ?? "높음",
      targetSystems: fallbackTargetSystems,
    });
  }

  function startNewRegistration() {
    setRegistrationSelectedControlId("");
    setRegistrationForm(initialRegistrationForm);
  }

  function saveRegisteredControl() {
    if (!isAdmin) {
      showCenterAlert("admin 권한만 통제 등록/수정이 가능합니다.");
      return;
    }
    if (!canSubmitRegistration) {
      showCenterAlert(`필수 항목이 누락되었습니다: ${registrationMissingFields.join(", ")}`);
      return;
    }
    if (
      registrationForm.controlName.trim()
      && registrationForm.controlActivity.trim()
      && registrationForm.controlName.trim() === registrationForm.controlActivity.trim()
    ) {
      showCenterAlert("통제명과 Activity는 동일하게 입력할 수 없습니다.");
      return;
    }

    const editingControl = controls.find((control) => control.id === registrationSelectedControlId) ?? null;
    const nextControlCatalog = controlCatalog[registrationForm.controlId.trim()] ?? {};
    const preservedReviewer = normalizeUnitLabel(editingControl?.reviewer ?? editingControl?.reviewDept ?? "");
    const resolvedReviewDept = normalizeUnitLabel(registrationForm.reviewDept) || preservedReviewer;
    const preservedCycle = String(editingControl?.cycle ?? nextControlCatalog.cycle ?? "").trim();
    const preservedRiskId = String(editingControl?.riskId ?? nextControlCatalog.riskId ?? "").trim();
    const preservedDeficiencyImpact = String(
      registrationForm.deficiencyImpact.trim()
      || editingControl?.deficiencyImpact
      || nextControlCatalog.deficiencyImpact
      || "",
    ).trim();

    const nextControl = normalizeControl({
      id: registrationForm.controlId.trim(),
      cycle: preservedCycle,
      process: registrationForm.process.trim(),
      subProcess: registrationForm.subProcess.trim() || registrationForm.process.trim(),
      title: registrationForm.controlName.trim(),
      purpose: registrationForm.controlObjective.trim(),
      riskId: preservedRiskId,
      riskName: registrationForm.risk.trim(),
      controlObjective: registrationForm.controlObjective.trim(),
      controlActivity: registrationForm.controlActivity.trim(),
      description: registrationForm.description.trim(),
      frequency: registrationForm.frequency,
      controlType: registrationForm.controlType,
      keyControl: registrationForm.keyControl ? "Yes" : "No",
      status: "점검 예정",
      evidenceStatus: "미수집",
      ownerDept: normalizeUnitLabel(registrationForm.ownerDept),
      performer: normalizeUnitLabel(registrationForm.ownerDept),
      reviewer: resolvedReviewDept,
      performDept: normalizeUnitLabel(registrationForm.ownerDept),
      reviewDept: resolvedReviewDept,
      targetSystems: registrationForm.targetSystems ?? [],
      note: "",
      population: registrationForm.population.trim(),
      attributes: [
        registrationForm.controlActivity.trim(),
        registrationForm.policyReference.trim(),
        preservedDeficiencyImpact,
      ].filter(Boolean),
      evidences: registrationForm.evidence.split(",").map((item) => item.trim()).filter(Boolean),
      procedures: registrationForm.testMethod.split(",").map((item) => item.trim()).filter(Boolean),
      automationLevel: registrationForm.automationLevel,
      evidenceText: registrationForm.evidence.trim(),
      testMethod: registrationForm.testMethod.trim(),
      policyReference: registrationForm.policyReference.trim(),
      deficiencyImpact: preservedDeficiencyImpact,
    });
    const duplicateControl = controls.find((control) => control.id === nextControl.id);

    if (duplicateControl && duplicateControl.id !== editingControl?.id) {
      showCenterAlert("같은 통제번호가 이미 존재합니다.");
      return;
    }

    if (editingControl) {
      const nextWorkspace = {
        ...workspace,
        controls: controls.map((control) =>
          control.id === editingControl.id ? nextControl : control,
        ),
        workflows: workflows.map((workflow) =>
          workflow.controlId === editingControl.id
            ? {
                ...workflow,
                controlId: nextControl.id,
                assignee: nextControl.performDept,
                reviewer: nextControl.reviewDept,
              }
            : workflow,
        ),
      };
      writeAuditLog("CONTROL_UPDATED", nextControl.id, `${nextControl.title} 수정`, nextWorkspace);
      setRegistrationSelectedControlId(nextControl.id);
      showCenterAlert("통제를 수정했습니다.");
      return;
    }

    const seededWorkflows = createDefaultWorkflowSeeds([nextControl]).map((workflow, index) => ({
      ...workflow,
      id: `WF-${String(workflows.length + index + 1).padStart(3, "0")}`,
    }));

    const nextWorkspace = {
      ...workspace,
      controls: [nextControl, ...controls],
      workflows: [...seededWorkflows, ...workflows],
    };
    writeAuditLog("CONTROL_CREATED", nextControl.id, `${nextControl.title} 등록`, nextWorkspace);
    window.localStorage.removeItem(REGISTRATION_DRAFT_KEY);
    setRegistrationSelectedControlId(nextControl.id);
    showCenterAlert("통제를 등록했습니다.");
  }

  async function handleRegisteredControlDelete() {
    if (!isAdmin) {
      showCenterAlert("admin 권한만 통제 등록/수정이 가능합니다.");
      return;
    }

    const targetControl =
      controls.find((control) => control.id === registrationSelectedControlId)
      ?? registrationSelectedControl
      ?? null;
    if (!targetControl) {
      showCenterAlert("삭제할 통제를 먼저 선택하세요.");
      return;
    }

    const confirmed = await showCenterConfirm(`${targetControl.id} 통제를 삭제할까요?`);
    if (!confirmed) {
      return;
    }

    const verificationCode = createDeleteVerificationCode();
    const enteredCode = typeof window !== "undefined"
      ? window.prompt(
        `삭제 확인값을 입력하세요.\n확인값: ${verificationCode}`,
        "",
      )
      : null;

    if (enteredCode === null) {
      showCenterAlert("통제 삭제를 취소했습니다.");
      return;
    }
    if (enteredCode.trim().toUpperCase() !== verificationCode) {
      showCenterAlert("확인값이 일치하지 않아 삭제하지 않았습니다.");
      return;
    }

    if (HAS_REMOTE_BACKEND) {
      try {
        await deleteSupabaseControl(targetControl.id);
      } catch {
        showCenterAlert("통제 삭제를 DB에 반영하지 못했습니다. 다시 시도해주세요.");
        return;
      }
    }

    const nextControls = controls.filter((control) => control.id !== targetControl.id);
    const nextWorkflows = workflows.filter((workflow) => workflow.controlId !== targetControl.id);
    const nextRegistrationControlId = nextControls[0]?.id ?? "";
    const nextWorkspace = {
      ...workspace,
      controls: nextControls,
      workflows: nextWorkflows,
    };

    writeAuditLog("CONTROL_DELETED", targetControl.id, `${targetControl.title} 삭제`, nextWorkspace);

    setRegistrationSelectedControlId(nextRegistrationControlId);
    if (!nextRegistrationControlId) {
      setRegistrationForm(initialRegistrationForm);
    }
    if (selectedControlId === targetControl.id) {
      setSelectedControlId(nextControls[0]?.id ?? "");
    }
    if (roleAssignmentControlId === targetControl.id) {
      setRoleAssignmentControlId(nextControls[0]?.id ?? "");
    }
    showCenterAlert(HAS_REMOTE_BACKEND ? "통제가 삭제되고 DB에도 반영되었습니다." : "통제를 삭제했습니다.");
  }

  useEffect(() => {
    if (currentView !== "register" || !registrationSelectedControlId) {
      return;
    }

    const control = controls.find((item) => item.id === registrationSelectedControlId);
    if (control) {
      loadRegistrationControl(control);
    }
  }, [currentView, controls, registrationSelectedControlId]);

  useEffect(() => {
    if (!registrationSelectedControlId) {
      return;
    }

    if (!controls.some((control) => control.id === registrationSelectedControlId)) {
      setRegistrationSelectedControlId("");
    }
  }, [controls, registrationSelectedControlId]);

  function handleMemberDraftChange(personId, key, value) {
    if (!canManageMembers) {
      return;
    }

    setMemberDrafts((current) => ({
      ...current,
      [personId]: {
        ...(current[personId] ?? {}),
        [key]: value,
      },
    }));
  }

  async function handleMemberSave(personId, overrideDraft = null, options = {}) {
    const { suppressPopup = false } = options;
    if (!canManageMembers) {
      return;
    }

    const sourcePerson = memberDirectory.find((person) => person.id === personId);
    if (!sourcePerson) return;

    const draft = overrideDraft ?? memberDrafts[personId] ?? {
      unit: sourcePerson.unit ?? "미지정",
      accessRole: normalizeAccessRole(sourcePerson.accessRole),
    };
    const normalizedEmail = String(sourcePerson.email ?? "").trim().toLowerCase();
    const existingIndex = people.findIndex((person) => {
      if (person.id === personId) {
        return true;
      }
      if (!normalizedEmail) {
        return false;
      }
      return String(person.email ?? "").trim().toLowerCase() === normalizedEmail;
    });
    const nextEntry = {
      id: existingIndex >= 0
        ? people[existingIndex].id
        : personId.startsWith("AUTH-")
          ? createMemberId()
          : personId,
      name: sourcePerson.name,
      email: normalizedEmail,
      role: existingIndex >= 0 ? people[existingIndex].role ?? sourcePerson.role ?? "both" : sourcePerson.role ?? "both",
      unit: draft.unit.trim() || "미지정",
      accessRole: normalizeAccessRole(draft.accessRole),
    };

    if (nextEntry.accessRole === "admin" && !isAllowedEmailBySet(nextEntry.email, loginDomainSet)) {
      showCenterAlert(`admin 권한은 ${allowedDomainText} 도메인 계정에만 부여할 수 있습니다.`);
      return;
    }

    const nextPeople =
      existingIndex >= 0
        ? people.map((person, index) => (index === existingIndex ? { ...person, ...nextEntry } : person))
        : [nextEntry, ...people];
    if (nextEntry.email) {
      setDeletedMemberEmails((current) => current.filter((email) => email !== nextEntry.email));
    }

    const previousPerson = existingIndex >= 0 ? people[existingIndex] : null;
    const action =
      !previousPerson
        ? "MEMBER_JOINED"
        : previousPerson.accessRole !== nextEntry.accessRole
          ? "ROLE_CHANGED"
          : "MEMBER_UPDATED";

    const loggedWorkspace = writeAuditLog(
      action,
      nextEntry.email || nextEntry.id,
      buildMemberChangeDetail(previousPerson, nextEntry),
      {
        ...workspace,
        people: nextPeople,
      },
    );
    const synced = await ensureRemoteSync(loggedWorkspace);
    if (!HAS_REMOTE_BACKEND || synced) {
      if (!suppressPopup) {
        setMemberSavePopupMessage("회원 정보가 저장되었습니다.");
      }
      return;
    }
    showCenterAlert("회원 정보 저장은 되었지만 원격 동기화에 실패했습니다.");
  }

  async function handleSaveAllMemberDrafts() {
    if (!canManageMembers) {
      return;
    }

    const deleteTargets = memberDirectory.filter((person) => Boolean(memberDrafts[person.id]?.deleteChecked));
    const draftEntries = Object.entries(memberDrafts).filter(([personId, draft]) => {
      if (!draft || typeof draft !== "object") {
        return false;
      }
      if (draft.deleteChecked) {
        return false;
      }
      const sourcePerson = memberDirectory.find((person) => person.id === personId);
      if (!sourcePerson) {
        return false;
      }
      const currentUnit = String(sourcePerson.unit ?? "미지정").trim() || "미지정";
      const draftUnit = String(draft.unit ?? currentUnit).trim() || "미지정";
      const currentAccessRole = normalizeAccessRole(sourcePerson.accessRole);
      const draftAccessRole = normalizeAccessRole(draft.accessRole ?? currentAccessRole);
      return draftUnit !== currentUnit || draftAccessRole !== currentAccessRole;
    });
    if (draftEntries.length === 0 && deleteTargets.length === 0) {
      showCenterAlert("저장할 회원 변경 내역이 없습니다.");
      return;
    }

    let nextPeople = [...people];
    const restoredEmails = [];
    const auditEntries = [];
    const deletedDraftIds = [];
    const normalizedAuthEmail = String(authUser?.email ?? "").trim().toLowerCase();

    for (const targetPerson of deleteTargets) {
      const normalizedTargetEmail = String(targetPerson.email ?? "").trim().toLowerCase();
      if (normalizedAuthEmail && normalizedTargetEmail && normalizedAuthEmail === normalizedTargetEmail) {
        showCenterAlert("현재 로그인한 본인 계정은 삭제할 수 없습니다.");
        return;
      }

      const adminCount = nextPeople.filter((person) => normalizeAccessRole(person.accessRole) === "admin").length;
      if (normalizeAccessRole(targetPerson.accessRole) === "admin" && adminCount <= 1) {
        showCenterAlert("마지막 admin 계정은 삭제할 수 없습니다.");
        return;
      }

      nextPeople = nextPeople.filter((person) => person.id !== targetPerson.id);
      deletedDraftIds.push(targetPerson.id);

      auditEntries.push({
        id: `LOG-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        action: "MEMBER_DELETED",
        target: targetPerson.email || targetPerson.id,
        detail: `${targetPerson.name} 회원 삭제`,
        actorName: authUser?.name ?? "",
        actorEmail: authUser?.email ?? "",
        ip: "-",
        createdAt: formatSeoulDateTime(new Date()),
        createdAtTs: new Date().toISOString(),
      });
    }

    for (const [personId, draft] of draftEntries) {
      const sourcePerson = memberDirectory.find((person) => person.id === personId);
      if (!sourcePerson) {
        continue;
      }

      const normalizedEmail = String(sourcePerson.email ?? "").trim().toLowerCase();
      const existingIndex = nextPeople.findIndex((person) => {
        if (person.id === personId) {
          return true;
        }
        if (!normalizedEmail) {
          return false;
        }
        return String(person.email ?? "").trim().toLowerCase() === normalizedEmail;
      });
      const previousPerson = existingIndex >= 0 ? nextPeople[existingIndex] : null;
      const nextEntry = {
        id: existingIndex >= 0
          ? nextPeople[existingIndex].id
          : personId.startsWith("AUTH-")
            ? createMemberId()
            : personId,
        name: sourcePerson.name,
        email: normalizedEmail,
        role: existingIndex >= 0 ? nextPeople[existingIndex].role ?? sourcePerson.role ?? "both" : sourcePerson.role ?? "both",
        unit: String(draft.unit ?? "").trim() || "미지정",
        accessRole: normalizeAccessRole(draft.accessRole),
      };

      if (nextEntry.accessRole === "admin" && !isAllowedEmailBySet(nextEntry.email, loginDomainSet)) {
        showCenterAlert(`admin 권한은 ${allowedDomainText} 도메인 계정에만 부여할 수 있습니다.`);
        return;
      }

      nextPeople =
        existingIndex >= 0
          ? nextPeople.map((person, index) => (index === existingIndex ? { ...person, ...nextEntry } : person))
          : [nextEntry, ...nextPeople];

      if (nextEntry.email) {
        restoredEmails.push(nextEntry.email);
      }

      auditEntries.push({
        id: `LOG-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        action:
          !previousPerson
            ? "MEMBER_JOINED"
            : normalizeAccessRole(previousPerson.accessRole) !== nextEntry.accessRole
              ? "ROLE_CHANGED"
              : "MEMBER_UPDATED",
        target: nextEntry.email || nextEntry.id,
        detail: buildMemberChangeDetail(previousPerson, nextEntry),
        actorName: authUser?.name ?? "",
        actorEmail: authUser?.email ?? "",
        ip: "-",
        createdAt: formatSeoulDateTime(new Date()),
        createdAtTs: new Date().toISOString(),
      });
    }

    const normalizedPeople = normalizePeopleCollection(nextPeople);
    if (restoredEmails.length > 0) {
      const restoredEmailSet = new Set(restoredEmails);
      setDeletedMemberEmails((current) => current.filter((email) => !restoredEmailSet.has(email)));
    }
    if (deleteTargets.length > 0) {
      const deletedEmails = deleteTargets
        .map((person) => String(person.email ?? "").trim().toLowerCase())
        .filter(Boolean);
      if (deletedEmails.length > 0) {
        setDeletedMemberEmails((current) => [...new Set([...current, ...deletedEmails])]);
      }
    }

    const loggedWorkspace = {
      ...workspace,
      people: normalizedPeople,
      auditLogs: mergeAuditLogs(auditEntries, workspace.auditLogs ?? []),
    };
    commitWorkspace(loggedWorkspace, { syncRemote: false });

    if (HAS_REMOTE_BACKEND && deleteTargets.length > 0) {
      try {
        for (const targetPerson of deleteTargets) {
          await deleteSupabaseMember(targetPerson.id);
        }
      } catch {
        showCenterAlert("회원 삭제를 DB에 반영하지 못했습니다. 다시 시도해주세요.");
        return;
      }
    }

    const synced = await ensureRemoteSync(loggedWorkspace);
    setMemberDrafts((current) => {
      if (deletedDraftIds.length === 0) {
        return current;
      }
      const nextDrafts = { ...current };
      deletedDraftIds.forEach((id) => {
        delete nextDrafts[id];
      });
      return nextDrafts;
    });
    if (!HAS_REMOTE_BACKEND || synced) {
      setMemberSavePopupMessage(deleteTargets.length > 0 ? "회원 정보와 삭제 사항이 저장되었습니다." : "회원 정보가 저장되었습니다.");
      return;
    }
    showCenterAlert("회원 정보 저장은 되었지만 원격 동기화에 실패했습니다.");
  }

  async function handleMemberDelete(personId) {
    if (!canManageMembers) {
      return;
    }

    const targetPerson = people.find((person) => person.id === personId);
    if (!targetPerson) {
      return;
    }

    const normalizedAuthEmail = String(authUser?.email ?? "").trim().toLowerCase();
    const normalizedTargetEmail = String(targetPerson.email ?? "").trim().toLowerCase();
    if (normalizedAuthEmail && normalizedTargetEmail && normalizedAuthEmail === normalizedTargetEmail) {
      showCenterAlert("현재 로그인한 본인 계정은 삭제할 수 없습니다.");
      return;
    }

    const adminCount = people.filter((person) => normalizeAccessRole(person.accessRole) === "admin").length;
    if (normalizeAccessRole(targetPerson.accessRole) === "admin" && adminCount <= 1) {
      showCenterAlert("마지막 admin 계정은 삭제할 수 없습니다.");
      return;
    }

    const confirmed = await showCenterConfirm(`${targetPerson.name} 계정을 삭제할까요?`);
    if (!confirmed) {
      return;
    }

    try {
      await deleteSupabaseMember(targetPerson.id);
    } catch {
      showCenterAlert("회원 삭제를 DB에 반영하지 못했습니다. 다시 시도해주세요.");
      return;
    }

    const nextPeople = people.filter((person) => person.id !== personId);
    if (normalizedTargetEmail) {
      setDeletedMemberEmails((current) => [...new Set([...current, normalizedTargetEmail])]);
    }
    const nextWorkspace = {
      ...workspace,
      people: nextPeople,
    };

    setMemberDrafts((current) => {
      const nextDrafts = { ...current };
      delete nextDrafts[personId];
      return nextDrafts;
    });

    const loggedWorkspace = writeAuditLog(
      "MEMBER_DELETED",
      targetPerson.email || targetPerson.id,
      `${targetPerson.name} 회원 삭제`,
      nextWorkspace,
    );
    const synced = await ensureRemoteSync(loggedWorkspace);
    if (!HAS_REMOTE_BACKEND || synced) {
      setMemberSavePopupMessage("회원 정보가 삭제되었습니다.");
      return;
    }
    showCenterAlert("회원 삭제는 되었지만 원격 동기화에 실패했습니다.");
  }

  function handleLoginDomainSave() {
    if (!canManageMembers) {
      return;
    }

    const nextDomains = parseDomainList(loginDomainDraft);
    if (nextDomains.length === 0) {
      showCenterAlert("최소 1개 로그인 허용 도메인을 입력하세요.");
      return;
    }

    const normalizedAuthEmail = String(authUser?.email ?? "").trim().toLowerCase();
    if (normalizedAuthEmail && !isAllowedEmailBySet(normalizedAuthEmail, new Set(nextDomains))) {
      showCenterAlert("현재 로그인 계정 도메인이 제외되어 저장할 수 없습니다.");
      return;
    }

    const nextWorkspace = {
      ...workspace,
      loginDomains: nextDomains,
    };
    window.localStorage.setItem(LOGIN_DOMAIN_STORAGE_KEY, nextDomains.join(","));
    setLoginDomains(nextDomains);
    setLoginDomainDraft(nextDomains.join(", "));
    writeAuditLog("MEMBER_UPDATED", "login-domain", `로그인 허용 도메인 변경: ${nextDomains.join(", ")}`, nextWorkspace);
    showCenterAlert("로그인 허용 도메인이 저장되었습니다.");
  }

  function handleRoleAssignmentSubmit(event) {
    event.preventDefault();
    if (!isAdmin) {
      showCenterAlert("admin 권한만 통제 등록/수정이 가능합니다.");
      return;
    }
    if (!roleAssignmentControl) return;

    const formData = new FormData(event.currentTarget);
    const performer = normalizeUnitLabel(formData.get("performer").toString());
    const reviewer = normalizeUnitLabel(formData.get("reviewer").toString());

    updateWorkspace({
      ...workspace,
      controls: controls.map((control) =>
        control.id === roleAssignmentControl.id
          ? {
              ...control,
              performer,
              reviewer,
              performDept: performer,
              reviewDept: reviewer,
            }
          : control,
      ),
      workflows: workflows.map((workflow) =>
        workflow.controlId === roleAssignmentControl.id
          ? {
              ...workflow,
              assignee: performer,
              reviewer,
            }
          : workflow,
      ),
    });
  }

  function handleUiThemeChange(nextTheme) {
    if (!canManageMembers) {
      return;
    }
    if (!UI_THEME_VALUES.has(nextTheme)) {
      return;
    }
    if (nextTheme === uiTheme) {
      return;
    }
    setUiTheme(nextTheme);
    writeAuditLog("MEMBER_UPDATED", "ui-theme", `UI 테마 변경: ${uiTheme} -> ${nextTheme}`);
  }

  async function handleAssignmentSubmit(event) {
    event.preventDefault();
    if (!canOperateControl) {
      showCenterAlert("reviewer 이상 권한만 통제 수행/검토가 가능합니다.");
      return;
    }
    if (!selectedControl) return;

    const formData = new FormData(event.currentTarget);
    const submitMode = "complete";
    const files = formData
      .getAll("evidenceFiles")
      .filter((value) => value instanceof File && value.size > 0);
    const executionNote = formData.get("executionNote").toString().trim();
    const executionYear = formData.get("executionYear").toString().trim();
    const executionPeriod = formData.get("executionPeriod").toString().trim();
    const executionAuthorName = String(authUser?.name ?? "").trim();
    const executionAuthorEmail = normalizedAuthEmail;
    const executionAuthorUnit = String(selectedControl.performDept ?? selectedControl.performer ?? selectedControl.ownerDept ?? "").trim();
    const status = executionNote ? "점검 중" : "점검 예정";
    const currentExecutionEntry = getPreferredExecutionEntry(selectedControl, null, {
      executionYear,
      executionPeriod,
    });
    let nextEvidenceFiles = Array.isArray(currentExecutionEntry?.evidenceFiles) ? [...currentExecutionEntry.evidenceFiles] : [];
    let uploaded = false;

    if (!executionAuthorEmail) {
      showCenterAlert("로그인 계정 정보를 확인할 수 없어 등록 완료를 할 수 없습니다.");
      return;
    }

    if (!executionYear) {
      showCenterAlert("년도는 필수입니다.");
      return;
    }

    if (!executionPeriod) {
      showCenterAlert("주기는 필수입니다.");
      return;
    }

    if (!executionNote) {
      showCenterAlert("수행 내역을 입력하세요.");
      return;
    }

    if (files.length > 0) {
      try {
        const uploadResult = await uploadEvidenceFiles(selectedControl.id, files);
        nextEvidenceFiles = [...nextEvidenceFiles, ...uploadResult.files];
        uploaded = uploadResult.uploaded;
        setIntegrationStatus((current) => ({
          ...current,
          drive: uploadResult.uploaded ? "연결됨" : current.drive,
        }));
      } catch (error) {
        const code = String(error?.message ?? "");
        const normalized = code.toLowerCase();
        let message = "증적 파일을 Google Drive에 저장하지 못했습니다. 다시 시도해주세요.";
        if (normalized.includes("access_denied")) {
          message = "Google OAuth 권한이 거부되어 업로드할 수 없습니다. 테스트 사용자 등록/앱 게시 상태를 확인하세요.";
        } else if (normalized.includes("insufficientfilepermissions") || normalized.includes("file not found")) {
          message = "Google Drive 폴더 접근 권한이 없습니다. 폴더 권한과 폴더 ID를 확인하세요.";
        } else if (normalized.includes("google_drive_not_configured")) {
          message = "Google Drive 설정이 누락되었습니다. `VITE_GOOGLE_CLIENT_ID`와 `VITE_GOOGLE_DRIVE_FOLDER_ID`를 확인하세요.";
        } else if (normalized.includes("google_oauth_not_ready") || normalized.includes("google_oauth_script_load_failed")) {
          message = "Google OAuth 스크립트를 불러오지 못했습니다. 페이지를 새로고침한 뒤 다시 시도하세요.";
        } else if (normalized.includes("popup_closed_by_user")) {
          message = "Google 권한 팝업이 닫혀 업로드가 취소되었습니다.";
        }
        const debugMessage = `${message}\n[debug] ${code || "unknown_error"}`;
        setIntegrationStatus((current) => ({
          ...current,
          drive: "오류",
        }));
        showCenterAlert(debugMessage);
        console.error("Google Drive upload failed:", error);
        return;
      }
    }

    if (submitMode === "complete" && (Array.isArray(nextEvidenceFiles) ? nextEvidenceFiles.length : 0) === 0) {
      showCenterAlert("증적 파일이 없으면 통제 수행 등록 완료를 할 수 없습니다.");
      return;
    }

    const nextExecutionId = createExecutionEntryKey(selectedControl.id, executionYear, executionPeriod);
    const savedAt = new Date().toISOString();

    const nextWorkspace = {
      ...workspace,
      controls: controls.map((control) => {
        if (control.id !== selectedControl.id) {
          return control;
        }

        const nextEntry = {
          ...(currentExecutionEntry ?? {}),
          executionId: nextExecutionId,
          executionYear,
          executionPeriod,
          executionNote,
          testMethodSnapshot: String(control.testMethod ?? "").trim(),
          populationSnapshot: String(control.population ?? "").trim(),
          evidenceTextSnapshot: String(control.evidenceText ?? "").trim(),
          executionSubmitted: submitMode === "complete",
          reviewRequested: false,
          executionAuthorName,
          executionAuthorEmail,
          executionAuthorUnit,
          reviewChecked: "미검토",
          note: "",
          reviewResult: "",
          reviewAuthorName: "",
          reviewAuthorEmail: "",
          reviewAuthorUnit: String(control.reviewDept ?? control.reviewer ?? "").trim(),
          reviewDate: "",
          status,
          evidenceFiles: nextEvidenceFiles,
          evidenceStatus: nextEvidenceFiles.length > 0 && uploaded ? "준비 완료" : nextEvidenceFiles.length > 0 ? "수집 중" : "미수집",
          createdAt: String(currentExecutionEntry?.createdAt ?? "").trim() || savedAt,
          updatedAt: savedAt,
        };
        const nextHistory = [
          ...getControlExecutionHistory(control).filter((entry) =>
            !(entry.executionYear === executionYear && entry.executionPeriod === executionPeriod),
          ),
          nextEntry,
        ];

        return mergeExecutionHistoryIntoControl(control, nextHistory, { executionYear, executionPeriod });
      }),
    };
    const completedExecutionKey = nextExecutionId;
    writeAuditLog(
      "EXECUTION_SAVED",
      selectedControl.id,
      `${selectedControl.title} 등록 완료`,
      nextWorkspace,
    );
    setAssignmentExecutionNote("");
    setAssignmentExecutionYear("");
    setAssignmentExecutionPeriod("");
    setAssignmentReviewChecked("미검토");
    setEvidenceInputCount(1);
    setAssignmentPendingEvidenceCount(0);
    setWorkbenchTab("controls-complete");
    setControlListPage(1);
    setSelectedCompletedExecutionKey(completedExecutionKey);
    setSelectedControlId(selectedControl.id);
    setExecutionSavePopupMessage("수행 결과 등록이 완료되었습니다.");
  }

  function handleRequestReviewFromCompleted() {
    if (!selectedCompletedControl) {
      return;
    }

    const nextWorkspace = {
      ...workspace,
      controls: controls.map((control) => {
        if (control.id !== selectedCompletedControl.id) {
          return control;
        }

        const nextHistory = getControlExecutionHistory(control).map((entry) =>
          entry.executionId === selectedCompletedControl.completedExecutionKey
            ? {
                ...entry,
                reviewRequested: true,
                reviewChecked: "미검토",
                reviewResult: "",
                note: "",
                reviewAuthorName: "",
                reviewAuthorEmail: "",
                reviewDate: "",
                status: deriveAssignmentStatus(entry.executionNote ?? "", "미검토"),
              }
            : entry,
        );

        return mergeExecutionHistoryIntoControl(control, nextHistory, {
          executionYear: selectedCompletedControl.executionYear,
          executionPeriod: selectedCompletedControl.executionPeriod,
        });
      }),
    };
    writeAuditLog(
      "REVIEW_REQUESTED",
      selectedCompletedControl.id,
      `${selectedCompletedControl.title} 검토 요청`,
      nextWorkspace,
      null,
      {
        systemUrl: buildAppNavigationUrl({
          currentView: "control-workbench",
          workbenchTab: "control-review",
          selectedControlId: selectedCompletedControl.id,
          selectedCompletedExecutionKey: "",
          selectedReviewExecutionKey: selectedCompletedControl.completedExecutionKey,
        }),
      },
    );
    setCurrentView("control-workbench");
    setWorkbenchTab("control-review");
    setReviewUnitFilter("전체");
    setControlListPage(1);
    setSelectedReviewExecutionKey(selectedCompletedControl.completedExecutionKey);
    setSelectedControlId(selectedCompletedControl.id);
  }

  function handleEditCompletedExecution() {
    if (!selectedCompletedControl) {
      return;
    }
    setCompletedEditYear(selectedCompletedControl.executionYear ?? "");
    setCompletedEditPeriod(selectedCompletedControl.executionPeriod ?? "");
    setCompletedEditNote(selectedCompletedControl.executionNote ?? "");
    setCompletedEditEvidenceFiles(Array.isArray(selectedCompletedControl.evidenceFiles) ? selectedCompletedControl.evidenceFiles : []);
    setCompletedEvidenceInputCount(1);
    setCompletedPendingEvidenceCount(0);
    setCompletedEditMode(true);
  }

  function handleCancelCompletedEdit() {
    setCompletedEditMode(false);
    setCompletedEditYear(selectedCompletedControl?.executionYear ?? "");
    setCompletedEditPeriod(selectedCompletedControl?.executionPeriod ?? "");
    setCompletedEditNote(selectedCompletedControl?.executionNote ?? "");
    setCompletedEditEvidenceFiles(Array.isArray(selectedCompletedControl?.evidenceFiles) ? selectedCompletedControl.evidenceFiles : []);
    setCompletedEvidenceInputCount(1);
    setCompletedPendingEvidenceCount(0);
  }

  function syncCompletedPendingEvidenceCount() {
    const evidenceInputs = Array.from(
      completedEditFormRef.current?.querySelectorAll('input[name="completedEvidenceFiles"]') ?? [],
    );
    const nextCount = evidenceInputs.reduce((count, input) => count + (input.files?.length ?? 0), 0);
    setCompletedPendingEvidenceCount(nextCount);
  }

  function handleRemoveCompletedEvidenceFile(fileIndex) {
    setCompletedEditEvidenceFiles((current) => current.filter((_, index) => index !== fileIndex));
  }

  async function handleCompletedEditSubmit(event) {
    event.preventDefault();
    if (!canOperateControl || !selectedCompletedControl) {
      return;
    }

    const formData = new FormData(event.currentTarget);
    const files = formData
      .getAll("completedEvidenceFiles")
      .filter((value) => value instanceof File && value.size > 0);
    const executionYear = completedEditYear.trim();
    const executionPeriod = completedEditPeriod.trim();
    const executionNote = completedEditNote.trim();
    let nextEvidenceFiles = [...completedEditEvidenceFiles];
    let uploaded = false;

    if (!executionYear) {
      showCenterAlert("년도는 필수입니다.");
      return;
    }

    if (!executionPeriod) {
      showCenterAlert("주기는 필수입니다.");
      return;
    }

    if (!executionNote) {
      showCenterAlert("수행 내역을 입력하세요.");
      return;
    }

    if (files.length > 0) {
      try {
        const uploadResult = await uploadEvidenceFiles(selectedCompletedControl.id, files);
        nextEvidenceFiles = [...nextEvidenceFiles, ...uploadResult.files];
        uploaded = uploadResult.uploaded;
        setIntegrationStatus((current) => ({
          ...current,
          drive: uploadResult.uploaded ? "연결됨" : current.drive,
        }));
      } catch (error) {
        const code = String(error?.message ?? "");
        showCenterAlert(`증적 파일을 Google Drive에 저장하지 못했습니다.\n[debug] ${code || "unknown_error"}`);
        return;
      }
    }

    if (nextEvidenceFiles.length === 0) {
      showCenterAlert("증적 파일이 없으면 등록 완료를 유지할 수 없습니다.");
      return;
    }

    const nextWorkspace = {
      ...workspace,
      controls: controls.map((control) => {
        if (control.id !== selectedCompletedControl.id) {
          return control;
        }

        const currentHistory = getControlExecutionHistory(control);
        const currentEntry = currentHistory.find(
          (entry) => entry.executionId === selectedCompletedControl.completedExecutionKey,
        );
        const nextExecutionKey = createExecutionEntryKey(selectedCompletedControl.id, executionYear, executionPeriod);
        const savedAt = new Date().toISOString();
        const nextHistory = [
          ...currentHistory.filter((entry) => {
            const isSamePeriod = entry.executionYear === executionYear && entry.executionPeriod === executionPeriod;
            return entry.executionId !== selectedCompletedControl.completedExecutionKey && !isSamePeriod;
          }),
          {
            ...(currentEntry ?? {}),
            executionId: nextExecutionKey,
            executionYear,
            executionPeriod,
            executionNote,
            testMethodSnapshot: String(control.testMethod ?? "").trim(),
            populationSnapshot: String(control.population ?? "").trim(),
            evidenceTextSnapshot: String(control.evidenceText ?? "").trim(),
            executionSubmitted: true,
            reviewRequested: false,
            executionAuthorUnit: String(control.performDept ?? control.performer ?? control.ownerDept ?? "").trim(),
            evidenceFiles: nextEvidenceFiles,
            evidenceStatus: nextEvidenceFiles.length > 0 && uploaded ? "준비 완료" : nextEvidenceFiles.length > 0 ? "수집 중" : "미수집",
            status: deriveAssignmentStatus(executionNote, currentEntry?.reviewChecked ?? "미검토"),
            createdAt: String(currentEntry?.createdAt ?? "").trim() || savedAt,
            updatedAt: savedAt,
          },
        ];

        return mergeExecutionHistoryIntoControl(control, nextHistory, {
          executionYear,
          executionPeriod,
        });
      }),
    };

    writeAuditLog("EXECUTION_SAVED", selectedCompletedControl.id, `${selectedCompletedControl.title} 등록 완료 수정`, nextWorkspace);
    setCompletedEditMode(false);
    setCompletedEditYear(executionYear);
    setCompletedEditPeriod(executionPeriod);
    setCompletedEditNote(executionNote);
    setCompletedEditEvidenceFiles(nextEvidenceFiles);
    setCompletedEvidenceInputCount(1);
    setCompletedPendingEvidenceCount(0);
    setSelectedCompletedExecutionKey(nextExecutionKey);
    setExecutionSavePopupMessage("등록 완료 내용이 수정되었습니다.");
  }

  function handleReviewSubmit(event) {
    event.preventDefault();
    if (!canOperateControl) {
      showCenterAlert("reviewer 이상 권한만 통제 수행/검토가 가능합니다.");
      return;
    }
    if (!selectedReviewControl) return;

    const formData = new FormData(event.currentTarget);
    const reviewDecision = normalizeReviewDecisionLabel(formData.get("reviewDecision").toString());
    const reviewNote = formData.get("reviewNote").toString().trim();
    const reviewChecked = reviewDecision === "양호" ? "검토 완료" : "반려";
    const reviewAuthorName = String(authUser?.name ?? "").trim();
    const reviewAuthorEmail = normalizedAuthEmail;
    const reviewAuthorUnit = String(selectedReviewControl.reviewDept ?? selectedReviewControl.reviewer ?? "").trim();
    const reviewDate = new Date().toISOString();
    const reviewer = reviewAuthorName || reviewAuthorEmail;

    if (!reviewAuthorEmail) {
      showCenterAlert("로그인 계정 정보를 확인할 수 없어 검토를 저장할 수 없습니다.");
      return;
    }

    const status = reviewDecision === "양호" ? "점검 완료" : "개선 필요";
    const nextWorkspace = {
      ...workspace,
      controls: controls.map((control) => {
        if (control.id !== selectedReviewControl.id) {
          return control;
        }

        const nextHistory = getControlExecutionHistory(control).map((entry) =>
          entry.executionId === selectedReviewControl.reviewExecutionKey
            ? {
                ...entry,
                reviewRequested: false,
                reviewChecked,
                status,
                note: reviewNote,
                reviewResult: reviewDecision,
                reviewAuthorName,
                reviewAuthorEmail,
                reviewAuthorUnit,
                reviewDate,
              }
            : entry,
        );

        return mergeExecutionHistoryIntoControl(
          {
            ...control,
            reviewer: control.reviewer ?? control.reviewDept ?? "",
            reviewDept: control.reviewDept ?? control.reviewer ?? "",
          },
          nextHistory,
          {
            executionYear: selectedReviewControl.executionYear,
            executionPeriod: selectedReviewControl.executionPeriod,
          },
        );
      }),
    };

    const loggedWorkspace = writeAuditLog("REVIEW_SAVED", selectedReviewControl.id, `${selectedReviewControl.title} 검토 저장`, nextWorkspace);
    if (reviewDecision === "양호") {
      writeAuditLog(
        "REVIEW_COMPLETED",
        selectedReviewControl.id,
        `${selectedReviewControl.title} 검토 완료 · ${reviewer}`,
        loggedWorkspace,
        null,
        {
          systemUrl: buildAppNavigationUrl({
            currentView: "control-workbench",
            workbenchTab: "performed-complete",
            selectedControlId: selectedReviewControl.id,
          }),
        },
      );
    } else {
      setCurrentView("control-workbench");
      setWorkbenchTab("controls-complete");
      setControlListPage(1);
      setSelectedCompletedExecutionKey(selectedReviewControl.reviewExecutionKey);
      setSelectedControlId(selectedReviewControl.id);
    }
    showCenterAlert("검토 결과가 저장되었습니다.");
  }

  function handleWorkflowSubmit(event) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const nextWorkflow = {
      id: formData.get("workflowId").toString().trim(),
      controlId: formData.get("controlId").toString(),
      step: formData.get("step").toString().trim(),
      assignee: formData.get("assignee").toString().trim(),
      reviewer: formData.get("reviewer").toString().trim(),
      dueDate: formData.get("dueDate").toString(),
      status: formData.get("workflowStatus").toString(),
      memo: formData.get("memo").toString().trim(),
    };

    updateWorkspace({
      ...workspace,
      workflows: [nextWorkflow, ...workflows],
    });
    event.currentTarget.reset();
  }

  function handleControlSubmit(event) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const targetSystems = formData.getAll("targetSystems").map((value) => value.toString());
    const nextControl = {
      id: formData.get("controlId").toString().trim(),
      cycle: "",
      process: formData.get("category").toString().trim(),
      subProcess: formData.get("category").toString().trim(),
      title: formData.get("title").toString().trim(),
      purpose: "",
      riskId: "",
      riskName: "",
      frequency: formData.get("frequency").toString(),
      controlType: formData.get("controlType").toString(),
      keyControl: formData.get("keyControl").toString(),
      status: "점검 예정",
      evidenceStatus: "수집 중",
      ownerDept: normalizeUnitLabel(formData.get("performDept").toString()),
      performer: normalizeUnitLabel(formData.get("performDept").toString()),
      reviewer: normalizeUnitLabel(formData.get("reviewDept").toString()),
      performDept: normalizeUnitLabel(formData.get("performDept").toString()),
      reviewDept: normalizeUnitLabel(formData.get("reviewDept").toString()),
      targetSystems,
      note: "",
      population: "",
      attributes: [],
      evidences: [],
      procedures: [],
    };

    if (controls.some((control) => control.id === nextControl.id)) {
      showCenterAlert("같은 통제번호가 이미 존재합니다.");
      return;
    }

    const seededWorkflows = createDefaultWorkflowSeeds([nextControl]).map((workflow, index) => ({
      ...workflow,
      id: `WF-${String(workflows.length + index + 1).padStart(3, "0")}`,
    }));

    updateWorkspace({
      ...workspace,
      controls: [nextControl, ...controls],
      workflows: [...seededWorkflows, ...workflows],
    });
    setSelectedControlId(nextControl.id);
    setProcessFilter("전체");
    setControlListPage(1);
    setControlPanelMode("edit");
    event.currentTarget.reset();
  }

  function handleControlUpdate(event) {
    event.preventDefault();
    if (!selectedControl) return;

    const formData = new FormData(event.currentTarget);
    const targetSystems = formData.getAll("targetSystems").map((value) => value.toString());
    const performDept = normalizeUnitLabel(formData.get("performDept").toString());
    const reviewDept = normalizeUnitLabel(formData.get("reviewDept").toString());

    updateWorkspace({
      ...workspace,
      controls: controls.map((control) =>
        control.id === selectedControl.id
          ? {
              ...control,
              process: formData.get("category").toString().trim(),
              subProcess: formData.get("category").toString().trim(),
              title: formData.get("title").toString().trim(),
              keyControl: formData.get("keyControl").toString(),
              frequency: formData.get("frequency").toString(),
              controlType: formData.get("controlType").toString(),
              ownerDept: performDept,
              performer: performDept,
              reviewer: reviewDept,
              performDept,
              reviewDept,
              targetSystems,
            }
          : control,
      ),
      workflows: workflows.map((workflow) =>
        workflow.controlId === selectedControl.id
          ? { ...workflow, assignee: performDept, reviewer: reviewDept }
          : workflow,
      ),
    });
  }

  if (!authUser) {
    return (
      <div className="login-shell">
        <section className="login-card">
          <div className="login-badge">itgc management system</div>
          <div className="login-copy-block">
            <h1>IT 통제(ITGC) 관리 시스템</h1>
            <p className="login-copy">Google 계정으로 로그인합니다.</p>
          </div>
          <div className="login-method-card">
            <span className="login-method-label">로그인 방식</span>
            <div className="login-method-row">
              <strong>Google OAuth</strong>
              <span>{allowedDomainText}</span>
            </div>
            <p className="login-method-note">로그인 시 이름과 이메일 정보를 수집합니다.</p>
          </div>
          {GOOGLE_CLIENT_ID ? (
            <div className="login-button-panel">
              <div className="google-login-button-wrap" ref={googleLoginRef} />
            </div>
          ) : (
            <p className="login-error">`.env`에 `VITE_GOOGLE_CLIENT_ID`를 설정하세요.</p>
          )}
          {DEV_LOCAL_LOGIN_ENABLED ? (
            <div className="login-method-card login-dev-card">
              <span className="login-method-label">개발 서버 전용</span>
              <div className="login-method-row">
                <strong>로컬 로그인</strong>
                <span>모바일 확인용</span>
              </div>
              <div className="login-dev-row">
                <input
                  type="email"
                  value={devLoginEmail}
                  onChange={(event) => setDevLoginEmail(event.target.value)}
                  placeholder="muhayu.com 이메일"
                />
                <button className="secondary-button" type="button" onClick={handleDevLogin}>
                  바로 로그인
                </button>
              </div>
            </div>
          ) : null}
          {authError ? <p className="login-error">{authError}</p> : null}
          <p className="login-footnote">인가된 도메인 계정만 접근할 수 있습니다.</p>
        </section>
      </div>
    );
  }

  return (
    <div className={isSidebarOpen ? `app-shell theme-${uiTheme}` : `app-shell sidebar-collapsed theme-${uiTheme}`}>
      <button
        type="button"
        className={isSidebarOpen ? "sidebar-overlay visible" : "sidebar-overlay"}
        aria-label="사이드바 닫기"
        onClick={() => setIsSidebarOpen(false)}
      />

      <aside className={isSidebarOpen ? "sidebar open" : "sidebar collapsed"}>
        <div className="sidebar-brand-row">
          <div className="sidebar-brand">
            <p className="eyebrow">IT 통제(ITGC)</p>
            <h1>관리 시스템</h1>
          </div>
          <button
            type="button"
            className="sidebar-toggle"
            aria-label={isSidebarOpen ? "왼쪽 메뉴 접기" : "왼쪽 메뉴 펼치기"}
            aria-expanded={isSidebarOpen}
            onClick={() => setIsSidebarOpen((open) => !open)}
          >
            {isSidebarOpen ? "←" : "→"}
          </button>
        </div>
        <nav className="sidebar-nav">
          {menuItems.map(({ key, label, icon }) => (
            <button
              key={key}
              type="button"
              className={currentView === key ? "nav-button active" : "nav-button"}
              aria-label={label}
              title={label}
              onClick={() => handleViewChange(key)}
            >
              <span className="nav-button-icon" aria-hidden="true">{icon}</span>
              <span className="nav-button-label">{label}</span>
              {key === "control-workbench" && reviewPendingCount > 0 ? (
                <span className="menu-pending-badge" aria-label={`검토 대기 ${reviewPendingCount}건`}>
                  {reviewPendingCount}
                </span>
              ) : null}
            </button>
          ))}
        </nav>
      </aside>

      <nav className="mobile-bottom-nav" aria-label="모바일 메뉴">
        {menuItems.map(({ key, label, icon }) => (
          <button
            key={key}
            type="button"
            className={currentView === key ? "mobile-nav-button active" : "mobile-nav-button"}
            onClick={() => handleViewChange(key)}
            aria-label={label}
          >
            <span className="mobile-nav-icon" aria-hidden="true">{icon}</span>
            <span className="mobile-nav-label">{label}</span>
            {key === "control-workbench" && reviewPendingCount > 0 ? (
              <span className="menu-pending-badge mobile" aria-label={`검토 대기 ${reviewPendingCount}건`}>
                {reviewPendingCount}
              </span>
            ) : null}
          </button>
        ))}
      </nav>

      <div className="page-shell">
        <div className="app-user-topbar">
          <div className="app-user-chip">
            <strong>{authUser.name}</strong>
            <span>{authUser.email}</span>
            <em className={`status-badge ${accessRoleClassName(currentAccessRole)}`}>{currentAccessRole}</em>
          </div>
          <button className="secondary-button app-user-logout" type="button" onClick={handleLogout}>
            로그아웃
          </button>
        </div>
        <main className={isWorkbenchView || currentView === "register" || currentView === "control-list" || currentView === "controls" || currentView === "control-review" || currentView === "report" || currentView === "people" || currentView === "audit" ? "layout workbench-layout" : "layout"}>
          {currentView === "dashboard" ? (
            <>
              <section className={`dashboard-card control-progress-section dashboard-view-${dashboardView}`}>
                <section className="dashboard-month-calendar">
                  <div className="dashboard-month-calendar-head">
                    <strong>월 단위 캘린더</strong>
                    <span>{dashboardCalendarMonth}월 수행 대상 {dashboardMonthlyCards.length}개</span>
                  </div>
                  <div className="dashboard-month-grid">
                    {dashboardCalendarSummary.map((bucket) => {
                      const className = [
                        "dashboard-month-button",
                        bucket.month === dashboardCalendarMonth ? "active" : "",
                        bucket.month === currentCalendarMonth ? "current-month" : "",
                      ].filter(Boolean).join(" ");
                      return (
                        <button
                          type="button"
                          key={bucket.month}
                          className={className}
                          onClick={() => {
                            setDashboardCalendarMonth(bucket.month);
                            moveToDashboardTarget("dashboard-month-card-list");
                          }}
                        >
                          <span>{bucket.month}월</span>
                          <strong>{bucket.items.length}개</strong>
                        </button>
                      );
                    })}
                  </div>
                  <div className="dashboard-month-card-list" id="dashboard-month-card-list">
                    {dashboardMonthlyCards.length > 0 ? (
                      dashboardMonthlyCards.map((item) => (
                        <button
                          type="button"
                          className="control-progress-card dashboard-month-control-card"
                          key={`calendar-${item.id}-${item.frequency}`}
                          onClick={() => openControlOperation(item.id, item.process)}
                        >
                          <div className="control-progress-head">
                            <strong>{item.id}</strong>
                            <span className={isKeyControl(item.keyControl) ? "status-badge key-badge" : "status-badge normal-badge"}>
                              {isKeyControl(item.keyControl) ? "Key" : "Normal"}
                            </span>
                          </div>
                          <AutoFitTitle>{item.title}</AutoFitTitle>
                          <small>{item.process} · {formatFrequencyLabel(item.frequency) || "-"}</small>
                        </button>
                      ))
                    ) : (
                      <p className="empty-text dashboard-month-empty">해당 월에 예정된 정기 통제가 없습니다.</p>
                    )}
                  </div>
                </section>
                <div className="dashboard-delay-inline-row">
                  {dashboardAnnualDelayBuckets.map((bucket) => (
                    <button
                      type="button"
                      className="dashboard-delay-inline-summary"
                      key={bucket.key}
                      onClick={() => openDashboardDelayDetail(bucket.key)}
                    >
                      <span>연 기준 지연 현황</span>
                      <strong>{bucket.items.length}건</strong>
                    </button>
                  ))}
                  <button
                    type="button"
                    className="dashboard-delay-inline-summary dashboard-progress-inline-summary"
                    onClick={() => openDashboardDelayDetail("progress")}
                  >
                    <span>{`${dashboardDelayYear}년 진행률`}</span>
                    <strong>{`${dashboardAnnualProgressSummary.progressRate}%`}</strong>
                  </button>
                </div>
                <div className="section-heading">
                  <div>
                    <h2>대시보드</h2>
                  </div>
                </div>
                <div className="control-progress-summary-grid">
                  {dashboardSummaryCards.map((card) => (
                    <button
                      type="button"
                      className="control-progress-summary-card"
                      key={card.label}
                      onClick={() => handleDashboardSummaryCardClick(card)}
                    >
                      <span>{card.label}</span>
                      <strong>{card.value}</strong>
                    </button>
                  ))}
                </div>
                <div className="detail-tabs dashboard-tabs">
                  <button
                    type="button"
                    className={dashboardView === "category" ? "tab-button active" : "tab-button"}
                    onClick={() => {
                      setDashboardView("category");
                      setDashboardCategoryFocus("전체");
                    }}
                  >
                    <span className="tab-label-desktop">카테고리 기준</span>
                    <span className="tab-label-mobile">카테고리</span>
                  </button>
                  <button
                    type="button"
                    className={dashboardView === "frequency" ? "tab-button active" : "tab-button"}
                    onClick={() => {
                      setDashboardView("frequency");
                      setDashboardFrequencyFocus("전체");
                    }}
                  >
                    <span className="tab-label-desktop">주기 기준</span>
                    <span className="tab-label-mobile">주기</span>
                  </button>
                  <button
                    type="button"
                    className={dashboardView === "control" ? "tab-button active" : "tab-button"}
                    onClick={() => {
                      setDashboardView("control");
                      setDashboardControlStatusFocus("전체");
                    }}
                  >
                    <span className="tab-label-desktop">통제 기준</span>
                    <span className="tab-label-mobile">통제</span>
                  </button>
                  <div className="dashboard-delay-buttons">
                    <button
                      type="button"
                      className={dashboardDelayFilter === "지연만" ? "tab-button delay-button active" : "tab-button delay-button"}
                      onClick={() => setDashboardDelayFilter((current) => (current === "지연만" ? "전체" : "지연만"))}
                    >
                      <span className="tab-label-desktop">지연</span>
                      <span className="tab-label-mobile">지연</span>
                    </button>
                  </div>
                  <label className="filter-label dashboard-unit-filter dashboard-unit-filter-inline">
                    <span>수행 유닛</span>
                    <select value={dashboardUnitFilter} onChange={(event) => setDashboardUnitFilter(event.target.value)}>
                      {dashboardUnitOptions.map((option) => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </select>
                  </label>
                </div>
                {dashboardView === "frequency" ? (
                  <div className="control-progress-group-list" id="dashboard-frequency-root">
                    {visibleControlProgressGroups.map((group) => (
                      <section
                        className={`control-progress-group tone-${toDashboardAnchor(group.frequency)}`}
                        key={group.frequency}
                        id={`dashboard-frequency-${toDashboardAnchor(group.frequency)}`}
                      >
                        <div className="control-progress-group-head">
                          <strong>{group.label}</strong>
                          <span>{`진행률: ${group.progressRate}%`}</span>
                        </div>
                        <div className="control-progress-list">
                          {group.items.map((item) => (
                            <button
                              type="button"
                              className="control-progress-card"
                              key={item.id}
                              onClick={() => openControlOperation(item.id)}
                            >
                              <div className="control-progress-head">
                                <strong>{item.id}</strong>
                                <span className={`status-badge ${statusClass(item.status)}`}>{item.status}</span>
                              </div>
                              <AutoFitTitle>{item.title}</AutoFitTitle>
                              <div className="progress-track" aria-hidden="true">
                                <span style={{ width: `${item.progress}%` }} />
                              </div>
                              <div className="progress-caption">
                                <span>현재 현황</span>
                                <strong>{item.progress}%</strong>
                              </div>
                            </button>
                          ))}
                        </div>
                      </section>
                    ))}
                  </div>
                ) : null}
                {dashboardView === "control" ? (
                  <div className="control-progress-group-list" id="dashboard-control-root">
                    {visibleDashboardControlGroups.map((group) => (
                      <section className={`control-progress-group tone-${toDashboardAnchor(group.group)}`} key={group.group}>
                        <div className="control-progress-group-head">
                          <strong>{group.group}</strong>
                          <span>{`진행률: ${group.progressRate}%`}</span>
                        </div>
                        <div className="control-progress-list control-progress-list-by-control">
                          {group.items.map((item) => (
                            <button
                              type="button"
                              className="control-progress-card"
                              key={item.id}
                              id={`dashboard-control-${toDashboardAnchor(item.id)}`}
                              onClick={() => openControlOperationByGroup(group.group)}
                            >
                              <div className="control-progress-head">
                                <strong>{item.id}</strong>
                                <span className={`status-badge ${statusClass(item.status)}`}>{item.status}</span>
                              </div>
                              <AutoFitTitle>{item.title}</AutoFitTitle>
                              <div className="progress-track" aria-hidden="true">
                                <span style={{ width: `${item.progress}%` }} />
                              </div>
                              <div className="progress-caption">
                                <span>현재 현황</span>
                                <strong>{item.progress}%</strong>
                              </div>
                            </button>
                          ))}
                        </div>
                      </section>
                    ))}
                  </div>
                ) : null}
                {dashboardView === "category" ? (
                  <div className="control-progress-list category-progress-list" id="dashboard-category-root">
                    {visibleDashboardProcessSummary.map((item) => (
                      <button
                        type="button"
                        className={`control-progress-card category-progress-card tone-${toDashboardAnchor(item.process)}`}
                        key={item.process}
                        id={`dashboard-category-${toDashboardAnchor(item.process)}`}
                        onClick={() => openRegistrationByCategory(item.process)}
                      >
                        <div className="control-progress-head category-progress-head">
                          <strong>{item.process}</strong>
                          <span>{`진행률: ${item.progressRate}%`}</span>
                        </div>
                        <small>현재 현황 · 완료 {item.done} · 관리 필요 {item.pending}</small>
                        <div className="progress-track" aria-hidden="true">
                          <span style={{ width: `${item.progressRate}%` }} />
                        </div>
                        <div className="progress-caption">
                          <span>현재 현황</span>
                          <strong>{item.progressRate}%</strong>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : null}
              </section>
            </>
          ) : null}

          {currentView === "dashboard-delay-detail" ? (
            <section className="compact-stack member-management-stack">
              <article className="panel member-management-panel">
                <div className="section-heading">
                  <div>
                    <h2>{dashboardDelayDetailKey === "progress" ? "연 기준 진행 내역 상세" : "연 기준 지연 통제 상세"}</h2>
                    <p className="detail-purpose">
                      {dashboardDelayDetailKey === "progress"
                        ? `${dashboardDelayYear}년 기준 검토 완료된 수행 내역을 표시합니다.`
                        : `${dashboardDelayYear}년 기준, 현재 날짜까지 도래했지만 미완료인 지연 항목을 월/분기/반기/연 단위로 표시합니다.`}
                    </p>
                  </div>
                  <div className="execution-filter-actions">
                    <label className="registration-filter-field">
                      <span>연도</span>
                      <select value={dashboardDelayYear} onChange={(event) => setDashboardDelayYear(event.target.value)}>
                        {dashboardDelayYearOptions.map((year) => (
                          <option key={year} value={year}>{year}년</option>
                        ))}
                      </select>
                    </label>
                  </div>
                </div>
                <div className="detail-tabs dashboard-tabs">
                  <button
                    type="button"
                    className={dashboardDelayDetailKey === "progress" ? "tab-button active" : "tab-button"}
                    onClick={() => setDashboardDelayDetailKey("progress")}
                  >
                    진행 내역
                    <span className="tab-pending-badge">{dashboardAnnualProgressItems.length}</span>
                  </button>
                  {dashboardAnnualDelayBuckets.map((bucket) => (
                    <button
                      type="button"
                      key={bucket.key}
                      className={dashboardDelayDetailKey === bucket.key ? "tab-button active" : "tab-button"}
                      onClick={() => setDashboardDelayDetailKey(bucket.key)}
                    >
                      {bucket.label}
                      <span className="tab-pending-badge">{bucket.items.length}</span>
                    </button>
                  ))}
                </div>
                {dashboardDelayDetailKey === "progress" ? (
                  dashboardAnnualProgressItems.length ? (
                    <div className="control-progress-list dashboard-delay-detail-list">
                      {dashboardAnnualProgressItems.map((item) => (
                        <button
                          type="button"
                          className="control-progress-card tone-category"
                          key={`progress-${item.id}-${item.executionYear}-${item.executionPeriod}`}
                          onClick={() =>
                            openControlOperation(item.id, item.process, {
                              executionYear: item.executionYear,
                              executionPeriod: item.executionPeriod,
                            })
                          }
                        >
                          <div className="control-progress-head">
                            <strong>{item.id}</strong>
                            <span className={`status-badge ${statusClass(item.status)}`}>{item.status}</span>
                          </div>
                          <AutoFitTitle>{item.title}</AutoFitTitle>
                          <small>{item.process} · {item.frequency}</small>
                          <small>완료 기간 · {item.executionYear}년 {item.executionPeriod}</small>
                          <small>수행 부서 · {item.performer}</small>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="panel empty-selection-panel dashboard-delay-empty">
                      <p className="eyebrow">진행 내역</p>
                      <h2>해당 연도의 완료 내역이 없습니다.</h2>
                      <p className="detail-purpose">연도 또는 대시보드 필터 조건을 바꾸면 다시 집계됩니다.</p>
                    </div>
                  )
                ) : selectedDashboardDelayBucket?.items?.length ? (
                  <div className="control-progress-list dashboard-delay-detail-list">
                    {selectedDashboardDelayBucket.items.map((item) => (
                      <button
                        type="button"
                        className={`control-progress-card tone-${toDashboardAnchor(selectedDashboardDelayBucket.key)}`}
                        key={`${selectedDashboardDelayBucket.key}-${item.id}`}
                        onClick={() =>
                          openControlOperation(item.id, item.process, {
                            executionYear: dashboardDelayYear,
                            executionPeriod: item.overduePeriod,
                          })
                        }
                      >
                        <div className="control-progress-head">
                          <strong>{item.id}</strong>
                          <span className={`status-badge ${statusClass(item.status)}`}>{item.status}</span>
                        </div>
                        <AutoFitTitle>{item.title}</AutoFitTitle>
                        <small>{item.process} · {item.frequency}</small>
                        <small>지연 기간 · {item.overduePeriod}</small>
                        <small>수행 부서 · {item.performer}</small>
                        <small>
                          최근 등록 · {item.executionYear ? `${item.executionYear}년` : "-"} {item.executionPeriod || ""}
                        </small>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="panel empty-selection-panel dashboard-delay-empty">
                    <p className="eyebrow">{selectedDashboardDelayBucket?.label ?? "지연 상세"}</p>
                    <h2>해당 조건의 지연 통제가 없습니다.</h2>
                    <p className="detail-purpose">유닛 필터나 지연 필터 조건을 바꾸면 다시 집계됩니다.</p>
                  </div>
                )}
              </article>
            </section>
          ) : null}

          {isWorkbenchView ? (
            <section className="panel workbench-tabs-panel">
              <div className="workbench-flow-overview">
                <div>
                  <p className="workbench-flow-eyebrow">통제 관리 플로우</p>
                  <h2>서브 메뉴에서 단계별로 바로 이동할 수 있습니다.</h2>
                </div>
                {currentWorkbenchStep ? (
                  <p className="workbench-flow-current">
                    현재 단계 <strong>{currentWorkbenchStepIndex + 1}. {currentWorkbenchStep.label}</strong>
                  </p>
                ) : null}
              </div>
              <div className="workbench-step-flow" role="tablist" aria-label="통제 관리 단계">
                {workbenchFlowSteps.map((step, index) => {
                  const isActiveStep = workbenchTab === step.key;
                  const isCompletedStep = currentWorkbenchStepIndex > index;
                  const isDisabledStep = !canOpenWorkbenchTab(step.key);
                  const badgeClassName =
                    step.key === "control-review"
                      ? "tab-pending-badge"
                      : "tab-pending-badge tab-pending-badge-draft";

                  return (
                    <div
                      key={step.key}
                      className={
                        isCompletedStep
                          ? "workbench-step-item completed"
                          : isActiveStep
                            ? "workbench-step-item active"
                            : "workbench-step-item"
                      }
                    >
                      <button
                        type="button"
                        className={
                          isCompletedStep
                            ? "tab-button workbench-step-button completed"
                            : isActiveStep
                              ? "tab-button active workbench-step-button"
                              : isDisabledStep
                                ? "tab-button workbench-step-button disabled"
                                : "tab-button workbench-step-button"
                        }
                        disabled={isDisabledStep}
                        onClick={() => handleWorkbenchTabChange(step.key)}
                        aria-current={isActiveStep ? "step" : undefined}
                      >
                        <span className="workbench-step-index" aria-hidden="true">{index + 1}</span>
                        <span className="workbench-step-body">
                          <span className="workbench-step-label">{step.label}</span>
                          <span className="workbench-step-helper">{step.helper}</span>
                        </span>
                        <span className="workbench-step-badge-slot">
                          {step.badgeCount > 0 ? <span className={badgeClassName}>{step.badgeCount}</span> : null}
                        </span>
                      </button>
                      {index < workbenchFlowSteps.length - 1 ? (
                        <span className="workbench-step-connector" aria-hidden="true">
                          <span className="workbench-step-connector-line" />
                          <span className="workbench-step-connector-arrow">→</span>
                        </span>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </section>
          ) : null}

          {currentView === "register" || (isWorkbenchView && workbenchTab === "register") ? (
            <section className="control-browser-layout registration-management-layout align-unified">
              <article className="panel control-list-panel">
                <div className="section-heading">
                  <div>
                    <h2>통제 목록</h2>
                  </div>
                  <button className="secondary-button slim-button" type="button" onClick={startNewRegistration}>
                    신규 추가
                  </button>
                </div>
                <div className="control-browser-list">
                  <div className="control-list">
                    {registrationPagedControls.map((control) => (
                      <button
                        type="button"
                        key={control.id}
                        className={
                          control.id === registrationSelectedControlId
                            ? `registration-example-item registration-control-item control-operation-card${isKeyControl(control.keyControl) ? " key-control-card" : ""} active`
                            : `registration-example-item registration-control-item control-operation-card${isKeyControl(control.keyControl) ? " key-control-card" : ""}`
                        }
                        onClick={() => loadRegistrationControl(control)}
                      >
                        <div className="registration-example-head">
                          <strong>{control.id}</strong>
                          <div className="badge-row">
                            <span className="status-badge unit-assignee-badge">
                              수행: {resolveExecutionAuthorDisplay(control)}
                            </span>
                            <span className="status-badge unit-review-badge">
                              검토: {resolveReviewDeptDisplay(control)}
                            </span>
                          </div>
                        </div>
                        <AutoFitTitle>{control.title}</AutoFitTitle>
                        <span className="control-item-subtext">{formatFrequencyLabel(control.frequency) || "-"}</span>
                      </button>
                    ))}
                  </div>
                  {registrationTotalPages > 1 ? (
                    <div className="pagination registration-pagination">
                      {Array.from({ length: registrationTotalPages }, (_, index) => index + 1).map((page) => (
                        <button
                          key={page}
                          type="button"
                          className={page === registrationCurrentPage ? "page-button active" : "page-button"}
                          onClick={() => setRegistrationListPage(page)}
                        >
                          {page}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              </article>

              <div className="registration-main">
                <section className="registration-hero-card">
                  <div className="registration-hero-head">
                    <div>
                      <h2>ITGC 통제 등록/수정</h2>
                      <p>좌측 목록에서 통제를 선택해 수정하거나, 신규 통제를 추가할 수 있습니다.</p>
                    </div>
                    <div className="registration-badges">
                      <span className={registrationForm.keyControl ? "status-badge key-badge" : "status-badge normal-badge"}>
                        {registrationForm.keyControl ? "Key Control" : "Normal Control"}
                      </span>
                      <span className="status-badge status-warning">등록 완성도 {registrationCompletion}%</span>
                    </div>
                  </div>

                  <div className="registration-metric-grid">
                    <article className="registration-metric-card">
                      <div className="registration-metric-icon"><ShieldCheckIcon /></div>
                      <div>
                        <p>통제 유형</p>
                        <strong>{registrationForm.controlType}</strong>
                      </div>
                    </article>
                    <article className="registration-metric-card">
                      <div className="registration-metric-icon"><FileStackIcon /></div>
                      <div>
                        <p>증적</p>
                        <strong>필수 관리</strong>
                      </div>
                    </article>
                    <article className="registration-metric-card">
                      <div className="registration-metric-icon"><OwnerIcon /></div>
                      <div>
                        <p>수행 부서</p>
                        <strong>{registrationForm.ownerDept}</strong>
                      </div>
                    </article>
                    <article className="registration-metric-card">
                      <div className="registration-metric-icon"><CheckBadgeIcon /></div>
                      <div>
                        <p>수행 주기</p>
                        <strong>{formatFrequencyLabel(registrationForm.frequency) || "-"}</strong>
                      </div>
                    </article>
                  </div>
                </section>

                <article className="panel registration-section-card">
                  <div className="registration-section-head">
                    <h2>기본 정보</h2>
                    <p>통제 식별 및 RCM 매핑을 위한 기본 정보</p>
                  </div>
                  <div className="registration-form-grid two-col">
                    <label className="registration-field">
                      <span>통제 ID <em>필수</em></span>
                      <input value={registrationForm.controlId} onChange={(event) => updateRegistrationField("controlId", event.target.value)} />
                      <small>예: APD-03, CHG-01</small>
                    </label>
                    <label className="registration-field">
                      <span>통제명 <em>필수</em></span>
                      <input value={registrationForm.controlName} onChange={(event) => updateRegistrationField("controlName", event.target.value)} />
                      <small>감사자가 봐도 바로 이해되는 이름으로 작성</small>
                    </label>
                    <label className="registration-field">
                      <span>프로세스 <em>필수</em></span>
                      <select value={registrationForm.process} onChange={(event) => updateRegistrationField("process", event.target.value)}>
                        <option value="IT 정책관리">IT 정책관리</option>
                        <option value="계정관리">계정관리</option>
                        <option value="변경관리">변경관리</option>
                        <option value="운영관리">운영관리</option>
                        <option value="백업관리">백업관리</option>
                      </select>
                    </label>
                    <label className="registration-field">
                      <span>서브 프로세스</span>
                      <input value={registrationForm.subProcess} onChange={(event) => updateRegistrationField("subProcess", event.target.value)} />
                    </label>
                    <fieldset className="system-fieldset registration-field">
                      <legend>관련 시스템 <em>필수</em></legend>
                      <div className="system-options">
                        {systemOptions.map((system) => (
                          <label key={system} className="system-option">
                            <input
                              type="checkbox"
                              checked={(registrationForm.targetSystems ?? []).includes(system)}
                              onChange={() => toggleRegistrationSystem(system)}
                            />
                            <span className="system-option-label">{system}</span>
                          </label>
                        ))}
                      </div>
                    </fieldset>
                    <label className="registration-field">
                      <span>정책/기준서 참조</span>
                      <input value={registrationForm.policyReference} onChange={(event) => updateRegistrationField("policyReference", event.target.value)} />
                    </label>
                  </div>
                </article>

                <article className="panel registration-section-card">
                  <div className="registration-section-head">
                    <h2>Risk &amp; Control 정의</h2>
                    <p>통제가 어떤 위험을 어떤 방식으로 줄이는지 명확히 정의</p>
                  </div>
                  <div className="registration-form-grid two-col">
                    <label className="registration-field">
                      <span>위험 <em>필수</em></span>
                      <textarea rows="4" value={registrationForm.risk} onChange={(event) => updateRegistrationField("risk", event.target.value)} />
                      <small>무엇이 잘못될 수 있는지 위험을 구체적으로 작성</small>
                    </label>
                    <label className="registration-field">
                      <span>통제 목적 <em>필수</em></span>
                      <textarea rows="4" value={registrationForm.controlObjective} onChange={(event) => updateRegistrationField("controlObjective", event.target.value)} />
                      <small>이 통제가 존재해야 하는 목적</small>
                    </label>
                    <label className="registration-field">
                      <span>통제 활동 <em>필수</em></span>
                      <textarea rows="4" value={registrationForm.controlActivity} onChange={(event) => updateRegistrationField("controlActivity", event.target.value)} />
                      <small>실제로 수행하는 핵심 통제행위</small>
                    </label>
                    <label className="registration-field">
                      <span>상세 설명 <em>필수</em></span>
                      <textarea rows="4" value={registrationForm.description} onChange={(event) => updateRegistrationField("description", event.target.value)} />
                      <small>누가, 어떻게, 무엇을 증적으로 남기는지 포함해서 작성</small>
                    </label>
                  </div>
                </article>

                <article className="panel registration-section-card">
                  <div className="registration-section-head">
                    <div>
                      <h2>운영 및 감사 정보</h2>
                      <p>실행 가능성과 감사 검증 가능성을 높이는 필수 운영 정보</p>
                    </div>
                  </div>
                  <div className="registration-form-grid two-col registration-audit-grid">
                    <label className="registration-field registration-audit-frequency">
                      <span>수행 주기 <em>필수</em></span>
                      <select value={registrationForm.frequency} onChange={(event) => updateRegistrationField("frequency", event.target.value)}>
                        <option value="Daily">일별</option>
                        <option value="Weekly">주별</option>
                        <option value="Monthly">월별</option>
                        <option value="Quarterly">분기별</option>
                        <option value="Half-Bi-annual">반기별</option>
                        <option value="Annual">연 1회</option>
                        <option value="Event Driven">이벤트 발생 시</option>
                        <option value="Other">필요 시</option>
                      </select>
                    </label>
                    <label className="registration-field registration-audit-control-type">
                      <span>통제 유형 <em>필수</em></span>
                      <select value={registrationForm.controlType} onChange={(event) => updateRegistrationField("controlType", event.target.value)}>
                        <option value="예방">예방</option>
                        <option value="탐지">탐지</option>
                        <option value="예방 + 탐지">예방 + 탐지</option>
                      </select>
                    </label>
                    <label className="registration-field registration-audit-owner-dept">
                      <span>수행 부서 <em>필수</em></span>
                      <input value={registrationForm.ownerDept} onChange={(event) => updateRegistrationField("ownerDept", event.target.value)} />
                    </label>
                    <label className="registration-field registration-audit-review-dept">
                      <span>검토 부서 <em>필수</em></span>
                      <input value={registrationForm.reviewDept} onChange={(event) => updateRegistrationField("reviewDept", event.target.value)} />
                    </label>
                    <label className="registration-field registration-audit-advanced-half registration-audit-automation">
                      <span>자동화 수준</span>
                      <select value={registrationForm.automationLevel} onChange={(event) => updateRegistrationField("automationLevel", event.target.value)}>
                        <option value="수동">수동</option>
                        <option value="반자동">반자동</option>
                        <option value="자동">자동</option>
                      </select>
                    </label>
                    <label className="registration-field registration-audit-advanced-half registration-audit-deficiency">
                      <span>결함 영향도</span>
                      <select value={registrationForm.deficiencyImpact} onChange={(event) => updateRegistrationField("deficiencyImpact", event.target.value)}>
                        <option value="높음">높음</option>
                        <option value="중간">중간</option>
                        <option value="낮음">낮음</option>
                      </select>
                    </label>
                    <label className="registration-field registration-audit-advanced-half registration-audit-test-method">
                      <span>테스트 방법</span>
                      <textarea rows="4" value={registrationForm.testMethod} onChange={(event) => updateRegistrationField("testMethod", event.target.value)} />
                      <small>감사/자가점검 시 어떻게 검증할지 기술</small>
                    </label>
                    <label className="registration-field registration-audit-advanced-half registration-audit-population">
                      <span>모집단</span>
                      <textarea rows="4" value={registrationForm.population} onChange={(event) => updateRegistrationField("population", event.target.value)} />
                      <small>점검 대상 기간, 건수, 추출 기준 등을 작성</small>
                    </label>
                    <label className="registration-field registration-field-row-start registration-audit-evidence">
                      <span>증적 <em>필수</em></span>
                      <textarea rows="4" value={registrationForm.evidence} onChange={(event) => updateRegistrationField("evidence", event.target.value)} />
                      <small className="registration-field-spacer" aria-hidden="true">placeholder</small>
                    </label>
                    <div className="registration-switch-card registration-audit-advanced-full">
                      <div>
                        <strong>핵심통제</strong>
                        <p>재무/감사 영향도가 높아 별도 검증이 필요한 통제</p>
                      </div>
                      <label className="switch">
                        <input
                          type="checkbox"
                          checked={registrationForm.keyControl}
                          onChange={(event) => updateRegistrationField("keyControl", event.target.checked)}
                        />
                        <span className="switch-slider" />
                      </label>
                    </div>
                  </div>
                </article>
                  <div className="registration-action-group">
                    <button
                      className="primary-button"
                      type="button"
                      onClick={saveRegisteredControl}
                      disabled={!isAdmin}
                    >
                      통제 등록/수정
                    </button>
                    <button
                      className="secondary-button registration-delete-button"
                      type="button"
                      onClick={handleRegisteredControlDelete}
                      disabled={!isAdmin || !registrationSelectedControl}
                    >
                      통제 삭제
                    </button>
                  </div>
              </div>
              
            </section>
          ) : null}

          {currentView === "control-list" ? (
            <section className="control-browser-layout align-unified align-list-with-identity">
              <article className="panel control-list-panel">
                <div className="section-heading">
                  <div>
                    <h2>통제 목록</h2>
                  </div>
                  <label className="filter-label">
                    <select
                      value={registrationCategoryFilter}
                      onChange={(event) => {
                        setRegistrationCategoryFilter(event.target.value);
                        setRegistrationListPage(1);
                      }}
                    >
                      {registrationCategoryOptions.map((option) => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="control-browser-list">
                    <div className="control-list">
                    {registrationPagedControls.map((control) => (
                      <button
                        type="button"
                        key={control.id}
                        className={
                          control.id === registrationSelectedControl?.id
                            ? `registration-example-item registration-control-item control-operation-card${isKeyControl(control.keyControl) ? " key-control-card" : ""} active`
                            : `registration-example-item registration-control-item control-operation-card${isKeyControl(control.keyControl) ? " key-control-card" : ""}`
                        }
                        onClick={() => {
                          setRegistrationSelectedControlId(control.id);
                          writeAuditLog("CONTROL_VIEWED", control.id, `${control.title} 상세 조회`);
                        }}
                      >
                        <div className="registration-example-head">
                          <strong>{control.id}</strong>
                          <div className="badge-row">
                            <span className="status-badge unit-assignee-badge">
                              수행: {resolveExecutionAuthorDisplay(control)}
                            </span>
                            <span className="status-badge unit-review-badge">
                              검토: {resolveReviewDeptDisplay(control)}
                            </span>
                          </div>
                        </div>
                        <AutoFitTitle>{control.title}</AutoFitTitle>
                        <span className="control-item-subtext">{formatFrequencyLabel(control.frequency) || "-"}</span>
                      </button>
                    ))}
                    </div>
                    {registrationTotalPages > 1 ? (
                      <div className="pagination registration-pagination">
                        {Array.from({ length: registrationTotalPages }, (_, index) => index + 1).map((page) => (
                          <button
                            key={page}
                            type="button"
                            className={page === registrationCurrentPage ? "page-button active" : "page-button"}
                            onClick={() => setRegistrationListPage(page)}
                          >
                            {page}
                          </button>
                        ))}
                      </div>
                    ) : null}
                </div>
              </article>

              <article className="panel registration-summary-card control-detail-card">
                <div className="registration-section-head">
                  <h2>통제 상세</h2>
                  <p>목록에서 선택한 통제의 상세 정보</p>
                </div>
                <div className="registration-identity-box">
                  <p>통제 식별자</p>
                  <strong>{registrationSelectedControl?.id || "미선택"}</strong>
                </div>
                  <div className="control-detail-grid-view">
                    <div><p>Cycle</p><strong>{registrationSelectedControl?.cycle || "-"}</strong></div>
                    <div><p>프로세스</p><strong>{registrationSelectedControl?.process || "-"}</strong></div>
                    <div><p>서브 프로세스</p><strong>{registrationSelectedControl?.subProcess || "-"}</strong></div>
                    <div><p>통제명</p><strong>{registrationSelectedControl?.title || "-"}</strong></div>
                    <div><p>위험 ID</p><span>{registrationSelectedControl?.riskId || "-"}</span></div>
                    <div><p>위험명</p><span>{registrationSelectedControl?.riskName || "-"}</span></div>
                    <div><p>통제 목적</p><span>{registrationSelectedControl?.controlObjective || registrationSelectedControl?.purpose || "-"}</span></div>
                    <div><p>통제 활동</p><span>{registrationSelectedControl?.controlActivity || "-"}</span></div>
                    <div><p>상세 설명</p><span>{registrationSelectedControl?.description || registrationSelectedControl?.population || "-"}</span></div>
                    <div><p>핵심통제</p><span>{registrationSelectedControl?.keyControl || "-"}</span></div>
                    <div><p>주기</p><span>{formatFrequencyLabel(registrationSelectedControl?.frequency) || "-"}</span></div>
                    <div><p>통제 유형</p><span>{registrationSelectedControl?.controlType || "-"}</span></div>
                    <div><p>자동화 수준</p><span>{registrationSelectedControl?.automationLevel || "-"}</span></div>
                    <div><p>수행 부서</p><span>{resolveExecutionAuthorDisplay(registrationSelectedControl)}</span></div>
                    <div><p>검토 부서</p><span>{resolveReviewDeptDisplay(registrationSelectedControl)}</span></div>
                    <div>
                      <p>관련 시스템</p>
                      {renderSystemChips(registrationSelectedControl?.targetSystems)}
                    </div>
                    <div><p>관련 정책</p><span>{registrationSelectedControl?.policyReference || "-"}</span></div>
                    <div><p>결함 영향도</p><span>{registrationSelectedControl?.deficiencyImpact || "-"}</span></div>
                    <div><p>증적</p><span>{registrationSelectedControl?.evidenceText || (registrationSelectedControl?.evidences ?? []).join(" | ") || "-"}</span></div>
                    <div><p>테스트 절차</p><span>{registrationSelectedControl?.testMethod || (registrationSelectedControl?.procedures ?? []).join(" | ") || "-"}</span></div>
                    <div><p>모집단</p><span>{registrationSelectedControl?.population || "-"}</span></div>
                  </div>
              </article>
            </section>
          ) : null}

          {currentView === "controls" || (isWorkbenchView && workbenchTab === "controls") ? (
            <section className="controls-layout align-unified">
              <article className="panel control-list-panel">
                <div className="section-heading">
                  <div>
                    <h2>통제 항목 목록</h2>
                  </div>
                  <div className="execution-filter-actions">
                    <button
                      type="button"
                      className={controlExecutionFilter === "작성중" ? "execution-draft-filter active" : "execution-draft-filter"}
                      onClick={() => {
                        setControlExecutionFilter((current) => (current === "작성중" ? "전체" : "작성중"));
                        setControlListPage(1);
                      }}
                    >
                      작성중 {controlExecutionDraftCount}건
                    </button>
                    <label className="filter-label">
                      <select value={controlUnitFilter} onChange={(event) => { setControlUnitFilter(event.target.value); setControlListPage(1); }}>
                        {controlUnitFilterOptions.map((option) => (
                          <option key={option} value={option}>{option}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                </div>
                <div className="control-list">
                  {limitedControls.map((control) => {
                    return (
                      <button
                        type="button"
                        key={control.id}
                        className={
                          control.id === selectedControl?.id
                            ? "registration-example-item registration-control-item control-operation-card active"
                            : "registration-example-item registration-control-item control-operation-card"
                        }
                          onClick={() => {
                            setSelectedControlId(control.id);
                            writeAuditLog("EXECUTION_VIEWED", control.id, `${control.title} 운영 화면 조회`);
                          }}
                    >
                        <div className="registration-example-head">
                          <strong>{control.id}</strong>
                          <div className="badge-row">
                            <span className="status-badge unit-assignee-badge">
                              수행: {resolveExecutionAuthorDisplay(control)}
                            </span>
                            <span className="status-badge unit-review-badge">
                              검토: {resolveReviewDeptDisplay(control)}
                            </span>
                          </div>
                        </div>
                        <AutoFitTitle>{control.title}</AutoFitTitle>
                        <span className="control-item-subtext">
                          {formatFrequencyLabel(control.frequency) || "-"}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <div className="pagination">
                  {Array.from({ length: totalControlPages }, (_, index) => index + 1).map((page) => (
                    <button
                      key={page}
                      type="button"
                      className={page === currentControlPage ? "page-button active" : "page-button"}
                      onClick={() => setControlListPage(page)}
                    >
                      {page}
                    </button>
                  ))}
                </div>
              </article>

              <div className="control-main control-execution-panel execution-tight-stack">
                {selectedControl ? (
                  <>
                    <article className="panel registration-section-card guide-scroll-card">
                      <div className="registration-section-head">
                        <h2>통제 등록 작성 가이드</h2>
                      </div>
                      <div className="guide-scroll-body">
                        <ul className="registration-guide-list">
                          {registrationWritingGuide.map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    </article>
                    <article className="panel detail-hero execution-detail-panel">
                      <div className="detail-title-row">
                        <div className="detail-inline-heading">
                          <h2>통제 수행 등록 양식</h2>
                        </div>
                        <div className="badge-row">
                          {assignmentExecutionPeriod.trim() ? null : (
                            <span className="status-badge evidence-missing">주기 없음</span>
                          )}
                          {assignmentExecutionNote.trim() ? null : (
                            <span className="status-badge review-pending">수행 내역 없음</span>
                          )}
                          {assignmentPendingEvidenceCount > 0 ? null : (
                            <span className="status-badge evidence-missing">증적 파일 없음</span>
                          )}
                          <span className="status-badge unit-assignee-badge">
                            수행: {resolveExecutionAuthorDisplay(selectedControl)}
                          </span>
                          <span className="status-badge unit-review-badge">
                            검토: {resolveReviewDeptDisplay(selectedControl)}
                          </span>
                        </div>
                      </div>
                      <p className="detail-purpose">{selectedControl.id} · {selectedControl.title}</p>
                      <div className="execution-detail-body">
                      <div className="info-block">
                        <span>통제 활동 설명</span>
                        <strong>{selectedControl.purpose || selectedControl.title}</strong>
                      </div>
                      <div className="detail-meta-grid execution-meta-grid">
                        <div className="execution-meta-item">
                          <span>테스트 방법</span>
                          <span className="detail-body-text">
                            {preserveDisplayLineBreaks(selectedControl.testMethod || (selectedControl.procedures ?? []).join("\n")) || "-"}
                          </span>
                        </div>
                        <div className="execution-meta-item">
                          <span>증적</span>
                          <span className="detail-body-text">
                            {preserveDisplayLineBreaks(selectedControl.evidenceText || (selectedControl.evidences ?? []).join("\n")) || "-"}
                          </span>
                        </div>
                        <div className="execution-meta-item">
                          <span>모집단</span>
                          <span className="detail-body-text">{preserveDisplayLineBreaks(selectedControl.population) || "-"}</span>
                        </div>
                      </div>
                      <form ref={assignmentFormRef} className="stack-form execution-form" onSubmit={handleAssignmentSubmit}>
                        <div className="execution-form-item execution-inline-select-row">
                          <div className="execution-inline-select-controls">
                            <span className="execution-inline-label">년도:</span>
                            <select
                              name="executionYear"
                              value={assignmentExecutionYear}
                              onChange={(event) => setAssignmentExecutionYear(event.target.value)}
                              required
                            >
                              <option value="">년도 선택</option>
                              {executionYearOptions.map((year) => (
                                <option key={year} value={year}>{year}년</option>
                              ))}
                            </select>
                            <span className="execution-inline-label">주기:</span>
                            <select
                              name="executionPeriod"
                              value={assignmentExecutionPeriod}
                              onChange={(event) => setAssignmentExecutionPeriod(event.target.value)}
                              required
                            >
                              <option value="">주기 선택</option>
                              {executionPeriodOptions.map((period) => (
                                <option key={period} value={period}>{period}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                        <label className="execution-form-item">
                          수행 내역
                          <textarea
                            name="executionNote"
                            rows="10"
                            value={assignmentExecutionNote}
                            onChange={(event) => {
                              const nextValue = event.target.value;
                              setAssignmentExecutionNote(nextValue);
                              if (!nextValue.trim()) {
                                setAssignmentReviewChecked("미검토");
                              }
                            }}
                            placeholder="수행한 작업 내용을 입력"
                          />
                        </label>
                        <div className="evidence-upload-group execution-form-item">
                          <label>
                            <span className="evidence-upload-label">증적 파일 첨부</span>
                            <div className="evidence-input-stack">
                              {Array.from({ length: evidenceInputCount }, (_, index) => (
                                <div className="evidence-input-row" key={index}>
                                  <input
                                    className="file-input"
                                    name="evidenceFiles"
                                    type="file"
                                    onChange={syncAssignmentPendingEvidenceCount}
                                  />
                                </div>
                              ))}
                              <span className="evidence-upload-actions">
                                <button
                                  className="secondary-button evidence-count-button"
                                  type="button"
                                  onClick={() => setEvidenceInputCount((count) => Math.max(1, count - 1))}
                                >
                                  -
                                </button>
                                <button
                                  className="secondary-button evidence-count-button"
                                  type="button"
                                  onClick={() => setEvidenceInputCount((count) => Math.min(5, count + 1))}
                                >
                                  +
                                </button>
                              </span>
                            </div>
                          </label>
                        </div>
                        <div className="evidence-file-list execution-form-item">
                          <span className="empty-text">첨부된 증적 없음</span>
                        </div>
                        {DATA_BACKEND === "local" ? (
                          <p className="field-help">현재는 업로드 URL 미설정 상태라 파일명이 먼저 저장됩니다.</p>
                        ) : null}
                        <div className="execution-form-item execution-form-action">
                          <button className="primary-button" type="submit" disabled={!canSubmitAssignment}>등록 완료</button>
                        </div>
                      </form>
                      </div>
                    </article>
                  </>
                ) : null}
              </div>
            </section>
          ) : null}

          {isWorkbenchView && workbenchTab === "controls-complete" ? (
            <section className="controls-layout align-unified">
              <article className="panel control-list-panel">
                <div className="section-heading">
                  <div>
                    <h2>등록 완료 목록</h2>
                  </div>
                </div>
                {completedPagedControls.length > 0 ? (
                  <div className="control-list">
                    {completedPagedControls.map((control) => (
                      <button
                        type="button"
                        key={control.completedExecutionKey}
                        className={
                          control.completedExecutionKey === selectedCompletedControl?.completedExecutionKey
                            ? "registration-example-item registration-control-item control-operation-card completed-operation-card active"
                            : "registration-example-item registration-control-item control-operation-card completed-operation-card"
                        }
                        onClick={() => {
                          setSelectedCompletedExecutionKey(control.completedExecutionKey);
                          setSelectedControlId(control.id);
                        }}
                      >
                        <div className="registration-example-head completed-example-head">
                          <strong>{control.id}</strong>
                          <div className="badge-row">
                            <span className="status-badge unit-assignee-badge">
                              수행: {resolveExecutionAuthorDisplay(control)}
                            </span>
                            <span className="status-badge unit-review-badge">
                              검토: {resolveReviewDeptDisplay(control)}
                            </span>
                          </div>
                        </div>
                        <AutoFitTitle>{control.title}</AutoFitTitle>
                        <span className="control-item-subtext">
                          {formatFrequencyLabel(control.frequency) || "-"}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="empty-text">등록 완료된 수행 결과가 없습니다.</p>
                )}
                {totalCompletedPages > 1 ? (
                  <div className="pagination">
                    {Array.from({ length: totalCompletedPages }, (_, index) => index + 1).map((page) => (
                      <button
                        key={page}
                        type="button"
                        className={page === currentCompletedPage ? "page-button active" : "page-button"}
                        onClick={() => setControlListPage(page)}
                      >
                        {page}
                      </button>
                    ))}
                  </div>
                ) : null}
              </article>

              <div className="control-main review-tight-stack">
                <article className="panel detail-hero control-review-panel">
                  {selectedCompletedControl ? (
                    <>
                      <div className="section-heading">
                        <div>
                          <h2>등록 완료 상세</h2>
                        </div>
                        <div className="badge-row">
                          <span className={`status-badge ${statusClass(selectedCompletedControl.status)}`}>{selectedCompletedControl.status}</span>
                          <span className={`status-badge ${evidenceClass(selectedCompletedControl.evidenceStatus)}`}>{evidenceBadgeLabel(selectedCompletedControl, "review")}</span>
                          <span className="status-badge unit-assignee-badge">
                            수행: {resolveExecutionAuthorDisplay(selectedCompletedControl)}
                          </span>
                          <span className="status-badge unit-assignee-badge">
                            검토: {resolveReviewDeptDisplay(selectedCompletedControl)}
                          </span>
                        </div>
                      </div>
                      <p className="detail-purpose">{selectedCompletedControl.id} · {selectedCompletedControl.title}</p>
                      <div className="review-detail-body">
                      <div className="detail-meta-grid execution-meta-grid review-detail-grid">
                        <div className="execution-meta-item review-row-full review-compact-meta-item">
                          <div className="detail-body-text review-compact-meta-line">
                            <span className="review-meta-chip review-meta-year">년도: {selectedCompletedControl.executionYear ? `${selectedCompletedControl.executionYear}년` : "-"}</span>
                            <span className="review-meta-separator">|</span>
                            <span className="review-meta-chip review-meta-period">주기: {selectedCompletedControl.executionPeriod || "-"}</span>
                            <span className="review-meta-separator">|</span>
                            <span className="review-meta-chip review-meta-owner">통제 수행자: {resolveExecutionAuthorDisplay(selectedCompletedControl)}</span>
                            <span className="review-meta-separator">|</span>
                            <span className="review-meta-chip review-meta-owner">검토 유닛: {resolveReviewDeptDisplay(selectedCompletedControl)}</span>
                          </div>
                        </div>
                        <div className="execution-meta-item">
                          <span>테스트 방법</span>
                          <span className="detail-body-text">
                            {preserveDisplayLineBreaks(resolveExecutionDetailTestMethod(selectedCompletedControl)) || "-"}
                          </span>
                        </div>
                        <div className="execution-meta-item">
                          <span>모집단</span>
                          <span className="detail-body-text">{preserveDisplayLineBreaks(resolveExecutionDetailPopulation(selectedCompletedControl)) || "-"}</span>
                        </div>
                        {!completedEditMode ? (
                          <>
                            <div className="execution-meta-item review-row-full">
                              <span>수행 내역</span>
                              <span className="detail-body-text">{preserveDisplayLineBreaks(selectedCompletedControl.executionNote) || "-"}</span>
                            </div>
                            <div className="execution-meta-item review-row-full">
                              <span>증적 파일</span>
                              <div className="evidence-file-list">
                                {(selectedCompletedControl.evidenceFiles ?? []).length > 0 ? (
                                  (selectedCompletedControl.evidenceFiles ?? []).map((file, index) => (
                                    <span className="evidence-file-chip-wrap" key={`${file.name}-${index}`}>
                                      <button
                                        className="system-chip evidence-file-chip"
                                        type="button"
                                        onClick={() => {
                                          if (isImageEvidence(file) || isPdfEvidence(file)) {
                                            handleOpenEvidencePreview(file);
                                            return;
                                          }
                                          handleDownloadEvidence(file);
                                        }}
                                      >
                                        {file.url ? file.name : `${file.name} (대기)`}
                                      </button>
                                    </span>
                                  ))
                                ) : (
                                  <span className="empty-text">첨부된 증적 없음</span>
                                )}
                              </div>
                            </div>
                          </>
                        ) : (
                          <div className="review-row-full completed-inline-edit-area">
                            <form ref={completedEditFormRef} className="stack-form execution-form" onSubmit={handleCompletedEditSubmit}>
                              <div className="execution-form-item execution-inline-select-row">
                                <div className="execution-inline-select-controls">
                                  <span className="execution-inline-label">년도:</span>
                                  <select
                                    name="completedExecutionYear"
                                    value={completedEditYear}
                                    onChange={(event) => setCompletedEditYear(event.target.value)}
                                    required
                                  >
                                    <option value="">년도 선택</option>
                                    {executionYearOptions.map((year) => (
                                      <option key={year} value={year}>{year}년</option>
                                    ))}
                                  </select>
                                  <span className="execution-inline-label">주기:</span>
                                  <select
                                    name="completedExecutionPeriod"
                                    value={completedEditPeriod}
                                    onChange={(event) => setCompletedEditPeriod(event.target.value)}
                                    required
                                  >
                                    <option value="">주기 선택</option>
                                    {buildExecutionPeriodOptions(selectedCompletedControl.frequency).map((period) => (
                                      <option key={period} value={period}>{period}</option>
                                    ))}
                                  </select>
                                </div>
                              </div>
                              <label className="execution-form-item">
                                수행 내역
                                <textarea
                                  name="completedExecutionNote"
                                  rows="10"
                                  value={completedEditNote}
                                  onChange={(event) => setCompletedEditNote(event.target.value)}
                                  placeholder="수행한 작업 내용을 입력"
                                />
                              </label>
                              <div className="evidence-upload-group execution-form-item">
                                <label>
                                  <span className="evidence-upload-label">증적 파일 첨부</span>
                                  <div className="evidence-input-stack">
                                    {Array.from({ length: completedEvidenceInputCount }, (_, index) => (
                                      <div className="evidence-input-row" key={index}>
                                        <input
                                          className="file-input"
                                          name="completedEvidenceFiles"
                                          type="file"
                                          onChange={syncCompletedPendingEvidenceCount}
                                        />
                                      </div>
                                    ))}
                                    <span className="evidence-upload-actions">
                                      <button
                                        className="secondary-button evidence-count-button"
                                        type="button"
                                        onClick={() => setCompletedEvidenceInputCount((count) => Math.max(1, count - 1))}
                                      >
                                        -
                                      </button>
                                      <button
                                        className="secondary-button evidence-count-button"
                                        type="button"
                                        onClick={() => setCompletedEvidenceInputCount((count) => Math.min(5, count + 1))}
                                      >
                                        +
                                      </button>
                                    </span>
                                  </div>
                                </label>
                              </div>
                              <div className="evidence-file-list execution-form-item">
                                {completedEditEvidenceFiles.length > 0 ? (
                                  completedEditEvidenceFiles.map((file, index) => (
                                    <span className="evidence-file-chip-wrap" key={`${file.name}-${index}`}>
                                      <button
                                        className="system-chip evidence-file-chip"
                                        type="button"
                                        onClick={() => {
                                          if (isImageEvidence(file) || isPdfEvidence(file)) {
                                            handleOpenEvidencePreview(file);
                                            return;
                                          }
                                          handleDownloadEvidence(file);
                                        }}
                                      >
                                        {file.url ? file.name : `${file.name} (대기)`}
                                      </button>
                                      <button
                                        className="evidence-file-delete"
                                        type="button"
                                        aria-label={`${file.name} 삭제`}
                                        onClick={() => handleRemoveCompletedEvidenceFile(index)}
                                      >
                                        X
                                      </button>
                                    </span>
                                  ))
                                ) : (
                                  <span className="empty-text">첨부된 증적 없음</span>
                                )}
                              </div>
                              <div className="execution-form-action completed-request-action">
                                <button className="secondary-button completed-edit-button" type="button" onClick={handleCancelCompletedEdit}>
                                  취소
                                </button>
                                <button className="primary-button" type="submit" style={{ color: "#ffffff", WebkitTextFillColor: "#ffffff" }}>
                                  수정 저장
                                </button>
                              </div>
                            </form>
                          </div>
                        )}
                      </div>
                      {!completedEditMode ? (
                        <div className="execution-form-action completed-request-action">
                          <button className="secondary-button completed-edit-button" type="button" onClick={handleEditCompletedExecution} disabled={!canOperateControl}>
                            수정
                          </button>
                          <button
                            className="primary-button"
                            type="button"
                            onClick={handleRequestReviewFromCompleted}
                            style={{ color: "#ffffff", WebkitTextFillColor: "#ffffff" }}
                          >
                            검토 요청
                          </button>
                        </div>
                      ) : null}
                      </div>
                    </>
                  ) : (
                    <p className="empty-text">등록 완료된 수행 결과가 없습니다.</p>
                  )}
                </article>
              </div>
            </section>
          ) : null}

          {currentView === "control-review" || (isWorkbenchView && workbenchTab === "control-review") ? (
            <section className="controls-layout align-unified">
              <article className="panel control-list-panel">
                <div className="section-heading">
                  <div>
                    <h2>통제 검토 필요</h2>
                  </div>
                  {reviewPagedControls.length > 0 ? (
                    <label className="filter-label">
                      <select value={reviewUnitFilter} onChange={(event) => { setReviewUnitFilter(event.target.value); setControlListPage(1); }}>
                        {controlUnitFilterOptions.map((option) => (
                          <option key={option} value={option}>{option}</option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                </div>
                {reviewPagedControls.length > 0 ? (
                  <div className="control-list">
                    {reviewPagedControls.map((control) => (
                      <button
                        type="button"
                        key={control.id}
                        className={
                          control.reviewExecutionKey === selectedReviewControl?.reviewExecutionKey
                            ? "registration-example-item registration-control-item control-operation-card active"
                            : "registration-example-item registration-control-item control-operation-card"
                        }
                        onClick={() => {
                          setSelectedReviewExecutionKey(control.reviewExecutionKey);
                          setSelectedControlId(control.id);
                          writeAuditLog("REVIEW_VIEWED", control.id, `${control.title} 검토 화면 조회`);
                        }}
                      >
                        <div className="registration-example-head">
                          <strong>{control.id}</strong>
                          <div className="badge-row">
                            <span className="status-badge unit-assignee-badge">
                              수행: {resolveExecutionAuthorDisplay(control)}
                            </span>
                            <span className="status-badge unit-review-badge">
                              검토: {resolveReviewDeptDisplay(control)}
                            </span>
                          </div>
                        </div>
                        <AutoFitTitle>{control.title}</AutoFitTitle>
                        <span className="control-item-subtext">
                          {formatFrequencyLabel(control.frequency) || "-"}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : null}
                {totalReviewPages > 1 ? (
                  <div className="pagination">
                    {Array.from({ length: totalReviewPages }, (_, index) => index + 1).map((page) => (
                      <button
                        key={page}
                        type="button"
                        className={page === currentReviewPage ? "page-button active" : "page-button"}
                        onClick={() => setControlListPage(page)}
                      >
                        {page}
                      </button>
                    ))}
                  </div>
                ) : null}
              </article>

              <div className="control-main review-tight-stack">
              <article className="panel registration-section-card guide-scroll-card review-guide-card">
                <div className="registration-section-head">
                  <h2>감사 관점의 등록 품질 체크</h2>
                </div>
                <div className="guide-scroll-body">
                  <ul className="registration-guide-list">
                    {registrationQualityGuide.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              </article>
              <article className="panel detail-hero control-review-panel">
                {selectedReviewControl ? (
                  <>
                    <div className="section-heading">
                      <div>
                        <h2>통제 운영 검토</h2>
                      </div>
                      <div className="badge-row">
                        <span className={`status-badge ${statusClass(selectedReviewControl.status)}`}>{selectedReviewControl.status}</span>
                        <span className={`status-badge ${evidenceClass(selectedReviewControl.evidenceStatus)}`}>{evidenceBadgeLabel(selectedReviewControl, "review")}</span>
                        <span className="status-badge unit-assignee-badge">
                          수행: {resolveExecutionAuthorDisplay(selectedReviewControl)}
                        </span>
                      </div>
                    </div>
                    <p className="detail-purpose">{selectedReviewControl.id} · {selectedReviewControl.title}</p>
                    <div className="review-detail-body">
                    <div className="detail-meta-grid execution-meta-grid review-detail-grid">
                      <div className="execution-meta-item review-row-full review-compact-meta-item">
                        <div className="detail-body-text review-compact-meta-line">
                          <span className="review-meta-chip review-meta-year">년도: {selectedReviewControl.executionYear ? `${selectedReviewControl.executionYear}년` : "-"}</span>
                          <span className="review-meta-separator">|</span>
                          <span className="review-meta-chip review-meta-period">주기: {selectedReviewControl.executionPeriod || "-"}</span>
                          <span className="review-meta-separator">|</span>
                          <span className="review-meta-chip review-meta-owner">통제 수행자: {resolveExecutionAuthorDisplay(selectedReviewControl)}</span>
                        </div>
                      </div>
                      <div className="execution-meta-item">
                        <span>테스트 방법</span>
                        <span className="detail-body-text">
                          {preserveDisplayLineBreaks(resolveExecutionDetailTestMethod(selectedReviewControl)) || "-"}
                        </span>
                      </div>
                      <div className="execution-meta-item">
                        <span>모집단</span>
                        <span className="detail-body-text">{preserveDisplayLineBreaks(resolveExecutionDetailPopulation(selectedReviewControl)) || "-"}</span>
                      </div>
                      <div className="execution-meta-item review-row-full">
                        <span>수행 내역</span>
                        <span className="detail-body-text">{preserveDisplayLineBreaks(selectedReviewControl.executionNote) || "-"}</span>
                      </div>
                      <div className="execution-meta-item review-row-full">
                        <span>증적 파일</span>
                        <div className="evidence-file-list">
                          {(selectedReviewControl.evidenceFiles ?? []).length > 0 ? (
                            (selectedReviewControl.evidenceFiles ?? []).map((file, index) => (
                              <span className="evidence-file-chip-wrap" key={`${file.name}-${index}`}>
                                <button
                                  className="system-chip evidence-file-chip"
                                  type="button"
                                  onClick={() => {
                                    if (isImageEvidence(file) || isPdfEvidence(file)) {
                                      handleOpenEvidencePreview(file);
                                      return;
                                    }
                                    handleDownloadEvidence(file);
                                  }}
                                >
                                  {file.url ? file.name : `${file.name} (대기)`}
                                </button>
                              </span>
                            ))
                          ) : (
                            <span className="empty-text">첨부된 증적 없음</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <form className="stack-form execution-form" onSubmit={handleReviewSubmit}>
                      <label className="execution-form-item">
                        검토 의견
                        <textarea
                          name="reviewNote"
                          rows="4"
                          defaultValue={selectedReviewControl.note ?? ""}
                          placeholder="개선 필요 사유 또는 검토 코멘트"
                        />
                      </label>
                      <div className="compact-form-grid review-decision-row execution-form-item">
                        <label>
                          검토 결과
                          <select
                            name="reviewDecision"
                            className={reviewDecisionDraft === "양호" ? "review-decision-select is-good" : "review-decision-select is-action"}
                            value={reviewDecisionDraft}
                            onChange={(event) => setReviewDecisionDraft(normalizeReviewDecisionLabel(event.target.value))}
                          >
                            <option value="양호">양호</option>
                            <option value="개선 필요">개선 필요</option>
                          </select>
                        </label>
                        <div className="review-complete-inline-action">
                          <button className="primary-button review-complete-submit-button" type="submit" disabled={!canOperateControl}>검토 완료</button>
                        </div>
                      </div>
                    </form>
                    </div>
                  </>
                ) : null}
              </article>
              </div>
            </section>
          ) : null}

          {isWorkbenchView && workbenchTab === "performed-complete" ? (
            <section className="controls-layout align-unified">
              <article className="panel control-list-panel">
                <div className="section-heading">
                  <div>
                    <h2>수행 완료</h2>
                  </div>
                </div>
                {performedPagedControls.length > 0 ? (
                  <div className="control-list">
                    {performedPagedControls.map((control) => (
                      <button
                        type="button"
                        key={control.performedExecutionKey}
                        className={
                          control.performedExecutionKey === selectedPerformedControl?.performedExecutionKey
                            ? "registration-example-item registration-control-item control-operation-card completed-operation-card active"
                            : "registration-example-item registration-control-item control-operation-card completed-operation-card"
                        }
                        onClick={() => {
                          setSelectedPerformedExecutionKey(control.performedExecutionKey);
                          setSelectedControlId(control.id);
                        }}
                      >
                        <div className="registration-example-head completed-example-head">
                          <strong>{control.id}</strong>
                          <div className="badge-row">
                            <span className={`status-badge ${statusClass(control.status)}`}>{control.status}</span>
                          </div>
                        </div>
                        <AutoFitTitle>{control.title}</AutoFitTitle>
                        <span className="control-item-subtext">
                          {formatFrequencyLabel(control.frequency) || "-"}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="empty-text">검토 완료된 수행 이력이 없습니다.</p>
                )}
                {totalPerformedPages > 1 ? (
                  <div className="pagination">
                    {Array.from({ length: totalPerformedPages }, (_, index) => index + 1).map((page) => (
                      <button
                        key={page}
                        type="button"
                        className={page === currentPerformedPage ? "page-button active" : "page-button"}
                        onClick={() => setControlListPage(page)}
                      >
                        {page}
                      </button>
                    ))}
                  </div>
                ) : null}
              </article>

              <div className="control-main review-tight-stack">
                <article className="panel detail-hero control-review-panel performed-detail-panel">
                  {selectedPerformedControl ? (
                    <>
                      <div className="section-heading">
                        <div>
                          <h2>수행 내역 상세</h2>
                        </div>
                        <div className="badge-row">
                          <span className={`status-badge ${statusClass(selectedPerformedControl.status)}`}>{selectedPerformedControl.status}</span>
                          <span className="status-badge normal-badge">{selectedPerformedControl.reviewChecked || "검토 완료"}</span>
                          <span className="status-badge unit-assignee-badge">
                            수행: {resolveExecutionAuthorDisplay(selectedPerformedControl)}
                          </span>
                          <span className="status-badge unit-assignee-badge">
                            검토: {resolveReviewActorDisplay(selectedPerformedControl)}
                          </span>
                        </div>
                      </div>
                      <p className="detail-purpose">{selectedPerformedControl.id} · {selectedPerformedControl.title}</p>
                      <div className="review-detail-body">
                        <div className="execution-meta-item review-row-full review-compact-meta-item">
                          <div className="detail-body-text review-compact-meta-line">
                            <span className="review-meta-chip review-meta-year">년도: {selectedPerformedControl.executionYear ? `${selectedPerformedControl.executionYear}년` : "-"}</span>
                            <span className="review-meta-separator">|</span>
                            <span className="review-meta-chip review-meta-period">주기: {selectedPerformedControl.executionPeriod || "-"}</span>
                            <span className="review-meta-separator">|</span>
                            <span className="review-meta-chip review-meta-owner">통제 수행자: {resolveExecutionAuthorDisplay(selectedPerformedControl)}</span>
                            <span className="review-meta-separator">|</span>
                            <span className="review-meta-chip review-meta-owner">검토자: {resolveReviewActorDisplay(selectedPerformedControl)}</span>
                          </div>
                        </div>
                        <div className="table-wrap performed-detail-table-wrap">
                          <table className="performed-detail-table">
                            <tbody>
                              <tr>
                                <th>테스트 방법</th>
                                <td>{preserveDisplayLineBreaks(resolveExecutionDetailTestMethod(selectedPerformedControl)) || "-"}</td>
                              </tr>
                              <tr>
                                <th>모집단</th>
                                <td>{preserveDisplayLineBreaks(resolveExecutionDetailPopulation(selectedPerformedControl)) || "-"}</td>
                              </tr>
                              <tr>
                                <th>수행 내역</th>
                                <td>{preserveDisplayLineBreaks(selectedPerformedControl.executionNote) || "-"}</td>
                              </tr>
                              <tr>
                                <th>증적 파일</th>
                                <td>
                                  <div className="evidence-file-list">
                                    {(selectedPerformedControl.evidenceFiles ?? []).length > 0 ? (
                                      (selectedPerformedControl.evidenceFiles ?? []).map((file, index) => (
                                        <span className="evidence-file-chip-wrap" key={`${file.name}-${index}`}>
                                          <button
                                            className="system-chip evidence-file-chip"
                                            type="button"
                                            onClick={() => {
                                              if (isImageEvidence(file) || isPdfEvidence(file)) {
                                                handleOpenEvidencePreview(file);
                                                return;
                                              }
                                              handleDownloadEvidence(file);
                                            }}
                                          >
                                            {file.url ? file.name : `${file.name} (대기)`}
                                          </button>
                                        </span>
                                      ))
                                    ) : (
                                      <span className="empty-text">첨부된 증적 없음</span>
                                    )}
                                  </div>
                                </td>
                              </tr>
                              <tr>
                                <th>검토자</th>
                                <td>
                                  {String(selectedPerformedControl.reviewAuthorName ?? "").trim()
                                    || String(selectedPerformedControl.reviewAuthorEmail ?? "").trim()
                                    || "-"}
                                </td>
                              </tr>
                              <tr>
                                <th>검토 결과</th>
                                <td>{selectedPerformedControl.reviewResult || "양호"}</td>
                              </tr>
                              <tr>
                                <th>검토 의견</th>
                                <td>{preserveDisplayLineBreaks(selectedPerformedControl.note) || "-"}</td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </>
                  ) : (
                    <p className="empty-text">검토 완료된 수행 이력이 없습니다.</p>
                  )}
                </article>
              </div>
            </section>
          ) : null}

          {currentView === "people" ? (
            <section className="compact-stack member-management-stack">
              <article className="panel member-management-panel">
                <div className="section-heading">
                  <div>
                    <h2>회원 관리</h2>
                  </div>
                  {!canManageMembers ? <span className="detail-body-text member-admin-only-note">admin만 수정할 수 있습니다.</span> : null}
                </div>
                <div className="report-toolbar login-domain-toolbar">
                  <div className="login-domain-inline">
                    <label className="filter-label" style={{ minWidth: "220px" }}>
                      <span>UI 테마 (10종)</span>
                      <select
                        value={uiTheme}
                        onChange={(event) => handleUiThemeChange(event.target.value)}
                        disabled={!canManageMembers}
                      >
                        {UI_THEME_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </label>
                    <label className="filter-label" style={{ minWidth: "320px" }}>
                      <span>로그인 허용 도메인 (콤마 구분)</span>
                      <input
                        type="text"
                        value={loginDomainDraft}
                        onChange={(event) => setLoginDomainDraft(event.target.value)}
                        placeholder="예: muhayu.com,example.com"
                        disabled={!canManageMembers}
                      />
                    </label>
                    <div className="member-management-actions">
                      <button className="secondary-button slim-button no-wrap login-domain-save-button" type="button" onClick={handleLoginDomainSave} disabled={!canManageMembers}>
                        허용 도메인
                      </button>
                      <button className="secondary-button slim-button no-wrap" type="button" onClick={handleSaveAllMemberDrafts} disabled={!canManageMembers}>
                        회원 정보 저장
                      </button>
                      <button className="secondary-button slim-button no-wrap" type="button" onClick={handleExportWorkspaceBackup}>
                        백업 내보내기
                      </button>
                      <button className="secondary-button slim-button no-wrap" type="button" onClick={handleImportWorkspaceBackupClick}>
                        백업 불러오기
                      </button>
                    </div>
                    <input
                      ref={workspaceBackupInputRef}
                      type="file"
                      accept="application/json,.json"
                      style={{ display: "none" }}
                      onChange={handleImportWorkspaceBackupFileChange}
                    />
                  </div>
                </div>
                <div className="table-wrap member-table-wrap">
                  <table className="member-table">
                    <thead>
                      <tr>
                        <th>삭제</th>
                        <th>ID</th>
                        <th>이름</th>
                        <th>이메일</th>
                        <th>유닛</th>
                        <th>권한</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedMemberDirectory.map((person) => (
                        <tr key={person.id}>
                          <td>
                            <input
                              type="checkbox"
                              checked={Boolean(memberDrafts[person.id]?.deleteChecked)}
                              onChange={(event) => handleMemberDraftChange(person.id, "deleteChecked", event.target.checked)}
                              disabled={!canManageMembers || !people.some((entry) => entry.id === person.id)}
                              aria-label={`${person.name} 삭제 선택`}
                            />
                          </td>
                          <td>{person.id}</td>
                          <td>{person.name}</td>
                          <td>{person.email || "-"}</td>
                          <td>
                            <input
                              type="text"
                              value={memberDrafts[person.id]?.unit ?? person.unit ?? "미지정"}
                              onChange={(event) => handleMemberDraftChange(person.id, "unit", event.target.value)}
                              placeholder="유닛 입력"
                              disabled={!canManageMembers}
                            />
                          </td>
                          <td>
                            <select
                              className={accessRoleClassName(memberDrafts[person.id]?.accessRole ?? person.accessRole ?? "viewer")}
                              value={normalizeAccessRole(memberDrafts[person.id]?.accessRole ?? person.accessRole ?? "viewer")}
                              onChange={(event) => handleMemberDraftChange(person.id, "accessRole", event.target.value)}
                              disabled={!canManageMembers}
                            >
                              <option value="admin" disabled={!isAllowedEmailBySet(person.email, loginDomainSet)}>admin</option>
                              <option value="reviewer">reviewer</option>
                              <option value="viewer">viewer</option>
                            </select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </article>
            </section>
          ) : null}

          {currentView === "report" ? (
            <section className="compact-stack report-stack">
              <article className="panel report-panel">
                <div className="section-heading">
                  <div>
                    <h2>수행 리포트</h2>
                  </div>
                </div>

                <div className="report-toolbar">
                  <label className="registration-filter-field">
                    <span>연도</span>
                    <select value={reportYear} onChange={(event) => setReportYear(event.target.value)}>
                      {reportYearOptions.map((year) => (
                        <option key={year} value={year}>{year === "all" ? "전체" : `${year}년`}</option>
                      ))}
                    </select>
                  </label>
                  <label className="registration-filter-field">
                    <span>주기</span>
                    <select value={reportPeriod} onChange={(event) => setReportPeriod(event.target.value)}>
                      <option value="all">전체</option>
                      <option value="monthly">월</option>
                      <option value="quarterly">분기</option>
                      <option value="semiannual">반기</option>
                      <option value="annual">연</option>
                    </select>
                  </label>
                  <label className="registration-filter-field">
                    <span>출력 형식</span>
                    <select value={reportFormat} onChange={(event) => setReportFormat(event.target.value)}>
                      <option value="html">HTML</option>
                      <option value="pdf">PDF</option>
                    </select>
                  </label>
                  <div className="registration-filter-field report-completion-filter">
                    <span>완료 여부</span>
                    <div className="report-completion-toggle" role="tablist" aria-label="완료 여부">
                      <button
                        type="button"
                        className={reportCompletionFilter === "all" ? "secondary-button slim-button report-completion-button active" : "secondary-button slim-button report-completion-button"}
                        onClick={() => setReportCompletionFilter("all")}
                      >
                        전체
                      </button>
                      <button
                        type="button"
                        className={reportCompletionFilter === "completed" ? "secondary-button slim-button report-completion-button active" : "secondary-button slim-button report-completion-button"}
                        onClick={() => setReportCompletionFilter("completed")}
                      >
                        검토 완료
                      </button>
                    </div>
                  </div>
                  <div className="report-action">
                    <button className="primary-button" type="button" onClick={handleReportExport}>
                      {reportFormat === "pdf" ? "PDF 출력" : "HTML 출력"}
                    </button>
                  </div>
                </div>

                <div className="report-summary-grid">
                  <article className="report-summary-card">
                    <span>전체</span>
                    <strong>{reportSummary.total}건</strong>
                  </article>
                  <article className="report-summary-card">
                    <span>완료</span>
                    <strong>{reportSummary.completed}건</strong>
                  </article>
                  <article className="report-summary-card">
                    <span>진행 중</span>
                    <strong>{reportSummary.inProgress}건</strong>
                  </article>
                  <article className="report-summary-card">
                    <span>예정</span>
                    <strong>{reportSummary.scheduled}건</strong>
                  </article>
                </div>

                <div className="table-wrap report-table-wrap">
                  <table className="report-table">
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>통제명</th>
                        <th>카테고리</th>
                        <th>수행자</th>
                        <th>검토자</th>
                        <th>상태</th>
                        <th>승인</th>
                        <th>수행 내역</th>
                        <th>검토 의견</th>
                        <th>증적</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reportControls.length > 0 ? (
                        reportControls.map((item) => (
                          <tr key={`${item.id}-${item.executionYear}-${item.executionPeriod}`}>
                            <td>{item.id}</td>
                            <td>{item.title}</td>
                            <td>{item.process}</td>
                            <td>{item.performer}</td>
                            <td>{item.reviewer}</td>
                            <td>{item.status}</td>
                            <td>{item.reviewChecked}</td>
                            <td className="report-execution-note report-execution-note-body">{preserveDisplayLineBreaks(item.executionNote) || "-"}</td>
                            <td className="report-execution-note report-review-note">{preserveDisplayLineBreaks(item.reviewNote) || "-"}</td>
                            <td className="report-evidence-cell">
                              <div className="report-execution-image-list">
                                {(item.evidenceFiles ?? [])
                                  .filter((file) => isImageEvidence(file) && Boolean(getEvidenceReportImageUrl(file)))
                                  .map((file, index) => (
                                    <img
                                      key={`${item.id}-report-evidence-${index}`}
                                      src={getEvidenceReportImageUrl(file)}
                                      alt={file.name || "증적 이미지"}
                                      className="report-execution-image"
                                      data-fallback-src={getEvidenceReportImageFallbackUrl(file)}
                                      onError={(event) => {
                                        const fallback = event.currentTarget.dataset.fallbackSrc;
                                        if (fallback && event.currentTarget.src !== fallback) {
                                          event.currentTarget.src = fallback;
                                          return;
                                        }
                                        event.currentTarget.onerror = null;
                                      }}
                                      loading="lazy"
                                    />
                                  ))}
                              </div>
                              {((item.evidenceFiles ?? []).filter((file) => isImageEvidence(file) && Boolean(getEvidenceReportImageUrl(file))).length === 0) && (
                                <div className="report-execution-empty">-</div>
                              )}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan="10">선택한 주기에 해당하는 수행 대상이 없습니다.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </article>
              {reportPreviewOpen ? (
                <div className="report-preview-overlay" role="dialog" aria-modal="true" aria-label="리포트 미리보기">
                  <div className="report-preview-modal">
                    <div className="report-preview-toolbar">
                      <strong>리포트 미리보기</strong>
                      <div className="report-preview-actions">
                        <button className="secondary-button slim-button" type="button" onClick={() => setReportPreviewOpen(false)}>
                          닫기
                        </button>
                        <button className="primary-button" type="button" onClick={handlePrintReportPreview}>
                          {reportFormat === "pdf" ? "PDF 출력" : "HTML 출력"}
                        </button>
                      </div>
                    </div>
                    <iframe
                      ref={reportPreviewFrameRef}
                      className="report-preview-frame"
                      title="리포트 미리보기"
                      srcDoc={reportPreviewMarkup}
                    />
                  </div>
                </div>
              ) : null}
            </section>
          ) : null}

          {evidencePreviewFile ? (
            <div className="report-preview-overlay" role="dialog" aria-modal="true" aria-label="증적 파일 미리보기">
              <div className="report-preview-modal evidence-preview-modal">
                <div className="report-preview-toolbar">
                  <strong>{evidencePreviewFile.name || "증적 파일 미리보기"}</strong>
                  <div className="report-preview-actions">
                    <button className="secondary-button slim-button" type="button" onClick={() => setEvidencePreviewFile(null)}>
                      닫기
                    </button>
                  </div>
                </div>
                {isImageEvidence(evidencePreviewFile) && !isDriveEvidence(evidencePreviewFile) && getEvidencePreviewUrl(evidencePreviewFile) ? (
                  <div className="evidence-preview-body">
                    <img
                      className="evidence-preview-image-large"
                      src={getEvidencePreviewUrl(evidencePreviewFile)}
                      alt={evidencePreviewFile.name || "증적 이미지"}
                    />
                  </div>
                ) : getEvidenceEmbedUrl(evidencePreviewFile) ? (
                  <iframe
                    className="report-preview-frame"
                    title={evidencePreviewFile.name || "증적 파일 미리보기"}
                    src={getEvidenceEmbedUrl(evidencePreviewFile)}
                  />
                ) : (
                  <div className="evidence-preview-empty">저장된 파일만 미리볼 수 있습니다.</div>
                )}
              </div>
            </div>
          ) : null}

          {executionSavePopupMessage ? (
            <div className="center-alert-overlay" role="dialog" aria-modal="true" aria-label="수행 내역 저장 안내">
              <div className="center-alert-modal">
                <p>{executionSavePopupMessage}</p>
                <button className="primary-button" type="button" onClick={() => setExecutionSavePopupMessage("")}>
                  확인
                </button>
              </div>
            </div>
          ) : null}

          {memberSavePopupMessage ? (
            <div className="center-alert-overlay" role="dialog" aria-modal="true" aria-label="회원 정보 저장 안내">
              <div className="center-alert-modal">
                <p>{memberSavePopupMessage}</p>
                <button className="primary-button" type="button" onClick={() => setMemberSavePopupMessage("")}>
                  확인
                </button>
              </div>
            </div>
          ) : null}

          {centerAlertMessage ? (
            <div className="center-alert-overlay" role="dialog" aria-modal="true" aria-label="안내">
              <div className="center-alert-modal">
                <p>{centerAlertMessage}</p>
                <button className="primary-button" type="button" onClick={() => setCenterAlertMessage("")}>
                  확인
                </button>
              </div>
            </div>
          ) : null}

          {centerConfirmMessage ? (
            <div className="center-alert-overlay" role="dialog" aria-modal="true" aria-label="확인">
              <div className="center-alert-modal">
                <p>{centerConfirmMessage}</p>
                <div className="report-preview-actions">
                  <button className="secondary-button slim-button" type="button" onClick={() => closeCenterConfirm(false)}>
                    취소
                  </button>
                  <button className="primary-button" type="button" onClick={() => closeCenterConfirm(true)}>
                    확인
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {currentView === "audit" ? (
            <section className="compact-stack">
              <article className="panel">
                <div className="section-heading">
                  <div>
                    <h2>감사 로그</h2>
                  </div>
                </div>
                <div className="report-toolbar audit-toolbar">
                  <input
                    className="audit-search-input"
                    type="text"
                    value={auditLogQuery}
                    onChange={(event) => setAuditLogQuery(event.target.value)}
                    placeholder="사용자, 액션, 대상, 내용 검색"
                  />
                </div>
                <div className="table-wrap audit-table-wrap">
                  <table className="audit-table">
                    <thead>
                      <tr>
                        <th className="audit-col-time">시각</th>
                        <th className="audit-col-user">사용자</th>
                        <th className="audit-col-action">액션</th>
                        <th className="audit-col-ip">IP</th>
                        <th className="audit-col-target">대상</th>
                        <th className="audit-col-detail">내용</th>
                      </tr>
                    </thead>
                    <tbody>
                      {remoteAuditLogLoading ? (
                        <tr>
                          <td colSpan="6">감사 로그를 불러오는 중입니다.</td>
                        </tr>
                      ) : pagedAuditLogs.length > 0 ? (
                        pagedAuditLogs.map((log) => (
                          <tr key={log.id}>
                            <td className="audit-col-time" data-label="시각">
                              {String(log.createdAt ?? "-").slice(0, 16) || "-"}
                            </td>
                            <td className="audit-col-user" data-label="사용자">
                              {log.actorName || log.actorEmail || "-"}
                            </td>
                            <td className="audit-col-action" data-label="액션">
                              {log.action ? `${log.action} · ${auditActionLabel(log.action)}` : "-"}
                            </td>
                            <td className="audit-col-ip" data-label="IP">
                              {log.ip || "-"}
                            </td>
                            <td className="audit-col-target" data-label="대상">
                              {log.target || "-"}
                            </td>
                            <td className="audit-col-detail" data-label="내용">
                              {log.detail || "-"}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan="6">로그가 없습니다.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                {totalAuditLogPages > 1 ? (
                  <div className="pagination registration-pagination">
                    {buildCondensedPagination(totalAuditLogPages, currentAuditLogPage).map((item, index) =>
                      typeof item === "number" ? (
                        <button
                          key={item}
                          type="button"
                          className={item === currentAuditLogPage ? "page-button active" : "page-button"}
                          onClick={() => setAuditLogPage(item)}
                        >
                          {item}
                        </button>
                      ) : (
                        <span key={`${item}-${index}`} className="page-ellipsis" aria-hidden="true">
                          ...
                        </span>
                      ),
                    )}
                  </div>
                ) : null}
              </article>
            </section>
          ) : null}

          {currentView === "roles" ? (
            <section className="controls-layout">
              <article className="panel control-list-panel">
                <div className="section-heading">
                  <div>
                    <p className="eyebrow">Roles</p>
                    <h2>통제별 역할 지정</h2>
                  </div>
                </div>
                <div className="control-list">
                  {controls.map((control) => (
                    <button
                      type="button"
                      key={control.id}
                      className={
                        control.id === roleAssignmentControl?.id
                          ? "registration-example-item registration-control-item control-operation-card active"
                          : "registration-example-item registration-control-item control-operation-card"
                      }
                      onClick={() => setRoleAssignmentControlId(control.id)}
                    >
                      <div className="registration-example-head">
                        <strong>{control.id}</strong>
                        <span className={isKeyControl(control.keyControl) ? "status-badge key-badge" : "status-badge normal-badge"}>
                          {isKeyControl(control.keyControl) ? "Key" : "Normal"}
                        </span>
                      </div>
                      <AutoFitTitle>{control.title}</AutoFitTitle>
                      <small>{formatFrequencyLabel(control.frequency) || "-"}</small>
                    </button>
                  ))}
                </div>
              </article>

              <article className="panel detail-hero">
                {roleAssignmentControl ? (
                  <>
                    <div className="detail-title-row">
                      <div>
                        <p className="eyebrow">Assignment</p>
                        <h2>통제 역할 지정</h2>
                      </div>
                    </div>
                    <p className="detail-purpose">{roleAssignmentControl.id} · {roleAssignmentControl.title}</p>
                    <div className="detail-meta-grid execution-meta-grid">
                      <div className="execution-meta-item">
                        <span>현재 수행자</span>
                        <span className="detail-body-text">{roleAssignmentControl.performDept ?? roleAssignmentControl.performer ?? "-"}</span>
                      </div>
                      <div className="execution-meta-item">
                        <span>현재 검토 부서/검토자</span>
                        <span className="detail-body-text">{resolveReviewDeptDisplay(roleAssignmentControl)}</span>
                      </div>
                      <div className="execution-meta-item">
                        <span>프로세스</span>
                        <span className="detail-body-text">{roleAssignmentControl.process || "-"}</span>
                      </div>
                    </div>
                    <form className="stack-form execution-form" onSubmit={handleRoleAssignmentSubmit}>
                      <label className="execution-form-item">
                        수행 부서
                        <select name="performer" defaultValue={roleAssignmentControl.performDept ?? roleAssignmentControl.performer ?? ""}>
                          {roleAssignmentControl.performDept && !performerUnitOptions.includes(roleAssignmentControl.performDept) ? (
                            <option value={roleAssignmentControl.performDept}>{roleAssignmentControl.performDept}</option>
                          ) : null}
                          {performerUnitOptions.map((unit) => (
                            <option key={unit} value={unit}>{unit}</option>
                          ))}
                        </select>
                      </label>
                      <label className="execution-form-item">
                        검토 부서
                        <select name="reviewer" defaultValue={roleAssignmentControl.reviewDept ?? roleAssignmentControl.reviewer ?? ""}>
                          {roleAssignmentControl.reviewDept && !reviewerUnitOptions.includes(roleAssignmentControl.reviewDept) ? (
                            <option value={roleAssignmentControl.reviewDept}>{roleAssignmentControl.reviewDept}</option>
                          ) : null}
                          {reviewerUnitOptions.map((unit) => (
                            <option key={unit} value={unit}>{unit}</option>
                          ))}
                        </select>
                      </label>
                      <div className="execution-form-item execution-form-action">
                        <button className="primary-button" type="submit" disabled={!isAdmin}>역할 저장</button>
                      </div>
                    </form>
                  </>
                ) : (
                  <div className="empty-selection-panel">
                    <p className="eyebrow">Assignment</p>
                    <h2>통제를 선택하세요</h2>
                  </div>
                )}
              </article>
            </section>
          ) : null}

        </main>
      </div>
    </div>
  );
}
