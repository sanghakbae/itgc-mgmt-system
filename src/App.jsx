import { useEffect, useMemo, useRef, useState } from "react";
import {
  fetchIntegrationStatus as fetchGoogleIntegrationStatus,
  fetchRemoteWorkspace as fetchGoogleWorkspace,
  syncRemoteWorkspace as syncGoogleWorkspace,
  uploadEvidenceToDrive,
} from "./googleSheetApi";
import {
  fetchSupabaseIntegrationStatus,
  fetchSupabaseWorkspace,
  syncSupabaseWorkspace,
  uploadEvidenceToSupabase,
} from "./supabaseApi";
import { defaultControls30 } from "./defaultControls30";

const STORAGE_KEY = "itgc-workspace-v8";
const REGISTRATION_DRAFT_KEY = "itgc-registration-draft-v1";
const AUTH_STORAGE_KEY = "itgc-google-auth-v1";
const GOOGLE_SCRIPT_URL = import.meta.env.VITE_GOOGLE_SCRIPT_URL ?? "";
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? "";
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY ?? "";
const DATA_BACKEND_ENV = (import.meta.env.VITE_DATA_BACKEND ?? "").trim().toLowerCase();

const DATA_BACKEND = (() => {
  if (DATA_BACKEND_ENV === "supabase") {
    return "supabase";
  }
  if (DATA_BACKEND_ENV === "google") {
    return "google";
  }
  if (SUPABASE_URL && SUPABASE_ANON_KEY) {
    return "supabase";
  }
  if (GOOGLE_SCRIPT_URL) {
    return "google";
  }
  return "local";
})();

const IS_SUPABASE_BACKEND = DATA_BACKEND === "supabase";
const HAS_REMOTE_BACKEND = DATA_BACKEND !== "local";

const defaultData = {
  controls: defaultControls30,
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
      assignee: "개발 5유닛",
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
const defaultPeople = [
  { id: "USR-001", name: "정보보호유닛", role: "reviewer", team: "정보보호", accessRole: "user", email: "" },
  { id: "USR-002", name: "QA유닛", role: "performer", team: "QA", accessRole: "user", email: "" },
  { id: "USR-003", name: "TA유닛", role: "reviewer", team: "TA", accessRole: "user", email: "" },
  { id: "USR-004", name: "개발 5유닛", role: "performer", team: "개발", accessRole: "user", email: "" },
];
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
    performDept: "개발 5유닛",
    reviewDept: "정보보호유닛",
    targetSystems: ["판다", "BI", "관리자콘솔(HR)", "관리자콘솔(CK)"],
  },
  "APD-08": {
    process: "DB 계정 관리",
    subProcess: "DB 계정 관리",
    title: "DB 계정 생성 및 접근 부여 시 요청 및 승인",
    keyControl: "No",
    frequency: "Event Driven",
    performDept: "개발 5유닛",
    reviewDept: "정보보호유닛",
    targetSystems: ["판다", "BI", "관리자콘솔(HR)", "관리자콘솔(CK)"],
  },
  "APD-09": {
    process: "OS 계정 관리",
    subProcess: "OS 계정 관리",
    title: "OS 계정 생성 및 접근 권한 부여 시 요청 및 승인",
    keyControl: "No",
    frequency: "Event Driven",
    performDept: "개발 5유닛",
    reviewDept: "QA유닛",
    targetSystems: ["판다", "BI", "관리자콘솔(HR)", "관리자콘솔(CK)"],
  },
  "APD-10": {
    process: "DB/OS 계정 모니터링",
    subProcess: "DB/OS 계정 모니터링",
    title: "DB/OS 접근 가능 사용자 및 관리자 권한 보유자 모니터링",
    keyControl: "Yes",
    frequency: "Half-Bi-annual",
    performDept: "개발 5유닛",
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
    performDept: "개발 5유닛",
    reviewDept: "QA유닛",
    targetSystems: ["영림원", "BI"],
  },
  "PC-03": {
    process: "프로그램 변경 관리",
    subProcess: "프로그램 변경 관리",
    title: "프로그램 이관 승인",
    keyControl: "Yes",
    frequency: "Event Driven",
    performDept: "개발 5유닛",
    reviewDept: "QA유닛",
    targetSystems: ["영림원", "판다", "BI", "관리자콘솔(HR)", "관리자콘솔(CK)"],
  },
  "PC-04": {
    process: "프로그램 변경 관리",
    subProcess: "프로그램 변경 관리",
    title: "운영 환경 내 시스템 변경 불가",
    keyControl: "Yes",
    frequency: "Event Driven",
    performDept: "개발 5유닛",
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
    performDept: "개발 5유닛",
    reviewDept: "정보보호유닛",
    targetSystems: ["BI"],
  },
  "CO-03": {
    process: "물리적 보안",
    subProcess: "물리적 보안",
    title: "데이터센터 출입 로그 검토",
    keyControl: "Yes",
    frequency: "Quarterly",
    performDept: "개발 5유닛",
    reviewDept: "정보보호유닛",
    targetSystems: ["BI"],
  },
  "CO-04": {
    process: "데이터 백업 및 복구",
    subProcess: "데이터 백업 및 복구",
    title: "데이터베이스 복구테스트의 실시 및 결과 보고",
    keyControl: "Yes",
    frequency: "Annual",
    performDept: "개발 5유닛",
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
    performDept: "개발 5유닛",
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
    reviewDept: "TA유닛",
    targetSystems: ["BI"],
  },
  "C-IT-Cyber-02": {
    process: "Cybersecurity",
    subProcess: "Cybersecurity",
    title: "정보보안 교육의 실행 및 결과 보고",
    keyControl: "Yes",
    frequency: "Annual",
    performDept: "정보보호유닛",
    reviewDept: "TA유닛",
    targetSystems: ["BI"],
  },
  "C-IT-Cyber-03": {
    process: "Cybersecurity",
    subProcess: "Cybersecurity",
    title: "정보보안 대상 자산 및 인프라 목록 작성 및 업데이트",
    keyControl: "Yes",
    frequency: "Annual",
    performDept: "개발 5유닛",
    reviewDept: "정보보호유닛",
    targetSystems: ["BI"],
  },
  "C-IT-Cyber-04": {
    process: "Cybersecurity",
    subProcess: "Cybersecurity",
    title: "ESM(통합 관제 시스템) 상 감지된 특이상 분석, 조치 및 보고",
    keyControl: "Yes",
    frequency: "Monthly",
    performDept: "개발 5유닛",
    reviewDept: "정보보호유닛",
    targetSystems: ["BI"],
  },
  "C-IT-Cyber-05": {
    process: "Cybersecurity",
    subProcess: "Cybersecurity",
    title: "네트워크 보안 장비(방화벽, 보안프로토콜, 라우터 등)의 운용 및 관리",
    keyControl: "Yes",
    frequency: "Event Driven",
    performDept: "개발 5유닛",
    reviewDept: "정보보호유닛",
    targetSystems: ["BI"],
  },
  "C-IT-Cyber-06": {
    process: "Cybersecurity",
    subProcess: "Cybersecurity",
    title: "원격접속 권한의 요청 및 승인",
    keyControl: "Yes",
    frequency: "Event Driven",
    performDept: "개발 5유닛",
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

function getEvidencePreviewUrl(file) {
  const rawUrl = String(file?.url ?? "").trim();
  const driveFileId = String(file?.driveFileId ?? "").trim();

  if (driveFileId) {
    return `https://drive.google.com/uc?export=view&id=${driveFileId}`;
  }

  const byIdMatch = rawUrl.match(/[?&]id=([^&]+)/i);
  if (byIdMatch?.[1]) {
    return `https://drive.google.com/uc?export=view&id=${byIdMatch[1]}`;
  }

  const byPathMatch = rawUrl.match(/\/d\/([^/]+)/i);
  if (byPathMatch?.[1]) {
    return `https://drive.google.com/uc?export=view&id=${byPathMatch[1]}`;
  }

  return rawUrl;
}

function getEvidenceEmbedUrl(file) {
  const rawUrl = String(file?.url ?? "").trim();
  const driveFileId = String(file?.driveFileId ?? "").trim();

  if (driveFileId) {
    return `https://drive.google.com/file/d/${driveFileId}/preview`;
  }

  const byIdMatch = rawUrl.match(/[?&]id=([^&]+)/i);
  if (byIdMatch?.[1]) {
    return `https://drive.google.com/file/d/${byIdMatch[1]}/preview`;
  }

  const byPathMatch = rawUrl.match(/\/d\/([^/]+)/i);
  if (byPathMatch?.[1]) {
    return `https://drive.google.com/file/d/${byPathMatch[1]}/preview`;
  }

  return rawUrl;
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

function normalizeControl(control) {
  const catalog = controlCatalog[control.id] ?? {};
  const performDept = control.performDept ?? control.performer ?? control.ownerDept ?? "";
  const reviewDept = control.reviewDept ?? control.reviewer ?? "";
  const normalizedSystems =
    uniqueSystems(control.targetSystems ?? catalog.targetSystems).length > 0
      ? uniqueSystems(control.targetSystems ?? catalog.targetSystems)
      : defaultSystemsByCategory[control.process ?? catalog.process] ?? [];

  return {
    ...control,
    ...catalog,
    process: control.process?.trim() ?? catalog.process ?? "",
    subProcess: control.subProcess?.trim() ?? catalog.subProcess ?? control.process?.trim() ?? catalog.process ?? "",
    title: control.title?.replace(/\s+/g, " ").trim() ?? catalog.title ?? "",
    controlType: control.controlType ?? catalog.controlType ?? "예방",
    keyControl: control.keyControl ?? catalog.keyControl ?? "No",
    ownerDept: performDept || catalog.performDept || "",
    performer: control.performer ?? control.performDept ?? catalog.performDept ?? "",
    reviewer: control.reviewer ?? control.reviewDept ?? catalog.reviewDept ?? "",
    performDept: control.performDept ?? control.performer ?? catalog.performDept ?? "",
    reviewDept: control.reviewDept ?? control.reviewer ?? catalog.reviewDept ?? "",
    frequency: control.frequency ?? catalog.frequency,
    targetSystems: normalizedSystems,
    riskName: control.riskName ?? "",
    controlObjective: control.controlObjective ?? control.purpose ?? "",
    controlActivity: control.controlActivity ?? "",
    description: control.description ?? control.population ?? "",
    automationLevel: control.automationLevel ?? "",
    ownerPerson: control.ownerPerson ?? control.reviewer ?? "",
    evidenceText: control.evidenceText ?? "",
    testMethod: control.testMethod ?? "",
    policyReference: control.policyReference ?? "",
    deficiencyImpact: control.deficiencyImpact ?? "",
    evidenceFiles: Array.isArray(control.evidenceFiles) ? control.evidenceFiles : [],
    attributes: Array.isArray(control.attributes) ? control.attributes : [],
    evidences: Array.isArray(control.evidences) ? control.evidences : [],
    procedures: Array.isArray(control.procedures) ? control.procedures : [],
  };
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

  const result = IS_SUPABASE_BACKEND
    ? await uploadEvidenceToSupabase(controlId, files)
    : await uploadEvidenceToDrive(GOOGLE_SCRIPT_URL, controlId, files);
  return {
    uploaded: true,
    files: Array.isArray(result.files) && result.files.length > 0
      ? result.files
      : localFiles,
  };
}

async function fetchRemoteIntegrationStatusByBackend() {
  if (IS_SUPABASE_BACKEND) {
    return fetchSupabaseIntegrationStatus();
  }
  if (GOOGLE_SCRIPT_URL) {
    return fetchGoogleIntegrationStatus(GOOGLE_SCRIPT_URL);
  }
  return { spreadsheet: false, drive: false };
}

async function fetchRemoteWorkspaceByBackend() {
  if (IS_SUPABASE_BACKEND) {
    return fetchSupabaseWorkspace();
  }
  if (GOOGLE_SCRIPT_URL) {
    return fetchGoogleWorkspace(GOOGLE_SCRIPT_URL);
  }
  return null;
}

async function syncRemoteWorkspaceByBackend(workspace) {
  if (IS_SUPABASE_BACKEND) {
    return syncSupabaseWorkspace(workspace);
  }
  if (GOOGLE_SCRIPT_URL) {
    return syncGoogleWorkspace(GOOGLE_SCRIPT_URL, workspace);
  }
  return { ok: true };
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
  const saved = window.localStorage.getItem(STORAGE_KEY);
  if (!saved) return { ...structuredClone(defaultData), people: structuredClone(defaultPeople), auditLogs: [] };

  try {
    const parsed = JSON.parse(saved);
    if (parsed && Array.isArray(parsed.controls) && Array.isArray(parsed.workflows)) {
      return {
        ...parsed,
        controls: parsed.controls.map(normalizeControl),
        workflows: mergeMissingWorkflows(parsed.controls.map(normalizeControl), parsed.workflows),
        people: Array.isArray(parsed.people) ? parsed.people : structuredClone(defaultPeople),
        auditLogs: Array.isArray(parsed.auditLogs) ? parsed.auditLogs : [],
      };
    }
  } catch {}

  return { ...structuredClone(defaultData), people: structuredClone(defaultPeople), auditLogs: [] };
}

function persistWorkspace(workspace) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(workspace));
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

function controlProgressValue(control) {
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

  const executionStatus = deriveAssignmentStatus(control.executionNote ?? "", control.reviewChecked ?? "미검토");

  let completedCount = 0;
  if (executionStatus === "점검 완료") {
    completedCount = 1;
  } else if (executionStatus === "점검 중") {
    completedCount = 0.5;
  }

  return Math.min(100, Math.round((completedCount / target) * 100));
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
  Daily: "Daily",
  Weekly: "Weekly",
  Monthly: "Monthly",
  Quarterly: "Quarterly",
  "Half-Bi-annual": "Half-Bi-annual",
  Annual: "Annual",
  "Event Driven": "Event Driven",
  Other: "Other",
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
    EXECUTION_SAVED: "통제 운영 저장",
    REVIEW_SAVED: "검토 저장",
    REVIEW_COMPLETED: "승인 완료",
    REPORT_VIEWED: "리포트 조회",
    REPORT_HTML_EXPORTED: "HTML 리포트 출력",
    REPORT_PDF_PRINTED: "PDF 리포트 출력",
  };

  return labels[action] ?? "기타";
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

function integrationClass(status) {
  if (status === "연결됨") return "status-normal";
  if (status === "미확인") return "status-warning";
  return "status-danger";
}

function nextWorkflowStatus(status) {
  const index = implementationStatusOrder.indexOf(status);
  return implementationStatusOrder[Math.min(index + 1, implementationStatusOrder.length - 1)];
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
    <div className="system-chip-list">
      {systems.map((system) => (
        <span className="system-chip" key={system}>
          {system}
        </span>
      ))}
    </div>
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

function loadAuthSession() {
  try {
    const saved = window.localStorage.getItem(AUTH_STORAGE_KEY);
    if (!saved) {
      return null;
    }

    const parsed = JSON.parse(saved);
    if (!parsed?.email || !String(parsed.email).toLowerCase().endsWith("@muhayu.com")) {
      window.localStorage.removeItem(AUTH_STORAGE_KEY);
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export default function App() {
  const [authUser, setAuthUser] = useState(() => loadAuthSession());
  const [authError, setAuthError] = useState("");
  const [workspace, setWorkspace] = useState(() => loadWorkspace());
  const [currentView, setCurrentView] = useState("dashboard");
  const [selectedControlId, setSelectedControlId] = useState("");
  const [processFilter, setProcessFilter] = useState("전체");
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
  const [assignmentReviewer, setAssignmentReviewer] = useState("");
  const [assignmentReviewChecked, setAssignmentReviewChecked] = useState("미검토");
  const [assignmentReviewNote, setAssignmentReviewNote] = useState("");
  const [dashboardView, setDashboardView] = useState("category");
  const [dashboardUnitFilter, setDashboardUnitFilter] = useState("전체");
  const [dashboardDelayFilter, setDashboardDelayFilter] = useState("전체");
  const [workbenchTab, setWorkbenchTab] = useState("register");
  const [dashboardCalendarMonth, setDashboardCalendarMonth] = useState(() => {
    const month = new Date().getMonth() + 1;
    return Number.isInteger(month) && month >= 1 && month <= 12 ? month : 1;
  });
  const currentCalendarMonth = useMemo(() => new Date().getMonth() + 1, []);
  const [reportPeriod, setReportPeriod] = useState("monthly");
  const [reportFormat, setReportFormat] = useState("html");
  const [reportPreviewOpen, setReportPreviewOpen] = useState(false);
  const [reportPreviewMarkup, setReportPreviewMarkup] = useState("");
  const [evidencePreviewFile, setEvidencePreviewFile] = useState(null);
  const [executionSavePopupOpen, setExecutionSavePopupOpen] = useState(false);
  const [memberDrafts, setMemberDrafts] = useState({});
  const [auditLogQuery, setAuditLogQuery] = useState("");
  const [auditLogPage, setAuditLogPage] = useState(1);
  const [integrationStatus, setIntegrationStatus] = useState(() => ({
    spreadsheet: HAS_REMOTE_BACKEND ? "미확인" : "미설정",
    drive: HAS_REMOTE_BACKEND ? "미확인" : "미설정",
  }));
  const googleLoginRef = useRef(null);
  const reportPreviewFrameRef = useRef(null);

  const { controls, workflows, people } = workspace;
  const isWorkbenchView = currentView === "control-workbench";
  const auditLogs = workspace.auditLogs ?? [];
  const selectedControl = controls.find((control) => control.id === selectedControlId) ?? null;
  const roleAssignmentControl = controls.find((control) => control.id === roleAssignmentControlId) ?? controls[0] ?? null;
  const processSummary = summarizeByProcess(controls, workflows);
  const processOptions = ["전체", ...new Set(controls.map((control) => control.process))];
  const dashboardUnitOptions = useMemo(
    () => ["전체", ...new Set(controls.map((control) => control.performDept ?? control.performer ?? "미지정"))],
    [controls],
  );
  const performerPeople = people.filter((person) => person.role === "performer" || person.role === "both");
  const reviewerPeople = people.filter((person) => person.role === "reviewer" || person.role === "both");
  const memberDirectory = useMemo(() => {
    const syncedPeople = people
      .filter((person) => String(person.email ?? "").trim().length > 0)
      .map((person) => ({
        ...person,
        email: person.email ?? "",
        unit: person.unit ?? person.team ?? "미지정",
        accessRole: person.accessRole ?? "viewer",
      }));

    if (!authUser?.email) {
      return syncedPeople;
    }

    const hasCurrentUser = syncedPeople.some((person) => person.email === authUser.email);
    if (hasCurrentUser) {
      return syncedPeople;
    }

    return [
      {
        id: "AUTH-CURRENT",
        name: authUser.name ?? authUser.email,
        email: authUser.email,
        unit: "미지정",
        team: "미지정",
        accessRole: "admin",
      },
      ...syncedPeople,
    ];
  }, [authUser, people]);
  const canManageMembers =
    (memberDirectory.find((person) => person.email === authUser?.email)?.accessRole ?? "viewer") === "admin";

  const listPageSize = (isWorkbenchView || currentView === "control-list") ? 15 : 10;
  const visibleControls =
    processFilter === "전체" ? controls : controls.filter((control) => control.process === processFilter);
  const totalControlPages = Math.max(1, Math.ceil(visibleControls.length / listPageSize));
  const currentControlPage = Math.min(controlListPage, totalControlPages);
  const limitedControls = visibleControls.slice(
    (currentControlPage - 1) * listPageSize,
    currentControlPage * listPageSize,
  );
  const registrationCompletion = useMemo(() => {
    const filled = registrationRequiredFields.filter((key) => isRegistrationFieldFilled(registrationForm, key)).length;
    return Math.round((filled / registrationRequiredFields.length) * 100);
  }, [registrationForm]);
  const registrationMissingFields = registrationRequiredFields.filter((key) => !isRegistrationFieldFilled(registrationForm, key));
  const canSubmitRegistration = registrationMissingFields.length === 0;
  const registrationCategoryOptions = ["전체", ...new Set(controls.map((control) => control.process))];
  const registrationVisibleControls =
    registrationCategoryFilter === "전체"
      ? controls
      : controls.filter((control) => control.process === registrationCategoryFilter);
  const registrationTotalPages = Math.max(1, Math.ceil(registrationVisibleControls.length / listPageSize));
  const registrationCurrentPage = Math.min(registrationListPage, registrationTotalPages);
  const registrationPagedControls = registrationVisibleControls.slice(
    (registrationCurrentPage - 1) * listPageSize,
    registrationCurrentPage * listPageSize,
  );
  const registrationSelectedControl =
    controls.find((control) => control.id === registrationSelectedControlId)
    ?? registrationPagedControls[0]
    ?? controls[0]
    ?? null;
  const assignmentStatus = deriveAssignmentStatus(assignmentExecutionNote, assignmentReviewChecked);
  const reportPeriodConfig = {
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
      .filter((control) => config.frequencies.includes(control.frequency))
      .map((control) => ({
        id: control.id,
        title: control.title,
        process: control.process,
        frequency: control.frequency,
        performer: control.performDept ?? control.performer ?? "-",
        reviewer: control.reviewDept ?? control.reviewer ?? "-",
        status: control.status ?? "-",
        reviewChecked: control.reviewChecked ?? "미검토",
        executionNote: control.executionNote?.trim() || "-",
        evidenceCount: Array.isArray(control.evidenceFiles) ? control.evidenceFiles.length : 0,
        evidenceFiles: Array.isArray(control.evidenceFiles) ? control.evidenceFiles : [],
      }));
  }, [controls, reportPeriod]);
  const reportSummary = useMemo(() => ({
    total: reportControls.length,
    completed: reportControls.filter((item) => item.status === "점검 완료" || item.status === "정상").length,
    inProgress: reportControls.filter((item) => item.status === "점검 중").length,
    scheduled: reportControls.filter((item) => item.status === "점검 예정").length,
  }), [reportControls]);
  const filteredAuditLogs = useMemo(() => {
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
  const totalAuditLogPages = Math.max(1, Math.ceil(filteredAuditLogs.length / 30));
  const currentAuditLogPage = Math.min(auditLogPage, totalAuditLogPages);
  const pagedAuditLogs = filteredAuditLogs.slice((currentAuditLogPage - 1) * 30, currentAuditLogPage * 30);

  useEffect(() => {
    setMemberDrafts(
      Object.fromEntries(
        memberDirectory.map((person) => [
          person.id,
          {
            unit: person.unit ?? person.team ?? "미지정",
            accessRole: person.accessRole ?? "viewer",
          },
        ]),
      ),
    );
  }, [memberDirectory]);

  useEffect(() => {
    if (auditLogPage > totalAuditLogPages) {
      setAuditLogPage(totalAuditLogPages);
    }
  }, [auditLogPage, totalAuditLogPages]);

  useEffect(() => {
    setAuditLogPage(1);
  }, [auditLogQuery]);

  useEffect(() => {
    if (!authUser?.email) {
      return;
    }

    const normalizedEmail = authUser.email.toLowerCase();
    const currentMember = people.find((person) => String(person.email ?? "").toLowerCase() === normalizedEmail);
    if (!currentMember || currentMember.accessRole === "admin") {
      return;
    }

    updateWorkspace({
      ...workspace,
      people: people.map((person) =>
        String(person.email ?? "").toLowerCase() === normalizedEmail
          ? { ...person, accessRole: "admin" }
          : person,
      ),
    });
  }, [authUser, people]);

  const dashboardFilteredControls = useMemo(
    () => controls.filter((control) => {
      const matchesUnit =
        dashboardUnitFilter === "전체"
          ? true
          : (control.performDept ?? control.performer ?? "미지정") === dashboardUnitFilter;
      const matchesDelay =
        dashboardDelayFilter === "지연만"
          ? !isCompletedStatus(control.status)
          : true;
      return matchesUnit && matchesDelay;
    }),
    [controls, dashboardUnitFilter, dashboardDelayFilter],
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

    dashboardFilteredControls.forEach((control) => {
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
      items: bucket.items.sort((left, right) => {
        const leftIndex = frequencyOrder.indexOf(left.frequency);
        const rightIndex = frequencyOrder.indexOf(right.frequency);
        const safeLeft = leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex;
        const safeRight = rightIndex === -1 ? Number.MAX_SAFE_INTEGER : rightIndex;
        return safeLeft - safeRight || left.id.localeCompare(right.id, "ko");
      }),
    }));
  }, [dashboardFilteredControls]);
  const dashboardMonthlyCards =
    dashboardCalendarSummary.find((bucket) => bucket.month === dashboardCalendarMonth)?.items ?? [];
  const controlProgressGroups = useMemo(() => {
    const grouped = dashboardFilteredControls.reduce((acc, control) => {
      const frequency = control.frequency || "미지정";
      const progress = controlProgressValue(control);
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
        items,
      }));
  }, [dashboardFilteredControls]);
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
        progress: controlProgressValue(control) ?? 0,
        status: deriveAssignmentStatus(control.executionNote ?? "", control.reviewChecked ?? "미검토"),
      })),
    [dashboardFilteredControls],
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
        items,
      }));
  }, [dashboardControlItems]);
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
        { label: "Monthly", value: `${countByFrequency("Monthly")}건`, targetId: "dashboard-frequency-monthly" },
        { label: "Quarterly", value: `${countByFrequency("Quarterly")}건`, targetId: "dashboard-frequency-quarterly" },
        { label: "Half-Bi-annual", value: `${countByFrequency("Half-Bi-annual")}건`, targetId: "dashboard-frequency-half-bi-annual" },
        { label: "Annual", value: `${countByFrequency("Annual")}건`, targetId: "dashboard-frequency-annual" },
        { label: "Event Driven", value: `${countByFrequency("Event Driven")}건`, targetId: "dashboard-frequency-event-driven" },
        { label: "Other", value: `${countByFrequency("Other")}건`, targetId: "dashboard-frequency-other" },
      ];
    }

    if (dashboardView === "category") {
      const completedCategories = dashboardProcessSummary.filter((item) => item.pending === 0).length;
      const pendingCategories = dashboardProcessSummary.filter((item) => item.pending > 0).length;
      const averageProgress =
        dashboardProcessSummary.length === 0
          ? 0
          : Math.round(dashboardProcessSummary.reduce((sum, item) => sum + item.progressRate, 0) / dashboardProcessSummary.length);

      return [
        { label: "전체", value: `${dashboardProcessSummary.length}개`, targetId: "dashboard-category-root" },
        { label: "완료", value: `${completedCategories}개`, targetId: dashboardAnchorTargets.completedCategory ? `dashboard-category-${toDashboardAnchor(dashboardAnchorTargets.completedCategory)}` : "dashboard-category-root" },
        { label: "관리 필요", value: `${pendingCategories}개`, targetId: dashboardAnchorTargets.pendingCategory ? `dashboard-category-${toDashboardAnchor(dashboardAnchorTargets.pendingCategory)}` : "dashboard-category-root" },
        { label: "현재 현황 평균", value: `${averageProgress}%`, targetId: "dashboard-category-root" },
      ];
    }

    return [
      { label: "전체 통제", value: `${dashboardStatusSummary.total}건`, targetId: "dashboard-control-root" },
      { label: "진행 중", value: `${dashboardStatusSummary.inProgress}건`, targetId: dashboardAnchorTargets.inProgress ? `dashboard-control-${toDashboardAnchor(dashboardAnchorTargets.inProgress)}` : "dashboard-control-root" },
      { label: "완료", value: `${dashboardStatusSummary.completed}건`, targetId: dashboardAnchorTargets.completed ? `dashboard-control-${toDashboardAnchor(dashboardAnchorTargets.completed)}` : "dashboard-control-root" },
      { label: "예정", value: `${dashboardStatusSummary.scheduled}건`, targetId: dashboardAnchorTargets.scheduled ? `dashboard-control-${toDashboardAnchor(dashboardAnchorTargets.scheduled)}` : "dashboard-control-root" },
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
    () => controls.filter((control) => String(control.executionNote ?? "").trim().length > 0),
    [controls],
  );
  const reviewVisibleControls =
    processFilter === "전체"
      ? reviewQueueControls
      : reviewQueueControls.filter((control) => control.process === processFilter);
  const totalReviewPages = Math.max(1, Math.ceil(reviewVisibleControls.length / listPageSize));
  const currentReviewPage = Math.min(controlListPage, totalReviewPages);
  const reviewPagedControls = reviewVisibleControls.slice(
    (currentReviewPage - 1) * listPageSize,
    currentReviewPage * listPageSize,
  );
  const selectedReviewControl =
    reviewVisibleControls.find((control) => control.id === selectedControlId)
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
    if (nextView === "controls") {
      setProcessFilter("전체");
      setControlListPage(1);
      setSelectedControlId(controls[0]?.id ?? "");
    }
    if (nextView === "control-review") {
      setProcessFilter("전체");
      setControlListPage(1);
      setSelectedControlId(reviewQueueControls[0]?.id ?? "");
    }
    if (nextView === "control-workbench") {
      setWorkbenchTab("register");
      setRegistrationCategoryFilter("전체");
      setRegistrationListPage(1);
      setProcessFilter("전체");
      setControlListPage(1);
      setRegistrationSelectedControlId(controls[0]?.id ?? "");
      setSelectedControlId(controls[0]?.id ?? "");
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
    setWorkbenchTab(nextTab);

    if (nextTab === "register") {
      setRegistrationCategoryFilter("전체");
      setRegistrationListPage(1);
      setRegistrationSelectedControlId(controls[0]?.id ?? "");
      return;
    }

    if (nextTab === "controls") {
      setProcessFilter("전체");
      setControlListPage(1);
      setSelectedControlId(controls[0]?.id ?? "");
      return;
    }

    if (nextTab === "control-review") {
      setProcessFilter("전체");
      setControlListPage(1);
      setSelectedControlId(reviewQueueControls[0]?.id ?? "");
    }
  }

  function moveToDashboardTarget(targetId) {
    const element = document.getElementById(targetId);
    if (!element) {
      return;
    }
    element.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function openControlOperation(controlId, nextProcessFilter = "전체") {
    const targetControl = controls.find((control) => control.id === controlId);
    const resolvedProcess = nextProcessFilter === "전체"
      ? (targetControl?.process ?? "전체")
      : nextProcessFilter;

    setProcessFilter(resolvedProcess);
    setControlListPage(1);
    setSelectedControlId(controlId || targetControl?.id || controls[0]?.id || "");
    setCurrentView("controls");
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "auto" });
    }
    writeAuditLog("MENU_OPEN", "controls", `통제 운영 열람 · ${controlId || resolvedProcess}`);
    if (window.matchMedia("(max-width: 960px)").matches) {
      setIsSidebarOpen(false);
    }
  }

  function handleLoginSuccess(response) {
    const payload = decodeJwtPayload(response?.credential ?? "");
    const email = String(payload?.email ?? "").toLowerCase();

    if (!payload || !payload.email_verified || !email.endsWith("@muhayu.com")) {
      setAuthError("muhayu.com 계정만 로그인할 수 있습니다.");
      window.localStorage.removeItem(AUTH_STORAGE_KEY);
      setAuthUser(null);
      return;
    }

    const nextUser = {
      email,
      name: payload.name ?? email,
      picture: payload.picture ?? "",
    };

    const existingMember = people.find((person) => String(person.email ?? "").toLowerCase() === email);
    const nextPeople = existingMember
      ? people.map((person) =>
          String(person.email ?? "").toLowerCase() === email
            ? {
                ...person,
                name: nextUser.name,
                email,
                unit: person.unit ?? person.team ?? "미지정",
                accessRole: "admin",
              }
            : person,
        )
      : [
          {
            id: `MBR-${String(Date.now()).slice(-6)}`,
            name: nextUser.name,
            email,
            role: "both",
            unit: "미지정",
            team: "미지정",
            accessRole: "admin",
          },
          ...people,
        ];

    window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(nextUser));
    setAuthError("");
    setAuthUser(nextUser);
    writeAuditLog(
      existingMember ? "LOGIN_SUCCESS" : "MEMBER_JOINED",
      email,
      existingMember ? `${nextUser.name} 로그인` : `${nextUser.name} 최초 로그인 및 회원 등록`,
      {
        ...workspace,
        people: nextPeople,
      },
    );
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
        hd: "muhayu.com",
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
  }, [authUser]);

  useEffect(() => {
    setEvidenceInputCount(1);
    setAssignmentExecutionNote(selectedControl?.executionNote ?? "");
    setAssignmentReviewer(selectedControl?.reviewer ?? selectedControl?.reviewDept ?? "");
    setAssignmentReviewChecked(selectedControl?.reviewChecked ?? "미검토");
  }, [selectedControlId, selectedControl?.executionNote, selectedControl?.reviewChecked, selectedControl?.reviewDept, selectedControl?.reviewer]);

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
    if (!HAS_REMOTE_BACKEND) {
      return;
    }

    let active = true;

    fetchRemoteWorkspaceByBackend()
      .then((remoteWorkspace) => {
        if (!active || !remoteWorkspace || !Array.isArray(remoteWorkspace.controls)) {
          return;
        }

        const remoteControls = remoteWorkspace.controls.map(normalizeControl);
        if (remoteControls.length === 0) {
          const seededWorkspace = {
            controls: structuredClone(defaultData.controls),
            workflows: structuredClone(defaultData.workflows),
            people: structuredClone(defaultPeople),
            auditLogs: [],
          };

          setWorkspace(seededWorkspace);
          persistWorkspace(seededWorkspace);
          syncRemoteWorkspaceByBackend(seededWorkspace).catch(() => {});
          return;
        }

        const nextWorkspace = {
          controls: remoteControls,
          workflows: mergeMissingWorkflows(remoteControls, Array.isArray(remoteWorkspace.workflows) ? remoteWorkspace.workflows : []),
          people: Array.isArray(remoteWorkspace.people) && remoteWorkspace.people.length > 0
            ? remoteWorkspace.people
            : structuredClone(defaultPeople),
          auditLogs: Array.isArray(remoteWorkspace.auditLogs) ? remoteWorkspace.auditLogs : [],
        };

        setIntegrationStatus((current) => ({
          ...current,
          spreadsheet: "연결됨",
        }));
        setWorkspace(nextWorkspace);
        persistWorkspace(nextWorkspace);
      })
      .catch(() => {
        setIntegrationStatus((current) => ({
          ...current,
          spreadsheet: "오류",
        }));
      });

    return () => {
      active = false;
    };
  }, []);

  function updateWorkspace(nextWorkspace) {
    setWorkspace(nextWorkspace);
    persistWorkspace(nextWorkspace);
    if (HAS_REMOTE_BACKEND) {
      syncRemoteWorkspaceByBackend(nextWorkspace)
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

  function writeAuditLog(action, target, detail, baseWorkspace = workspace) {
    const nextWorkspace = {
      ...baseWorkspace,
      auditLogs: [
        {
          id: `LOG-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          action,
          target,
          detail,
          actorName: authUser?.name ?? "",
          actorEmail: authUser?.email ?? "",
          ip: "-",
          createdAt: formatSeoulDateTime(new Date()),
        },
        ...(baseWorkspace.auditLogs ?? auditLogs),
      ].slice(0, 300),
    };

    updateWorkspace(nextWorkspace);
    return nextWorkspace;
  }

  function buildReportMarkup() {
    const periodLabel = reportPeriodConfig[reportPeriod]?.label ?? "주기";
    const rows = reportControls.map((item) => `
      <tr>
        <td>${item.id}</td>
        <td>${item.title}</td>
        <td>${item.process}</td>
        <td>${item.performer}</td>
        <td>${item.reviewer}</td>
        <td>${item.status}</td>
        <td>${item.reviewChecked}</td>
        <td>
          <div>${item.evidenceCount}건</div>
          <div class="evidence-preview-list">
            ${item.evidenceFiles
              .filter((file) => isImageEvidence(file) && file.url)
              .map((file) => `<img src="${getEvidencePreviewUrl(file)}" alt="${file.name}" class="evidence-preview-image" />`)
              .join("")}
          </div>
        </td>
        <td>${item.executionNote}</td>
      </tr>
    `).join("");

    return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <title>${periodLabel} 수행 리포트</title>
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
      white-space: nowrap;
    }
    th { background: #f3f4f6; }
    .evidence-preview-list { display: flex; gap: 4px; align-items: center; margin-top: 4px; }
    .evidence-preview-image { width: 44px; height: 44px; object-fit: cover; border: 1px solid #d1d5db; }
  </style>
</head>
<body>
  <h1>${periodLabel} 수행 리포트</h1>
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
        <th>ID</th><th>통제명</th><th>카테고리</th><th>수행자</th><th>검토자</th><th>상태</th><th>승인</th><th>증적</th><th>수행 내역</th>
      </tr>
    </thead>
    <tbody>${rows || '<tr><td colspan="9">대상 통제가 없습니다.</td></tr>'}</tbody>
  </table>
</body>
</html>`;
  }

  function handleRemoveEvidenceFile(fileIndex) {
    if (!selectedControl) {
      return;
    }

    const nextEvidenceFiles = (selectedControl.evidenceFiles ?? []).filter((_, index) => index !== fileIndex);
    const nextWorkspace = {
      ...workspace,
      controls: controls.map((control) =>
        control.id === selectedControl.id
          ? {
              ...control,
              evidenceFiles: nextEvidenceFiles,
              evidenceStatus: nextEvidenceFiles.length > 0 ? control.evidenceStatus || "수집 중" : "미수집",
            }
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
      window.alert("저장된 파일만 미리볼 수 있습니다.");
      return;
    }

    setEvidencePreviewFile(file);
  }

  function handleDownloadEvidence(file) {
    const href = String(file?.url ?? "").trim();
    if (!href) {
      window.alert("다운로드할 파일 URL이 없습니다.");
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
    const markup = buildReportMarkup();
    setReportPreviewMarkup(markup);
    setReportPreviewOpen(true);
    writeAuditLog("REPORT_VIEWED", reportPeriod, `${periodLabel} 수행 리포트 미리보기`);
  }

  function handlePrintReportPreview() {
    const periodLabel = reportPeriodConfig[reportPeriod]?.label ?? "주기";
    const frameWindow = reportPreviewFrameRef.current?.contentWindow;
    if (!frameWindow) {
      return;
    }

    frameWindow.focus();
    frameWindow.print();
    writeAuditLog(
      reportFormat === "html" ? "REPORT_HTML_EXPORTED" : "REPORT_PDF_PRINTED",
      reportPeriod,
      `${periodLabel} 수행 리포트 ${reportFormat === "html" ? "HTML 출력" : "PDF 출력"}`,
    );
  }

  function resetWorkspace() {
    updateWorkspace({ ...structuredClone(defaultData), people: structuredClone(defaultPeople) });
    setCurrentView("controls");
    setSelectedControlId("");
    setProcessFilter("전체");
    setControlListPage(1);
    setControlPanelMode("create");
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

  function saveRegistrationDraft() {
    window.localStorage.setItem(REGISTRATION_DRAFT_KEY, JSON.stringify(registrationForm));
    window.alert("통제 등록 초안을 임시 저장했습니다.");
  }

  function loadRegistrationControl(control) {
    const fallbackControlActivity =
      control.controlActivity
      ?? control.attributes?.[0]
      ?? control.purpose
      ?? "";
    const fallbackDescription =
      control.description
      ?? control.population
      ?? control.note
      ?? "";
    const fallbackTargetSystems =
      Array.isArray(control.targetSystems) && control.targetSystems.length > 0
        ? control.targetSystems
        : resolveDefaultSystems(control.process);

    setRegistrationSelectedControlId(control.id);
    setRegistrationForm({
      controlId: control.id ?? "",
      process: control.process ?? "",
      subProcess: control.subProcess ?? "",
      risk: control.riskName ?? "",
      controlName: control.title ?? "",
      controlObjective: control.controlObjective ?? control.purpose ?? "",
      controlActivity: fallbackControlActivity,
      description: fallbackDescription,
      frequency: control.frequency ?? "수시",
      controlType: control.controlType ?? "예방",
      automationLevel: control.automationLevel ?? "수동",
      keyControl: isKeyControl(control.keyControl),
      ownerDept: control.performDept ?? control.performer ?? "",
      evidence: resolveControlEvidenceText(control),
      testMethod: resolveControlTestMethod(control),
      population: control.population ?? "",
      policyReference: control.policyReference ?? "",
      deficiencyImpact: control.deficiencyImpact ?? "높음",
      targetSystems: fallbackTargetSystems,
    });
  }

  function startNewRegistration() {
    setRegistrationSelectedControlId("");
    setRegistrationForm(initialRegistrationForm);
  }

  function saveRegisteredControl() {
    if (!canSubmitRegistration) {
      window.alert(`필수 항목이 누락되었습니다: ${registrationMissingFields.join(", ")}`);
      return;
    }

    const editingControl = controls.find((control) => control.id === registrationSelectedControlId) ?? null;
    const preservedReviewer = editingControl?.reviewer ?? editingControl?.reviewDept ?? "";
    const preservedOwnerPerson = editingControl?.ownerPerson ?? "";

    const nextControl = normalizeControl({
      id: registrationForm.controlId.trim(),
      cycle: "",
      process: registrationForm.process.trim(),
      subProcess: registrationForm.subProcess.trim() || registrationForm.process.trim(),
      title: registrationForm.controlName.trim(),
      purpose: registrationForm.controlObjective.trim(),
      riskId: "",
      riskName: registrationForm.risk.trim(),
      controlObjective: registrationForm.controlObjective.trim(),
      controlActivity: registrationForm.controlActivity.trim(),
      description: registrationForm.description.trim(),
      frequency: registrationForm.frequency,
      controlType: registrationForm.controlType,
      keyControl: registrationForm.keyControl ? "Yes" : "No",
      status: "점검 예정",
      evidenceStatus: "미수집",
      ownerDept: registrationForm.ownerDept.trim(),
      performer: registrationForm.ownerDept.trim(),
      reviewer: preservedReviewer,
      performDept: registrationForm.ownerDept.trim(),
      reviewDept: preservedReviewer,
      ownerPerson: preservedOwnerPerson,
      targetSystems: registrationForm.targetSystems ?? [],
      note: "",
      population: registrationForm.population.trim(),
      attributes: [
        registrationForm.controlActivity.trim(),
        registrationForm.policyReference.trim(),
        registrationForm.deficiencyImpact.trim(),
      ].filter(Boolean),
      evidences: registrationForm.evidence.split(",").map((item) => item.trim()).filter(Boolean),
      procedures: registrationForm.testMethod.split(",").map((item) => item.trim()).filter(Boolean),
      automationLevel: registrationForm.automationLevel,
      evidenceText: registrationForm.evidence.trim(),
      testMethod: registrationForm.testMethod.trim(),
      policyReference: registrationForm.policyReference.trim(),
      deficiencyImpact: registrationForm.deficiencyImpact.trim(),
    });
    const duplicateControl = controls.find((control) => control.id === nextControl.id);

    if (duplicateControl && duplicateControl.id !== editingControl?.id) {
      window.alert("같은 통제번호가 이미 존재합니다.");
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
      window.alert("통제를 수정했습니다.");
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
    window.alert("통제를 등록했습니다.");
  }

  useEffect(() => {
    if (!registrationSelectedControlId) {
      return;
    }

    const control = controls.find((item) => item.id === registrationSelectedControlId);
    if (control) {
      loadRegistrationControl(control);
    }
  }, [registrationSelectedControlId]);

  useEffect(() => {
    if (!registrationSelectedControlId) {
      return;
    }

    if (!controls.some((control) => control.id === registrationSelectedControlId)) {
      setRegistrationSelectedControlId("");
    }
  }, [controls, registrationSelectedControlId]);

  function handlePersonSubmit(event) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const person = {
      id: formData.get("personId").toString().trim(),
      name: formData.get("personName").toString().trim(),
      email: formData.get("personEmail").toString().trim().toLowerCase(),
      role: "both",
      team: formData.get("personTeam").toString().trim(),
      accessRole: "user",
    };

    if (people.some((entry) => entry.id === person.id)) {
      window.alert("같은 담당자 ID가 이미 존재합니다.");
      return;
    }

    if (person.email && !person.email.endsWith("@muhayu.com")) {
      window.alert("muhayu.com 이메일만 등록할 수 있습니다.");
      return;
    }

    updateWorkspace({
      ...workspace,
      people: [person, ...people],
    });
    event.currentTarget.reset();
  }

  function handleMemberAccessRoleChange(personId, accessRole) {
    updateWorkspace({
      ...workspace,
      people: people.map((person) =>
        person.id === personId
          ? { ...person, accessRole }
          : person,
        ),
    });
  }

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

  function handleMemberSave(personId, overrideDraft = null) {
    if (!canManageMembers) {
      return;
    }

    const sourcePerson = memberDirectory.find((person) => person.id === personId);
    if (!sourcePerson) return;

    const draft = overrideDraft ?? memberDrafts[personId] ?? {
      unit: sourcePerson.unit ?? sourcePerson.team ?? "미지정",
      accessRole: sourcePerson.accessRole ?? "viewer",
    };
    const normalizedEmail = String(sourcePerson.email ?? "").trim().toLowerCase();
    if (!normalizedEmail) return;

    const existingIndex = people.findIndex((person) => String(person.email ?? "").trim().toLowerCase() === normalizedEmail);
    const nextEntry = {
      id: existingIndex >= 0 ? people[existingIndex].id : `MBR-${String(Date.now()).slice(-6)}`,
      name: sourcePerson.name,
      email: normalizedEmail,
      role: existingIndex >= 0 ? people[existingIndex].role ?? "both" : "both",
      unit: draft.unit.trim() || "미지정",
      team: draft.unit.trim() || "미지정",
      accessRole: draft.accessRole || "viewer",
    };

    const nextPeople =
      existingIndex >= 0
        ? people.map((person, index) => (index === existingIndex ? { ...person, ...nextEntry } : person))
        : [nextEntry, ...people];

    const previousPerson = existingIndex >= 0 ? people[existingIndex] : null;
    const action =
      !previousPerson
        ? "MEMBER_JOINED"
        : previousPerson.accessRole !== nextEntry.accessRole
          ? "ROLE_CHANGED"
          : "MEMBER_UPDATED";

    writeAuditLog(
      action,
      nextEntry.email,
      `${nextEntry.name} · 유닛:${previousPerson?.team ?? previousPerson?.unit ?? "-"} -> ${nextEntry.team}, 권한:${previousPerson?.accessRole ?? "-"} -> ${nextEntry.accessRole}`,
      {
        ...workspace,
        people: nextPeople,
      },
    );
  }

  function handleRoleAssignmentSubmit(event) {
    event.preventDefault();
    if (!roleAssignmentControl) return;

    const formData = new FormData(event.currentTarget);
    const performer = formData.get("performer").toString().trim();
    const reviewer = formData.get("reviewer").toString().trim();

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

  async function handleAssignmentSubmit(event) {
    event.preventDefault();
    if (!selectedControl) return;

    const formData = new FormData(event.currentTarget);
    const files = formData
      .getAll("evidenceFiles")
      .filter((value) => value instanceof File && value.size > 0);
    const executionNote = formData.get("executionNote").toString().trim();
    const status = executionNote ? "점검 중" : "점검 예정";
    let nextEvidenceFiles = selectedControl.evidenceFiles ?? [];
    let uploaded = false;

    if (!executionNote && files.length === 0) {
      window.alert("수행 내역 또는 증적 파일을 입력하세요.");
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
      } catch {
        setIntegrationStatus((current) => ({
          ...current,
          drive: "오류",
        }));
        window.alert("증적 파일 업로드에 실패했습니다.");
        return;
      }
    }

    const nextWorkspace = {
      ...workspace,
      controls: controls.map((control) =>
        control.id === selectedControl.id
          ? {
              ...control,
              status,
              executionNote,
              reviewChecked: "미검토",
              evidenceFiles: nextEvidenceFiles,
              evidenceStatus: nextEvidenceFiles.length > 0 && uploaded ? "준비 완료" : nextEvidenceFiles.length > 0 ? "수집 중" : "미수집",
            }
          : control,
      ),
    };
    writeAuditLog("EXECUTION_SAVED", selectedControl.id, `${selectedControl.title} 수행 내역 저장`, nextWorkspace);
    setExecutionSavePopupOpen(true);
  }

  function handleReviewSubmit(event) {
    event.preventDefault();
    if (!selectedReviewControl) return;

    const formData = new FormData(event.currentTarget);
    const reviewer = formData.get("reviewer").toString().trim();
    const reviewDecision = formData.get("reviewDecision").toString();
    const reviewNote = formData.get("reviewNote").toString().trim();
    const reviewChecked = reviewDecision === "양호" ? "검토 완료" : "반려";

    if (!reviewer) {
      window.alert("검토자를 입력하세요.");
      return;
    }

    const status = reviewDecision === "양호" ? "점검 완료" : "개선 필요";
    const nextWorkspace = {
      ...workspace,
      controls: controls.map((control) =>
        control.id === selectedReviewControl.id
          ? {
              ...control,
              reviewer,
              reviewDept: reviewer,
              reviewChecked,
              status,
              note: reviewNote,
              reviewResult: reviewDecision,
            }
          : control,
      ),
    };

    const loggedWorkspace = writeAuditLog("REVIEW_SAVED", selectedReviewControl.id, `${selectedReviewControl.title} 검토 저장`, nextWorkspace);
    if (reviewDecision === "양호") {
      writeAuditLog("REVIEW_COMPLETED", selectedReviewControl.id, `${selectedReviewControl.title} 검토 완료 · ${reviewer}`, loggedWorkspace);
    }
    window.alert("검토 결과가 저장되었습니다.");
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
      ownerDept: formData.get("performDept").toString().trim(),
      performer: formData.get("performDept").toString().trim(),
      reviewer: formData.get("reviewDept").toString().trim(),
      performDept: formData.get("performDept").toString().trim(),
      reviewDept: formData.get("reviewDept").toString().trim(),
      targetSystems,
      note: "",
      population: "",
      attributes: [],
      evidences: [],
      procedures: [],
    };

    if (controls.some((control) => control.id === nextControl.id)) {
      window.alert("같은 통제번호가 이미 존재합니다.");
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
    const performDept = formData.get("performDept").toString().trim();
    const reviewDept = formData.get("reviewDept").toString().trim();

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
              <span>muhayu.com</span>
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
          {authError ? <p className="login-error">{authError}</p> : null}
          <p className="login-footnote">인가된 `muhayu.com` 계정만 접근할 수 있습니다.</p>
        </section>
      </div>
    );
  }

  return (
    <div className={isSidebarOpen ? "app-shell" : "app-shell sidebar-collapsed"}>
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
          </button>
        ))}
      </nav>

      <div className="page-shell">
        <div className="app-user-topbar">
          <div className="app-user-chip">
            <strong>{authUser.name}</strong>
            <span>{authUser.email}</span>
          </div>
          <button className="secondary-button app-user-logout" type="button" onClick={handleLogout}>
            로그아웃
          </button>
        </div>
        <main className="layout">
          {currentView === "dashboard" ? (
            <>
              <section className={`dashboard-card control-progress-section dashboard-view-${dashboardView}`}>
                <section className="dashboard-month-calendar">
                  <div className="dashboard-month-calendar-head">
                    <strong>월 단위 캘린더</strong>
                    <span>{dashboardCalendarMonth}월 수행 대상 {dashboardMonthlyCards.length}건</span>
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
                          onClick={() => setDashboardCalendarMonth(bucket.month)}
                        >
                          <span>{bucket.month}월</span>
                          <strong>{bucket.items.length}건</strong>
                        </button>
                      );
                    })}
                  </div>
                  <div className="dashboard-month-card-list">
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
                          <p>{item.title}</p>
                          <small>{item.process} · {frequencyLabelMap[item.frequency] ?? item.frequency ?? "-"}</small>
                        </button>
                      ))
                    ) : (
                      <p className="empty-text dashboard-month-empty">해당 월에 예정된 정기 통제가 없습니다.</p>
                    )}
                  </div>
                </section>
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
                      onClick={() => moveToDashboardTarget(card.targetId)}
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
                    onClick={() => setDashboardView("category")}
                  >
                    <span className="tab-label-desktop">카테고리 기준</span>
                    <span className="tab-label-mobile">카테고리</span>
                  </button>
                  <button
                    type="button"
                    className={dashboardView === "frequency" ? "tab-button active" : "tab-button"}
                    onClick={() => setDashboardView("frequency")}
                  >
                    <span className="tab-label-desktop">주기 기준</span>
                    <span className="tab-label-mobile">주기</span>
                  </button>
                  <button
                    type="button"
                    className={dashboardView === "control" ? "tab-button active" : "tab-button"}
                    onClick={() => setDashboardView("control")}
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
                    {controlProgressGroups.map((group) => (
                      <section
                        className={`control-progress-group tone-${toDashboardAnchor(group.frequency)}`}
                        key={group.frequency}
                        id={`dashboard-frequency-${toDashboardAnchor(group.frequency)}`}
                      >
                        <div className="control-progress-group-head">
                          <strong>{group.label}</strong>
                          <span>{group.items.length}건</span>
                        </div>
                        <div className="control-progress-list">
                          {group.items.map((item) => (
                            <button
                              type="button"
                              className="control-progress-card"
                              key={item.id}
                              onClick={() => openControlOperation(item.id, item.process)}
                            >
                              <div className="control-progress-head">
                                <strong>{item.id}</strong>
                                <span className={`status-badge ${statusClass(item.status)}`}>{item.status}</span>
                              </div>
                              <p>{item.title}</p>
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
                    {dashboardControlGroups.map((group) => (
                      <section className={`control-progress-group tone-${toDashboardAnchor(group.group)}`} key={group.group}>
                        <div className="control-progress-group-head">
                          <strong>{group.group}</strong>
                          <span>{group.items.length}건</span>
                        </div>
                        <div className="control-progress-list control-progress-list-by-control">
                          {group.items.map((item) => (
                            <button
                              type="button"
                              className="control-progress-card"
                              key={item.id}
                              id={`dashboard-control-${toDashboardAnchor(item.id)}`}
                              onClick={() => openControlOperation(item.id, item.process)}
                            >
                              <div className="control-progress-head">
                                <strong>{item.id}</strong>
                                <span className={`status-badge ${statusClass(item.status)}`}>{item.status}</span>
                              </div>
                              <p>{item.title}</p>
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
                    {dashboardProcessSummary.map((item) => (
                      <button
                        type="button"
                        className={`control-progress-card category-progress-card tone-${toDashboardAnchor(item.process)}`}
                        key={item.process}
                        id={`dashboard-category-${toDashboardAnchor(item.process)}`}
                        onClick={() => {
                          const firstControl = dashboardFilteredControls.find((control) => control.process === item.process);
                          openControlOperation(firstControl?.id || "", item.process);
                        }}
                      >
                        <div className="control-progress-head">
                          <strong>{item.process}</strong>
                          <span>{item.controls}건</span>
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

          {isWorkbenchView ? (
            <section className="panel workbench-tabs-panel">
              <div className="detail-tabs">
                <button
                  type="button"
                  className={workbenchTab === "register" ? "tab-button active" : "tab-button"}
                  onClick={() => handleWorkbenchTabChange("register")}
                >
                  통제 등록/수정
                </button>
                <button
                  type="button"
                  className={workbenchTab === "controls" ? "tab-button active" : "tab-button"}
                  onClick={() => handleWorkbenchTabChange("controls")}
                >
                  통제 수행 등록
                </button>
                <button
                  type="button"
                  className={workbenchTab === "control-review" ? "tab-button active" : "tab-button"}
                  onClick={() => handleWorkbenchTabChange("control-review")}
                >
                  통제 검토
                </button>
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
                            ? "registration-example-item registration-control-item control-operation-card active"
                            : "registration-example-item registration-control-item control-operation-card"
                        }
                        onClick={() => loadRegistrationControl(control)}
                      >
                        <div className="registration-example-head">
                          <strong>{control.id}</strong>
                          <span className={isKeyControl(control.keyControl) ? "status-badge key-badge" : "status-badge normal-badge"}>
                            {isKeyControl(control.keyControl) ? "Key" : "Normal"}
                          </span>
                        </div>
                        <p>{control.title}</p>
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
                        <p>통제유형</p>
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
                        <p>담당부서</p>
                        <strong>{registrationForm.ownerDept}</strong>
                      </div>
                    </article>
                    <article className="registration-metric-card">
                      <div className="registration-metric-icon"><CheckBadgeIcon /></div>
                      <div>
                        <p>수행주기</p>
                        <strong>{registrationForm.frequency}</strong>
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
                      <span>Control ID <em>필수</em></span>
                      <input value={registrationForm.controlId} onChange={(event) => updateRegistrationField("controlId", event.target.value)} />
                      <small>예: APD-03, CHG-01</small>
                    </label>
                    <label className="registration-field">
                      <span>통제명 <em>필수</em></span>
                      <input value={registrationForm.controlName} onChange={(event) => updateRegistrationField("controlName", event.target.value)} />
                      <small>감사자가 봐도 바로 이해되는 이름으로 작성</small>
                    </label>
                    <label className="registration-field">
                      <span>Process <em>필수</em></span>
                      <select value={registrationForm.process} onChange={(event) => updateRegistrationField("process", event.target.value)}>
                        <option value="IT 정책관리">IT 정책관리</option>
                        <option value="계정관리">계정관리</option>
                        <option value="변경관리">변경관리</option>
                        <option value="운영관리">운영관리</option>
                        <option value="백업관리">백업관리</option>
                      </select>
                    </label>
                    <label className="registration-field">
                      <span>Sub Process</span>
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
                      <span>Risk <em>필수</em></span>
                      <textarea rows="4" value={registrationForm.risk} onChange={(event) => updateRegistrationField("risk", event.target.value)} />
                      <small>무엇이 잘못될 수 있는지 위험을 구체적으로 작성</small>
                    </label>
                    <label className="registration-field">
                      <span>Control Objective <em>필수</em></span>
                      <textarea rows="4" value={registrationForm.controlObjective} onChange={(event) => updateRegistrationField("controlObjective", event.target.value)} />
                      <small>이 통제가 존재해야 하는 목적</small>
                    </label>
                    <label className="registration-field">
                      <span>Activity <em>필수</em></span>
                      <textarea rows="4" value={registrationForm.controlActivity} onChange={(event) => updateRegistrationField("controlActivity", event.target.value)} />
                      <small>실제로 수행하는 핵심 통제행위</small>
                    </label>
                    <label className="registration-field">
                      <span>Description <em>필수</em></span>
                      <textarea rows="4" value={registrationForm.description} onChange={(event) => updateRegistrationField("description", event.target.value)} />
                      <small>누가, 어떻게, 무엇을 증적으로 남기는지 포함해서 작성</small>
                    </label>
                  </div>
                </article>

                <article className="panel registration-section-card">
                  <div className="registration-section-head">
                    <h2>운영 및 감사 정보</h2>
                    <p>실행 가능성과 감사 검증 가능성을 높이는 필수 운영 정보</p>
                  </div>
                  <div className="registration-form-grid three-col">
                    <label className="registration-field">
                      <span>Frequency <em>필수</em></span>
                      <select value={registrationForm.frequency} onChange={(event) => updateRegistrationField("frequency", event.target.value)}>
                        <option value="Daily">Daily</option>
                        <option value="Weekly">Weekly</option>
                        <option value="Monthly">Monthly</option>
                        <option value="Quarterly">Quarterly</option>
                        <option value="Half-Bi-annual">Half-Bi-annual</option>
                        <option value="Annual">Annual</option>
                        <option value="Event Driven">Event Driven</option>
                        <option value="Other">Other</option>
                      </select>
                    </label>
                    <label className="registration-field">
                      <span>Control Type <em>필수</em></span>
                      <select value={registrationForm.controlType} onChange={(event) => updateRegistrationField("controlType", event.target.value)}>
                        <option value="예방">예방</option>
                        <option value="탐지">탐지</option>
                        <option value="예방 + 탐지">예방 + 탐지</option>
                      </select>
                    </label>
                    <label className="registration-field">
                      <span>자동화 수준</span>
                      <select value={registrationForm.automationLevel} onChange={(event) => updateRegistrationField("automationLevel", event.target.value)}>
                        <option value="수동">수동</option>
                        <option value="반자동">반자동</option>
                        <option value="자동">자동</option>
                      </select>
                    </label>
                    <label className="registration-field">
                      <span>결함 영향도</span>
                      <select value={registrationForm.deficiencyImpact} onChange={(event) => updateRegistrationField("deficiencyImpact", event.target.value)}>
                        <option value="높음">높음</option>
                        <option value="중간">중간</option>
                        <option value="낮음">낮음</option>
                      </select>
                    </label>
                    <label className="registration-field">
                      <span>담당 부서 <em>필수</em></span>
                      <input value={registrationForm.ownerDept} onChange={(event) => updateRegistrationField("ownerDept", event.target.value)} />
                    </label>
                    <label className="registration-field registration-field-row-start">
                      <span>Evidence <em>필수</em></span>
                      <textarea rows="4" value={registrationForm.evidence} onChange={(event) => updateRegistrationField("evidence", event.target.value)} />
                      <small className="registration-field-spacer" aria-hidden="true">placeholder</small>
                    </label>
                    <label className="registration-field">
                      <span>테스트 방법</span>
                      <textarea rows="4" value={registrationForm.testMethod} onChange={(event) => updateRegistrationField("testMethod", event.target.value)} />
                      <small>감사/자가점검 시 어떻게 검증할지 기술</small>
                    </label>
                    <label className="registration-field">
                      <span>모집단</span>
                      <textarea rows="4" value={registrationForm.population} onChange={(event) => updateRegistrationField("population", event.target.value)} />
                      <small>점검 대상 기간, 건수, 추출 기준 등을 작성</small>
                    </label>
                    <div className="registration-switch-card">
                      <div>
                        <strong>핵심통제(Key Control)</strong>
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
                    >
                      통제 등록
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
                            ? "registration-example-item registration-control-item control-operation-card active"
                            : "registration-example-item registration-control-item control-operation-card"
                        }
                        onClick={() => {
                          setRegistrationSelectedControlId(control.id);
                          writeAuditLog("CONTROL_VIEWED", control.id, `${control.title} 상세 조회`);
                        }}
                      >
                        <div className="registration-example-head">
                          <strong>{control.id}</strong>
                          <span className={isKeyControl(control.keyControl) ? "status-badge key-badge" : "status-badge normal-badge"}>
                            {isKeyControl(control.keyControl) ? "Key" : "Normal"}
                          </span>
                        </div>
                        <p>{control.title}</p>
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
                    <div><p>주기</p><span>{registrationSelectedControl?.frequency || "-"}</span></div>
                    <div><p>통제유형</p><span>{registrationSelectedControl?.controlType || "-"}</span></div>
                    <div><p>자동화 수준</p><span>{registrationSelectedControl?.automationLevel || "-"}</span></div>
                    <div><p>수행부서</p><span>{registrationSelectedControl?.performDept ?? registrationSelectedControl?.performer ?? "-"}</span></div>
                    <div><p>담당자</p><span>{registrationSelectedControl?.ownerPerson || "-"}</span></div>
                    <div><p>검토부서</p><span>{registrationSelectedControl?.reviewDept ?? registrationSelectedControl?.reviewer ?? "-"}</span></div>
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
                  <label className="filter-label">
                    <select value={processFilter} onChange={(event) => { setProcessFilter(event.target.value); setControlListPage(1); }}>
                      {processOptions.map((option) => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </select>
                  </label>
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
                          <span className={`status-badge ${isKeyControl(control.keyControl) ? "key-badge" : "normal-badge"}`}>
                            {isKeyControl(control.keyControl) ? "Key" : "Normal"}
                          </span>
                        </div>
                        <p>{control.title}</p>
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

              <div className="control-main control-execution-panel">
                {selectedControl ? (
                  <>
                    <article className="panel detail-hero execution-detail-panel">
                      <div className="detail-title-row">
                        <div className="detail-inline-heading">
                          <h2>통제 활동 수행 등록</h2>
                        </div>
                        <div className="badge-row">
                          <span className={`status-badge ${statusClass(selectedControl.status)}`}>{selectedControl.status}</span>
                          <span className={`status-badge ${evidenceClass(selectedControl.evidenceStatus)}`}>{selectedControl.evidenceStatus}</span>
                        </div>
                      </div>
                      <p className="detail-purpose">{selectedControl.id} · {selectedControl.title}</p>
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
                      <form className="stack-form execution-form" onSubmit={handleAssignmentSubmit}>
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
                          {(selectedControl.evidenceFiles ?? []).length > 0 ? (
                            (selectedControl.evidenceFiles ?? []).map((file, index) => (
                              <span className="evidence-file-chip-wrap" key={`${file.name}-${index}`}>
                                <button
                                  className="system-chip evidence-file-chip"
                                  type="button"
                                  onClick={() => handleOpenEvidencePreview(file)}
                                >
                                  {file.url ? file.name : `${file.name} (대기)`}
                                </button>
                                <button
                                  className="evidence-file-delete"
                                  type="button"
                                  aria-label={`${file.name} 삭제`}
                                  onClick={() => handleRemoveEvidenceFile(index)}
                                >
                                  X
                                </button>
                              </span>
                            ))
                          ) : (
                            <span className="empty-text">첨부된 증적 없음</span>
                          )}
                        </div>
                        {DATA_BACKEND === "local" ? (
                          <p className="field-help">현재는 업로드 URL 미설정 상태라 파일명이 먼저 저장됩니다.</p>
                        ) : null}
                        <div className="execution-form-item execution-form-action">
                          <button className="primary-button" type="submit">수행 내역 저장</button>
                        </div>
                      </form>
                    </article>
                    <article className="panel registration-section-card">
                      <div className="registration-section-head">
                        <h2>통제 등록 작성 가이드</h2>
                      </div>
                      <ul className="registration-guide-list">
                        {registrationWritingGuide.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </article>

                  </>
                ) : (
                  <article className="panel detail-hero empty-selection-panel">
                    <p className="eyebrow">Selected Control</p>
                    <h2>통제 항목을 선택하세요</h2>
                    <p className="detail-purpose">기본 화면은 등록 상태로 열리고, 목록에서 통제를 선택하면 상세와 처리 플로우가 표시됩니다.</p>
                  </article>
                )}
              </div>
            </section>
          ) : null}

          {currentView === "control-review" || (isWorkbenchView && workbenchTab === "control-review") ? (
            <section className="controls-layout align-unified">
              <article className="panel control-list-panel">
                <div className="section-heading">
                  <div>
                    <h2>등록 통제 내역</h2>
                  </div>
                  {reviewPagedControls.length === 0 ? (
                    <span className="detail-body-text review-empty-inline">검토 대기 건이 없습니다.</span>
                  ) : (
                    <label className="filter-label">
                      <select value={processFilter} onChange={(event) => { setProcessFilter(event.target.value); setControlListPage(1); }}>
                        {processOptions.map((option) => (
                          <option key={option} value={option}>{option}</option>
                        ))}
                      </select>
                    </label>
                  )}
                </div>
                <div className="control-list">
                  {reviewPagedControls.map((control) => (
                    <button
                      type="button"
                      key={control.id}
                      className={
                        control.id === selectedReviewControl?.id
                          ? "registration-example-item registration-control-item control-operation-card active"
                          : "registration-example-item registration-control-item control-operation-card"
                      }
                      onClick={() => {
                        setSelectedControlId(control.id);
                        writeAuditLog("REVIEW_VIEWED", control.id, `${control.title} 검토 화면 조회`);
                      }}
                    >
                      <div className="registration-example-head">
                        <strong>{control.id}</strong>
                        <span className={`status-badge ${isKeyControl(control.keyControl) ? "key-badge" : "normal-badge"}`}>
                          {isKeyControl(control.keyControl) ? "Key" : "Normal"}
                        </span>
                      </div>
                      <p>{control.title}</p>
                    </button>
                  ))}
                </div>
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

              <div className="control-main control-execution-panel">
              <article className="panel detail-hero control-review-panel">
                {selectedReviewControl ? (
                  <>
                    <div className="section-heading">
                      <div>
                        <h2>통제 운영 검토</h2>
                      </div>
                      <div className="badge-row">
                        <span className={`status-badge ${statusClass(selectedReviewControl.status)}`}>{selectedReviewControl.status}</span>
                        <span className={`status-badge ${evidenceClass(selectedReviewControl.evidenceStatus)}`}>{selectedReviewControl.evidenceStatus}</span>
                      </div>
                    </div>
                    <p className="detail-purpose">{selectedReviewControl.id} · {selectedReviewControl.title}</p>
                    <div className="detail-meta-grid execution-meta-grid review-detail-grid">
                      <div className="execution-meta-item">
                        <span>테스트 방법</span>
                        <span className="detail-body-text">
                          {preserveDisplayLineBreaks(selectedReviewControl.testMethod || (selectedReviewControl.procedures ?? []).join("\n")) || "-"}
                        </span>
                      </div>
                      <div className="execution-meta-item">
                        <span>모집단</span>
                        <span className="detail-body-text">{preserveDisplayLineBreaks(selectedReviewControl.population) || "-"}</span>
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
                          <select name="reviewDecision" defaultValue={selectedReviewControl.reviewResult ?? "양호"}>
                            <option value="양호">양호</option>
                            <option value="개선조치">개선조치</option>
                          </select>
                        </label>
                        <label>
                          검토자
                          <input
                            name="reviewer"
                            type="text"
                            defaultValue={selectedReviewControl.reviewer ?? selectedReviewControl.reviewDept ?? ""}
                            placeholder="검토자 입력"
                          />
                        </label>
                      </div>
                      <div className="execution-form-item execution-form-action">
                        <button className="primary-button" type="submit">검토 저장</button>
                      </div>
                    </form>
                  </>
                ) : (
                  <div className="empty-selection-panel">
                    <div className="section-heading control-review-empty-heading">
                      <div>
                        <h2>검토 대기 건이 없습니다.</h2>
                      </div>
                    </div>
                    <p className="detail-purpose">통제 운영에서 수행 내역을 먼저 저장하면 여기에 표시됩니다.</p>
                  </div>
                )}
              </article>
              <article className="panel registration-section-card">
                <div className="registration-section-head">
                  <h2>감사 관점의 등록 품질 체크</h2>
                </div>
                <ul className="registration-guide-list">
                  {registrationQualityGuide.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </article>
              </div>
            </section>
          ) : null}

          {currentView === "people" ? (
            <section className="compact-stack">
              <article className="panel">
                <div className="section-heading">
                  <div>
                    <h2>회원 관리</h2>
                  </div>
                  {!canManageMembers ? <span className="detail-body-text">admin만 수정할 수 있습니다.</span> : null}
                </div>
                <div className="table-wrap member-table-wrap">
                  <table className="member-table">
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>이름</th>
                        <th>이메일</th>
                        <th>유닛</th>
                        <th>권한</th>
                        <th>저장</th>
                      </tr>
                    </thead>
                    <tbody>
                      {memberDirectory.map((person) => (
                        <tr key={person.id}>
                          <td>{person.id}</td>
                          <td>{person.name}</td>
                          <td>{person.email || "-"}</td>
                          <td>
                            <input
                              type="text"
                              value={memberDrafts[person.id]?.unit ?? person.unit ?? person.team ?? "미지정"}
                              onChange={(event) => handleMemberDraftChange(person.id, "unit", event.target.value)}
                              placeholder="유닛 입력"
                              disabled={!canManageMembers}
                            />
                          </td>
                          <td>
                            <select
                              value={memberDrafts[person.id]?.accessRole ?? person.accessRole ?? "viewer"}
                              onChange={(event) => handleMemberDraftChange(person.id, "accessRole", event.target.value)}
                              disabled={!canManageMembers}
                            >
                              <option value="admin">admin</option>
                              <option value="editor">editor</option>
                              <option value="viewer">viewer</option>
                            </select>
                          </td>
                          <td>
                            <button
                              className="secondary-button slim-button"
                              type="button"
                              onClick={() => handleMemberSave(person.id)}
                              disabled={!canManageMembers}
                            >
                              저장
                            </button>
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
            <section className="compact-stack">
              <article className="panel">
                <div className="section-heading">
                  <div>
                    <h2>수행 리포트</h2>
                  </div>
                </div>

                <div className="report-toolbar">
                  <label className="registration-filter-field">
                    <span>주기</span>
                    <select value={reportPeriod} onChange={(event) => setReportPeriod(event.target.value)}>
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

                <div className="table-wrap">
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
                        <th>증적</th>
                        <th>수행 내역</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reportControls.length > 0 ? (
                        reportControls.map((item) => (
                          <tr key={item.id}>
                            <td>{item.id}</td>
                            <td>{item.title}</td>
                            <td>{item.process}</td>
                            <td>{item.performer}</td>
                            <td>{item.reviewer}</td>
                            <td>{item.status}</td>
                            <td>{item.reviewChecked}</td>
                            <td>{item.evidenceCount}건</td>
                            <td>{item.executionNote}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan="9">선택한 주기에 해당하는 수행 대상이 없습니다.</td>
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

          {executionSavePopupOpen ? (
            <div className="center-alert-overlay" role="dialog" aria-modal="true" aria-label="수행 내역 저장 안내">
              <div className="center-alert-modal">
                <p>수행 내역이 저장되었습니다.</p>
                <button className="primary-button" type="button" onClick={() => setExecutionSavePopupOpen(false)}>
                  확인
                </button>
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
                <div className="table-wrap">
                  <table className="audit-table">
                    <thead>
                      <tr>
                        <th>시각</th>
                        <th>사용자</th>
                        <th>액션</th>
                        <th>IP</th>
                        <th>대상</th>
                        <th>내용</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagedAuditLogs.length > 0 ? (
                        pagedAuditLogs.map((log) => (
                          <tr key={log.id}>
                            <td>{String(log.createdAt ?? "-").slice(0, 16) || "-"}</td>
                            <td>{log.actorName || log.actorEmail || "-"}</td>
                            <td>{log.action ? `${log.action} · ${auditActionLabel(log.action)}` : "-"}</td>
                            <td>{log.ip || "-"}</td>
                            <td>{log.target || "-"}</td>
                            <td>{log.detail || "-"}</td>
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
                    {Array.from({ length: totalAuditLogPages }, (_, index) => index + 1).map((page) => (
                      <button
                        key={page}
                        type="button"
                        className={page === currentAuditLogPage ? "page-button active" : "page-button"}
                        onClick={() => setAuditLogPage(page)}
                      >
                        {page}
                      </button>
                    ))}
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
                      <p>{control.title}</p>
                      <small>{control.performDept ?? control.performer} · {control.reviewDept ?? control.reviewer}</small>
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
                        <span>현재 검토자</span>
                        <span className="detail-body-text">{roleAssignmentControl.reviewDept ?? roleAssignmentControl.reviewer ?? "-"}</span>
                      </div>
                      <div className="execution-meta-item">
                        <span>프로세스</span>
                        <span className="detail-body-text">{roleAssignmentControl.process || "-"}</span>
                      </div>
                    </div>
                    <form className="stack-form execution-form" onSubmit={handleRoleAssignmentSubmit}>
                      <label className="execution-form-item">
                        수행자
                        <select name="performer" defaultValue={roleAssignmentControl.performDept ?? roleAssignmentControl.performer ?? ""}>
                          {(performerPeople.length > 0 ? performerPeople : people).map((person) => (
                            <option key={person.id} value={person.name}>{person.name}</option>
                          ))}
                        </select>
                      </label>
                      <label className="execution-form-item">
                        검토자
                        <select name="reviewer" defaultValue={roleAssignmentControl.reviewDept ?? roleAssignmentControl.reviewer ?? ""}>
                          {(reviewerPeople.length > 0 ? reviewerPeople : people).map((person) => (
                            <option key={person.id} value={person.name}>{person.name}</option>
                          ))}
                        </select>
                      </label>
                      <div className="execution-form-item execution-form-action">
                        <button className="primary-button" type="submit">역할 저장</button>
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
