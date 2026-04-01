import { randomUUID } from "node:crypto";

import { evaluateCandidate } from "@/lib/openrouter";
import { sendEmailNotification } from "@/lib/notifications";
import {
  appStateSchema,
  monitorInputSchema,
  type DashboardData,
  type Hotspot,
  type Monitor,
  type MonitorInput,
  type NotificationRecord,
  type RunLog,
} from "@/lib/schema";
import { fetchCandidatesForMonitor } from "@/lib/sources";
import { readAppState, writeAppState } from "@/lib/store";
import { buildMonitorQuery, sortByDateDesc } from "@/lib/utils";

function diagnostics() {
  return {
    openRouterConfigured: Boolean(process.env.OPENROUTER_API_KEY),
    twitterConfigured: Boolean(process.env.TWITTER_API_IO_KEY),
    smtpConfigured: Boolean(
      process.env.SMTP_HOST &&
        process.env.SMTP_PORT &&
        process.env.SMTP_USER &&
        process.env.SMTP_PASS &&
        process.env.SMTP_FROM,
    ),
  };
}

function isMonitorDue(monitor: Monitor, force = false) {
  if (force) {
    return true;
  }

  if (!monitor.lastCheckedAt) {
    return true;
  }

  const nextDueAt = new Date(monitor.lastCheckedAt).getTime() + monitor.intervalMinutes * 60_000;
  return Date.now() >= nextDueAt;
}

export async function getDashboardData(): Promise<DashboardData> {
  const state = await readAppState();
  const latestRun = sortByDateDesc(state.runs)[0];
  const today = Date.now() - 24 * 60 * 60 * 1000;

  return {
    ...state,
    monitors: sortByDateDesc(state.monitors),
    hotspots: sortByDateDesc(state.hotspots).slice(0, 48),
    notifications: sortByDateDesc(state.notifications).slice(0, 36),
    runs: sortByDateDesc(state.runs).slice(0, 18),
    diagnostics: diagnostics(),
    stats: {
      activeMonitors: state.monitors.filter((monitor) => monitor.enabled).length,
      hotspotsToday: state.hotspots.filter(
        (hotspot) => new Date(hotspot.discoveredAt).getTime() >= today,
      ).length,
      pendingNotifications: state.notifications.filter(
        (notification) => notification.channel === "inApp",
      ).length,
      lastRunAt: latestRun?.createdAt || null,
    },
  };
}

export async function upsertMonitor(input: MonitorInput) {
  const payload = monitorInputSchema.parse(input);
  const state = await readAppState();
  const now = new Date().toISOString();
  const nextMonitor: Monitor = {
    ...payload,
    id: payload.id || randomUUID(),
    createdAt: payload.id
      ? state.monitors.find((monitor) => monitor.id === payload.id)?.createdAt || now
      : now,
    updatedAt: now,
    lastCheckedAt: payload.id
      ? state.monitors.find((monitor) => monitor.id === payload.id)?.lastCheckedAt || null
      : null,
    lastTriggeredAt: payload.id
      ? state.monitors.find((monitor) => monitor.id === payload.id)?.lastTriggeredAt || null
      : null,
  };

  const index = state.monitors.findIndex((monitor) => monitor.id === nextMonitor.id);

  if (index >= 0) {
    state.monitors[index] = nextMonitor;
  } else {
    state.monitors.unshift(nextMonitor);
  }

  await writeAppState(appStateSchema.parse(state));
  return nextMonitor;
}

export async function deleteMonitor(monitorId: string) {
  const state = await readAppState();

  state.monitors = state.monitors.filter((monitor) => monitor.id !== monitorId);
  state.hotspots = state.hotspots.filter((hotspot) => hotspot.monitorId !== monitorId);
  state.notifications = state.notifications.filter((notification) => notification.monitorId !== monitorId);
  state.runs = state.runs.filter((run) => run.monitorId !== monitorId);

  await writeAppState(appStateSchema.parse(state));
}

function createRunLog(
  monitor: Monitor,
  status: RunLog["status"],
  detail: string,
  newHotspots: number,
  notifications: number,
): RunLog {
  return {
    id: randomUUID(),
    monitorId: monitor.id,
    monitorName: monitor.name,
    createdAt: new Date().toISOString(),
    status,
    detail,
    newHotspots,
    notifications,
  };
}

export async function runMonitoringCycle(options?: { monitorId?: string; force?: boolean }) {
  const state = await readAppState();
  const force = options?.force ?? false;
  const targetMonitors = state.monitors.filter((monitor) => {
    if (!monitor.enabled) {
      return false;
    }

    if (options?.monitorId && monitor.id !== options.monitorId) {
      return false;
    }

    return isMonitorDue(monitor, force);
  });

  if (targetMonitors.length === 0) {
    return {
      processedMonitors: 0,
      newHotspots: 0,
      notifications: 0,
    };
  }

  let totalHotspots = 0;
  let totalNotifications = 0;
  const nextRuns: RunLog[] = [];

  for (const monitor of targetMonitors) {
    try {
      const query = buildMonitorQuery(monitor);
      const candidates = await fetchCandidatesForMonitor(monitor);
      const newHotspots: Hotspot[] = [];
      const nextNotifications: NotificationRecord[] = [];

      for (const candidate of candidates.slice(0, 12)) {
        const alreadyKnown = state.hotspots.some(
          (hotspot) =>
            hotspot.monitorId === monitor.id &&
            (hotspot.externalId === candidate.externalId || hotspot.url === candidate.url),
        );

        if (alreadyKnown) {
          continue;
        }

        const ai = await evaluateCandidate(monitor, candidate);

        if (!ai.relevant && ai.heatScore < 60) {
          continue;
        }

        const hotspot: Hotspot = {
          ...candidate,
          id: randomUUID(),
          monitorId: monitor.id,
          monitorName: monitor.name,
          query,
          discoveredAt: new Date().toISOString(),
          ai,
        };

        newHotspots.push(hotspot);

        const inAppNotification: NotificationRecord = {
          id: randomUUID(),
          monitorId: monitor.id,
          hotspotId: hotspot.id,
          channel: "inApp",
          recipient: null,
          status: ai.shouldNotify ? "sent" : "skipped",
          detail: ai.shouldNotify ? "已推送到站内通知中心。" : "AI 判定为观察级，不触发强提醒。",
          createdAt: new Date().toISOString(),
        };

        nextNotifications.push(inAppNotification);

        if (ai.shouldNotify && monitor.email) {
          const emailRecord: NotificationRecord = {
            id: randomUUID(),
            monitorId: monitor.id,
            hotspotId: hotspot.id,
            channel: "email",
            recipient: monitor.email,
            status: "queued",
            detail: "等待发送邮件。",
            createdAt: new Date().toISOString(),
          };

          nextNotifications.push(await sendEmailNotification(emailRecord, monitor, hotspot));
        }
      }

      monitor.lastCheckedAt = new Date().toISOString();

      if (nextNotifications.some((notification) => notification.channel === "inApp" && notification.status === "sent")) {
        monitor.lastTriggeredAt = new Date().toISOString();
      }

      state.hotspots.unshift(...newHotspots);
      state.notifications.unshift(...nextNotifications);
      state.hotspots = sortByDateDesc(state.hotspots).slice(0, 300);
      state.notifications = sortByDateDesc(state.notifications).slice(0, 300);

      totalHotspots += newHotspots.length;
      totalNotifications += nextNotifications.filter((notification) => notification.status === "sent").length;

      nextRuns.push(
        createRunLog(
          monitor,
          newHotspots.length > 0 ? "success" : "warning",
          newHotspots.length > 0
            ? `本轮扫描到 ${newHotspots.length} 条新热点。`
            : `本轮已扫描 ${candidates.length} 条候选内容，暂无新热点。`,
          newHotspots.length,
          nextNotifications.filter((notification) => notification.status === "sent").length,
        ),
      );
    } catch (error) {
      monitor.lastCheckedAt = new Date().toISOString();
      nextRuns.push(
        createRunLog(
          monitor,
          "error",
          error instanceof Error ? error.message : "监控执行失败",
          0,
          0,
        ),
      );
    }
  }

  state.runs.unshift(...nextRuns);
  state.runs = sortByDateDesc(state.runs).slice(0, 120);

  await writeAppState(appStateSchema.parse(state));

  return {
    processedMonitors: targetMonitors.length,
    newHotspots: totalHotspots,
    notifications: totalNotifications,
  };
}