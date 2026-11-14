import { betterAuth } from "better-auth";
import { compare as bcryptCompare, hash as bcryptHash } from "bcryptjs";

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
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
}

export interface TransactionalEmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export async function sendResendEmail(
  env: Pick<AuthEnvironment,"RESEND_API_KEY"|"EMAIL_FROM">,
  message: TransactionalEmailMessage,
): Promise<void> {
  if(!env.RESEND_API_KEY||!env.EMAIL_FROM) throw new Error("PASSWORD_RESET_DELIVERY_NOT_CONFIGURED");
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(message.to)||message.subject.length>180||
     message.text.length>12000||message.html.length>24000) throw new Error("TRANSACTIONAL_EMAIL_INVALID");
  const response=await fetch("https://api.resend.com/emails",{
    method:"POST",
    headers:{
      Authorization:"Bearer "+env.RESEND_API_KEY,
      "Content-Type":"application/json",
    },
    body:JSON.stringify({from:env.EMAIL_FROM,to:[message.to],subject:message.subject,text:message.text,html:message.html}),
  });
  if(!response.ok) throw new Error("TRANSACTIONAL_EMAIL_PROVIDER_FAILED");
  const result=await response.json() as {id?:unknown};
  if(typeof result.id!=="string"||!result.id) throw new Error("TRANSACTIONAL_EMAIL_PROVIDER_INVALID_RESPONSE");
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
export function createAuth(env: AuthEnvironment, allowInvitationSignUp = false) {
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
              SELECT sp.id
              FROM staff_profile sp
              WHERE sp.auth_user_id = ?
                AND sp.account_status = 'active'
                AND EXISTS (
                  SELECT 1
                  FROM staff_role_assignment sra
                  JOIN role r ON r.id = sra.role_id AND r.is_active = 1
                  JOIN branch b ON b.id = sra.branch_id AND b.is_active = 1
                  WHERE sra.staff_profile_id = sp.id
                    AND sra.revoked_at IS NULL
                    AND sra.starts_at <= strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
                    AND (sra.ends_at IS NULL OR sra.ends_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
                )
              LIMIT 1
            `).bind(session.userId).first<{ id: string }>();
            if (!staff) return false;
            return { data: session };
          },
        },
      },
    },
    emailAndPassword: {
      enabled: true,
      disableSignUp: !allowInvitationSignUp,
      autoSignIn: false,
      requireEmailVerification: false,
      password: {
        // Supabase GoTrue stores email passwords as bcrypt hashes ($2a$).
        // Keep bcrypt for migrated credentials; Better Auth verifies the same
        // hashes and newly changed passwords remain compatible with this verifier.
        hash: async (password) => bcryptHash(password, 12),
        verify: async ({ password, hash }) => {
          if (!/^\\$2[aby]\\$\\d{2}\\$/.test(hash)) return false;
          const compatibleHash = hash.startsWith("$2y$") ? "$2b$" + hash.slice(4) : hash;
          return bcryptCompare(password, compatibleHash);
        },
      },
      sendResetPassword: async ({ user, url }) => {
        const safeUrl=url.replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
        await sendResendEmail(env,{
          to:user.email,
          subject:"Reset your PCG Missions password",
          text:"A password reset was requested for your PCG Missions account. Use this link to set a new password: "+url+"\n\nIf you did not request this, ignore this message.",
          html:"<p>A password reset was requested for your PCG Missions account.</p><p><a href=\""+safeUrl+"\">Reset your password</a></p><p>If you did not request this, ignore this message.</p>",
        });
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
