import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";
import { createPreflightResponse } from "./http.ts";
import { listAllAuthUsers } from "./auth_users.ts";
import {
  normalizeEmail,
  parseBranchId,
  parsePasswordChange,
  parseResetRequest,
  parseResetRequestId,
  parseResetReview,
  parseStaffAccountCreate,
} from "./validation.ts";
import { generateTemporaryPassword } from "./temporary_password.ts";
import { resolveBootstrapPath } from "./bootstrap_state.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const PUBLIC_KEY = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ??
  Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const ALLOWED_ORIGINS = new Set(
  (Deno.env.get("CMI_ALLOWED_ORIGINS") ?? "").split(",")
    .map((value) => value.trim()).filter(Boolean),
);
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const EMAIL_FROM = Deno.env.get("CMI_AUTH_EMAIL_FROM") ?? "";
const APP_URL = (Deno.env.get("CMI_APP_URL") ?? "").replace(/\/+$/, "");
const AUTH_HMAC_KEY = Deno.env.get("CMI_AUTH_HMAC_KEY") ?? "";

type JsonObject = Record<string, unknown>;

function response(
  body: unknown,
  status: number,
  origin: string | null,
  requestId: string,
): Response {
  const headers = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Pragma": "no-cache",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Request-Id": requestId,
    "Vary": "Origin",
  });
  if (origin && ALLOWED_ORIGINS.has(origin)) {
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
): Response {
  return response(
    { error: { code, message }, request_id: requestId },
    status,
    origin,
    requestId,
  );
}

function bearerToken(request: Request): string | null {
  const match = /^Bearer\s+([A-Za-z0-9._~-]+)$/i.exec(
    (request.headers.get("Authorization") ?? "").trim(),
  );
  return match?.[1] ?? null;
}

function clients() {
  const auth = createClient(SUPABASE_URL, PUBLIC_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  const service = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  return { auth, service };
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) =>
    ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    })[character] ?? character);
}

async function sendEmail(
  to: string[],
  subject: string,
  html: string,
  textBody: string,
): Promise<void> {
  if (!RESEND_API_KEY || !EMAIL_FROM || to.length === 0) {
    throw new Error("AUTH_EMAIL_NOT_CONFIGURED");
  }
  const result = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: EMAIL_FROM,
      to,
      subject,
      html,
      text: textBody,
    }),
  });
  if (!result.ok) {
    // Never log the provider response body or recipient credentials.
    throw new Error("AUTH_EMAIL_DELIVERY_FAILED");
  }
}

async function hmacFingerprint(value: string): Promise<string> {
  if (AUTH_HMAC_KEY.length < 32) {
    throw new Error("AUTH_HMAC_KEY_NOT_CONFIGURED");
  }
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(AUTH_HMAC_KEY),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)),
  );
  return [...signature].map((byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

function clientIp(request: Request): string {
  const cloudflareIp = request.headers.get("cf-connecting-ip")?.trim();
  if (cloudflareIp) return cloudflareIp.slice(0, 80);
  return "unknown";
}

async function jsonBody(request: Request): Promise<JsonObject | null> {
  if (
    !/^application\/json(?:\s*;|$)/i.test(
      request.headers.get("Content-Type") ?? "",
    )
  ) {
    return null;
  }
  const contentLength = Number(request.headers.get("Content-Length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > 4096) return null;
  const reader = request.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > 4096) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } catch {
    return null;
  } finally {
    reader.releaseLock();
  }
  if (totalBytes === 0) return null;
  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as JsonObject
    : null;
}

function randomTemporaryPassword(length = 36): string {
  const alphabet =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%*-_";
  const maximum = 256 - (256 % alphabet.length);
  let output = "";
  while (output.length < length) {
    const bytes = crypto.getRandomValues(new Uint8Array(length * 2));
    for (const byte of bytes) {
      if (byte >= maximum) continue;
      output += alphabet[byte % alphabet.length];
      if (output.length === length) break;
    }
  }
  return output;
}

async function constantTimeEqual(
  left: string,
  right: string,
): Promise<boolean> {
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", new TextEncoder().encode(left)),
    crypto.subtle.digest("SHA-256", new TextEncoder().encode(right)),
  ]);
  const aa = new Uint8Array(a), bb = new Uint8Array(b);
  let difference = 0;
  for (let index = 0; index < aa.length; index++) {
    difference |= aa[index] ^ bb[index];
  }
  return difference === 0;
}

async function requireStaff(
  token: string,
  origin: string | null,
  requestId: string,
) {
  const { auth, service } = clients();
  const { data, error } = await auth.auth.getUser(token);
  if (error || !data.user) {
    return {
      error: fail(
        "INVALID_SESSION",
        "A valid staff session is required.",
        401,
        origin,
        requestId,
      ),
      authUser: null,
      service,
    };
  }
  const { data: profile, error: profileError } = await service
    .from("staff_profile")
    .select("id,account_status,must_change_password,password_setup_expires_at")
    .eq("auth_user_id", data.user.id)
    .maybeSingle();
  if (profileError) throw new Error("STAFF_PROFILE_LOOKUP_FAILED");
  if (!profile || profile.account_status !== "active") {
    return {
      error: fail(
        "STAFF_ACCOUNT_NOT_ACTIVE",
        "An active staff account is required.",
        403,
        origin,
        requestId,
      ),
      authUser: null,
      service,
    };
  }
  if (profile.must_change_password) {
    const setupExpiresAt = Date.parse(profile.password_setup_expires_at ?? "");
    if (!Number.isFinite(setupExpiresAt) || setupExpiresAt <= Date.now()) {
      return {
        error: fail(
          "PASSWORD_SETUP_EXPIRED",
          "The temporary password has expired. Request an administrator-assisted reset.",
          403,
          origin,
          requestId,
        ),
        authUser: null,
        service,
      };
    }
    return {
      error: fail(
        "PASSWORD_CHANGE_REQUIRED",
        "Change the temporary password before using staff operations.",
        403,
        origin,
        requestId,
      ),
      authUser: null,
      service,
    };
  }
  return { error: null, authUser: data.user, service };
}

async function bootstrapAdmin(
  request: Request,
  origin: string | null,
  requestId: string,
): Promise<Response> {
  const configuredToken = Deno.env.get("CMI_BOOTSTRAP_TOKEN") ?? "";
  const suppliedToken = bearerToken(request) ?? "";
  if (
    configuredToken.length < 32 || !suppliedToken ||
    !await constantTimeEqual(configuredToken, suppliedToken)
  ) {
    return fail(
      "BOOTSTRAP_NOT_AUTHORIZED",
      "Bootstrap authorization failed.",
      401,
      origin,
      requestId,
    );
  }

  const email = normalizeEmail(Deno.env.get("CMI_BOOTSTRAP_ADMIN_EMAIL"));
  const fullName = (Deno.env.get("CMI_BOOTSTRAP_ADMIN_NAME") ?? "").trim();
  const churchName = (Deno.env.get("CMI_BOOTSTRAP_CHURCH_NAME") ?? "").trim();
  const branchName = (Deno.env.get("CMI_BOOTSTRAP_BRANCH_NAME") ?? "").trim();
  const fallbackAdmins = (Deno.env.get("CMI_AUTH_ADMIN_EMAILS") ?? "")
    .split(",").map((value) => normalizeEmail(value)).filter((
      value,
    ): value is string => !!value);
  if (
    !SUPABASE_URL || !SERVICE_KEY || !email ||
    fullName.length < 2 || fullName.length > 180 ||
    churchName.length < 2 || churchName.length > 180 ||
    branchName.length < 2 || branchName.length > 160 ||
    !APP_URL.startsWith("https://") ||
    !RESEND_API_KEY || !EMAIL_FROM || AUTH_HMAC_KEY.length < 32 ||
    !fallbackAdmins.some((address) => address !== email)
  ) {
    return fail(
      "BOOTSTRAP_NOT_CONFIGURED",
      "The secure first-administrator setup is not fully configured.",
      503,
      origin,
      requestId,
    );
  }

  const { service } = clients();
  const temporaryPassword = randomTemporaryPassword();
  const existingUsers = await listAllAuthUsers<{
    id: string;
    email?: string | null;
  }>(async (page, perPage) => {
    const { data, error } = await service.auth.admin.listUsers({
      page,
      perPage,
    });
    return { users: data?.users, error };
  });
  let authUserId = existingUsers.length === 1 ? existingUsers[0].id : "";
  let createdNewAuthUser = false;
  let existingProfile: {
    id: string;
    account_status: string;
    must_change_password: boolean;
    password_changed_at: string | null;
  } | null = null;

  if (existingUsers.length === 1) {
    const { data: profile, error: profileError } = await service
      .from("staff_profile")
      .select(
        "id,email,account_status,must_change_password,password_changed_at",
      )
      .eq("auth_user_id", authUserId)
      .maybeSingle();
    if (profileError) throw new Error("BOOTSTRAP_PROFILE_LOOKUP_FAILED");
    existingProfile = profile;
  }

  const verifiedPath = resolveBootstrapPath(
    existingUsers,
    email,
    existingProfile,
  );
  if (verifiedPath === "create") {
    const { data: created, error: createError } = await service.auth.admin
      .createUser({
        email,
        password: temporaryPassword,
        email_confirm: true,
      });
    if (createError || !created.user) {
      throw new Error("BOOTSTRAP_AUTH_USER_CREATE_FAILED");
    }
    authUserId = created.user.id;
    createdNewAuthUser = true;

    const { error: bootstrapError } = await service.rpc(
      "cmi_bootstrap_first_admin",
      {
        p_auth_user_id: authUserId,
        p_email: email,
        p_full_name: fullName,
        p_church_name: churchName,
        p_branch_name: branchName,
      },
    );
    if (bootstrapError) {
      await service.auth.admin.deleteUser(authUserId).catch(() => undefined);
      throw new Error("BOOTSTRAP_DATABASE_PROVISION_FAILED");
    }
  } else if (verifiedPath === "recover_partial_auth_user") {
    // Recover only Auth-user-created / CMI-profile-not-created state. The
    // database RPC independently verifies the project is still unprovisioned.
    const { error: bootstrapError } = await service.rpc(
      "cmi_bootstrap_first_admin",
      {
        p_auth_user_id: authUserId,
        p_email: email,
        p_full_name: fullName,
        p_church_name: churchName,
        p_branch_name: branchName,
      },
    );
    if (bootstrapError) {
      throw new Error("BOOTSTRAP_DATABASE_PROVISION_FAILED");
    }
    const { error: passwordError } = await service.auth.admin.updateUserById(
      authUserId,
      { password: temporaryPassword },
    );
    if (passwordError) {
      throw new Error("BOOTSTRAP_TEMPORARY_PASSWORD_REISSUE_FAILED");
    }
  } else if (verifiedPath === "recover_undelivered_credential") {
    // The account exists, but the first-admin password gate has never been
    // completed. Rotate the temporary password before retrying delivery so a
    // previous possibly-delivered credential can no longer be used.
    const { error: passwordError } = await service.auth.admin.updateUserById(
      authUserId,
      { password: temporaryPassword },
    );
    if (passwordError) {
      throw new Error("BOOTSTRAP_TEMPORARY_PASSWORD_REISSUE_FAILED");
    }
    const { error: expiryError } = await service
      .from("staff_profile")
      .update({
        password_setup_expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000)
          .toISOString(),
      })
      .eq("id", existingProfile!.id)
      .eq("account_status", "active")
      .eq("must_change_password", true)
      .is("password_changed_at", null);
    if (expiryError) {
      throw new Error("BOOTSTRAP_PASSWORD_EXPIRY_REFRESH_FAILED");
    }
  } else {
    return fail(
      "BOOTSTRAP_ALREADY_USED",
      "First-administrator bootstrap has already been consumed or is not eligible for recovery.",
      409,
      origin,
      requestId,
    );
  }

  const safeName = escapeHtml(fullName);
  const safeEmail = escapeHtml(email);
  const safePassword = escapeHtml(temporaryPassword);
  const safeUrl = escapeHtml(APP_URL);
  const subject = "Your temporary PCG Missions administrator access";
  const textBody = [
    `Hello ${fullName},`,
    "",
    "Your initial PCG Missions administrator account has been created.",
    `Sign-in email: ${email}`,
    `One-time temporary password: ${temporaryPassword}`,
    "",
    "This temporary password expires in 24 hours and must be replaced immediately after your first sign-in.",
    `Open PCG Missions: ${APP_URL}`,
    "",
    "Do not forward this email or reuse the temporary password.",
  ].join("\n");
  const html = `<p>Hello ${safeName},</p>
    <p>Your initial PCG Missions administrator account is ready.</p>
    <p><strong>Sign-in email</strong><br>${safeEmail}</p>
    <p><strong>One-time temporary password</strong><br><code>${safePassword}</code></p>
    <p>This temporary password expires in 24 hours and must be replaced immediately after your first sign-in.</p>
    <p><a href="${safeUrl}">Open PCG Missions</a></p>
    <p>Do not forward this email or reuse the temporary password.</p>`;
  await sendEmail([email], subject, html, textBody);

  // The password is never returned by the bootstrap endpoint or written to logs.
  return response(
    {
      data: {
        created: createdNewAuthUser,
        temporary_password_sent: true,
        must_change_password: true,
        password_expires_in_hours: 24,
      },
      request_id: requestId,
    },
    200,
    origin,
    requestId,
  );
}

async function bootstrapAdminWithLease(
  request: Request,
  origin: string | null,
  requestId: string,
): Promise<Response> {
  // Authenticate the operator before taking the shared lock. An invalid
  // request must not be able to block a legitimate bootstrap attempt.
  const configuredToken = Deno.env.get("CMI_BOOTSTRAP_TOKEN") ?? "";
  const suppliedToken = bearerToken(request) ?? "";
  if (
    configuredToken.length < 32 || !suppliedToken ||
    !await constantTimeEqual(configuredToken, suppliedToken)
  ) {
    return fail(
      "BOOTSTRAP_NOT_AUTHORIZED",
      "Bootstrap authorization failed.",
      401,
      origin,
      requestId,
    );
  }

  const { service } = clients();
  const leaseId = crypto.randomUUID();
  const { data: acquired, error: acquireError } = await service.rpc(
    "cmi_acquire_first_admin_bootstrap_lease",
    { p_lease_id: leaseId },
  );
  if (acquireError) throw new Error("BOOTSTRAP_LEASE_ACQUIRE_FAILED");
  if (acquired !== true) {
    return fail(
      "BOOTSTRAP_IN_PROGRESS",
      "A first-administrator setup or recovery operation is already in progress. Wait briefly and retry.",
      409,
      origin,
      requestId,
    );
  }

  try {
    return await bootstrapAdmin(request, origin, requestId);
  } finally {
    const { error: releaseError } = await service.rpc(
      "cmi_release_first_admin_bootstrap_lease",
      { p_lease_id: leaseId },
    );
    if (releaseError) {
      // The lease expires automatically after three minutes if the runtime
      // terminates before release. Never log the bearer token or credentials.
      console.error("first-admin bootstrap lease release failed", {
        request_id: requestId,
      });
    }
  }
}

Deno.serve(async (request: Request) => {
  const id = crypto.randomUUID();
  const origin = request.headers.get("Origin");
  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    return fail("ORIGIN_NOT_ALLOWED", "Origin not allowed.", 403, null, id);
  }
  if (request.method === "OPTIONS") {
    return createPreflightResponse(origin, ALLOWED_ORIGINS, id);
  }
  if (!SUPABASE_URL || !SERVICE_KEY || !PUBLIC_KEY) {
    return fail(
      "SERVICE_NOT_CONFIGURED",
      "Staff authentication service is not configured.",
      503,
      origin,
      id,
    );
  }

  const path = new URL(request.url).pathname.replace(/\/+$/, "").split("/")
    .filter(Boolean);
  const route = path.slice(3);
  const action = route.join("/");
  try {
    if (request.method === "POST" && action === "bootstrap-admin") {
      return await bootstrapAdminWithLease(request, origin, id);
    }

    if (request.method === "POST" && action === "request-password-reset") {
      const configuredNotificationAdmins =
        (Deno.env.get("CMI_AUTH_ADMIN_EMAILS") ?? "")
          .split(",").map((value) => normalizeEmail(value)).filter((
            value,
          ): value is string => !!value);
      if (
        !RESEND_API_KEY || !EMAIL_FROM || !APP_URL.startsWith("https://") ||
        AUTH_HMAC_KEY.length < 32 || configuredNotificationAdmins.length === 0
      ) {
        return fail(
          "AUTH_RECOVERY_NOT_CONFIGURED",
          "Account recovery is not fully configured. Contact a church administrator.",
          503,
          origin,
          id,
        );
      }
      const body = await jsonBody(request);
      const parsed = parseResetRequest(body);
      if (!parsed.ok) {
        return fail("INVALID_REQUEST", parsed.error, 400, origin, id);
      }
      const emailFingerprint = await hmacFingerprint(parsed.email);
      const ipFingerprint = await hmacFingerprint(clientIp(request));
      const { service } = clients();
      const { data, error } = await service.rpc(
        "cmi_request_staff_password_reset",
        {
          p_email: parsed.email,
          p_email_fingerprint: emailFingerprint,
          p_ip_fingerprint: ipFingerprint,
        },
      );
      if (error) throw new Error("PASSWORD_RESET_REQUEST_CREATE_FAILED");

      const record = data as {
        matched?: boolean;
        request_id?: string;
        staff_name?: string;
        staff_email?: string;
        admin_emails?: string[];
      } | null;
      const extraAdmins = (Deno.env.get("CMI_AUTH_ADMIN_EMAILS") ?? "")
        .split(",").map((value) => normalizeEmail(value)).filter((
          value,
        ): value is string => !!value);
      const recipients = [
        ...new Set([
          ...(record?.admin_emails ?? []).map((value) => normalizeEmail(value))
            .filter((value): value is string => !!value),
          ...extraAdmins,
        ]),
      ];
      if (record?.matched && record.request_id) {
        let sent = false;
        try {
          const name = escapeHtml(record.staff_name ?? "A staff member");
          const email = escapeHtml(record.staff_email ?? "");
          const requestLink = `${APP_URL}/?view=access-requests`;
          await sendEmail(
            recipients,
            "PCG Missions — staff password reset request",
            `<p>A staff member has requested help accessing PCG Missions.</p>
             <p><strong>Staff member:</strong> ${name}<br><strong>Account:</strong> ${email}</p>
             <p>Review the request in the authenticated staff workspace. Do not reply with or request the user's password.</p>
             <p><a href="${
              escapeHtml(requestLink)
            }">Open password-reset requests</a></p>`,
            `A staff member has requested help accessing PCG Missions.\nStaff member: ${
              record.staff_name ?? "A staff member"
            }\nAccount: ${
              record.staff_email ?? ""
            }\nReview the request in the authenticated staff workspace. Do not share or request passwords.\n${requestLink}`,
          );
          sent = true;
        } catch {
          console.error("staff password-reset notification failed", {
            request_id: id,
          });
        }
        await service.rpc("cmi_mark_staff_password_reset_notification", {
          p_request_id: record.request_id,
          p_sent: sent,
        });
      }

      // Deliberately identical for known, unknown, inactive and rate-limited addresses.
      return response(
        {
          data: {
            accepted: true,
            message:
              "If this email belongs to an active staff account, the administrators have been notified.",
          },
          request_id: id,
        },
        202,
        origin,
        id,
      );
    }

    if (request.method === "POST" && action === "complete-password-change") {
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
      const parsed = parsePasswordChange(await jsonBody(request));
      if (!parsed.ok) {
        return fail("INVALID_PASSWORD", parsed.error, 400, origin, id);
      }

      const { auth, service } = clients();
      const { data: authData, error: authError } = await auth.auth.getUser(
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
      const { data: profile, error: profileError } = await service
        .from("staff_profile")
        .select(
          "id,account_status,must_change_password,password_setup_expires_at",
        )
        .eq("auth_user_id", authData.user.id)
        .maybeSingle();
      if (profileError) throw new Error("STAFF_PROFILE_LOOKUP_FAILED");
      if (!profile || profile.account_status !== "active") {
        return fail(
          "STAFF_ACCOUNT_NOT_ACTIVE",
          "An active staff account is required.",
          403,
          origin,
          id,
        );
      }
      if (!profile.must_change_password) {
        return fail(
          "PASSWORD_CHANGE_NOT_REQUIRED",
          "There is no pending password setup or approved recovery for this account.",
          409,
          origin,
          id,
        );
      }
      const setupExpiresAt = Date.parse(
        profile.password_setup_expires_at ?? "",
      );
      if (!Number.isFinite(setupExpiresAt) || setupExpiresAt <= Date.now()) {
        return fail(
          "PASSWORD_SETUP_EXPIRED",
          "The temporary password or recovery link has expired. Request an administrator-assisted reset.",
          403,
          origin,
          id,
        );
      }

      // Change the actual Supabase Auth credential before clearing the database gate.
      // If the database write fails, the account remains gated and the user can retry.
      const { error: passwordError } = await service.auth.admin.updateUserById(
        authData.user.id,
        { password: parsed.password },
      );
      if (passwordError) {
        return fail(
          "PASSWORD_UPDATE_FAILED",
          "The new password could not be saved. Check the password and try again.",
          400,
          origin,
          id,
        );
      }
      const { error: completionError } = await service.rpc(
        "cmi_complete_staff_password_change",
        {
          p_auth_user_id: authData.user.id,
        },
      );
      if (completionError) throw new Error("PASSWORD_CHANGE_COMPLETION_FAILED");

      // Revoke other refresh-token sessions while retaining this recovery/setup session.
      try {
        await fetch(`${SUPABASE_URL}/auth/v1/logout?scope=others`, {
          method: "POST",
          headers: {
            apikey: PUBLIC_KEY,
            Authorization: `Bearer ${token}`,
          },
        });
      } catch {
        console.warn("other staff sessions could not be revoked", {
          request_id: id,
        });
      }
      return response(
        { data: { password_change_required: false }, request_id: id },
        200,
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
    const required = await requireStaff(token, origin, id);
    if (required.error || !required.authUser) return required.error!;
    const { service } = required;

    if (
      request.method === "POST" &&
      route[0] === "admin" &&
      route[1] === "staff" &&
      route.length === 2
    ) {
      const parsed = parseStaffAccountCreate(await jsonBody(request));
      if (!parsed.ok) {
        return fail("INVALID_REQUEST", parsed.error, 400, origin, id);
      }
      if (!RESEND_API_KEY || !EMAIL_FROM) {
        return fail(
          "AUTH_EMAIL_NOT_CONFIGURED",
          "Staff invitation email is not configured.",
          503,
          origin,
          id,
        );
      }

      const temporaryPassword = generateTemporaryPassword();
      const { data: created, error: createError } = await service.auth.admin
        .createUser({
          email: parsed.value.email,
          password: temporaryPassword,
          email_confirm: true,
          user_metadata: { full_name: parsed.value.full_name },
        });
      if (createError || !created.user) {
        if (createError?.message?.toLowerCase().includes("already")) {
          return fail(
            "STAFF_EMAIL_ALREADY_EXISTS",
            "An account with this email already exists. Review the staff directory before retrying.",
            409,
            origin,
            id,
          );
        }
        throw new Error("STAFF_AUTH_USER_CREATE_FAILED");
      }

      const { data: provisioned, error: provisionError } = await service.rpc(
        "cmi_create_staff_account",
        {
          p_actor_auth_user_id: required.authUser.id,
          p_target_auth_user_id: created.user.id,
          p_full_name: parsed.value.full_name,
          p_email: parsed.value.email,
          p_branch_id: parsed.value.branch_id,
          p_role_code: parsed.value.role_code,
          p_reason: parsed.value.reason,
        },
      );
      if (provisionError || !provisioned) {
        await service.auth.admin.deleteUser(created.user.id);
        if (provisionError?.code === "42501") {
          return fail(
            "FORBIDDEN",
            "You are not authorised to create staff accounts or assign roles in this branch.",
            403,
            origin,
            id,
          );
        }
        if (provisionError?.code === "23505") {
          return fail(
            "STAFF_ACCOUNT_ALREADY_EXISTS",
            "A staff profile already exists for this email.",
            409,
            origin,
            id,
          );
        }
        throw new Error("STAFF_PROFILE_PROVISION_FAILED");
      }

      const safeName = escapeHtml(parsed.value.full_name);
      const safeEmail = escapeHtml(parsed.value.email);
      const safePassword = escapeHtml(temporaryPassword);
      try {
        await sendEmail(
          [parsed.value.email],
          "Your PCG Missions staff account",
          `<p>Hello ${safeName},</p>
           <p>An administrator has created your PCG Missions staff account.</p>
           <p><strong>Sign-in email:</strong> ${safeEmail}</p>
           <p><strong>One-time temporary password:</strong><br><code>${safePassword}</code></p>
           <p>Sign in using this email and temporary password. You must choose a new private password immediately after your first sign-in. This temporary password expires in 24 hours.</p>
           <p>Do not forward this email. If you were not expecting this account, contact your church administrator.</p>`,
          [
            `Hello ${parsed.value.full_name},`,
            "An administrator has created your PCG Missions staff account.",
            `Sign-in email: ${parsed.value.email}`,
            `One-time temporary password: ${temporaryPassword}`,
            "Sign in with this email and temporary password. You must choose a new private password immediately after first sign-in. This temporary password expires in 24 hours.",
            "Do not forward this email. If you were not expecting this account, contact your church administrator.",
          ].join("\n"),
        );
      } catch {
        console.error("staff invitation email delivery failed", {
          request_id: id,
          staff_profile_id: (provisioned as { staff_profile_id?: string })
            ?.staff_profile_id,
        });
        return fail(
          "STAFF_INVITATION_EMAIL_FAILED",
          "The staff account was created, but the invitation email could not be delivered. The administrator should ask the user to submit Forgot password so a temporary password can be issued through the approved recovery process.",
          503,
          origin,
          id,
        );
      }

      return response(
        {
          data: {
            staff_profile_id:
              (provisioned as { staff_profile_id: string }).staff_profile_id,
            email: parsed.value.email,
            role_code: parsed.value.role_code,
            invitation_email_sent: true,
            must_change_password: true,
          },
          request_id: id,
        },
        201,
        origin,
        id,
      );
    }

    if (
      request.method === "GET" && route[0] === "admin" &&
      route[1] === "password-reset-requests"
    ) {
      const branchId = parseBranchId(
        new URL(request.url).searchParams.get("branch_id"),
      );
      if (!branchId) {
        return fail(
          "INVALID_REQUEST",
          "A valid branch_id is required.",
          400,
          origin,
          id,
        );
      }
      const { data, error } = await service.rpc(
        "cmi_list_staff_password_reset_requests",
        {
          p_actor_auth_user_id: required.authUser.id,
          p_branch_id: branchId,
        },
      );
      if (error?.code === "42501") {
        return fail(
          "FORBIDDEN",
          "You cannot review password-reset requests in this branch.",
          403,
          origin,
          id,
        );
      }
      if (error) throw new Error("PASSWORD_RESET_REQUEST_LIST_FAILED");
      return response({ data, request_id: id }, 200, origin, id);
    }

    if (
      request.method === "POST" &&
      route[0] === "admin" &&
      route[1] === "password-reset-requests" &&
      route.length === 4
    ) {
      const requestId = parseResetRequestId(route[2] ?? "");
      const actionName = route[3];
      if (!requestId || (actionName !== "approve" && actionName !== "deny")) {
        return fail(
          "NOT_FOUND",
          "Password-reset request action not found.",
          404,
          origin,
          id,
        );
      }
      const body = await jsonBody(request);
      const parsed = parseResetReview(body);
      if (!parsed.ok) {
        return fail("INVALID_REQUEST", parsed.error, 400, origin, id);
      }

      if (actionName === "deny") {
        const { error } = await service.rpc(
          "cmi_finish_staff_password_reset_request",
          {
            p_actor_auth_user_id: required.authUser.id,
            p_branch_id: parsed.branch_id,
            p_request_id: requestId,
            p_action: "denied",
            p_reason: parsed.reason,
          },
        );
        if (error?.code === "42501") {
          return fail(
            "FORBIDDEN",
            "You cannot deny this password-reset request.",
            403,
            origin,
            id,
          );
        }
        if (error?.code === "P0002") {
          return fail(
            "NOT_FOUND",
            "Pending password-reset request not found.",
            404,
            origin,
            id,
          );
        }
        if (error) throw new Error("PASSWORD_RESET_REQUEST_DENIAL_FAILED");
        return response(
          { data: { status: "denied" }, request_id: id },
          200,
          origin,
          id,
        );
      }

      const { data: claim, error: claimError } = await service.rpc(
        "cmi_claim_staff_password_reset_request",
        {
          p_actor_auth_user_id: required.authUser.id,
          p_branch_id: parsed.branch_id,
          p_request_id: requestId,
        },
      );
      if (claimError?.code === "42501") {
        return fail(
          "FORBIDDEN",
          "You cannot approve this password-reset request.",
          403,
          origin,
          id,
        );
      }
      if (claimError?.code === "P0002") {
        return fail(
          "NOT_FOUND",
          "Pending password-reset request not found.",
          404,
          origin,
          id,
        );
      }
      if (claimError) throw new Error("PASSWORD_RESET_REQUEST_CLAIM_FAILED");
      const claimed = claim as
        | {
          target_auth_user_id?: string;
          target_email?: string;
          target_name?: string;
        }
        | null;
      const email = normalizeEmail(claimed?.target_email);
      const targetAuthUserId = parseResetRequestId(
        claimed?.target_auth_user_id ?? "",
      );
      if (!email || !targetAuthUserId) {
        throw new Error("PASSWORD_RESET_TARGET_INVALID");
      }

      // Claiming the request has already gated the target profile in the
      // database. Keep it in processing state on any failure so an authorised
      // administrator can retry after the 10-minute claim lease expires.
      const temporaryPassword = generateTemporaryPassword();
      const { error: passwordError } = await service.auth.admin.updateUserById(
        targetAuthUserId,
        { password: temporaryPassword },
      );
      if (passwordError) {
        return fail(
          "RESET_CREDENTIAL_UPDATE_FAILED",
          "The temporary password could not be issued. The request remains restricted and can be retried by an administrator.",
          503,
          origin,
          id,
        );
      }

      try {
        const safeName = escapeHtml(claimed?.target_name ?? "staff member");
        const safePassword = escapeHtml(temporaryPassword);
        const textBody = [
          `Hello ${claimed?.target_name ?? "staff member"},`,
          "Your password-reset request has been approved by a church administrator.",
          `Your temporary password is: ${temporaryPassword}`,
          "Sign in with your registered email address. You must create a new private password before accessing PCG Missions.",
          "Do not forward this message. If you did not request this reset, contact your church administrator immediately.",
        ].join("\n");
        await sendEmail(
          [email],
          "PCG Missions — temporary password issued",
          `<p>Hello ${safeName},</p>
           <p>Your password-reset request has been approved by a church administrator.</p>
           <p>Your temporary password is:</p>
           <p><strong><code>${safePassword}</code></strong></p>
           <p>Sign in with your registered email address and this temporary password. You must create a new private password before accessing PCG Missions.</p>
           <p>This temporary password expires within the reset request's validity window. Do not forward it. If you did not request this reset, contact your church administrator immediately.</p>`,
          textBody,
        );
      } catch {
        console.error("staff temporary password email delivery failed", {
          request_id: id,
        });
        return fail(
          "RESET_EMAIL_DELIVERY_FAILED",
          "The temporary password could not be emailed. The account remains restricted and the request can be retried by an administrator.",
          503,
          origin,
          id,
        );
      }

      const { error: finishError } = await service.rpc(
        "cmi_finish_staff_password_reset_request",
        {
          p_actor_auth_user_id: required.authUser.id,
          p_branch_id: parsed.branch_id,
          p_request_id: requestId,
          p_action: "approved",
          p_reason: parsed.reason,
        },
      );
      if (finishError) {
        // The account was already gated at claim time and the temporary
        // password was delivered. The user can complete the forced change;
        // the database completion transaction also closes a processing request.
        console.error("staff password reset approval finalization failed", {
          request_id: id,
        });
      }

      return response(
        {
          data: {
            status: "approved",
            temporary_password_sent: true,
            must_change_password: true,
          },
          request_id: id,
        },
        200,
        origin,
        id,
      );
    }

    return fail(
      "NOT_FOUND",
      "Staff authentication operation not found.",
      404,
      origin,
      id,
    );
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    console.error("staff-auth failure", { request_id: id, code });
    return fail(
      "STAFF_AUTH_OPERATION_FAILED",
      "Unable to complete this authentication operation.",
      500,
      origin,
      id,
    );
  }
});
