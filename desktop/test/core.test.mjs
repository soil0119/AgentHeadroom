import assert from "node:assert/strict";
import test from "node:test";
import {
  codexCandidates,
  remainingPercent,
  summarizeRateLimits,
  windowLabel,
} from "../core.mjs";

const fixture = {
  rateLimits: {
    limitId: "codex",
    limitName: null,
    primary: { usedPercent: 18, windowDurationMins: 10_080, resetsAt: 1_789_808_429 },
    secondary: null,
  },
  rateLimitsByLimitId: {
    spark: {
      limitId: "spark",
      limitName: "Codex Spark",
      primary: { usedPercent: 0, windowDurationMins: 300, resetsAt: 1_789_306_585 },
      secondary: { usedPercent: 0, windowDurationMins: 10_080, resetsAt: 1_789_893_385 },
    },
    codex: {
      limitId: "codex",
      limitName: null,
      primary: { usedPercent: 18, windowDurationMins: 10_080, resetsAt: 1_789_808_429 },
      secondary: null,
    },
  },
};

test("remaining percentage is rounded and clamped", () => {
  assert.equal(remainingPercent(18), 82);
  assert.equal(remainingPercent(41.4), 59);
  assert.equal(remainingPercent(-20), 100);
  assert.equal(remainingPercent(150), 0);
});

test("window labels are localized", () => {
  assert.equal(windowLabel(300, "ko"), "5시간 한도");
  assert.equal(windowLabel(10_080, "ko"), "주간 한도");
  assert.equal(windowLabel(300, "en"), "5-hour limit");
});

test("summary prefers the general Codex limit for its headline", () => {
  const summary = summarizeRateLimits(fixture, "ko");
  assert.equal(summary.headlineRemainingPercent, 82);
  assert.equal(summary.limits[0].name, "Codex");
  assert.equal(summary.limits.length, 2);
  assert.equal(summary.limits[1].windows[0].label, "5시간 한도");
});

test("Windows candidates include the official standalone install location", () => {
  const candidates = codexCandidates({
    platform: "win32",
    home: "C:\\Users\\Ada",
    env: { LOCALAPPDATA: "C:\\Users\\Ada\\AppData\\Local" },
  });
  assert.ok(candidates.includes(
    "C:\\Users\\Ada\\AppData\\Local\\Programs\\OpenAI\\Codex\\bin\\codex.exe",
  ));
});
