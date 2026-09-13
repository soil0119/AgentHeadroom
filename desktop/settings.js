const root = document.querySelector("#providers");

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function localDateTimeValue(timestamp) {
  if (!Number.isFinite(timestamp)) return "";
  const date = new Date(timestamp * 1_000);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

async function render() {
  const rows = await window.agentHeadroom.getProviders();
  root.innerHTML = rows.map((row) => {
    const percent = Number.isFinite(row.remainingPercent) ? `${row.remainingPercent}%` : "--%";
    const resetsAt = row.accounts?.[0]?.limits?.[0]?.resetsAt ?? null;
    const accountSummary = (row.accounts ?? []).map((account) => {
      const minimum = Math.min(...account.limits.map((limit) => limit.remainingPercent));
      return `${escapeHtml(account.label)} ${Number.isFinite(minimum) ? `${minimum}%` : "--%"}`;
    }).join(" · ");
    const status = row.mode === "automatic"
      ? (row.error ? `자동 조회 오류 · ${escapeHtml(row.error)}` : `자동 동기화${accountSummary ? ` · ${accountSummary}` : ""}`)
      : row.mode === "adapter"
        ? `로컬 어댑터${accountSummary ? ` · ${accountSummary}` : ""}`
        : "수동 기록";
    return `
      <section class="provider" data-id="${escapeHtml(row.id)}">
        <div><div class="name">${escapeHtml(row.name)}</div><div class="meta">${status}</div></div>
        <div class="value">${percent}</div>
        <div class="actions">
          ${row.mode === "manual" ? `<input class="percent-input" type="number" min="0" max="100" value="${Number.isFinite(row.remainingPercent) ? row.remainingPercent : ""}" placeholder="남은 %" /><input class="reset-input" type="datetime-local" value="${localDateTimeValue(resetsAt)}" title="리셋 시각 (선택)" /><button class="save">저장</button>` : ""}
          ${row.usageUrl ? `<button class="secondary open">사용량 열기</button>` : ""}
          ${row.id.startsWith("custom-") ? `<button class="danger remove">삭제</button>` : ""}
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

  if (event.target.classList.contains("save")) {
    const value = card.querySelector(".percent-input").value;
    const resetValue = card.querySelector(".reset-input").value;
    const resetsAt = resetValue ? Math.floor(new Date(resetValue).getTime() / 1_000) : null;
    await window.agentHeadroom.saveManual(row.id, value, resetsAt);
    await render();
  } else if (event.target.classList.contains("open")) {
    await window.agentHeadroom.openExternal(row.usageUrl);
  } else if (event.target.classList.contains("remove")) {
    await window.agentHeadroom.removeCustom(row.id);
    await render();
  }
});

document.querySelector("#add").addEventListener("click", async () => {
  const name = document.querySelector("#custom-name");
  const url = document.querySelector("#custom-url");
  if (!name.value.trim()) return;
  await window.agentHeadroom.addCustom(name.value, url.value);
  name.value = "";
  url.value = "";
  await render();
});

void render();

window.addEventListener("focus", () => void render());
