import { type FormEvent, useRef, useState } from "react";
import { getApiKey, setApiKey } from "../api";

export function ApiKeyControl({ onChange }: { onChange: () => void }) {
  const [draft, setDraft] = useState(getApiKey);
  const details = useRef<HTMLDetailsElement>(null);

  function save(event: FormEvent) {
    event.preventDefault();
    setApiKey(draft.trim());
    details.current?.removeAttribute("open");
    onChange();
  }

  return (
    <details className="key-control" ref={details}>
      <summary>{getApiKey() ? "API key saved" : "API key"}</summary>
      <form className="key-popover" onSubmit={save}>
        <label htmlFor="api-key">API key</label>
        <p className="hint">Only needed when the server sets API_KEY. It stays in this browser.</p>
        <input
          id="api-key"
          type="password"
          autoComplete="off"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
        <div className="button-row">
          <button type="submit" className="btn btn-primary">
            Save key
          </button>
          {draft && (
            <button type="button" className="btn btn-quiet" onClick={() => setDraft("")}>
              Clear
            </button>
          )}
        </div>
      </form>
    </details>
  );
}
