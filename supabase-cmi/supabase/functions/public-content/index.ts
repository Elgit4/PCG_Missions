import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";import {
  createAllowedOrigins,
  isAllowedOrigin,
} from "../_shared/cors.ts";

import {
  getScheduledPublicationFilter,
  parsePublicContentRequest,
  PUBLIC_RESOURCES,
  type PublicResource,
} from "./validation.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const allowedOrigins = createAllowedOrigins(
  Deno.env.get("PUBLIC_CONTENT_ALLOWED_ORIGINS"),
);

const supabase = supabaseUrl && serviceRoleKey
  ? createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: { headers: { "X-Application-Name": "cmi-public-content-edge" } },
  })
  : null;

const baseHeaders = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control":
    "public, max-age=60, s-maxage=300, stale-while-revalidate=60",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Vary": "Origin",
};

function response(
  body: unknown,
  status: number,
  origin: string | null,
): Response {
  const headers = new Headers(baseHeaders);
  if (status < 200 || status >= 300) headers.set("Cache-Control", "no-store");
  if (origin && allowedOrigins.has(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
    headers.set("Access-Control-Allow-Headers", "Content-Type");
  }
  return new Response(JSON.stringify(body), { status, headers });
}

Deno.serve(async (request: Request) => {
  const origin = request.headers.get("Origin");

  if (!isAllowedOrigin(origin, allowedOrigins)) {
    return response({ error: "Origin not allowed." }, 403, null);
  }

  if (request.method === "OPTIONS") {
    if (!isAllowedOrigin(origin, allowedOrigins)) {
      return response({ error: "Origin not allowed." }, 403, null);
    }
    return new Response(null, {
      status: 204,
      headers: {
        ...(origin ? { "Access-Control-Allow-Origin": origin } : {}),
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Max-Age": "600",
        "Vary": "Origin",
      },
    });
  }

  if (request.method !== "GET") {
    return response({ error: "Method not allowed." }, 405, origin);
  }

  if (!supabase) {
    // Fail closed when the server-side credentials are not configured.
    return response(
      { error: "Public content service is not configured." },
      503,
      origin,
    );
  }

  const parsed = parsePublicContentRequest(new URL(request.url));
  if (!parsed.ok) {
    return response({ error: parsed.error }, 400, origin);
  }

  try {
    if (parsed.value.resource === "church-profile") {
      const { data, error } = await supabase
        .from("church_public_profile")
        .select(
          "public_name,welcome_content,public_phone,public_email,address_text,website_url,social_links,updated_at",
        )
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return response({ data }, 200, origin);
    }

    const resource = parsed.value.resource as PublicResource;
    const config = PUBLIC_RESOURCES[resource];
    let query = supabase.from(config.table).select(config.columns);

    for (const filter of config.filters) {
      query = query.eq(filter.column, filter.value);
    }

    // Public announcements must not leak before their scheduled publish_at.
    const scheduledFilter = getScheduledPublicationFilter(
      resource,
      new Date().toISOString(),
    );
    if (scheduledFilter) query = query.or(scheduledFilter);

    if ("globalOnly" in config && config.globalOnly) {
      query = query.is("branch_id", null);
    }

    if ("slug" in parsed.value && parsed.value.slug && "slugColumn" in config) {
      query = query.eq(config.slugColumn, parsed.value.slug);
    }

    query = query.order(config.order.column, {
      ascending: config.order.ascending,
    });

    query = query.range(
      parsed.value.offset,
      parsed.value.offset + parsed.value.limit - 1,
    );

    const { data, error } = await query;
    if (error) throw error;

    return response({ data: data ?? [] }, 200, origin);
  } catch (error) {
    // Do not leak database messages, SQL, table names or credentials to callers.
    console.error("public-content query failed", {
      resource: parsed.value.resource,
      error: error instanceof Error ? error.message : "unknown",
    });
    return response(
      { error: "Unable to retrieve public content." },
      500,
      origin,
    );
  }
});
