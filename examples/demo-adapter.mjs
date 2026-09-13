#!/usr/bin/env node

process.stdout.write(JSON.stringify({
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  providers: [{
    id: "demo-agent",
    name: "Demo Agent",
    usageUrl: "https://example.com/usage",
    accounts: [
      {
        id: "personal",
        label: "Personal",
        limits: [{
          id: "weekly",
          label: "Weekly",
          remainingPercent: 64,
          resetsAt: Math.floor(Date.now() / 1_000) + 86_400,
        }],
      },
      {
        id: "team",
        label: "Team",
        limits: [{
          id: "monthly",
          label: "Monthly",
          remainingPercent: 82,
          resetsAt: Math.floor(Date.now() / 1_000) + 172_800,
        }],
      },
    ],
  }],
}));
