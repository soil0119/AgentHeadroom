import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  agentHeadroomUserDataPath,
  captureClaudeStatusLine,
  claudeStatusLineCommand,
  installClaudeConnector,
  readClaudeSnapshot,
  removeClaudeConnector,
  snapshotFromClaudeStatusLine,
} from "../claude-connector.mjs";

const fixture = {
  rate_limits: {
    five_hour: { used_percentage: 23.5, resets_at: 2_000 },
    seven_day: { used_percentage: 41.2, resets_at: 3_000 },
  },
};

function runBundledBridge(snapshotPath, input) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [
      path.join(import.meta.dirname, "..", "claude-statusline-bridge.cjs"),
      snapshotPath,
    ], { stdio: ["pipe", "pipe", "pipe"] });
    let output = "";
    child.stdout.on("data", (chunk) => { output += chunk; });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve(output) : reject(new Error(`bridge exited ${code}`)));
    child.stdin.end(JSON.stringify(input));
  });
}

test("connector data path matches Electron defaults on every platform", () => {
  assert.equal(
    agentHeadroomUserDataPath({ platform: "darwin", env: {}, home: "/Users/ada" }),
    "/Users/ada/Library/Application Support/agent-headroom",
  );
  assert.equal(
    agentHeadroomUserDataPath({ platform: "win32", env: { APPDATA: "C:\\Users\\Ada\\AppData\\Roaming" }, home: "C:\\Users\\Ada" }),
    "C:\\Users\\Ada\\AppData\\Roaming/agent-headroom",
  );
  assert.equal(
    agentHeadroomUserDataPath({ platform: "linux", env: { XDG_CONFIG_HOME: "/config" }, home: "/home/ada" }),
    "/config/agent-headroom",
  );
});

test("Claude status line quota becomes remaining-percent snapshot", () => {
  const snapshot = snapshotFromClaudeStatusLine(fixture, "2026-09-13T00:00:00.000Z");
  const limits = snapshot.providers[0].accounts[0].limits;
  assert.deepEqual(limits.map((limit) => limit.remainingPercent), [77, 59]);
});

test("bridge writes only quota fields and returns a useful status line", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "agent-headroom-claude-"));
  const snapshotPath = path.join(directory, "snapshot.json");
  const text = await captureClaudeStatusLine({ input: JSON.stringify({ ...fixture, transcript_path: "/secret/chat.jsonl" }), snapshotPath });
  const written = await readFile(snapshotPath, "utf8");
  assert.match(text, /5h 77% left/);
  assert.doesNotMatch(written, /transcript|secret/);
});

test("bundled lightweight bridge filters Claude session metadata", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "agent-headroom-claude-script-"));
  const snapshotPath = path.join(directory, "snapshot.json");
  const output = await runBundledBridge(snapshotPath, {
    ...fixture,
    transcript_path: "/secret/chat.jsonl",
    session_id: "private-session",
  });
  const written = await readFile(snapshotPath, "utf8");
  assert.match(output, /5h 77% left/);
  assert.doesNotMatch(written, /secret|transcript|private-session/);
});

test("expired Claude limits are not displayed", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "agent-headroom-claude-"));
  const snapshotPath = path.join(directory, "snapshot.json");
  await writeFile(snapshotPath, JSON.stringify(snapshotFromClaudeStatusLine(fixture)));
  const snapshot = await readClaudeSnapshot(snapshotPath, 2_500);
  assert.deepEqual(snapshot.providers[0].accounts[0].limits.map((limit) => limit.id), ["seven-day"]);
});

test("connector install is reversible and refuses to overwrite another status line", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "agent-headroom-claude-"));
  const settingsPath = path.join(directory, ".claude", "settings.json");
  const markerPath = path.join(directory, "marker.json");
  const snapshotPath = path.join(directory, "snapshot.json");
  const bridgeScriptPath = path.join(directory, ".claude", "agent-headroom-statusline.cjs");
  await installClaudeConnector({
    settingsPath,
    markerPath,
    nodeExecutable: "node",
    bridgeScriptPath,
    bridgeScriptContent: "// bridge\n",
    snapshotPath,
    platform: "darwin",
  });
  const installed = JSON.parse(await readFile(settingsPath, "utf8"));
  assert.match(installed.statusLine.command, /agent-headroom-statusline\.cjs/);
  await removeClaudeConnector({ settingsPath, markerPath, snapshotPath, bridgeScriptPath });
  const removed = JSON.parse(await readFile(settingsPath, "utf8"));
  assert.equal(removed.statusLine, undefined);

  await writeFile(settingsPath, JSON.stringify({ statusLine: { type: "command", command: "custom-status" } }));
  await assert.rejects(
    installClaudeConnector({
      settingsPath,
      markerPath,
      nodeExecutable: "node",
      bridgeScriptPath,
      bridgeScriptContent: "// bridge\n",
      snapshotPath,
    }),
    /기존 Claude Code status line/,
  );
});

test("status line command quotes paths with spaces", () => {
  const command = claudeStatusLineCommand({
    nodeExecutable: "node",
    bridgeScriptPath: "/Users/Ada Library/.claude/agent-headroom-statusline.cjs",
    snapshotPath: "/Users/Ada Library/AgentHeadroom/claude.json",
    platform: "darwin",
  });
  assert.equal(command, "'node' '/Users/Ada Library/.claude/agent-headroom-statusline.cjs' '/Users/Ada Library/AgentHeadroom/claude.json'");
});
