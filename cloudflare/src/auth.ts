import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { drizzle } from "drizzle-orm/d1";
import { compare as bcryptCompare, hash as bcryptHash } from "bcryptjs";
import { authSchema } from "./auth-schema.ts";

export interface AuthStatement {
  bind(...values: unknown[]): AuthStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run(): Promise<{ success: boolean; meta?: { changes?: number } }>;
}
export interface AuthDatabase {
  prepare(sql: string): AuthStatement;
  batch(statements: AuthStatement[]): Promise<Array<{ success: boolean; meta?: { changes?: number } }>>;
}
export interface AuthEnvironment {
  DB: AuthDatabase;
  BETTER_AUTH_SECRET?: string;
  BETTER_AUTH_URL?: string;
  BETTER_AUTH_TRUSTED_ORIGINS?: string;
  APP_ALLOWED_ORIGINS?: string;
  /** Test-only injection seam. Cloudflare bindings cannot contain functions; never configure this in a deployed Worker. */
  __TEST_SESSION_RESOLVER?: (request: Request) => Promise<{ user: { id: string; email?: string | null } } | null>;
}

function trustedOrigins(env: AuthEnvironment, baseUrl: URL): string[] {
  const configured = [env.BETTER_AUTH_TRUSTED_ORIGINS ?? "", env.APP_ALLOWED_ORIGINS ?? ""]
    .flatMap((value) => value.split(",")).map((value) => value.trim()).filter(Boolean);
  const origins = new Set([baseUrl.origin]);
  for (const value of configured) {
    const parsed = new URL(value);
    if (parsed.origin !== value.replace(/\/$/, "")) throw new Error("AUTH_TRUSTED_ORIGIN_MUST_BE_AN_ORIGIN");
    origins.add(parsed.origin);
  }
  return [...origins];
}

export function verifyLegacyBcryptPassword(password: string, hash: string): Promise<boolean> {
  if (!/^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(hash)) return Promise.resolve(false);
  const compatibleHash = hash.startsWith("$2y$") ? "$2b$" + hash.slice(4) : hash;
  return bcryptCompare(password, compatibleHash);
}

/**
 * Better Auth rate-limit policy.
 *
 * Session hydration is a read path polled by the browser and must not create a
 * persistent D1 rate-limit write on every page load/focus event. Keep the
 * database-backed limits on credential and password-recovery mutations.
 */
export const betterAuthRateLimitOptions = {
  enabled: true,
  storage: "database",
  window: 60,
  max: 30,
  customRules: {
    // Match both the internal route path and the external basePath-qualified URL.
    "/get-session": false,
    "/api/auth/get-session": false,
    "/sign-in/email": { window: 60, max: 5 },
    "/forget-password": { window: 60, max: 3 },
    "/reset-password": { window: 60, max: 5 },
  },
} as const;

/** Build Better Auth per request so the instance always uses the current Cloudflare D1 binding. */
export function createAuth(env: AuthEnvironment) {
  if (!env.BETTER_AUTH_SECRET || env.BETTER_AUTH_SECRET.length < 32) throw new Error("BETTER_AUTH_SECRET_MISSING_OR_TOO_SHORT");
  if (!env.BETTER_AUTH_URL) throw new Error("BETTER_AUTH_URL_NOT_CONFIGURED");
  const baseUrl = new URL(env.BETTER_AUTH_URL);
  if (baseUrl.protocol !== "https:" && baseUrl.hostname !== "localhost") throw new Error("BETTER_AUTH_URL_MUST_USE_HTTPS");
  const secureCookies = baseUrl.protocol === "https:";

  const database = drizzle(env.DB as Parameters<typeof drizzle>[0], { schema: authSchema });

  return betterAuth({
    appName: "PCG Missions",
    baseURL: baseUrl.origin,
    basePath: "/api/auth",
    secret: env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(database, { provider: "sqlite", schema: authSchema }),
    trustedOrigins: trustedOrigins(env, baseUrl),
    databaseHooks: {
      session: {
        create: {
          before: async (session) => {
            const staff = await env.DB.prepare(
              "SELECT sp.id FROM staff_profile sp WHERE sp.auth_user_id = ? AND sp.account_status = 'active' " +
              "AND EXISTS (SELECT 1 FROM staff_role_assignment sra JOIN role r ON r.id = sra.role_id AND r.is_active = 1 " +
              "JOIN branch b ON b.id = sra.branch_id AND b.is_active = 1 WHERE sra.staff_profile_id = sp.id " +
              "AND sra.revoked_at IS NULL AND sra.starts_at <= strftime('%Y-%m-%dT%H:%M:%fZ','now') " +
              "AND (sra.ends_at IS NULL OR sra.ends_at > strftime('%Y-%m-%dT%H:%M:%fZ','now'))) LIMIT 1"
            ).bind(session.userId).first<{ id: string }>();
            if (!staff) return false;
            return { data: session };
          },
        },
      },
    },
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      autoSignIn: false,
      requireEmailVerification: false,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      password: {
        hash: async (password) => bcryptHash(password, 12),
        verify: async ({ password, hash }) => verifyLegacyBcryptPassword(password, hash),
      },
      // PCG Missions uses its audited Admin/Pastor-approved reset-request flow.
      sendResetPassword: async () => { throw new Error("ADMIN_APPROVED_PASSWORD_RESET_REQUIRED"); },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
      // Session hydration stays read-only; the browser performs a deliberate POST only when refresh is due.
      deferSessionRefresh: true,
      cookieCache: { enabled: false },
    },
    advanced: {
      useSecureCookies: secureCookies,
      defaultCookieAttributes: { httpOnly: true, secure: secureCookies, sameSite: "lax", path: "/" },
      ipAddress: { ipAddressHeaders: ["cf-connecting-ip"] },
    },
    rateLimit: betterAuthRateLimitOptions,
  });
}

/** Resolve a cookie-backed session; the optional function exists only for isolated Worker unit fixtures. */
export async function getAuthSession(env: AuthEnvironment, request: Request) {
  if (typeof env.__TEST_SESSION_RESOLVER === "function") {
    return env.__TEST_SESSION_RESOLVER(request);
  }
  return createAuth(env).api.getSession({ headers: request.headers });
}

export async function createBetterAuthUser(
  env: AuthEnvironment,
  input: { email: string; password: string; fullName: string },
): Promise<string> {
  const userId = crypto.randomUUID();
  const now = Date.now();
  const email = input.email.trim().toLowerCase();
  const passwordHash = await bcryptHash(input.password, 12);
  const results = await env.DB.batch([
    env.DB.prepare('INSERT INTO "user" (id,name,email,emailVerified,image,createdAt,updatedAt) VALUES (?,?,?,1,NULL,?,?)')
      .bind(userId, input.fullName.trim(), email, now, now),
    env.DB.prepare("INSERT INTO account (id,accountId,providerId,userId,password,createdAt,updatedAt) VALUES (?,?,'credential',?,?,?,?)")
      .bind(crypto.randomUUID(), userId, userId, passwordHash, now, now),
  ]);
  if (results.some((result) => !result.success || (result.meta?.changes ?? 0) !== 1)) throw new Error("BETTER_AUTH_USER_CREATE_FAILED");
  return userId;
}

export async function deleteBetterAuthUser(env: AuthEnvironment, userId: string): Promise<void> {
  const result = await env.DB.prepare('DELETE FROM "user" WHERE id = ?').bind(userId).run();
  if (!result.success) throw new Error("BETTER_AUTH_USER_DELETE_FAILED");
}

export async function updateBetterAuthUserPassword(
  env: AuthEnvironment,
  userId: string,
  password: string,
  revokeSessions = true,
): Promise<void> {
  const passwordHash = await bcryptHash(password, 12);
  const statements = [
    env.DB.prepare("UPDATE account SET password=?,updatedAt=? WHERE userId=? AND providerId='credential'")
      .bind(passwordHash, Date.now(), userId),
  ];
  if (revokeSessions) statements.push(env.DB.prepare("DELETE FROM session WHERE userId=?").bind(userId));
  const results = await env.DB.batch(statements);
  if (results.some((result) => !result.success) || (results[0]?.meta?.changes ?? 0) !== 1) throw new Error("BETTER_AUTH_PASSWORD_UPDATE_FAILED");
}
