import { useCallback, useEffect, useMemo, useState } from "react";
import { StaffLogin, type StaffAuthView } from "./components/StaffLogin";
import { StaffWorkspace } from "./components/StaffWorkspace";
import { AuthClientError, PcgAuthClient } from "./lib/auth";
import { CmiApiClient, CmiApiError, type StaffSession } from "./lib/cmi-api";
import { ThemeToggle } from "./lib/theme";

export default function App() {
  const apiUrl = import.meta.env.VITE_CMI_API_URL ?? "";
  const configurationError = "";

  const auth = useMemo(() => new PcgAuthClient(), []);

  const api = useMemo(() => new CmiApiClient(
    { apiUrl },
    () => auth.getAccessToken(),
  ), [auth, apiUrl]);

  const [view, setView] = useState<StaffAuthView>("sign-in");
  const [staffSession, setStaffSession] = useState<StaffSession | null>(null);
  const [busy, setBusy] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [workspaceRetryAvailable, setWorkspaceRetryAvailable] = useState(false);

  const messageFor = useCallback((cause: unknown): string => {
    if (cause instanceof AuthClientError) return cause.message;
    if (cause instanceof CmiApiError) {
      if (cause.status === 401) return "Your sign-in session has expired. Please sign in again.";
      if (cause.code === "STAFF_PROFILE_NOT_FOUND") return "This email is not provisioned as a PCG Missions staff account. Contact an authorised church administrator.";
      if (cause.code === "STAFF_ACCOUNT_NOT_ACTIVE") return "This staff account is not active. Contact an authorised church administrator.";
      if (cause.code === "PASSWORD_SETUP_EXPIRED") return "The temporary setup password has expired. Use Forgot password to request a new administrator-approved recovery link.";
      if (cause.status === 403) return "Your account cannot access the staff workspace. Contact an authorised church administrator.";
      if (cause.code === "NO_ACTIVE_BRANCH") return "Your account is active, but it has no active branch assignment. Contact an authorised church administrator.";
      if (cause.status === 0) return cause.message;
      if (cause.status === 501) return cause.message;
      if (cause.status >= 500) return "Your credentials were accepted, but the staff workspace service could not complete the request. Retry the workspace connection.";
    }
    return "We could not complete that request. Please try again.";
  }, []);

  const clearAuthentication = useCallback(async () => {
    try {
      await auth?.signOut();
    } catch {
      // Authentication state is cleared locally even if browser storage or
      // the optional server-side global sign-out request is unavailable.
    } finally {
      setStaffSession(null);
      setView("sign-in");
      setNotice("");
      setWorkspaceRetryAvailable(false);
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
      throw new CmiApiError(403, "NO_ACTIVE_BRANCH", "Your account has no active branch assignment. Contact an administrator.", null);
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
        } else if (cause instanceof CmiApiError) {
          setWorkspaceRetryAvailable(true);
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
    setNotice("Checking your staff credentials…");
    setWorkspaceRetryAvailable(false);
    try {
      await auth.signIn(email, password);
      setNotice("Credentials accepted. Connecting to your ministry workspace…");
      await loadStaffSession();
      setWorkspaceRetryAvailable(false);
    } catch (cause) {
      setNotice("");
      if (cause instanceof CmiApiError && cause.status !== 401) {
        // Preserve the valid Auth session. A temporary workspace/API failure
        // must not force the administrator to authenticate again.
        setWorkspaceRetryAvailable(true);
      } else {
        await clearAuthentication();
      }
      setError(messageFor(cause));
    } finally {
      setBusy(false);
      setNotice("");
    }
  };

  const handleRetryWorkspace = async () => {
    if (!auth) return;
    setBusy(true);
    setError("");
    setNotice("Retrying your staff workspace connection…");
    try {
      const session = await auth.getSession();
      if (!session) {
        await clearAuthentication();
        setError("Your sign-in session is no longer available. Please sign in again.");
        return;
      }
      await loadStaffSession();
      setWorkspaceRetryAvailable(false);
    } catch (cause) {
      setNotice("");
      if (cause instanceof CmiApiError && cause.status === 401) {
        await clearAuthentication();
      } else {
        setWorkspaceRetryAvailable(true);
      }
      setError(messageFor(cause));
    } finally {
      setBusy(false);
      setNotice("");
    }
  };

  const handleConnectionTest = async () => {
    if (!auth) {
      setError(configurationError || "The sign-in service is not configured.");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      setNotice(await auth.testConnection());
    } catch (cause) {
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
      setNotice("If this address belongs to an active staff account, the church administrators have been notified. If approved, the administrator will email you a temporary password that you must replace after signing in.");
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

  const handleChangePassword = async (currentPassword: string, newPassword: string) => {
    if (!auth) throw new AuthClientError(503, "AUTH_NOT_CONFIGURED", "The secure authentication service is unavailable.");
    await auth.changePassword(currentPassword, newPassword);
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
        <div className="cmi-loading-brand">
          <div className="cmi-loading-mark"><img src="/logo.svg" alt="" /></div>
          <span className="cmi-loading-name">PCG MISSIONS</span>
          <span className="cmi-loading-caption">PEOPLE · CARE · COMMUNITY</span>
          <span className="cmi-auth-spinner" aria-hidden="true" />
        </div>
        <p className="cmi-loading-message">Preparing your ministry workspace</p>
      </main>
    );
  }

  if (staffSession && !staffSession.must_change_password && api) {
    return <StaffWorkspace api={api} session={staffSession} onSignOut={async () => await signOut()} onChangePassword={handleChangePassword} />;
  }

  return (
    <StaffLogin
      view={view}
      themeToggle={<ThemeToggle />}
      configurationError={configurationError}
      error={error}
      notice={notice}
      busy={busy}
      onViewChange={(nextView) => {
        setError("");
        setNotice("");
        setWorkspaceRetryAvailable(false);
        setView(nextView);
      }}
      onSignIn={handleSignIn}
      onRetryWorkspace={workspaceRetryAvailable ? handleRetryWorkspace : undefined}
      onRequestReset={handleResetRequest}
      onSetPassword={handleSetPassword}
      onTestConnection={handleConnectionTest}
    />
  );
}
