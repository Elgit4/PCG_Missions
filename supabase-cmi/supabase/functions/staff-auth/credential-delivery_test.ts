import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  canSendPasswordResetNotification,
  manualCredentialHandoff,
} from "./credential-delivery.ts";

Deno.test("email success never returns a temporary credential to the administrator", () => {
  assertEquals(manualCredentialHandoff(true, "temporary-secret"), {});
});

Deno.test("email failure returns a one-time manual handoff credential", () => {
  assertEquals(
    manualCredentialHandoff(false, "temporary-secret"),
    {
      manual_handoff_required: true,
      temporary_password: "temporary-secret",
    },
  );
});

Deno.test("password reset notification requires a verified sender and recipient", () => {
  assertEquals(
    canSendPasswordResetNotification({
      apiKey: "resend-key",
      from: "onboarding@resend.dev",
      appUrl: "https://pcg-missions.vercel.app",
      recipients: ["admin@example.com"],
    }),
    true,
  );
  assertEquals(
    canSendPasswordResetNotification({
      apiKey: "",
      from: "onboarding@resend.dev",
      appUrl: "https://pcg-missions.vercel.app",
      recipients: ["admin@example.com"],
    }),
    false,
  );
  assertEquals(
    canSendPasswordResetNotification({
      apiKey: "resend-key",
      from: "onboarding@resend.dev",
      appUrl: "https://pcg-missions.vercel.app",
      recipients: [],
    }),
    false,
  );
  assertEquals(
    canSendPasswordResetNotification({
      apiKey: "resend-key",
      from: "onboarding@resend.dev",
      appUrl: "http://localhost:5173",
      recipients: ["admin@example.com"],
    }),
    false,
  );
});
