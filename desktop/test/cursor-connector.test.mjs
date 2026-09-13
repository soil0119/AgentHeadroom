import assert from "node:assert/strict";
import test from "node:test";
import {
  cursorSnapshotFromSpend,
  fetchCursorTeamSpend,
  nextMonthlyReset,
} from "../cursor-connector.mjs";

const cycleStart = Date.UTC(2026, 0, 31, 12, 30);

test("Cursor team spend becomes per-member remaining headroom", () => {
  const snapshot = cursorSnapshotFromSpend({
    subscriptionCycleStart: cycleStart,
    teamMemberSpend: [{
      userId: "user_alex",
      name: "Alex",
      email: "alex@example.com",
      spendCents: 2_450,
      overallSpendCents: 8_000,
      effectivePerUserLimitDollars: 100,
    }],
  }, "2026-09-13T00:00:00.000Z");

  const account = snapshot.providers[0].accounts[0];
  assert.equal(account.label, "Alex · alex@example.com");
  assert.equal(account.limits[0].remainingPercent, 76);
  assert.equal(account.limits[0].resetsAt, Date.UTC(2026, 1, 28, 12, 30) / 1_000);
});

test("monthly reset clamps end-of-month billing anniversaries", () => {
  assert.equal(nextMonthlyReset(cycleStart), Date.UTC(2026, 1, 28, 12, 30) / 1_000);
  assert.equal(nextMonthlyReset(Date.UTC(2026, 11, 15)), Date.UTC(2027, 0, 15) / 1_000);
});

test("Cursor Admin API pagination uses Basic auth without returning the key", async () => {
  const calls = [];
  const snapshot = await fetchCursorTeamSpend({
    apiKey: "key_secret",
    generatedAt: "2026-09-13T00:00:00.000Z",
    fetchImpl: async (_url, options) => {
      calls.push(options);
      const { page } = JSON.parse(options.body);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          subscriptionCycleStart: cycleStart,
          totalPages: 2,
          teamMemberSpend: [{
            userId: `user_${page}`,
            name: `Member ${page}`,
            spendCents: page * 1_000,
            effectivePerUserLimitDollars: 100,
          }],
        }),
      };
    },
  });

  assert.equal(calls.length, 2);
  assert.equal(calls[0].headers.Authorization, `Basic ${Buffer.from("key_secret:").toString("base64")}`);
  assert.deepEqual(calls.map((call) => JSON.parse(call.body).page), [1, 2]);
  assert.equal(snapshot.providers[0].accounts.length, 2);
  assert.doesNotMatch(JSON.stringify(snapshot), /key_secret/);
});

test("Cursor connector refuses responses without an enforced spend limit", async () => {
  await assert.rejects(
    fetchCursorTeamSpend({
      apiKey: "key_test",
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        json: async () => ({ teamMemberSpend: [{ spendCents: 0, effectivePerUserLimitDollars: 0 }] }),
      }),
    }),
    /적용 중인 팀원별 지출 한도/,
  );
});
