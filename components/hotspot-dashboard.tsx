"use client";

import {
  startTransition,
  useDeferredValue,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from "react";
import {
  AtSign,
  BellRing,
  BrainCircuit,
  ChevronRight,
  Flame,
  Globe,
  Mail,
  Radar,
  RefreshCcw,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
} from "lucide-react";

import type { DashboardData, Monitor, MonitorInput, SourceKind } from "@/lib/schema";
import { formatMonitorRepos } from "@/lib/utils";

const sourceOptions: Array<{ value: SourceKind; label: string; description: string }> = [
  { value: "webSearch", label: "网页爬搜", description: "无 API 的网页搜索抓取" },
  { value: "googleNews", label: "Google News", description: "聚合新闻 RSS" },
  { value: "hackerNews", label: "Hacker News", description: "技术热点社区" },
  { value: "githubReleases", label: "GitHub Releases", description: "AI 工具链版本更新" },
  { value: "twitter", label: "Twitter / X", description: "通过 TwitterAPI.io 获取实时内容" },
];

type FormState = {
  id?: string;
  name: string;
  keyword: string;
  scope: string;
  description: string;
  sources: SourceKind[];
  intervalMinutes: number;
  email: string;
  githubReposText: string;
  enabled: boolean;
};

const emptyForm = (): FormState => ({
  name: "",
  keyword: "",
  scope: "AI 编程",
  description: "重点关注大模型、Agent、编程工具链更新",
  sources: ["webSearch", "googleNews", "hackerNews", "githubReleases"],
  intervalMinutes: 20,
  email: "",
  githubReposText: "",
  enabled: true,
});

function relativeTime(input: string | null) {
  if (!input) {
    return "尚未执行";
  }

  const diff = new Date(input).getTime() - Date.now();
  const formatter = new Intl.RelativeTimeFormat("zh-CN", { numeric: "auto" });
  const minutes = Math.round(diff / 60_000);

  if (Math.abs(minutes) < 60) {
    return formatter.format(minutes, "minute");
  }

  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) {
    return formatter.format(hours, "hour");
  }

  return formatter.format(Math.round(hours / 24), "day");
}

function toneClass(score: number) {
  if (score >= 82) {
    return "border-[rgba(255,122,69,0.42)] bg-[rgba(255,122,69,0.14)] text-[#ffd9c9]";
  }

  if (score >= 65) {
    return "border-[rgba(255,209,102,0.35)] bg-[rgba(255,209,102,0.12)] text-[#fff0c0]";
  }

  return "border-[rgba(141,245,226,0.28)] bg-[rgba(141,245,226,0.1)] text-[#d8fff7]";
}

function toFormState(monitor: Monitor): FormState {
  return {
    id: monitor.id,
    name: monitor.name,
    keyword: monitor.keyword,
    scope: monitor.scope,
    description: monitor.description,
    sources: monitor.sources,
    intervalMinutes: monitor.intervalMinutes,
    email: monitor.email || "",
    githubReposText: monitor.githubRepos.join(", "),
    enabled: monitor.enabled,
  };
}

export function HotspotDashboard({ initialData }: { initialData: DashboardData }) {
  const [snapshot, setSnapshot] = useState(initialData);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [filterText, setFilterText] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [browserPermission, setBrowserPermission] = useState<NotificationPermission>("default");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const deferredFilterText = useDeferredValue(filterText);
  const notifiedIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    setBrowserPermission(window.Notification?.permission || "default");
    const storedIds = window.localStorage.getItem("hotspot-monitoring-browser-notified");

    if (storedIds) {
      notifiedIdsRef.current = new Set(JSON.parse(storedIds) as string[]);
    }
  }, []);

  function fireBrowserNotifications(data: DashboardData) {
    if (typeof window === "undefined" || !window.Notification || window.Notification.permission !== "granted") {
      return;
    }

    const newNotifications = data.notifications
      .filter((notification) => notification.channel === "inApp" && notification.status === "sent")
      .filter((notification) => !notifiedIdsRef.current.has(notification.id))
      .slice(0, 4);

    for (const notification of newNotifications) {
      const hotspot = data.hotspots.find((item) => item.id === notification.hotspotId);

      if (!hotspot) {
        continue;
      }

      notifiedIdsRef.current.add(notification.id);
      new window.Notification(`新热点: ${hotspot.monitorName}`, {
        body: `${hotspot.title} | ${hotspot.ai.summary}`,
      });
    }

    window.localStorage.setItem(
      "hotspot-monitoring-browser-notified",
      JSON.stringify(Array.from(notifiedIdsRef.current).slice(-40)),
    );
  }

  const refreshSnapshot = useEffectEvent(async () => {
    const response = await fetch("/api/state", { cache: "no-store" });

    if (!response.ok) {
      return;
    }

    const data = (await response.json()) as DashboardData;
    fireBrowserNotifications(data);

    startTransition(() => {
      setSnapshot(data);
    });
  });

  useEffect(() => {
    void refreshSnapshot();

    const timer = window.setInterval(() => {
      void refreshSnapshot();
    }, 30_000);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  const filteredHotspots = snapshot.hotspots.filter((hotspot) => {
    const text = `${hotspot.monitorName} ${hotspot.title} ${hotspot.ai.summary} ${hotspot.sourceLabel}`.toLowerCase();
    return text.includes(deferredFilterText.trim().toLowerCase());
  });

  async function saveMonitor() {
    setIsSaving(true);
    setErrorMessage(null);

    try {
      const payload: MonitorInput = {
        id: form.id,
        name: form.name,
        keyword: form.keyword,
        scope: form.scope,
        description: form.description,
        sources: form.sources,
        intervalMinutes: Number(form.intervalMinutes),
        email: form.email,
        githubRepos: formatMonitorRepos(form.githubReposText),
        enabled: form.enabled,
      };

      const response = await fetch("/api/monitors", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error("保存监控失败");
      }

      const data = (await response.json()) as { snapshot: DashboardData };

      startTransition(() => {
        setSnapshot(data.snapshot);
        setForm(emptyForm());
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "保存监控失败");
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteMonitorById(monitorId: string) {
    const response = await fetch(`/api/monitors?id=${monitorId}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      setErrorMessage("删除监控失败");
      return;
    }

    const data = (await response.json()) as { snapshot: DashboardData };
    startTransition(() => {
      setSnapshot(data.snapshot);
      if (form.id === monitorId) {
        setForm(emptyForm());
      }
    });
  }

  async function toggleMonitor(monitor: Monitor) {
    const response = await fetch("/api/monitors", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ...monitor,
        enabled: !monitor.enabled,
      }),
    });

    if (!response.ok) {
      setErrorMessage("切换监控状态失败");
      return;
    }

    const data = (await response.json()) as { snapshot: DashboardData };
    startTransition(() => {
      setSnapshot(data.snapshot);
    });
  }

  async function runNow() {
    setIsRunning(true);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/monitor/run", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ force: true }),
      });

      if (!response.ok) {
        throw new Error("执行扫描失败");
      }

      const data = (await response.json()) as { snapshot: DashboardData };
      fireBrowserNotifications(data.snapshot);

      startTransition(() => {
        setSnapshot(data.snapshot);
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "执行扫描失败");
    } finally {
      setIsRunning(false);
    }
  }

  async function enableBrowserNotifications() {
    if (typeof window === "undefined" || !window.Notification) {
      setErrorMessage("当前浏览器不支持通知 API");
      return;
    }

    const permission = await window.Notification.requestPermission();
    setBrowserPermission(permission);
  }

  return (
    <main className="flex-1 px-4 py-4 sm:px-6 lg:px-8 lg:py-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 lg:gap-8">
        <section className="radar-shell glass-panel scanline relative rounded-[2rem] p-6 sm:p-8 lg:p-10">
          <div className="relative z-10 grid gap-8 lg:grid-cols-[1.35fr_0.9fr]">
            <div className="space-y-6">
              <div className="flex flex-wrap items-center gap-3 text-xs text-[rgba(246,236,220,0.68)] sm:text-sm">
                <span className="section-kicker">Hotspot Mission Control</span>
                <div className="signal-dot" aria-hidden="true" />
                <span>Web 已就绪，Agent Skills 下一阶段封装</span>
              </div>

              <div className="space-y-4">
                <h1 className="headline-font max-w-4xl text-4xl leading-none sm:text-5xl lg:text-7xl">
                  把 AI 圈的真热点
                  <span className="block text-[var(--signal)]">提前抓出来</span>
                </h1>
                <p className="max-w-2xl text-base leading-7 text-[rgba(246,236,220,0.74)] sm:text-lg">
                  多信息源自动扫描，OpenRouter 负责真假判别与摘要，命中后同时写入站内提醒、浏览器通知，并可继续发送邮件。
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="glass-panel signal-glow rounded-3xl p-4">
                  <div className="mb-2 flex items-center gap-2 text-sm text-[rgba(246,236,220,0.68)]">
                    <Radar className="h-4 w-4 text-[var(--signal)]" />
                    活跃监控
                  </div>
                  <div className="headline-font text-3xl">{snapshot.stats.activeMonitors}</div>
                </div>
                <div className="glass-panel accent-glow rounded-3xl p-4">
                  <div className="mb-2 flex items-center gap-2 text-sm text-[rgba(246,236,220,0.68)]">
                    <Flame className="h-4 w-4 text-[var(--accent)]" />
                    今日热点
                  </div>
                  <div className="headline-font text-3xl">{snapshot.stats.hotspotsToday}</div>
                </div>
                <div className="glass-panel rounded-3xl p-4">
                  <div className="mb-2 flex items-center gap-2 text-sm text-[rgba(246,236,220,0.68)]">
                    <BellRing className="h-4 w-4 text-[var(--warning)]" />
                    最近执行
                  </div>
                  <div className="text-lg font-semibold">{relativeTime(snapshot.stats.lastRunAt)}</div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 text-xs text-[rgba(246,236,220,0.72)]">
                {sourceOptions.map((source) => (
                  <span
                    key={source.value}
                    className="rounded-full border border-[rgba(141,245,226,0.14)] bg-[rgba(255,255,255,0.04)] px-3 py-1.5"
                  >
                    {source.label}
                  </span>
                ))}
              </div>
            </div>

            <div className="glass-panel rounded-[1.8rem] p-5 sm:p-6">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <div className="section-kicker text-[rgba(246,236,220,0.56)]">Signal Status</div>
                  <h2 className="headline-font mt-2 text-2xl">链路健康度</h2>
                </div>
                <button
                  type="button"
                  onClick={() => void runNow()}
                  disabled={isRunning}
                  className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[rgba(255,122,69,0.28)] bg-[rgba(255,122,69,0.14)] px-4 py-2 text-sm font-semibold text-[#fff4eb] transition hover:bg-[rgba(255,122,69,0.22)] disabled:opacity-50"
                >
                  <RefreshCcw className={`h-4 w-4 ${isRunning ? "animate-spin" : ""}`} />
                  立即扫描
                </button>
              </div>

              <div className="space-y-3 text-sm">
                <div className="flex items-center justify-between rounded-2xl border border-[rgba(141,245,226,0.18)] bg-[rgba(255,255,255,0.03)] px-4 py-3">
                  <div className="flex items-center gap-3">
                    <BrainCircuit className="h-4 w-4 text-[var(--signal)]" />
                    OpenRouter AI
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs ${snapshot.diagnostics.openRouterConfigured ? "bg-[rgba(141,245,226,0.12)] text-[var(--signal)]" : "bg-[rgba(255,90,107,0.14)] text-[#ff97a3]"}`}>
                    {snapshot.diagnostics.openRouterConfigured ? "已接入" : "待配置"}
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-2xl border border-[rgba(141,245,226,0.18)] bg-[rgba(255,255,255,0.03)] px-4 py-3">
                  <div className="flex items-center gap-3">
                    <AtSign className="h-4 w-4 text-[var(--signal)]" />
                    TwitterAPI.io
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs ${snapshot.diagnostics.twitterConfigured ? "bg-[rgba(141,245,226,0.12)] text-[var(--signal)]" : "bg-[rgba(255,209,102,0.14)] text-[#ffe3a4]"}`}>
                    {snapshot.diagnostics.twitterConfigured ? "可用" : "未配置 Key"}
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-2xl border border-[rgba(141,245,226,0.18)] bg-[rgba(255,255,255,0.03)] px-4 py-3">
                  <div className="flex items-center gap-3">
                    <Mail className="h-4 w-4 text-[var(--signal)]" />
                    邮件通知
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs ${snapshot.diagnostics.smtpConfigured ? "bg-[rgba(141,245,226,0.12)] text-[var(--signal)]" : "bg-[rgba(255,209,102,0.14)] text-[#ffe3a4]"}`}>
                    {snapshot.diagnostics.smtpConfigured ? "SMTP 就绪" : "仅站内/浏览器"}
                  </span>
                </div>
              </div>

              <div className="mt-5 rounded-2xl border border-[rgba(141,245,226,0.16)] bg-[rgba(7,15,24,0.82)] p-4 text-sm text-[rgba(246,236,220,0.76)]">
                <div className="mb-3 flex items-center gap-2 font-semibold text-[var(--signal)]">
                  <ShieldCheck className="h-4 w-4" />
                  浏览器提醒
                </div>
                <p className="mb-4 leading-6">
                  当前权限：{browserPermission === "granted" ? "已允许" : browserPermission === "denied" ? "已拒绝" : "未授权"}
                </p>
                <button
                  type="button"
                  onClick={() => void enableBrowserNotifications()}
                  className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[rgba(141,245,226,0.22)] px-4 py-2 text-sm font-semibold text-[var(--signal)] transition hover:bg-[rgba(141,245,226,0.08)]"
                >
                  <BellRing className="h-4 w-4" />
                  开启浏览器通知
                </button>
              </div>
            </div>
          </div>
        </section>

        {errorMessage ? (
          <div className="rounded-3xl border border-[rgba(255,90,107,0.3)] bg-[rgba(255,90,107,0.08)] px-4 py-3 text-sm text-[#ffb8c0]">
            {errorMessage}
          </div>
        ) : null}

        <section className="grid gap-6 lg:grid-cols-[1.02fr_1.18fr]">
          <div className="glass-panel rounded-[1.8rem] p-5 sm:p-6">
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <div className="section-kicker text-[rgba(246,236,220,0.56)]">Monitor Builder</div>
                <h2 className="headline-font mt-2 text-2xl">配置你的热点雷达</h2>
              </div>
              {form.id ? (
                <button
                  type="button"
                  onClick={() => setForm(emptyForm())}
                  className="rounded-full border border-[rgba(141,245,226,0.18)] px-3 py-1.5 text-xs font-semibold text-[var(--signal)]"
                >
                  取消编辑
                </button>
              ) : null}
            </div>

            <div className="grid gap-4">
              <label className="grid gap-2 text-sm">
                <span className="text-[rgba(246,236,220,0.76)]">监控名称</span>
                <input
                  value={form.name}
                  onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                  className="min-h-12 rounded-2xl border border-[rgba(141,245,226,0.16)] bg-[rgba(255,255,255,0.03)] px-4 text-base"
                  placeholder="例如：大模型更新快报"
                />
              </label>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="grid gap-2 text-sm">
                  <span className="text-[rgba(246,236,220,0.76)]">关键词监控</span>
                  <input
                    value={form.keyword}
                    onChange={(event) => setForm((current) => ({ ...current, keyword: event.target.value }))}
                    className="min-h-12 rounded-2xl border border-[rgba(141,245,226,0.16)] bg-[rgba(255,255,255,0.03)] px-4 text-base"
                    placeholder="例如：GPT-5、Claude Code"
                  />
                </label>
                <label className="grid gap-2 text-sm">
                  <span className="text-[rgba(246,236,220,0.76)]">热点范围</span>
                  <input
                    value={form.scope}
                    onChange={(event) => setForm((current) => ({ ...current, scope: event.target.value }))}
                    className="min-h-12 rounded-2xl border border-[rgba(141,245,226,0.16)] bg-[rgba(255,255,255,0.03)] px-4 text-base"
                    placeholder="例如：AI 编程 / 大模型"
                  />
                </label>
              </div>

              <label className="grid gap-2 text-sm">
                <span className="text-[rgba(246,236,220,0.76)]">判别说明</span>
                <textarea
                  value={form.description}
                  onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                  className="min-h-28 rounded-2xl border border-[rgba(141,245,226,0.16)] bg-[rgba(255,255,255,0.03)] px-4 py-3 text-base"
                  placeholder="告诉 AI 哪类内容值得通知，哪类属于假信号"
                />
              </label>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="grid gap-2 text-sm">
                  <span className="text-[rgba(246,236,220,0.76)]">轮询间隔（分钟）</span>
                  <input
                    type="number"
                    min={5}
                    max={1440}
                    value={form.intervalMinutes}
                    onChange={(event) => setForm((current) => ({ ...current, intervalMinutes: Number(event.target.value) || 20 }))}
                    className="min-h-12 rounded-2xl border border-[rgba(141,245,226,0.16)] bg-[rgba(255,255,255,0.03)] px-4 text-base"
                  />
                </label>
                <label className="grid gap-2 text-sm">
                  <span className="text-[rgba(246,236,220,0.76)]">命中邮件通知</span>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                    className="min-h-12 rounded-2xl border border-[rgba(141,245,226,0.16)] bg-[rgba(255,255,255,0.03)] px-4 text-base"
                    placeholder="you@example.com"
                  />
                </label>
              </div>

              <label className="grid gap-2 text-sm">
                <span className="text-[rgba(246,236,220,0.76)]">可选 GitHub 仓库白名单</span>
                <textarea
                  value={form.githubReposText}
                  onChange={(event) => setForm((current) => ({ ...current, githubReposText: event.target.value }))}
                  className="min-h-24 rounded-2xl border border-[rgba(141,245,226,0.16)] bg-[rgba(255,255,255,0.03)] px-4 py-3 text-base"
                  placeholder="openai/openai-node, anthropics/anthropic-sdk-typescript"
                />
              </label>

              <fieldset className="grid gap-3 text-sm">
                <legend className="mb-1 text-[rgba(246,236,220,0.76)]">信息源</legend>
                <div className="grid gap-3 md:grid-cols-2">
                  {sourceOptions.map((source) => {
                    const active = form.sources.includes(source.value);
                    return (
                      <button
                        key={source.value}
                        type="button"
                        onClick={() =>
                          setForm((current) => ({
                            ...current,
                            sources: active
                              ? current.sources.filter((item) => item !== source.value)
                              : [...current.sources, source.value],
                          }))
                        }
                        className={`min-h-16 rounded-2xl border px-4 py-3 text-left transition ${
                          active
                            ? "border-[rgba(141,245,226,0.3)] bg-[rgba(141,245,226,0.08)]"
                            : "border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)]"
                        }`}
                      >
                        <div className="font-semibold">{source.label}</div>
                        <div className="mt-1 text-xs text-[rgba(246,236,220,0.62)]">{source.description}</div>
                      </button>
                    );
                  })}
                </div>
              </fieldset>

              <button
                type="button"
                onClick={() => void saveMonitor()}
                disabled={isSaving}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-[var(--signal)] px-5 py-3 text-sm font-semibold text-[#06222d] transition hover:brightness-110 disabled:opacity-50"
              >
                <Sparkles className="h-4 w-4" />
                {isSaving ? "保存中..." : form.id ? "更新监控" : "创建监控"}
              </button>
            </div>
          </div>

          <div className="glass-panel rounded-[1.8rem] p-5 sm:p-6">
            <div className="mb-6 flex items-center justify-between gap-3">
              <div>
                <div className="section-kicker text-[rgba(246,236,220,0.56)]">Live Deck</div>
                <h2 className="headline-font mt-2 text-2xl">监控编队</h2>
              </div>
              <div className="rounded-full border border-[rgba(141,245,226,0.18)] px-3 py-1.5 text-xs text-[rgba(246,236,220,0.7)]">
                {snapshot.monitors.length} 个监控
              </div>
            </div>

            <div className="space-y-4">
              {snapshot.monitors.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-[rgba(141,245,226,0.2)] px-5 py-10 text-center text-sm text-[rgba(246,236,220,0.62)]">
                  先创建一个监控。推荐从“关键词 = GPT-5，范围 = AI 编程”开始。
                </div>
              ) : null}

              {snapshot.monitors.map((monitor) => (
                <article
                  key={monitor.id}
                  className="rounded-[1.6rem] border border-[rgba(141,245,226,0.14)] bg-[rgba(255,255,255,0.03)] p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="headline-font text-xl">{monitor.name}</h3>
                        <span className={`rounded-full px-2 py-1 text-[11px] ${monitor.enabled ? "bg-[rgba(141,245,226,0.12)] text-[var(--signal)]" : "bg-[rgba(255,90,107,0.12)] text-[#ff98a4]"}`}>
                          {monitor.enabled ? "运行中" : "已暂停"}
                        </span>
                      </div>
                      <p className="mt-2 text-sm leading-6 text-[rgba(246,236,220,0.68)]">
                        关键词：{monitor.keyword || "未限制"} · 范围：{monitor.scope}
                      </p>
                    </div>
                    <div className="mono-font text-xs text-[rgba(246,236,220,0.48)]">
                      上次触发 {relativeTime(monitor.lastTriggeredAt)}
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2 text-xs text-[rgba(246,236,220,0.7)]">
                    {monitor.sources.map((source) => (
                      <span
                        key={source}
                        className="rounded-full border border-[rgba(141,245,226,0.14)] px-2.5 py-1"
                      >
                        {sourceOptions.find((option) => option.value === source)?.label || source}
                      </span>
                    ))}
                    <span className="rounded-full border border-[rgba(255,122,69,0.2)] px-2.5 py-1 text-[#ffd8c6]">
                      {monitor.intervalMinutes} 分钟/轮
                    </span>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setForm(toFormState(monitor))}
                      className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[rgba(141,245,226,0.18)] px-4 py-2 text-sm font-semibold text-[var(--signal)]"
                    >
                      <ChevronRight className="h-4 w-4" />
                      载入编辑
                    </button>
                    <button
                      type="button"
                      onClick={() => void toggleMonitor(monitor)}
                      className="inline-flex min-h-11 items-center rounded-full border border-[rgba(255,255,255,0.12)] px-4 py-2 text-sm font-semibold text-[rgba(246,236,220,0.8)]"
                    >
                      {monitor.enabled ? "暂停监控" : "恢复监控"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void deleteMonitorById(monitor.id)}
                      className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[rgba(255,90,107,0.2)] px-4 py-2 text-sm font-semibold text-[#ff98a4]"
                    >
                      <Trash2 className="h-4 w-4" />
                      删除
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.28fr_0.72fr]">
          <div className="glass-panel rounded-[1.8rem] p-5 sm:p-6">
            <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <div className="section-kicker text-[rgba(246,236,220,0.56)]">Hotspot River</div>
                <h2 className="headline-font mt-2 text-2xl">热点流</h2>
              </div>
              <label className="flex min-h-12 items-center gap-3 rounded-full border border-[rgba(141,245,226,0.16)] bg-[rgba(255,255,255,0.03)] px-4 py-2 text-sm text-[rgba(246,236,220,0.72)] sm:min-w-72">
                <Search className="h-4 w-4 text-[var(--signal)]" />
                <input
                  value={filterText}
                  onChange={(event) => setFilterText(event.target.value)}
                  className="w-full bg-transparent outline-none"
                  placeholder="筛选关键词、摘要、来源"
                />
              </label>
            </div>

            <div className="grid gap-4">
              {filteredHotspots.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-[rgba(141,245,226,0.2)] px-5 py-10 text-center text-sm text-[rgba(246,236,220,0.62)]">
                  还没有新热点。可以先点一次“立即扫描”，或者补充 OpenRouter / TwitterAPI.io 配置。
                </div>
              ) : null}

              {filteredHotspots.map((hotspot) => (
                <article
                  key={hotspot.id}
                  className="rounded-[1.6rem] border border-[rgba(141,245,226,0.14)] bg-[rgba(255,255,255,0.03)] p-4 sm:p-5"
                >
                  <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-[rgba(246,236,220,0.62)]">
                        <span className="rounded-full border border-[rgba(141,245,226,0.16)] px-2.5 py-1">{hotspot.monitorName}</span>
                        <span className="rounded-full border border-[rgba(255,255,255,0.08)] px-2.5 py-1">{hotspot.sourceLabel}</span>
                        <span className={`rounded-full border px-2.5 py-1 ${toneClass(hotspot.ai.heatScore)}`}>
                          热度 {hotspot.ai.heatScore}
                        </span>
                      </div>
                      <h3 className="headline-font text-2xl leading-tight">{hotspot.title}</h3>
                    </div>
                    <div className="mono-font text-xs text-[rgba(246,236,220,0.5)]">
                      {relativeTime(hotspot.discoveredAt)}
                    </div>
                  </div>

                  <p className="text-sm leading-7 text-[rgba(246,236,220,0.74)]">{hotspot.ai.summary}</p>

                  <div className="mt-4 grid gap-3 md:grid-cols-3">
                    <div className="rounded-2xl border border-[rgba(141,245,226,0.14)] bg-[rgba(7,15,24,0.85)] px-4 py-3">
                      <div className="text-xs text-[rgba(246,236,220,0.56)]">可信度</div>
                      <div className="mt-1 headline-font text-2xl text-[var(--signal)]">{hotspot.ai.confidence}</div>
                    </div>
                    <div className="rounded-2xl border border-[rgba(255,122,69,0.16)] bg-[rgba(7,15,24,0.85)] px-4 py-3">
                      <div className="text-xs text-[rgba(246,236,220,0.56)]">风险分</div>
                      <div className="mt-1 headline-font text-2xl text-[#ffb39a]">{hotspot.ai.fakeRiskScore}</div>
                    </div>
                    <div className="rounded-2xl border border-[rgba(255,209,102,0.14)] bg-[rgba(7,15,24,0.85)] px-4 py-3">
                      <div className="text-xs text-[rgba(246,236,220,0.56)]">判定</div>
                      <div className="mt-1 headline-font text-2xl text-[#ffe49c]">{hotspot.ai.verdict}</div>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap gap-2 text-xs text-[rgba(246,236,220,0.7)]">
                      {hotspot.ai.tags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full border border-[rgba(141,245,226,0.14)] px-2.5 py-1"
                        >
                          #{tag}
                        </span>
                      ))}
                    </div>
                    <a
                      href={hotspot.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[rgba(141,245,226,0.2)] px-4 py-2 text-sm font-semibold text-[var(--signal)] transition hover:bg-[rgba(141,245,226,0.08)]"
                    >
                      <Globe className="h-4 w-4" />
                      查看原文
                    </a>
                  </div>
                </article>
              ))}
            </div>
          </div>

          <div className="space-y-6">
            <div className="glass-panel rounded-[1.8rem] p-5 sm:p-6">
              <div className="mb-5">
                <div className="section-kicker text-[rgba(246,236,220,0.56)]">Alert Queue</div>
                <h2 className="headline-font mt-2 text-2xl">通知记录</h2>
              </div>
              <div className="space-y-3">
                {snapshot.notifications.length === 0 ? (
                  <div className="rounded-3xl border border-dashed border-[rgba(141,245,226,0.2)] px-5 py-10 text-center text-sm text-[rgba(246,236,220,0.62)]">
                    还没有通知。
                  </div>
                ) : null}

                {snapshot.notifications.map((notification) => {
                  const hotspot = snapshot.hotspots.find((item) => item.id === notification.hotspotId);
                  return (
                    <div
                      key={notification.id}
                      className="rounded-[1.4rem] border border-[rgba(141,245,226,0.14)] bg-[rgba(255,255,255,0.03)] p-4"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-semibold">
                          {notification.channel === "email" ? "邮件通知" : "站内通知"}
                        </div>
                        <span className={`rounded-full px-2.5 py-1 text-[11px] ${notification.status === "sent" ? "bg-[rgba(141,245,226,0.12)] text-[var(--signal)]" : notification.status === "failed" ? "bg-[rgba(255,90,107,0.12)] text-[#ff98a4]" : "bg-[rgba(255,209,102,0.14)] text-[#ffe3a4]"}`}>
                          {notification.status}
                        </span>
                      </div>
                      <div className="mt-2 text-sm leading-6 text-[rgba(246,236,220,0.72)]">
                        {hotspot?.title || notification.detail}
                      </div>
                      <div className="mt-3 text-xs text-[rgba(246,236,220,0.5)]">
                        {notification.detail} · {relativeTime(notification.createdAt)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="glass-panel rounded-[1.8rem] p-5 sm:p-6">
              <div className="mb-5">
                <div className="section-kicker text-[rgba(246,236,220,0.56)]">Run Ledger</div>
                <h2 className="headline-font mt-2 text-2xl">执行日志</h2>
              </div>
              <div className="space-y-3">
                {snapshot.runs.length === 0 ? (
                  <div className="rounded-3xl border border-dashed border-[rgba(141,245,226,0.2)] px-5 py-10 text-center text-sm text-[rgba(246,236,220,0.62)]">
                    等待第一次扫描。
                  </div>
                ) : null}
                {snapshot.runs.map((run) => (
                  <div
                    key={run.id}
                    className="rounded-[1.4rem] border border-[rgba(141,245,226,0.14)] bg-[rgba(255,255,255,0.03)] p-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-semibold">{run.monitorName}</div>
                      <span className={`rounded-full px-2.5 py-1 text-[11px] ${run.status === "success" ? "bg-[rgba(141,245,226,0.12)] text-[var(--signal)]" : run.status === "warning" ? "bg-[rgba(255,209,102,0.14)] text-[#ffe3a4]" : "bg-[rgba(255,90,107,0.12)] text-[#ff98a4]"}`}>
                        {run.status}
                      </span>
                    </div>
                    <div className="mt-2 text-sm leading-6 text-[rgba(246,236,220,0.72)]">{run.detail}</div>
                    <div className="mt-3 text-xs text-[rgba(246,236,220,0.5)]">
                      新热点 {run.newHotspots} · 已发送通知 {run.notifications} · {relativeTime(run.createdAt)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}