import { access } from "node:fs/promises";
import { constants } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";

export class AgentHeadroomError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "AgentHeadroomError";
    this.code = code;
  }
}

export function remainingPercent(usedPercent) {
  if (!Number.isFinite(usedPercent)) return 0;
  return Math.min(100, Math.max(0, Math.round(100 - usedPercent)));
}

export function windowLabel(minutes, locale = "en") {
  const korean = locale.toLowerCase().startsWith("ko");
  if (minutes === 300) return korean ? "5시간 한도" : "5-hour limit";
  if (minutes === 1_440) return korean ? "일일 한도" : "Daily limit";
  if (minutes >= 9_000 && minutes <= 11_000) {
    return korean ? "주간 한도" : "Weekly limit";
  }
  if (!Number.isFinite(minutes)) return korean ? "사용량 한도" : "Usage limit";
  return korean ? `${minutes}분 한도` : `${minutes}-minute limit`;
}

export function summarizeRateLimits(result, locale = "en") {
  if (!result?.rateLimits) {
    throw new AgentHeadroomError("INVALID_RESPONSE", "Codex returned an invalid rate-limit response.");
  }

  const byId = Object.values(result.rateLimitsByLimitId ?? {});
  const source = byId.length > 0 ? byId : [result.rateLimits];
  const limits = source
    .map((limit) => {
      const windows = [limit.primary, limit.secondary]
        .filter(Boolean)
        .map((window) => ({
          usedPercent: window.usedPercent,
          remainingPercent: remainingPercent(window.usedPercent),
          windowDurationMins: window.windowDurationMins ?? null,
          resetsAt: window.resetsAt ?? null,
          label: windowLabel(window.windowDurationMins, locale),
        }));

      return {
        id: limit.limitId ?? limit.limitName ?? "codex-unknown",
        name: limit.limitId === "codex"
          ? "Codex"
          : (limit.limitName ?? limit.limitId ?? "Codex"),
        windows,
        remainingPercent: windows.length > 0
          ? Math.min(...windows.map((window) => window.remainingPercent))
          : null,
      };
    })
    .sort((left, right) => {
      if (left.id === "codex" && right.id !== "codex") return -1;
      if (right.id === "codex" && left.id !== "codex") return 1;
      return left.name.localeCompare(right.name);
    });

  const preferred = limits.find((limit) => limit.id === "codex");
  const available = limits
    .map((limit) => limit.remainingPercent)
    .filter(Number.isFinite);

  return {
    headlineRemainingPercent: preferred?.remainingPercent
      ?? (available.length > 0 ? Math.min(...available) : 0),
    limits,
  };
}

export function codexCandidates({
  platform = process.platform,
  env = process.env,
  home = homedir(),
} = {}) {
  const explicit = [
    env.AGENT_HEADROOM_CODEX_PATH,
    env.CODEX_HEADROOM_CODEX_PATH,
    env.CODEX_METER_CODEX_PATH,
  ].filter(Boolean);

  if (platform === "win32") {
    const localAppData = env.LOCALAPPDATA;
    return [
      ...explicit,
      localAppData && path.win32.join(localAppData, "Programs", "OpenAI", "Codex", "bin", "codex.exe"),
      localAppData && path.win32.join(localAppData, "Programs", "OpenAI", "Codex", "codex.exe"),
      path.win32.join(home, ".local", "bin", "codex.exe"),
    ].filter(Boolean);
  }

  return [
    ...explicit,
    path.join(home, ".local", "bin", "codex"),
    "/opt/homebrew/bin/codex",
    "/usr/local/bin/codex",
    path.join(home, "bin", "codex"),
  ];
}

async function isRunnable(filePath, platform) {
  try {
    await access(filePath, platform === "win32" ? constants.F_OK : constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function findCodexOnPath(platform, env) {
  const command = platform === "win32" ? "where.exe" : "which";
  const lookup = spawnSync(command, [platform === "win32" ? "codex.exe" : "codex"], {
    encoding: "utf8",
    env,
    windowsHide: true,
  });
  if (lookup.status !== 0) return null;
  return lookup.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean) ?? null;
}

export async function resolveCodexPath(options = {}) {
  const platform = options.platform ?? process.platform;
  const env = options.env ?? process.env;
  const candidates = codexCandidates({
    platform,
    env,
    home: options.home ?? homedir(),
  });

  for (const candidate of candidates) {
    if (await isRunnable(candidate, platform)) return candidate;
  }

  const discovered = findCodexOnPath(platform, env);
  if (discovered && await isRunnable(discovered, platform)) return discovered;

  throw new AgentHeadroomError(
    "CODEX_NOT_FOUND",
    "Codex CLI was not found. Install it, sign in, and restart AgentHeadroom.",
  );
}

export async function fetchRateLimits({
  codexPath,
  locale = "en",
  timeoutMs = 12_000,
  spawnImpl = spawn,
} = {}) {
  const executable = codexPath ?? await resolveCodexPath();

  return await new Promise((resolve, reject) => {
    const child = spawnImpl(
      executable,
      ["app-server", "--stdio", "--disable", "plugins"],
      { stdio: ["pipe", "pipe", "ignore"], windowsHide: true },
    );
    let buffer = "";
    let settled = false;

    const finish = (callback) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.stdout?.removeAllListeners();
      child.removeAllListeners();
      child.stdin?.end();
      if (!child.killed) child.kill();
      callback();
    };

    const timer = setTimeout(() => {
      finish(() => reject(new AgentHeadroomError(
        "TIMEOUT",
        "Timed out while reading Codex usage.",
      )));
    }, timeoutMs);

    child.once("error", (error) => {
      finish(() => reject(new AgentHeadroomError("LAUNCH_FAILED", error.message)));
    });

    child.once("exit", () => {
      if (!settled) {
        finish(() => reject(new AgentHeadroomError(
          "EARLY_EXIT",
          "Codex app-server exited before returning usage.",
        )));
      }
    });

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      buffer += chunk;
      let newline;
      while ((newline = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (!line) continue;

        let message;
        try {
          message = JSON.parse(line);
        } catch {
          continue;
        }
        if (message.id !== 2) continue;

        if (message.error) {
          finish(() => reject(new AgentHeadroomError(
            "SERVER_ERROR",
            message.error.message ?? "Codex usage request failed.",
          )));
          return;
        }

        try {
          const summary = summarizeRateLimits(message.result, locale);
          finish(() => resolve(summary));
        } catch (error) {
          finish(() => reject(error));
        }
        return;
      }
    });

    const messages = [
      {
        id: 1,
        method: "initialize",
        params: {
          clientInfo: {
            name: "agent-headroom",
            title: "AgentHeadroom",
            version: "0.2.0",
          },
          capabilities: null,
        },
      },
      { method: "initialized", params: {} },
      { id: 2, method: "account/rateLimits/read" },
    ];

    for (const message of messages) {
      child.stdin.write(`${JSON.stringify(message)}\n`);
    }
  });
}
