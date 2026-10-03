import { defineConfig, devices } from "@playwright/test";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// By default the suite starts its own isolated stack: an API on :8001 backed by a fresh
// SQLite file, and the Vite dev UI on :5174 proxying to it. Nothing touches your real data.
// Set E2E_BASE_URL (e.g. http://127.0.0.1:8080 for Docker) to test a running deployment
// instead; tests tagged @writes are then skipped so they don't add rows to a real database.
const API_PORT = 8001;
const UI_PORT = 5174;
const dbFile = path.join(os.tmpdir(), `fraudguard-e2e-${Date.now()}.db`).replace(/\\/g, "/");
const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const python = process.platform === "win32" ? path.join(repoRoot, ".venv", "Scripts", "python.exe") : path.join(repoRoot, ".venv", "bin", "python");

export function createConfig(externalBase?: string) {
  return defineConfig({
    testDir: "e2e",
    workers: 1, // tests share one database, so they run one at a time
    reporter: [["list"]],
    grepInvert: externalBase ? /@writes/ : undefined,
    use: {
      baseURL: externalBase ?? `http://127.0.0.1:${UI_PORT}`,
      channel: "chrome", // the installed Google Chrome; no browser download needed
      trace: "retain-on-failure",
      screenshot: "only-on-failure",
    },
    projects: [
      { name: "desktop", use: { viewport: { width: 1440, height: 900 } } },
      { name: "mobile", use: { ...devices["Pixel 7"], channel: "chrome" }, testMatch: /layout|navigation|guide/ },
    ],
    webServer: externalBase
      ? undefined
      : [
          {
            command: `"${python}" -m uvicorn app.main:app --port ${API_PORT}`,
            cwd: repoRoot,
            url: `http://127.0.0.1:${API_PORT}/health`,
            env: { DATABASE_URL: `sqlite:///${dbFile}`, API_KEY: "" },
            timeout: 120_000,
          },
          {
            command: `npx vite --port ${UI_PORT} --strictPort --host 127.0.0.1`,
            url: `http://127.0.0.1:${UI_PORT}`,
            env: { API_TARGET: `http://127.0.0.1:${API_PORT}` },
          },
        ],
  });
}

export default createConfig(process.env.E2E_BASE_URL);
