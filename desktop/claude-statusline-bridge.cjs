#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const snapshotPath = process.argv[2];
let input = "";

function clamp(value) {
  return Math.min(100, Math.max(0, Math.round(value)));
}

process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  input += chunk;
  if (input.length > 1_048_576) process.exit(0);
});
process.stdin.on("end", () => {
  try {
    const source = JSON.parse(input);
    const labels = { five_hour: "5-hour limit", seven_day: "Weekly limit", spend_limit: "Spend limit" };
    const limits = Object.entries(source.rate_limits || {}).flatMap(([key, value]) => {
      const used = Number(value?.used_percentage);
      const resetsAt = Number(value?.resets_at);
      if (!Number.isFinite(used) || !Number.isFinite(resetsAt) || resetsAt <= 0) return [];
      return [{
        id: key.replaceAll("_", "-"),
        label: labels[key] || key,
        remainingPercent: clamp(100 - used),
        resetsAt,
      }];
    });
    if (limits.length > 0 && path.isAbsolute(snapshotPath)) {
      const snapshot = {
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        providers: [{
          id: "claude",
          name: "Claude Code",
          usageUrl: "https://claude.ai/settings/usage",
          accounts: [{ id: "claude-ai", label: "Claude.ai", limits }],
        }],
      };
      fs.mkdirSync(path.dirname(snapshotPath), { recursive: true });
      fs.writeFileSync(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`, { mode: 0o600 });
    }
    const short = { "five-hour": "5h", "seven-day": "7d", "spend-limit": "spend" };
    const summary = limits.map((limit) => `${short[limit.id] || limit.label} ${limit.remainingPercent}% left`).join(" · ");
    process.stdout.write(summary ? `AgentHeadroom · ${summary}\n` : "AgentHeadroom · waiting for quota data\n");
  } catch {
    process.stdout.write("AgentHeadroom · quota unavailable\n");
  }
});
