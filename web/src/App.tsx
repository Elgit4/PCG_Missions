import { StaffLogin } from "./components/StaffLogin";

export default function App() {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? "";
  const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "";

  const configurationError = !supabaseUrl || !publishableKey
    ? "This portal is not connected to its required service configuration. Staff access remains unavailable. Contact a church administrator."
    : "";

  const accessLifecycleMessage = "The approved Supabase Auth flow must support staff account activation, private-PIN setup and account recovery before this portal can accept credentials. This page does not collect or transmit sign-in details.";

  return (
    <StaffLogin
      configurationError={configurationError}
      accessLifecycleMessage={accessLifecycleMessage}
    />
  );
}
