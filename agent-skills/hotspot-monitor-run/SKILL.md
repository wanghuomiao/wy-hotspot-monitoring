---
name: hotspot-monitor-run
description: Run or inspect the hotspot monitoring cycle for the wy-hotspot-monitoring workspace. Use this skill whenever the user asks to scan now, trigger a monitor manually, check which monitors are due, validate the monitoring pipeline, or see the latest run results and new hotspots. Prefer this skill over using the web UI when the request is operational.
---

# Hotspot Monitor Run

This is a workspace-local operational skill for the wy-hotspot-monitoring repository.

Use it to inspect due monitors and trigger monitoring cycles through the existing backend execution path.

## When to use

Use this skill whenever the user wants to:

- run a full monitoring cycle immediately
- run a specific monitor immediately
- check which monitors are due
- inspect latest execution results
- validate whether the monitoring pipeline is healthy

## Working rules

- Run commands from the repository root.
- Start with status if the user asks a diagnostic or health question.
- Use targeted runs when the user mentions one specific monitor.
- Report both the execution result and the latest hotspots or logs so the user sees impact, not just counts.

## Commands

Inspect status and due monitors:

```bash
npx tsx agent-skills/hotspot-monitor-run/scripts/run-cycle.ts status
```

Run all due monitors immediately:

```bash
npx tsx agent-skills/hotspot-monitor-run/scripts/run-cycle.ts run
```

Run a specific monitor:

```bash
npx tsx agent-skills/hotspot-monitor-run/scripts/run-cycle.ts run --monitor-id <monitor-id>
```

Run without forcing if you only want due monitors to execute:

```bash
npx tsx agent-skills/hotspot-monitor-run/scripts/run-cycle.ts run --force false
```

## Response handling

- Highlight `processedMonitors`, `newHotspots`, and `notifications` first.
- Include notable hotspots from the result when there are any.
- Mention degraded capability when OpenRouter, TwitterAPI.io, or SMTP are unavailable.
- If a run produces zero results, explain whether that was because nothing was due or because no new hotspots were found.