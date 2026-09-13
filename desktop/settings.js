const root = document.querySelector("#providers");
const message = document.querySelector("#message");

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
    const status = row.id === "claude" && row.connectorInstalled && !connected
      ? "자동 연결됨 · Claude Code에서 첫 응답 후 표시됩니다"
      : row.id === "cursor" && !row.connectorInstalled
        ? "팀 관리자만 공식 Admin API로 연결할 수 있습니다"
      : row.mode === "automatic"
      ? (row.error ? `자동 조회 오류 · ${escapeHtml(row.error)}` : connected ? `공식 자동 동기화 · ${accountSummary}` : "공식 연결 대기")
      : row.mode === "adapter"
        ? `로컬 자동 어댑터 · ${accountSummary}`
        : "공식 자동 커넥터가 제공되면 활성화됩니다";
    return `
      <section class="provider" data-id="${escapeHtml(row.id)}">
        <div><div class="name">${escapeHtml(row.name)}</div><div class="meta">${status}</div></div>
        <div class="value">${percent}</div>
        <div class="actions">
          ${row.id === "claude" ? `<button class="${row.connectorInstalled ? "danger disconnect-claude" : "connect-claude"}">${row.connectorInstalled ? "연결 해제" : "Claude 자동 연결"}</button>` : ""}
          ${row.id === "cursor" && !row.connectorInstalled ? `<input class="cursor-key" type="password" maxlength="512" autocomplete="off" spellcheck="false" aria-label="Cursor Team Admin API key" placeholder="Cursor Team Admin API key" /><button class="connect-cursor">Cursor 팀 연결</button>` : ""}
          ${row.id === "cursor" && row.connectorInstalled ? `<button class="danger disconnect-cursor">연결 해제</button>` : ""}
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

  message.textContent = "";
  try {
    if (event.target.classList.contains("open")) {
      await window.agentHeadroom.openExternal(row.usageUrl);
    } else if (event.target.classList.contains("connect-claude")) {
      await window.agentHeadroom.installClaude();
      await render();
    } else if (event.target.classList.contains("disconnect-claude")) {
      await window.agentHeadroom.removeClaude();
      await render();
    } else if (event.target.classList.contains("connect-cursor")) {
      const apiKey = card.querySelector(".cursor-key")?.value ?? "";
      await window.agentHeadroom.installCursor(apiKey);
      await render();
    } else if (event.target.classList.contains("disconnect-cursor")) {
      await window.agentHeadroom.removeCursor();
      await render();
    }
  } catch (error) {
    message.textContent = error.message;
  }
});

document.querySelector("#open-adapters").addEventListener("click", () => window.agentHeadroom.openAdapters());

void render();

window.addEventListener("focus", () => void render());
