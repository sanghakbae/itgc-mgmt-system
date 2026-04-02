import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://gfybyxbrmkwbzuyhyqiv.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_Cd-7SADAjF_J5vEo9QkmAA_Jz2_diWz";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function createExecutionEntryKey(controlId, executionYear, executionPeriod) {
  return String(controlId ?? "").trim()
    + "::"
    + String(executionYear ?? "").trim()
    + "::"
    + String(executionPeriod ?? "").trim();
}

function normalizeDate(dateLike) {
  const value = String(dateLike ?? "").trim();
  return value ? value.slice(0, 10) : null;
}

function deriveExecutionYear(dateLike) {
  const normalized = normalizeDate(dateLike);
  return normalized ? normalized.slice(0, 4) : "";
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

function hasRequiredExecutionFields(entry) {
  return (
    String(entry?.executionYear ?? "").trim().length > 0
    && String(entry?.executionPeriod ?? "").trim().length > 0
    && String(entry?.executionNote ?? "").trim().length > 0
    && (Array.isArray(entry?.evidenceFiles) ? entry.evidenceFiles.length : 0) > 0
  );
}

function normalizeExecutionEntry(entry, control = {}) {
  return {
    executionId: String(
      entry?.executionId
      ?? createExecutionEntryKey(control.id, entry?.executionYear, entry?.executionPeriod),
    ).trim(),
    executionYear: String(entry?.executionYear ?? "").trim(),
    executionPeriod: String(entry?.executionPeriod ?? "").trim(),
    executionNote: String(entry?.executionNote ?? "").trim(),
    executionSubmitted:
      typeof entry?.executionSubmitted === "boolean"
        ? entry.executionSubmitted
        : hasRequiredExecutionFields(entry),
    reviewRequested:
      typeof entry?.reviewRequested === "boolean"
        ? entry.reviewRequested
        : false,
    executionAuthorName: String(entry?.executionAuthorName ?? "").trim(),
    executionAuthorEmail: String(entry?.executionAuthorEmail ?? "").trim().toLowerCase(),
    reviewChecked: String(entry?.reviewChecked ?? "미검토").trim() || "미검토",
    reviewResult: String(entry?.reviewResult ?? "").trim(),
    reviewAuthorName: String(entry?.reviewAuthorName ?? "").trim(),
    reviewAuthorEmail: String(entry?.reviewAuthorEmail ?? "").trim().toLowerCase(),
    note: String(entry?.note ?? "").trim(),
    status: String(entry?.status ?? "점검 예정").trim() || "점검 예정",
    evidenceFiles: Array.isArray(entry?.evidenceFiles) ? entry.evidenceFiles : [],
    evidenceStatus:
      String(entry?.evidenceStatus ?? "").trim()
      || ((Array.isArray(entry?.evidenceFiles) ? entry.evidenceFiles.length : 0) > 0 ? "준비 완료" : "미수집"),
    updatedAt: String(entry?.updatedAt ?? "").trim(),
  };
}

async function main() {
  const [
    { data: controlRows, error: controlError },
    { data: executionRows, error: executionError },
    { data: evidenceRows, error: evidenceError },
  ] = await Promise.all([
    supabase.from("itgc_control_master").select("*").order("sort_order", { ascending: true }),
    supabase.from("itgc_control_execution").select("*").order("last_updated_at", { ascending: false }),
    supabase.from("itgc_evidence_files").select("*").order("uploaded_at", { ascending: false }),
  ]);

  if (controlError || executionError || evidenceError) {
    throw new Error(controlError?.message || executionError?.message || evidenceError?.message);
  }

  const executionRowsByControlId = new Map();
  for (const row of executionRows ?? []) {
    const current = executionRowsByControlId.get(row.control_id) ?? [];
    current.push(row);
    executionRowsByControlId.set(row.control_id, current);
  }

  const evidenceByExecutionId = new Map();
  for (const row of evidenceRows ?? []) {
    const current = evidenceByExecutionId.get(row.execution_id) ?? [];
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
    evidenceByExecutionId.set(row.execution_id, current);
  }

  const validExecutionRows = [];

  for (const row of controlRows ?? []) {
    const payload = typeof row.control_payload === "object" && row.control_payload ? row.control_payload : {};
    const executions = (executionRowsByControlId.get(row.control_id) ?? [])
      .map((execution) => {
        const executionPayload = typeof execution.execution_payload === "object" && execution.execution_payload ? execution.execution_payload : {};
        const executionId =
          execution.execution_id
          ?? executionPayload.executionId
          ?? createExecutionEntryKey(row.control_id, executionPayload.executionYear, executionPayload.executionPeriod);

        return normalizeExecutionEntry({
          executionId,
          executionYear: executionPayload.executionYear ?? deriveExecutionYear(execution.execution_date),
          executionPeriod: executionPayload.executionPeriod ?? deriveExecutionPeriod(execution.execution_date, row.frequency),
          executionNote: execution.execution_note ?? executionPayload.executionNote ?? "",
          executionSubmitted:
            typeof executionPayload.executionSubmitted === "boolean"
              ? executionPayload.executionSubmitted
              : undefined,
          reviewRequested:
            typeof executionPayload.reviewRequested === "boolean"
              ? executionPayload.reviewRequested
              : undefined,
          executionAuthorName: executionPayload.executionAuthorName ?? execution.performed_by ?? row.perform_dept ?? "",
          executionAuthorEmail: executionPayload.executionAuthorEmail ?? "",
          reviewChecked: execution.review_checked ?? executionPayload.reviewChecked ?? "미검토",
          reviewResult: executionPayload.reviewResult ?? "",
          reviewAuthorName: executionPayload.reviewAuthorName ?? "",
          reviewAuthorEmail: executionPayload.reviewAuthorEmail ?? "",
          note: execution.review_note ?? executionPayload.note ?? "",
          status: execution.status ?? executionPayload.status ?? row.status ?? "점검 예정",
          evidenceStatus: executionPayload.evidenceStatus ?? row.evidence_status ?? "미수집",
          evidenceFiles: evidenceByExecutionId.get(executionId) ?? [],
          updatedAt: execution.last_updated_at ?? execution.updated_at ?? "",
        }, payload);
      })
      .filter((entry) => hasRequiredExecutionFields(entry));

    for (const entry of executions) {
      validExecutionRows.push({
        execution_id: entry.executionId || createExecutionEntryKey(row.control_id, entry.executionYear, entry.executionPeriod),
        control_id: row.control_id,
        execution_date: normalizeDate(entry.updatedAt) ?? normalizeDate(new Date().toISOString()),
        execution_note: entry.executionNote ?? "",
        status: entry.status ?? "점검 예정",
        review_checked: entry.reviewChecked ?? "미검토",
        review_date: entry.reviewChecked === "검토 완료" ? normalizeDate(entry.updatedAt) ?? normalizeDate(new Date().toISOString()) : null,
        review_note: entry.note ?? "",
        performed_by: entry.executionAuthorName ?? "",
        reviewed_by: row.review_dept ?? "",
        drive_folder_id: null,
        last_updated_at: entry.updatedAt || new Date().toISOString(),
        execution_payload: {
          executionId: entry.executionId || createExecutionEntryKey(row.control_id, entry.executionYear, entry.executionPeriod),
          executionNote: entry.executionNote ?? "",
          executionYear: entry.executionYear ?? "",
          executionPeriod: entry.executionPeriod ?? "",
          executionSubmitted: true,
          reviewRequested: Boolean(entry.reviewRequested),
          executionAuthorName: entry.executionAuthorName ?? "",
          executionAuthorEmail: entry.executionAuthorEmail ?? "",
          note: entry.note ?? "",
          reviewer: row.review_dept ?? "",
          reviewChecked: entry.reviewChecked ?? "미검토",
          reviewResult: entry.reviewResult ?? "",
          reviewAuthorName: entry.reviewAuthorName ?? "",
          reviewAuthorEmail: entry.reviewAuthorEmail ?? "",
          status: entry.status ?? "점검 예정",
          evidenceStatus: entry.evidenceStatus ?? "미수집",
        },
        updated_at: entry.updatedAt || new Date().toISOString(),
      });
    }
  }

  if (validExecutionRows.length === 0) {
    throw new Error("no_valid_execution_rows");
  }

  const { error: upsertError } = await supabase
    .from("itgc_control_execution")
    .upsert(validExecutionRows, { onConflict: "execution_id" });

  if (upsertError) {
    throw new Error(`execution_upsert_failed:${upsertError.message}`);
  }

  const { data: existingRows, error: selectError } = await supabase
    .from("itgc_control_execution")
    .select("execution_id");

  if (selectError) {
    throw new Error(`execution_select_failed:${selectError.message}`);
  }

  const validIds = new Set(validExecutionRows.map((row) => row.execution_id));
  const staleIds = (existingRows ?? [])
    .map((row) => row.execution_id)
    .filter((executionId) => executionId && !validIds.has(executionId));

  if (staleIds.length > 0) {
    const { error: deleteError } = await supabase
      .from("itgc_control_execution")
      .delete()
      .in("execution_id", staleIds);

    if (deleteError) {
      throw new Error(`execution_delete_failed:${deleteError.message}`);
    }
  }

  console.log(JSON.stringify({
    kept: validExecutionRows.map((row) => row.execution_id),
    deletedCount: staleIds.length,
  }, null, 2));
}

main().catch((error) => {
  console.error(String(error?.message ?? error));
  process.exit(1);
});
