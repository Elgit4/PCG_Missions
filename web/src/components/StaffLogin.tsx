import { CalendarDays, HeartHandshake, LockKeyhole, ShieldCheck, Users } from "lucide-react";

interface StaffLoginProps {
  configurationError?: string;
  accessLifecycleMessage: string;
}

export function StaffLogin({
  configurationError = "",
  accessLifecycleMessage,
}: StaffLoginProps) {
  return (
    <main className="staff-login-page">
      <aside className="staff-login-aside" aria-label="PCG Missions information">
        <div className="staff-login-brand">
          <span className="staff-login-brand-mark"><img src="/logo.svg" alt="" /></span>
          <span className="staff-login-brand-copy"><strong>PCG MISSIONS</strong><small>STAFF WORKSPACE</small></span>
        </div>
        <div className="staff-login-aside-content">
          <p className="staff-login-overline"><span /> A workspace for ministry teams</p>
          <h1>Your ministry work, <em>in one place.</em></h1>
          <p className="staff-login-aside-description">A shared space to coordinate people, care and gatherings with clarity and confidence.</p>
          <div className="staff-login-service-list" aria-label="Workspace areas">
            <div><Users size={18} strokeWidth={1.8} /><span>People &amp; follow-up</span></div>
            <div><HeartHandshake size={18} strokeWidth={1.8} /><span>Pastoral care</span></div>
            <div><CalendarDays size={18} strokeWidth={1.8} /><span>Events &amp; gatherings</span></div>
          </div>
        </div>
        <div className="staff-login-aside-foot"><ShieldCheck size={16} strokeWidth={1.8} /><span>Access is limited to authorised staff accounts.</span></div>
        <div className="staff-login-orbit staff-login-orbit-one" aria-hidden="true" />
        <div className="staff-login-orbit staff-login-orbit-two" aria-hidden="true" />
      </aside>

      <section className="staff-login-main" aria-labelledby="staff-login-title">
        <div className="staff-login-mobile-brand">
          <span className="staff-login-brand-mark"><img src="/logo.svg" alt="" /></span>
          <span className="staff-login-brand-copy"><strong>PCG MISSIONS</strong><small>STAFF WORKSPACE</small></span>
        </div>
        <div className="staff-login-form-wrap">
          <div className="staff-login-security-label"><LockKeyhole size={14} strokeWidth={2} /><span>STAFF PORTAL</span></div>
          <header className="staff-login-heading">
            <p className="staff-login-section-label">SECURE STAFF ACCESS</p>
            <h2 id="staff-login-title">Access setup in progress</h2>
            <p>The staff workspace is being prepared for secure account access.</p>
          </header>
          {configurationError
            ? <p className="staff-login-notice" role="alert">{configurationError}</p>
            : <p className="staff-login-availability"><span /> Browser configuration present</p>}
          <div className="staff-login-notice" role="status">
            <ShieldCheck size={17} aria-hidden="true" />
            <span>{accessLifecycleMessage}</span>
          </div>
          <div className="staff-login-support">
            <span>Need access to the staff workspace?</span>
            <p>Contact an authorised church administrator. Account provisioning, activation, private-PIN setup and recovery must be completed through the approved staff-access process.</p>
          </div>
        </div>
        <footer className="staff-login-footer"><span>PCG Missions</span><i>·</i><span>Powered by ElTech</span></footer>
      </section>
    </main>
  );
}
