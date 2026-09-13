import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { clampPercent } from "./providers.mjs";

export const CLAUDE_BRIDGE_ARG = "--agent-headroom-claude-statusline";

export function agentHeadroomUserDataPath({
  platform = process.platform,
  env = process.env,
  home = os.homedir(),
} = {}) {
  if (env.AGENT_HEADROOM_USER_DATA_DIR) return path.resolve(env.AGENT_HEADROOM_USER_DATA_DIR);
  if (platform === "darwin") return path.join(home, "Library", "Application Support", "agent-headroom");
  if (platform === "win32") return path.join(env.APPDATA || path.join(home, "AppData", "Roaming"), "agent-headroom");
  return path.join(env.XDG_CONFIG_HOME || path.join(home, ".config"), "agent-headroom");
}

const WINDOW_LABELS = {
  five_hour: "5-hour limit",
  seven_day: "Weekly limit",
  spend_limit: "Spend limit",
};

function validWindow(key, value) {
  if (!value || typeof value !== "object") return null;
  const usedPercent = Number(value.used_percentage);
  const resetsAt = Number(value.resets_at);
  if (!Number.isFinite(usedPercent) || !Number.isFinite(resetsAt) || resetsAt <= 0) return null;
  return {
    id: key.replaceAll("_", "-"),
    label: WINDOW_LABELS[key] ?? key,
    remainingPercent: clampPercent(100 - usedPercent),
    resetsAt,
  };
}

export function snapshotFromClaudeStatusLine(input, generatedAt = new Date().toISOString()) {
  const source = typeof input === "string" ? JSON.parse(input) : input;
  const windows = Object.entries(source?.rate_limits ?? {}).flatMap(([key, value]) => {
    const window = validWindow(key, value);
    return window ? [window] : [];
  });
  if (windows.length === 0) return null;
  return {
    schemaVersion: 1,
    generatedAt,
    providers: [{
      id: "claude",
      name: "Claude Code",
      usageUrl: "https://claude.ai/settings/usage",
      accounts: [{ id: "claude-ai", label: "Claude.ai", limits: windows }],
    }],
  };
}

export function claudeStatusText(snapshot) {
  const limits = snapshot?.providers?.[0]?.accounts?.[0]?.limits ?? [];
  if (limits.length === 0) return "AgentHeadroom · waiting for quota data";
  const shortLabels = { "five-hour": "5h", "seven-day": "7d", "spend-limit": "spend" };
  return `AgentHeadroom · ${limits.map((limit) =>
    `${shortLabels[limit.id] ?? limit.label} ${limit.remainingPercent}% left`).join(" · ")}`;
}

export async function captureClaudeStatusLine({ input, snapshotPath }) {
  const snapshot = snapshotFromClaudeStatusLine(input);
  if (snapshot) {
    await mkdir(path.dirname(snapshotPath), { recursive: true });
    await writeFile(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`, { mode: 0o600 });
  }
  return claudeStatusText(snapshot);
}

function shellQuote(value, platform) {
  const string = String(value);
  if (platform === "win32") return `"${string.replaceAll('"', '\\"')}"`;
  return `'${string.replaceAll("'", "'\\''")}'`;
}

export function claudeStatusLineCommand({ nodeExecutable, bridgeScriptPath, snapshotPath, platform = process.platform }) {
  const values = [nodeExecutable, bridgeScriptPath, snapshotPath].map((value) =>
    platform === "win32" ? String(value).replaceAll("\\", "/") : value);
  return values
    .map((value) => shellQuote(value, platform))
    .join(" ");
}

async function readJson(filePath, fallback = {}) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

async function atomicWriteJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.agent-headroom-${process.pid}`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  if (process.platform === "win32") {
    await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
    await unlink(temporaryPath);
  } else {
    await rename(temporaryPath, filePath);
  }
}

export async function installClaudeConnector({
  settingsPath,
  markerPath,
  nodeExecutable,
  bridgeScriptPath,
  bridgeScriptContent,
  snapshotPath,
  platform = process.platform,
}) {
  const settings = await readJson(settingsPath);
  const command = claudeStatusLineCommand({ nodeExecutable, bridgeScriptPath, snapshotPath, platform });
  if (settings.statusLine && settings.statusLine.command !== command) {
    throw new Error("기존 Claude Code status line이 있어 자동으로 덮어쓰지 않았습니다.");
  }
  await mkdir(path.dirname(bridgeScriptPath), { recursive: true });
  await writeFile(bridgeScriptPath, bridgeScriptContent, { mode: 0o700 });
  settings.statusLine = { type: "command", command, refreshInterval: 60 };
  await atomicWriteJson(settingsPath, settings);
  await atomicWriteJson(markerPath, {
    schemaVersion: 1,
    command,
    settingsPath,
    bridgeScriptPath,
    snapshotPath,
    installedAt: new Date().toISOString(),
  });
  return { installed: true, command };
}

export async function removeClaudeConnector({ settingsPath, markerPath, snapshotPath, bridgeScriptPath }) {
  const marker = await readJson(markerPath, null);
  const settings = await readJson(settingsPath);
  if (marker?.command && settings.statusLine?.command === marker.command) {
    delete settings.statusLine;
    await atomicWriteJson(settingsPath, settings);
  }
  try {
    await unlink(markerPath);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  try {
    await unlink(snapshotPath);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (marker?.bridgeScriptPath === bridgeScriptPath) {
    try {
      await unlink(bridgeScriptPath);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  return { installed: false };
}

export async function isClaudeConnectorInstalled(markerPath) {
  const marker = await readJson(markerPath, null);
  return Boolean(marker?.command);
}

export async function readClaudeSnapshot(snapshotPath, nowSeconds = Date.now() / 1_000) {
  const snapshot = await readJson(snapshotPath, null);
  if (!snapshot?.providers?.[0]) return null;
  const accounts = snapshot.providers[0].accounts.flatMap((account) => {
    const limits = account.limits.filter((limit) =>
      Number.isFinite(limit.remainingPercent)
      && Number.isFinite(limit.resetsAt)
      && limit.resetsAt > nowSeconds);
    return limits.length > 0 ? [{ ...account, limits }] : [];
  });
  if (accounts.length === 0) return null;
  return {
    ...snapshot,
    providers: [{ ...snapshot.providers[0], accounts }],
  };
}
