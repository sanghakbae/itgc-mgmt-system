import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const ROOT_DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const DEFAULT_BACKUP_PATH = path.join(ROOT_DIR, "backups", "amplify_workspace_raw_2026-03-26T11-26-52-456Z.json");

const TABLE_ORDER = [
  {
    name: "itgc_control_master",
    columns: [
      "control_id",
      "category",
      "sub_process",
      "risk_name",
      "control_name",
      "control_objective",
      "control_activity",
      "key_control",
      "frequency",
      "control_type",
      "automation_level",
      "perform_dept",
      "review_dept",
      "owner_person",
      "target_systems",
      "evidence_text",
      "test_method",
      "policy_reference",
      "deficiency_impact",
      "status",
      "evidence_status",
      "review_checked",
      "control_description",
      "active_yn",
      "sort_order",
      "control_payload",
      "created_at",
      "updated_at",
    ],
  },
  {
    name: "itgc_member_master",
    columns: [
      "member_id",
      "member_name",
      "email",
      "role",
      "team",
      "unit",
      "access_role",
      "active_yn",
      "member_payload",
      "created_at",
      "updated_at",
    ],
  },
  {
    name: "itgc_control_execution",
    columns: [
      "execution_id",
      "control_id",
      "execution_date",
      "execution_note",
      "status",
      "review_checked",
      "review_date",
      "review_note",
      "performed_by",
      "reviewed_by",
      "drive_folder_id",
      "last_updated_at",
      "execution_payload",
      "created_at",
      "updated_at",
    ],
  },
  {
    name: "itgc_evidence_files",
    columns: [
      "evidence_id",
      "execution_id",
      "control_id",
      "file_name",
      "drive_file_id",
      "drive_url",
      "uploaded_at",
      "uploaded_by",
      "file_note",
      "storage_bucket",
      "storage_path",
      "storage_url",
      "provider",
      "evidence_payload",
      "created_at",
      "updated_at",
    ],
  },
  {
    name: "itgc_workflows",
    columns: [
      "workflow_id",
      "control_id",
      "step",
      "assignee",
      "reviewer",
      "due_date",
      "status",
      "memo",
      "workflow_payload",
      "created_at",
      "updated_at",
    ],
  },
  {
    name: "itgc_audit_log",
    columns: [
      "log_id",
      "action",
      "target",
      "detail",
      "actor_name",
      "actor_email",
      "ip",
      "created_at",
      "created_at_ts",
      "audit_payload",
    ],
  },
];

function parseArgs(argv) {
  const options = {
    apply: false,
    backupPath: DEFAULT_BACKUP_PATH,
    host: process.env.POSTGRES_HOST || "dev-superset-postgresql.c64ycexnhzbb.ap-northeast-2.rds.amazonaws.com",
    port: Number(process.env.POSTGRES_PORT || 5432),
    database: process.env.POSTGRES_DB || "itgc",
    user: process.env.POSTGRES_USER || "shbae",
    password: process.env.POSTGRES_PASSWORD || process.env.PGPASSWORD || "",
  };

  for (const arg of argv) {
    if (arg === "--apply") {
      options.apply = true;
      continue;
    }
    if (arg.startsWith("--backup=")) {
      options.backupPath = path.resolve(arg.slice("--backup=".length));
      continue;
    }
    if (arg.startsWith("--host=")) {
      options.host = arg.slice("--host=".length);
      continue;
    }
    if (arg.startsWith("--port=")) {
      options.port = Number(arg.slice("--port=".length));
      continue;
    }
    if (arg.startsWith("--database=")) {
      options.database = arg.slice("--database=".length);
      continue;
    }
    if (arg.startsWith("--user=")) {
      options.user = arg.slice("--user=".length);
      continue;
    }
    if (arg.startsWith("--password=")) {
      options.password = arg.slice("--password=".length);
      continue;
    }
  }

  return options;
}

function loadBackup(backupPath) {
  const raw = fs.readFileSync(backupPath, "utf8");
  const backup = JSON.parse(raw);
  const tables = backup?.tables ?? {};
  return {
    source: backup?.source ?? "",
    fetchedAt: backup?.fetchedAt ?? "",
    counts: backup?.counts ?? {},
    tables,
  };
}

function csvEscape(value) {
  if (value === null || value === undefined) {
    return "";
  }

  let text = value;
  if (typeof text === "object") {
    text = JSON.stringify(text);
  }
  text = String(text);

  if (text === "") {
    return '""';
  }
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function rowValue(row, column) {
  if (Object.prototype.hasOwnProperty.call(row, column)) {
    return row[column];
  }
  return null;
}

function buildCopySql(backup) {
  const lines = [];
  lines.push("BEGIN;");
  lines.push(`TRUNCATE ${TABLE_ORDER.map((table) => `public.${table.name}`).join(", ")} RESTART IDENTITY CASCADE;`);

  for (const table of TABLE_ORDER) {
    const rows = Array.isArray(backup.tables?.[table.name]) ? backup.tables[table.name] : [];
    lines.push(`COPY public.${table.name} (${table.columns.join(", ")}) FROM STDIN WITH (FORMAT csv, HEADER true, NULL '');`);
    lines.push(table.columns.join(","));
    for (const row of rows) {
      lines.push(table.columns.map((column) => csvEscape(rowValue(row, column))).join(","));
    }
    lines.push("\\.");
    lines.push(`-- loaded ${table.name}: ${rows.length} rows`);
  }

  lines.push("COMMIT;");
  return lines.join("\n") + "\n";
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options.apply) {
    const backup = loadBackup(options.backupPath);
    console.log(JSON.stringify({
      apply: false,
      backupPath: options.backupPath,
      source: backup.source,
      fetchedAt: backup.fetchedAt,
      counts: backup.counts,
      tables: Object.fromEntries(TABLE_ORDER.map((table) => [table.name, Array.isArray(backup.tables?.[table.name]) ? backup.tables[table.name].length : 0])),
    }, null, 2));
    return;
  }

  if (!options.password) {
    throw new Error("missing_postgres_password");
  }

  const backup = loadBackup(options.backupPath);
  const sql = buildCopySql(backup);
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "itgc-backup-restore-"));
  const tempSqlPath = path.join(tempDir, "restore.sql");
  fs.writeFileSync(tempSqlPath, sql, "utf8");

  try {
    execFileSync(
      "psql",
      [
        "-h",
        options.host,
        "-p",
        String(options.port),
        "-U",
        options.user,
        "-d",
        options.database,
        "-v",
        "ON_ERROR_STOP=1",
        "-f",
        tempSqlPath,
      ],
      {
        stdio: "inherit",
        env: {
          ...process.env,
          PGPASSWORD: options.password,
        },
      },
    );

    console.log(JSON.stringify({
      restored: true,
      backupPath: options.backupPath,
      tables: Object.fromEntries(TABLE_ORDER.map((table) => [table.name, Array.isArray(backup.tables?.[table.name]) ? backup.tables[table.name].length : 0])),
    }, null, 2));
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

main();
