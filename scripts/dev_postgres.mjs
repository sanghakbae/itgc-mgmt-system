import { spawn } from "node:child_process";
import fs from "node:fs";

function loadDotEnv(filePath = ".env") {
  if (!fs.existsSync(filePath)) {
    return {};
  }
  const loaded = {};
  for (const rawLine of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const separatorIndex = line.indexOf("=");
    if (separatorIndex < 0) {
      continue;
    }
    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    loaded[key] = value;
  }
  return loaded;
}

const dotEnv = loadDotEnv();

const serverEnv = {
  ...process.env,
  ...dotEnv,
  POSTGRES_HOST: process.env.POSTGRES_HOST || dotEnv.POSTGRES_HOST || "dev-superset-postgresql.c64ycexnhzbb.ap-northeast-2.rds.amazonaws.com",
  POSTGRES_PORT: process.env.POSTGRES_PORT || dotEnv.POSTGRES_PORT || "5432",
  POSTGRES_DB: process.env.POSTGRES_DB || dotEnv.POSTGRES_DB || "itgc",
  POSTGRES_USER: process.env.POSTGRES_USER || dotEnv.POSTGRES_USER || "shbae",
  POSTGRES_PASSWORD: process.env.POSTGRES_PASSWORD || process.env.PGPASSWORD || dotEnv.POSTGRES_PASSWORD || "",
  VITE_DATA_BACKEND: process.env.VITE_DATA_BACKEND || dotEnv.VITE_DATA_BACKEND || "postgres",
  VITE_POSTGRES_API_BASE_URL: process.env.VITE_POSTGRES_API_BASE_URL || dotEnv.VITE_POSTGRES_API_BASE_URL || "",
  VITE_HOST: process.env.VITE_HOST || dotEnv.VITE_HOST || "127.0.0.1",
  VITE_PORT: process.env.VITE_PORT || dotEnv.VITE_PORT || "5180",
};

const server = spawn("node", ["scripts/single_server.mjs"], {
  stdio: "inherit",
  env: serverEnv,
});

process.on("SIGINT", () => server.kill("SIGINT"));
process.on("SIGTERM", () => server.kill("SIGTERM"));

server.on("exit", (code) => {
  process.exitCode = code ?? 0;
});
