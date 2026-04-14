import { createServer } from "node:http";
import fs from "node:fs";
import { execFile } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const HOST = process.env.POSTGRES_HOST || "dev-superset-postgresql.c64ycexnhzbb.ap-northeast-2.rds.amazonaws.com";
const PORT = Number(process.env.POSTGRES_PORT || 5432);
const DATABASE = process.env.POSTGRES_DB || "itgc";
const USER = process.env.POSTGRES_USER || "shbae";
const PASSWORD = process.env.POSTGRES_PASSWORD || process.env.PGPASSWORD || "";
const LISTEN_PORT = Number(process.env.POSTGRES_API_PORT || 8787);
const LISTEN_HOST = process.env.POSTGRES_API_HOST || "0.0.0.0";

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

if (!PASSWORD) {
  throw new Error("Missing POSTGRES_PASSWORD or PGPASSWORD");
}

function quoteLiteral(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function escapeLike(value) {
  return String(value)
    .replace(/\\/g, "\\\\")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_")
    .replace(/'/g, "''");
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

function buildReplaceSql(tables) {
  const lines = [];
  lines.push("BEGIN;");
  lines.push(`TRUNCATE ${TABLE_ORDER.map((table) => `public.${table.name}`).join(", ")} RESTART IDENTITY CASCADE;`);

  for (const table of TABLE_ORDER) {
    const rows = Array.isArray(tables?.[table.name]) ? tables[table.name] : [];
    lines.push(`COPY public.${table.name} (${table.columns.join(", ")}) FROM STDIN WITH (FORMAT csv, HEADER true, NULL '');`);
    lines.push(table.columns.join(","));
    for (const row of rows) {
      lines.push(table.columns.map((column) => csvEscape(rowValue(row, column))).join(","));
    }
    lines.push("\\.");
  }

  lines.push("COMMIT;");
  return lines.join("\n") + "\n";
}

function buildCopySection(tableName, columns, rows) {
  const lines = [];
  lines.push(`COPY public.${tableName} (${columns.join(", ")}) FROM STDIN WITH (FORMAT csv, HEADER true, NULL '');`);
  lines.push(columns.join(","));
  for (const row of rows) {
    lines.push(columns.map((column) => csvEscape(rowValue(row, column))).join(","));
  }
  lines.push("\\.");
  return lines;
}

async function getExistingTableColumns(tableName) {
  const sql = `
    select coalesce(
      json_agg(column_name order by ordinal_position),
      '[]'::json
    )
    from information_schema.columns
    where table_schema = 'public'
      and table_name = ${quoteLiteral(tableName)};
  `;
  const result = await runPsqlJson(sql);
  return Array.isArray(result) ? result.map((value) => String(value)) : [];
}

function buildControlBundleSql(controlId, tables, columnMap) {
  const masterRows = Array.isArray(tables?.itgc_control_master) ? tables.itgc_control_master : [];
  const executionRows = Array.isArray(tables?.itgc_control_execution) ? tables.itgc_control_execution : [];
  const evidenceRows = Array.isArray(tables?.itgc_evidence_files) ? tables.itgc_evidence_files : [];
  const workflowRows = Array.isArray(tables?.itgc_workflows) ? tables.itgc_workflows : [];

  const lines = ["BEGIN;"];
  lines.push(`DELETE FROM public.itgc_evidence_files WHERE control_id = ${quoteLiteral(controlId)};`);
  lines.push(`DELETE FROM public.itgc_control_execution WHERE control_id = ${quoteLiteral(controlId)};`);
  lines.push(`DELETE FROM public.itgc_workflows WHERE control_id = ${quoteLiteral(controlId)};`);
  lines.push(`DELETE FROM public.itgc_control_master WHERE control_id = ${quoteLiteral(controlId)};`);
  lines.push(...buildCopySection("itgc_control_master", columnMap.itgc_control_master, masterRows));
  lines.push(...buildCopySection("itgc_control_execution", columnMap.itgc_control_execution, executionRows));
  lines.push(...buildCopySection("itgc_evidence_files", columnMap.itgc_evidence_files, evidenceRows));
  lines.push(...buildCopySection("itgc_workflows", columnMap.itgc_workflows, workflowRows));
  lines.push("COMMIT;");
  return lines.join("\n") + "\n";
}

async function runPsqlFile(sqlPath) {
  const { stdout, stderr } = await execFileAsync(
    "psql",
    [
      "-h",
      HOST,
      "-p",
      String(PORT),
      "-U",
      USER,
      "-d",
      DATABASE,
      "-v",
      "ON_ERROR_STOP=1",
      "-f",
      sqlPath,
    ],
    {
      env: {
        ...process.env,
        PGPASSWORD: PASSWORD,
      },
      maxBuffer: 10 * 1024 * 1024,
    },
  );

  return { stdout, stderr };
}

function isReadOnlyQuery(query) {
  const trimmed = String(query ?? "").trim();
  if (!trimmed) {
    return false;
  }
  const normalized = trimmed.endsWith(";") ? trimmed.slice(0, -1).trim().toLowerCase() : trimmed.toLowerCase();
  if (!normalized) {
    return false;
  }
  if (normalized.includes(";")) {
    return false;
  }
  if (!/^(select|with)\b/.test(normalized)) {
    return false;
  }

  const forbiddenPatterns = [
    /\binsert\b/,
    /\bupdate\b/,
    /\bdelete\b/,
    /\bdrop\b/,
    /\balter\b/,
    /\btruncate\b/,
    /\bcreate\b/,
    /\bgrant\b/,
    /\brevoke\b/,
    /\bvacuum\b/,
    /\bcopy\b/,
    /\bcall\b/,
    /\bdo\b/,
    /\bmerge\b/,
    /\bset\b/,
    /\breset\b/,
    /\banalyze\b/,
    /\bcomment\b/,
    /\brefresh\b/,
  ];

  return !forbiddenPatterns.some((pattern) => pattern.test(normalized));
}

async function runPsqlJson(sql) {
  const { stdout, stderr } = await execFileAsync(
    "psql",
    [
      "-h",
      HOST,
      "-p",
      String(PORT),
      "-U",
      USER,
      "-d",
      DATABASE,
      "-X",
      "-q",
      "-t",
      "-A",
      "-c",
      sql,
    ],
    {
      env: {
        ...process.env,
        PGPASSWORD: PASSWORD,
      },
      maxBuffer: 10 * 1024 * 1024,
    },
  );

  const text = stdout.trim();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`Failed to parse postgres JSON output: ${stderr || text}`);
  }
}

async function getTableRows(tableName, orderByClause = "", limitClause = "") {
  const sql = `
    select coalesce(
      json_agg(to_jsonb(t)),
      '[]'::json
    )
    from (
      select * from public.${tableName} t
      ${orderByClause}
      ${limitClause}
    ) t;
  `;
  return (await runPsqlJson(sql)) ?? [];
}

async function getOptionalTableRows(tableName, orderByClause = "") {
  const exists = await runPsqlJson(
    `select json_build_object('exists', to_regclass('public.${tableName}') is not null) as result;`,
  );
  if (!exists?.exists) {
    return [];
  }
  return getTableRows(tableName, orderByClause);
}

async function getAuditLogs(page, pageSize, query) {
  const offset = (page - 1) * pageSize;
  const escapedQuery = `%${escapeLike(query)}%`;
  const filter = query
    ? `where (
      created_at ilike ${quoteLiteral(escapedQuery)} escape '\\'
      or actor_name ilike ${quoteLiteral(escapedQuery)} escape '\\'
      or actor_email ilike ${quoteLiteral(escapedQuery)} escape '\\'
      or action ilike ${quoteLiteral(escapedQuery)} escape '\\'
      or target ilike ${quoteLiteral(escapedQuery)} escape '\\'
      or detail ilike ${quoteLiteral(escapedQuery)} escape '\\'
      or ip ilike ${quoteLiteral(escapedQuery)} escape '\\'
    )`
    : "";

  const countResult = await runPsqlJson(`
    select json_build_object('count', count(*)::int) as result
    from public.itgc_audit_log
    ${filter};
  `);

  const rows = await runPsqlJson(`
    select coalesce(
      json_agg(to_jsonb(t)),
      '[]'::json
    )
    from (
      select *
      from public.itgc_audit_log
      ${filter}
      order by created_at_ts desc
      limit ${Number(pageSize)}
      offset ${Number(offset)}
    ) t;
  `);

  return {
    rows: Array.isArray(rows) ? rows : [],
    totalCount: Number(countResult?.count || 0),
    totalPages: Math.max(1, Math.ceil(Number(countResult?.count || 0) / Number(pageSize))),
  };
}

async function runQueryTest(query) {
  if (!isReadOnlyQuery(query)) {
    throw new Error("read_only_select_queries_only");
  }

  const sql = `
    select coalesce(
      json_agg(to_jsonb(t)),
      '[]'::json
    )
    from (
      select *
      from (
        ${query}
      ) q
      limit 100
    ) t;
  `;

  const rows = await runPsqlJson(sql);
  return Array.isArray(rows) ? rows : [];
}

const IS_MAIN_MODULE = process.argv[1] ? import.meta.url === pathToFileURL(process.argv[1]).href : false;

export async function handlePostgresApiRequest(req, res) {
  const url = new URL(req.url || "/", `http://${req.headers.host || `${LISTEN_HOST}:${LISTEN_PORT}`}`);
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  try {
    if (url.pathname === "/api/integration-status") {
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ spreadsheet: true, drive: false }));
      return;
    }

    if (url.pathname === "/api/db-info") {
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({
        source: "postgres",
        host: HOST,
        port: PORT,
        database: DATABASE,
        user: USER,
        passwordSet: Boolean(PASSWORD),
      }));
      return;
    }

    if (url.pathname === "/api/workspace") {
      const [controlRows, executionRows, evidenceRows, workflowRows, memberRows, auditRows, configRows] = await Promise.all([
        getTableRows("itgc_control_master", "order by t.control_id asc"),
        getTableRows("itgc_control_execution", "order by t.last_updated_at desc nulls last, t.updated_at desc nulls last, t.execution_id asc"),
        getTableRows("itgc_evidence_files", "order by t.uploaded_at desc nulls last, t.updated_at desc nulls last, t.evidence_id asc"),
        getTableRows("itgc_workflows", "order by t.due_date asc nulls last, t.workflow_id asc"),
        getTableRows("itgc_member_master", "order by t.member_name asc nulls last, t.member_id asc"),
        getTableRows("itgc_audit_log", "order by t.created_at_ts desc nulls last, t.log_id desc limit 3000"),
        getOptionalTableRows("itgc_app_config", "order by t.config_key asc"),
      ]);

      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({
        controlRows,
        executionRows,
        evidenceRows,
        workflowRows,
        memberRows,
        auditRows,
        configRows,
      }));
      return;
    }

    if (url.pathname === "/api/audit-logs") {
      const page = Math.max(1, Number(url.searchParams.get("page") || 1));
      const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get("pageSize") || 30)));
      const query = String(url.searchParams.get("query") || "").trim();
      const payload = await getAuditLogs(page, pageSize, query);
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(payload));
      return;
    }

    if (url.pathname === "/api/sync-workspace" && req.method === "POST") {
      const chunks = [];
      for await (const chunk of req) {
        chunks.push(chunk);
      }
      const rawBody = Buffer.concat(chunks).toString("utf8");
      const parsedBody = rawBody.trim() ? JSON.parse(rawBody) : {};
      const tables = parsedBody?.tables ?? {};
      const sql = buildReplaceSql(tables);
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "itgc-sync-"));
      const tempSqlPath = path.join(tempDir, "sync.sql");
      fs.writeFileSync(tempSqlPath, sql, "utf8");
      try {
        await runPsqlFile(tempSqlPath);
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    if (url.pathname === "/api/upsert-control-bundle" && req.method === "POST") {
      const chunks = [];
      for await (const chunk of req) {
        chunks.push(chunk);
      }
      const rawBody = Buffer.concat(chunks).toString("utf8");
      const parsedBody = rawBody.trim() ? JSON.parse(rawBody) : {};
      const controlId = String(parsedBody?.controlId ?? "").trim();
      if (!controlId) {
        throw new Error("invalid_control_id");
      }
      const tables = parsedBody?.tables ?? {};
      const [masterColumns, executionColumns, evidenceColumns, workflowColumns] = await Promise.all([
        getExistingTableColumns("itgc_control_master"),
        getExistingTableColumns("itgc_control_execution"),
        getExistingTableColumns("itgc_evidence_files"),
        getExistingTableColumns("itgc_workflows"),
      ]);
      const sql = buildControlBundleSql(controlId, tables, {
        itgc_control_master: masterColumns,
        itgc_control_execution: executionColumns,
        itgc_evidence_files: evidenceColumns,
        itgc_workflows: workflowColumns,
      });
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "itgc-control-bundle-"));
      const tempSqlPath = path.join(tempDir, "bundle.sql");
      fs.writeFileSync(tempSqlPath, sql, "utf8");
      try {
        await runPsqlFile(tempSqlPath);
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    if (url.pathname === "/api/append-audit-log" && req.method === "POST") {
      const chunks = [];
      for await (const chunk of req) {
        chunks.push(chunk);
      }
      const rawBody = Buffer.concat(chunks).toString("utf8");
      const parsedBody = rawBody.trim() ? JSON.parse(rawBody) : {};
      const row = parsedBody?.row ?? {};
      const logId = String(row?.log_id ?? row?.logId ?? "").trim();
      if (!logId) {
        throw new Error("invalid_log_id");
      }
      const sql = `
        insert into public.itgc_audit_log (
          log_id,
          action,
          target,
          detail,
          actor_name,
          actor_email,
          ip,
          created_at,
          created_at_ts,
          audit_payload
        ) values (
          ${quoteLiteral(logId)},
          ${quoteLiteral(row.action ?? "")},
          ${quoteLiteral(row.target ?? "")},
          ${quoteLiteral(row.detail ?? "")},
          ${quoteLiteral(row.actor_name ?? row.actorName ?? "")},
          ${quoteLiteral(row.actor_email ?? row.actorEmail ?? "")},
          ${quoteLiteral(row.ip ?? "-")},
          ${quoteLiteral(row.created_at ?? row.createdAt ?? "")},
          ${quoteLiteral(row.created_at_ts ?? row.createdAtTs ?? new Date().toISOString())}::timestamptz,
          ${quoteLiteral(JSON.stringify(row.audit_payload ?? row.auditPayload ?? row))}::jsonb
        )
        on conflict (log_id) do update set
          action = excluded.action,
          target = excluded.target,
          detail = excluded.detail,
          actor_name = excluded.actor_name,
          actor_email = excluded.actor_email,
          ip = excluded.ip,
          created_at = excluded.created_at,
          created_at_ts = excluded.created_at_ts,
          audit_payload = excluded.audit_payload;
      `;
      await execFileAsync(
        "psql",
        [
          "-h",
          HOST,
          "-p",
          String(PORT),
          "-U",
          USER,
          "-d",
          DATABASE,
          "-v",
          "ON_ERROR_STOP=1",
          "-c",
          sql,
        ],
        {
          env: {
            ...process.env,
            PGPASSWORD: PASSWORD,
          },
          maxBuffer: 10 * 1024 * 1024,
        },
      );
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    if (url.pathname === "/api/delete-member" && req.method === "POST") {
      const chunks = [];
      for await (const chunk of req) {
        chunks.push(chunk);
      }
      const rawBody = Buffer.concat(chunks).toString("utf8");
      const parsedBody = rawBody.trim() ? JSON.parse(rawBody) : {};
      const memberId = String(parsedBody?.memberId ?? "").trim();
      if (!memberId) {
        throw new Error("invalid_member_id");
      }
      await execFileAsync(
        "psql",
        [
          "-h",
          HOST,
          "-p",
          String(PORT),
          "-U",
          USER,
          "-d",
          DATABASE,
          "-v",
          "ON_ERROR_STOP=1",
          "-c",
          `delete from public.itgc_member_master where member_id = ${quoteLiteral(memberId)};`,
        ],
        {
          env: {
            ...process.env,
            PGPASSWORD: PASSWORD,
          },
          maxBuffer: 10 * 1024 * 1024,
        },
      );
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    if (url.pathname === "/api/upsert-member" && req.method === "POST") {
      const chunks = [];
      for await (const chunk of req) {
        chunks.push(chunk);
      }
      const rawBody = Buffer.concat(chunks).toString("utf8");
      const parsedBody = rawBody.trim() ? JSON.parse(rawBody) : {};
      const member = parsedBody?.member ?? {};
      const memberId = String(member?.member_id ?? member?.id ?? "").trim();
      if (!memberId) {
        throw new Error("invalid_member_id");
      }
      const memberName = String(member?.member_name ?? member?.name ?? "").trim();
      const email = String(member?.email ?? "").trim();
      const role = String(member?.role ?? "").trim();
      const team = String(member?.team ?? "").trim();
      const unit = String(member?.unit ?? "").trim();
      const accessRole = String(member?.access_role ?? member?.accessRole ?? "viewer").trim() || "viewer";
      const activeYn = String(member?.active_yn ?? member?.activeYn ?? "Y").trim() || "Y";
      const memberPayload = member?.member_payload ?? member?.memberPayload ?? {};
      const createdAt = String(member?.created_at ?? member?.createdAt ?? new Date().toISOString()).trim();
      const updatedAt = String(member?.updated_at ?? member?.updatedAt ?? new Date().toISOString()).trim();
      const sql = `
        insert into public.itgc_member_master (
          member_id,
          member_name,
          email,
          role,
          team,
          unit,
          access_role,
          active_yn,
          member_payload,
          created_at,
          updated_at
        ) values (
          ${quoteLiteral(memberId)},
          ${quoteLiteral(memberName)},
          ${quoteLiteral(email)},
          ${quoteLiteral(role)},
          ${quoteLiteral(team)},
          ${quoteLiteral(unit)},
          ${quoteLiteral(accessRole)},
          ${quoteLiteral(activeYn)},
          ${quoteLiteral(JSON.stringify(memberPayload))}::jsonb,
          ${quoteLiteral(createdAt)}::timestamptz,
          ${quoteLiteral(updatedAt)}::timestamptz
        )
        on conflict (member_id) do update set
          member_name = excluded.member_name,
          email = excluded.email,
          role = excluded.role,
          team = excluded.team,
          unit = excluded.unit,
          access_role = excluded.access_role,
          active_yn = excluded.active_yn,
          member_payload = excluded.member_payload,
          created_at = excluded.created_at,
          updated_at = excluded.updated_at;
      `;
      await execFileAsync(
        "psql",
        [
          "-h",
          HOST,
          "-p",
          String(PORT),
          "-U",
          USER,
          "-d",
          DATABASE,
          "-v",
          "ON_ERROR_STOP=1",
          "-c",
          sql,
        ],
        {
          env: {
            ...process.env,
            PGPASSWORD: PASSWORD,
          },
          maxBuffer: 10 * 1024 * 1024,
        },
      );
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    if (url.pathname === "/api/upsert-control" && req.method === "POST") {
      const chunks = [];
      for await (const chunk of req) {
        chunks.push(chunk);
      }
      const rawBody = Buffer.concat(chunks).toString("utf8");
      const parsedBody = rawBody.trim() ? JSON.parse(rawBody) : {};
      const control = parsedBody?.control ?? {};
      const controlId = String(control?.control_id ?? control?.id ?? "").trim();
      if (!controlId) {
        throw new Error("invalid_control_id");
      }
      const category = String(control?.category ?? control?.process ?? "").trim();
      const subProcess = String(control?.sub_process ?? control?.subProcess ?? "").trim();
      const riskName = String(control?.risk_name ?? control?.riskName ?? "").trim();
      const controlName = String(control?.control_name ?? control?.title ?? "").trim();
      const controlObjective = String(control?.control_objective ?? control?.controlObjective ?? control?.purpose ?? "").trim();
      const controlActivity = String(control?.control_activity ?? control?.controlActivity ?? "").trim();
      const keyControl = String(control?.key_control ?? control?.keyControl ?? "No").trim() || "No";
      const frequency = String(control?.frequency ?? "").trim();
      const controlType = String(control?.control_type ?? control?.controlType ?? "예방").trim() || "예방";
      const automationLevel = String(control?.automation_level ?? control?.automationLevel ?? "").trim();
      const performDept = String(control?.perform_dept ?? control?.performDept ?? control?.performer ?? control?.ownerDept ?? "").trim();
      const reviewDept = String(control?.review_dept ?? control?.reviewDept ?? control?.reviewer ?? "").trim();
      const targetSystems = String(control?.target_systems ?? control?.targetSystems ?? "").trim();
      const evidenceText = String(control?.evidence_text ?? control?.evidenceText ?? "").trim();
      const testMethod = String(control?.test_method ?? control?.testMethod ?? "").trim();
      const policyReference = String(control?.policy_reference ?? control?.policyReference ?? "").trim();
      const deficiencyImpact = String(control?.deficiency_impact ?? control?.deficiencyImpact ?? "").trim();
      const status = String(control?.status ?? "점검 예정").trim() || "점검 예정";
      const evidenceStatus = String(control?.evidence_status ?? control?.evidenceStatus ?? "미수집").trim() || "미수집";
      const reviewChecked = String(control?.review_checked ?? control?.reviewChecked ?? "미검토").trim() || "미검토";
      const controlDescription = String(control?.control_description ?? control?.controlDescription ?? control?.description ?? "").trim();
      const activeYn = String(control?.active_yn ?? control?.activeYn ?? "Y").trim() || "Y";
      const sortOrder = Number.isFinite(Number(control?.sort_order ?? control?.sortOrder)) ? Number(control?.sort_order ?? control?.sortOrder) : 0;
      const controlPayload = control?.control_payload ?? control?.controlPayload ?? control ?? {};
      const createdAt = String(control?.created_at ?? control?.createdAt ?? new Date().toISOString()).trim();
      const updatedAt = String(control?.updated_at ?? control?.updatedAt ?? new Date().toISOString()).trim();
      const sql = `
        insert into public.itgc_control_master (
          control_id,
          category,
          sub_process,
          risk_name,
          control_name,
          control_objective,
          control_activity,
          key_control,
          frequency,
          control_type,
          automation_level,
          perform_dept,
          review_dept,
          target_systems,
          evidence_text,
          test_method,
          policy_reference,
          deficiency_impact,
          status,
          evidence_status,
          review_checked,
          control_description,
          active_yn,
          sort_order,
          control_payload,
          created_at,
          updated_at
        ) values (
          ${quoteLiteral(controlId)},
          ${quoteLiteral(category)},
          ${quoteLiteral(subProcess)},
          ${quoteLiteral(riskName)},
          ${quoteLiteral(controlName)},
          ${quoteLiteral(controlObjective)},
          ${quoteLiteral(controlActivity)},
          ${quoteLiteral(keyControl)},
          ${quoteLiteral(frequency)},
          ${quoteLiteral(controlType)},
          ${quoteLiteral(automationLevel)},
          ${quoteLiteral(performDept)},
          ${quoteLiteral(reviewDept)},
          ${quoteLiteral(targetSystems)},
          ${quoteLiteral(evidenceText)},
          ${quoteLiteral(testMethod)},
          ${quoteLiteral(policyReference)},
          ${quoteLiteral(deficiencyImpact)},
          ${quoteLiteral(status)},
          ${quoteLiteral(evidenceStatus)},
          ${quoteLiteral(reviewChecked)},
          ${quoteLiteral(controlDescription)},
          ${quoteLiteral(activeYn)},
          ${Number.isFinite(sortOrder) ? sortOrder : 0},
          ${quoteLiteral(JSON.stringify(controlPayload))}::jsonb,
          ${quoteLiteral(createdAt)}::timestamptz,
          ${quoteLiteral(updatedAt)}::timestamptz
        )
        on conflict (control_id) do update set
          category = excluded.category,
          sub_process = excluded.sub_process,
          risk_name = excluded.risk_name,
          control_name = excluded.control_name,
          control_objective = excluded.control_objective,
          control_activity = excluded.control_activity,
          key_control = excluded.key_control,
          frequency = excluded.frequency,
          control_type = excluded.control_type,
          automation_level = excluded.automation_level,
          perform_dept = excluded.perform_dept,
          review_dept = excluded.review_dept,
          target_systems = excluded.target_systems,
          evidence_text = excluded.evidence_text,
          test_method = excluded.test_method,
          policy_reference = excluded.policy_reference,
          deficiency_impact = excluded.deficiency_impact,
          status = excluded.status,
          evidence_status = excluded.evidence_status,
          review_checked = excluded.review_checked,
          control_description = excluded.control_description,
          active_yn = excluded.active_yn,
          sort_order = excluded.sort_order,
          control_payload = excluded.control_payload,
          created_at = excluded.created_at,
          updated_at = excluded.updated_at;
      `;
      await execFileAsync(
        "psql",
        [
          "-h",
          HOST,
          "-p",
          String(PORT),
          "-U",
          USER,
          "-d",
          DATABASE,
          "-v",
          "ON_ERROR_STOP=1",
          "-c",
          sql,
        ],
        {
          env: {
            ...process.env,
            PGPASSWORD: PASSWORD,
          },
          maxBuffer: 10 * 1024 * 1024,
        },
      );
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    if (url.pathname === "/api/delete-control" && req.method === "POST") {
      const chunks = [];
      for await (const chunk of req) {
        chunks.push(chunk);
      }
      const rawBody = Buffer.concat(chunks).toString("utf8");
      const parsedBody = rawBody.trim() ? JSON.parse(rawBody) : {};
      const controlId = String(parsedBody?.controlId ?? "").trim();
      if (!controlId) {
        throw new Error("invalid_control_id");
      }
      const sql = `
        begin;
        delete from public.itgc_evidence_files where control_id = ${quoteLiteral(controlId)};
        delete from public.itgc_control_execution where control_id = ${quoteLiteral(controlId)};
        delete from public.itgc_workflows where control_id = ${quoteLiteral(controlId)};
        delete from public.itgc_control_master where control_id = ${quoteLiteral(controlId)};
        commit;
      `;
      await execFileAsync(
        "psql",
        [
          "-h",
          HOST,
          "-p",
          String(PORT),
          "-U",
          USER,
          "-d",
          DATABASE,
          "-v",
          "ON_ERROR_STOP=1",
          "-c",
          sql,
        ],
        {
          env: {
            ...process.env,
            PGPASSWORD: PASSWORD,
          },
          maxBuffer: 10 * 1024 * 1024,
        },
      );
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    if (url.pathname === "/api/delete-execution" && req.method === "POST") {
      const chunks = [];
      for await (const chunk of req) {
        chunks.push(chunk);
      }
      const rawBody = Buffer.concat(chunks).toString("utf8");
      const parsedBody = rawBody.trim() ? JSON.parse(rawBody) : {};
      const executionId = String(parsedBody?.executionId ?? "").trim();
      if (!executionId) {
        throw new Error("invalid_execution_id");
      }
      const sql = `
        begin;
        delete from public.itgc_evidence_files where execution_id = ${quoteLiteral(executionId)};
        delete from public.itgc_control_execution where execution_id = ${quoteLiteral(executionId)};
        commit;
      `;
      await execFileAsync(
        "psql",
        [
          "-h",
          HOST,
          "-p",
          String(PORT),
          "-U",
          USER,
          "-d",
          DATABASE,
          "-v",
          "ON_ERROR_STOP=1",
          "-c",
          sql,
        ],
        {
          env: {
            ...process.env,
            PGPASSWORD: PASSWORD,
          },
          maxBuffer: 10 * 1024 * 1024,
        },
      );
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    if (url.pathname === "/api/query-test" && req.method === "POST") {
      const chunks = [];
      for await (const chunk of req) {
        chunks.push(chunk);
      }
      const rawBody = Buffer.concat(chunks).toString("utf8");
      let parsedBody = {};
      if (rawBody.trim()) {
        parsedBody = JSON.parse(rawBody);
      }
      const query = String(parsedBody.query ?? "").trim();
      const rows = await runQueryTest(query);
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({
        rows,
        rowCount: rows.length,
        limitedTo: 100,
      }));
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: "not_found" }));
  } catch (error) {
    res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: error.message || "internal_error" }));
  }
}

if (IS_MAIN_MODULE) {
  const server = createServer((req, res) => {
    handlePostgresApiRequest(req, res).catch((error) => {
      res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: error.message || "internal_error" }));
    });
  });

  server.listen(LISTEN_PORT, LISTEN_HOST, () => {
    console.log(`Postgres API listening on http://${LISTEN_HOST}:${LISTEN_PORT}`);
  });
}
