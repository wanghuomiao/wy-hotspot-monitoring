import type { Monitor, RawCandidate } from "@/lib/schema";

const TOKEN_SPLIT = /[^\p{L}\p{N}]+/u;

export function buildMonitorQuery(monitor: Pick<Monitor, "keyword" | "scope" | "description">) {
  return [monitor.keyword, monitor.scope, monitor.description]
    .map((value) => value.trim())
    .filter(Boolean)
    .join(" ");
}

export function tokenizeQuery(input: string) {
  return input
    .toLowerCase()
    .split(TOKEN_SPLIT)
    .map((token) => token.trim())
    .filter((token) => token.length > 1);
}

export function matchesMonitorQuery(monitor: Pick<Monitor, "keyword" | "scope" | "description">, text: string) {
  const haystack = text.toLowerCase();
  const tokens = tokenizeQuery(buildMonitorQuery(monitor));

  if (tokens.length === 0) {
    return false;
  }

  return tokens.some((token) => haystack.includes(token));
}

export function normalizeTitle(title: string) {
  return title
    .trim()
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ");
}

export function dedupeCandidates(candidates: RawCandidate[]) {
  const seen = new Set<string>();

  return candidates.filter((candidate) => {
    const key = [candidate.source, candidate.externalId, normalizeTitle(candidate.title)].join("::");

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

export function truncateText(input: string, maxLength: number) {
  if (input.length <= maxLength) {
    return input;
  }

  return `${input.slice(0, maxLength - 1).trimEnd()}…`;
}

export function stripHtml(input: string) {
  return input.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export function scoreCandidateMetrics(candidate: RawCandidate) {
  const likes = candidate.metrics.likes ?? 0;
  const comments = candidate.metrics.comments ?? 0;
  const views = candidate.metrics.views ?? 0;
  const points = candidate.metrics.points ?? 0;
  const reposts = candidate.metrics.reposts ?? 0;
  const blended = likes * 1.4 + comments * 2 + reposts * 1.6 + points * 1.2 + views * 0.02;

  return Math.max(15, Math.min(95, Math.round(Math.log10(blended + 10) * 28)));
}

export function sortByDateDesc<T extends { createdAt?: string | null; publishedAt?: string | null; discoveredAt?: string | null }>(
  items: T[],
) {
  return [...items].sort((left, right) => {
    const leftValue = new Date(left.discoveredAt ?? left.createdAt ?? left.publishedAt ?? 0).getTime();
    const rightValue = new Date(right.discoveredAt ?? right.createdAt ?? right.publishedAt ?? 0).getTime();
    return rightValue - leftValue;
  });
}

export function formatMonitorRepos(input: string) {
  return input
    .split(/[\n,]/)
    .map((value) => value.trim())
    .filter(Boolean);
}