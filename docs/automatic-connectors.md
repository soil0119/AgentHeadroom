# Automatic connector policy

AgentHeadroom displays only values obtained through a documented, automatic source. It does not accept manually entered percentages and does not estimate subscription headroom from chat history.

## Built-in status

| Provider | Automatic source | Current status |
|---|---|---|
| OpenAI Codex | Local Codex app-server `account/rateLimits/read` | Built in |
| Claude Code | Claude Code status-line rate-limit data or Anthropic Admin Usage API | Connector pending; availability differs by account and CLI version |
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
