import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
  "";
const SUPABASE_PUBLIC_KEY = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ??
  Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const BUCKET = "event-flyers";
const MAX_BYTES = 5 * 1024 * 1024;
const SIGNED_URL_SECONDS = 15 * 60;
const allowedOrigins = new Set(
  (Deno.env.get("CMI_ALLOWED_ORIGINS") ?? "https://pcg-missions.vercel.app")
    .split(",").map((value) => value.trim()).filter(Boolean),
);

function serviceClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: { headers: { "X-Application-Name": "pcg-missions-event-flyers" } },
  });
}
function id() {
  return crypto.randomUUID();
}
function bearer(request: Request) {
  const value = request.headers.get("Authorization") ?? "";
  return /^Bearer\s+([A-Za-z0-9._~-]+)$/i.exec(value.trim())?.[1] ?? null;
}
function response(
  body: unknown,
  status: number,
  origin: string | null,
  requestId: string,
) {
  const headers = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Request-Id": requestId,
    "Vary": "Origin",
  });
  if (origin && allowedOrigins.has(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
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
  requestId: string,
) {
  return response(
    { error: { code, message }, request_id: requestId },
    status,
    origin,
    requestId,
  );
}
function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    .test(value);
}
function sniffImage(
  bytes: Uint8Array,
): {
  mime: "image/jpeg" | "image/png" | "image/webp";
  ext: "jpg" | "png" | "webp";
} | null {
  if (
    bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8 &&
    bytes[2] === 0xff && bytes[bytes.length - 2] === 0xff &&
    bytes[bytes.length - 1] === 0xd9
  ) return { mime: "image/jpeg", ext: "jpg" };
  if (
    bytes.length >= 24 &&
    [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) =>
      bytes[index] === value
    ) &&
    String.fromCharCode(...bytes.slice(12, 16)) === "IHDR"
  ) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const width = view.getUint32(16);
    const height = view.getUint32(20);
    if (
      width > 0 && height > 0 && width <= 12000 && height <= 12000 &&
      width * height <= 40000000
    ) {
      return { mime: "image/png", ext: "png" };
    }
  }
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  ) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (view.getUint32(4, true) === bytes.length - 8) {
      return { mime: "image/webp", ext: "webp" };
    }
  }
  return null;
}
async function resolveStaff(token: string) {
  const authClient = createClient(SUPABASE_URL, SUPABASE_PUBLIC_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  const service = serviceClient();
  const { data: auth, error: authError } = await authClient.auth.getUser(token);
  if (authError || !auth.user) {
    return {
      ok: false as const,
      status: 401,
      code: "INVALID_SESSION",
      message: "A valid staff session is required.",
    };
  }
  const { data: profile, error } = await service.from("staff_profile")
    .select("id,account_status,must_change_password")
    .eq("auth_user_id", auth.user.id).maybeSingle();
  if (error) throw new Error("STAFF_PROFILE_LOOKUP_FAILED");
  if (!profile || profile.account_status !== "active") {
    return {
      ok: false as const,
      status: 403,
      code: "STAFF_ACCOUNT_NOT_ACTIVE",
      message: "Your staff account is not active.",
    };
  }
  if (profile.must_change_password) {
    return {
      ok: false as const,
      status: 403,
      code: "PASSWORD_CHANGE_REQUIRED",
      message: "Change your temporary password before managing event flyers.",
    };
  }
  return {
    ok: true as const,
    actorId: auth.user.id,
    profileId: profile.id,
    service,
  };
}
async function canManageEvent(
  service: ReturnType<typeof serviceClient>,
  profileId: string,
  actorId: string,
  branchId: string,
  eventId: string,
) {
  const now = new Date().toISOString();
  const { data: branch, error: branchError } = await service.from("branch")
    .select("id,is_active").eq("id", branchId).maybeSingle();
  if (branchError) throw new Error("BRANCH_LOOKUP_FAILED");
  if (!branch?.is_active) return false;
  const { data: assignments, error } = await service.from(
    "staff_role_assignment",
  )
    .select("role_id,role:role!inner(is_active)")
    .eq("staff_profile_id", profileId).eq("branch_id", branchId)
    .eq("role.is_active", true).lte("starts_at", now)
    .or(`ends_at.is.null,ends_at.gt.${now}`).is("revoked_at", null);
  if (error) throw new Error("ROLE_ASSIGNMENT_LOOKUP_FAILED");
  const roleIds = [
    ...new Set(
      (assignments ?? []).map((row: { role_id: string }) => row.role_id),
    ),
  ];
  if (!roleIds.length) return false;
  const { data: grants, error: grantError } = await service.from(
    "role_capability",
  )
    .select("scope_mode,capability:capability!inner(code,is_active)")
    .in("role_id", roleIds).eq("capability.code", "event.manage.scoped");
  if (grantError) throw new Error("CAPABILITY_LOOKUP_FAILED");
  const scopes = (grants ?? []).flatMap(
    (
      grant: {
        scope_mode: string;
        capability?:
          | { code: string; is_active: boolean }
          | Array<{ code: string; is_active: boolean }>
          | null;
      },
    ) => {
      const cap = Array.isArray(grant.capability)
        ? grant.capability[0]
        : grant.capability;
      return cap?.is_active ? [grant.scope_mode] : [];
    },
  );
  if (scopes.includes("branch")) return true;
  if (scopes.includes("event")) {
    const { data, error: eventError } = await service.from(
      "event_staff_assignment",
    )
      .select("id").eq("event_id", eventId).eq("branch_id", branchId)
      .eq("staff_auth_user_id", actorId).lte("starts_at", now)
      .or(`ends_at.is.null,ends_at.gt.${now}`).is("revoked_at", null)
      .limit(1).maybeSingle();
    if (eventError) throw new Error("EVENT_ASSIGNMENT_LOOKUP_FAILED");
    if (data) return true;
  }
  if (scopes.includes("team")) {
    const { data: eventTeams, error: eventTeamError } = await service.from(
      "event_team_assignment",
    )
      .select("team_id").eq("event_id", eventId).eq("branch_id", branchId)
      .lte("starts_at", now).or(`ends_at.is.null,ends_at.gt.${now}`)
      .is("revoked_at", null);
    if (eventTeamError) throw new Error("EVENT_TEAM_LOOKUP_FAILED");
    const teamIds = [
      ...new Set(
        (eventTeams ?? []).map((row: { team_id: string }) => row.team_id),
      ),
    ];
    if (teamIds.length) {
      const { data: memberships, error: membershipError } = await service.from(
        "staff_team_membership",
      )
        .select("id").eq("staff_profile_id", profileId).eq(
          "branch_id",
          branchId,
        )
        .in("team_id", teamIds).lte("starts_at", now)
        .or(`ends_at.is.null,ends_at.gt.${now}`).is("revoked_at", null)
        .limit(1).maybeSingle();
      if (membershipError) throw new Error("TEAM_MEMBERSHIP_LOOKUP_FAILED");
      if (memberships) return true;
    }
  }
  return false;
}
async function signedPreview(
  service: ReturnType<typeof serviceClient>,
  path: string,
) {
  const { data, error } = await service.storage.from(BUCKET).createSignedUrl(
    path,
    SIGNED_URL_SECONDS,
  );
  if (error || !data?.signedUrl) throw new Error("FLYER_SIGNED_URL_FAILED");
  return data.signedUrl;
}
Deno.serve(async (request: Request) => {
  const requestId = id();
  const origin = request.headers.get("Origin");
  if (origin && !allowedOrigins.has(origin)) {
    return fail(
      "ORIGIN_NOT_ALLOWED",
      "Origin not allowed.",
      403,
      null,
      requestId,
    );
  }
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        ...(origin ? { "Access-Control-Allow-Origin": origin } : {}),
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers":
          "Authorization, apikey, Content-Type, x-client-info",
        "Access-Control-Max-Age": "600",
        "Vary": "Origin",
      },
    });
  }
  if (!["GET", "POST"].includes(request.method)) {
    return fail(
      "METHOD_NOT_ALLOWED",
      "Method not allowed.",
      405,
      origin,
      requestId,
    );
  }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_PUBLIC_KEY) {
    return fail(
      "SERVICE_NOT_CONFIGURED",
      "Event flyer uploads are temporarily unavailable.",
      503,
      origin,
      requestId,
    );
  }
  const token = bearer(request);
  if (!token) {
    return fail(
      "AUTH_REQUIRED",
      "A valid staff session is required.",
      401,
      origin,
      requestId,
    );
  }
  try {
    const auth = await resolveStaff(token);
    if (!auth.ok) {
      return fail(auth.code, auth.message, auth.status, origin, requestId);
    }
    const url = new URL(request.url);
    const parts = url.pathname.split("/").filter(Boolean);
    const eventId = parts[parts.length - 1] === "remove"
      ? parts[parts.length - 2]
      : parts[parts.length - 1];
    const removing = parts[parts.length - 1] === "remove";
    const branchId = url.searchParams.get("branch_id") ?? "";
    if (!isUuid(eventId) || !isUuid(branchId)) {
      return fail(
        "INVALID_EVENT",
        "Select a valid event and ministry workspace.",
        400,
        origin,
        requestId,
      );
    }
    if (
      !await canManageEvent(
        auth.service,
        auth.profileId,
        auth.actorId,
        branchId,
        eventId,
      )
    ) {
      return fail(
        "FORBIDDEN",
        "You don't have permission to manage flyers for this event.",
        403,
        origin,
        requestId,
      );
    }
    const { data: event, error: eventError } = await auth.service.from("event")
      .select(
        "id,branch_id,status,visibility,flyer_object_path,flyer_mime_type,flyer_size_bytes,flyer_updated_at",
      )
      .eq("id", eventId).eq("branch_id", branchId).maybeSingle();
    if (eventError) throw new Error("EVENT_LOOKUP_FAILED");
    if (!event) {
      return fail(
        "EVENT_NOT_FOUND",
        "The event could not be found in this ministry workspace.",
        404,
        origin,
        requestId,
      );
    }
    if (event.status !== "draft" || event.visibility !== "private") {
      return fail(
        "EVENT_NOT_EDITABLE",
        "Flyers can only be changed on private event drafts.",
        409,
        origin,
        requestId,
      );
    }

    if (request.method === "GET") {
      if (!event.flyer_object_path) {
        return fail(
          "FLYER_NOT_FOUND",
          "This event does not have a flyer yet.",
          404,
          origin,
          requestId,
        );
      }
      const signedUrl = await signedPreview(
        auth.service,
        event.flyer_object_path,
      );
      return response(
        {
          data: {
            object_path: event.flyer_object_path,
            mime_type: event.flyer_mime_type,
            size_bytes: event.flyer_size_bytes,
            signed_url: signedUrl,
            signed_url_expires_in: SIGNED_URL_SECONDS,
          },
          request_id: requestId,
        },
        200,
        origin,
        requestId,
      );
    }

    if (removing) {
      if (!event.flyer_object_path) {
        return response(
          { data: { removed: false }, request_id: requestId },
          200,
          origin,
          requestId,
        );
      }
      const { error: updateError } = await auth.service.from("event")
        .update({
          flyer_object_path: null,
          flyer_mime_type: null,
          flyer_size_bytes: null,
          flyer_updated_at: null,
        })
        .eq("id", eventId).eq("branch_id", branchId);
      if (updateError) throw new Error("FLYER_METADATA_UPDATE_FAILED");
      const { error: removeError } = await auth.service.storage.from(BUCKET)
        .remove([event.flyer_object_path]);
      if (removeError) {
        console.error("event flyer cleanup failed", {
          request_id: requestId,
          code: "FLYER_CLEANUP_FAILED",
        });
      }
      return response(
        { data: { removed: true }, request_id: requestId },
        200,
        origin,
        requestId,
      );
    }

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return fail(
        "FLYER_REQUIRED",
        "Choose an event flyer image to upload.",
        400,
        origin,
        requestId,
      );
    }
    if (file.size < 1 || file.size > MAX_BYTES) {
      return fail(
        "FLYER_SIZE_INVALID",
        "Choose an image smaller than 5 MB.",
        413,
        origin,
        requestId,
      );
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const detected = sniffImage(bytes);
    if (!detected || file.type !== detected.mime) {
      return fail(
        "FLYER_TYPE_INVALID",
        "Only valid JPEG, PNG or WebP images are accepted.",
        415,
        origin,
        requestId,
      );
    }

    const objectPath =
      `${branchId}/${eventId}/${crypto.randomUUID()}.${detected.ext}`;
    const { error: uploadError } = await auth.service.storage.from(BUCKET)
      .upload(objectPath, bytes, {
        contentType: detected.mime,
        upsert: false,
        cacheControl: "3600",
      });
    if (uploadError) throw new Error("FLYER_UPLOAD_FAILED");
    const { error: updateError } = await auth.service.from("event").update({
      flyer_object_path: objectPath,
      flyer_mime_type: detected.mime,
      flyer_size_bytes: file.size,
      flyer_updated_at: new Date().toISOString(),
    }).eq("id", eventId).eq("branch_id", branchId);
    if (updateError) {
      await auth.service.storage.from(BUCKET).remove([objectPath]);
      throw new Error("FLYER_METADATA_UPDATE_FAILED");
    }
    if (event.flyer_object_path) {
      const { error: cleanupError } = await auth.service.storage.from(BUCKET)
        .remove([event.flyer_object_path]);
      if (cleanupError) {
        console.error("event flyer replacement cleanup failed", {
          request_id: requestId,
          code: "FLYER_CLEANUP_FAILED",
        });
      }
    }
    const signedUrl = await signedPreview(auth.service, objectPath);
    return response(
      {
        data: {
          object_path: objectPath,
          mime_type: detected.mime,
          size_bytes: file.size,
          signed_url: signedUrl,
          signed_url_expires_in: SIGNED_URL_SECONDS,
        },
        request_id: requestId,
      },
      200,
      origin,
      requestId,
    );
  } catch (cause) {
    const code = cause instanceof Error ? cause.message : "UNKNOWN_ERROR";
    console.error("event-flyers failure", { request_id: requestId, code });
    return fail(
      "EVENT_FLYER_UNAVAILABLE",
      "We couldn't complete the event flyer request. Please try again.",
      500,
      origin,
      requestId,
    );
  }
});
