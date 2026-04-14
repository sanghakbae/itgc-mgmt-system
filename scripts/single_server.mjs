import { createServer } from "node:http";
import fs from "node:fs";
import path from "node:path";
import { createServer as createViteServer } from "vite";
import { handlePostgresApiRequest } from "./postgres_api_server.mjs";

const HOST = process.env.VITE_HOST || "127.0.0.1";
const PORT = Number(process.env.VITE_PORT || 5180);

const vite = await createViteServer({
  appType: "custom",
  server: {
    middlewareMode: true,
    hmr: false,
  },
  logLevel: "error",
});

const server = createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || `${HOST}:${PORT}`}`);

  if (url.pathname.startsWith("/api/")) {
    await handlePostgresApiRequest(req, res);
    return;
  }

  const accept = String(req.headers.accept ?? "");
  if (req.method === "GET" && (url.pathname === "/" || accept.includes("text/html"))) {
    const indexHtml = fs.readFileSync(path.resolve("index.html"), "utf8");
    const template = await vite.transformIndexHtml(url.pathname, indexHtml);
    res.statusCode = 200;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(template);
    return;
  }

  await new Promise((resolve, reject) => {
    vite.middlewares(req, res, (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });

  if (!res.writableEnded) {
    res.statusCode = 404;
    res.end("Not found");
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Single server listening on http://${HOST}:${PORT}`);
});

function shutdown(signal) {
  server.close();
  vite.close();
  if (signal) {
    process.exitCode = 0;
  }
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
