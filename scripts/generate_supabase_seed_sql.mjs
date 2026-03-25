import fs from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();
const templatesDir = path.join(projectRoot, "templates");
const outPath = path.join(projectRoot, "supabase", "itgc_seed_from_csv.sql");

const csvTableMap = [
  { file: "control_master.csv", table: "itgc_control_master" },
  { file: "control_execution.csv", table: "itgc_control_execution" },
  { file: "evidence_files.csv", table: "itgc_evidence_files" },
];

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let i = 0;
  let inQuotes = false;

  while (i < text.length) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i += 2;
        continue;
      }
      if (ch === '"') {
        inQuotes = false;
        i += 1;
        continue;
      }
      cell += ch;
      i += 1;
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }

    if (ch === ',') {
      row.push(cell);
      cell = "";
      i += 1;
      continue;
    }

    if (ch === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      i += 1;
      continue;
    }

    if (ch === '\r') {
      i += 1;
      continue;
    }

    cell += ch;
    i += 1;
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows.filter((r) => r.length > 0 && r.some((c) => String(c).trim() !== ""));
}

function sqlValue(value) {
  const raw = String(value ?? "").trim();
  if (raw === "") return "null";

  const escaped = raw.replace(/'/g, "''");
  return `'${escaped}'`;
}

function buildInsertSql(table, headers, rows) {
  if (rows.length === 0) {
    return `-- ${table}: no rows\n`;
  }

  const cols = headers.join(", ");
  const valuesSql = rows
    .map((row) => {
      const aligned = headers.map((_, idx) => row[idx] ?? "");
      return `(${aligned.map((v) => sqlValue(v)).join(", ")})`;
    })
    .join(",\n");

  return [
    `truncate table public.${table} cascade;`,
    `insert into public.${table} (${cols}) values`,
    `${valuesSql};`,
    "",
  ].join("\n");
}

let output = "-- Generated from templates/*.csv\n-- Run after supabase/itgc_schema.sql\n\n";

for (const item of csvTableMap) {
  const filePath = path.join(templatesDir, item.file);
  if (!fs.existsSync(filePath)) {
    output += `-- skipped: ${item.file} not found\n\n`;
    continue;
  }

  const csvText = fs.readFileSync(filePath, "utf8");
  const parsed = parseCsv(csvText);

  if (parsed.length === 0) {
    output += `-- skipped: ${item.file} is empty\n\n`;
    continue;
  }

  const [headerRow, ...dataRows] = parsed;
  output += `-- source: templates/${item.file}\n`;
  output += buildInsertSql(item.table, headerRow, dataRows);
}

fs.writeFileSync(outPath, output, "utf8");
console.log(`generated: ${path.relative(projectRoot, outPath)}`);
