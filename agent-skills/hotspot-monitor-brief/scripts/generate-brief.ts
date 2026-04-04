import { loadEnvConfig } from "@next/env";
import { z } from "zod";

import { getDashboardData } from "../../../lib/monitor";
import type { DashboardData, Hotspot } from "../../../lib/schema";
import { truncateText } from "../../../lib/utils";
import {
  ensureWorkspaceRoot,
  getBooleanFlag,
  getNumberFlag,
  parseCliArgs,
  printJson,
} from "../../../agent-skills/shared/cli";

const usage = [
  "Usage:",
  "  npx tsx agent-skills/hotspot-monitor-brief/scripts/generate-brief.ts",
  "  npx tsx agent-skills/hotspot-monitor-brief/scripts/generate-brief.ts --monitor-id <monitor-id>",
  "  npx tsx agent-skills/hotspot-monitor-brief/scripts/generate-brief.ts --hours 12 --limit 5",
  "  npx tsx agent-skills/hotspot-monitor-brief/scripts/generate-brief.ts --format json --use-ai false",
].join("\n");

const aiBriefSchema = z.object({
  title: z.string(),
  executiveSummary: z.string(),
  highlights: z.array(z.string()).default([]),
  risks: z.array(z.string()).default([]),
  recommendations: z.array(z.string()).default([]),
});

function extractJsonObject(input: string) {
  const fenced = input.match(/```json\s*([\s\S]*?)```/i);

  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  const firstBrace = input.indexOf("{");
  const lastBrace = input.lastIndexOf("}");

  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return input.slice(firstBrace, lastBrace + 1);
  }

  return input.trim();
}

function formatHotspotLine(hotspot: Hotspot) {
  return `- [${hotspot.sourceLabel}] ${hotspot.title} | verdict=${hotspot.ai.verdict} | heat=${hotspot.ai.heatScore} | confidence=${hotspot.ai.confidence}`;
}

function selectHotspots(snapshot: DashboardData, monitorId: string | undefined, hours: number, limit: number) {
  const cutoff = Date.now() - hours * 60 * 60 * 1000;

  return snapshot.hotspots
    .filter((hotspot) => !monitorId || hotspot.monitorId === monitorId)
    .filter((hotspot) => new Date(hotspot.discoveredAt).getTime() >= cutoff)
    .slice(0, limit);
}

function buildFallbackBrief(snapshot: DashboardData, hotspots: Hotspot[], hours: number, monitorId?: string) {
  const targetMonitor = monitorId
    ? snapshot.monitors.find((monitor) => monitor.id === monitorId)?.name || monitorId
    : "全局热点";
  const confirmed = hotspots.filter((hotspot) => hotspot.ai.verdict === "confirmed");
  const watch = hotspots.filter((hotspot) => hotspot.ai.verdict === "watch");
  const sourceCounts = hotspots.reduce<Record<string, number>>((accumulator, hotspot) => {
    accumulator[hotspot.sourceLabel] = (accumulator[hotspot.sourceLabel] || 0) + 1;
    return accumulator;
  }, {});
  const highlights = hotspots.slice(0, 5).map((hotspot) => `${hotspot.title}：${truncateText(hotspot.ai.summary, 72)}`);
  const risks = hotspots
    .filter((hotspot) => hotspot.ai.fakeRiskScore >= 45)
    .slice(0, 3)
    .map((hotspot) => `${hotspot.title} 的风险分为 ${hotspot.ai.fakeRiskScore}`);
  const recommendations = [
    confirmed.length > 0 ? "优先处理已判定为 confirmed 的信号。" : "当前没有 confirmed 级信号，先观察趋势变化。",
    watch.length > 0 ? "对 watch 级信号补充来源交叉验证。" : "暂无 watch 级信号堆积。",
    Object.keys(sourceCounts).length > 1 ? "不同来源都出现信号，适合继续追踪放大。" : "来源还不够分散，建议补跑更多来源进行交叉验证。",
  ];

  const markdown = [
    `# ${targetMonitor} 热点简报`,
    "",
    "## 概览",
    `${hours} 小时内共筛出 ${hotspots.length} 条热点，其中 confirmed ${confirmed.length} 条，watch ${watch.length} 条。`,
    "",
    "## 重点信号",
    ...(hotspots.length > 0 ? hotspots.slice(0, 6).map(formatHotspotLine) : ["- 当前时间窗口内没有热点。"]),
    "",
    "## 风险提示",
    ...(risks.length > 0 ? risks.map((risk) => `- ${risk}`) : ["- 未发现明显高风险热点。"]),
    "",
    "## 建议动作",
    ...recommendations.map((item) => `- ${item}`),
  ].join("\n");

  return {
    mode: "fallback" as const,
    title: `${targetMonitor} 热点简报`,
    executiveSummary: `${hours} 小时内共筛出 ${hotspots.length} 条热点，来源分布为 ${Object.entries(sourceCounts)
      .map(([source, count]) => `${source} ${count} 条`)
      .join("、") || "暂无数据"}。`,
    highlights,
    risks,
    recommendations,
    markdown,
  };
}

async function buildAiBrief(snapshot: DashboardData, hotspots: Hotspot[], hours: number, monitorId?: string) {
  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!apiKey || hotspots.length === 0) {
    return null;
  }

  const targetMonitor = monitorId
    ? snapshot.monitors.find((monitor) => monitor.id === monitorId)?.name || monitorId
    : "全局热点";
  const model = process.env.OPENROUTER_MODEL || "openai/gpt-4.1-mini";
  const siteUrl = process.env.OPENROUTER_SITE_URL || "http://localhost:3000";
  const compactHotspots = hotspots.map((hotspot) => ({
    title: hotspot.title,
    source: hotspot.sourceLabel,
    discoveredAt: hotspot.discoveredAt,
    summary: hotspot.ai.summary,
    verdict: hotspot.ai.verdict,
    heatScore: hotspot.ai.heatScore,
    confidence: hotspot.ai.confidence,
    fakeRiskScore: hotspot.ai.fakeRiskScore,
    url: hotspot.url,
  }));
  const prompt = [
    "你是 AI 热点监控工具的简报编辑。",
    "请基于提供的热点结果生成一份中文 JSON 简报。",
    "仅返回 JSON，字段必须是：title, executiveSummary, highlights, risks, recommendations。",
    "要求：",
    "1. executiveSummary 控制在 120 字内；",
    "2. highlights 给出 3-5 条具体信号；",
    "3. risks 只保留真正需要警惕的点；",
    "4. recommendations 给出 2-4 条行动建议；",
    `监控对象: ${targetMonitor}`,
    `时间窗口: 最近 ${hours} 小时`,
    `热点数据: ${JSON.stringify(compactHotspots)}`,
  ].join("\n");

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": siteUrl,
      "X-Title": "Hotspot Monitoring Radar Skills",
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content: "You are a strict JSON generator for hotspot briefings.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
    }),
  });

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as {
    choices?: Array<{
      message?: {
        content?: string | Array<{ text?: string }>;
      };
    }>;
  };
  const rawContent = payload.choices?.[0]?.message?.content;
  const content = Array.isArray(rawContent)
    ? rawContent.map((part) => part.text || "").join("\n")
    : rawContent || "";

  try {
    const parsed = aiBriefSchema.parse(JSON.parse(extractJsonObject(content)) as unknown);
    const markdown = [
      `# ${parsed.title}`,
      "",
      "## 概览",
      parsed.executiveSummary,
      "",
      "## 重点信号",
      ...parsed.highlights.map((item) => `- ${item}`),
      "",
      "## 风险提示",
      ...(parsed.risks.length > 0 ? parsed.risks.map((item) => `- ${item}`) : ["- 未发现明显高风险热点。"]),
      "",
      "## 建议动作",
      ...parsed.recommendations.map((item) => `- ${item}`),
    ].join("\n");

    return {
      mode: "ai" as const,
      ...parsed,
      markdown,
    };
  } catch {
    return null;
  }
}

async function main() {
  const workspaceRoot = ensureWorkspaceRoot();
  loadEnvConfig(workspaceRoot);

  const cli = parseCliArgs(process.argv.slice(2));
  const command = cli.command;

  if (command && command !== "brief") {
    console.error(`Unsupported command: ${command}`);
    console.error(usage);
    process.exit(1);
  }

  const monitorId = typeof cli.flags["monitor-id"] === "string" ? cli.flags["monitor-id"] : undefined;
  const hours = getNumberFlag(cli.flags, "hours") ?? 24;
  const limit = getNumberFlag(cli.flags, "limit") ?? 8;
  const useAi = getBooleanFlag(cli.flags, "use-ai") ?? true;
  const format = typeof cli.flags.format === "string" ? cli.flags.format : "markdown";
  const snapshot = await getDashboardData();
  const hotspots = selectHotspots(snapshot, monitorId, hours, limit);
  const aiBrief = useAi ? await buildAiBrief(snapshot, hotspots, hours, monitorId) : null;
  const brief = aiBrief || buildFallbackBrief(snapshot, hotspots, hours, monitorId);
  const payload = {
    generatedAt: new Date().toISOString(),
    monitorId: monitorId || null,
    hours,
    limit,
    diagnostics: snapshot.diagnostics,
    hotspotCount: hotspots.length,
    topHotspots: hotspots.map((hotspot) => ({
      title: hotspot.title,
      sourceLabel: hotspot.sourceLabel,
      verdict: hotspot.ai.verdict,
      heatScore: hotspot.ai.heatScore,
      fakeRiskScore: hotspot.ai.fakeRiskScore,
      summary: hotspot.ai.summary,
      url: hotspot.url,
    })),
    brief,
  };

  if (format === "json") {
    printJson(payload);
    return;
  }

  console.log(brief.markdown);
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  console.error(usage);
  process.exit(1);
});