import fs from "fs";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  "https://gfybyxbrmkwbzuyhyqiv.supabase.co",
  "sb_publishable_Cd-7SADAjF_J5vEo9QkmAA_Jz2_diWz",
);

const restoreExecutionNote = `정보보호 정책 개정

[본항 신설]
제 5 조 (정보보호 정책 관리)
③ 정보보호 관련 정책 및 시행문서 최신본은 관련 임직원에게 접근하기 쉬운 형태로 제공해야 한다.

[본조 신설]
제 19 조 (정보보호 관리체계 점검)
① 회사는 연 1회 이상 정보보호 관리체계의 효과성을 점검하고, 주요 점검 사항을 경영진에게 보고한다.
② 관리체계 점검은 정보보호 유닛이 수행하고 결과에 따라 유관부서와 함께 조치를 시행한다.
③ 관리체계 점검 시 보안 관련 업무 절차가 주기적으로 개정되었는지 검토해야 한다.

[본조 신설]
제 25 조 (외부 보안감사)
① 회사는 정보보호 관리체계의 적합성과 효과성을 검증하기 위하여 연 1회 이상 외부 보안감사(Independent Security Audit)를 실시한다.
② 외부 보안감사는 정보보호 및 개인정보보호 관련 법규, 국제표준(ISO/IEC 27001, ISO/IEC 42001 등), 그리고 회사 내부 규정의 준수 여부를 점검하는 것을 목적으로 한다.
③ 감사 결과 발견된 취약점 및 개선 사항은 정보보호위원회에 보고하며, 시정 및 개선조치를 신속히 이행한다.
④ 외부 보안감사 결과 및 개선조치 이력은 문서화하여 최소 3년간 보관한다.

정보보안 지침 개정
2025년 ISMS 인증 심사 및 ISO/IEC 27001:2022 개정 사항 반영을 위해 당사 정보보호 지침(9종) 개정

개정 대상 문서
MU-IS-STA-002 정보자산 관리 지침
MU-IS-STA-004 물리 보안 관리 지침
MU-IS-STA-005 정보시스템 보안 관리 지침
MU-IS-STA-007 침해사고 대응 지침`;

async function restoreCompletedExecution() {
  const backup = JSON.parse(
    fs.readFileSync("backups/amplify_workspace_raw_2026-03-26T11-26-52-456Z.json", "utf8"),
  );
  const backupEvidence = (backup.tables.itgc_evidence_files || []).filter(
    (row) => row.control_id === "C-IT-Cyber-01",
  );

  const nowIso = new Date().toISOString();
  const executionRow = {
    execution_id: "EXE-C-IT-Cyber-01",
    control_id: "C-IT-Cyber-01",
    execution_date: nowIso.slice(0, 10),
    execution_note: restoreExecutionNote,
    status: "점검 완료",
    review_checked: "검토 완료",
    review_date: nowIso.slice(0, 10),
    review_note: "",
    performed_by: "정보보호",
    reviewed_by: "TA",
    drive_folder_id: null,
    last_updated_at: nowIso,
    execution_payload: {
      executionId: "EXE-C-IT-Cyber-01",
      executionNote: restoreExecutionNote,
      executionYear: "2026",
      executionPeriod: "연간",
      executionSubmitted: true,
      reviewRequested: false,
      executionAuthorName: "정보보호",
      executionAuthorEmail: "",
      note: "",
      reviewer: "TA",
      reviewChecked: "검토 완료",
      reviewResult: "양호",
      reviewAuthorName: "",
      reviewAuthorEmail: "",
      status: "점검 완료",
      evidenceStatus: "준비 완료",
    },
    updated_at: nowIso,
  };

  const { error: executionError } = await supabase
    .from("itgc_control_execution")
    .upsert([executionRow], { onConflict: "execution_id" });

  if (executionError) {
    throw new Error(`execution_restore_failed:${executionError.message}`);
  }

  if (backupEvidence.length > 0) {
    const evidenceRows = backupEvidence.map((row) => ({
      ...row,
      updated_at: nowIso,
    }));

    const { error: evidenceError } = await supabase
      .from("itgc_evidence_files")
      .upsert(evidenceRows, { onConflict: "evidence_id" });

    if (evidenceError) {
      throw new Error(`evidence_restore_failed:${evidenceError.message}`);
    }
  }

  return backupEvidence.length;
}

async function restoreReviewRequestedExecution() {
  const nowIso = new Date().toISOString();
  const { data: currentRow, error: currentError } = await supabase
    .from("itgc_control_execution")
    .select("*")
    .eq("execution_id", "EXE-C-IT-Cyber-02")
    .maybeSingle();

  if (currentError) {
    throw new Error(`review_row_fetch_failed:${currentError.message}`);
  }

  if (!currentRow) {
    return false;
  }

  const payload =
    typeof currentRow.execution_payload === "object" && currentRow.execution_payload
      ? currentRow.execution_payload
      : {};

  const nextRow = {
    ...currentRow,
    status: "점검 중",
    review_checked: "미검토",
    last_updated_at: nowIso,
    updated_at: nowIso,
    execution_payload: {
      ...payload,
      executionSubmitted: true,
      reviewRequested: true,
      executionYear: payload.executionYear || "2026",
      executionPeriod: payload.executionPeriod || "연간",
      reviewChecked: "미검토",
      status: "점검 중",
      evidenceStatus: payload.evidenceStatus || "준비 완료",
    },
  };

  const { error: updateError } = await supabase
    .from("itgc_control_execution")
    .upsert([nextRow], { onConflict: "execution_id" });

  if (updateError) {
    throw new Error(`review_row_update_failed:${updateError.message}`);
  }

  return true;
}

async function main() {
  const restoredEvidenceCount = await restoreCompletedExecution();
  const reviewQueueUpdated = await restoreReviewRequestedExecution();

  console.log(
    JSON.stringify(
      {
        restoredCompletedExecution: "EXE-C-IT-Cyber-01",
        restoredEvidenceCount,
        restoredReviewQueueExecution: reviewQueueUpdated ? "EXE-C-IT-Cyber-02" : null,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(String(error?.message ?? error));
  process.exit(1);
});
