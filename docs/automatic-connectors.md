# Automatic connector policy

AgentHeadroom displays only values obtained through a documented, automatic source. It does not accept manually entered percentages and does not estimate subscription headroom from chat history.

## Built-in status

| Provider | Automatic source | Current status |
|---|---|---|
| OpenAI Codex | Local Codex app-server `account/rateLimits/read` | Built in |
| Claude Code | Claude Code status-line `rate_limits` input | Built in; user enables it once, then values refresh after Claude responses |
| Gemini CLI | Gemini CLI `/stats model` quota view | Connector pending until a stable machine-readable query is available |
| GitHub Copilot | GitHub Billing Usage REST API | Connector pending; personal and organization authorization differ |
| Cursor | Cursor Admin API usage/spend endpoints | Connector pending; team admins only, and not equivalent to personal subscription headroom |
| Grok / Windsurf | No verified public remaining-quota interface | Waiting for an official interface |

## Rules

- Never read browser cookies, private application databases, OAuth session files, chat transcripts, or OS credential stores.
- Never automate a hidden web endpoint or scrape a provider dashboard.
- API credentials must be connected explicitly and stored through an OS-provided secure mechanism before a built-in cloud connector ships.
- Local adapters must produce Adapter Protocol v1 snapshots and clearly disclose their own authentication behavior.
- If a source cannot provide a defensible denominator and reset window, the provider stays unconnected instead of showing an estimated percentage.

## Claude Code bridge

Claude Code documents `rate_limits.five_hour` and `rate_limits.seven_day` as optional status-line input after the first API response for eligible accounts. AgentHeadroom registers its packaged executable as the status-line command only after the user selects **Claude 자동 연결**.

The lightweight Node.js bridge writes only window labels, remaining percentages, reset timestamps, and the generation time. It discards every other status-line field. It also prints a compact quota summary back to Claude Code so enabling the bridge produces a useful status line instead of an empty row. A `node` executable in PATH is required; AgentHeadroom validates it before changing Claude settings.

AgentHeadroom refuses to replace an existing status-line command. Disconnecting removes the command only when it still exactly matches the command AgentHeadroom installed.
