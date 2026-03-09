"use strict";

const path = require("path");
const fs = require("fs");
const { spawnSync } = require("child_process");

const repo = path.resolve(__dirname, "..");
const engine = path.join(repo, "packages", "inference-engine");
const envPath = path.join(repo, ".env");

// Load MODEL_PATH and DRAFT_MODEL_PATH (and any other vars) from repo .env
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, "utf8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1).replace(/\\"/g, '"');
    if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1).replace(/\\'/g, "'");
    if (key && val !== undefined) process.env[key] = val;
  }
}

// Resolve relative MODEL_PATH / DRAFT_MODEL_PATH relative to inference-engine dir
if (process.env.MODEL_PATH && !path.isAbsolute(process.env.MODEL_PATH)) {
  process.env.MODEL_PATH = path.join(engine, process.env.MODEL_PATH);
}
if (process.env.DRAFT_MODEL_PATH && !path.isAbsolute(process.env.DRAFT_MODEL_PATH)) {
  process.env.DRAFT_MODEL_PATH = path.join(engine, process.env.DRAFT_MODEL_PATH);
}

const r = spawnSync(
  "cargo",
  ["run", "--release", "--features", "candle,cuda", "--", "--config", "configs/roles.toml", "--port", "8080", "--log-json"],
  { cwd: engine, env: process.env, stdio: "inherit", shell: process.platform === "win32" }
);
process.exit(r.status ?? 1);
