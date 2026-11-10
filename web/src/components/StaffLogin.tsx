import { useState, type FormEvent } from "react";
import { ArrowRight, CalendarDays, Eye, EyeOff, HeartHandshake, LockKeyhole, Mail, ShieldCheck, Users } from "lucide-react";

interface StaffLoginProps {
  onSignIn: (email: string, pin: string) => Promise<void>;
  busy?: boolean;
  error?: string;
  configurationError?: string;
}
export function StaffLogin({ onSignIn, busy = false, error = "", configurationError = "" }: StaffLoginProps) {
  const [showPin, setShowPin] = useState(false);
  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const values = new FormData(formElement);
    await onSignIn(String(values.get("email") ?? "").trim(), String(values.get("pin") ?? ""));
    formElement.reset();
    setShowPin(false);
  };
  return (
    <main className="staff-login-page">
      <aside className="staff-login-aside" aria-label="PCG Missions information">
        <div className="staff-login-brand"><span className="staff-login-brand-mark"><img src="/logo.svg" alt="" /></span><span className="staff-login-brand-copy"><strong>PCG MISSIONS</strong><small>STAFF WORKSPACE</small></span></div>
        <div className="staff-login-aside-content"><p className="staff-login-overline"><span /> A workspace for ministry teams</p><h1>Your ministry work, <em>in one place.</em></h1>
          <p className="staff-login-aside-description">A shared space to coordinate people, care and gatherings with clarity and confidence.</p>
          <div className="staff-login-service-list" aria-label="Workspace areas"><div><Users size={18} /><span>People &amp; follow-up</span></div><div><HeartHandshake size={18} /><span>Pastoral care</span></div><div><CalendarDays size={18} /><span>Events &amp; gatherings</span></div></div>
        </div>
        <div className="staff-login-aside-foot"><ShieldCheck size={16} /><span>Access is limited to authorised staff accounts.</span></div>
        <div className="staff-login-orbit staff-login-orbit-one" aria-hidden="true" /><div className="staff-login-orbit staff-login-orbit-two" aria-hidden="true" />
      </aside>
      <section className="staff-login-main" aria-labelledby="staff-login-title">
        <div className="staff-login-mobile-brand"><span className="staff-login-brand-mark"><img src="/logo.svg" alt="" /></span><span className="staff-login-brand-copy"><strong>PCG MISSIONS</strong><small>STAFF WORKSPACE</small></span></div>
        <div className="staff-login-form-wrap">
          <div className="staff-login-security-label"><LockKeyhole size={14} /><span>STAFF PORTAL</span></div>
          <header className="staff-login-heading"><p className="staff-login-section-label">STAFF SIGN IN</p><h2 id="staff-login-title">Welcome back</h2><p>Use the email address and private PIN linked to your staff account.</p></header>
          {configurationError ? <p className="staff-login-notice" role="alert">{configurationError}</p> : <p className="staff-login-availability"><span /> Secure sign-in through Supabase Auth</p>}
          <form className="staff-login-form" onSubmit={handleSubmit}>
            <label className="staff-login-field-label" htmlFor="staff-email">Email address</label>
            <div className="staff-login-input-wrap"><Mail size={18} aria-hidden="true" /><input id="staff-email" name="email" type="email" autoComplete="username" placeholder="name@example.com" required disabled={busy || !!configurationError} /></div>
            <div className="staff-login-password-label-row"><label className="staff-login-field-label" htmlFor="staff-pin">Private PIN</label><span className="staff-login-text-muted">Never share your PIN</span></div>
            <div className="staff-login-input-wrap staff-login-password-wrap"><LockKeyhole size={18} aria-hidden="true" /><input id="staff-pin" name="pin" type={showPin ? "text" : "password"} autoComplete="current-password" inputMode="numeric" placeholder="Enter your private PIN" required disabled={busy || !!configurationError} />
              <button className="staff-login-password-toggle" type="button" onClick={() => setShowPin((visible) => !visible)} aria-label={showPin ? "Hide PIN" : "Show PIN"} aria-pressed={showPin} disabled={busy}>{showPin ? <EyeOff size={18} /> : <Eye size={18} />}</button>
            </div>
            {error && <p className="staff-login-notice" role="alert">{error}</p>}
            <button className="staff-login-submit" type="submit" disabled={busy || !!configurationError}><span>{busy ? "Signing in…" : "Sign in"}</span><ArrowRight size={18} /></button>
          </form>
          <div className="staff-login-support"><span>Need access or PIN recovery?</span><p>Contact your authorised church administrator. Account activation and PIN recovery are not yet implemented in the staff-access backend.</p></div>
        </div>
        <footer className="staff-login-footer"><span>PCG Missions</span><i>·</i><span>Powered by ElTech</span></footer>
      </section>
    </main>
  );
}
