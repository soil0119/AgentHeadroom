import { execFile } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  nativeImage,
  screen,
  shell,
  Tray,
} from "electron";
import { fetchRateLimits } from "./core.mjs";
import { loadAdapterManifests, runAdapter } from "./adapter-runtime.mjs";
import {
  agentHeadroomUserDataPath,
  captureClaudeStatusLine,
  CLAUDE_BRIDGE_ARG,
  installClaudeConnector,
  isClaudeConnectorInstalled,
  readClaudeSnapshot,
  removeClaudeConnector,
} from "./claude-connector.mjs";
import {
  adapterSnapshotRows,
  lowestHeadroom,
  overallRemaining,
  providerRows,
  resetSequence,
} from "./providers.mjs";

const REFRESH_INTERVAL_MS = 60_000;
const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
const execFileAsync = promisify(execFile);
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
let trayMenu;
let dashboardWindow;
let settingsWindow;
let refreshTimer;
let refreshing = false;
let codexSummary;
let codexError;
let lastUpdated;
let claudeSnapshot;
let claudeConnectorInstalled = false;
let adapterSnapshots = [];
let adapterErrors = [];

function adaptersPath() {
  return process.env.AGENT_HEADROOM_ADAPTERS_DIR
    || path.join(app.getPath("userData"), "adapters");
}

function connectorsPath() {
  return path.join(agentHeadroomUserDataPath(), "connectors");
}

function claudeSnapshotPath() {
  return path.join(connectorsPath(), "claude-statusline-snapshot.json");
}

function claudeMarkerPath() {
  return path.join(connectorsPath(), "claude-statusline.json");
}

function claudeSettingsPath() {
  return path.join(app.getPath("home"), ".claude", "settings.json");
}

function claudeBridgeScriptPath() {
  return path.join(app.getPath("home"), ".claude", "agent-headroom-statusline.cjs");
}

async function nodeExecutable() {
  const candidate = process.env.AGENT_HEADROOM_NODE_PATH || "node";
  try {
    await execFileAsync(candidate, ["--version"], { timeout: 3_000, windowsHide: true });
    return candidate;
  } catch {
    throw new Error("Claude 자동 연결에는 Node.js가 필요합니다. Node.js를 설치한 뒤 다시 시도하세요.");
  }
}

function rows() {
  const catalog = providerRows({ codexSummary, codexError });
  const claudeRow = claudeSnapshot
    ? adapterSnapshotRows([claudeSnapshot])[0]
    : null;
  const builtIns = catalog.map((provider) => {
    if (provider.id !== "claude") return provider;
    if (!claudeRow) return { ...provider, connectorInstalled: claudeConnectorInstalled };
    return {
      ...claudeRow,
      id: "claude",
      mode: "automatic",
      connectorInstalled: claudeConnectorInstalled,
    };
  });
  return [...builtIns, ...adapterSnapshotRows(adapterSnapshots)];
}

function iconSvg(value, failed = false, showNumber = true) {
  const display = failed ? "!" : (Number.isFinite(value) ? String(value) : "··");
  const fontSize = display.length >= 3 ? 24 : 30;
  const accent = failed || value < 15 ? "#E5484D" : value < 35 ? "#E99B3A" : "#5865F2";
  const eyes = failed || value < 15
    ? '<path d="M15 26 L22 22 M42 22 L49 26" stroke="white" stroke-width="3" stroke-linecap="round"/>'
    : '<circle cx="19" cy="24" r="3" fill="white"/><circle cx="45" cy="24" r="3" fill="white"/>';
  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
      <path d="M32 9 V4 M32 4 L40 1" stroke="${accent}" stroke-width="4" stroke-linecap="round"/>
      <rect x="4" y="10" width="56" height="${showNumber ? 51 : 46}" rx="17" fill="${accent}"/>
      ${eyes}
      ${showNumber ? `<text x="32" y="51" text-anchor="middle" font-family="Arial, Helvetica, sans-serif"
        font-size="${fontSize}" font-weight="700" fill="white">${display}</text>` : '<path d="M18 39 Q32 49 46 39" fill="none" stroke="white" stroke-width="3" stroke-linecap="round"/>'}
    </svg>`;
}

function makeIcon(value, failed = false) {
  const showNumber = process.platform !== "darwin";
  const encoded = Buffer.from(iconSvg(value, failed, showNumber)).toString("base64");
  const image = nativeImage
    .createFromDataURL(`data:image/svg+xml;base64,${encoded}`)
    .resize({ width: 32, height: 32 });
  if (process.platform === "darwin") image.setTemplateImage(true);
  return image;
}

function dashboardData() {
  const providers = rows();
  const lowest = lowestHeadroom(providers);
  return {
    headlineRemainingPercent: overallRemaining(providers),
    providers,
    lowest: lowest ? {
      providerName: lowest.provider.name,
      accountLabel: lowest.account.label,
      limitLabel: lowest.limit.label,
      remainingPercent: lowest.limit.remainingPercent,
    } : null,
    resets: resetSequence(providers),
    lastUpdated: lastUpdated?.toISOString() ?? null,
  };
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

  for (const provider of providers.filter((item) => item.accounts.length > 0 || item.error)) {
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

  trayMenu = Menu.buildFromTemplate(items);
}

function updateTray() {
  const headline = overallRemaining(rows());
  const hasAny = Number.isFinite(headline);
  tray.setImage(makeIcon(headline, !hasAny && Boolean(codexError)));
  if (process.platform === "darwin") {
    tray.setTitle(hasAny ? ` ${headline}%` : " …");
  }
  tray.setToolTip(hasAny
    ? `AgentHeadroom · ${headline}% ${text.remaining}`
    : text.loading);
  rebuildMenu();
  dashboardWindow?.webContents.send("dashboard:changed");
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
      claudeSnapshot = await readClaudeSnapshot(claudeSnapshotPath());
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
      preload: path.join(moduleDirectory, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  void settingsWindow.loadFile(path.join(moduleDirectory, "settings.html"));
  settingsWindow.on("closed", () => { settingsWindow = null; });
}

function positionDashboard() {
  if (!dashboardWindow || dashboardWindow.isDestroyed()) return;
  const trayBounds = tray.getBounds();
  const display = screen.getDisplayNearestPoint({
    x: Math.round(trayBounds.x + trayBounds.width / 2),
    y: Math.round(trayBounds.y + trayBounds.height / 2),
  });
  const workArea = display.workArea;
  const [windowWidth, windowHeight] = dashboardWindow.getSize();
  const centeredX = Math.round(trayBounds.x + trayBounds.width / 2 - windowWidth / 2);
  const x = Math.max(workArea.x + 8, Math.min(centeredX, workArea.x + workArea.width - windowWidth - 8));
  const trayIsAboveCenter = trayBounds.y < display.bounds.y + display.bounds.height / 2;
  const proposedY = trayIsAboveCenter
    ? trayBounds.y + trayBounds.height + 6
    : trayBounds.y - windowHeight - 6;
  const y = Math.max(workArea.y + 6, Math.min(proposedY, workArea.y + workArea.height - windowHeight - 6));
  dashboardWindow.setPosition(x, y, false);
}

function createDashboard() {
  if (dashboardWindow && !dashboardWindow.isDestroyed()) return dashboardWindow;
  dashboardWindow = new BrowserWindow({
    width: 420,
    height: 520,
    show: false,
    frame: false,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: true,
    transparent: process.platform === "darwin",
    backgroundColor: process.platform === "darwin" ? "#00000000" : "#f5f5f7",
    ...(process.platform === "darwin" ? { vibrancy: "popover", visualEffectState: "active" } : {}),
    webPreferences: {
      preload: path.join(moduleDirectory, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  void dashboardWindow.loadFile(path.join(moduleDirectory, "dashboard.html"));
  dashboardWindow.on("blur", () => {
    if (!settingsWindow?.isFocused()) dashboardWindow?.hide();
  });
  dashboardWindow.on("closed", () => { dashboardWindow = null; });
  return dashboardWindow;
}

function toggleDashboard() {
  const window = createDashboard();
  if (window.isVisible()) {
    window.hide();
    return;
  }
  positionDashboard();
  window.show();
  window.focus();
  window.webContents.send("dashboard:changed");
}

function registerIpc() {
  ipcMain.handle("dashboard:get", () => dashboardData());
  ipcMain.handle("dashboard:refresh", async () => {
    await refresh();
    return dashboardData();
  });
  ipcMain.handle("dashboard:open-settings", () => {
    dashboardWindow?.hide();
    openSettings();
  });
  ipcMain.handle("dashboard:quit", () => app.quit());
  ipcMain.handle("dashboard:resize", (_event, { height }) => {
    if (!dashboardWindow || dashboardWindow.isDestroyed()) return;
    const safeHeight = Math.max(250, Math.min(720, Math.ceil(Number(height) || 520)));
    dashboardWindow.setSize(420, safeHeight, false);
    positionDashboard();
  });
  ipcMain.handle("providers:get", () => rows());
  ipcMain.handle("connectors:claude-install", async () => {
    if (!app.isPackaged) throw new Error("Claude 자동 연결은 패키징된 앱에서 설정하세요.");
    const bridgeScriptContent = await readFile(
      path.join(moduleDirectory, "claude-statusline-bridge.cjs"),
      "utf8",
    );
    await installClaudeConnector({
      settingsPath: claudeSettingsPath(),
      markerPath: claudeMarkerPath(),
      nodeExecutable: await nodeExecutable(),
      bridgeScriptPath: claudeBridgeScriptPath(),
      bridgeScriptContent,
      snapshotPath: claudeSnapshotPath(),
    });
    claudeConnectorInstalled = true;
    updateTray();
    return rows();
  });
  ipcMain.handle("connectors:claude-remove", async () => {
    await removeClaudeConnector({
      settingsPath: claudeSettingsPath(),
      markerPath: claudeMarkerPath(),
      snapshotPath: claudeSnapshotPath(),
      bridgeScriptPath: claudeBridgeScriptPath(),
    });
    claudeConnectorInstalled = false;
    claudeSnapshot = null;
    updateTray();
    return rows();
  });
  ipcMain.handle("providers:open-adapters", async () => {
    await mkdir(adaptersPath(), { recursive: true });
    await shell.openPath(adaptersPath());
  });
  ipcMain.handle("providers:open-external", async (_event, { url }) => {
    const provider = rows().find((item) => item.usageUrl === url);
    if (!provider || !/^https:\/\//i.test(url)) throw new Error("Invalid provider URL");
    await shell.openExternal(url);
  });
}

const claudeBridgeMode = process.argv.includes(CLAUDE_BRIDGE_ARG);

async function runClaudeBridge() {
  let size = 0;
  const chunks = [];
  for await (const chunk of process.stdin) {
    size += chunk.length;
    if (size > 1_048_576) throw new Error("Claude status line input is too large");
    chunks.push(chunk);
  }
  return captureClaudeStatusLine({
    input: Buffer.concat(chunks).toString("utf8"),
    snapshotPath: claudeSnapshotPath(),
  });
}

if (claudeBridgeMode) {
  runClaudeBridge()
    .then((line) => process.stdout.write(`${line}\n`, () => process.exit(0)))
    .catch(() => process.stdout.write("AgentHeadroom · quota unavailable\n", () => process.exit(0)));
} else if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", toggleDashboard);
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
    claudeConnectorInstalled = await isClaudeConnectorInstalled(claudeMarkerPath());
    registerIpc();
    tray = new Tray(makeIcon(null));
    tray.setToolTip(text.loading);
    tray.on("click", toggleDashboard);
    tray.on("right-click", () => tray.popUpContextMenu(trayMenu));
    rebuildMenu();
    void refresh();
    refreshTimer = setInterval(() => void refresh(), REFRESH_INTERVAL_MS);
  });

  app.on("before-quit", () => clearInterval(refreshTimer));
}
