import assert from "node:assert/strict";
import test from "node:test";
import { validateAdapterSnapshot } from "../adapter-runtime.mjs";
import {
  adapterSnapshotRows,
  lowestHeadroom,
  normalizeProviderState,
  overallRemaining,
  resetSequence,
} from "../providers.mjs";

const snapshot = validateAdapterSnapshot({
  schemaVersion: 1,
  generatedAt: "2026-09-13T09:00:00.000Z",
  providers: [{
    id: "claude",
    name: "Claude Code",
    accounts: [
      {
        id: "personal",
        label: "Personal",
        limits: [{ id: "weekly", label: "Weekly", remainingPercent: 64, resetsAt: 2_000 }],
      },
      {
        id: "team",
        label: "Team",
        limits: [{ id: "weekly", label: "Weekly", remainingPercent: 21, resetsAt: 3_000 }],
      },
    ],
  }],
}, "fixture");

test("adapter snapshots preserve multiple accounts", () => {
  assert.equal(snapshot.providers[0].accounts.length, 2);
  assert.equal(snapshot.providers[0].accounts[1].label, "Team");
});

test("lowest percentage becomes the tray headline", () => {
  const rows = adapterSnapshotRows([snapshot]);
  assert.equal(overallRemaining(rows), 21);
  assert.equal(lowestHeadroom(rows).account.label, "Team");
});

test("reset sequence is chronological", () => {
  const rows = adapterSnapshotRows([snapshot]);
  assert.deepEqual(
    resetSequence(rows, 1_000).map((entry) => entry.accountLabel),
    ["Personal", "Team"],
  );
});

test("invalid percentages are rejected", () => {
  assert.throws(() => validateAdapterSnapshot({
    schemaVersion: 1,
    providers: [{
      id: "bad",
      name: "Bad",
      accounts: [{ id: "a", label: "A", limits: [{ id: "x", label: "X" }] }],
    }],
  }));
});

test("manual provider values are clamped and unknown fields are removed", () => {
  const state = normalizeProviderState({
    manual: { grok: { remainingPercent: 120, secret: "do-not-store" } },
  });
  assert.deepEqual(state.manual.grok.remainingPercent, 100);
  assert.equal("secret" in state.manual.grok, false);
});
