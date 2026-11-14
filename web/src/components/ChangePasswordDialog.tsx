import { useEffect, useRef, useState, type FormEvent } from "react";
import { Eye, EyeOff, KeyRound, ShieldCheck, X } from "lucide-react";

interface ChangePasswordDialogProps {
  open: boolean;
  busy?: boolean;
  onClose: () => void;
  onSubmit: (currentPassword: string, newPassword: string) => Promise<void>;
}

export function ChangePasswordDialog({ open, busy = false, onClose, onSubmit }: ChangePasswordDialogProps) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPasswords, setShowPasswords] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const dialogRef = useRef<HTMLElement | null>(null);
  const closeRef = useRef(onClose);
  const busyRef = useRef(busy);
  closeRef.current = onClose;
  busyRef.current = busy;

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const dialog = dialogRef.current;
    const focusableElements = () => Array.from(
      dialog?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      ) ?? [],
    );
    dialog?.querySelector<HTMLElement>("[data-autofocus]")?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (!busyRef.current) closeRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const elements = focusableElements();
      if (!elements.length) {
        event.preventDefault();
        dialog?.focus();
        return;
      }
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (event.shiftKey && (document.activeElement === first || !dialog?.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !dialog?.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [open]);

  if (!open) return null;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setNotice("");
    if (newPassword.length < 12 || newPassword.length > 128 ||
        !/[a-z]/.test(newPassword) || !/[A-Z]/.test(newPassword) ||
        !/[0-9]/.test(newPassword) || !/[^A-Za-z0-9]/.test(newPassword)) {
      setError("Use 12–128 characters with uppercase and lowercase letters, a number and a symbol.");
      return;
    }
    if (newPassword === currentPassword) {
      setError("Your new password must be different from your current password.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("The new passwords do not match.");
      return;
    }
    try {
      await onSubmit(currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setNotice("Your password has been changed. Other active sessions have been signed out.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Your password could not be changed. Please try again.");
    }
  };

  const close = () => {
    if (busy) return;
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setError("");
    setNotice("");
    onClose();
  };

  return (
    <div role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}
      style={{ position: "fixed", inset: 0, zIndex: 1000, display: "grid", placeItems: "center", padding: 20, background: "rgba(12, 24, 20, .58)", backdropFilter: "blur(5px)" }}>
      <section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="change-password-title" aria-describedby="change-password-description" tabIndex={-1}
        style={{ width: "min(100%, 460px)", maxHeight: "min(90vh, 720px)", overflowY: "auto", background: "var(--cmi-surface, #fff)", color: "var(--cmi-text, #172b25)", border: "1px solid var(--cmi-border, #dce5df)", borderRadius: 18, padding: 26, boxShadow: "0 24px 80px rgba(0,0,0,.22)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
          <div>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 7, color: "var(--cmi-accent, #267451)", fontSize: 11, fontWeight: 800, letterSpacing: ".1em" }}><KeyRound size={14} /> ACCOUNT SECURITY</span>
            <h2 id="change-password-title" style={{ margin: "10px 0 6px", fontSize: 23 }}>Change your password</h2>
            <p id="change-password-description" style={{ margin: 0, color: "var(--cmi-muted, #6d7d74)", fontSize: 13, lineHeight: 1.55 }}>Choose a new private password for your PCG Missions account. You will remain signed in on this device; other active sessions will be signed out.</p>
          </div>
          <button type="button" onClick={close} disabled={busy} aria-label="Close password dialog"
            style={{ border: 0, background: "transparent", color: "inherit", padding: 6, cursor: busy ? "not-allowed" : "pointer" }}><X size={19} /></button>
        </div>
        {error && <p role="alert" style={{ margin: "18px 0 0", padding: 12, borderRadius: 9, background: "rgba(185, 55, 55, .09)", color: "#b33b3b", fontSize: 13 }}>{error}</p>}
        {notice ? (
          <div role="status" style={{ marginTop: 20, display: "flex", gap: 10, alignItems: "flex-start", color: "var(--cmi-accent, #267451)", fontSize: 14, lineHeight: 1.5 }}>
            <ShieldCheck size={19} /><span>{notice}</span>
          </div>
        ) : (
          <form onSubmit={(event) => void submit(event)} style={{ display: "grid", gap: 14, marginTop: 22 }}>
            <label style={{ display: "grid", gap: 7, fontSize: 13, fontWeight: 650 }}>Current password
              <input data-autofocus autoComplete="current-password" type={showPasswords ? "text" : "password"} value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required disabled={busy} style={{ width: "100%", boxSizing: "border-box", border: "1px solid var(--cmi-border, #ccd8d1)", borderRadius: 9, padding: "12px 13px", background: "var(--cmi-input, transparent)", color: "inherit", font: "inherit" }} />
            </label>
            <label style={{ display: "grid", gap: 7, fontSize: 13, fontWeight: 650 }}>New password
              <input autoComplete="new-password" type={showPasswords ? "text" : "password"} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} minLength={12} maxLength={128} required disabled={busy} style={{ width: "100%", boxSizing: "border-box", border: "1px solid var(--cmi-border, #ccd8d1)", borderRadius: 9, padding: "12px 13px", background: "var(--cmi-input, transparent)", color: "inherit", font: "inherit" }} />
            </label>
            <label style={{ display: "grid", gap: 7, fontSize: 13, fontWeight: 650 }}>Confirm new password
              <input autoComplete="new-password" type={showPasswords ? "text" : "password"} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} minLength={12} maxLength={128} required disabled={busy} style={{ width: "100%", boxSizing: "border-box", border: "1px solid var(--cmi-border, #ccd8d1)", borderRadius: 9, padding: "12px 13px", background: "var(--cmi-input, transparent)", color: "inherit", font: "inherit" }} />
            </label>
            <p style={{ margin: 0, color: "var(--cmi-muted, #6d7d74)", fontSize: 12, lineHeight: 1.5 }}>At least 12 characters, including uppercase and lowercase letters, a number and a symbol.</p>
            <button type="button" aria-pressed={showPasswords} onClick={() => setShowPasswords((value) => !value)} style={{ justifySelf: "start", display: "inline-flex", alignItems: "center", gap: 7, border: 0, padding: 0, background: "transparent", color: "var(--cmi-accent, #267451)", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
              {showPasswords ? <EyeOff size={15} /> : <Eye size={15} />}{showPasswords ? "Hide passwords" : "Show passwords"}
            </button>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 9, marginTop: 5 }}>
              <button type="button" onClick={close} disabled={busy} style={{ border: "1px solid var(--cmi-border, #dce5df)", borderRadius: 9, padding: "11px 15px", background: "transparent", color: "inherit", fontWeight: 650, cursor: "pointer" }}>Cancel</button>
              <button type="submit" disabled={busy} style={{ border: 0, borderRadius: 9, padding: "11px 17px", background: "var(--cmi-accent, #174b39)", color: "white", fontWeight: 750, cursor: busy ? "wait" : "pointer", opacity: busy ? .65 : 1 }}>{busy ? "Updating…" : "Update password"}</button>
            </div>
          </form>
        )}
        {notice && <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 22 }}><button type="button" onClick={close} style={{ border: 0, borderRadius: 9, padding: "11px 17px", background: "var(--cmi-accent, #174b39)", color: "white", fontWeight: 750, cursor: "pointer" }}>Done</button></div>}
      </section>
    </div>
  );
}
