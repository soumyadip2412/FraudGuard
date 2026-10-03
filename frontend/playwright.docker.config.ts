import { createConfig } from "./playwright.config";

// Read-only checks against the Docker stack (docker compose up -d), skipping @writes tests.
export default createConfig("http://127.0.0.1:8080");
