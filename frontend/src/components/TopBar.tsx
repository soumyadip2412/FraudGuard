import { TABS, type TabId } from "../hooks/useHashTab";
import type { ServerStatus } from "../hooks/useServerStatus";
import { formatPercent, modelName } from "../lib/format";
import { ApiKeyControl } from "./ApiKeyControl";

interface TopBarProps {
  tab: TabId;
  status: ServerStatus;
  onKeyChange: () => void;
}

export function TopBar({ tab, status, onKeyChange }: TopBarProps) {
  return (
    <header className="topbar">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <div className="topbar-inner">
        <a className="wordmark" href="#check">
          FraudGuard
        </a>
        <nav aria-label="Sections">
          <ul className="tabs">
            {TABS.map(({ id, label }) => (
              <li key={id}>
                <a href={`#${id}`} aria-current={tab === id ? "page" : undefined}>
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="topbar-tools">
          <ServerState status={status} />
          <ApiKeyControl onChange={onKeyChange} />
        </div>
      </div>
    </header>
  );
}

function ServerState({ status }: { status: ServerStatus }) {
  if (status.model) {
    return (
      <span className="server-state">
        {modelName(status.model.model)}, flags at {formatPercent(status.model.threshold)}
      </span>
    );
  }
  return <span className="server-state is-down">{status.loading ? "Connecting" : "API unavailable"}</span>;
}
