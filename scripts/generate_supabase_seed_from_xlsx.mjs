import path from "node:path";
import fs from "node:fs";
import xlsx from "xlsx";

const projectRoot = process.cwd();
const xlsxPath = path.join(projectRoot, "ITGC_3 ver.xlsx");
const outPath = path.join(projectRoot, "supabase", "itgc_seed_from_xlsx.sql");

const sheetTableMap = [
  { sheet: "control_master", table: "itgc_control_master" },
  { sheet: "control_execution", table: "itgc_control_execution" },
  { sheet: "evidence_files", table: "itgc_evidence_files" },
];

function sqlValue(value) {
  const raw = String(value ?? "").trim();
  if (raw === "") return "null";
  return `'${raw.replace(/'/g, "''")}'`;
}

function buildInsertSql(table, headers, rows) {
  if (rows.length === 0) {
    return `-- ${table}: no rows\n`;
  }

  const cols = headers.join(", ");
  const valuesSql = rows
    .map((row) => `(${headers.map((col) => sqlValue(row[col])).join(", ")})`)
    .join(",\n");

  return [
    `truncate table public.${table} cascade;`,
    `insert into public.${table} (${cols}) values`,
    `${valuesSql};`,
    "",
  ].join("\n");
}

if (!fs.existsSync(xlsxPath)) {
  console.error(`xlsx not found: ${path.relative(projectRoot, xlsxPath)}`);
  process.exit(1);
}

const workbook = xlsx.readFile(xlsxPath, { cellDates: false });

let output = "-- Generated from ITGC_3 ver.xlsx\n-- Run after supabase/itgc_schema.sql\n\n";

for (const item of sheetTableMap) {
  const worksheet = workbook.Sheets[item.sheet];
  if (!worksheet) {
    output += `-- skipped: sheet '${item.sheet}' not found\n\n`;
    continue;
  }

  const rows = xlsx.utils.sheet_to_json(worksheet, {
    defval: "",
    raw: false,
  });

  const headers = Object.keys(rows[0] ?? {});
  if (headers.length === 0) {
    output += `-- skipped: sheet '${item.sheet}' is empty\n\n`;
    continue;
  }

  output += `-- source sheet: ${item.sheet}\n`;
  output += buildInsertSql(item.table, headers, rows);
}

fs.writeFileSync(outPath, output, "utf8");
console.log(`generated: ${path.relative(projectRoot, outPath)}`);
