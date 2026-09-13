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
    mode: "manual",
    usageUrl: "https://claude.ai/settings/usage",
  },
  {
    id: "grok",
    name: "Grok",
    mode: "manual",
    usageUrl: "https://grok.com/settings/usage",
  },
  {
    id: "gemini",
    name: "Gemini CLI",
    mode: "manual",
    usageUrl: "https://one.google.com/explore-plan/google-ai-pro",
  },
  {
    id: "copilot",
    name: "GitHub Copilot",
    mode: "manual",
    usageUrl: "https://github.com/settings/billing/summary",
  },
  {
    id: "cursor",
    name: "Cursor",
    mode: "manual",
    usageUrl: "https://cursor.com/dashboard",
  },
  {
    id: "windsurf",
    name: "Windsurf",
    mode: "manual",
    usageUrl: "https://windsurf.com/subscription/manage-plan",
  },
];

export function clampPercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.min(100, Math.max(0, Math.round(number)));
}

export function normalizeProviderState(input = {}) {
  const manual = input.manual && typeof input.manual === "object"
    ? Object.fromEntries(Object.entries(input.manual).flatMap(([id, item]) => {
      const remainingPercent = clampPercent(item?.remainingPercent);
      if (remainingPercent === null) return [];
      return [[id, {
        remainingPercent,
        updatedAt: typeof item.updatedAt === "string" ? item.updatedAt : null,
        resetsAt: Number.isFinite(Number(item.resetsAt)) ? Number(item.resetsAt) : null,
      }]];
    }))
    : {};

  const custom = Array.isArray(input.custom)
    ? input.custom.flatMap((item) => {
      const name = typeof item?.name === "string" ? item.name.trim().slice(0, 60) : "";
      if (!name) return [];
      const id = typeof item.id === "string" && item.id.trim()
        ? item.id.trim()
        : `custom-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
      const usageUrl = typeof item.usageUrl === "string" && /^https:\/\//i.test(item.usageUrl)
        ? item.usageUrl
        : null;
      return [{ id, name, mode: "manual", usageUrl }];
    })
    : [];

  return { manual, custom };
}

export function providerRows({ state, codexSummary = null, codexError = null } = {}) {
  const normalized = normalizeProviderState(state);
  return [...BUILTIN_PROVIDERS, ...normalized.custom].map((provider) => {
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
    const manual = normalized.manual[provider.id];
    return {
      ...provider,
      remainingPercent: manual?.remainingPercent ?? null,
      updatedAt: manual?.updatedAt ?? null,
      error: null,
      accounts: Number.isFinite(manual?.remainingPercent) ? [{
        id: "default",
        label: "Default",
        limits: [{
          id: "manual",
          label: "Manual",
          remainingPercent: manual.remainingPercent,
          resetsAt: manual.resetsAt ?? null,
        }],
      }] : [],
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
