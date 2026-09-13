export const BUILTIN_PROVIDERS = [
  {
    id: "codex",
    name: "OpenAI Codex",
    mode: "automatic",
    usageUrl: "https://chatgpt.com/codex/settings/usage",
  },
  {
    id: "claude",
    name: "Claude Code",
    mode: "connector",
    usageUrl: "https://claude.ai/settings/usage",
  },
  {
    id: "grok",
    name: "Grok",
    mode: "connector",
    usageUrl: "https://grok.com/settings/usage",
  },
  {
    id: "gemini",
    name: "Gemini CLI",
    mode: "connector",
    usageUrl: "https://one.google.com/explore-plan/google-ai-pro",
  },
  {
    id: "copilot",
    name: "GitHub Copilot",
    mode: "connector",
    usageUrl: "https://github.com/settings/billing/summary",
  },
  {
    id: "cursor",
    name: "Cursor",
    mode: "connector",
    usageUrl: "https://cursor.com/dashboard",
  },
  {
    id: "windsurf",
    name: "Windsurf",
    mode: "connector",
    usageUrl: "https://windsurf.com/subscription/manage-plan",
  },
];

export function clampPercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.min(100, Math.max(0, Math.round(number)));
}

export function providerRows({ codexSummary = null, codexError = null } = {}) {
  return BUILTIN_PROVIDERS.map((provider) => {
    if (provider.id === "codex") {
      const limits = (codexSummary?.limits ?? []).flatMap((limit) =>
        limit.windows.map((window, index) => ({
          id: `${limit.id}-${index}`,
          label: `${limit.name} · ${window.label}`,
          remainingPercent: window.remainingPercent,
          resetsAt: window.resetsAt,
        })));
      return {
        ...provider,
        remainingPercent: codexSummary?.headlineRemainingPercent ?? null,
        updatedAt: codexSummary ? new Date().toISOString() : null,
        error: codexError,
        accounts: [{ id: "default", label: "Default", limits }],
      };
    }
    return {
      ...provider,
      remainingPercent: null,
      updatedAt: null,
      error: null,
      accounts: [],
    };
  });
}

export function overallRemaining(rows) {
  const values = rows.map((row) => row.remainingPercent).filter(Number.isFinite);
  return values.length > 0 ? Math.min(...values) : null;
}

export function lowestHeadroom(rows) {
  const candidates = rows.flatMap((provider) =>
    (provider.accounts ?? []).flatMap((account) =>
      (account.limits ?? []).map((limit) => ({ provider, account, limit }))));
  return candidates
    .filter((entry) => Number.isFinite(entry.limit.remainingPercent))
    .sort((left, right) => left.limit.remainingPercent - right.limit.remainingPercent)[0] ?? null;
}

export function resetSequence(rows, nowSeconds = Date.now() / 1_000) {
  return rows.flatMap((provider) =>
    (provider.accounts ?? []).flatMap((account) =>
      (account.limits ?? []).flatMap((limit) => {
        if (!Number.isFinite(limit.resetsAt) || limit.resetsAt <= nowSeconds) return [];
        return [{
          providerName: provider.name,
          accountLabel: account.label,
          limitLabel: limit.label,
          resetsAt: limit.resetsAt,
        }];
      })))
    .sort((left, right) => left.resetsAt - right.resetsAt);
}

export function adapterSnapshotRows(snapshots = []) {
  return snapshots.flatMap((snapshot) => snapshot.providers.map((provider) => {
    const limits = provider.accounts.flatMap((account) => account.limits);
    return {
      id: `adapter:${snapshot.adapterId}:${provider.id}`,
      name: provider.name,
      mode: "adapter",
      usageUrl: provider.usageUrl ?? null,
      remainingPercent: limits.length > 0
        ? Math.min(...limits.map((limit) => limit.remainingPercent))
        : null,
      updatedAt: snapshot.generatedAt,
      error: null,
      accounts: provider.accounts,
    };
  }));
}
