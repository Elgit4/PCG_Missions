import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";

import {
  parsePastoralReadInput,
  parsePastoralReadPath,
} from "./validation.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
  "";
const SUPABASE_PUBLIC_KEY = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ??
  Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const allowedOrigins = new Set(
  (Deno.env.get("CMI_ALLOWED_ORIGINS") ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
);

const baseHeaders = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "Pragma": "no-cache",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Vary": "Origin",
};

function requestId(): string {
  return crypto.randomUUID();
}

function bearerToken(request: Request): string | null {
  const header = request.headers.get("Authorization");
  if (!header) return null;
  const match = /^Bearer\s+([A-Za-z0-9._~-]+)$/i.exec(header.trim());
  return match?.[1] ?? null;
}

function jsonResponse(
  body: unknown,
  status: number,
  origin: string | null,
  id: string,
): Response {
  const headers = new Headers(baseHeaders);
  headers.set("X-Request-Id", id);
  if (origin && allowedOrigins.has(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    headers.set(
      "Access-Control-Allow-Headers",
      "Authorization, apikey, Content-Type, x-client-info",
    );
    headers.set("Access-Control-Max-Age", "600");
  }
  return new Response(JSON.stringify(body), { status, headers });
}

function fail(
  code: string,
  message: string,
  status: number,
  origin: string | null,
  id: string,
): Response {
  return jsonResponse(
    { error: { code, message }, request_id: id },
    status,
    origin,
    id,
  );
}

async function readJson(request: Request): Promise<unknown> {
  const contentType = request.headers.get("Content-Type") ?? "";
  if (!/^application\/json(?:\s*;|$)/i.test(contentType)) {
    throw new Error("CONTENT_TYPE_REQUIRED");
  }
  const body = await request.text();
  if (body.length === 0 || body.length > 4096) {
    throw new Error("INVALID_JSON_SIZE");
  }
  return JSON.parse(body) as unknown;
}

Deno.serve(async (request: Request) => {
  const id = requestId();
  const origin = request.headers.get("Origin");

  if (origin && !allowedOrigins.has(origin)) {
    return fail(
      "ORIGIN_NOT_ALLOWED",
      "Origin not allowed.",
      403,
      null,
      id,
    );
  }

  if (request.method === "OPTIONS") {
    const headers = new Headers({
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers":
        "Authorization, apikey, Content-Type, x-client-info",
      "Access-Control-Max-Age": "600",
      "Vary": "Origin",
    });
    if (origin) headers.set("Access-Control-Allow-Origin", origin);
    return new Response(null, { status: 204, headers });
  }

  const route = parsePastoralReadPath(new URL(request.url).pathname);
  if (!route) {
    return fail(
      "NOT_FOUND",
      "The requested pastoral operation does not exist.",
      404,
      origin,
      id,
    );
  }

  if (request.method !== "POST") {
    return fail("METHOD_NOT_ALLOWED", "Method not allowed.", 405, origin, id);
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_PUBLIC_KEY) {
    return fail(
      "SERVICE_NOT_CONFIGURED",
      "Pastoral operations are not configured.",
      503,
      origin,
      id,
    );
  }

  const token = bearerToken(request);
  if (!token) {
    return fail(
      "AUTH_REQUIRED",
      "A valid staff session is required.",
      401,
      origin,
      id,
    );
  }

  let raw: unknown;
  try {
    raw = await readJson(request);
  } catch (error) {
    const code = error instanceof Error ? error.message : "INVALID_JSON";
    return fail(
      code === "CONTENT_TYPE_REQUIRED" ? code : "INVALID_JSON",
      code === "CONTENT_TYPE_REQUIRED"
        ? "Content-Type must be application/json."
        : "A valid JSON body of at most 4 KB is required.",
      400,
      origin,
      id,
    );
  }

  const parsed = parsePastoralReadInput(raw);
  if (!parsed.ok) {
    return fail("VALIDATION_ERROR", parsed.error, 422, origin, id);
  }

  try {
    const authClient = createClient(SUPABASE_URL, SUPABASE_PUBLIC_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
    const service = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: {
        headers: { "X-Application-Name": "pcg-missions-pastoral-operations" },
      },
    });

    // Validate the access token with Supabase Auth; never trust decoded JWT claims.
    const { data: authData, error: authError } = await authClient.auth.getUser(
      token,
    );
    if (authError || !authData.user) {
      return fail(
        "INVALID_SESSION",
        "A valid staff session is required.",
        401,
        origin,
        id,
      );
    }

    const rpcName = route.kind === "prayer_request"
      ? "cmi_read_prayer_request"
      : "cmi_read_care_record";
    const recordParameter = route.kind === "prayer_request"
      ? "p_prayer_request_id"
      : "p_care_record_id";
    const parameters: Record<string, unknown> = {
      p_actor_auth_user_id: authData.user.id,
      p_branch_id: parsed.value.branch_id,
      p_access_mode: parsed.value.access_mode,
      p_reason: parsed.value.reason,
      p_request_id: id,
      [recordParameter]: route.recordId,
    };

    const { data, error } = await service.rpc(rpcName, parameters);
    if (error) {
      if (error.code === "42501") {
        return fail(
          "FORBIDDEN",
          "You do not have permission to access this pastoral record.",
          403,
          origin,
          id,
        );
      }
      if (error.code === "P0002") {
        return fail(
          "NOT_FOUND",
          "Pastoral record not found.",
          404,
          origin,
          id,
        );
      }
      if (error.code === "22023") {
        return fail(
          "VALIDATION_ERROR",
          "The pastoral read request is invalid.",
          422,
          origin,
          id,
        );
      }
      throw new Error("PASTORAL_READ_TRANSACTION_FAILED");
    }

    return jsonResponse({ data, request_id: id }, 200, origin, id);
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    // Log only an internal error code and correlation ID, never narratives or credentials.
    console.error("pastoral-operations failure", { request_id: id, code });
    return fail(
      "PASTORAL_OPERATION_FAILED",
      "Unable to complete the pastoral record read.",
      500,
      origin,
      id,
    );
  }
});
