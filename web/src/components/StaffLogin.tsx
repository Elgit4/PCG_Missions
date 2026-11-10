import { useState, type FormEvent } from "react";
import {
  ArrowRight,
  CalendarDays,
  Eye,
  EyeOff,
  HeartHandshake,
  LockKeyhole,
  Mail,
  ShieldCheck,
  Users,
} from "lucide-react";

export function StaffLogin() {
  const [showPassword, setShowPassword] = useState(false);
  const [notice, setNotice] = useState("");

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const passwordInput = event.currentTarget.elements.namedItem("password");
    if (passwordInput instanceof HTMLInputElement) passwordInput.value = "";
    setShowPassword(false);
    setNotice(
      "Staff sign-in is not connected in this build yet. Your credentials have not been sent or saved.",
    );
  };

  const explainPasswordReset = () => {
    setNotice(
      "Password recovery is not connected yet. Please contact your church administrator for account assistance.",
    );
  };

  return (
    <main className="staff-login-page">
      <aside className="staff-login-aside" aria-label="PCG Missions information">
        <div className="staff-login-brand">
          <span className="staff-login-brand-mark">
            <img src="/logo.svg" alt="" />
          </span>
          <span className="staff-login-brand-copy">
            <strong>PCG MISSIONS</strong>
            <small>STAFF WORKSPACE</small>
          </span>
        </div>

        <div className="staff-login-aside-content">
          <p className="staff-login-overline"><span /> A workspace for ministry teams</p>
          <h1>Your ministry work, <em>in one place.</em></h1>
          <p className="staff-login-aside-description">
            A shared space to coordinate people, care and gatherings with clarity
            and confidence.
          </p>

          <div className="staff-login-service-list" aria-label="Workspace areas">
            <div><Users size={18} strokeWidth={1.8} /><span>People &amp; follow-up</span></div>
            <div><HeartHandshake size={18} strokeWidth={1.8} /><span>Pastoral care</span></div>
            <div><CalendarDays size={18} strokeWidth={1.8} /><span>Events &amp; gatherings</span></div>
          </div>
        </div>

        <div className="staff-login-aside-foot">
          <ShieldCheck size={16} strokeWidth={1.8} />
          <span>Access is limited to authorised staff accounts.</span>
        </div>
        <div className="staff-login-orbit staff-login-orbit-one" aria-hidden="true" />
        <div className="staff-login-orbit staff-login-orbit-two" aria-hidden="true" />
      </aside>

      <section className="staff-login-main" aria-labelledby="staff-login-title">
        <div className="staff-login-mobile-brand">
          <span className="staff-login-brand-mark"><img src="/logo.svg" alt="" /></span>
          <span className="staff-login-brand-copy">
            <strong>PCG MISSIONS</strong>
            <small>STAFF WORKSPACE</small>
          </span>
        </div>

        <div className="staff-login-form-wrap">
          <div className="staff-login-security-label">
            <LockKeyhole size={14} strokeWidth={2} />
            <span>STAFF PORTAL</span>
          </div>

          <header className="staff-login-heading">
            <p className="staff-login-section-label">STAFF SIGN IN</p>
            <h2 id="staff-login-title">Welcome back</h2>
            <p>Enter your staff account details to continue.</p>
          </header>
          <p className="staff-login-availability"><span /> Sign-in service is not yet connected in this build.</p>

          <form className="staff-login-form" onSubmit={handleSubmit}>
            <label className="staff-login-field-label" htmlFor="staff-email">Email address</label>
            <div className="staff-login-input-wrap">
              <Mail size={18} strokeWidth={1.8} aria-hidden="true" />
              <input
                id="staff-email"
                name="email"
                type="email"
                autoComplete="username"
                placeholder="name@example.com"
                required
              />
            </div>

            <div className="staff-login-password-label-row">
              <label className="staff-login-field-label" htmlFor="staff-password">Password</label>
              <button className="staff-login-text-button" type="button" onClick={explainPasswordReset}>
                Forgot password?
              </button>
            </div>
            <div className="staff-login-input-wrap staff-login-password-wrap">
              <LockKeyhole size={18} strokeWidth={1.8} aria-hidden="true" />
              <input
                id="staff-password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                placeholder="Enter your password"
                required
              />
              <button
                className="staff-login-password-toggle"
                type="button"
                onClick={() => setShowPassword((visible) => !visible)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-pressed={showPassword}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>

            <button className="staff-login-submit" type="submit">
              <span>Sign in</span>
              <ArrowRight size={18} strokeWidth={2} />
            </button>

            {notice && <p className="staff-login-notice" role="status">{notice}</p>}
          </form>

          <div className="staff-login-support">
            <span>Need access to PCG Missions?</span>
            <p>Contact your church administrator to request or restore your staff account.</p>
          </div>
        </div>

        <footer className="staff-login-footer">
          <span>PCG Missions</span><i>·</i><span>Powered by ElTech</span>
        </footer>
      </section>
    </main>
  );
}
