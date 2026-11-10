import { StaffLogin } from "./components/StaffLogin";

export default function App() {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? "";
  const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "";

  const configurationError = !supabaseUrl || !publishableKey
    ? "This deployment is missing its browser-safe Supabase URL or publishable key."
    : "";

  const accessLifecycleMessage = "Staff sign-in is not enabled yet. The approved Supabase Auth account activation and private-PIN lifecycle must be completed and deployed before this portal can accept credentials. No sign-in details are collected or transmitted.";

  return (
    <StaffLogin
      configurationError={configurationError}
      accessLifecycleMessage={accessLifecycleMessage}
    />
  );
}
