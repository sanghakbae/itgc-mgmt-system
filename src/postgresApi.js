export const ITGC_CONTROL_MASTER_TABLE = "itgc_control_master";
export const ITGC_CONTROL_EXECUTION_TABLE = "itgc_control_execution";
export const ITGC_EVIDENCE_TABLE = "itgc_evidence_files";
export const ITGC_WORKFLOWS_TABLE = "itgc_workflows";
export const ITGC_MEMBER_TABLE = "itgc_member_master";
export const ITGC_AUDIT_TABLE = "itgc_audit_log";
export const ITGC_CONFIG_TABLE = "itgc_app_config";
export const ITGC_EVIDENCE_BUCKET = "itgcp-evidence-files";
const DATA_BACKEND = (import.meta.env.VITE_DATA_BACKEND ?? "").trim().toLowerCase();
const POSTGRES_API_BASE_URL = (import.meta.env.VITE_POSTGRES_API_BASE_URL ?? "").trim();
const USE_POSTGRES_BACKEND = DATA_BACKEND === "postgres";
const AUDIT_LOG_MAX_ITEMS = 3000;
const LOGIN_DOMAIN_CONFIG_MEMBER_ID = "CFG-LOGIN-DOMAINS";
const LOGIN_DOMAIN_CONFIG_KEY = "login_domains";
const AUDIT_LOG_FETCH_LIMIT_MAX = 100;
const QUERY_TEST_FETCH_LIMIT = 100;

async function fetchPostgresBackend(path, options = {}) {
  const requestUrl = POSTGRES_API_BASE_URL ? new URL(path, POSTGRES_API_BASE_URL) : path;
  const response = await fetch(requestUrl, {
    headers: {
      Accept: "application/json",
      ...(options.headers ?? {}),
    },
    ...options,
  });

  const text = await response.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { message: text };
    }
  }

  if (!response.ok) {
    const message = payload?.error || payload?.message || response.statusText || "request_failed";
    throw new Error(`postgres_backend_failed:${message}`);
  }

  return payload;
}

async function fetchPostgresDatabaseInfoRequest() {
  return fetchPostgresBackend("/api/db-info");
}

async function fetchPostgresQueryTest(query) {
  const payload = await fetchPostgresBackend("/api/query-test", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  });

  return {
    rows: Array.isArray(payload?.rows) ? payload.rows : [],
    rowCount: Number(payload?.rowCount) || 0,
    limitedTo: Number(payload?.limitedTo) || QUERY_TEST_FETCH_LIMIT,
  };
}

function randomSuffix() {
  return Math.random().toString(36).slice(2, 8);
}

function safeFileName(name) {
  return String(name ?? "file")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9._-]/g, "_");
}

function parsePipeList(raw) {
  if (!raw) {
    return [];
  }
  return String(raw)
    .split("|")
    .map((value) => value.trim())
    .filter(Boolean);
}

function toPipeList(values) {
  if (!Array.isArray(values) || values.length === 0) {
    return null;
  }
  return values.map((value) => String(value).trim()).filter(Boolean).join("|");
}

function normalizeCompactText(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeUnitLabel(value) {
  const normalized = normalizeCompactText(value);
  if (!normalized) {
    return "";
  }

  const compact = normalized.toLowerCase().replace(/\s+/g, "");
  if (compact.includes("개발5")) {
    return "인프라";
  }
  if (compact.includes("정보보호")) {
    return "정보보호";
  }
  if (compact.includes("인프라")) {
    return "인프라";
  }
  if (compact === "qa유닛" || compact === "qa") {
    return "QA";
  }
  if (compact === "ta유닛" || compact === "ta") {
    return "TA";
  }

  return normalized.replace(/유닛/g, "").trim();
}

function normalizeDate(dateLike) {
  const value = String(dateLike ?? "").trim();
  if (!value) {
    return null;
  }
  return value.slice(0, 10);
}

function deriveExecutionYear(dateLike) {
  const normalized = normalizeDate(dateLike);
  if (!normalized) {
    return "";
  }
  return normalized.slice(0, 4);
}

function deriveExecutionPeriod(dateLike, frequency) {
  const normalized = normalizeDate(dateLike);
  if (!normalized) {
    return "";
  }

  const month = Number(normalized.slice(5, 7));
  const day = Number(normalized.slice(8, 10));
  const normalizedFrequency = String(frequency ?? "").trim().toLowerCase();

  if (!Number.isFinite(month) || month < 1 || month > 12) {
    return "";
  }
  if (normalizedFrequency === "monthly" || normalizedFrequency === "월별") {
    return `${month}월`;
  }
  if (normalizedFrequency === "quarterly" || normalizedFrequency === "분기별") {
    return `${Math.ceil(month / 3)}분기`;
  }
  if (normalizedFrequency === "half-bi-annual" || normalizedFrequency === "반기별") {
    return month <= 6 ? "상반기" : "하반기";
  }
  if (normalizedFrequency === "annual" || normalizedFrequency === "연 1회 + 변경 시") {
    return "연간";
  }
  if (normalizedFrequency === "weekly" || normalizedFrequency === "주별") {
    return `${Math.ceil(day / 7)}주차`;
  }
  if (normalizedFrequency === "daily" || normalizedFrequency === "일별") {
    return `${day}일`;
  }
  if (normalizedFrequency === "event driven" || normalizedFrequency === "이벤트 발생 시") {
    return "수시";
  }
  return "";
}

function executionHasContent(entry) {
  return (
    String(entry?.executionNote ?? "").trim().length > 0
    || (Array.isArray(entry?.evidenceFiles) ? entry.evidenceFiles.length : 0) > 0
  );
}

function hasRequiredExecutionFields(entry) {
  return (
    String(entry?.executionYear ?? "").trim().length > 0
    && String(entry?.executionPeriod ?? "").trim().length > 0
    && String(entry?.executionNote ?? "").trim().length > 0
    && (Array.isArray(entry?.evidenceFiles) ? entry.evidenceFiles.length : 0) > 0
  );
}

function createExecutionEntryKey(controlId, executionYear, executionPeriod) {
  return `${String(controlId ?? "").trim()}::${String(executionYear ?? "").trim()}::${String(executionPeriod ?? "").trim()}`;
}

function normalizeExecutionId(value, controlId, executionYear, executionPeriod) {
  const rawId = String(value ?? "").trim();
  const canonicalId = createExecutionEntryKey(controlId, executionYear, executionPeriod);
  return rawId || canonicalId;
}

function normalizeExecutionEntry(entry, control = {}) {
  const executionYear = String(entry?.executionYear ?? "").trim();
  const executionPeriod = String(entry?.executionPeriod ?? "").trim();
  return {
    executionId: normalizeExecutionId(entry?.executionId, control.id, executionYear, executionPeriod),
    executionYear,
    executionPeriod,
    executionNote: String(entry?.executionNote ?? "").trim(),
    testMethodSnapshot: String(entry?.testMethodSnapshot ?? control?.testMethod ?? "").trim(),
    populationSnapshot: String(entry?.populationSnapshot ?? control?.population ?? "").trim(),
    evidenceTextSnapshot: String(entry?.evidenceTextSnapshot ?? control?.evidenceText ?? "").trim(),
    executionSubmitted:
      typeof entry?.executionSubmitted === "boolean"
        ? entry.executionSubmitted
        : executionHasContent(entry),
    reviewRequested:
      typeof entry?.reviewRequested === "boolean"
        ? entry.reviewRequested
        : false,
    executionAuthorName: String(entry?.executionAuthorName ?? "").trim(),
    executionAuthorEmail: String(entry?.executionAuthorEmail ?? "").trim(),
    executionAuthorUnit: normalizeUnitLabel(entry?.executionAuthorUnit ?? control?.performDept ?? control?.performer ?? control?.ownerDept ?? ""),
    reviewChecked: String(entry?.reviewChecked ?? "미검토").trim() || "미검토",
    reviewResult: String(entry?.reviewResult ?? "").trim(),
    reviewAuthorName: String(entry?.reviewAuthorName ?? "").trim(),
    reviewAuthorEmail: String(entry?.reviewAuthorEmail ?? "").trim().toLowerCase(),
    reviewAuthorUnit: normalizeUnitLabel(entry?.reviewAuthorUnit ?? control?.reviewDept ?? control?.reviewer ?? ""),
    note: String(entry?.note ?? "").trim(),
    status: String(entry?.status ?? "점검 예정").trim() || "점검 예정",
    evidenceFiles: Array.isArray(entry?.evidenceFiles) ? entry.evidenceFiles : [],
    evidenceStatus:
      String(entry?.evidenceStatus ?? "").trim()
      || ((Array.isArray(entry?.evidenceFiles) ? entry.evidenceFiles : []).length > 0 ? "준비 완료" : "미수집"),
    reviewDate: normalizeDate(entry?.reviewDate),
    updatedAt: String(entry?.updatedAt ?? "").trim(),
  };
}

function getControlExecutionHistory(control) {
  const history = Array.isArray(control?.executionHistory)
    ? control.executionHistory.map((entry) => normalizeExecutionEntry(entry, control))
    : [];
  if (history.length > 0) {
    return history;
  }

  const legacyEntry = normalizeExecutionEntry({
    executionId: createExecutionEntryKey(control?.id, control?.executionYear, control?.executionPeriod),
    executionYear: control?.executionYear,
    executionPeriod: control?.executionPeriod,
    executionNote: control?.executionNote,
    executionSubmitted: control?.executionSubmitted,
    executionAuthorName: control?.executionAuthorName,
    executionAuthorEmail: control?.executionAuthorEmail,
    reviewChecked: control?.reviewChecked,
    reviewResult: control?.reviewResult,
    reviewAuthorName: control?.reviewAuthorName,
    reviewAuthorEmail: control?.reviewAuthorEmail,
    note: control?.note,
    status: control?.status,
    evidenceFiles: control?.evidenceFiles,
    evidenceStatus: control?.evidenceStatus,
  }, control);
  return executionHasContent(legacyEntry) || legacyEntry.executionAuthorEmail || legacyEntry.reviewAuthorEmail ? [legacyEntry] : [];
}

function normalizeDomainList(raw) {
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

function isMissingRelationError(error) {
  const code = String(error?.code ?? "").trim();
  return code === "PGRST205" || code === "42P01";
}

function deriveExecutionDateFromEntry(entry, frequency) {
  const year = Number(String(entry?.executionYear ?? "").trim());
  const period = String(entry?.executionPeriod ?? "").trim();
  const normalizedFrequency = String(frequency ?? "").trim().toLowerCase();

  if (!Number.isInteger(year) || year < 1900) {
    return null;
  }

  if (normalizedFrequency === "monthly" || normalizedFrequency === "월별") {
    const match = period.match(/(\d{1,2})월/);
    const month = Number(match?.[1] ?? NaN);
    return Number.isInteger(month) && month >= 1 && month <= 12
      ? `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-01`
      : null;
  }
  if (normalizedFrequency === "quarterly" || normalizedFrequency === "분기별") {
    const match = period.match(/([1-4])분기/);
    const quarter = Number(match?.[1] ?? NaN);
    const month = quarter >= 1 && quarter <= 4 ? ((quarter - 1) * 3) + 1 : NaN;
    return Number.isInteger(month)
      ? `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-01`
      : null;
  }
  if (normalizedFrequency === "half-bi-annual" || normalizedFrequency === "반기별") {
    if (period === "상반기") {
      return `${String(year).padStart(4, "0")}-01-01`;
    }
    if (period === "하반기") {
      return `${String(year).padStart(4, "0")}-07-01`;
    }
    return null;
  }
  if (normalizedFrequency === "annual" || normalizedFrequency === "연 1회 + 변경 시" || normalizedFrequency === "연간") {
    return `${String(year).padStart(4, "0")}-01-01`;
  }
  return null;
}

function buildMasterControlPayload(control) {
  if (!control || typeof control !== "object") {
    return {};
  }

  const {
    executionHistory,
    executionNote,
    executionYear,
    executionPeriod,
    executionSubmitted,
    reviewRequested,
    executionAuthorName,
    executionAuthorEmail,
    reviewChecked,
    reviewResult,
    reviewAuthorName,
    reviewAuthorEmail,
    note,
    status,
    evidenceFiles,
    evidenceStatus,
    updatedAt,
    createdAt,
    ...masterPayload
  } = control;

  return masterPayload;
}

function mapControlToMasterRow(control, index, nowIso) {
  const createdAt = String(control.createdAt ?? control.created_at ?? nowIso).trim() || nowIso;
  return {
    control_id: control.id,
    category: control.process ?? "",
    sub_process: control.subProcess ?? "",
    risk_name: control.riskName ?? "",
    control_name: control.title ?? "",
    control_objective: control.controlObjective ?? control.purpose ?? "",
    control_activity: control.controlActivity ?? "",
    key_control: control.keyControl ?? "No",
    frequency: control.frequency ?? "",
    control_type: control.controlType ?? "예방",
    automation_level: control.automationLevel ?? "",
    perform_dept: normalizeUnitLabel(control.performDept ?? control.performer ?? control.ownerDept ?? ""),
    review_dept: normalizeUnitLabel(control.reviewDept ?? control.reviewer ?? ""),
    target_systems: toPipeList(control.targetSystems),
    evidence_text: control.evidenceText ?? toPipeList(control.evidences) ?? "",
    test_method: control.testMethod ?? "",
    policy_reference: control.policyReference ?? "",
    deficiency_impact: control.deficiencyImpact ?? "",
    status: control.status ?? "점검 예정",
    evidence_status: control.evidenceStatus ?? "미수집",
    review_checked: control.reviewChecked ?? "미검토",
    control_description: control.description ?? control.population ?? "",
    active_yn: "Y",
    sort_order: index + 1,
    control_payload: buildMasterControlPayload(control),
    created_at: createdAt,
    updated_at: nowIso,
  };
}

function mapControlToExecutionRows(control, nowIso) {
  return getControlExecutionHistory(control)
    .map((entry) => ({
    created_at: String(entry.createdAt ?? nowIso).trim() || nowIso,
    execution_id: entry.executionId || createExecutionEntryKey(control.id, entry.executionYear, entry.executionPeriod),
    control_id: control.id,
    execution_year: entry.executionYear ?? "",
    execution_period: entry.executionPeriod ?? "",
    execution_date: deriveExecutionDateFromEntry(entry, control.frequency),
    execution_note: entry.executionNote ?? "",
    test_method_snapshot: entry.testMethodSnapshot ?? control.testMethod ?? "",
    population_snapshot: entry.populationSnapshot ?? control.population ?? "",
    evidence_text_snapshot: entry.evidenceTextSnapshot ?? control.evidenceText ?? "",
    evidence_status: entry.evidenceStatus ?? "미수집",
    execution_submitted: Boolean(entry.executionSubmitted),
    review_requested: Boolean(entry.reviewRequested),
    status: entry.status ?? "점검 예정",
    review_checked: entry.reviewChecked ?? "미검토",
    review_result: entry.reviewResult ?? "",
    review_date:
      entry.reviewChecked === "검토 완료"
        ? normalizeDate(entry.reviewDate ?? entry.updatedAt ?? nowIso)
        : null,
    review_note: entry.note ?? "",
    performed_by: normalizeUnitLabel(entry.executionAuthorUnit ?? control.performDept ?? control.performer ?? control.ownerDept ?? ""),
    reviewed_by: normalizeUnitLabel(entry.reviewAuthorUnit ?? control.reviewDept ?? control.reviewer ?? ""),
    performed_by_name: entry.executionAuthorName ?? "",
    performed_by_email: entry.executionAuthorEmail ?? "",
    performed_by_unit: normalizeUnitLabel(entry.executionAuthorUnit ?? control.performDept ?? control.performer ?? control.ownerDept ?? ""),
    reviewed_by_name: entry.reviewAuthorName ?? "",
    reviewed_by_email: entry.reviewAuthorEmail ?? "",
    reviewed_by_unit: normalizeUnitLabel(entry.reviewAuthorUnit ?? control.reviewDept ?? control.reviewer ?? ""),
    drive_folder_id: null,
    last_updated_at: nowIso,
    execution_payload: {
      executionId: entry.executionId || createExecutionEntryKey(control.id, entry.executionYear, entry.executionPeriod),
      executionNote: entry.executionNote ?? "",
      executionYear: entry.executionYear ?? "",
      executionPeriod: entry.executionPeriod ?? "",
      testMethodSnapshot: entry.testMethodSnapshot ?? control.testMethod ?? "",
      populationSnapshot: entry.populationSnapshot ?? control.population ?? "",
      evidenceTextSnapshot: entry.evidenceTextSnapshot ?? control.evidenceText ?? "",
      executionSubmitted: Boolean(entry.executionSubmitted),
      reviewRequested: Boolean(entry.reviewRequested),
      executionAuthorName: entry.executionAuthorName ?? "",
      executionAuthorEmail: entry.executionAuthorEmail ?? "",
      executionAuthorUnit: normalizeUnitLabel(entry.executionAuthorUnit ?? control.performDept ?? control.performer ?? control.ownerDept ?? ""),
      note: entry.note ?? "",
      reviewer: normalizeUnitLabel(control.reviewer ?? control.reviewDept ?? ""),
      reviewChecked: entry.reviewChecked ?? "미검토",
      reviewResult: entry.reviewResult ?? "",
      reviewAuthorName: entry.reviewAuthorName ?? "",
      reviewAuthorEmail: entry.reviewAuthorEmail ?? "",
      reviewAuthorUnit: normalizeUnitLabel(entry.reviewAuthorUnit ?? control.reviewDept ?? control.reviewer ?? ""),
      reviewDate: normalizeDate(entry.reviewDate ?? entry.updatedAt ?? nowIso),
      status: entry.status ?? "점검 예정",
      evidenceStatus: entry.evidenceStatus ?? "미수집",
    },
    updated_at: nowIso,
  }));
}

function mapControlToEvidenceRows(control, nowIso) {
  return getControlExecutionHistory(control).flatMap((entry) => {
    const uploader = normalizeUnitLabel(control.performDept ?? control.performer ?? control.ownerDept ?? "");
    const executionId = entry.executionId || createExecutionEntryKey(control.id, entry.executionYear, entry.executionPeriod);
    const evidenceFiles = Array.isArray(entry.evidenceFiles) ? entry.evidenceFiles : [];

    return evidenceFiles.map((file, index) => ({
      created_at: String(file.createdAt ?? file.uploadedAt ?? nowIso).trim() || nowIso,
      evidence_id: file.evidenceId ?? `EVD-${executionId}-${String(index + 1).padStart(3, "0")}`,
      execution_id: executionId,
      control_id: control.id,
      file_name: file.name ?? `evidence-${index + 1}`,
      drive_file_id: file.driveFileId ?? null,
      drive_url: file.url ?? null,
      uploaded_at: file.uploadedAt ?? nowIso,
      uploaded_by: file.uploadedBy ?? uploader,
      file_note: file.note ?? null,
      storage_bucket: file.storageBucket ?? ITGC_EVIDENCE_BUCKET,
      storage_path: file.storagePath ?? null,
      storage_url: file.url ?? null,
      provider: file.provider ?? (file.storagePath ? "s3" : "google"),
      evidence_payload: {
        ...file,
        executionId,
        executionYear: entry.executionYear,
        executionPeriod: entry.executionPeriod,
      },
      updated_at: nowIso,
    }));
  });
}

function mapWorkflowToRow(workflow, nowIso) {
  return {
    created_at: String(workflow.createdAt ?? workflow.created_at ?? nowIso).trim() || nowIso,
    workflow_id: workflow.id,
    control_id: workflow.controlId ?? null,
    step: workflow.step ?? "",
    assignee: normalizeUnitLabel(workflow.assignee ?? ""),
    reviewer: normalizeUnitLabel(workflow.reviewer ?? ""),
    due_date: normalizeDate(workflow.dueDate),
    status: workflow.status ?? "todo",
    memo: workflow.memo ?? "",
    workflow_payload: workflow,
    updated_at: nowIso,
  };
}

function mapMemberToRow(member, nowIso) {
  return {
    member_id: member.id,
    member_name: member.name ?? "",
    email: member.email ?? "",
    role: member.role ?? "",
    unit: normalizeUnitLabel(member.unit ?? ""),
    access_role: member.accessRole ?? "viewer",
    active_yn: "Y",
    member_payload: member,
    updated_at: nowIso,
  };
}

function mapLoginDomainConfigRow(loginDomains, nowIso) {
  const normalizedDomains = normalizeDomainList(loginDomains);
  const payload = {
    type: "login-domain-config",
    loginDomains: normalizedDomains,
  };
  return {
    member_id: LOGIN_DOMAIN_CONFIG_MEMBER_ID,
    member_name: "로그인 허용 도메인 설정",
    email: null,
    role: "config",
    unit: null,
    access_role: null,
    active_yn: "Y",
    member_payload: payload,
    updated_at: nowIso,
  };
}

function mapLoginDomainConfigToConfigRow(loginDomains, nowIso) {
  return {
    config_key: LOGIN_DOMAIN_CONFIG_KEY,
    config_value: {
      loginDomains: normalizeDomainList(loginDomains),
    },
    updated_at: nowIso,
  };
}

function mapAuditToRow(log, nowIso) {
  return {
    log_id: log.id,
    action: log.action ?? "",
    target: log.target ?? "",
    detail: log.detail ?? "",
    actor_name: log.actorName ?? "",
    actor_email: log.actorEmail ?? "",
    ip: log.ip ?? "-",
    created_at: log.createdAt ?? "",
    created_at_ts: log.createdAtTs ?? nowIso,
    audit_payload: log,
  };
}

function isMissingExecutionSnapshotColumnError(error) {
  const message = String(error?.message ?? "");
  return message.includes("execution_year")
    || message.includes("execution_period")
    || message.includes("test_method_snapshot")
    || message.includes("population_snapshot")
    || message.includes("evidence_text_snapshot")
    || message.includes("evidence_status")
    || message.includes("execution_submitted")
    || message.includes("review_requested")
    || message.includes("review_result")
    || message.includes("performed_by_name")
    || message.includes("performed_by_email")
    || message.includes("performed_by_unit")
    || message.includes("reviewed_by_name")
    || message.includes("reviewed_by_email")
    || message.includes("reviewed_by_unit");
}

function stripExecutionSnapshotColumns(rows) {
  return rows.map((row) => {
    const {
      execution_year,
      execution_period,
      test_method_snapshot,
      population_snapshot,
      evidence_text_snapshot,
      evidence_status,
      execution_submitted,
      review_requested,
      review_result,
      performed_by_name,
      performed_by_email,
      performed_by_unit,
      reviewed_by_name,
      reviewed_by_email,
      reviewed_by_unit,
      ...legacyRow
    } = row;
    return legacyRow;
  });
}

function isBlankValue(value) {
  if (value === null || value === undefined) {
    return true;
  }
  if (typeof value === "string") {
    return value.trim().length === 0;
  }
  return false;
}

function mergeExecutionPayload(incomingPayload, existingPayload) {
  const nextIncoming = typeof incomingPayload === "object" && incomingPayload ? { ...incomingPayload } : {};
  const nextExisting = typeof existingPayload === "object" && existingPayload ? existingPayload : {};
  const protectedKeys = [
    "executionNote",
    "executionYear",
    "executionPeriod",
    "testMethodSnapshot",
    "populationSnapshot",
    "evidenceTextSnapshot",
    "executionAuthorName",
    "executionAuthorEmail",
    "executionAuthorUnit",
    "reviewChecked",
    "reviewResult",
    "reviewAuthorName",
    "reviewAuthorEmail",
    "reviewAuthorUnit",
    "reviewDate",
    "note",
    "status",
    "evidenceStatus",
  ];

  for (const key of protectedKeys) {
    if (isBlankValue(nextIncoming[key]) && !isBlankValue(nextExisting[key])) {
      nextIncoming[key] = nextExisting[key];
    }
  }

  if (typeof nextIncoming.executionSubmitted !== "boolean" && typeof nextExisting.executionSubmitted === "boolean") {
    nextIncoming.executionSubmitted = nextExisting.executionSubmitted;
  }
  if (typeof nextIncoming.reviewRequested !== "boolean" && typeof nextExisting.reviewRequested === "boolean") {
    nextIncoming.reviewRequested = nextExisting.reviewRequested;
  }

  return nextIncoming;
}

async function protectExecutionRowsFromBlankOverwrite(rows) {
  return Array.isArray(rows) ? rows : [];
}

export async function fetchPostgresIntegrationStatus() {
  if (!USE_POSTGRES_BACKEND) {
    throw new Error("postgres_backend_required");
  }

  const payload = await fetchPostgresBackend("/api/integration-status");
  return {
    spreadsheet: Boolean(payload?.spreadsheet),
    drive: Boolean(payload?.drive),
  };
}

function buildWorkspaceFromRawRows({
  controlRows = [],
  executionRows = [],
  evidenceRows = [],
  workflowRows = [],
  memberRows = [],
  auditRows = [],
  configRows = [],
}) {
  const executionRowsByControlId = new Map();
  for (const row of executionRows ?? []) {
    const current = executionRowsByControlId.get(row.control_id) ?? [];
    current.push(row);
    executionRowsByControlId.set(row.control_id, current);
  }

  const evidenceByExecutionId = new Map();
  for (const row of evidenceRows ?? []) {
    const payload = typeof row.evidence_payload === "object" && row.evidence_payload ? row.evidence_payload : {};
    const canonicalExecutionId = normalizeExecutionId(
      row.execution_id ?? payload.executionId,
      row.control_id,
      payload.executionYear,
      payload.executionPeriod,
    );
    const keys = [...new Set([String(row.execution_id ?? "").trim(), canonicalExecutionId].filter(Boolean))];

    const nextEvidence = {
      ...payload,
      evidenceId: row.evidence_id,
      name: row.file_name,
      driveFileId: row.drive_file_id,
      url: row.storage_url ?? row.drive_url ?? payload.url ?? "",
      uploadedAt: row.uploaded_at,
      uploadedBy: row.uploaded_by,
      note: row.file_note,
      storageBucket: row.storage_bucket,
      storagePath: row.storage_path,
      provider: row.provider,
    };

    keys.forEach((key) => {
      const current = evidenceByExecutionId.get(key) ?? [];
      current.push(nextEvidence);
      evidenceByExecutionId.set(key, current);
    });
  }

  const controls = (controlRows ?? []).map((row) => {
    const payload = typeof row.control_payload === "object" && row.control_payload ? row.control_payload : {};
    const executions = (executionRowsByControlId.get(row.control_id) ?? []).map((execution) => {
      const executionPayload = typeof execution.execution_payload === "object" && execution.execution_payload ? execution.execution_payload : {};
      const executionId = execution.execution_id ?? executionPayload.executionId ?? createExecutionEntryKey(row.control_id, executionPayload.executionYear, executionPayload.executionPeriod);
      return normalizeExecutionEntry({
        executionId,
        executionYear:
          execution.execution_year
          ?? executionPayload.executionYear
          ?? deriveExecutionYear(execution.execution_date),
        executionPeriod:
          execution.execution_period
          ?? executionPayload.executionPeriod
          ?? deriveExecutionPeriod(execution.execution_date, row.frequency),
        executionNote: execution.execution_note ?? executionPayload.executionNote ?? "",
        testMethodSnapshot:
          execution.test_method_snapshot
          ?? executionPayload.testMethodSnapshot
          ?? row.test_method
          ?? payload.testMethod
          ?? "",
        populationSnapshot:
          execution.population_snapshot
          ?? executionPayload.populationSnapshot
          ?? payload.population
          ?? row.control_description
          ?? "",
        evidenceTextSnapshot:
          execution.evidence_text_snapshot
          ?? executionPayload.evidenceTextSnapshot
          ?? row.evidence_text
          ?? payload.evidenceText
          ?? "",
        executionSubmitted:
          typeof execution.execution_submitted === "boolean"
            ? execution.execution_submitted
            : typeof executionPayload.executionSubmitted === "boolean"
            ? executionPayload.executionSubmitted
            : undefined,
        reviewRequested:
          typeof execution.review_requested === "boolean"
            ? execution.review_requested
            : typeof executionPayload.reviewRequested === "boolean"
            ? executionPayload.reviewRequested
            : undefined,
        executionAuthorName:
          execution.performed_by_name
          ?? executionPayload.executionAuthorName
          ?? execution.performed_by
          ?? row.perform_dept
          ?? "",
        executionAuthorEmail:
          execution.performed_by_email
          ?? executionPayload.executionAuthorEmail
          ?? "",
        executionAuthorUnit:
          execution.performed_by_unit
          ?? executionPayload.executionAuthorUnit
          ?? execution.performed_by
          ?? row.perform_dept
          ?? "",
        reviewChecked: execution.review_checked ?? executionPayload.reviewChecked ?? "미검토",
        reviewResult: execution.review_result ?? executionPayload.reviewResult ?? "",
        reviewAuthorName:
          execution.reviewed_by_name
          ?? executionPayload.reviewAuthorName
          ?? "",
        reviewAuthorEmail:
          execution.reviewed_by_email
          ?? executionPayload.reviewAuthorEmail
          ?? "",
        reviewAuthorUnit:
          execution.reviewed_by_unit
          ?? executionPayload.reviewAuthorUnit
          ?? execution.reviewed_by
          ?? row.review_dept
          ?? "",
        note: execution.review_note ?? executionPayload.note ?? "",
        status: execution.status ?? executionPayload.status ?? row.status ?? "점검 예정",
        evidenceStatus:
          execution.evidence_status
          ?? executionPayload.evidenceStatus
          ?? row.evidence_status
          ?? "미수집",
        evidenceFiles: evidenceByExecutionId.get(executionId) ?? [],
        reviewDate: execution.review_date ?? executionPayload.reviewDate ?? "",
        updatedAt: execution.last_updated_at ?? execution.updated_at ?? "",
      }, payload);
    });
    const latestExecution = executions[0];

    return {
      ...row,
      ...payload,
      id: row.control_id,
      process: row.category,
      subProcess: row.sub_process,
      riskName: row.risk_name,
      title: row.control_name,
      controlObjective: row.control_objective,
      controlActivity: row.control_activity,
      keyControl: row.key_control,
      frequency: row.frequency,
      controlType: row.control_type,
      automationLevel: row.automation_level,
      ownerDept: normalizeUnitLabel(row.perform_dept),
      performer: normalizeUnitLabel(row.perform_dept),
      reviewDept: normalizeUnitLabel(row.review_dept),
      reviewer: normalizeUnitLabel(row.review_dept),
      targetSystems: parsePipeList(row.target_systems),
      evidenceText: row.evidence_text ?? row.test_evidence ?? payload.evidenceText ?? "",
      evidences: payload.evidences ?? parsePipeList(row.evidence_text ?? row.test_evidence),
      testMethod: row.test_method ?? row.test_procedure ?? payload.testMethod ?? "",
      procedures: payload.procedures ?? parsePipeList(row.test_method ?? row.test_procedure),
      policyReference: row.policy_reference,
      deficiencyImpact: row.deficiency_impact,
      status: latestExecution?.status ?? row.status,
      evidenceStatus: latestExecution?.evidenceStatus ?? row.evidence_status,
      reviewChecked: latestExecution?.reviewChecked ?? row.review_checked,
      description: row.control_description,
      population: payload.population ?? row.control_description ?? "",
      note: latestExecution?.note ?? "",
      executionNote: latestExecution?.executionNote ?? "",
      executionYear: latestExecution?.executionYear ?? "",
      executionPeriod: latestExecution?.executionPeriod ?? "",
      executionSubmitted:
        typeof latestExecution?.executionSubmitted === "boolean"
          ? latestExecution.executionSubmitted
          : undefined,
      executionAuthorName: latestExecution?.executionAuthorName ?? row.perform_dept ?? "",
      executionAuthorEmail: latestExecution?.executionAuthorEmail ?? "",
      reviewResult: latestExecution?.reviewResult ?? "",
      reviewAuthorName: latestExecution?.reviewAuthorName ?? "",
      reviewAuthorEmail: latestExecution?.reviewAuthorEmail ?? "",
      evidenceFiles: latestExecution?.evidenceFiles ?? [],
      executionTestMethod: latestExecution?.testMethodSnapshot ?? row.test_method ?? payload.testMethod ?? "",
      executionPopulation: latestExecution?.populationSnapshot ?? payload.population ?? row.control_description ?? "",
      executionEvidenceText: latestExecution?.evidenceTextSnapshot ?? row.evidence_text ?? payload.evidenceText ?? "",
      executionHistory: executions,
    };
  });

  const workflows = (workflowRows ?? []).map((row) => {
    const payload = typeof row.workflow_payload === "object" && row.workflow_payload ? row.workflow_payload : {};

    return {
      ...row,
      ...payload,
      id: row.workflow_id,
      controlId: row.control_id,
      step: row.step,
      assignee: normalizeUnitLabel(row.assignee),
      reviewer: normalizeUnitLabel(row.reviewer),
      dueDate: row.due_date,
      status: row.status,
      memo: row.memo,
    };
  });

  const loginDomainConfig = (configRows ?? []).find((row) => row.config_key === LOGIN_DOMAIN_CONFIG_KEY);
  const loginDomainConfigRow = (memberRows ?? []).find((row) => row.member_id === LOGIN_DOMAIN_CONFIG_MEMBER_ID);
  const loginDomains = normalizeDomainList(
    loginDomainConfig?.config_value?.loginDomains
      ?? loginDomainConfig?.config_value?.domains
      ?? loginDomainConfigRow?.member_payload?.loginDomains
      ?? loginDomainConfigRow?.member_payload?.domains
      ?? "",
  );

  const people = (memberRows ?? [])
    .filter((row) => row.member_id !== LOGIN_DOMAIN_CONFIG_MEMBER_ID)
    .map((row) => {
      const payload = typeof row.member_payload === "object" && row.member_payload ? row.member_payload : {};

      return {
        ...row,
        ...payload,
        id: row.member_id,
        name: row.member_name,
        email: row.email,
        role: row.role,
        team: row.team,
        unit: row.unit,
        accessRole: row.access_role,
        activeYn: row.active_yn,
        memberPayload: row.member_payload,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    });

  const auditLogs = (auditRows ?? []).map((row) => {
    const payload = typeof row.audit_payload === "object" && row.audit_payload ? row.audit_payload : {};

    return {
      ...row,
      ...payload,
      id: row.log_id,
      action: row.action,
      target: row.target,
      detail: row.detail,
      actorName: row.actor_name,
      actorEmail: row.actor_email,
      ip: row.ip,
      createdAt: row.created_at,
      createdAtTs: row.created_at_ts,
    };
  });

  return {
    controls,
    workflows,
    people,
    auditLogs,
    loginDomains,
  };
}

export async function fetchPostgresWorkspace() {
  if (!USE_POSTGRES_BACKEND) {
    throw new Error("postgres_backend_required");
  }

  const payload = await fetchPostgresBackend("/api/workspace");
  return buildWorkspaceFromRawRows(payload);
}

export async function fetchPostgresAuditLogsPage(options = {}) {
  if (!USE_POSTGRES_BACKEND) {
    throw new Error("postgres_backend_required");
  }

  const page = Math.max(1, Number(options.page) || 1);
  const pageSize = Math.min(AUDIT_LOG_FETCH_LIMIT_MAX, Math.max(1, Number(options.pageSize) || 30));
  const query = String(options.query ?? "").trim();
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
  });
  if (query) {
    params.set("query", query);
  }
  const payload = await fetchPostgresBackend(`/api/audit-logs?${params.toString()}`);
  const logs = (Array.isArray(payload?.rows) ? payload.rows : []).map((row) => {
    const payloadRow = typeof row.audit_payload === "object" && row.audit_payload ? row.audit_payload : {};

    return {
      ...payloadRow,
      id: row.log_id,
      action: row.action,
      target: row.target,
      detail: row.detail,
      actorName: row.actor_name,
      actorEmail: row.actor_email,
      ip: row.ip,
      createdAt: row.created_at,
      createdAtTs: row.created_at_ts,
    };
  });

  return {
    logs,
    totalCount: Number(payload?.totalCount) || 0,
    totalPages: Number(payload?.totalPages) || 1,
  };
}

export async function fetchPostgresDatabaseInfo() {
  if (!USE_POSTGRES_BACKEND) {
    throw new Error("postgres_backend_required");
  }

  return fetchPostgresDatabaseInfoRequest();
}

export async function runPostgresQueryTest(query) {
  if (!USE_POSTGRES_BACKEND) {
    throw new Error("postgres_backend_required");
  }

  return fetchPostgresQueryTest(query);
}

export async function syncPostgresWorkspace(workspace) {
  if (!USE_POSTGRES_BACKEND) {
    throw new Error("postgres_backend_required");
  }

  const nowIso = new Date().toISOString();
  const controls = Array.isArray(workspace.controls) ? workspace.controls : [];
  const workflows = Array.isArray(workspace.workflows) ? workspace.workflows : [];
  const controlRows = controls.map((control, index) => mapControlToMasterRow(control, index, nowIso));
  const executionRows = await protectExecutionRowsFromBlankOverwrite(
    controls.flatMap((control) => mapControlToExecutionRows(control, nowIso)),
  );
  const evidenceRows = controls.flatMap((control) => mapControlToEvidenceRows(control, nowIso));
  const workflowRows = workflows.map((workflow) => mapWorkflowToRow(workflow, nowIso));
  const loginDomains = normalizeDomainList(workspace.loginDomains);
  const memberRows = [
    ...((Array.isArray(workspace.people) ? workspace.people : []).filter((member) => String(member?.id ?? "").startsWith("MBR-"))),
    mapLoginDomainConfigRow(loginDomains, nowIso),
  ];
  const auditRows = Array.isArray(workspace.auditLogs) ? workspace.auditLogs.slice(0, AUDIT_LOG_MAX_ITEMS).map((log) => mapAuditToRow(log, nowIso)) : [];

  const payload = {
    tables: {
      itgc_control_master: controlRows,
      itgc_control_execution: executionRows,
      itgc_evidence_files: evidenceRows,
      itgc_workflows: workflowRows,
      itgc_member_master: memberRows.map((member) => ({
        member_id: member.id ?? member.member_id ?? "",
        member_name: member.name ?? member.member_name ?? "",
        email: member.email ?? "",
        role: member.role ?? "",
        team: member.team ?? "",
        unit: member.unit ?? "",
        access_role: member.accessRole ?? member.access_role ?? "viewer",
        active_yn: member.activeYn ?? member.active_yn ?? "Y",
        member_payload: member.memberPayload ?? member.member_payload ?? member,
        created_at: member.createdAt ?? member.created_at ?? nowIso,
        updated_at: member.updatedAt ?? member.updated_at ?? nowIso,
      })),
      itgc_audit_log: auditRows,
    },
  };

  const result = await fetchPostgresBackend("/api/sync-workspace", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  return { ok: true, ...result };
}

export async function savePostgresControlBundle(control, workflows = []) {
  if (!USE_POSTGRES_BACKEND) {
    throw new Error("postgres_backend_required");
  }

  const nowIso = new Date().toISOString();
  const controlRows = [mapControlToMasterRow(control, 0, nowIso)];
  const executionRows = await protectExecutionRowsFromBlankOverwrite(
    mapControlToExecutionRows(control, nowIso),
  );
  const evidenceRows = mapControlToEvidenceRows(control, nowIso);
  const workflowRows = (Array.isArray(workflows) ? workflows : []).map((workflow) => mapWorkflowToRow(workflow, nowIso));
  const payload = {
    controlId: control.id,
    tables: {
      itgc_control_master: controlRows,
      itgc_control_execution: executionRows,
      itgc_evidence_files: evidenceRows,
      itgc_workflows: workflowRows,
    },
  };

  const result = await fetchPostgresBackend("/api/upsert-control-bundle", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  return { ok: true, ...result };
}

export async function appendPostgresAuditLog(log) {
  if (!USE_POSTGRES_BACKEND) {
    throw new Error("postgres_backend_required");
  }

  const nowIso = new Date().toISOString();
  const payload = await fetchPostgresBackend("/api/append-audit-log", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      row: mapAuditToRow(log, nowIso),
    }),
  });
  return { ok: true, ...payload };
}

export async function deletePostgresMember(memberId) {
  if (!USE_POSTGRES_BACKEND) {
    throw new Error("postgres_backend_required");
  }

  const payload = await fetchPostgresBackend("/api/delete-member", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ memberId }),
  });
  return { ok: true, ...payload };
}

export async function upsertPostgresMember(member) {
  if (!USE_POSTGRES_BACKEND) {
    throw new Error("postgres_backend_required");
  }

  const payload = await fetchPostgresBackend("/api/upsert-member", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ member }),
  });
  return { ok: true, ...payload };
}

export async function upsertPostgresControl(control) {
  if (!USE_POSTGRES_BACKEND) {
    throw new Error("postgres_backend_required");
  }

  const payload = await fetchPostgresBackend("/api/upsert-control", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ control }),
  });
  return { ok: true, ...payload };
}

export async function deletePostgresControl(controlId) {
  if (!USE_POSTGRES_BACKEND) {
    throw new Error("postgres_backend_required");
  }

  const payload = await fetchPostgresBackend("/api/delete-control", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ controlId }),
  });
  return { ok: true, ...payload };
}

export async function deletePostgresExecution(executionId) {
  if (!USE_POSTGRES_BACKEND) {
    throw new Error("postgres_backend_required");
  }

  const payload = await fetchPostgresBackend("/api/delete-execution", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ executionId }),
  });
  return { ok: true, ...payload };
}
