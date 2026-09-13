# Changelog

## 0.2.0 — 2026-09-13

- Rename the product to AgentHeadroom.
- Ship the same Electron provider engine on macOS, Windows, and Linux.
- Add an automatic-connector catalog for common AI agents; unsupported providers remain unset rather than accepting manual or estimated values.
- Add public Adapter Protocol v1 with multi-provider, multi-account, and multi-window snapshots.
- Show the tightest remaining quota as the tray headline and reset events in chronological order.
- Add a native-positioned tray popover with provider/account progress bars and quick controls.
- Add the original Roomie status mascot.
- Add `AGENT_HEADROOM_CODEX_PATH` while retaining previous Codex path overrides.

## 0.1.0 — 2026-09-13

- Show the remaining Codex allowance as a percentage in the macOS menu bar.
- Display each available 5-hour and weekly window with its reset time.
- Refresh automatically every 60 seconds or manually from the popover.
- Query the signed-in Codex CLI without storing API keys or authentication tokens.
