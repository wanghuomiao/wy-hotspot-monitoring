import { z } from "zod";

export const sourceSchema = z.enum([
  "webSearch",
  "googleNews",
  "hackerNews",
  "githubReleases",
  "twitter",
]);

export const monitorInputSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1, "请输入监控名称"),
  keyword: z.string().trim().default(""),
  scope: z.string().trim().min(1, "请输入热点范围"),
  description: z.string().trim().default(""),
  sources: z.array(sourceSchema).min(1, "至少选择一个信息源"),
  intervalMinutes: z.coerce.number().int().min(5).max(1440),
  email: z.string().trim().email("邮箱格式不正确").optional().or(z.literal("")),
  enabled: z.boolean().optional().default(true),
  githubRepos: z.array(z.string().trim().min(1)).default([]),
});

export const monitorSchema = monitorInputSchema.extend({
  id: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  lastCheckedAt: z.string().nullable().default(null),
  lastTriggeredAt: z.string().nullable().default(null),
});

export const rawCandidateSchema = z.object({
  source: sourceSchema,
  sourceLabel: z.string(),
  externalId: z.string(),
  title: z.string(),
  url: z.string().url(),
  excerpt: z.string().default(""),
  publishedAt: z.string().nullable().default(null),
  author: z.string().nullable().default(null),
  metrics: z
    .object({
      likes: z.number().optional(),
      comments: z.number().optional(),
      views: z.number().optional(),
      points: z.number().optional(),
      reposts: z.number().optional(),
    })
    .default({}),
});

export const aiEvaluationSchema = z.object({
  relevant: z.boolean(),
  confidence: z.number().min(0).max(100),
  heatScore: z.number().min(0).max(100),
  fakeRiskScore: z.number().min(0).max(100),
  shouldNotify: z.boolean(),
  verdict: z.enum(["confirmed", "watch", "reject"]),
  reasoning: z.string(),
  summary: z.string(),
  tags: z.array(z.string()).default([]),
  provider: z.enum(["openrouter", "heuristic"]),
});

export const hotspotSchema = rawCandidateSchema.extend({
  id: z.string(),
  monitorId: z.string(),
  monitorName: z.string(),
  query: z.string(),
  discoveredAt: z.string(),
  ai: aiEvaluationSchema,
});

export const notificationSchema = z.object({
  id: z.string(),
  monitorId: z.string(),
  hotspotId: z.string(),
  channel: z.enum(["inApp", "email"]),
  recipient: z.string().nullable().default(null),
  status: z.enum(["queued", "sent", "skipped", "failed"]),
  detail: z.string(),
  createdAt: z.string(),
});

export const runLogSchema = z.object({
  id: z.string(),
  monitorId: z.string().nullable().default(null),
  monitorName: z.string(),
  createdAt: z.string(),
  status: z.enum(["success", "warning", "error"]),
  detail: z.string(),
  newHotspots: z.number().int().nonnegative(),
  notifications: z.number().int().nonnegative(),
});

export const appStateSchema = z.object({
  monitors: z.array(monitorSchema).default([]),
  hotspots: z.array(hotspotSchema).default([]),
  notifications: z.array(notificationSchema).default([]),
  runs: z.array(runLogSchema).default([]),
});

export type SourceKind = z.infer<typeof sourceSchema>;
export type MonitorInput = z.infer<typeof monitorInputSchema>;
export type Monitor = z.infer<typeof monitorSchema>;
export type RawCandidate = z.infer<typeof rawCandidateSchema>;
export type AIEvaluation = z.infer<typeof aiEvaluationSchema>;
export type Hotspot = z.infer<typeof hotspotSchema>;
export type NotificationRecord = z.infer<typeof notificationSchema>;
export type RunLog = z.infer<typeof runLogSchema>;
export type AppState = z.infer<typeof appStateSchema>;

export type Diagnostics = {
  openRouterConfigured: boolean;
  twitterConfigured: boolean;
  smtpConfigured: boolean;
};

export type DashboardData = AppState & {
  diagnostics: Diagnostics;
  stats: {
    activeMonitors: number;
    hotspotsToday: number;
    pendingNotifications: number;
    lastRunAt: string | null;
  };
};