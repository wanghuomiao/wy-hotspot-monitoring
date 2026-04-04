---
name: hotspot-monitor-config
description: Manage hotspot monitoring definitions for the wy-hotspot-monitoring workspace. Use this skill whenever the user asks to create, update, pause, resume, inspect, list, or delete monitoring items, or when they want to change keywords, scopes, sources, intervals, GitHub repo allowlists, or notification email settings. Prefer this skill over editing data files manually.
---

# Hotspot Monitor Config

This is a workspace-local skill for the wy-hotspot-monitoring repository.

Use it to manage monitor definitions through the existing backend logic without touching the current web app code.

## When to use

Use this skill whenever the user wants to:

- create a new monitor
- update an existing monitor
- list current monitors
- inspect a single monitor with its recent hotspots, runs, and notifications
- pause, resume, or delete a monitor

## Working rules

- Run commands from the repository root.
- Use the bundled script instead of editing data/state.json directly.
- For destructive actions like delete, confirm intent if the user has not already been explicit.
- When changing an existing monitor, inspect it first so you preserve fields the user did not ask to change.

## Commands

List monitors:

```bash
npx tsx agent-skills/hotspot-monitor-config/scripts/manage-monitor.ts list
```

Inspect one monitor:

```bash
npx tsx agent-skills/hotspot-monitor-config/scripts/manage-monitor.ts get --id <monitor-id>
```

Print a payload template:

```bash
npx tsx agent-skills/hotspot-monitor-config/scripts/manage-monitor.ts template
```

Create or update a monitor with inline JSON:

```bash
npx tsx agent-skills/hotspot-monitor-config/scripts/manage-monitor.ts upsert --json '{"name":"AI 编程雷达","keyword":"Claude Code","scope":"AI 编程","description":"优先捕获产品发布、模型能力更新、Agent 工作流变化","sources":["webSearch","googleNews","hackerNews","githubReleases"],"intervalMinutes":20,"email":"","enabled":true,"githubRepos":["anthropics/anthropic-sdk-typescript","vercel/ai"]}'
```

Delete a monitor:

```bash
npx tsx agent-skills/hotspot-monitor-config/scripts/manage-monitor.ts delete --id <monitor-id>
```

## Payload shape

Use this JSON structure for create and update:

```json
{
  "id": "optional-existing-monitor-id",
  "name": "AI 编程雷达",
  "keyword": "Claude Code",
  "scope": "AI 编程",
  "description": "优先捕获产品发布、模型能力更新、Agent 工作流变化",
  "sources": ["webSearch", "googleNews", "hackerNews", "githubReleases"],
  "intervalMinutes": 20,
  "email": "",
  "enabled": true,
  "githubRepos": ["anthropics/anthropic-sdk-typescript", "vercel/ai"]
}
```

## Response handling

- Summarize the changed fields after upsert.
- Surface diagnostics if OpenRouter, Twitter, or SMTP are not configured.
- If validation fails, tell the user exactly which field is invalid and fix the payload rather than bypassing the script.