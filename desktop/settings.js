const root = document.querySelector("#providers");

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function render() {
  const rows = await window.agentHeadroom.getProviders();
  root.innerHTML = rows.map((row) => {
    const connected = (row.accounts ?? []).some((account) => account.limits.length > 0);
    const percent = Number.isFinite(row.remainingPercent) ? `${row.remainingPercent}%` : "—";
    const accountSummary = (row.accounts ?? []).map((account) => {
      const minimum = Math.min(...account.limits.map((limit) => limit.remainingPercent));
      return `${escapeHtml(account.label)} ${Number.isFinite(minimum) ? `${minimum}%` : "—"}`;
    }).join(" · ");
    const status = row.mode === "automatic"
      ? (row.error ? `자동 조회 오류 · ${escapeHtml(row.error)}` : connected ? `공식 CLI 자동 동기화 · ${accountSummary}` : "공식 CLI 연결 대기")
      : row.mode === "adapter"
        ? `로컬 자동 어댑터 · ${accountSummary}`
        : "공식 자동 커넥터가 제공되면 활성화됩니다";
    return `
      <section class="provider" data-id="${escapeHtml(row.id)}">
        <div><div class="name">${escapeHtml(row.name)}</div><div class="meta">${status}</div></div>
        <div class="value">${percent}</div>
        <div class="actions">
          ${row.usageUrl ? `<button class="secondary open">공식 사용량 화면</button>` : ""}
        </div>
      </section>`;
  }).join("");
}

root.addEventListener("click", async (event) => {
  const card = event.target.closest(".provider");
  if (!card) return;
  const rows = await window.agentHeadroom.getProviders();
  const row = rows.find((item) => item.id === card.dataset.id);
  if (!row) return;

  if (event.target.classList.contains("open")) {
    await window.agentHeadroom.openExternal(row.usageUrl);
  }
});

document.querySelector("#open-adapters").addEventListener("click", () => window.agentHeadroom.openAdapters());

void render();

window.addEventListener("focus", () => void render());
