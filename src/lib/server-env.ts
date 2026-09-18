import fs from "node:fs";
import path from "node:path";

const CANDIDATE_FILES = [".env", ".env.local", ".env.gemini-test"];
let isLoaded = false;

function normalizeEnvValue(value: string): string {
  let normalized = value.trim();
  if (
    (normalized.startsWith('"') && normalized.endsWith('"')) ||
    (normalized.startsWith("'") && normalized.endsWith("'"))
  ) {
    normalized = normalized.slice(1, -1);
  }
  return normalized.trim();
}

export function loadServerEnvironment(): void {
  if (isLoaded) return;

  const rootDir = process.cwd();

  for (const filename of CANDIDATE_FILES) {
    const filePath = path.join(rootDir, filename);
    if (!fs.existsSync(filePath)) continue;

    const content = fs.readFileSync(filePath, "utf-8");
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;

      const eqIndex = line.indexOf("=");
      if (eqIndex <= 0) continue;

      const key = line.slice(0, eqIndex).trim();
      const value = normalizeEnvValue(line.slice(eqIndex + 1));

      if (!key || process.env[key] !== undefined) continue;
      process.env[key] = value;
    }
  }

  isLoaded = true;
}

export function getServerEnv(key: string): string | null {
  loadServerEnvironment();
  const value = process.env[key]?.trim();
  return value ? value : null;
}
