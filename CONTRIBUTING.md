# Contributing to AgentHeadroom

Issues and pull requests are welcome. Keep changes small, documented, and independently reviewable.

## Development

```bash
npm ci
npm test
npm run check:syntax
```

Run the relevant packaging command when changing desktop behavior:

```bash
npm run dist:mac
npm run dist:win
npm run dist:linux
```

## Pull requests

- Open a pull request against `main`; direct pushes are not accepted.
- All required CI checks and one code-owner approval must pass before merge.
- New provider connectors must use a documented public API or CLI contract.
- Never read browser cookies, provider session files, chat transcripts, or undocumented private endpoints.
- Do not add manual or estimated quota values.
- Keep credentials out of commits, logs, fixtures, screenshots, and pull-request descriptions.

The project uses squash merges so each pull request lands as one reviewable commit. Maintainers may request changes or close work that violates the privacy and automatic-data-source policy.
