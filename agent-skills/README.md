# Agent Skills For Hotspot Monitoring

This directory adds a repo-local Agent Skills suite on top of the existing hotspot monitoring project.

It does not modify the current web app, API routes, or backend behavior. All skills reuse the existing business logic in the repository and operate against the same local runtime state in `data/state.json`.

## Included skills

- `hotspot-monitor-config`: create, update, inspect, list, pause, resume, and delete monitors
- `hotspot-monitor-run`: inspect due monitors and trigger monitoring cycles
- `hotspot-monitor-brief`: generate operator-facing hotspot briefings in markdown or JSON

## Directory layout

```text
agent-skills/
  README.md
  shared/
    cli.ts
  hotspot-monitor-config/
    SKILL.md
    scripts/manage-monitor.ts
  hotspot-monitor-run/
    SKILL.md
    scripts/run-cycle.ts
  hotspot-monitor-brief/
    SKILL.md
    scripts/generate-brief.ts
```

## Design decisions

- Workspace-local only: these skills assume the current workspace is this repository.
- No UI dependency: scripts call the existing TypeScript backend directly instead of driving the web interface.
- Graceful degradation: briefing and monitoring outputs still work when OpenRouter, TwitterAPI.io, or SMTP are not configured.
- No project code impact: all additions are isolated under `agent-skills/`.

## Usage notes

- Run commands from the repository root.
- Use `npx tsx ...` to execute the bundled scripts.
- The scripts automatically load `.env` or `.env.local` values through Next.js env loading.
- The current project already includes `tsx` in dev dependencies, so no extra package install is needed.

## Quick examples

List existing monitors:

```bash
npx tsx agent-skills/hotspot-monitor-config/scripts/manage-monitor.ts list
```

Run the monitoring cycle now:

```bash
npx tsx agent-skills/hotspot-monitor-run/scripts/run-cycle.ts run
```

Generate a briefing for the last 12 hours:

```bash
npx tsx agent-skills/hotspot-monitor-brief/scripts/generate-brief.ts --hours 12
```

## Recommended next step

If you want to make these skills available outside this repository, keep them as repo-local definitions and add a thin install or sync step later. Right now they are intentionally coupled to this workspace so they can safely reuse the existing monitoring code and state.