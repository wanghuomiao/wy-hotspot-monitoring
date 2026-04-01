import { z } from "zod";

import type { AIEvaluation, Monitor, RawCandidate } from "@/lib/schema";
import { matchesMonitorQuery, scoreCandidateMetrics, truncateText } from "@/lib/utils";

const parsedEvaluationSchema = z.object({
  relevant: z.boolean(),
  confidence: z.number().min(0).max(100),
  heatScore: z.number().min(0).max(100),
  fakeRiskScore: z.number().min(0).max(100),
  shouldNotify: z.boolean(),
  verdict: z.enum(["confirmed", "watch", "reject"]),
  reasoning: z.string(),
  summary: z.string(),
  tags: z.array(z.string()).default([]),
});

function heuristicEvaluation(monitor: Monitor, candidate: RawCandidate): AIEvaluation {
  const text = `${candidate.title}\n${candidate.excerpt}`;
  const matches = matchesMonitorQuery(monitor, text);
  const heatScore = scoreCandidateMetrics(candidate);
  const sourceBoost = candidate.source === "twitter" ? 8 : candidate.source === "githubReleases" ? 10 : 0;
  const confidence = Math.min(96, Math.max(35, heatScore + (matches ? 18 : -10) + sourceBoost));
  const fakeRiskScore = candidate.url.includes("github.com")
    ? 8
    : candidate.url.includes("news.google.com")
      ? 18
      : candidate.source === "webSearch"
        ? 35
        : 24;
  const shouldNotify = matches && confidence >= 68 && fakeRiskScore <= 40;

  return {
    relevant: matches || heatScore >= 62,
    confidence,
    heatScore,
    fakeRiskScore,
    shouldNotify,
    verdict: shouldNotify ? "confirmed" : matches ? "watch" : "reject",
    reasoning: matches
      ? "未配置 OpenRouter，已按关键词匹配和来源可信度进行启发式判断。"
      : "未配置 OpenRouter，当前结果与监控条件的直接匹配较弱。",
    summary: truncateText(candidate.excerpt || candidate.title, 120),
    tags: [candidate.sourceLabel, matches ? "keyword-match" : "trend-signal"],
    provider: "heuristic",
  };
}

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

export async function evaluateCandidate(monitor: Monitor, candidate: RawCandidate): Promise<AIEvaluation> {
  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    return heuristicEvaluation(monitor, candidate);
  }

  const model = process.env.OPENROUTER_MODEL || "openai/gpt-4.1-mini";
  const siteUrl = process.env.OPENROUTER_SITE_URL || "http://localhost:3000";

  const prompt = [
    "你是 AI 热点监控系统的审查器。",
    "你的任务是判断一个候选内容是否：",
    "1. 与监控对象强相关；",
    "2. 不是标题党、假冒、误导性转述；",
    "3. 具备通知价值。",
    "请只返回 JSON。字段包括：relevant, confidence, heatScore, fakeRiskScore, shouldNotify, verdict, reasoning, summary, tags。",
    "评分规则：0-100。confidence 越高表示越确定；heatScore 越高表示越值得关注；fakeRiskScore 越高表示越可能是假消息或低可信转载。",
    "verdict 只能是 confirmed, watch, reject。",
    `监控名称: ${monitor.name}`,
    `监控关键词: ${monitor.keyword || "无"}`,
    `监控范围: ${monitor.scope}`,
    `补充说明: ${monitor.description || "无"}`,
    `来源: ${candidate.sourceLabel}`,
    `标题: ${candidate.title}`,
    `摘要: ${candidate.excerpt || "无"}`,
    `链接: ${candidate.url}`,
    `发布时间: ${candidate.publishedAt || "未知"}`,
    `作者: ${candidate.author || "未知"}`,
    `互动数据: ${JSON.stringify(candidate.metrics)}`,
  ].join("\n");

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": siteUrl,
      "X-Title": "Hotspot Monitoring Radar",
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content: "You are a strict JSON generator for hotspot triage.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
    }),
  });

  if (!response.ok) {
    return heuristicEvaluation(monitor, candidate);
  }

  const payload = (await response.json()) as {
    choices?: Array<{
      message?: {
        content?: string | Array<{ type?: string; text?: string }>;
      };
    }>;
  };

  const rawContent = payload.choices?.[0]?.message?.content;
  const content = Array.isArray(rawContent)
    ? rawContent.map((part) => part.text || "").join("\n")
    : rawContent || "";

  try {
    const parsed = JSON.parse(extractJsonObject(content)) as unknown;
    const evaluation = parsedEvaluationSchema.parse(parsed);

    return {
      ...evaluation,
      summary: truncateText(evaluation.summary, 180),
      provider: "openrouter",
    };
  } catch {
    return heuristicEvaluation(monitor, candidate);
  }
}