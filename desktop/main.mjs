import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  nativeImage,
  shell,
  Tray,
} from "electron";
import { fetchRateLimits } from "./core.mjs";
import { loadAdapterManifests, runAdapter } from "./adapter-runtime.mjs";
import {
  adapterSnapshotRows,
  lowestHeadroom,
  normalizeProviderState,
  overallRemaining,
  providerRows,
  resetSequence,
} from "./providers.mjs";

const REFRESH_INTERVAL_MS = 60_000;
const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
let isKorean = false;
let text = {
  loading: "Checking agent usage…",
  remaining: "remaining",
  refresh: "Refresh",
  manage: "Manage providers…",
  adapters: "Open adapters folder",
  nextResets: "Next resets",
  quit: "Quit",
  updated: "Updated",
  unavailable: "Not set",
};

let tray;
let settingsWindow;
let refreshTimer;
let refreshing = false;
let codexSummary;
let codexError;
let lastUpdated;
let providerState = normalizeProviderState();
let adapterSnapshots = [];
let adapterErrors = [];

function statePath() {
  return path.join(app.getPath("userData"), "providers.json");
}

function adaptersPath() {
  return process.env.AGENT_HEADROOM_ADAPTERS_DIR
    || path.join(app.getPath("userData"), "adapters");
}

async function loadState() {
  try {
    providerState = normalizeProviderState(JSON.parse(await readFile(statePath(), "utf8")));
  } catch {
    providerState = normalizeProviderState();
  }
}

async function saveState() {
  await writeFile(statePath(), `${JSON.stringify(providerState, null, 2)}\n`, "utf8");
}

function rows() {
  return [
    ...providerRows({ state: providerState, codexSummary, codexError }),
    ...adapterSnapshotRows(adapterSnapshots),
  ];
}

function iconSvg(value, failed = false) {
  const display = failed ? "!" : (Number.isFinite(value) ? String(value) : "··");
  const fontSize = display.length >= 3 ? 24 : 30;
  const accent = failed || value < 15 ? "#E5484D" : value < 35 ? "#E99B3A" : "#5865F2";
  const eyes = failed || value < 15
    ? '<path d="M15 26 L22 22 M42 22 L49 26" stroke="white" stroke-width="3" stroke-linecap="round"/>'
    : '<circle cx="19" cy="24" r="3" fill="white"/><circle cx="45" cy="24" r="3" fill="white"/>';
  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
      <path d="M32 9 V4 M32 4 L40 1" stroke="${accent}" stroke-width="4" stroke-linecap="round"/>
      <rect x="4" y="10" width="56" height="51" rx="17" fill="${accent}"/>
      ${eyes}
      <text x="32" y="51" text-anchor="middle" font-family="Arial, Helvetica, sans-serif"
        font-size="${fontSize}" font-weight="700" fill="white">${display}</text>
    </svg>`;
}

function makeIcon(value, failed = false) {
  const encoded = Buffer.from(iconSvg(value, failed)).toString("base64");
  return nativeImage
    .createFromDataURL(`data:image/svg+xml;base64,${encoded}`)
    .resize({ width: 32, height: 32 });
}

function rebuildMenu() {
  const providers = rows();
  const headline = overallRemaining(providers);
  const items = [
    {
      label: Number.isFinite(headline)
        ? `AgentHeadroom · ${headline}% ${text.remaining}`
        : text.loading,
      enabled: false,
    },
    { type: "separator" },
  ];

  for (const provider of providers) {
    const status = Number.isFinite(provider.remainingPercent)
      ? `${provider.remainingPercent}% ${text.remaining}`
      : (provider.error ?? text.unavailable);
    items.push({ label: `${provider.name} · ${status}`, enabled: false });
  }

  const lowest = lowestHeadroom(providers);
  if (lowest) {
    items.push({
      label: `↓ ${lowest.provider.name} · ${lowest.account.label} · ${lowest.limit.label}`,
      enabled: false,
    });
  }

  const upcoming = resetSequence(providers).slice(0, 4);
  if (upcoming.length > 0) {
    items.push({ type: "separator" }, { label: text.nextResets, enabled: false });
    for (const reset of upcoming) {
      const when = new Date(reset.resetsAt * 1_000).toLocaleString();
      items.push({
        label: `${reset.providerName} · ${reset.accountLabel} · ${when}`,
        enabled: false,
      });
    }
  }

  for (const error of adapterErrors) {
    items.push({ label: `⚠ ${error}`, enabled: false });
  }

  items.push(
    { type: "separator" },
    {
      label: lastUpdated
        ? `${text.updated} ${lastUpdated.toLocaleTimeString()}`
        : text.loading,
      enabled: false,
    },
    { label: text.manage, click: () => openSettings() },
    {
      label: text.adapters,
      click: async () => {
        await mkdir(adaptersPath(), { recursive: true });
        await shell.openPath(adaptersPath());
      },
    },
    {
      label: text.refresh,
      enabled: !refreshing,
      click: () => void refresh(),
    },
    { label: text.quit, role: "quit" },
  );

  tray.setContextMenu(Menu.buildFromTemplate(items));
}

function updateTray() {
  const headline = overallRemaining(rows());
  const hasAny = Number.isFinite(headline);
  tray.setImage(makeIcon(headline, !hasAny && Boolean(codexError)));
  tray.setToolTip(hasAny
    ? `AgentHeadroom · ${headline}% ${text.remaining}`
    : text.loading);
  rebuildMenu();
}

async function refresh() {
  if (refreshing) return;
  refreshing = true;
  rebuildMenu();

  try {
    codexSummary = await fetchRateLimits({ locale: isKorean ? "ko" : "en" });
    codexError = null;
  } catch (error) {
    codexError = error.message;
  } finally {
    try {
      const manifests = await loadAdapterManifests(adaptersPath());
      const results = await Promise.allSettled(manifests.map((manifest) => runAdapter(manifest)));
      adapterSnapshots = results.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
      adapterErrors = results.flatMap((result) => result.status === "rejected" ? [result.reason.message] : []);
    } catch (error) {
      adapterSnapshots = [];
      adapterErrors = [error.message];
    }
    refreshing = false;
    lastUpdated = new Date();
    updateTray();
  }
}

function openSettings() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.show();
    settingsWindow.focus();
    return;
  }
  settingsWindow = new BrowserWindow({
    width: 600,
    height: 720,
    minWidth: 480,
    minHeight: 520,
    title: "AgentHeadroom",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(moduleDirectory, "preload.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  void settingsWindow.loadFile(path.join(moduleDirectory, "settings.html"));
  settingsWindow.on("closed", () => { settingsWindow = null; });
}

function registerIpc() {
  ipcMain.handle("providers:get", () => rows());
  ipcMain.handle("providers:save-manual", async (_event, { id, remainingPercent, resetsAt }) => {
    const rawValue = String(remainingPercent ?? "").trim();
    const value = rawValue ? Math.min(100, Math.max(0, Math.round(Number(rawValue)))) : Number.NaN;
    const provider = rows().find((item) => item.id === id && item.mode === "manual");
    if (!provider || !Number.isFinite(value)) throw new Error("Invalid provider value");
    const resetNumber = Number(resetsAt);
    providerState.manual[id] = {
      remainingPercent: value,
      resetsAt: Number.isFinite(resetNumber) && resetNumber > 0 ? resetNumber : null,
      updatedAt: new Date().toISOString(),
    };
    await saveState();
    updateTray();
    return rows();
  });
  ipcMain.handle("providers:add-custom", async (_event, { name, usageUrl }) => {
    const cleanName = String(name ?? "").trim().slice(0, 60);
    if (!cleanName) throw new Error("Provider name is required");
    const cleanUrl = String(usageUrl ?? "").trim();
    if (cleanUrl && !/^https:\/\//i.test(cleanUrl)) throw new Error("Only HTTPS links are allowed");
    const id = `custom-${Date.now().toString(36)}`;
    providerState.custom.push({ id, name: cleanName, mode: "manual", usageUrl: cleanUrl || null });
    await saveState();
    updateTray();
    return rows();
  });
  ipcMain.handle("providers:remove-custom", async (_event, { id }) => {
    if (!String(id).startsWith("custom-")) throw new Error("Built-in providers cannot be removed");
    providerState.custom = providerState.custom.filter((item) => item.id !== id);
    delete providerState.manual[id];
    await saveState();
    updateTray();
    return rows();
  });
  ipcMain.handle("providers:open-external", async (_event, { url }) => {
    const provider = rows().find((item) => item.usageUrl === url);
    if (!provider || !/^https:\/\//i.test(url)) throw new Error("Invalid provider URL");
    await shell.openExternal(url);
  });
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", openSettings);
  app.whenReady().then(async () => {
    if (process.platform === "darwin") app.dock.hide();
    isKorean = app.getLocale().toLowerCase().startsWith("ko");
    if (isKorean) {
      text = {
        loading: "에이전트 사용량 확인 중…",
        remaining: "남음",
        refresh: "새로고침",
        manage: "에이전트 관리…",
        adapters: "어댑터 폴더 열기",
        nextResets: "리셋 예정",
        quit: "종료",
        updated: "업데이트",
        unavailable: "미설정",
      };
    }
    if (process.platform === "win32") {
      app.setAppUserModelId("dev.agentheadroom.app");
    }
    await loadState();
    registerIpc();
    tray = new Tray(makeIcon(null));
    tray.setToolTip(text.loading);
    tray.on("click", () => tray.popUpContextMenu());
    rebuildMenu();
    void refresh();
    refreshTimer = setInterval(() => void refresh(), REFRESH_INTERVAL_MS);
  });

  app.on("before-quit", () => clearInterval(refreshTimer));
}
