import { useCallback, useEffect, useMemo, useState } from "react";
import { StaffLogin, type StaffAuthView } from "./components/StaffLogin";
import { StaffWorkspace } from "./components/StaffWorkspace";
import { AuthClientError, PcgAuthClient } from "./lib/auth";
import { CmiApiClient, CmiApiError, type StaffSession } from "./lib/cmi-api";

export default function App() {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? "";
  const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "";
  const configurationError = !supabaseUrl || !publishableKey
    ? "This portal is not connected to its secure sign-in service. Contact a church administrator."
    : "";

  const auth = useMemo(() => {
    if (!supabaseUrl || !publishableKey) return null;
    try {
      return new PcgAuthClient(supabaseUrl, publishableKey);
    } catch {
      return null;
    }
  }, [supabaseUrl, publishableKey]);

  const api = useMemo(() => auth
    ? new CmiApiClient(
      { supabaseUrl, publishableKey },
      () => auth.getAccessToken(),
    )
    : null, [auth, supabaseUrl, publishableKey]);

  const [view, setView] = useState<StaffAuthView>("sign-in");
  const [staffSession, setStaffSession] = useState<StaffSession | null>(null);
  const [busy, setBusy] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const messageFor = useCallback((cause: unknown): string => {
    if (cause instanceof AuthClientError) return cause.message;
    if (cause instanceof CmiApiError) {
      if (cause.status === 401) return "Your sign-in session has expired. Please sign in again.";
      if (cause.code === "STAFF_PROFILE_NOT_FOUND") return "This email is not provisioned as a PCG Missions staff account. Contact an authorised church administrator.";
      if (cause.code === "STAFF_ACCOUNT_NOT_ACTIVE") return "This staff account is not active. Contact an authorised church administrator.";
      if (cause.code === "PASSWORD_SETUP_EXPIRED") return "The temporary setup password has expired. Use Forgot password to request a new administrator-approved recovery link.";
      if (cause.status === 403) return "Your account cannot access the staff workspace. Contact an authorised church administrator.";
      if (cause.status === 0) return cause.message;
    }
    return "We could not complete that request. Please try again.";
  }, []);

  const clearAuthentication = useCallback(async () => {
    try {
      await auth?.signOut();
    } finally {
      setStaffSession(null);
      setView("sign-in");
      setNotice("");
    }
  }, [auth]);

  const loadStaffSession = useCallback(async () => {
    if (!api) throw new Error("The staff API is not configured.");
    const result = await api.getStaffSession();
    const next = result.data;
    if (next.must_change_password) {
      setStaffSession(next);
      setView("change-password");
      setNotice("");
      return;
    }
    if (!next.branches.length) {
      setStaffSession(null);
      throw new CmiApiError(403, "NO_ACTIVE_BRANCH", "Your account has no active branch assignment. Contact an administrator.");
    }
    setStaffSession(next);
    setView("sign-in");
    setError("");
    setNotice("");
  }, [api]);

  useEffect(() => {
    let current = true;
    const initialize = async () => {
      try {
        if (!auth || !api) {
          if (current) setError(configurationError);
          return;
        }
        const recovery = await auth.restoreRecoveryFromUrl();
        if (!current) return;
        if (recovery) {
          setView("recovery");
          setNotice("Your recovery link is ready. Choose a new password to finish resetting your account.");
          return;
        }
        const session = await auth.getSession();
        if (!session) return;
        await loadStaffSession();
      } catch (cause) {
        if (!current) return;
        setError(messageFor(cause));
        if (cause instanceof CmiApiError && cause.status === 401) {
          await clearAuthentication();
        }
      } finally {
        if (current) setInitializing(false);
      }
    };
    void initialize();
    return () => { current = false; };
  }, [auth, api, configurationError, loadStaffSession, messageFor, clearAuthentication]);

  const handleSignIn = async (email: string, password: string) => {
    if (!auth) {
      setError(configurationError || "The sign-in service is not configured.");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await auth.signIn(email, password);
      await loadStaffSession();
    } catch (cause) {
      await clearAuthentication();
      setError(messageFor(cause));
    } finally {
      setBusy(false);
    }
  };

  const handleResetRequest = async (email: string) => {
    if (!auth) {
      setError(configurationError || "The sign-in service is not configured.");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await auth.requestPasswordReset(email);
      setNotice("If this address belongs to an active staff account, the church administrators have been notified. You will receive a recovery link after they approve the request.");
    } catch (cause) {
      setError(messageFor(cause));
    } finally {
      setBusy(false);
    }
  };

  const handleSetPassword = async (password: string) => {
    if (!auth || !api) {
      setError(configurationError || "The sign-in service is not configured.");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await auth.completePasswordChange(password);
      await loadStaffSession();
    } catch (cause) {
      setError(messageFor(cause));
      // A password update can succeed before the completion transaction is
      // confirmed. Keep this screen open so the user can safely retry.
    } finally {
      setBusy(false);
    }
  };

  const signOut = async () => {
    setBusy(true);
    await clearAuthentication();
    setError("");
    setBusy(false);
  };

  if (initializing) {
    return (
      <main className="cmi-auth-loading" role="status" aria-live="polite">
        <span className="cmi-auth-spinner" aria-hidden="true" />
        <p>Securing your workspace…</p>
      </main>
    );
  }

  if (staffSession && !staffSession.must_change_password && api) {
    return <StaffWorkspace api={api} session={staffSession} onSignOut={async () => await signOut()} />;
  }

  return (
    <StaffLogin
      view={view}
      configurationError={configurationError}
      error={error}
      notice={notice}
      busy={busy}
      onViewChange={(nextView) => {
        setError("");
        setNotice("");
        setView(nextView);
      }}
      onSignIn={handleSignIn}
      onRequestReset={handleResetRequest}
      onSetPassword={handleSetPassword}
    />
  );
}
