import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function getRequestIp(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const firstIp = forwardedFor.split(",")[0]?.trim();
    if (firstIp) {
      return firstIp;
    }
  }

  return (
    request.headers.get("cf-connecting-ip")
    ?? request.headers.get("x-real-ip")
    ?? request.headers.get("x-client-ip")
    ?? "-"
  );
}

function getRequestCountry(request: Request) {
  const country =
    request.headers.get("cf-ipcountry")
    ?? request.headers.get("x-vercel-ip-country")
    ?? request.headers.get("x-country-code")
    ?? request.headers.get("x-country")
    ?? "";

  return String(country).trim().toLowerCase();
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(JSON.stringify({ error: "missing_supabase_env" }), {
      status: 500,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    });
  }

  const body = await request.json().catch(() => null);
  const logId = String(body?.id ?? "").trim();
  const action = String(body?.action ?? "").trim();
  if (!logId || !action) {
    return new Response(JSON.stringify({ error: "invalid_payload" }), {
      status: 400,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    });
  }

  const nowIso = new Date().toISOString();
  const ip = getRequestIp(request);
  const country = getRequestCountry(request);
  const logRow = {
    log_id: logId,
    action,
    target: String(body?.target ?? "").trim(),
    detail: String(body?.detail ?? "").trim(),
    actor_name: String(body?.actorName ?? "").trim(),
    actor_email: String(body?.actorEmail ?? "").trim().toLowerCase(),
    ip: country && ip !== "-" ? `${ip} (${country})` : ip,
    created_at: String(body?.createdAt ?? "").trim() || nowIso,
    created_at_ts: String(body?.createdAtTs ?? "").trim() || nowIso,
    audit_payload: body,
  };

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const { data, error } = await adminClient
    .from("itgc_audit_log")
    .upsert([logRow], { onConflict: "log_id" })
    .select("*")
    .single();

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    });
  }

  return new Response(JSON.stringify({ ok: true, log: data }), {
    status: 200,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
});
