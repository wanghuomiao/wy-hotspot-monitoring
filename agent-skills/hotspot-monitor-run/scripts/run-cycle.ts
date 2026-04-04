import { loadEnvConfig } from "@next/env";

import { getDashboardData, runMonitoringCycle } from "../../../lib/monitor";
import type { Monitor } from "../../../lib/schema";
import { ensureWorkspaceRoot, fail, getBooleanFlag, parseCliArgs, printJson } from "../../../agent-skills/shared/cli";

const usage = [
  "Usage:",
  "  npx tsx agent-skills/hotspot-monitor-run/scripts/run-cycle.ts status",
  "  npx tsx agent-skills/hotspot-monitor-run/scripts/run-cycle.ts run",
  "  npx tsx agent-skills/hotspot-monitor-run/scripts/run-cycle.ts run --monitor-id <monitor-id>",
  "  npx tsx agent-skills/hotspot-monitor-run/scripts/run-cycle.ts run --monitor-id <monitor-id> --force false",
].join("\n");

function isMonitorDue(monitor: Monitor, force: boolean) {
  if (force) {
    return true;
  }

  if (!monitor.enabled) {
    return false;
  }

  if (!monitor.lastCheckedAt) {
    return true;
  }

  const nextDueAt = new Date(monitor.lastCheckedAt).getTime() + monitor.intervalMinutes * 60_000;
  return Date.now() >= nextDueAt;
}

function monitorStatus(monitor: Monitor) {
  return {
    id: monitor.id,
    name: monitor.name,
    enabled: monitor.enabled,
    due: isMonitorDue(monitor, false),
    keyword: monitor.keyword,
    scope: monitor.scope,
    intervalMinutes: monitor.intervalMinutes,
    lastCheckedAt: monitor.lastCheckedAt,
    lastTriggeredAt: monitor.lastTriggeredAt,
    sources: monitor.sources,
  };
}

async function main() {
  const workspaceRoot = ensureWorkspaceRoot();
  loadEnvConfig(workspaceRoot);

  const cli = parseCliArgs(process.argv.slice(2));
  const command = cli.command || "status";

  if (command === "status") {
    const snapshot = await getDashboardData();

    printJson({
      command,
      diagnostics: snapshot.diagnostics,
      stats: snapshot.stats,
      dueMonitors: snapshot.monitors.filter((monitor) => isMonitorDue(monitor, false)).map(monitorStatus),
      monitors: snapshot.monitors.map(monitorStatus),
    });
    return;
  }

  if (command === "run") {
    const monitorId = typeof cli.flags["monitor-id"] === "string" ? cli.flags["monitor-id"] : undefined;
    const force = getBooleanFlag(cli.flags, "force") ?? true;

    const result = await runMonitoringCycle({ monitorId, force });
    const snapshot = await getDashboardData();
    const latestHotspots = snapshot.hotspots
      .filter((hotspot) => !monitorId || hotspot.monitorId === monitorId)
      .slice(0, 8)
      .map((hotspot) => ({
        id: hotspot.id,
        monitorId: hotspot.monitorId,
        monitorName: hotspot.monitorName,
        title: hotspot.title,
        sourceLabel: hotspot.sourceLabel,
        url: hotspot.url,
        heatScore: hotspot.ai.heatScore,
        verdict: hotspot.ai.verdict,
        discoveredAt: hotspot.discoveredAt,
      }));
    const latestRuns = snapshot.runs
      .filter((run) => !monitorId || run.monitorId === monitorId)
      .slice(0, 8);

    printJson({
      command,
      monitorId: monitorId || null,
      force,
      result,
      diagnostics: snapshot.diagnostics,
      stats: snapshot.stats,
      latestHotspots,
      latestRuns,
    });
    return;
  }

  fail(`Unsupported command: ${command}`, usage);
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});