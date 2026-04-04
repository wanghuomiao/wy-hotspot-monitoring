---
name: hotspot-monitor-brief
description: Generate a concise hotspot briefing from the wy-hotspot-monitoring workspace state. Use this skill whenever the user asks for a hotspot digest, trend summary, recent signal review, shift report, or operator-ready briefing, especially when they want a quick readout instead of raw JSON or the full dashboard.
---

# Hotspot Monitor Brief

This is a workspace-local reporting skill for the wy-hotspot-monitoring repository.

Use it to turn recent hotspot state into a concise operator briefing. It can optionally aggregate the results with OpenRouter and falls back to deterministic summaries when no API key is configured.

## When to use

Use this skill whenever the user wants to:

- summarize recent hotspots
- generate a monitor-specific digest
- produce a daily or hourly briefing
- turn raw monitoring output into action items

## Working rules

- Run commands from the repository root.
- Default to the last 24 hours unless the user specifies a window.
- Narrow to one monitor when the user asks about a specific radar or topic.
- Prefer markdown output for human-readable reports and JSON output for downstream automation.

## Commands

Generate the default markdown briefing:

```bash
npx tsx agent-skills/hotspot-monitor-brief/scripts/generate-brief.ts
```

Generate a monitor-specific briefing:

```bash
npx tsx agent-skills/hotspot-monitor-brief/scripts/generate-brief.ts --monitor-id <monitor-id>
```

Change the time window and number of hotspots:

```bash
npx tsx agent-skills/hotspot-monitor-brief/scripts/generate-brief.ts --hours 12 --limit 5
```

Return machine-readable JSON and skip AI aggregation:

```bash
npx tsx agent-skills/hotspot-monitor-brief/scripts/generate-brief.ts --format json --use-ai false
```

## Response handling

- Lead with the executive summary.
- Call out the strongest confirmed or watch signals.
- Separate true risk warnings from normal watch items.
- If OpenRouter is unavailable, say the briefing used the deterministic fallback path.