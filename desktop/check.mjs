import { fetchRateLimits, resolveCodexPath } from "./core.mjs";

try {
  const codexPath = await resolveCodexPath();
  const summary = await fetchRateLimits({ codexPath, locale: "ko" });
  console.log(`codexPath=${codexPath}`);
  console.log(`remainingPercent=${summary.headlineRemainingPercent}`);
  for (const limit of summary.limits) {
    const windows = limit.windows
      .map((window) => `${window.label}:${window.remainingPercent}%`)
      .join(",");
    console.log(`${limit.name}=${windows}`);
  }
} catch (error) {
  console.error(`error=${error.message}`);
  process.exitCode = 1;
}
