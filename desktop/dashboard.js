const elements = {
  headline: document.querySelector("#headline"),
  subtitle: document.querySelector("#subtitle"),
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

function limitMarkup(account, limit) {
  const percent = limit.remainingPercent;
  const tone = percent < 15 ? "critical" : percent < 35 ? "warn" : "";
  const accountLabel = account.label === "Default" ? "" : `<span class="account-label">${escapeHtml(account.label)}</span>`;
  return `<div class="account">
    <div class="limit-head"><span class="limit-title">${escapeHtml(limit.label)}${accountLabel}</span><span class="limit-value">${percent}%</span></div>
    <div class="track"><div class="fill ${tone}" style="width:${percent}%"></div></div>
    ${Number.isFinite(limit.resetsAt) ? `<div class="reset">${relativeLabel(limit.resetsAt)} 후 리셋 · ${dateLabel(limit.resetsAt)}</div>` : ""}
  </div>`;
}

async function render() {
  const data = await window.agentHeadroom.getDashboard();
  const percent = data.headlineRemainingPercent;
  elements.headline.textContent = Number.isFinite(percent) ? `${percent}%` : "—";
  elements.subtitle.textContent = data.lowest
    ? `${data.lowest.providerName}${data.lowest.accountLabel === "Default" ? "" : ` · ${data.lowest.accountLabel}`} · ${data.lowest.limitLabel}`
    : "연결된 사용량 없음";

  const active = data.providers.filter((provider) =>
    provider.accounts.some((account) => account.limits.length > 0));
  elements.providers.innerHTML = active.length ? active.map((provider) => {
    const limits = provider.accounts.flatMap((account) =>
      account.limits.map((limit) => limitMarkup(account, limit))).join("");
    return `<section class="provider">
      <div class="provider-head"><span class="provider-name">${escapeHtml(provider.name)}</span></div>
      ${limits}
    </section>`;
  }).join("") : '<div class="empty">설정에서 에이전트를 연결하면<br />남은 사용량이 여기에 표시됩니다.</div>';

  if (data.resets.length) {
    elements.upcoming.hidden = false;
    elements.upcoming.innerHTML = `<div class="section-title">다음 리셋</div>${data.resets.slice(0, 3).map((reset) =>
      `<div class="reset-row"><span>${escapeHtml(reset.providerName)}${reset.accountLabel === "Default" ? "" : ` · ${escapeHtml(reset.accountLabel)}`}</span><time>${dateLabel(reset.resetsAt)}</time></div>`).join("")}`;
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
