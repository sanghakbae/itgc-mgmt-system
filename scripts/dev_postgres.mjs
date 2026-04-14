import { spawn } from "node:child_process";

const serverEnv = {
  ...process.env,
  POSTGRES_HOST: process.env.POSTGRES_HOST || "dev-superset-postgresql.c64ycexnhzbb.ap-northeast-2.rds.amazonaws.com",
  POSTGRES_PORT: process.env.POSTGRES_PORT || "5432",
  POSTGRES_DB: process.env.POSTGRES_DB || "itgc",
  POSTGRES_USER: process.env.POSTGRES_USER || "shbae",
  POSTGRES_PASSWORD: process.env.POSTGRES_PASSWORD || process.env.PGPASSWORD || "",
  VITE_DATA_BACKEND: "postgres",
  VITE_POSTGRES_API_BASE_URL: process.env.VITE_POSTGRES_API_BASE_URL || "",
  VITE_HOST: process.env.VITE_HOST || "127.0.0.1",
  VITE_PORT: process.env.VITE_PORT || "5180",
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
