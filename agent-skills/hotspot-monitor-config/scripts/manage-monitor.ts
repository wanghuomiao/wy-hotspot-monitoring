import { loadEnvConfig } from "@next/env";

import { deleteMonitor, getDashboardData, upsertMonitor } from "../../../lib/monitor";
import type { Monitor, MonitorInput } from "../../../lib/schema";
import { ensureWorkspaceRoot, fail, parseCliArgs, printJson, readJsonPayload } from "../../../agent-skills/shared/cli";

const usage = [
  "Usage:",
  "  npx tsx agent-skills/hotspot-monitor-config/scripts/manage-monitor.ts list",
  "  npx tsx agent-skills/hotspot-monitor-config/scripts/manage-monitor.ts get --id <monitor-id>",
  "  npx tsx agent-skills/hotspot-monitor-config/scripts/manage-monitor.ts upsert --json '<payload-json>'",
  "  npx tsx agent-skills/hotspot-monitor-config/scripts/manage-monitor.ts upsert --file agent-skills/examples/monitor.json",
  "  npx tsx agent-skills/hotspot-monitor-config/scripts/manage-monitor.ts delete --id <monitor-id>",
  "  npx tsx agent-skills/hotspot-monitor-config/scripts/manage-monitor.ts template",
].join("\n");

function buildMonitorView(monitor: Monitor, hotspotCount: number) {
  return {
    id: monitor.id,
    name: monitor.name,
    enabled: monitor.enabled,
    keyword: monitor.keyword,
    scope: monitor.scope,
    description: monitor.description,
    sources: monitor.sources,
    intervalMinutes: monitor.intervalMinutes,
    email: monitor.email || null,
    githubRepos: monitor.githubRepos,
    hotspotCount,
    lastCheckedAt: monitor.lastCheckedAt,
    lastTriggeredAt: monitor.lastTriggeredAt,
    createdAt: monitor.createdAt,
    updatedAt: monitor.updatedAt,
  };
}

function buildTemplate() {
  return {
    name: "AI 编程雷达",
    keyword: "Claude Code",
    scope: "AI 编程",
    description: "优先捕获产品发布、模型能力更新、Agent 工作流变化",
    sources: ["webSearch", "googleNews", "hackerNews", "githubReleases"],
    intervalMinutes: 20,
    email: "",
    enabled: true,
    githubRepos: ["anthropics/anthropic-sdk-typescript", "vercel/ai"],
  } satisfies MonitorInput;
}

async function main() {
  const workspaceRoot = ensureWorkspaceRoot();
  loadEnvConfig(workspaceRoot);

  const cli = parseCliArgs(process.argv.slice(2));
  const command = cli.command || "list";

  if (command === "template") {
    printJson(buildTemplate());
    return;
  }

  if (command === "list") {
    const snapshot = await getDashboardData();
    const hotspotCountByMonitor = new Map<string, number>();

    for (const hotspot of snapshot.hotspots) {
      hotspotCountByMonitor.set(hotspot.monitorId, (hotspotCountByMonitor.get(hotspot.monitorId) || 0) + 1);
    }

    printJson({
      command,
      stats: snapshot.stats,
      diagnostics: snapshot.diagnostics,
      monitors: snapshot.monitors.map((monitor) =>
        buildMonitorView(monitor, hotspotCountByMonitor.get(monitor.id) || 0),
      ),
    });
    return;
  }

  if (command === "get") {
    const monitorId = typeof cli.flags.id === "string" ? cli.flags.id : null;

    if (!monitorId) {
      fail("Missing --id for get command.", usage);
    }

    const snapshot = await getDashboardData();
    const monitor = snapshot.monitors.find((item) => item.id === monitorId);

    if (!monitor) {
      fail(`Monitor not found: ${monitorId}`, usage);
    }

    const hotspots = snapshot.hotspots.filter((hotspot) => hotspot.monitorId === monitorId).slice(0, 10);
    const runs = snapshot.runs.filter((run) => run.monitorId === monitorId).slice(0, 10);
    const notifications = snapshot.notifications
      .filter((notification) => notification.monitorId === monitorId)
      .slice(0, 10);

    printJson({
      command,
      monitor: buildMonitorView(monitor, hotspots.length),
      hotspots,
      runs,
      notifications,
    });
    return;
  }

  if (command === "upsert") {
    const payload = await readJsonPayload(cli.flags);

    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      fail("Provide monitor payload with --json or --file.", usage);
    }

    const monitor = await upsertMonitor(payload as MonitorInput);
    const snapshot = await getDashboardData();

    printJson({
      command,
      monitor,
      stats: snapshot.stats,
      diagnostics: snapshot.diagnostics,
      totalMonitors: snapshot.monitors.length,
    });
    return;
  }

  if (command === "delete") {
    const monitorId = typeof cli.flags.id === "string" ? cli.flags.id : null;

    if (!monitorId) {
      fail("Missing --id for delete command.", usage);
    }

    await deleteMonitor(monitorId);
    const snapshot = await getDashboardData();

    printJson({
      command,
      deletedMonitorId: monitorId,
      stats: snapshot.stats,
      totalMonitors: snapshot.monitors.length,
    });
    return;
  }

  fail(`Unsupported command: ${command}`, usage);
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});