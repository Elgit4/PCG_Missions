import { betterAuth } from "better-auth";

export interface AuthDatabase {
  prepare(sql: string): {
    bind(...values: unknown[]): {
      first<T = Record<string, unknown>>(): Promise<T | null>;
    };
  };
}

export interface AuthEnvironment {
  DB: AuthDatabase;
  BETTER_AUTH_SECRET?: string;
  BETTER_AUTH_URL?: string;
  BETTER_AUTH_TRUSTED_ORIGINS?: string;
}

function trustedOrigins(env: AuthEnvironment, baseUrl: URL): string[] {
  const configured = (env.BETTER_AUTH_TRUSTED_ORIGINS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  const origins = new Set([baseUrl.origin]);
  for (const value of configured) {
    const parsed = new URL(value);
    if (parsed.origin !== value.replace(/\/$/, "")) {
      throw new Error("AUTH_TRUSTED_ORIGIN_MUST_BE_AN_ORIGIN");
    }
    origins.add(parsed.origin);
  }
  return [...origins];
}

/**
 * Create the auth instance inside the request lifecycle so the D1 binding is
 * obtained from the current Worker environment, never from process.env.
 */
export function createAuth(env: AuthEnvironment) {
  if (!env.BETTER_AUTH_SECRET || env.BETTER_AUTH_SECRET.length < 32) {
    throw new Error("BETTER_AUTH_SECRET_MISSING_OR_TOO_SHORT");
  }
  if (!env.BETTER_AUTH_URL) {
    throw new Error("BETTER_AUTH_URL_NOT_CONFIGURED");
  }

  const baseUrl = new URL(env.BETTER_AUTH_URL);
  if (baseUrl.protocol !== "https:" && baseUrl.hostname !== "localhost") {
    throw new Error("BETTER_AUTH_URL_MUST_USE_HTTPS");
  }

  const secureCookies = baseUrl.protocol === "https:";

  return betterAuth({
    appName: "PCG Missions",
    baseURL: baseUrl.origin,
    basePath: "/api/auth",
    secret: env.BETTER_AUTH_SECRET,
    database: env.DB as never,
    trustedOrigins: trustedOrigins(env, baseUrl),
    databaseHooks: {
      session: {
        create: {
          before: async (session) => {
            const staff = await env.DB.prepare(`
              SELECT account_status
              FROM staff_profile
              WHERE auth_user_id = ?
              LIMIT 1
            `).bind(session.userId).first<{ account_status: string }>();
            if (!staff || staff.account_status !== "active") return false;
            return { data: session };
          },
        },
      },
    },
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      requireEmailVerification: false,
      // Email delivery is intentionally not faked. Password reset remains
      // unavailable until a real provider is configured and tested.
      sendResetPassword: async () => {
        throw new Error("PASSWORD_RESET_DELIVERY_NOT_CONFIGURED");
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
      cookieCache: { enabled: false },
    },
    advanced: {
      useSecureCookies: secureCookies,
      defaultCookieAttributes: {
        httpOnly: true,
        secure: secureCookies,
        sameSite: "lax",
        path: "/",
      },
      ipAddress: {
        ipAddressHeaders: ["cf-connecting-ip"],
      },
    },
    rateLimit: {
      enabled: true,
      storage: "database",
      window: 60,
      max: 30,
      customRules: {
        "/sign-in/email": { window: 60, max: 5 },
        "/forget-password": { window: 60, max: 3 },
        "/reset-password": { window: 60, max: 5 },
      },
    },
  });
}
