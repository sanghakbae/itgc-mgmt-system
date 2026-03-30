import { supabase, supabaseConfigured } from "./supabaseClient";

export const ITGC_CONTROL_MASTER_TABLE = "itgc_control_master";
export const ITGC_CONTROL_EXECUTION_TABLE = "itgc_control_execution";
export const ITGC_EVIDENCE_TABLE = "itgc_evidence_files";
export const ITGC_WORKFLOWS_TABLE = "itgc_workflows";
export const ITGC_MEMBER_TABLE = "itgc_member_master";
export const ITGC_AUDIT_TABLE = "itgc_audit_log";
export const ITGC_EVIDENCE_BUCKET = "itgc_evidence_files";
const AUDIT_LOG_MAX_ITEMS = 3000;
const LOGIN_DOMAIN_CONFIG_MEMBER_ID = "CFG-LOGIN-DOMAINS";

function assertSupabaseConfigured() {
  if (!supabaseConfigured || !supabase) {
    throw new Error("supabase_not_configured");
  }
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

function mapControlToMasterRow(control, index, nowIso) {
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
    perform_dept: control.performDept ?? control.performer ?? control.ownerDept ?? "",
    review_dept: control.reviewDept ?? control.reviewer ?? "",
    owner_person: control.ownerPerson ?? control.reviewer ?? "",
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
    control_payload: control,
    updated_at: nowIso,
  };
}

function mapControlToExecutionRow(control, nowIso) {
  return {
    execution_id: `EXE-${control.id}`,
    control_id: control.id,
    execution_date: normalizeDate(control.lastUpdatedAt ?? nowIso),
    execution_note: control.executionNote ?? "",
    status: control.status ?? "점검 예정",
    review_checked: control.reviewChecked ?? "미검토",
    review_date: control.reviewChecked === "검토 완료" ? normalizeDate(nowIso) : null,
    review_note: control.note ?? "",
    performed_by: control.performer ?? control.performDept ?? control.ownerDept ?? "",
    reviewed_by: control.reviewer ?? control.reviewDept ?? "",
    drive_folder_id: null,
    last_updated_at: nowIso,
    execution_payload: {
      executionNote: control.executionNote ?? "",
      executionYear: control.executionYear ?? "",
      executionPeriod: control.executionPeriod ?? "",
      executionSubmitted: Boolean(control.executionSubmitted),
      executionAuthorName: control.executionAuthorName ?? "",
      executionAuthorEmail: control.executionAuthorEmail ?? "",
      note: control.note ?? "",
      reviewer: control.reviewer ?? control.reviewDept ?? "",
      reviewAuthorName: control.reviewAuthorName ?? "",
      reviewAuthorEmail: control.reviewAuthorEmail ?? "",
    },
    updated_at: nowIso,
  };
}

function mapControlToEvidenceRows(control, nowIso) {
  const executionId = `EXE-${control.id}`;
  const uploader = control.performer ?? control.performDept ?? control.ownerDept ?? "";
  const evidenceFiles = Array.isArray(control.evidenceFiles) ? control.evidenceFiles : [];

  return evidenceFiles.map((file, index) => ({
    evidence_id: file.evidenceId ?? `EVD-${control.id}-${String(index + 1).padStart(3, "0")}`,
    execution_id: executionId,
    control_id: control.id,
    file_name: file.name ?? `evidence-${index + 1}`,
    drive_file_id: file.driveFileId ?? null,
    drive_url: file.url ?? null,
    uploaded_at: file.uploadedAt ?? nowIso,
    uploaded_by: file.uploadedBy ?? uploader,
    file_note: file.note ?? null,
    storage_bucket: ITGC_EVIDENCE_BUCKET,
    storage_path: file.storagePath ?? null,
    storage_url: file.url ?? null,
    provider: file.provider ?? (file.storagePath ? "supabase" : "google"),
    evidence_payload: file,
    updated_at: nowIso,
  }));
}

function mapWorkflowToRow(workflow, nowIso) {
  return {
    workflow_id: workflow.id,
    control_id: workflow.controlId ?? null,
    step: workflow.step ?? "",
    assignee: workflow.assignee ?? "",
    reviewer: workflow.reviewer ?? "",
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
    team: member.team ?? member.unit ?? "",
    unit: member.unit ?? member.team ?? "",
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
    team: null,
    unit: null,
    access_role: null,
    active_yn: "Y",
    member_payload: payload,
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

async function upsertRows(table, rows, pk, options = {}) {
  const { prune = true } = options;
  if (!rows.length) {
    return;
  }

  const { error: upsertError } = await supabase
    .from(table)
    .upsert(rows, { onConflict: pk });

  if (upsertError) {
    throw new Error(`${table}_upsert_failed:${upsertError.message}`);
  }

  if (!prune) {
    return;
  }

  const { data: existingRows, error: selectError } = await supabase
    .from(table)
    .select(pk);

  if (selectError) {
    throw new Error(`${table}_select_failed:${selectError.message}`);
  }

  const currentIds = new Set(rows.map((row) => row[pk]));
  const staleIds = (existingRows ?? [])
    .map((row) => row[pk])
    .filter((id) => id && !currentIds.has(id));

  if (!staleIds.length) {
    return;
  }

  const { error: deleteError } = await supabase
    .from(table)
    .delete()
    .in(pk, staleIds);

  if (deleteError) {
    throw new Error(`${table}_delete_failed:${deleteError.message}`);
  }
}

export async function fetchSupabaseIntegrationStatus() {
  assertSupabaseConfigured();

  const [{ error: controlError }, { error: workflowError }, { error: storageError }] = await Promise.all([
    supabase
      .from(ITGC_CONTROL_MASTER_TABLE)
      .select("control_id", { head: true, count: "exact" })
      .limit(1),
    supabase
      .from(ITGC_WORKFLOWS_TABLE)
      .select("workflow_id", { head: true, count: "exact" })
      .limit(1),
    supabase.storage.from(ITGC_EVIDENCE_BUCKET).list("", { limit: 1 }),
  ]);

  return {
    spreadsheet: !controlError && !workflowError,
    drive: !storageError,
  };
}

export async function fetchSupabaseWorkspace() {
  assertSupabaseConfigured();

  const [
    { data: controlRows, error: controlError },
    { data: executionRows, error: executionError },
    { data: evidenceRows, error: evidenceError },
    { data: workflowRows, error: workflowError },
    { data: memberRows, error: memberError },
    { data: auditRows, error: auditError },
  ] = await Promise.all([
    supabase.from(ITGC_CONTROL_MASTER_TABLE).select("*").order("sort_order", { ascending: true }),
    supabase.from(ITGC_CONTROL_EXECUTION_TABLE).select("*").order("last_updated_at", { ascending: false }),
    supabase.from(ITGC_EVIDENCE_TABLE).select("*").order("uploaded_at", { ascending: false }),
    supabase.from(ITGC_WORKFLOWS_TABLE).select("*").order("due_date", { ascending: true }),
    supabase.from(ITGC_MEMBER_TABLE).select("*").order("member_name", { ascending: true }),
    supabase.from(ITGC_AUDIT_TABLE).select("*").order("created_at_ts", { ascending: false }).limit(AUDIT_LOG_MAX_ITEMS),
  ]);

  if (controlError) {
    throw new Error(`controls_fetch_failed:${controlError.message}`);
  }
  if (executionError) {
    throw new Error(`executions_fetch_failed:${executionError.message}`);
  }
  if (evidenceError) {
    throw new Error(`evidence_fetch_failed:${evidenceError.message}`);
  }
  if (workflowError) {
    throw new Error(`workflows_fetch_failed:${workflowError.message}`);
  }
  if (memberError) {
    throw new Error(`members_fetch_failed:${memberError.message}`);
  }
  if (auditError) {
    throw new Error(`audit_fetch_failed:${auditError.message}`);
  }

  const latestExecutionByControlId = new Map();
  for (const row of executionRows ?? []) {
    if (!latestExecutionByControlId.has(row.control_id)) {
      latestExecutionByControlId.set(row.control_id, row);
    }
  }

  const evidenceByControlId = new Map();
  for (const row of evidenceRows ?? []) {
    const current = evidenceByControlId.get(row.control_id) ?? [];
    const payload = typeof row.evidence_payload === "object" && row.evidence_payload ? row.evidence_payload : {};

    current.push({
      ...payload,
      evidenceId: row.evidence_id,
      name: row.file_name,
      driveFileId: row.drive_file_id,
      url: row.storage_url ?? row.drive_url ?? payload.url ?? "",
      uploadedAt: row.uploaded_at,
      uploadedBy: row.uploaded_by,
      note: row.file_note,
      storagePath: row.storage_path,
      provider: row.provider,
    });
    evidenceByControlId.set(row.control_id, current);
  }

  const controls = (controlRows ?? []).map((row) => {
    const payload = typeof row.control_payload === "object" && row.control_payload ? row.control_payload : {};
    const execution = latestExecutionByControlId.get(row.control_id);

    return {
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
      ownerDept: row.perform_dept,
      performer: row.perform_dept,
      reviewDept: row.review_dept,
      reviewer: row.review_dept,
      ownerPerson: row.owner_person,
      targetSystems: parsePipeList(row.target_systems),
      evidenceText: row.evidence_text ?? row.test_evidence ?? payload.evidenceText ?? "",
      evidences: payload.evidences ?? parsePipeList(row.evidence_text ?? row.test_evidence),
      testMethod: row.test_method ?? row.test_procedure ?? payload.testMethod ?? "",
      procedures: payload.procedures ?? parsePipeList(row.test_method ?? row.test_procedure),
      policyReference: row.policy_reference,
      deficiencyImpact: row.deficiency_impact,
      status: execution?.status ?? row.status,
      evidenceStatus: row.evidence_status,
      reviewChecked: execution?.review_checked ?? row.review_checked,
      description: row.control_description,
      population: payload.population ?? row.control_description ?? "",
      note: execution?.review_note ?? payload.note ?? "",
      executionNote: execution?.execution_note ?? payload.executionNote ?? "",
      executionYear:
        execution?.execution_payload?.executionYear
        ?? payload.executionYear
        ?? deriveExecutionYear(execution?.execution_date),
      executionPeriod:
        execution?.execution_payload?.executionPeriod
        ?? payload.executionPeriod
        ?? deriveExecutionPeriod(execution?.execution_date, row.frequency),
      executionSubmitted:
        typeof (execution?.execution_payload?.executionSubmitted ?? payload.executionSubmitted) === "boolean"
          ? (execution?.execution_payload?.executionSubmitted ?? payload.executionSubmitted)
          : undefined,
      executionAuthorName:
        execution?.execution_payload?.executionAuthorName
        ?? payload.executionAuthorName
        ?? execution?.performed_by
        ?? row.perform_dept
        ?? "",
      executionAuthorEmail: execution?.execution_payload?.executionAuthorEmail ?? payload.executionAuthorEmail ?? "",
      reviewAuthorName: execution?.execution_payload?.reviewAuthorName ?? payload.reviewAuthorName ?? "",
      reviewAuthorEmail: execution?.execution_payload?.reviewAuthorEmail ?? payload.reviewAuthorEmail ?? "",
      evidenceFiles: evidenceByControlId.get(row.control_id) ?? payload.evidenceFiles ?? [],
    };
  });

  const workflows = (workflowRows ?? []).map((row) => {
    const payload = typeof row.workflow_payload === "object" && row.workflow_payload ? row.workflow_payload : {};

    return {
      ...payload,
      id: row.workflow_id,
      controlId: row.control_id,
      step: row.step,
      assignee: row.assignee,
      reviewer: row.reviewer,
      dueDate: row.due_date,
      status: row.status,
      memo: row.memo,
    };
  });

  const loginDomainConfigRow = (memberRows ?? []).find((row) => row.member_id === LOGIN_DOMAIN_CONFIG_MEMBER_ID);
  const loginDomains = normalizeDomainList(
    loginDomainConfigRow?.member_payload?.loginDomains
      ?? loginDomainConfigRow?.member_payload?.domains
      ?? "",
  );

  const people = (memberRows ?? [])
    .filter((row) => row.member_id !== LOGIN_DOMAIN_CONFIG_MEMBER_ID)
    .map((row) => {
    const payload = typeof row.member_payload === "object" && row.member_payload ? row.member_payload : {};

    return {
      ...payload,
      id: row.member_id,
      name: row.member_name,
      email: row.email,
      role: row.role,
      team: row.team,
      unit: row.unit,
      accessRole: row.access_role,
    };
  });

  const auditLogs = (auditRows ?? []).map((row) => {
    const payload = typeof row.audit_payload === "object" && row.audit_payload ? row.audit_payload : {};

    return {
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

export async function syncSupabaseWorkspace(workspace) {
  assertSupabaseConfigured();

  const nowIso = new Date().toISOString();
  const controls = Array.isArray(workspace.controls) ? workspace.controls : [];
  const workflows = Array.isArray(workspace.workflows) ? workspace.workflows : [];
  const people = (Array.isArray(workspace.people) ? workspace.people : [])
    .filter((member) => String(member?.id ?? "").startsWith("MBR-"));
  const loginDomains = normalizeDomainList(workspace.loginDomains);
  const auditLogs = Array.isArray(workspace.auditLogs) ? workspace.auditLogs.slice(0, AUDIT_LOG_MAX_ITEMS) : [];

  const controlRows = controls.map((control, index) => mapControlToMasterRow(control, index, nowIso));
  const executionRows = controls.map((control) => mapControlToExecutionRow(control, nowIso));
  const evidenceRows = controls.flatMap((control) => mapControlToEvidenceRows(control, nowIso));
  const workflowRows = workflows.map((workflow) => mapWorkflowToRow(workflow, nowIso));
  const memberRows = [
    ...people.map((member) => mapMemberToRow(member, nowIso)),
    mapLoginDomainConfigRow(loginDomains, nowIso),
  ];
  const auditRows = auditLogs.map((log) => mapAuditToRow(log, nowIso));

  await upsertRows(ITGC_CONTROL_MASTER_TABLE, controlRows, "control_id");
  await upsertRows(ITGC_CONTROL_EXECUTION_TABLE, executionRows, "execution_id");
  await upsertRows(ITGC_EVIDENCE_TABLE, evidenceRows, "evidence_id");
  await upsertRows(ITGC_WORKFLOWS_TABLE, workflowRows, "workflow_id");
  await upsertRows(ITGC_MEMBER_TABLE, memberRows, "member_id", { prune: false });
  await upsertRows(ITGC_AUDIT_TABLE, auditRows, "log_id", { prune: false });

  return { ok: true };
}

export async function deleteSupabaseMember(memberId) {
  assertSupabaseConfigured();
  const normalizedId = String(memberId ?? "").trim();
  if (!normalizedId || normalizedId === LOGIN_DOMAIN_CONFIG_MEMBER_ID) {
    throw new Error("invalid_member_id");
  }

  const { error } = await supabase
    .from(ITGC_MEMBER_TABLE)
    .delete()
    .eq("member_id", normalizedId);

  if (error) {
    throw new Error(`member_delete_failed:${error.message}`);
  }

  return { ok: true };
}

export async function uploadEvidenceToSupabase(controlId, files) {
  assertSupabaseConfigured();

  const uploadedFiles = [];

  for (const file of files) {
    const path = `${controlId}/${Date.now()}-${randomSuffix()}-${safeFileName(file.name)}`;

    const { error } = await supabase.storage
      .from(ITGC_EVIDENCE_BUCKET)
      .upload(path, file, {
        cacheControl: "3600",
        upsert: false,
      });

    if (error) {
      throw new Error(`evidence_upload_failed:${error.message}`);
    }

    const { data: publicUrlData } = supabase.storage
      .from(ITGC_EVIDENCE_BUCKET)
      .getPublicUrl(path);

    uploadedFiles.push({
      evidenceId: `EVD-${controlId}-${Date.now()}-${randomSuffix()}`,
      name: file.name,
      mimeType: file.type || "application/octet-stream",
      size: file.size,
      uploadedAt: new Date().toISOString(),
      url: publicUrlData.publicUrl,
      storagePath: path,
      provider: "supabase",
    });
  }

  return {
    files: uploadedFiles,
  };
}
