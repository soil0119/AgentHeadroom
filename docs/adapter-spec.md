# AgentHeadroom Adapter Protocol v1

AgentHeadroom can read any AI agent's quota without knowing or storing its credentials. An adapter is a local executable plus a manifest. The executable writes one JSON snapshot to standard output and exits.

Machine-readable schemas: [manifest](adapter-manifest.schema.json) · [output](adapter-output.schema.json)

## Security boundary

- AgentHeadroom never invokes a shell. It launches the configured executable with an argument array.
- Adapter output is capped at 1 MB and execution at 30 seconds.
- Only install adapters you trust. An adapter is local code and has the same user permissions as AgentHeadroom.
- Adapters should prefer an official CLI or API. If an adapter reads credentials, it must disclose that behavior itself; AgentHeadroom does not provide credentials to it.

## Manifest

Place one or more `*.json` manifests in the adapters directory opened from the tray menu. A relative executable path is resolved from that directory.

```json
{
  "schemaVersion": 1,
  "id": "example-agent",
  "executable": "./example-agent-adapter",
  "args": ["--json"],
  "timeoutMs": 10000
}
```

Set `AGENT_HEADROOM_ADAPTERS_DIR` to use a different directory.

## Snapshot

`remainingPercent` is always `0...100`. `resetsAt` is an optional Unix timestamp in seconds. A provider may return many personal, team, or organization accounts and each account may return multiple rolling windows.

```json
{
  "schemaVersion": 1,
  "generatedAt": "2026-09-13T09:00:00.000Z",
  "providers": [
    {
      "id": "example-agent",
      "name": "Example Agent",
      "usageUrl": "https://example.com/account/usage",
      "accounts": [
        {
          "id": "personal",
          "label": "Personal",
          "limits": [
            {
              "id": "weekly",
              "label": "Weekly",
              "remainingPercent": 64,
              "resetsAt": 1789300000
            }
          ]
        },
        {
          "id": "team-acme",
          "label": "Acme Team",
          "limits": [
            {
              "id": "monthly",
              "label": "Monthly",
              "remainingPercent": 82,
              "resetsAt": 1790790000
            }
          ]
        }
      ]
    }
  ]
}
```

The tray number is the lowest remaining percentage across all providers, accounts, and limits. Reset times are shown in chronological order.
