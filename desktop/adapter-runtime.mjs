import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { clampPercent } from "./providers.mjs";

const MAX_OUTPUT_BYTES = 1_000_000;

export function validateAdapterSnapshot(input, adapterId = "external") {
  if (!input || input.schemaVersion !== 1 || !Array.isArray(input.providers)) {
    throw new Error("Adapter output must use AgentHeadroom schemaVersion 1");
  }
  const providers = input.providers.map((provider) => {
    if (!provider?.id || !provider?.name || !Array.isArray(provider.accounts)) {
      throw new Error("Each provider needs id, name, and accounts");
    }
    return {
      id: String(provider.id),
      name: String(provider.name).slice(0, 80),
      usageUrl: typeof provider.usageUrl === "string" && /^https:\/\//i.test(provider.usageUrl)
        ? provider.usageUrl
        : null,
      accounts: provider.accounts.map((account) => {
        if (!account?.id || !account?.label || !Array.isArray(account.limits)) {
          throw new Error("Each account needs id, label, and limits");
        }
        return {
          id: String(account.id),
          label: String(account.label).slice(0, 80),
          limits: account.limits.map((limit) => {
            const remainingPercent = clampPercent(limit?.remainingPercent);
            if (!limit?.id || !limit?.label || remainingPercent === null) {
              throw new Error("Each limit needs id, label, and remainingPercent");
            }
            return {
              id: String(limit.id),
              label: String(limit.label).slice(0, 80),
              remainingPercent,
              resetsAt: Number.isFinite(Number(limit.resetsAt)) ? Number(limit.resetsAt) : null,
            };
          }),
        };
      }),
    };
  });
  return {
    adapterId,
    generatedAt: typeof input.generatedAt === "string" ? input.generatedAt : new Date().toISOString(),
    providers,
  };
}

export async function loadAdapterManifests(directory) {
  let names;
  try {
    names = (await readdir(directory)).filter((name) => name.endsWith(".json"));
  } catch {
    return [];
  }
  const manifests = [];
  for (const name of names) {
    try {
      const manifestPath = path.join(directory, name);
      const raw = JSON.parse(await readFile(manifestPath, "utf8"));
      if (raw.schemaVersion !== 1 || typeof raw.id !== "string" || typeof raw.executable !== "string") {
        throw new Error(`Invalid adapter manifest: ${name}`);
      }
      const executable = path.isAbsolute(raw.executable)
        ? raw.executable
        : path.resolve(directory, raw.executable);
      manifests.push({
        id: raw.id,
        executable,
        args: Array.isArray(raw.args) ? raw.args.map(String) : [],
        timeoutMs: Math.min(30_000, Math.max(1_000, Number(raw.timeoutMs) || 10_000)),
      });
    } catch (error) {
      manifests.push({ id: name, loadError: error.message });
    }
  }
  return manifests;
}

export async function runAdapter(manifest, { spawnImpl = spawn } = {}) {
  if (manifest.loadError) throw new Error(manifest.loadError);
  return await new Promise((resolve, reject) => {
    const child = spawnImpl(manifest.executable, manifest.args, {
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "ignore"],
    });
    let stdout = "";
    let settled = false;
    const finish = (callback) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (!child.killed) child.kill();
      callback();
    };
    const timer = setTimeout(() => finish(() => reject(new Error(
      `Adapter ${manifest.id} timed out`,
    ))), manifest.timeoutMs);
    child.once("error", (error) => finish(() => reject(error)));
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      if (Buffer.byteLength(stdout) > MAX_OUTPUT_BYTES) {
        finish(() => reject(new Error(`Adapter ${manifest.id} output is too large`)));
      }
    });
    child.once("close", (code) => {
      if (settled) return;
      if (code !== 0) {
        finish(() => reject(new Error(`Adapter ${manifest.id} exited with ${code}`)));
        return;
      }
      try {
        const snapshot = validateAdapterSnapshot(JSON.parse(stdout), manifest.id);
        finish(() => resolve(snapshot));
      } catch (error) {
        finish(() => reject(error));
      }
    });
  });
}
