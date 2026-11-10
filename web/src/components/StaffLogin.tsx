import { CalendarDays, HeartHandshake, KeyRound, LockKeyhole, ShieldCheck, Users } from "lucide-react";

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

        <div className="staff-login-form-wrap">
          <div className="staff-login-security-label">
            <LockKeyhole size={15} strokeWidth={2} />
            <span>SECURE STAFF PORTAL</span>
            <i>SETUP IN PROGRESS</i>
          </div>

          <header className="staff-login-heading">
            <p className="staff-login-section-label">ACCESS STATUS</p>
            <h2 id="staff-login-title">Your workspace is getting ready.</h2>
            <p>We’re preparing a secure sign-in experience for authorised ministry staff.</p>
          </header>

          {configurationError && (
            <div className="staff-login-config-error" role="alert">
              <ShieldCheck size={18} aria-hidden="true" />
              <span>{configurationError}</span>
            </div>
          )}

          <section className="staff-login-notice staff-login-lifecycle" role="status" aria-labelledby="staff-login-status-title">
            <div className="staff-login-lifecycle-heading">
              <span className="staff-login-lifecycle-icon"><ShieldCheck size={18} aria-hidden="true" /></span>
              <div>
                <strong id="staff-login-status-title">Staff access is not active yet</strong>
                <small>No sign-in details are collected on this page.</small>
              </div>
              <span className="staff-login-lifecycle-state">PENDING</span>
            </div>
            <p className="staff-login-lifecycle-message">{accessLifecycleMessage}</p>
            <ol className="staff-login-steps" aria-label="Access setup requirements">
              <li>
                <span className="staff-login-step-icon"><Users size={16} aria-hidden="true" /></span>
                <span className="staff-login-step-copy"><strong>Staff account</strong><small>Provisioned by a church administrator</small></span>
                <em>Pending</em>
              </li>
              <li>
                <span className="staff-login-step-icon"><KeyRound size={16} aria-hidden="true" /></span>
                <span className="staff-login-step-copy"><strong>Private PIN</strong><small>Set securely by the account holder</small></span>
                <em>Pending</em>
              </li>
              <li>
                <span className="staff-login-step-icon"><LockKeyhole size={16} aria-hidden="true" /></span>
                <span className="staff-login-step-copy"><strong>Account recovery</strong><small>Protected recovery and reset process</small></span>
                <em>Pending</em>
              </li>
            </ol>
          </section>

          <div className="staff-login-support">
            <span>Need staff access?</span>
            <p>Contact your church administrator. They will provision your account when the approved sign-in process is ready.</p>
          </div>
        </div>

        <footer className="staff-login-footer">
          <span>PCG Missions</span><i aria-hidden="true">·</i><span>Powered by ElTech</span>
        </footer>
      </section>
    </main>
  );
}
