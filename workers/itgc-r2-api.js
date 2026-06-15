const DEFAULT_ALLOWED_ORIGINS = [
  "https://itgc.sanghak.kr",
  "https://sanghakbae.github.io",
  "http://localhost:5180",
  "http://127.0.0.1:5180",
];

function allowedOrigins(env) {
  return String(env.ALLOWED_ORIGINS || DEFAULT_ALLOWED_ORIGINS.join(","))
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function corsHeaders(request, env) {
  const origin = request.headers.get("Origin") || "";
  const allowOrigin = allowedOrigins(env).includes(origin) ? origin : allowedOrigins(env)[0];
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,X-File-Name,X-Control-Id,X-Execution-Id,X-Execution-Year,X-Execution-Period,X-Uploaded-By",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

function jsonResponse(request, env, payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders(request, env),
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function safeFileName(name) {
  return String(name || "file")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9._-]/g, "_") || "file";
}

function safePathSegment(value) {
  const normalized = String(value || "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9._/-]/g, "_")
    .replace(/\/+/g, "/")
    .replace(/^\/+|\/+$/g, "");
  return normalized || "unknown";
}

function buildEvidenceStoragePath({ controlId, executionId, executionYear, executionPeriod, fileName }) {
  const controlSegment = safePathSegment(controlId || "unknown-control");
  const executionSegment = safePathSegment(
    executionId || [executionYear, executionPeriod].filter(Boolean).join("-") || "unassigned",
  );
  return `evidence/${controlSegment}/${executionSegment}/${Date.now()}-${crypto.randomUUID()}-${safeFileName(fileName)}`;
}

function fileUrl(request, storagePath, fileName) {
  const url = new URL(request.url);
  url.pathname = "/api/evidence/file";
  url.search = "";
  url.searchParams.set("storagePath", storagePath);
  url.searchParams.set("fileName", fileName || safeFileName(storagePath.split("/").pop()));
  return url.toString();
}

async function handleUpload(request, env, url) {
  const controlId = String(url.searchParams.get("controlId") || request.headers.get("X-Control-Id") || "").trim();
  const executionId = String(url.searchParams.get("executionId") || request.headers.get("X-Execution-Id") || "").trim();
  const executionYear = String(url.searchParams.get("executionYear") || request.headers.get("X-Execution-Year") || "").trim();
  const executionPeriod = String(url.searchParams.get("executionPeriod") || request.headers.get("X-Execution-Period") || "").trim();
  const uploadedBy = String(url.searchParams.get("uploadedBy") || request.headers.get("X-Uploaded-By") || "").trim();
  const requestedName = String(request.headers.get("X-File-Name") || url.searchParams.get("fileName") || "evidence").trim();
  const fileName = safeFileName(decodeURIComponent(requestedName));
  const contentType = String(request.headers.get("Content-Type") || "application/octet-stream").trim();
  const body = await request.arrayBuffer();

  if (!controlId) {
    return jsonResponse(request, env, { error: "invalid_control_id" }, 400);
  }
  if (!body.byteLength) {
    return jsonResponse(request, env, { error: "empty_file_body" }, 400);
  }

  const storagePath = buildEvidenceStoragePath({
    controlId,
    executionId,
    executionYear,
    executionPeriod,
    fileName,
  });

  await env.ITGC_BUCKET.put(storagePath, body, {
    httpMetadata: {
      contentType,
      contentDisposition: `inline; filename="${fileName}"`,
    },
    customMetadata: {
      controlId,
      executionId,
      executionYear,
      executionPeriod,
      uploadedBy,
      originalName: fileName,
    },
  });

  return jsonResponse(request, env, {
    evidenceId: `EVD-${crypto.randomUUID()}`,
    name: fileName,
    mimeType: contentType,
    size: body.byteLength,
    uploadedAt: new Date().toISOString(),
    uploadedBy,
    url: fileUrl(request, storagePath, fileName),
    storageBucket: "itgc",
    storagePath,
    provider: "r2",
  });
}

async function handleFile(request, env, url) {
  const storagePath = String(url.searchParams.get("storagePath") || "").trim();
  const fileName = safeFileName(url.searchParams.get("fileName") || storagePath.split("/").pop());
  if (!storagePath || storagePath.includes("..")) {
    return jsonResponse(request, env, { error: "invalid_storage_path" }, 400);
  }

  const object = await env.ITGC_BUCKET.get(storagePath);
  if (!object) {
    return jsonResponse(request, env, { error: "file_not_found" }, 404);
  }

  const headers = new Headers(corsHeaders(request, env));
  object.writeHttpMetadata(headers);
  headers.set("Content-Disposition", `inline; filename="${fileName}"`);
  headers.set("Cache-Control", "private, max-age=60");
  headers.set("ETag", object.httpEtag);
  return new Response(object.body, { headers });
}

async function handleDelete(request, env) {
  const body = await request.json().catch(() => ({}));
  const storagePath = String(body?.storagePath || "").trim();
  if (!storagePath || storagePath.includes("..")) {
    return jsonResponse(request, env, { error: "invalid_storage_path" }, 400);
  }
  await env.ITGC_BUCKET.delete(storagePath);
  return jsonResponse(request, env, { ok: true });
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(request, env) });
    }

    try {
      const url = new URL(request.url);
      if (url.pathname === "/api/integration-status") {
        return jsonResponse(request, env, {
          spreadsheet: true,
          drive: true,
          storage: true,
          storageProvider: "r2",
        });
      }
      if (url.pathname === "/api/evidence/upload" && request.method === "POST") {
        return handleUpload(request, env, url);
      }
      if (url.pathname === "/api/evidence/file" && request.method === "GET") {
        return handleFile(request, env, url);
      }
      if (url.pathname === "/api/evidence/presigned-url" && request.method === "GET") {
        const storagePath = String(url.searchParams.get("storagePath") || "").trim();
        const fileName = safeFileName(url.searchParams.get("fileName") || storagePath.split("/").pop());
        return jsonResponse(request, env, { url: fileUrl(request, storagePath, fileName) });
      }
      if (url.pathname === "/api/evidence/delete" && request.method === "POST") {
        return handleDelete(request, env);
      }
      return jsonResponse(request, env, { error: "not_found" }, 404);
    } catch (error) {
      return jsonResponse(request, env, { error: "worker_error", message: String(error?.message || error) }, 500);
    }
  },
};
