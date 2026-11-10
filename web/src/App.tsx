import { useEffect, useMemo, useState } from "react";
import { StaffLogin } from "./components/StaffLogin";
import { StaffWorkspace } from "./components/StaffWorkspace";
import { SupabaseAuthClient, SupabaseAuthError } from "./lib/auth";
import { CmiApiClient, CmiApiError, type StaffSession } from "./lib/cmi-api";

function safeAuthMessage(error: unknown): string {
  if (error instanceof SupabaseAuthError) return error.message;
  if (error instanceof CmiApiError) {
    if (error.status === 403) return "This account is not provisioned as an active PCG Missions staff member, or it has no active branch assignment.";
    if (error.status === 401) return "Your staff session could not be verified. Check your credentials and try again.";
    return error.message;
  }
  return "Unable to sign in. Please try again.";
}

export default function App() {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? "";
  const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "";
  const configurationError = !supabaseUrl || !publishableKey
    ? "Staff sign-in is unavailable because VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY are not configured for this deployment."
    : "";
  const auth = useMemo(() => configurationError ? null : new SupabaseAuthClient({ supabaseUrl, publishableKey }),
    [supabaseUrl, publishableKey, configurationError]);
  const api = useMemo(() => auth && !configurationError
    ? new CmiApiClient({ supabaseUrl, publishableKey }, () => auth.getAccessToken())
    : null, [auth, supabaseUrl, publishableKey, configurationError]);

  const [session, setSession] = useState<StaffSession | null>(null);
  const [initialising, setInitialising] = useState(true);
  const [busy, setBusy] = useState(false);
  const [loginError, setLoginError] = useState("");

  useEffect(() => {
    let mounted = true;
    const restore = async () => {
      if (!auth || !api) { if (mounted) setInitialising(false); return; }
      try {
        if (await auth.restoreSession()) {
          const result = await api.getStaffSession();
          if (mounted) setSession(result.data);
        }
      } catch {
        await auth.signOut();
      } finally {
        if (mounted) setInitialising(false);
      }
    };
    void restore();
    return () => { mounted = false; };
  }, [auth, api]);

  const signIn = async (email: string, pin: string) => {
    if (!auth || !api) return;
    setBusy(true); setLoginError("");
    try {
      await auth.signInWithPin(email, pin);
      const result = await api.getStaffSession();
      if (result.data.staff.account_status !== "active" || result.data.branches.length === 0) {
        throw new Error("STAFF_ACCESS_NOT_ACTIVE");
      }
      setSession(result.data);
    } catch (error) {
      await auth.signOut();
      setSession(null);
      setLoginError(error instanceof Error && error.message === "STAFF_ACCESS_NOT_ACTIVE"
        ? "Your account does not have an active branch assignment. Contact your church administrator."
        : safeAuthMessage(error));
    } finally { setBusy(false); }
  };

  const signOut = async () => {
    if (auth) await auth.signOut();
    setSession(null);
    setLoginError("");
  };

  if (initialising) return <main className="cmi-app-loading" role="status"><span className="cmi-spinner" />Checking your staff session…</main>;
  if (session && api) return <StaffWorkspace api={api} session={session} onSignOut={signOut} />;
  return <StaffLogin onSignIn={signIn} busy={busy} error={loginError} configurationError={configurationError} />;
}
