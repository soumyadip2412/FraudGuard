import { Notice } from "./components/Notice";
import { TopBar } from "./components/TopBar";
import { type TabId, useHashTab } from "./hooks/useHashTab";
import { type ServerStatus, useServerStatus } from "./hooks/useServerStatus";
import type { ModelInfo } from "./types";
import { BatchView } from "./views/BatchView";
import { CheckView } from "./views/CheckView";
import { GuideView } from "./views/GuideView";
import { LogView } from "./views/LogView";
import { ModelView } from "./views/ModelView";

export function App() {
  const tab = useHashTab();
  const [status, reload] = useServerStatus();

  return (
    <>
      <TopBar tab={tab} status={status} onKeyChange={reload} />
      <main className="page" id="main">
        {status.model ? <ActiveView tab={tab} model={status.model} /> : <ServerProblem status={status} onRetry={reload} />}
      </main>
    </>
  );
}

function ActiveView({ tab, model }: { tab: TabId; model: ModelInfo }) {
  switch (tab) {
    case "batch":
      return <BatchView model={model} />;
    case "log":
      return <LogView />;
    case "model":
      return <ModelView model={model} />;
    case "guide":
      return <GuideView model={model} />;
    default:
      return <CheckView model={model} />;
  }
}

function ServerProblem({ status, onRetry }: { status: ServerStatus; onRetry: () => void }) {
  if (status.loading) return <p className="loading-line">Connecting to the FraudGuard API…</p>;
  return (
    <div className="narrow">
      <h1 className="view-title">The API isn't answering</h1>
      <Notice tone="error">{status.error}</Notice>
      <p className="body-copy">
        Start it from the project folder with <code>.venv/Scripts/python.exe -m uvicorn app.main:app --reload</code>,
        or run everything with <code>docker compose up -d</code>.
      </p>
      <button type="button" className="btn btn-primary" onClick={onRetry}>
        Try again
      </button>
    </div>
  );
}
