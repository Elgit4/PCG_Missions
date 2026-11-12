import { useEffect, useState, type FormEvent } from "react";
import {
  ArrowLeft,
  CalendarDays,
  Eye,
  EyeOff,
  HeartHandshake,
  KeyRound,
  LockKeyhole,
  ShieldCheck,
  Users,
} from "lucide-react";

export type StaffAuthView = "sign-in" | "forgot-password" | "recovery" | "change-password";

interface StaffLoginProps {
  view: StaffAuthView;
  configurationError?: string;
  error?: string;
  notice?: string;
  busy?: boolean;
  onViewChange: (view: StaffAuthView) => void;
  onSignIn: (email: string, password: string) => Promise<void>;
  onRequestReset: (email: string) => Promise<void>;
  onSetPassword: (password: string) => Promise<void>;
}

export function StaffLogin({
  view,
  configurationError = "",
  error = "",
  notice = "",
  busy = false,
  onViewChange,
  onSignIn,
  onRequestReset,
  onSetPassword,
}: StaffLoginProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [localError, setLocalError] = useState("");

  useEffect(() => {
    setPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setShowPassword(false);
    setLocalError("");
  }, [view]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLocalError("");
    if (view === "sign-in") {
      if (!email.trim() || !password) {
        setLocalError("Enter your staff email and password.");
        return;
      }
      await onSignIn(email, password);
      return;
    }
    if (view === "forgot-password") {
      if (!email.trim()) {
        setLocalError("Enter the email address on your staff account.");
        return;
      }
      await onRequestReset(email);
      return;
    }
    if (newPassword.length < 12) {
      setLocalError("Use at least 12 characters for your new password.");
      return;
    }
    if (
      !/[a-z]/.test(newPassword) ||
      !/[A-Z]/.test(newPassword) ||
      !/[0-9]/.test(newPassword) ||
      !/[^A-Za-z0-9]/.test(newPassword)
    ) {
      setLocalError("Use uppercase and lowercase letters, a number and a symbol.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setLocalError("The passwords do not match.");
      return;
    }
    await onSetPassword(newPassword);
  };

  const isPasswordSetup = view === "recovery" || view === "change-password";
  const title = view === "sign-in"
    ? "Welcome back."
    : view === "forgot-password"
    ? "Get back into your account."
    : view === "recovery"
    ? "Choose a new password."
    : "Secure your administrator account.";
  const description = view === "sign-in"
    ? "Sign in to continue to your ministry workspace."
    : view === "forgot-password"
    ? "Submit your staff email. An authorised Admin/Pastor reviews the request before a temporary password is issued."
    : view === "recovery"
    ? "Your reset request has been approved. Choose a new password only you know."
    : "Your temporary setup password has served its purpose. Replace it with your private password to unlock the workspace.";

  return (
    <main className="staff-login-page">
      <aside className="staff-login-aside" aria-label="PCG Missions information">
        <div className="staff-login-brand">
          <span className="staff-login-brand-mark"><img src="/logo.svg" alt="" /></span>
          <span className="staff-login-brand-copy"><strong>PCG MISSIONS</strong><small>STAFF WORKSPACE</small></span>
        </div>
        <div className="staff-login-aside-content">
          <p className="staff-login-overline"><span aria-hidden="true" /> PEOPLE · CARE · COMMUNITY</p>
          <h1>Good ministry work starts with <em>connection.</em></h1>
          <p className="staff-login-aside-description">
            Keep the people, care and gatherings behind every ministry moment in one considered workspace.
          </p>
          <div className="staff-login-service-list" aria-label="Workspace areas">
            <div><Users size={18} strokeWidth={1.8} /><span>People &amp; follow-up</span><small>01</small></div>
            <div><HeartHandshake size={18} strokeWidth={1.8} /><span>Pastoral care</span><small>02</small></div>
            <div><CalendarDays size={18} strokeWidth={1.8} /><span>Events &amp; gatherings</span><small>03</small></div>
          </div>
        </div>
        <div className="staff-login-aside-foot">
          <ShieldCheck size={16} strokeWidth={1.8} />
          <span>Built for accountable, people-first ministry.</span>
        </div>
        <div className="staff-login-orbit staff-login-orbit-one" aria-hidden="true" />
        <div className="staff-login-orbit staff-login-orbit-two" aria-hidden="true" />
      </aside>

      <section className="staff-login-main" aria-labelledby="staff-login-title">
        <div className="staff-login-mobile-brand">
          <span className="staff-login-brand-mark"><img src="/logo.svg" alt="" /></span>
          <span className="staff-login-brand-copy"><strong>PCG MISSIONS</strong><small>STAFF WORKSPACE</small></span>
        </div>

        <div className="staff-login-form-wrap staff-login-auth-wrap">
          <div className="staff-login-security-label">
            <LockKeyhole size={15} strokeWidth={2} />
            <span>SECURE STAFF PORTAL</span>
            <i>{isPasswordSetup ? "ACCOUNT SECURITY" : "STAFF ACCESS"}</i>
          </div>

          <header className="staff-login-heading">
            <p className="staff-login-section-label">
              {view === "sign-in" ? "SIGN IN" : view === "forgot-password" ? "ACCOUNT RECOVERY" : "PASSWORD SECURITY"}
            </p>
            <h2 id="staff-login-title">{title}</h2>
            <p>{description}</p>
          </header>

          {(configurationError || error || localError) && (
            <div className="staff-login-config-error" role="alert">
              <ShieldCheck size={18} aria-hidden="true" />
              <span>{configurationError || localError || error}</span>
            </div>
          )}
          {notice && <div className="staff-login-auth-notice" role="status">{notice}</div>}

          <form className="staff-login-auth-form" onSubmit={(event) => void submit(event)}>
            {view !== "change-password" && view !== "recovery" && (
              <label className="staff-login-auth-field">
                <span>Staff email address</span>
                <input
                  type="email"
                  name="email"
                  autoComplete="username"
                  inputMode="email"
                  maxLength={254}
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                  required
                  disabled={busy || !!configurationError}
                />
              </label>
            )}

            {view === "sign-in" && (
              <label className="staff-login-auth-field">
                <span>Password</span>
                <div className="staff-login-password-field">
                  <input
                    type={showPassword ? "text" : "password"}
                    name="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Enter your password"
                    required
                    disabled={busy || !!configurationError}
                  />
                  <button
                    type="button"
                    className="staff-login-password-toggle"
                    onClick={() => setShowPassword((value) => !value)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>
              </label>
            )}

            {isPasswordSetup && (
              <>
                <label className="staff-login-auth-field">
                  <span>New password</span>
                  <input
                    type={showPassword ? "text" : "password"}
                    name="new-password"
                    autoComplete="new-password"
                    minLength={12}
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    placeholder="Create a strong password"
                    required
                    disabled={busy}
                  />
                </label>
                <label className="staff-login-auth-field">
                  <span>Confirm new password</span>
                  <input
                    type={showPassword ? "text" : "password"}
                    name="confirm-password"
                    autoComplete="new-password"
                    minLength={12}
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    placeholder="Enter the password again"
                    required
                    disabled={busy}
                  />
                </label>
                <p className="staff-login-password-hint">
                  Use 12 or more characters, including uppercase and lowercase letters, a number and a symbol.
                </p>
                <button
                  type="button"
                  className="staff-login-inline-link staff-login-show-password"
                  onClick={() => setShowPassword((value) => !value)}
                >
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  {showPassword ? "Hide passwords" : "Show passwords"}
                </button>
              </>
            )}

            <button
              type="submit"
              className="staff-login-submit"
              disabled={busy || !!configurationError}
            >
              {busy
                ? "Please wait…"
                : view === "sign-in"
                ? "Sign in"
                : view === "forgot-password"
                ? "Send reset request"
                : "Save new password"}
            </button>
          </form>

          <div className="staff-login-auth-bottom">
            {view === "sign-in" && (
              <button type="button" className="staff-login-inline-link" onClick={() => {
                setLocalError("");
                onViewChange("forgot-password");
              }}>
                Forgot password?
              </button>
            )}
            {view !== "sign-in" && view !== "change-password" && (
              <button type="button" className="staff-login-inline-link" onClick={() => {
                setLocalError("");
                onViewChange("sign-in");
              }}>
                <ArrowLeft size={15} /> Back to sign in
              </button>
            )}
            {view === "change-password" && (
              <span className="staff-login-security-reminder">
                <KeyRound size={14} /> Your administrator cannot see your new password.
              </span>
            )}
          </div>

          <div className="staff-login-support">
            <span>{view === "sign-in" ? "First administrator access?" : "Need help accessing the portal?"}</span>
            <p>{view === "sign-in" ? "The first Admin/Pastor receives a one-time temporary password after secure setup. Regular staff access is issued by an authorised administrator." : "Password reset requests are reviewed and recorded by an authorised church administrator before a temporary password is issued."}</p>
          </div>
        </div>

        <footer className="staff-login-footer">
          <span>PCG Missions</span><i aria-hidden="true">·</i><span>Powered by ElTech</span>
        </footer>
      </section>
    </main>
  );
}
