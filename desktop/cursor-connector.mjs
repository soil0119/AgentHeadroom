const CURSOR_SPEND_URL = "https://api.cursor.com/teams/spend";
const PAGE_SIZE = 100;
const MAX_PAGES = 100;

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function clampPercent(value) {
  return Math.min(100, Math.max(0, Math.round(value)));
}

export function nextMonthlyReset(subscriptionCycleStart) {
  const startMilliseconds = finiteNumber(subscriptionCycleStart);
  if (startMilliseconds === null || startMilliseconds <= 0) return null;
  const start = new Date(startMilliseconds);
  if (Number.isNaN(start.getTime())) return null;

  const targetYear = start.getUTCMonth() === 11
    ? start.getUTCFullYear() + 1
    : start.getUTCFullYear();
  const targetMonth = (start.getUTCMonth() + 1) % 12;
  const lastTargetDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const targetDay = Math.min(start.getUTCDate(), lastTargetDay);
  return Date.UTC(
    targetYear,
    targetMonth,
    targetDay,
    start.getUTCHours(),
    start.getUTCMinutes(),
    start.getUTCSeconds(),
    start.getUTCMilliseconds(),
  ) / 1_000;
}

export function cursorSnapshotFromSpend(payload, generatedAt = new Date().toISOString()) {
  const resetsAt = nextMonthlyReset(payload?.subscriptionCycleStart);
  const members = Array.isArray(payload?.teamMemberSpend) ? payload.teamMemberSpend : [];
  const accounts = members.flatMap((member, index) => {
    const spendCents = finiteNumber(member?.spendCents);
    const limitDollars = finiteNumber(member?.effectivePerUserLimitDollars);
    if (spendCents === null || spendCents < 0 || limitDollars === null || limitDollars <= 0) return [];

    const name = typeof member.name === "string" ? member.name.trim() : "";
    const email = typeof member.email === "string" ? member.email.trim() : "";
    const label = name && email ? `${name} · ${email}` : name || email || `Member ${index + 1}`;
    return [{
      id: String(member.userId || email || `member-${index + 1}`),
      label,
      limits: [{
        id: "monthly-on-demand-spend",
        label: "Monthly on-demand spend",
        remainingPercent: clampPercent(100 - (spendCents / (limitDollars * 100)) * 100),
        ...(resetsAt ? { resetsAt } : {}),
      }],
    }];
  });

  return {
    schemaVersion: 1,
    generatedAt,
    adapterId: "builtin-cursor-team",
    providers: [{
      id: "cursor-team",
      name: "Cursor Team",
      usageUrl: "https://cursor.com/dashboard",
      accounts,
    }],
  };
}

function authorizationHeader(apiKey) {
  const key = typeof apiKey === "string" ? apiKey.trim() : "";
  if (!key || key.length > 512) throw new Error("Cursor Team Admin API 키를 확인하세요.");
  return `Basic ${Buffer.from(`${key}:`, "utf8").toString("base64")}`;
}

async function requestSpendPage({ apiKey, page, fetchImpl }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetchImpl(CURSOR_SPEND_URL, {
      method: "POST",
      headers: {
        Authorization: authorizationHeader(apiKey),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ page, pageSize: PAGE_SIZE }),
      signal: controller.signal,
    });
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new Error("Cursor Team Admin API 키 또는 관리자 권한을 확인하세요.");
      }
      throw new Error(`Cursor Admin API가 HTTP ${response.status}로 응답했습니다.`);
    }
    try {
      return await response.json();
    } catch {
      throw new Error("Cursor Admin API 응답을 읽을 수 없습니다.");
    }
  } catch (error) {
    if (error?.name === "AbortError") throw new Error("Cursor Admin API 응답 시간이 초과되었습니다.");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchCursorTeamSpend({
  apiKey,
  fetchImpl = globalThis.fetch,
  generatedAt = new Date().toISOString(),
} = {}) {
  if (typeof fetchImpl !== "function") throw new Error("Cursor Admin API를 호출할 수 없습니다.");
  const first = await requestSpendPage({ apiKey, page: 1, fetchImpl });
  const totalPages = Math.min(MAX_PAGES, Math.max(1, Math.ceil(finiteNumber(first?.totalPages) ?? 1)));
  const pages = [first];
  for (let page = 2; page <= totalPages; page += 1) {
    pages.push(await requestSpendPage({ apiKey, page, fetchImpl }));
  }

  const snapshot = cursorSnapshotFromSpend({
    subscriptionCycleStart: first?.subscriptionCycleStart,
    teamMemberSpend: pages.flatMap((page) => Array.isArray(page?.teamMemberSpend) ? page.teamMemberSpend : []),
  }, generatedAt);
  if (snapshot.providers[0].accounts.length === 0) {
    throw new Error("Cursor 팀에서 적용 중인 팀원별 지출 한도를 찾지 못했습니다.");
  }
  return snapshot;
}
