import { StaffWorkspace } from "./StaffWorkspace";
import type { StaffSession } from "../lib/cmi-api";
import { DemoCmiApiClient } from "../lib/demo-preview";

interface DemoWorkspaceProps {
  api: DemoCmiApiClient;
  session: StaffSession;
  onExit: () => Promise<void>;
}

export function DemoWorkspace({ api, session, onExit }: DemoWorkspaceProps) {
  return (
    <div className="cmi-demo-root">
      <div className="cmi-demo-banner" role="status">
        <div>
          <strong>DEMO PREVIEW</strong>
          <span>Fictional sample data only · changes stay in this browser session · no real church records are accessed</span>
        </div>
        <button type="button" onClick={() => void onExit()}>Exit demo</button>
      </div>
      <StaffWorkspace api={api} session={session} onSignOut={onExit} demoMode />
    </div>
  );
}
