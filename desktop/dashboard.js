const elements = {
  headline: document.querySelector("#headline"),
  subtitle: document.querySelector("#subtitle"),
  roomie: document.querySelector("#roomie"),
  providers: document.querySelector("#providers"),
  upcoming: document.querySelector("#upcoming"),
  updated: document.querySelector("#updated"),
  refresh: document.querySelector("#refresh"),
};

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function dateLabel(timestamp) {
  if (!Number.isFinite(timestamp)) return "";
  return new Intl.DateTimeFormat(undefined, {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  }).format(new Date(timestamp * 1_000));
}

function relativeLabel(timestamp) {
  if (!Number.isFinite(timestamp)) return "";
  const minutes = Math.max(0, Math.round((timestamp * 1_000 - Date.now()) / 60_000));
  if (minutes < 60) return `${minutes}분`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (hours < 24) return `${hours}시간${remainder ? ` ${remainder}분` : ""}`;
  const days = Math.floor(hours / 24);
  return `${days}일 ${hours % 24}시간`;
}

function limitMarkup(provider, account, limit) {
  const percent = limit.remainingPercent;
  const tone = percent < 15 ? "critical" : percent < 35 ? "warn" : "";
  const accountLabel = account.label === "Default" ? "" : ` · ${escapeHtml(account.label)}`;
  return `<div class="account">
    <div class="limit-head"><span>${escapeHtml(limit.label)}${accountLabel}</span><strong>${percent}% 남음</strong></div>
    <div class="track"><div class="fill ${tone}" style="width:${percent}%"></div></div>
    ${Number.isFinite(limit.resetsAt) ? `<div class="reset">리셋 ${relativeLabel(limit.resetsAt)} 후 · ${dateLabel(limit.resetsAt)}</div>` : ""}
  </div>`;
}

async function render() {
  const data = await window.agentHeadroom.getDashboard();
  const percent = data.headlineRemainingPercent;
  elements.headline.textContent = Number.isFinite(percent) ? `${percent}%` : "--%";
  elements.subtitle.textContent = data.lowest
    ? `가장 빠른 고갈 · ${data.lowest.providerName}${data.lowest.accountLabel === "Default" ? "" : ` · ${data.lowest.accountLabel}`} · ${data.lowest.limitLabel}`
    : "표시할 사용량을 설정하세요";
  elements.roomie.textContent = !Number.isFinite(percent) ? "•‿•" : percent < 15 ? "•︵•" : percent < 35 ? "•_•" : "•ᴗ•";
  elements.roomie.style.background = percent < 15 ? "#e5484d" : percent < 35 ? "#e99b3a" : "#5965ec";

  const active = data.providers.filter((provider) =>
    provider.accounts.some((account) => account.limits.length > 0));
  elements.providers.innerHTML = active.length ? active.map((provider) => {
    const mode = provider.mode === "automatic" ? "AUTO" : provider.mode === "adapter" ? "ADAPTER" : "MANUAL";
    const limits = provider.accounts.flatMap((account) =>
      account.limits.map((limit) => limitMarkup(provider, account, limit))).join("");
    return `<section class="provider">
      <div class="provider-head"><span class="provider-name">${escapeHtml(provider.name)}</span><span class="mode">${mode}</span></div>
      ${limits}
    </section>`;
  }).join("") : '<div class="empty">Codex에 로그인하거나 설정에서<br />에이전트 사용량을 추가하세요.</div>';

  if (data.resets.length) {
    elements.upcoming.hidden = false;
    elements.upcoming.innerHTML = `<strong>다음 리셋</strong>${data.resets.slice(0, 3).map((reset) =>
      `${escapeHtml(reset.providerName)} · ${dateLabel(reset.resetsAt)}`).join("<br>")}`;
  } else {
    elements.upcoming.hidden = true;
  }
  elements.updated.textContent = data.lastUpdated
    ? `업데이트 ${new Date(data.lastUpdated).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
    : "업데이트 중…";
  await window.agentHeadroom.resizeDashboard(document.querySelector(".shell").scrollHeight);
}

elements.refresh.addEventListener("click", async () => {
  elements.refresh.disabled = true;
  await window.agentHeadroom.refresh();
  await render();
  elements.refresh.disabled = false;
});
document.querySelector("#settings").addEventListener("click", () => window.agentHeadroom.openSettings());
document.querySelector("#quit").addEventListener("click", () => window.agentHeadroom.quit());

window.agentHeadroom.onDashboardChanged(() => void render());
void render();
